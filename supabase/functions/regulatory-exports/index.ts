/**
 * regulatory-exports — AGI export generation, integrity verification, and audit exports.
 *
 * Routes:
 *   POST /regulatory-exports/agi                   — generate AGI export from payroll run
 *   GET  /regulatory-exports/agi                   — list AGI exports
 *   GET  /regulatory-exports/agi/:id               — get AGI export
 *   GET  /regulatory-exports/agi/:id/lines         — get AGI export lines
 *   POST /regulatory-exports/agi/:id/lock          — mark AGI as submitted (irreversible)
 *   GET  /regulatory-exports/agi/:id/verify        — verify SHA-256 integrity
 *
 *   POST /regulatory-exports/audit                 — generate regulatory audit export
 *   GET  /regulatory-exports/audit                 — list regulatory audit exports
 *   GET  /regulatory-exports/audit/:id             — get regulatory audit export
 *
 *   GET  /regulatory-exports/compliance            — compliance status dashboard
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { enrichUserFromJwt, getOrgIdFromBearer } from '../_shared/jwt.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined && { code }) }, status);
}
function getOrgId(user: { app_metadata?: Record<string, unknown> }): string | null {
  return (user.app_metadata?.['organization_id'] as string | undefined) ?? null;
}
function hasPerm(user: { app_metadata?: Record<string, unknown> }, perm: string): boolean {
  const perms = (user.app_metadata?.['permissions'] as string[] | undefined) ?? [];
  return perms.includes(perm);
}

interface PathInfo {
  seg1: string | null; // 'agi' | 'audit' | 'compliance'
  seg2: string | null; // :id
  seg3: string | null; // 'lines' | 'lock' | 'verify'
}

function parsePath(req: Request): PathInfo {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'regulatory-exports');
  return {
    seg1: segments[fnIdx + 1] ?? null,
    seg2: segments[fnIdx + 2] ?? null,
    seg3: segments[fnIdx + 3] ?? null,
  };
}

function isUuid(s: string | null): s is string {
  return s !== null && UUID_RE.test(s);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Deno.serve((req: Request) => serveCors(req, async () => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: rawUser }, error: authError } = await client.auth.getUser();
  if (authError || !rawUser) return err('Unauthorized', 401, 'UNAUTHORIZED');
  const user = enrichUserFromJwt(req, rawUser);

  const orgId = getOrgId(user) ?? getOrgIdFromBearer(req);
  if (!orgId) return err('No organization context', 403, 'NO_ORG_CONTEXT');

  const method = req.method.toUpperCase();
  const { seg1, seg2, seg3 } = parsePath(req);

  try {
    // ── AGI exports ───────────────────────────────────────────────────────────
    if (seg1 === 'agi') {
      // POST /regulatory-exports/agi (generate)
      if (method === 'POST' && seg2 === null) {
        if (!hasPerm(user, 'finance:agi:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('generate_agi_export', {
          p_org_id:         orgId,
          p_payroll_run_id: body.payroll_run_id,
          p_notes:          body.notes ?? null,
          p_actor_id:       user.id,
        });
        if (error) return err(error.message, 400, error.code);
        return json({ id: data }, 201);
      }

      // GET /regulatory-exports/agi
      if (method === 'GET' && seg2 === null) {
        if (!hasPerm(user, 'finance:agi:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const url    = new URL(req.url);
        const status = url.searchParams.get('status');
        let q = (client as any).from('agi_exports').select('*', { count: 'exact' })
          .eq('organization_id', orgId)
          .order('declaration_month', { ascending: false });
        if (status) q = q.eq('status', status);
        const { data, error, count } = await q;
        if (error) return err(error.message, 500);
        return json({ data, total: count ?? 0 });
      }

      // GET /regulatory-exports/agi/:id
      if (method === 'GET' && isUuid(seg2) && seg3 === null) {
        if (!hasPerm(user, 'finance:agi:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).from('agi_exports')
          .select('*').eq('id', seg2).eq('organization_id', orgId).maybeSingle();
        if (error) return err(error.message, 500);
        if (!data) return err('Not found', 404, 'NOT_FOUND');
        return json(data);
      }

      // GET /regulatory-exports/agi/:id/lines
      if (method === 'GET' && isUuid(seg2) && seg3 === 'lines') {
        if (!hasPerm(user, 'finance:agi:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).from('agi_export_lines')
          .select('*').eq('agi_export_id', seg2).eq('organization_id', orgId)
          .order('employee_id');
        if (error) return err(error.message, 500);
        return json({ data, total: data?.length ?? 0 });
      }

      // POST /regulatory-exports/agi/:id/lock
      if (method === 'POST' && isUuid(seg2) && seg3 === 'lock') {
        if (!hasPerm(user, 'finance:agi:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { error } = await (client as any).rpc('lock_agi_export', {
          p_agi_export_id: seg2,
          p_receipt:       (body as any).receipt ?? null,
          p_actor_id:      user.id,
        });
        if (error) return err(error.message, 400, error.code);
        return json({ success: true });
      }

      // GET /regulatory-exports/agi/:id/verify
      if (method === 'GET' && isUuid(seg2) && seg3 === 'verify') {
        if (!hasPerm(user, 'finance:agi:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).rpc('verify_agi_export_integrity', {
          p_agi_export_id: seg2,
        });
        if (error) return err(error.message, 400, error.code);
        return json(data);
      }
    }

    // ── Regulatory audit exports ──────────────────────────────────────────────
    if (seg1 === 'audit') {
      // POST /regulatory-exports/audit
      if (method === 'POST' && seg2 === null) {
        if (!hasPerm(user, 'finance:agi:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('generate_regulatory_audit_export', {
          p_org_id:      orgId,
          p_period_id:   body.period_id,
          p_export_type: body.export_type,
          p_notes:       body.notes ?? null,
          p_actor_id:    user.id,
        });
        if (error) return err(error.message, 400, error.code);
        return json({ id: data }, 201);
      }

      // GET /regulatory-exports/audit
      if (method === 'GET' && seg2 === null) {
        if (!hasPerm(user, 'finance:agi:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const url        = new URL(req.url);
        const exportType = url.searchParams.get('export_type');
        const periodId   = url.searchParams.get('financial_period_id');
        let q = (client as any).from('regulatory_audit_exports')
          .select('*', { count: 'exact' })
          .eq('organization_id', orgId)
          .order('export_date', { ascending: false });
        if (exportType) q = q.eq('export_type', exportType);
        if (periodId)   q = q.eq('financial_period_id', periodId);
        const { data, error, count } = await q;
        if (error) return err(error.message, 500);
        return json({ data, total: count ?? 0 });
      }

      // GET /regulatory-exports/audit/:id
      if (method === 'GET' && isUuid(seg2) && seg3 === null) {
        if (!hasPerm(user, 'finance:agi:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).from('regulatory_audit_exports')
          .select('*').eq('id', seg2).eq('organization_id', orgId).maybeSingle();
        if (error) return err(error.message, 500);
        if (!data) return err('Not found', 404, 'NOT_FOUND');
        return json(data);
      }
    }

    // ── Compliance dashboard ──────────────────────────────────────────────────
    if (seg1 === 'compliance' && method === 'GET') {
      if (!hasPerm(user, 'finance:agi:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await (client as any).from('v_regulatory_compliance_status')
        .select('*').eq('organization_id', orgId).maybeSingle();
      if (error) return err(error.message, 500);
      return json(data ?? {});
    }

    return err('Not found', 404, 'NOT_FOUND');
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return err(message, 500, 'INTERNAL_ERROR');
  }
}));
