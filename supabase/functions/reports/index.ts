/**
 * reports — Financial reporting endpoints.
 *
 * Routes:
 *   GET /reports/revenue       — revenue by financial period
 *   GET /reports/vat           — VAT summary (?from=YYYY-MM-DD&to=YYYY-MM-DD)
 *   GET /reports/aging         — invoice aging buckets
 *   GET /reports/wallet        — wallet liability (unconsumed credits)
 *   GET /reports/outstanding   — all invoices with outstanding balance
 *   GET /reports/exports       — list export runs
 *   POST /reports/exports      — start a new accounting export run
 *   GET /reports/chart         — get chart of accounts
 *   POST /reports/chart        — upsert chart of accounts entry
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { enrichUserFromJwt, getOrgIdFromBearer } from '../_shared/jwt.ts';

const JSON_CT = { 'Content-Type': 'application/json' };

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

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: rawUser }, error: authErr } = await client.auth.getUser();
  if (authErr !== null || rawUser === null) return err('Unauthorized', 401, 'UNAUTHORIZED');
  const user = enrichUserFromJwt(req, rawUser);

  const orgId = getOrgId(user) ?? getOrgIdFromBearer(req);
  if (orgId === null) return err('No organization context', 400, 'NO_ORG_CONTEXT');

  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'reports');
  const section  = segments[fnIdx + 1] ?? '';
  const url      = new URL(req.url);
  const method   = req.method;

  // ─── GET /reports/revenue ─────────────────────────────────────────────────

  if (section === 'revenue' && method === 'GET') {
    if (!hasPermission(user, 'finance:report:read')) return err('Forbidden', 403, 'FORBIDDEN');
    const { data, error: qErr } = await client
      .from('v_revenue_by_period')
      .select('*')
      .eq('organization_id', orgId)
      .order('period_start', { ascending: false });
    if (qErr) return err(qErr.message, 500, 'QUERY_FAILED');
    return json({ data: data ?? [] });
  }

  // ─── GET /reports/vat ─────────────────────────────────────────────────────

  if (section === 'vat' && method === 'GET') {
    if (!hasPermission(user, 'finance:report:read')) return err('Forbidden', 403, 'FORBIDDEN');
    const fromDate = url.searchParams.get('from');
    const toDate   = url.searchParams.get('to');
    if (!fromDate || !toDate) return err('from and to query params are required (YYYY-MM-DD)', 400, 'VALIDATION_ERROR');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: rpcErr } = await (client as any).rpc('get_vat_summary', {
      p_org_id:    orgId,
      p_from_date: fromDate,
      p_to_date:   toDate,
    });
    if (rpcErr) return err(rpcErr.message, 500, 'QUERY_FAILED');
    return json({ data: data ?? [] });
  }

  // ─── GET /reports/aging ───────────────────────────────────────────────────

  if (section === 'aging' && method === 'GET') {
    if (!hasPermission(user, 'finance:report:read')) return err('Forbidden', 403, 'FORBIDDEN');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: rpcErr } = await (client as any).rpc('get_aging_report', {
      p_org_id: orgId,
    });
    if (rpcErr) return err(rpcErr.message, 500, 'QUERY_FAILED');
    return json({ data: data ?? [] });
  }

  // ─── GET /reports/wallet ──────────────────────────────────────────────────

  if (section === 'wallet' && method === 'GET') {
    if (!hasPermission(user, 'finance:report:read')) return err('Forbidden', 403, 'FORBIDDEN');
    const { data, error: qErr } = await client
      .from('v_wallet_liability')
      .select('*')
      .eq('organization_id', orgId)
      .order('lesson_category');
    if (qErr) return err(qErr.message, 500, 'QUERY_FAILED');
    return json({ data: data ?? [] });
  }

  // ─── GET /reports/outstanding ─────────────────────────────────────────────

  if (section === 'outstanding' && method === 'GET') {
    if (!hasPermission(user, 'finance:invoice:read')) return err('Forbidden', 403, 'FORBIDDEN');
    const { data, error: qErr } = await client
      .from('v_outstanding_invoices')
      .select('*')
      .eq('organization_id', orgId)
      .order('days_overdue', { ascending: false, nullsFirst: false });
    if (qErr) return err(qErr.message, 500, 'QUERY_FAILED');
    return json({ data: data ?? [] });
  }

  // ─── /reports/exports ─────────────────────────────────────────────────────

  if (section === 'exports') {
    if (!hasPermission(user, 'finance:export:run')) return err('Forbidden', 403, 'FORBIDDEN');

    if (method === 'GET') {
      const page    = Number(url.searchParams.get('page')     ?? '1');
      const perPage = Number(url.searchParams.get('per_page') ?? '25');
      const from    = (page - 1) * perPage;
      const to      = from + perPage - 1;
      const { data, error: qErr, count } = await client
        .from('accounting_export_runs')
        .select('*', { count: 'exact' })
        .eq('organization_id', orgId)
        .order('started_at', { ascending: false })
        .range(from, to);
      if (qErr) return err(qErr.message, 500, 'QUERY_FAILED');
      return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
    }

    if (method === 'POST') {
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
      const { format, from_date, to_date } = body;
      if (!format || !from_date || !to_date) {
        return err('format, from_date, to_date are required', 400, 'VALIDATION_ERROR');
      }
      if ((from_date as string) > (to_date as string)) {
        return err('from_date must be before to_date', 400, 'VALIDATION_ERROR');
      }
      // Create the run record
      const { data: run, error: insertErr } = await client
        .from('accounting_export_runs')
        .insert({
          organization_id: orgId,
          format,
          from_date,
          to_date,
          status:     'pending',
          created_by: user.id,
        })
        .select('*')
        .single();
      if (insertErr) return err(insertErr.message, 500, 'INSERT_FAILED');
      return json(run, 201);
    }

    return err('Method not allowed', 405);
  }

  // ─── /reports/chart ───────────────────────────────────────────────────────

  if (section === 'chart') {
    if (!hasPermission(user, 'finance:export:run')) return err('Forbidden', 403, 'FORBIDDEN');

    if (method === 'GET') {
      const { data, error: qErr } = await client
        .from('accounting_chart_of_accounts')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('event_type');
      if (qErr) return err(qErr.message, 500, 'QUERY_FAILED');
      return json({ data: data ?? [] });
    }

    if (method === 'POST') {
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
      const { event_type, account_debit, account_credit } = body;
      if (!event_type || !account_debit || !account_credit) {
        return err('event_type, account_debit, account_credit are required', 400, 'VALIDATION_ERROR');
      }
      const { data: entry, error: upsertErr } = await client
        .from('accounting_chart_of_accounts')
        .upsert({
          organization_id: orgId,
          event_type,
          account_debit,
          account_credit,
          description: body['description'] ?? null,
          is_active:   true,
          created_by:  user.id,
        }, { onConflict: 'organization_id,event_type' })
        .select('*')
        .single();
      if (upsertErr) return err(upsertErr.message, 500, 'UPSERT_FAILED');
      return json(entry, 200);
    }

    return err('Method not allowed', 405);
  }

  return err('Route not found', 404);
}));
