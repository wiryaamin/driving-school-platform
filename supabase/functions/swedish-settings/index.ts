/**
 * swedish-settings — Swedish organization finance settings and OCR references.
 *
 * Routes:
 *   GET  /swedish-settings           — get Swedish settings for the org
 *   PUT  /swedish-settings           — upsert Swedish settings
 *   POST /swedish-settings/seed-bas  — seed BAS account chart for this org
 *   POST /swedish-settings/seed-dunning — seed Swedish dunning schedule
 *   GET  /swedish-settings/ocr       — list OCR references
 *   GET  /swedish-settings/ocr/:invoiceId — get OCR reference for invoice
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
function hasPermission(user: { app_metadata?: Record<string, unknown> }, perm: string): boolean {
  const perms = (user.app_metadata?.['permissions'] as string[] | undefined) ?? [];
  return perms.includes(perm);
}

function parsePath(req: Request): { sub: string | null; invoiceId: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'swedish-settings');
  const seg1     = segments[fnIdx + 1] ?? null;
  const seg2     = segments[fnIdx + 2] ?? null;
  return {
    sub:       seg1 && !UUID_RE.test(seg1) ? seg1 : null,
    invoiceId: seg1 === 'ocr' && seg2 && UUID_RE.test(seg2) ? seg2 : null,
  };
}

Deno.serve((req: Request) => serveCors(req, async () => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return err('Missing Authorization header', 401, 'UNAUTHORIZED');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user: rawUser }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !rawUser) return err('Unauthorized', 401, 'UNAUTHORIZED');
  const user = enrichUserFromJwt(req, rawUser);

  const orgId = getOrgId(user) ?? getOrgIdFromBearer(req);
  if (!orgId) return err('No organization context', 403, 'NO_ORG');

  const { sub, invoiceId } = parsePath(req);

  try {
    // GET /swedish-settings/ocr/:invoiceId
    if (req.method === 'GET' && sub === 'ocr' && invoiceId) {
      if (!hasPermission(user, 'finance:settings:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('invoice_ocr_references' as never)
        .select('*')
        .eq('invoice_id', invoiceId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err('OCR reference not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /swedish-settings/ocr
    if (req.method === 'GET' && sub === 'ocr') {
      if (!hasPermission(user, 'finance:settings:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('invoice_ocr_references' as never)
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // POST /swedish-settings/seed-bas
    if (req.method === 'POST' && sub === 'seed-bas') {
      if (!hasPermission(user, 'finance:bas:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase.rpc('seed_org_chart_of_accounts' as never, {
        p_org_id:   orgId,
        p_actor_id: user.id,
      });
      if (error) throw error;
      return json({ seeded: data ?? 0 });
    }

    // POST /swedish-settings/seed-dunning
    if (req.method === 'POST' && sub === 'seed-dunning') {
      if (!hasPermission(user, 'finance:settings:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase.rpc('seed_swedish_dunning_schedule' as never, {
        p_org_id:   orgId,
        p_actor_id: user.id,
      });
      if (error) throw error;
      return json({ schedule_id: data });
    }

    // GET /swedish-settings
    if (req.method === 'GET' && !sub) {
      if (!hasPermission(user, 'finance:settings:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('organization_swedish_settings' as never)
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return json(data ?? null);
    }

    // PUT /swedish-settings
    if (req.method === 'PUT' && !sub) {
      if (!hasPermission(user, 'finance:settings:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json();
      const { data, error } = await supabase
        .from('organization_swedish_settings' as never)
        .upsert({ organization_id: orgId, ...body, updated_at: new Date().toISOString() },
          { onConflict: 'organization_id' })
        .select('*')
        .single();
      if (error) throw error;
      return json(data);
    }

    return err('Not Found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[swedish-settings]', msg);
    return err('Internal server error', 500, 'INTERNAL_ERROR');
  }
}));
