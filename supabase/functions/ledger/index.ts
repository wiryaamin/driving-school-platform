/**
 * ledger — Double-entry accounting ledger operations.
 *
 * Routes:
 *   GET  /ledger/journal-entries              — list journal entries for a period
 *   GET  /ledger/journal-entries/:id          — get single entry with lines
 *   POST /ledger/journal-entries/:id/reverse  — reverse a posted entry
 *   POST /ledger/journal-entries/:id/correct  — correct a posted entry
 *   GET  /ledger/account-balances             — get account balances for a period
 *   GET  /ledger/trial-balance                — trial balance for a period
 *   POST /ledger/post-invoice                 — post invoice journal entry
 *   POST /ledger/post-payment                 — post payment journal entry
 *   POST /ledger/post-void                    — post void/reversal journal entry
 *   POST /ledger/deferred/post                — post deferred revenue entry
 *   POST /ledger/deferred/recognize           — recognize lesson revenue
 *   POST /ledger/deferred/bulk-recognize      — bulk recognize deferred revenue
 *   GET  /ledger/deferred/:invoiceId          — get deferred schedule by invoice
 *   POST /ledger/sie4/generate                — generate SIE4 from ledger
 *   GET  /ledger/sie4                         — list ledger SIE4 exports
 *   GET  /ledger/sie4/:id                     — get ledger SIE4 export
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
}

function parsePath(req: Request): PathInfo {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'ledger');
  return {
    seg1: segments[fnIdx + 1] ?? null,
    seg2: segments[fnIdx + 2] ?? null,
    seg3: segments[fnIdx + 3] ?? null,
  };
}

function handlePgError(e: { message?: string }, prefix: string): Response | null {
  const msg = e.message ?? '';
  if (msg.includes('JOURNAL_NOT_FOUND'))       return err('Journal entry not found', 404, 'NOT_FOUND');
  if (msg.includes('JOURNAL_NOT_POSTED'))      return err('Entry is not posted', 409, 'CONFLICT');
  if (msg.includes('JOURNAL_ALREADY_REVERSED')) return err('Entry already reversed', 409, 'ALREADY_REVERSED');
  if (msg.includes('LEDGER_IMBALANCED'))       return err('Journal lines do not balance', 422, 'LEDGER_IMBALANCED');
  if (msg.includes('PERIOD_LOCKED'))           return err('Financial period is locked', 409, 'PERIOD_LOCKED');
  if (msg.includes('INVOICE_NOT_FOUND'))       return err('Invoice not found', 404, 'NOT_FOUND');
  if (msg.includes('PAYMENT_NOT_FOUND'))       return err('Payment not found', 404, 'NOT_FOUND');
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

  const { seg1, seg2, seg3 } = parsePath(req);
  const url = new URL(req.url);

  try {

    // ── /ledger/journal-entries ──────────────────────────────────────────────

    if (seg1 === 'journal-entries') {
      const entryId = seg2 && UUID_RE.test(seg2) ? seg2 : null;

      // POST /ledger/journal-entries/:id/reverse
      if (req.method === 'POST' && entryId && seg3 === 'reverse') {
        if (!hasPerm(user, 'finance:ledger:void')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { reversal_date, reason } = body;
        const { data, error } = await supabase.rpc('reverse_journal_entry' as never, {
          p_entry_id:       entryId,
          p_reversal_date:  reversal_date ?? null,
          p_reason:         reason        ?? null,
          p_actor_id:       user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'ledger/reverse');
          if (mapped) return mapped;
          throw error;
        }
        return json({ reversal_entry_id: data }, 201);
      }

      // POST /ledger/journal-entries/:id/correct
      if (req.method === 'POST' && entryId && seg3 === 'correct') {
        if (!hasPerm(user, 'finance:ledger:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { new_lines, reason, correction_date } = body;
        if (!Array.isArray(new_lines) || new_lines.length < 2) {
          return err('new_lines must be an array of at least 2 lines', 400, 'VALIDATION_ERROR');
        }
        const { data, error } = await supabase.rpc('correct_journal_entry' as never, {
          p_entry_id:         entryId,
          p_new_lines:        new_lines,
          p_reason:           reason          ?? null,
          p_correction_date:  correction_date ?? null,
          p_actor_id:         user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'ledger/correct');
          if (mapped) return mapped;
          throw error;
        }
        return json({ correction_entry_id: data }, 201);
      }

      // GET /ledger/journal-entries/:id
      if (req.method === 'GET' && entryId) {
        if (!hasPerm(user, 'finance:ledger:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data: entry, error: eErr } = await supabase
          .from('journal_entries' as never)
          .select('*')
          .eq('id', entryId)
          .eq('organization_id', orgId)
          .maybeSingle();
        if (eErr) throw eErr;
        if (!entry) return err('Journal entry not found', 404, 'NOT_FOUND');

        const { data: lines, error: lErr } = await supabase
          .from('journal_lines' as never)
          .select('*')
          .eq('organization_id', orgId)
          .eq('entry_id', entryId)
          .order('line_number', { ascending: true });
        if (lErr) throw lErr;

        return json({ ...entry, lines: lines ?? [] });
      }

      // GET /ledger/journal-entries
      if (req.method === 'GET' && !entryId) {
        if (!hasPerm(user, 'finance:ledger:read')) return err('Forbidden', 403, 'FORBIDDEN');
        const periodId  = url.searchParams.get('period_id');
        const entryType = url.searchParams.get('entry_type');
        const status    = url.searchParams.get('status');
        const page      = Math.max(1, parseInt(url.searchParams.get('page')    ?? '1',  10));
        const perPage   = Math.min(100, parseInt(url.searchParams.get('per_page') ?? '50', 10));

        if (!periodId) return err('period_id query param is required', 400, 'VALIDATION_ERROR');

        let q = supabase
          .from('journal_entries' as never)
          .select('*', { count: 'exact' })
          .eq('organization_id', orgId)
          .eq('financial_period_id', periodId);

        if (entryType) q = (q as never).eq('entry_type', entryType);
        if (status)    q = (q as never).eq('status', status);

        const { data, error, count } = await (q as never)
          .order('voucher_series', { ascending: true })
          .order('voucher_number', { ascending: true })
          .range((page - 1) * perPage, page * perPage - 1);

        if (error) throw error;
        return json({ data: data ?? [], total: count ?? 0, page, per_page: perPage });
      }
    }

    // ── /ledger/account-balances ──────────────────────────────────────────────

    if (seg1 === 'account-balances' && req.method === 'GET') {
      if (!hasPerm(user, 'finance:ledger:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const periodId = url.searchParams.get('period_id');
      if (!periodId) return err('period_id query param is required', 400, 'VALIDATION_ERROR');

      const { data, error } = await supabase
        .from('account_balances' as never)
        .select('*')
        .eq('organization_id', orgId)
        .eq('financial_period_id', periodId)
        .order('account_code', { ascending: true });

      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // ── /ledger/trial-balance ─────────────────────────────────────────────────

    if (seg1 === 'trial-balance' && req.method === 'GET') {
      if (!hasPerm(user, 'finance:ledger:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const periodId = url.searchParams.get('period_id');
      if (!periodId) return err('period_id query param is required', 400, 'VALIDATION_ERROR');

      const { data: rows, error } = await supabase
        .from('v_trial_balance' as never)
        .select('*')
        .eq('organization_id', orgId)
        .eq('financial_period_id', periodId)
        .order('account_code', { ascending: true });

      if (error) throw error;

      const typedRows = (rows ?? []) as Array<{
        debit_movement: number;
        credit_movement: number;
      }>;
      const totalDebit  = typedRows.reduce((s, r) => s + Number(r.debit_movement),  0);
      const totalCredit = typedRows.reduce((s, r) => s + Number(r.credit_movement), 0);

      return json({
        rows:          typedRows,
        total_debit:   totalDebit,
        total_credit:  totalCredit,
        is_balanced:   Math.abs(totalDebit - totalCredit) < 0.01,
      });
    }

    // ── /ledger/post-invoice ──────────────────────────────────────────────────

    if (seg1 === 'post-invoice' && req.method === 'POST') {
      if (!hasPerm(user, 'finance:ledger:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json().catch(() => ({}));
      const { invoice_id } = body;
      if (!invoice_id || !UUID_RE.test(invoice_id)) return err('invoice_id is required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('post_invoice_journal_entry' as never, {
        p_invoice_id: invoice_id,
        p_actor_id:   user.id,
      });
      if (error) {
        const mapped = handlePgError(error, 'ledger/post-invoice');
        if (mapped) return mapped;
        throw error;
      }
      return json({ journal_entry_id: data }, 201);
    }

    // ── /ledger/post-payment ──────────────────────────────────────────────────

    if (seg1 === 'post-payment' && req.method === 'POST') {
      if (!hasPerm(user, 'finance:ledger:manage')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json().catch(() => ({}));
      const { payment_id } = body;
      if (!payment_id || !UUID_RE.test(payment_id)) return err('payment_id is required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('post_payment_journal_entry' as never, {
        p_payment_id: payment_id,
        p_actor_id:   user.id,
      });
      if (error) {
        const mapped = handlePgError(error, 'ledger/post-payment');
        if (mapped) return mapped;
        throw error;
      }
      return json({ journal_entry_id: data }, 201);
    }

    // ── /ledger/post-void ────────────────────────────────────────────────────

    if (seg1 === 'post-void' && req.method === 'POST') {
      if (!hasPerm(user, 'finance:ledger:void')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json().catch(() => ({}));
      const { invoice_id } = body;
      if (!invoice_id || !UUID_RE.test(invoice_id)) return err('invoice_id is required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('post_void_journal_entry' as never, {
        p_invoice_id: invoice_id,
        p_actor_id:   user.id,
      });
      if (error) {
        const mapped = handlePgError(error, 'ledger/post-void');
        if (mapped) return mapped;
        throw error;
      }
      return json({ journal_entry_id: data }, 201);
    }

    // ── /ledger/deferred ─────────────────────────────────────────────────────

    if (seg1 === 'deferred') {

      // POST /ledger/deferred/post
      if (req.method === 'POST' && seg2 === 'post') {
        if (!hasPerm(user, 'finance:revenue:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { invoice_id } = body;
        if (!invoice_id || !UUID_RE.test(invoice_id)) return err('invoice_id is required', 400, 'VALIDATION_ERROR');
        const { data, error } = await supabase.rpc('post_deferred_revenue_entry' as never, {
          p_invoice_id: invoice_id,
          p_actor_id:   user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'ledger/deferred/post');
          if (mapped) return mapped;
          throw error;
        }
        return json({ journal_entry_id: data }, 201);
      }

      // POST /ledger/deferred/recognize
      if (req.method === 'POST' && seg2 === 'recognize') {
        if (!hasPerm(user, 'finance:revenue:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { booking_id } = body;
        if (!booking_id || !UUID_RE.test(booking_id)) return err('booking_id is required', 400, 'VALIDATION_ERROR');
        const { data, error } = await supabase.rpc('recognize_lesson_revenue' as never, {
          p_booking_id: booking_id,
          p_actor_id:   user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'ledger/deferred/recognize');
          if (mapped) return mapped;
          throw error;
        }
        return json({ journal_entry_id: data ?? null });
      }

      // POST /ledger/deferred/bulk-recognize
      if (req.method === 'POST' && seg2 === 'bulk-recognize') {
        if (!hasPerm(user, 'finance:revenue:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { as_of_date } = body;
        const { data, error } = await supabase.rpc('bulk_recognize_revenue' as never, {
          p_org_id:     orgId,
          p_as_of_date: as_of_date ?? null,
          p_actor_id:   user.id,
        });
        if (error) throw error;
        return json({ count: data ?? 0 });
      }

      // GET /ledger/deferred/:invoiceId
      if (req.method === 'GET' && seg2 && UUID_RE.test(seg2)) {
        if (!hasPerm(user, 'finance:revenue:manage')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data: schedule, error } = await supabase
          .from('deferred_revenue_schedules' as never)
          .select('*')
          .eq('organization_id', orgId)
          .eq('invoice_id', seg2)
          .maybeSingle();
        if (error) throw error;
        if (!schedule) return err('Deferred revenue schedule not found', 404, 'NOT_FOUND');
        return json(schedule);
      }
    }

    // ── /ledger/sie4 ─────────────────────────────────────────────────────────

    if (seg1 === 'sie4') {
      const exportId = seg2 && UUID_RE.test(seg2) ? seg2 : null;

      // POST /ledger/sie4/generate
      if (req.method === 'POST' && seg2 === 'generate') {
        if (!hasPerm(user, 'finance:ledger:export')) return err('Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { period_id } = body;
        if (!period_id || !UUID_RE.test(period_id)) return err('period_id is required', 400, 'VALIDATION_ERROR');
        const { data, error } = await supabase.rpc('generate_sie4_from_ledger' as never, {
          p_org_id:    orgId,
          p_period_id: period_id,
          p_actor_id:  user.id,
        });
        if (error) {
          const mapped = handlePgError(error, 'ledger/sie4/generate');
          if (mapped) return mapped;
          throw error;
        }
        return json({ ledger_sie4_export_id: data }, 201);
      }

      // GET /ledger/sie4/:id
      if (req.method === 'GET' && exportId) {
        if (!hasPerm(user, 'finance:ledger:export')) return err('Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('ledger_sie4_exports' as never)
          .select('*')
          .eq('id', exportId)
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return err('Ledger SIE4 export not found', 404, 'NOT_FOUND');
        return json(data);
      }

      // GET /ledger/sie4
      if (req.method === 'GET' && !exportId && seg2 !== 'generate') {
        if (!hasPerm(user, 'finance:ledger:export')) return err('Forbidden', 403, 'FORBIDDEN');
        const limit = Math.min(50, parseInt(url.searchParams.get('limit') ?? '10', 10));
        const { data, error } = await supabase
          .from('ledger_sie4_exports' as never)
          .select('id, organization_id, financial_period_id, from_date, to_date, content_hash, entry_count, account_count, generated_at, generated_by')
          .eq('organization_id', orgId)
          .order('generated_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return json({ data: data ?? [] });
      }
    }

    return err('Not Found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ledger]', msg);
    return err('Internal server error', 500, 'INTERNAL_ERROR');
  }
});
