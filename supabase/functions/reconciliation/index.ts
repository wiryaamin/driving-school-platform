/**
 * reconciliation — Bank statement import, matching, and period reconciliation.
 *
 * Routes:
 *   POST /reconciliation/bank/import          — import bank statement with lines
 *   GET  /reconciliation/bank/imports         — list bank statement imports
 *   GET  /reconciliation/bank/imports/:id     — get single import
 *   GET  /reconciliation/bank/imports/:id/lines — get lines for import
 *   POST /reconciliation/bank/imports/:id/auto-match  — auto-match unmatched lines
 *   POST /reconciliation/bank/lines/:id/match         — manually match a line to payment
 *   POST /reconciliation/bank/lines/:id/unmatch       — unmatch a line
 *   POST /reconciliation/bank/imports/:id/confirm     — confirm bank reconciliation
 *   POST /reconciliation/ar                   — reconcile accounts receivable
 *   POST /reconciliation/vat                  — reconcile VAT period
 *   POST /reconciliation/deferred             — reconcile deferred revenue
 *   GET  /reconciliation/runs                 — list reconciliation runs for a period
 *   GET  /reconciliation/runs/:id             — get single reconciliation run
 *   GET  /reconciliation/runs/:id/items       — get items for a run
 *   GET  /reconciliation/report               — generate reconciliation report
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
function hasPerm(user: { app_metadata?: Record<string, unknown> }, perm: string): boolean {
  const perms = (user.app_metadata?.['permissions'] as string[] | undefined) ?? [];
  return perms.includes(perm);
}

interface PathInfo {
  seg1: string | null;
  seg2: string | null;
  seg3: string | null;
  seg4: string | null;
}

function parsePath(req: Request): PathInfo {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'reconciliation');
  return {
    seg1: segments[fnIdx + 1] ?? null,
    seg2: segments[fnIdx + 2] ?? null,
    seg3: segments[fnIdx + 3] ?? null,
    seg4: segments[fnIdx + 4] ?? null,
  };
}

function handlePgError(e: { message?: string }, prefix: string): Response | null {
  const msg = e.message ?? '';
  if (msg.includes('IMPORT_NOT_FOUND'))          return err('Bank statement import not found', 404, 'NOT_FOUND');
  if (msg.includes('LINE_NOT_FOUND'))            return err('Bank statement line not found', 404, 'NOT_FOUND');
  if (msg.includes('PAYMENT_NOT_FOUND'))         return err('Payment not found', 404, 'NOT_FOUND');
  if (msg.includes('LINE_ALREADY_MATCHED'))      return err('Line is already matched', 409, 'ALREADY_MATCHED');
  if (msg.includes('LINE_NOT_MATCHED'))          return err('Line is not matched', 409, 'NOT_MATCHED');
  if (msg.includes('IMPORT_CONFIRMED'))          return err('Import already confirmed', 409, 'ALREADY_CONFIRMED');
  if (msg.includes('PERIOD_NOT_FOUND'))          return err('Financial period not found', 404, 'NOT_FOUND');
  if (msg.includes('VAT_PERIOD_NOT_FOUND'))      return err('VAT period not found', 404, 'NOT_FOUND');
  console.error(`[${prefix}]`, msg);
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return err('Missing Authorization header', 401, 'UNAUTHORIZED');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')      ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return err('Unauthorized', 401, 'UNAUTHORIZED');

  const orgId = getOrgId(user);
  if (!orgId) return err('No organization context', 403, 'NO_ORG');

  const { seg1, seg2, seg3, seg4 } = parsePath(req);
  const url = new URL(req.url);

  try {

    // ── /reconciliation/bank ─────────────────────────────────────────────────

    if (seg1 === 'bank') {

      // POST /reconciliation/bank/import
      if (req.method === 'POST' && seg2 === 'import') {
        if (!hasPerm(user, 'finance:reconciliation:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { account_number, bank_name, statement_date, period_start, period_end,
                opening_balance, closing_balance, currency, lines } = body;
        if (!account_number || !statement_date || !period_start || !period_end) {
          return err('account_number, statement_date, period_start, period_end are required', 400, 'VALIDATION_ERROR');
        }
        if (!Array.isArray(lines) || lines.length === 0) {
          return err('lines must be a non-empty array', 400, 'VALIDATION_ERROR');
        }
        const { data, error } = await supabase.rpc('import_bank_statement' as never, {
          p_org_id:           orgId,
          p_account_number:   account_number,
          p_bank_name:        bank_name        ?? null,
          p_statement_date:   statement_date,
          p_period_start:     period_start,
          p_period_end:       period_end,
          p_opening_balance:  opening_balance  ?? 0,
          p_closing_balance:  closing_balance  ?? 0,
          p_currency:         currency         ?? 'SEK',
          p_lines:            lines,
          p_actor_id:         user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'reconciliation/bank/import');
          if (mapped) return mapped;
          throw error;
        }
        return json({ import_id: data }, 201);
      }

      // GET /reconciliation/bank/imports
      if (req.method === 'GET' && seg2 === 'imports' && !seg3) {
        if (!hasPerm(user, 'finance:reconciliation:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const limit  = Math.min(100, parseInt(url.searchParams.get('limit')  ?? '50',  10));
        const offset = Math.max(0,   parseInt(url.searchParams.get('offset') ?? '0',   10));
        const { data, error } = await supabase
          .from('bank_statement_imports' as never)
          .select('*', { count: 'exact' })
          .eq('organization_id', orgId)
          .order('imported_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw error;
        return json({ data: data ?? [] });
      }

      const importId = seg2 === 'imports' && seg3 && UUID_RE.test(seg3) ? seg3 : null;
      const lineId   = seg2 === 'lines'   && seg3 && UUID_RE.test(seg3) ? seg3 : null;

      // GET /reconciliation/bank/imports/:id
      if (req.method === 'GET' && importId && !seg4) {
        if (!hasPerm(user, 'finance:reconciliation:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('bank_statement_imports' as never)
          .select('*')
          .eq('id', importId)
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return err('Bank statement import not found', 404, 'NOT_FOUND');
        return json(data);
      }

      // GET /reconciliation/bank/imports/:id/lines
      if (req.method === 'GET' && importId && seg4 === 'lines') {
        if (!hasPerm(user, 'finance:reconciliation:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('bank_statement_lines' as never)
          .select('*')
          .eq('organization_id', orgId)
          .eq('import_id', importId)
          .order('line_number', { ascending: true });
        if (error) throw error;
        return json({ data: data ?? [] });
      }

      // POST /reconciliation/bank/imports/:id/auto-match
      if (req.method === 'POST' && importId && seg4 === 'auto-match') {
        if (!hasPerm(user, 'finance:reconciliation:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase.rpc('auto_match_bank_lines' as never, {
          p_import_id: importId,
          p_actor_id:  user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'reconciliation/bank/auto-match');
          if (mapped) return mapped;
          throw error;
        }
        return json({ matched_count: data ?? 0 });
      }

      // POST /reconciliation/bank/imports/:id/confirm
      if (req.method === 'POST' && importId && seg4 === 'confirm') {
        if (!hasPerm(user, 'finance:reconciliation:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { period_id, notes } = body;
        if (!period_id || !UUID_RE.test(period_id)) return err('period_id is required', 400, 'VALIDATION_ERROR');
        const { data, error } = await supabase.rpc('confirm_bank_reconciliation' as never, {
          p_import_id: importId,
          p_period_id: period_id,
          p_notes:     notes ?? null,
          p_actor_id:  user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'reconciliation/bank/confirm');
          if (mapped) return mapped;
          throw error;
        }
        return json({ reconciliation_run_id: data }, 201);
      }

      // POST /reconciliation/bank/lines/:id/match
      if (req.method === 'POST' && lineId && seg4 === 'match') {
        if (!hasPerm(user, 'finance:reconciliation:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { payment_id, notes } = body;
        if (!payment_id || !UUID_RE.test(payment_id)) return err('payment_id is required', 400, 'VALIDATION_ERROR');
        const { error } = await supabase.rpc('manual_match_bank_line' as never, {
          p_line_id:    lineId,
          p_payment_id: payment_id,
          p_notes:      notes ?? null,
          p_actor_id:   user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'reconciliation/bank/lines/match');
          if (mapped) return mapped;
          throw error;
        }
        return json({ ok: true });
      }

      // POST /reconciliation/bank/lines/:id/unmatch
      if (req.method === 'POST' && lineId && seg4 === 'unmatch') {
        if (!hasPerm(user, 'finance:reconciliation:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const { error } = await supabase.rpc('unmatch_bank_line' as never, {
          p_line_id:  lineId,
          p_actor_id: user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'reconciliation/bank/lines/unmatch');
          if (mapped) return mapped;
          throw error;
        }
        return json({ ok: true });
      }
    }

    // ── /reconciliation/ar ───────────────────────────────────────────────────

    if (seg1 === 'ar' && req.method === 'POST') {
      if (!hasPerm(user, 'finance:reconciliation:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json().catch(() => ({}));
      const { period_id } = body;
      if (!period_id || !UUID_RE.test(period_id)) return err('period_id is required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('reconcile_accounts_receivable' as never, {
        p_period_id: period_id,
        p_actor_id:  user.id,
      });
      if (error) {
        const mapped = handlePgError(error, 'reconciliation/ar');
        if (mapped) return mapped;
        throw error;
      }
      return json({ reconciliation_run_id: data }, 201);
    }

    // ── /reconciliation/vat ──────────────────────────────────────────────────

    if (seg1 === 'vat' && req.method === 'POST') {
      if (!hasPerm(user, 'finance:reconciliation:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json().catch(() => ({}));
      const { period_id, vat_period_id } = body;
      if (!period_id || !UUID_RE.test(period_id)) return err('period_id is required', 400, 'VALIDATION_ERROR');
      if (!vat_period_id || !UUID_RE.test(vat_period_id)) return err('vat_period_id is required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('reconcile_vat_period' as never, {
        p_period_id:     period_id,
        p_vat_period_id: vat_period_id,
        p_actor_id:      user.id,
      });
      if (error) {
        const mapped = handlePgError(error, 'reconciliation/vat');
        if (mapped) return mapped;
        throw error;
      }
      return json({ reconciliation_run_id: data }, 201);
    }

    // ── /reconciliation/deferred ─────────────────────────────────────────────

    if (seg1 === 'deferred' && req.method === 'POST') {
      if (!hasPerm(user, 'finance:reconciliation:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json().catch(() => ({}));
      const { period_id } = body;
      if (!period_id || !UUID_RE.test(period_id)) return err('period_id is required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('reconcile_deferred_revenue' as never, {
        p_period_id: period_id,
        p_actor_id:  user.id,
      });
      if (error) {
        const mapped = handlePgError(error, 'reconciliation/deferred');
        if (mapped) return mapped;
        throw error;
      }
      return json({ reconciliation_run_id: data }, 201);
    }

    // ── /reconciliation/runs ─────────────────────────────────────────────────

    if (seg1 === 'runs') {
      const runId = seg2 && UUID_RE.test(seg2) ? seg2 : null;

      // GET /reconciliation/runs/:id/items
      if (req.method === 'GET' && runId && seg3 === 'items') {
        if (!hasPerm(user, 'finance:reconciliation:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('reconciliation_items' as never)
          .select('*')
          .eq('organization_id', orgId)
          .eq('run_id', runId)
          .order('matched_at', { ascending: true });
        if (error) throw error;
        return json({ data: data ?? [] });
      }

      // GET /reconciliation/runs/:id
      if (req.method === 'GET' && runId) {
        if (!hasPerm(user, 'finance:reconciliation:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('reconciliation_runs' as never)
          .select('*')
          .eq('id', runId)
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return err('Reconciliation run not found', 404, 'NOT_FOUND');
        return json(data);
      }

      // GET /reconciliation/runs (list by period)
      if (req.method === 'GET' && !runId) {
        if (!hasPerm(user, 'finance:reconciliation:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const periodId = url.searchParams.get('period_id');
        if (!periodId) return err('period_id query param is required', 400, 'VALIDATION_ERROR');
        const { data, error } = await supabase
          .from('reconciliation_runs' as never)
          .select('*')
          .eq('organization_id', orgId)
          .eq('financial_period_id', periodId)
          .order('started_at', { ascending: false });
        if (error) throw error;
        return json({ data: data ?? [] });
      }
    }

    // ── /reconciliation/report ───────────────────────────────────────────────

    if (seg1 === 'report' && req.method === 'GET') {
      if (!hasPerm(user, 'finance:reconciliation:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const periodId = url.searchParams.get('period_id');
      if (!periodId || !UUID_RE.test(periodId)) return err('period_id query param is required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('generate_reconciliation_report' as never, {
        p_period_id: periodId,
        p_actor_id:  user.id,
      });
      if (error) {
        const mapped = handlePgError(error, 'reconciliation/report');
        if (mapped) return mapped;
        throw error;
      }
      return json(data);
    }

    return err('Not Found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[reconciliation]', msg);
    return err('Internal server error', 500, 'INTERNAL_ERROR');
  }
});
