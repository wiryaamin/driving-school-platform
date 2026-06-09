/**
 * swedish-vat — Swedish VAT period management (momsperioder).
 *
 * Routes:
 *   GET  /swedish-vat/periods              — list VAT periods
 *   POST /swedish-vat/periods              — create a VAT period
 *   GET  /swedish-vat/periods/:id          — get a VAT period
 *   POST /swedish-vat/periods/:id/populate — populate period from invoices
 *   POST /swedish-vat/periods/:id/lock     — lock period (mark as filed)
 *   GET  /swedish-vat/periods/:id/entries  — list transaction entries for period
 *   GET  /swedish-vat/bas                  — list BAS 2020 account catalog
 *   GET  /swedish-vat/rates                — list Swedish VAT rates
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function parsePath(req: Request): { top: string | null; periodId: string | null; sub: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'swedish-vat');
  const top      = segments[fnIdx + 1] ?? null;
  const seg2     = segments[fnIdx + 2] ?? null;
  const seg3     = segments[fnIdx + 3] ?? null;
  return {
    top,
    periodId: seg2 && UUID_RE.test(seg2) ? seg2 : null,
    sub:      (seg2 && !UUID_RE.test(seg2)) ? seg2 : (seg3 && !UUID_RE.test(seg3) ? seg3 : null),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return err('Unauthorized', 401, 'UNAUTHORIZED');

  const orgId = getOrgId(user);
  if (!orgId) return err('No organization context', 403, 'NO_ORG');

  const { top, periodId, sub } = parsePath(req);

  try {
    // GET /swedish-vat/bas
    if (req.method === 'GET' && top === 'bas') {
      if (!hasPermission(user, 'finance:bas:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('bas_account_catalog' as never)
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // GET /swedish-vat/rates
    if (req.method === 'GET' && top === 'rates') {
      if (!hasPermission(user, 'finance:bas:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('vat_rates' as never)
        .select('*')
        .order('rate_percent', { ascending: false });
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // POST /swedish-vat/periods/:id/populate
    if (req.method === 'POST' && top === 'periods' && periodId && sub === 'populate') {
      if (!hasPermission(user, 'finance:vat:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase.rpc('populate_vat_period' as never, {
        p_period_id: periodId,
        p_actor_id:  user.id,
      });
      if (error) {
        if (error.message?.includes('VAT_PERIOD_NOT_FOUND')) return err('Period not found', 404, 'NOT_FOUND');
        if (error.message?.includes('VAT_PERIOD_NOT_OPEN'))  return err('Period is not open', 409, 'CONFLICT');
        throw error;
      }
      return json({ entries_inserted: data ?? 0 });
    }

    // POST /swedish-vat/periods/:id/lock
    if (req.method === 'POST' && top === 'periods' && periodId && sub === 'lock') {
      if (!hasPermission(user, 'finance:vat:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json().catch(() => ({}));
      const { error } = await supabase.rpc('lock_vat_period' as never, {
        p_period_id:       periodId,
        p_actor_id:        user.id,
        p_filing_reference: body.filing_reference ?? null,
      });
      if (error) {
        if (error.message?.includes('VAT_PERIOD_NOT_FOUND'))    return err('Period not found', 404, 'NOT_FOUND');
        if (error.message?.includes('VAT_PERIOD_CANNOT_LOCK'))  return err('Period cannot be locked in its current status', 409, 'CONFLICT');
        if (error.message?.includes('VAT_PERIOD_IMMUTABLE'))    return err('Period is immutable once locked', 409, 'IMMUTABLE');
        throw error;
      }
      return json({ locked: true });
    }

    // GET /swedish-vat/periods/:id/entries
    if (req.method === 'GET' && top === 'periods' && periodId && sub === 'entries') {
      if (!hasPermission(user, 'finance:vat:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('vat_report_entries' as never)
        .select('*')
        .eq('vat_period_id', periodId)
        .eq('organization_id', orgId)
        .order('transaction_date', { ascending: true });
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // GET /swedish-vat/periods/:id
    if (req.method === 'GET' && top === 'periods' && periodId && !sub) {
      if (!hasPermission(user, 'finance:vat:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('vat_periods' as never)
        .select('*')
        .eq('id', periodId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err('Period not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /swedish-vat/periods
    if (req.method === 'GET' && top === 'periods' && !periodId) {
      if (!hasPermission(user, 'finance:vat:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const url    = new URL(req.url);
      const status = url.searchParams.get('status');
      let q = supabase
        .from('vat_periods' as never)
        .select('*')
        .eq('organization_id', orgId)
        .order('period_start', { ascending: false });
      if (status) q = (q as never as Record<string, unknown>)['eq']('status', status) as never;
      const { data, error } = await (q as never as Promise<{ data: unknown[]; error: unknown }>);
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // POST /swedish-vat/periods
    if (req.method === 'POST' && top === 'periods' && !periodId) {
      if (!hasPermission(user, 'finance:vat:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json();
      const { period_start, period_end, frequency = 'monthly' } = body;
      if (!period_start || !period_end) return err('period_start and period_end are required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('create_vat_period' as never, {
        p_org_id:       orgId,
        p_period_start: period_start,
        p_period_end:   period_end,
        p_frequency:    frequency,
        p_actor_id:     user.id,
      });
      if (error) {
        if (error.message?.includes('VAT_PERIOD_DUPLICATE'))       return err('A period with these dates already exists', 409, 'CONFLICT');
        if (error.message?.includes('VAT_PERIOD_INVALID_DATES'))   return err('period_end must be >= period_start', 422, 'VALIDATION_ERROR');
        throw error;
      }
      return json({ period_id: data }, 201);
    }

    return err('Not Found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[swedish-vat]', msg);
    return err('Internal server error', 500, 'INTERNAL_ERROR');
  }
});
