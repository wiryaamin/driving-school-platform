/**
 * fortnox — Fortnox sync queue, state management, and OAuth 2.0 flow.
 *
 * OAuth routes:
 *   GET    /fortnox/oauth/status       — connection status + token expiry
 *   GET    /fortnox/oauth/start        — generate auth URL (PKCE)
 *   POST   /fortnox/oauth/callback     — exchange code for tokens + store
 *   POST   /fortnox/oauth/refresh      — refresh access token
 *   DELETE /fortnox/oauth/disconnect   — clear stored credentials
 *
 * Sync routes:
 *   POST /fortnox/queue                  — queue an entity for Fortnox sync
 *   GET  /fortnox/customers              — list pending customer sync records
 *   GET  /fortnox/customers/:studentId   — get customer sync state
 *   GET  /fortnox/invoices               — list pending invoice sync records
 *   GET  /fortnox/invoices/:invoiceId    — get invoice sync state
 *   GET  /fortnox/payments/:paymentId    — get payment sync state
 *   GET  /fortnox/lineage                — list export lineage records
 *   GET  /fortnox/lineage/:runId         — get export lineage for a run
 *
 * Secrets required (supabase secrets set):
 *   FORTNOX_CLIENT_ID     — Fortnox app client ID
 *   FORTNOX_CLIENT_SECRET — Fortnox app client secret
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse } from '../_shared/errors.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const FORTNOX_AUTH_URL  = 'https://apps.fortnox.se/oauth-v1/auth';
const FORTNOX_TOKEN_URL = 'https://apps.fortnox.se/oauth-v1/token';
const FORTNOX_SCOPE     = 'companyinformation invoices customers';
const ADMIN_ROLES       = new Set(['admin', 'manager', 'owner']);
const UUID_RE           = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JSON_CT           = { 'Content-Type': 'application/json' };

// ─── Response helpers ─────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code: string): Response {
  return buildErrorResponse(ctx, status, code, message);
}

// ─── Path parser ──────────────────────────────────────────────────────────────

function parsePath(req: Request): { resource: string | null; sub: string | null; entityId: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'fortnox');
  const seg1     = segments[fnIdx + 1] ?? null;
  const seg2     = segments[fnIdx + 2] ?? null;
  return {
    resource: seg1,
    sub:      seg1 === 'oauth' ? seg2 : null,
    entityId: seg1 !== 'oauth' && seg2 && UUID_RE.test(seg2) ? seg2 : null,
  };
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function genCodeVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return b64url(arr);
}

async function genCodeChallenge(verifier: string): Promise<string> {
  const enc  = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return b64url(hash);
}

// ─── Fortnox token exchange ───────────────────────────────────────────────────

interface FortnoxTokenResponse {
  access_token:  string;
  refresh_token?: string;
  expires_in:    number;
  token_type:    string;
  scope?:        string;
}

interface FortnoxErrorResponse {
  error?:             string;
  error_description?: string;
}

async function fortnoxTokenRequest(
  clientId:     string,
  clientSecret: string,
  params:       Record<string, string>,
): Promise<FortnoxTokenResponse> {
  const form = new URLSearchParams(params);
  const res  = await fetch(FORTNOX_TOKEN_URL, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as object) as FortnoxErrorResponse;
    throw new Error(body.error_description ?? body.error ?? `Fortnox token error ${res.status}`);
  }
  return res.json() as Promise<FortnoxTokenResponse>;
}

// ─── Org settings helpers ─────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function getOrgSettings(supabase: any, orgId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
  return (data?.settings as Record<string, unknown>) ?? {};
}

// deno-lint-ignore no-explicit-any
async function updateOrgSettings(supabase: any, orgId: string, patch: Record<string, unknown>): Promise<void> {
  const existing = await getOrgSettings(supabase, orgId);
  const { error } = await supabase
    .from('organizations')
    .update({ settings: { ...existing, ...patch } })
    .eq('id', orgId);
  if (error) throw error;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  const orgId  = ctx.organizationId;
  const userId = ctx.actorId;
  if (!orgId || !userId) return err(ctx, 'Unauthorized — missing organization context', 401, 'UNAUTHORIZED');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  if (!await hasFortnoxPermission(supabase, orgId, userId)) {
    return err(ctx, 'Forbidden — requires finance:fortnox:manage permission', 403, 'FORBIDDEN');
  }

  const { method }                  = req;
  const { resource, sub, entityId } = parsePath(req);
  const sp                          = new URL(req.url).searchParams;

  try {

    // ══════════════════════════════════════════════════════════════════════════
    // OAUTH ROUTES
    // ══════════════════════════════════════════════════════════════════════════

    if (resource === 'oauth') {

      // GET /fortnox/oauth/status
      if (sub === 'status' && method === 'GET') {
        const clientId = Deno.env.get('FORTNOX_CLIENT_ID');
        const settings = await getOrgSettings(supabase, orgId);
        const oauth    = settings['fortnox_oauth'] as Record<string, string> | undefined;
        const legacy   = typeof settings['fortnox_access_token'] === 'string'
          ? settings['fortnox_access_token'] as string : '';

        if (oauth?.['access_token']) {
          const expiry      = oauth['token_expiry'] ? new Date(oauth['token_expiry']) : null;
          const needsRefresh = expiry ? expiry < new Date(Date.now() + 5 * 60_000) : false;
          return json({
            configured:   !!clientId,
            connected:    true,
            method:       'oauth',
            scope:        oauth['scope'] ?? null,
            connected_at: oauth['connected_at'] ?? null,
            token_expiry: oauth['token_expiry'] ?? null,
            needs_refresh: needsRefresh,
          });
        }
        if (legacy) {
          return json({ configured: !!clientId, connected: true, method: 'api_token', scope: null, connected_at: null, token_expiry: null, needs_refresh: false });
        }
        return json({ configured: !!clientId, connected: false });
      }

      // GET /fortnox/oauth/start?redirect_uri=...
      if (sub === 'start' && method === 'GET') {
        const clientId = Deno.env.get('FORTNOX_CLIENT_ID');
        if (!clientId) return err(ctx, 'Fortnox-integration ej konfigurerad — saknar FORTNOX_CLIENT_ID', 503, 'NOT_CONFIGURED');

        const redirectUri = sp.get('redirect_uri');
        if (!redirectUri) return err(ctx, 'redirect_uri är obligatoriskt', 400, 'MISSING_REDIRECT_URI');

        const verifier  = genCodeVerifier();
        const challenge = await genCodeChallenge(verifier);
        const state     = `${orgId}:${crypto.randomUUID()}`;

        const authUrl = new URL(FORTNOX_AUTH_URL);
        authUrl.searchParams.set('client_id',             clientId);
        authUrl.searchParams.set('redirect_uri',          redirectUri);
        authUrl.searchParams.set('scope',                 FORTNOX_SCOPE);
        authUrl.searchParams.set('state',                 state);
        authUrl.searchParams.set('access_type',           'offline');
        authUrl.searchParams.set('response_type',         'code');
        authUrl.searchParams.set('code_challenge',        challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        return json({ auth_url: authUrl.toString(), code_verifier: verifier, state });
      }

      // POST /fortnox/oauth/callback
      if (sub === 'callback' && method === 'POST') {
        const clientId     = Deno.env.get('FORTNOX_CLIENT_ID');
        const clientSecret = Deno.env.get('FORTNOX_CLIENT_SECRET');
        if (!clientId || !clientSecret) return err(ctx, 'Fortnox-integration ej konfigurerad', 503, 'NOT_CONFIGURED');

        const body = await req.json() as {
          code?:          string;
          code_verifier?: string;
          redirect_uri?:  string;
          state?:         string;
        };
        if (!body.code)          return err(ctx, 'code saknas', 400, 'MISSING_CODE');
        if (!body.code_verifier) return err(ctx, 'code_verifier saknas', 400, 'MISSING_VERIFIER');
        if (!body.redirect_uri)  return err(ctx, 'redirect_uri saknas', 400, 'MISSING_REDIRECT_URI');

        // CSRF: state must start with orgId
        if (body.state && !body.state.startsWith(`${orgId}:`)) {
          return err(ctx, 'Ogiltigt state-parameter', 400, 'INVALID_STATE');
        }

        const tokens = await fortnoxTokenRequest(clientId, clientSecret, {
          grant_type:    'authorization_code',
          code:          body.code,
          code_verifier: body.code_verifier,
          redirect_uri:  body.redirect_uri,
        });

        const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        await updateOrgSettings(supabase, orgId, {
          fortnox_access_token: null, // clear legacy manual token
          fortnox_oauth: {
            access_token:  tokens.access_token,
            refresh_token: tokens.refresh_token ?? '',
            token_expiry:  tokenExpiry,
            scope:         tokens.scope ?? FORTNOX_SCOPE,
            connected_at:  new Date().toISOString(),
            connected_by:  userId,
          },
        });

        return json({ connected: true, scope: tokens.scope ?? FORTNOX_SCOPE, token_expiry: tokenExpiry });
      }

      // POST /fortnox/oauth/refresh
      if (sub === 'refresh' && method === 'POST') {
        const clientId     = Deno.env.get('FORTNOX_CLIENT_ID');
        const clientSecret = Deno.env.get('FORTNOX_CLIENT_SECRET');
        if (!clientId || !clientSecret) return err(ctx, 'Fortnox-integration ej konfigurerad', 503, 'NOT_CONFIGURED');

        const settings     = await getOrgSettings(supabase, orgId);
        const oauth        = settings['fortnox_oauth'] as Record<string, string> | undefined;
        const refreshToken = oauth?.['refresh_token'];
        if (!refreshToken) return err(ctx, 'Inte ansluten till Fortnox', 400, 'NOT_CONNECTED');

        const tokens = await fortnoxTokenRequest(clientId, clientSecret, {
          grant_type:    'refresh_token',
          refresh_token: refreshToken,
        });

        const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        await updateOrgSettings(supabase, orgId, {
          fortnox_oauth: {
            ...(oauth ?? {}),
            access_token:  tokens.access_token,
            refresh_token: tokens.refresh_token ?? refreshToken,
            token_expiry:  tokenExpiry,
            scope:         tokens.scope ?? oauth?.['scope'] ?? FORTNOX_SCOPE,
          },
        });

        return json({ refreshed: true, token_expiry: tokenExpiry });
      }

      // DELETE /fortnox/oauth/disconnect
      if (sub === 'disconnect' && method === 'DELETE') {
        const role = ctx.actorRole;
        if (!ADMIN_ROLES.has(role ?? '')) return err(ctx, 'Förbjudet — kräver adminroll', 403, 'FORBIDDEN');

        await updateOrgSettings(supabase, orgId, {
          fortnox_oauth:        null,
          fortnox_access_token: null,
        });
        return json({ disconnected: true });
      }

      return err(ctx, 'Not found', 404, 'NOT_FOUND');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SYNC QUEUE
    // ══════════════════════════════════════════════════════════════════════════

    if (method === 'POST' && resource === 'queue') {
      const body = await req.json();
      const { entity, entity_id } = body;
      if (!entity || !entity_id) return err(ctx, 'entity och entity_id krävs', 400, 'VALIDATION_ERROR');
      if (!['customer', 'invoice', 'payment'].includes(entity)) return err(ctx, 'entity måste vara customer, invoice eller payment', 400, 'VALIDATION_ERROR');
      if (!UUID_RE.test(entity_id)) return err(ctx, 'entity_id måste vara ett giltigt UUID', 400, 'VALIDATION_ERROR');

      const { error } = await supabase.rpc('queue_fortnox_sync', {
        p_org_id:    orgId,
        p_entity:    entity,
        p_entity_id: entity_id,
      });
      if (error) {
        if (error.message?.includes('FORTNOX_QUEUE_UNKNOWN_ENTITY')) return err(ctx, 'Okänd entity-typ', 422, 'VALIDATION_ERROR');
        throw error;
      }
      return json({ queued: true });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CUSTOMER SYNC
    // ══════════════════════════════════════════════════════════════════════════

    if (method === 'GET' && resource === 'customers' && entityId) {
      const { data, error } = await supabase
        .from('fortnox_customer_sync')
        .select('*')
        .eq('organization_id', orgId)
        .eq('student_id', entityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err(ctx, 'Customer sync-post ej hittad', 404, 'NOT_FOUND');
      return json(data);
    }

    if (method === 'GET' && resource === 'customers' && !entityId) {
      const status = sp.get('status') ?? 'pending';
      const limit  = Math.min(parseInt(sp.get('limit') ?? '50', 10), 100);
      const { data, error } = await supabase
        .from('fortnox_customer_sync')
        .select('*')
        .eq('organization_id', orgId)
        .eq('sync_status', status)
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // INVOICE SYNC
    // ══════════════════════════════════════════════════════════════════════════

    if (method === 'GET' && resource === 'invoices' && entityId) {
      const { data, error } = await supabase
        .from('fortnox_invoice_sync')
        .select('*')
        .eq('organization_id', orgId)
        .eq('invoice_id', entityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err(ctx, 'Invoice sync-post ej hittad', 404, 'NOT_FOUND');
      return json(data);
    }

    if (method === 'GET' && resource === 'invoices' && !entityId) {
      const status = sp.get('status') ?? 'pending';
      const limit  = Math.min(parseInt(sp.get('limit') ?? '50', 10), 100);
      const { data, error } = await supabase
        .from('fortnox_invoice_sync')
        .select('*')
        .eq('organization_id', orgId)
        .eq('sync_status', status)
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PAYMENT SYNC
    // ══════════════════════════════════════════════════════════════════════════

    if (method === 'GET' && resource === 'payments' && entityId) {
      const { data, error } = await supabase
        .from('fortnox_payment_sync')
        .select('*')
        .eq('organization_id', orgId)
        .eq('payment_id', entityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err(ctx, 'Payment sync-post ej hittad', 404, 'NOT_FOUND');
      return json(data);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // EXPORT LINEAGE
    // ══════════════════════════════════════════════════════════════════════════

    if (method === 'GET' && resource === 'lineage' && entityId) {
      const { data, error } = await supabase
        .from('fortnox_export_lineage')
        .select('*')
        .eq('organization_id', orgId)
        .eq('export_run_id', entityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err(ctx, 'Export lineage ej hittad', 404, 'NOT_FOUND');
      return json(data);
    }

    if (method === 'GET' && resource === 'lineage' && !entityId) {
      const limit = Math.min(parseInt(sp.get('limit') ?? '20', 10), 50);
      const { data, error } = await supabase
        .from('fortnox_export_lineage')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    return err(ctx, 'Not Found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fortnox]', msg);
    return err(ctx, msg || 'Internal server error', 500, 'INTERNAL_ERROR');
  }
}));

// ─── Permission check ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function hasFortnoxPermission(supabase: any, orgId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('permissions')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    // Fall back to profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', userId)
      .maybeSingle();
    return profile?.is_platform_admin === true;
  }

  const perms = (data.permissions as string[]) ?? [];
  return perms.includes('finance:fortnox:manage') || perms.includes('*');
}
