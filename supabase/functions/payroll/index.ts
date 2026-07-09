/**
 * payroll — Payroll journal engine, tax remittance, and VAT clearing.
 *
 * Routes:
 *   POST /payroll/runs                           — create payroll run
 *   GET  /payroll/runs                           — list payroll runs
 *   GET  /payroll/runs/:id                       — get payroll run
 *   GET  /payroll/runs/:id/entries               — list entries for a run
 *   POST /payroll/runs/:id/entries               — add/upsert payroll entry
 *   POST /payroll/runs/:id/post                  — post payroll journal (DR 7010 / CR 2940+2710+2731)
 *   POST /payroll/runs/:id/salary-payment        — post salary payment (DR 2940 / CR 1930)
 *   POST /payroll/runs/:id/reverse               — reverse a posted run
 *
 *   POST /payroll/tax-remittances                — create tax remittance
 *   GET  /payroll/tax-remittances                — list tax remittances
 *   GET  /payroll/tax-remittances/:id            — get tax remittance
 *   POST /payroll/tax-remittances/:id/clear      — post tax clearing journal (DR 2710+2731 / CR 1630)
 *   POST /payroll/tax-remittances/:id/pay        — post tax payment journal (DR 1630 / CR 1930)
 *   POST /payroll/tax-remittances/:id/complete   — mark remittance completed
 *
 *   POST /payroll/vat-clearings                  — create VAT clearing run
 *   GET  /payroll/vat-clearings                  — list VAT clearing runs
 *   GET  /payroll/vat-clearings/:id              — get VAT clearing run
 *   POST /payroll/vat-clearings/:id/clear        — post VAT clearing journal
 *   POST /payroll/vat-clearings/:id/pay          — post VAT payment journal
 *
 *   POST /payroll/opening-balances               — post opening balance entry
 *   POST /payroll/opening-balances/validate      — validate opening balances
 *   POST /payroll/year-end/profit-transfer       — post year-end profit transfer (2099 → 2091)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse } from '../_shared/errors.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code: string): Response {
  return buildErrorResponse(ctx, status, code, message);
}
function hasPerm(ctx: EdgeRequestContext, perm: string): boolean {
  return ctx.permissions.includes(perm);
}

interface PathInfo {
  seg1: string | null; // 'runs' | 'tax-remittances' | 'vat-clearings' | 'opening-balances' | 'year-end'
  seg2: string | null; // :id or 'validate' or 'profit-transfer'
  seg3: string | null; // 'entries' | 'post' | 'salary-payment' | 'reverse' | 'clear' | 'pay' | 'complete'
}

function parsePath(req: Request): PathInfo {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'payroll');
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

  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  const orgId = ctx.organizationId;
  if (!orgId) return err(ctx, 'No organization context', 403, 'NO_ORG_CONTEXT');

  const method = req.method.toUpperCase();
  const { seg1, seg2, seg3 } = parsePath(req);

  try {
    // ── Payroll runs ──────────────────────────────────────────────────────────
    if (seg1 === 'runs') {
      // POST /payroll/runs
      if (method === 'POST' && seg2 === null) {
        if (!hasPerm(ctx, 'finance:payroll:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('create_payroll_run', {
          p_org_id:               orgId,
          p_financial_period_id:  body.financial_period_id ?? null,
          p_pay_period_start:     body.pay_period_start,
          p_pay_period_end:       body.pay_period_end,
          p_pay_date:             body.pay_date,
          p_run_type:             body.run_type ?? 'regular',
          p_correction_of_run_id: body.correction_of_run_id ?? null,
          p_notes:                body.notes ?? null,
          p_actor_id:             ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ id: data }, 201);
      }

      // GET /payroll/runs
      if (method === 'GET' && seg2 === null) {
        if (!hasPerm(ctx, 'finance:payroll:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const url    = new URL(req.url);
        const status = url.searchParams.get('status');
        const period = url.searchParams.get('financial_period_id');
        let q = (client as any).from('payroll_runs').select('*', { count: 'exact' })
          .eq('organization_id', orgId)
          .order('pay_date', { ascending: false });
        if (status) q = q.eq('status', status);
        if (period) q = q.eq('financial_period_id', period);
        const { data, error, count } = await q;
        if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
        return json({ data, total: count ?? 0 });
      }

      // GET /payroll/runs/:id
      if (method === 'GET' && isUuid(seg2) && seg3 === null) {
        if (!hasPerm(ctx, 'finance:payroll:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).from('payroll_runs')
          .select('*').eq('id', seg2).eq('organization_id', orgId).maybeSingle();
        if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
        if (!data) return err(ctx, 'Not found', 404, 'NOT_FOUND');
        return json(data);
      }

      // GET /payroll/runs/:id/entries
      if (method === 'GET' && isUuid(seg2) && seg3 === 'entries') {
        if (!hasPerm(ctx, 'finance:payroll:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).from('payroll_entries')
          .select('*').eq('payroll_run_id', seg2).eq('organization_id', orgId)
          .order('employee_id');
        if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
        return json({ data, total: data?.length ?? 0 });
      }

      // POST /payroll/runs/:id/entries
      if (method === 'POST' && isUuid(seg2) && seg3 === 'entries') {
        if (!hasPerm(ctx, 'finance:payroll:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('add_payroll_entry', {
          p_run_id:                seg2,
          p_employee_id:           body.employee_id,
          p_gross_salary:          body.gross_salary,
          p_withheld_tax:          body.withheld_tax ?? 0,
          p_employer_contrib_rate: body.employer_contrib_rate ?? 0.3142,
          p_pension_amount:        body.pension_amount ?? 0,
          p_benefits_amount:       body.benefits_amount ?? 0,
          p_instructor_id:         body.instructor_id ?? null,
          p_notes:                 body.notes ?? null,
          p_actor_id:              ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ id: data }, 201);
      }

      // POST /payroll/runs/:id/post
      if (method === 'POST' && isUuid(seg2) && seg3 === 'post') {
        if (!hasPerm(ctx, 'finance:payroll:post')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).rpc('post_payroll_journal', {
          p_run_id: seg2, p_actor_id: ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ journal_entry_id: data });
      }

      // POST /payroll/runs/:id/salary-payment
      if (method === 'POST' && isUuid(seg2) && seg3 === 'salary-payment') {
        if (!hasPerm(ctx, 'finance:payroll:post')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('post_salary_payment', {
          p_run_id:       seg2,
          p_payment_date: body.payment_date,
          p_bank_account: body.bank_account ?? '1930',
          p_actor_id:     ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ payment_entry_id: data });
      }

      // POST /payroll/runs/:id/reverse
      if (method === 'POST' && isUuid(seg2) && seg3 === 'reverse') {
        if (!hasPerm(ctx, 'finance:payroll:post')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('reverse_payroll_run', {
          p_run_id: seg2, p_reason: body.reason, p_actor_id: ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ reversal_entry_id: data });
      }
    }

    // ── Tax remittances ───────────────────────────────────────────────────────
    if (seg1 === 'tax-remittances') {
      // POST /payroll/tax-remittances
      if (method === 'POST' && seg2 === null) {
        if (!hasPerm(ctx, 'finance:tax:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('create_tax_remittance', {
          p_org_id:                   orgId,
          p_financial_period_id:      body.financial_period_id ?? null,
          p_payroll_run_id:           body.payroll_run_id ?? null,
          p_declaration_period_start: body.declaration_period_start ?? null,
          p_declaration_period_end:   body.declaration_period_end ?? null,
          p_due_date:                 body.due_date ?? null,
          p_withheld_tax_amount:      body.withheld_tax_amount,
          p_employer_contrib_amount:  body.employer_contrib_amount,
          p_notes:                    body.notes ?? null,
          p_actor_id:                 ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ id: data }, 201);
      }

      // GET /payroll/tax-remittances
      if (method === 'GET' && seg2 === null) {
        if (!hasPerm(ctx, 'finance:tax:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const url    = new URL(req.url);
        const status = url.searchParams.get('status');
        let q = (client as any).from('tax_remittances').select('*', { count: 'exact' })
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });
        if (status) q = q.eq('status', status);
        const { data, error, count } = await q;
        if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
        return json({ data, total: count ?? 0 });
      }

      // GET /payroll/tax-remittances/:id
      if (method === 'GET' && isUuid(seg2) && seg3 === null) {
        if (!hasPerm(ctx, 'finance:tax:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).from('tax_remittances')
          .select('*').eq('id', seg2).eq('organization_id', orgId).maybeSingle();
        if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
        if (!data) return err(ctx, 'Not found', 404, 'NOT_FOUND');
        return json(data);
      }

      // POST /payroll/tax-remittances/:id/clear
      if (method === 'POST' && isUuid(seg2) && seg3 === 'clear') {
        if (!hasPerm(ctx, 'finance:tax:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).rpc('post_tax_clearing_journal', {
          p_remittance_id: seg2, p_actor_id: ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ clearing_entry_id: data });
      }

      // POST /payroll/tax-remittances/:id/pay
      if (method === 'POST' && isUuid(seg2) && seg3 === 'pay') {
        if (!hasPerm(ctx, 'finance:tax:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('post_tax_payment_journal', {
          p_remittance_id: seg2,
          p_payment_date:  body.payment_date,
          p_reference:     body.reference ?? null,
          p_actor_id:      ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ payment_entry_id: data });
      }

      // POST /payroll/tax-remittances/:id/complete
      if (method === 'POST' && isUuid(seg2) && seg3 === 'complete') {
        if (!hasPerm(ctx, 'finance:tax:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { error } = await (client as any).rpc('complete_tax_remittance', {
          p_remittance_id: seg2, p_actor_id: ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ success: true });
      }
    }

    // ── VAT clearings ─────────────────────────────────────────────────────────
    if (seg1 === 'vat-clearings') {
      // POST /payroll/vat-clearings
      if (method === 'POST' && seg2 === null) {
        if (!hasPerm(ctx, 'finance:tax:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('create_vat_clearing_run', {
          p_org_id:              orgId,
          p_financial_period_id: body.financial_period_id,
          p_vat_period_id:       body.vat_period_id ?? null,
          p_run_date:            body.run_date ?? null,
          p_notes:               body.notes ?? null,
          p_actor_id:            ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ id: data }, 201);
      }

      // GET /payroll/vat-clearings
      if (method === 'GET' && seg2 === null) {
        if (!hasPerm(ctx, 'finance:tax:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const url    = new URL(req.url);
        const period = url.searchParams.get('financial_period_id');
        let q = (client as any).from('vat_clearing_runs').select('*', { count: 'exact' })
          .eq('organization_id', orgId)
          .order('run_date', { ascending: false });
        if (period) q = q.eq('financial_period_id', period);
        const { data, error, count } = await q;
        if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
        return json({ data, total: count ?? 0 });
      }

      // GET /payroll/vat-clearings/:id
      if (method === 'GET' && isUuid(seg2) && seg3 === null) {
        if (!hasPerm(ctx, 'finance:tax:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).from('vat_clearing_runs')
          .select('*').eq('id', seg2).eq('organization_id', orgId).maybeSingle();
        if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
        if (!data) return err(ctx, 'Not found', 404, 'NOT_FOUND');
        return json(data);
      }

      // POST /payroll/vat-clearings/:id/clear
      if (method === 'POST' && isUuid(seg2) && seg3 === 'clear') {
        if (!hasPerm(ctx, 'finance:tax:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await (client as any).rpc('post_vat_clearing_journal', {
          p_run_id: seg2, p_actor_id: ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ clearing_entry_id: data });
      }

      // POST /payroll/vat-clearings/:id/pay
      if (method === 'POST' && isUuid(seg2) && seg3 === 'pay') {
        if (!hasPerm(ctx, 'finance:tax:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('post_vat_payment_journal', {
          p_run_id:       seg2,
          p_payment_date: body.payment_date,
          p_actor_id:     ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ payment_entry_id: data });
      }
    }

    // ── Opening balances ──────────────────────────────────────────────────────
    if (seg1 === 'opening-balances') {
      // POST /payroll/opening-balances (post OB entry)
      if (method === 'POST' && seg2 === null) {
        if (!hasPerm(ctx, 'finance:payroll:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('post_opening_balance_entry', {
          p_org_id:    orgId,
          p_period_id: body.period_id,
          p_balances:  body.balances,
          p_notes:     body.notes ?? null,
          p_actor_id:  ctx.actorId,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json({ journal_entry_id: data }, 201);
      }

      // POST /payroll/opening-balances/validate
      if (method === 'POST' && seg2 === 'validate') {
        if (!hasPerm(ctx, 'finance:payroll:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json();
        const { data, error } = await (client as any).rpc('validate_opening_balances', {
          p_org_id:    orgId,
          p_period_id: body.period_id,
        });
        if (error) return err(ctx, error.message, 400, error.code);
        return json(data);
      }
    }

    // ── Year-end operations ───────────────────────────────────────────────────
    if (seg1 === 'year-end' && seg2 === 'profit-transfer' && method === 'POST') {
      if (!hasPerm(ctx, 'finance:payroll:post')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
      const body = await req.json();
      const { data, error } = await (client as any).rpc('post_year_end_profit_transfer', {
        p_org_id:          orgId,
        p_new_period_id:   body.new_period_id,
        p_prior_period_id: body.prior_period_id,
        p_actor_id:        ctx.actorId,
      });
      if (error) return err(ctx, error.message, 400, error.code);
      return json({ journal_entry_id: data });
    }

    return err(ctx, 'Not found', 404, 'NOT_FOUND');
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return err(ctx, message, 500, 'INTERNAL_ERROR');
  }
}));
