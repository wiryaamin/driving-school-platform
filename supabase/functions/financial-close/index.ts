/**
 * financial-close — Period close operations, fiscal year management, and audit.
 *
 * Routes:
 *   GET  /financial-close/periods/readiness          — period close readiness dashboard
 *   POST /financial-close/periods/:id/validate       — validate period for close
 *   POST /financial-close/periods/:id/soft-close     — soft-close a period
 *   POST /financial-close/periods/:id/reopen         — reopen a soft-closed period
 *   POST /financial-close/periods/:id/hard-close     — hard-close (lock) a period
 *   POST /financial-close/periods/:id/amendment      — post amendment journal
 *   GET  /financial-close/periods/:id/snapshots      — list audit snapshots
 *   POST /financial-close/periods/:id/snapshot       — capture manual audit snapshot
 *   GET  /financial-close/snapshots/:id              — get single snapshot
 *   POST /financial-close/snapshots/:id/verify       — verify snapshot hash
 *   POST /financial-close/periods/:id/consistency    — run consistency check
 *   GET  /financial-close/periods/:id/checks         — list consistency checks
 *   GET  /financial-close/fiscal-years               — list fiscal years overview
 *   POST /financial-close/fiscal-years               — create fiscal year
 *   GET  /financial-close/fiscal-years/:id           — get fiscal year
 *   POST /financial-close/fiscal-years/:id/assign-period  — assign period to fiscal year
 *   POST /financial-close/fiscal-years/:id/validate  — validate fiscal year for close
 *   POST /financial-close/fiscal-years/:id/retained-earnings — post retained earnings
 *   POST /financial-close/fiscal-years/:id/close     — close fiscal year
 *   POST /financial-close/fiscal-years/:id/rollover  — rollover opening balances
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
function preCtxUnauthorized(req: Request): Response {
  const correlationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
  const requestId      = crypto.randomUUID();
  return new Response(
    JSON.stringify({
      code: 'UNAUTHORIZED', message: 'Missing Authorization header',
      trace_id: correlationId, request_id: requestId, version: 1,
    }),
    { status: 401, headers: { ...JSON_CT, 'X-Correlation-ID': correlationId, 'X-Request-ID': requestId } },
  );
}
function hasPerm(ctx: EdgeRequestContext, perm: string): boolean {
  return ctx.permissions.includes(perm);
}

interface PathInfo {
  seg1: string | null;
  seg2: string | null;
  seg3: string | null;
  seg4: string | null;
}

function parsePath(req: Request): PathInfo {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'financial-close');
  return {
    seg1: segments[fnIdx + 1] ?? null,
    seg2: segments[fnIdx + 2] ?? null,
    seg3: segments[fnIdx + 3] ?? null,
    seg4: segments[fnIdx + 4] ?? null,
  };
}

function handlePgError(ctx: EdgeRequestContext, e: { message?: string }, prefix: string): Response | null {
  const msg = e.message ?? '';
  if (msg.includes('PERIOD_NOT_FOUND'))            return err(ctx, 'Financial period not found', 404, 'NOT_FOUND');
  if (msg.includes('PERIOD_NOT_OPEN'))             return err(ctx, 'Period must be open to soft-close', 409, 'PERIOD_NOT_OPEN');
  if (msg.includes('PERIOD_NOT_CLOSED'))           return err(ctx, 'Period must be soft-closed first', 409, 'PERIOD_NOT_CLOSED');
  if (msg.includes('PERIOD_NOT_SOFT_CLOSED'))      return err(ctx, 'Period must be soft-closed', 409, 'PERIOD_NOT_SOFT_CLOSED');
  if (msg.includes('PERIOD_HARD_CLOSED') ||
      msg.includes('PERIOD_ALREADY_LOCKED'))       return err(ctx, 'Period is hard-closed (locked)', 409, 'PERIOD_LOCKED');
  if (msg.includes('PERIOD_CLOSE_BLOCKED'))        return err(ctx, 'Period close blocked by validation failures', 422, 'CLOSE_BLOCKED');
  if (msg.includes('PERIOD_HARD_CLOSE_BLOCKED'))   return err(ctx, 'Hard close blocked — all checks must pass', 422, 'HARD_CLOSE_BLOCKED');
  if (msg.includes('PERIOD_REOPEN_REASON_REQUIRED')) return err(ctx, 'Reason is required to reopen a period', 400, 'REASON_REQUIRED');
  if (msg.includes('AMENDMENT_REASON_REQUIRED'))   return err(ctx, 'Reason is required for amendment journals', 400, 'REASON_REQUIRED');
  if (msg.includes('SNAPSHOT_NOT_FOUND'))          return err(ctx, 'Audit snapshot not found', 404, 'NOT_FOUND');
  if (msg.includes('FISCAL_YEAR_NOT_FOUND'))       return err(ctx, 'Fiscal year not found', 404, 'NOT_FOUND');
  if (msg.includes('FISCAL_YEAR_ALREADY_CLOSED'))  return err(ctx, 'Fiscal year is already closed', 409, 'ALREADY_CLOSED');
  if (msg.includes('FISCAL_YEAR_CLOSE_BLOCKED'))   return err(ctx, 'Fiscal year close blocked by validation failures', 422, 'CLOSE_BLOCKED');
  if (msg.includes('FISCAL_YEAR_NO_INCOME_ACCOUNTS')) return err(ctx, 'No income statement accounts with balances', 422, 'NO_INCOME_ACCOUNTS');
  if (msg.includes('ROLLOVER_DATE_CONFLICT'))      return err(ctx, 'Target period must start after year-end period ends', 422, 'DATE_CONFLICT');
  if (msg.includes('LEDGER_IMBALANCED'))           return err(ctx, 'Journal lines do not balance', 422, 'LEDGER_IMBALANCED');
  console.error(`[${prefix}]`, msg);
  return null;
}

Deno.serve((req: Request) => serveCors(req, async () => {
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
  if (!authHeader) return preCtxUnauthorized(req);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')      ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

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
  if (!orgId) return err(ctx, 'No organization context', 403, 'NO_ORG');

  const { seg1, seg2, seg3, seg4 } = parsePath(req);
  const url = new URL(req.url);

  try {

    // ── /financial-close/periods ──────────────────────────────────────────────

    if (seg1 === 'periods') {

      // GET /financial-close/periods/readiness
      if (req.method === 'GET' && seg2 === 'readiness') {
        if (!hasPerm(ctx, 'finance:close:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('v_period_close_readiness' as never)
          .select('*')
          .eq('organization_id', orgId)
          .order('period_start', { ascending: false });
        if (error) throw error;
        return json({ data: data ?? [] });
      }

      const periodId = seg2 && UUID_RE.test(seg2) ? seg2 : null;
      if (!periodId) return err(ctx, 'Not Found', 404, 'NOT_FOUND');

      // POST /financial-close/periods/:id/validate
      if (req.method === 'POST' && seg3 === 'validate') {
        if (!hasPerm(ctx, 'finance:close:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase.rpc('validate_period_for_close' as never, {
          p_period_id: periodId,
          p_actor_id:  ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/periods/validate');
          if (mapped) return mapped;
          throw error;
        }
        return json(data);
      }

      // POST /financial-close/periods/:id/soft-close
      if (req.method === 'POST' && seg3 === 'soft-close') {
        if (!hasPerm(ctx, 'finance:close:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { error } = await supabase.rpc('soft_close_period' as never, {
          p_period_id: periodId,
          p_notes:     body.notes ?? null,
          p_actor_id:  ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/periods/soft-close');
          if (mapped) return mapped;
          throw error;
        }
        return json({ ok: true });
      }

      // POST /financial-close/periods/:id/reopen
      if (req.method === 'POST' && seg3 === 'reopen') {
        if (!hasPerm(ctx, 'finance:close:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        if (!body.reason) return err(ctx, 'reason is required', 400, 'VALIDATION_ERROR');
        const { error } = await supabase.rpc('reopen_soft_closed_period' as never, {
          p_period_id: periodId,
          p_reason:    body.reason,
          p_actor_id:  ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/periods/reopen');
          if (mapped) return mapped;
          throw error;
        }
        return json({ ok: true });
      }

      // POST /financial-close/periods/:id/hard-close
      if (req.method === 'POST' && seg3 === 'hard-close') {
        if (!hasPerm(ctx, 'finance:close:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { error } = await supabase.rpc('hard_close_period' as never, {
          p_period_id: periodId,
          p_notes:     body.notes ?? null,
          p_actor_id:  ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/periods/hard-close');
          if (mapped) return mapped;
          throw error;
        }
        return json({ ok: true });
      }

      // POST /financial-close/periods/:id/amendment
      if (req.method === 'POST' && seg3 === 'amendment') {
        if (!hasPerm(ctx, 'finance:close:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { lines, reason } = body;
        if (!reason) return err(ctx, 'reason is required', 400, 'VALIDATION_ERROR');
        if (!Array.isArray(lines) || lines.length < 2) {
          return err(ctx, 'lines must be an array of at least 2 entries', 400, 'VALIDATION_ERROR');
        }
        const { data, error } = await supabase.rpc('post_amendment_journal' as never, {
          p_period_id: periodId,
          p_lines:     lines,
          p_reason:    reason,
          p_actor_id:  ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/periods/amendment');
          if (mapped) return mapped;
          throw error;
        }
        return json({ journal_entry_id: data }, 201);
      }

      // GET /financial-close/periods/:id/snapshots
      if (req.method === 'GET' && seg3 === 'snapshots') {
        if (!hasPerm(ctx, 'finance:close:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('period_audit_snapshots' as never)
          .select('*')
          .eq('organization_id', orgId)
          .eq('financial_period_id', periodId)
          .order('captured_at', { ascending: false });
        if (error) throw error;
        return json({ data: data ?? [] });
      }

      // POST /financial-close/periods/:id/snapshot
      if (req.method === 'POST' && seg3 === 'snapshot') {
        if (!hasPerm(ctx, 'finance:close:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { snapshot_type = 'manual', notes } = body;
        const { data, error } = await supabase.rpc('capture_period_audit_snapshot' as never, {
          p_period_id:     periodId,
          p_snapshot_type: snapshot_type,
          p_notes:         notes ?? null,
          p_actor_id:      ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/periods/snapshot');
          if (mapped) return mapped;
          throw error;
        }
        return json({ snapshot_id: data }, 201);
      }

      // POST /financial-close/periods/:id/consistency
      if (req.method === 'POST' && seg3 === 'consistency') {
        if (!hasPerm(ctx, 'finance:close:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { check_type = 'manual' } = body;
        const { data, error } = await supabase.rpc('run_ledger_consistency_check' as never, {
          p_period_id:  periodId,
          p_check_type: check_type,
          p_actor_id:   ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/periods/consistency');
          if (mapped) return mapped;
          throw error;
        }
        return json({ check_id: data }, 201);
      }

      // GET /financial-close/periods/:id/checks
      if (req.method === 'GET' && seg3 === 'checks') {
        if (!hasPerm(ctx, 'finance:close:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const limit = Math.min(50, parseInt(url.searchParams.get('limit') ?? '10', 10));
        const { data, error } = await supabase
          .from('ledger_consistency_checks' as never)
          .select('*')
          .eq('organization_id', orgId)
          .eq('financial_period_id', periodId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return json({ data: data ?? [] });
      }
    }

    // ── /financial-close/snapshots ────────────────────────────────────────────

    if (seg1 === 'snapshots') {
      const snapshotId = seg2 && UUID_RE.test(seg2) ? seg2 : null;
      if (!snapshotId) return err(ctx, 'Not Found', 404, 'NOT_FOUND');

      // GET /financial-close/snapshots/:id
      if (req.method === 'GET' && !seg3) {
        if (!hasPerm(ctx, 'finance:close:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('period_audit_snapshots' as never)
          .select('*')
          .eq('id', snapshotId)
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return err(ctx, 'Audit snapshot not found', 404, 'NOT_FOUND');
        return json(data);
      }

      // POST /financial-close/snapshots/:id/verify
      if (req.method === 'POST' && seg3 === 'verify') {
        if (!hasPerm(ctx, 'finance:close:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase.rpc('verify_period_audit_snapshot' as never, {
          p_snapshot_id: snapshotId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/snapshots/verify');
          if (mapped) return mapped;
          throw error;
        }
        return json(data);
      }
    }

    // ── /financial-close/fiscal-years ─────────────────────────────────────────

    if (seg1 === 'fiscal-years') {
      const fyId = seg2 && UUID_RE.test(seg2) ? seg2 : null;

      // GET /financial-close/fiscal-years (overview)
      if (req.method === 'GET' && !fyId) {
        if (!hasPerm(ctx, 'finance:close:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('v_fiscal_year_overview' as never)
          .select('*')
          .eq('organization_id', orgId)
          .order('year_number', { ascending: false });
        if (error) throw error;
        return json({ data: data ?? [] });
      }

      // POST /financial-close/fiscal-years
      if (req.method === 'POST' && !fyId) {
        if (!hasPerm(ctx, 'finance:year_end:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { year_number, year_start, year_end, notes } = body;
        if (!year_number || !year_start || !year_end) {
          return err(ctx, 'year_number, year_start, year_end are required', 400, 'VALIDATION_ERROR');
        }
        const { data, error } = await supabase.rpc('create_fiscal_year' as never, {
          p_org_id:       orgId,
          p_year_number:  year_number,
          p_year_start:   year_start,
          p_year_end:     year_end,
          p_notes:        notes ?? null,
          p_actor_id:     ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/fiscal-years/create');
          if (mapped) return mapped;
          throw error;
        }
        return json({ fiscal_year_id: data }, 201);
      }

      if (!fyId) return err(ctx, 'Not Found', 404, 'NOT_FOUND');

      // GET /financial-close/fiscal-years/:id
      if (req.method === 'GET' && !seg3) {
        if (!hasPerm(ctx, 'finance:close:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase
          .from('fiscal_years' as never)
          .select('*')
          .eq('id', fyId)
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return err(ctx, 'Fiscal year not found', 404, 'NOT_FOUND');
        return json(data);
      }

      // POST /financial-close/fiscal-years/:id/assign-period
      if (req.method === 'POST' && seg3 === 'assign-period') {
        if (!hasPerm(ctx, 'finance:year_end:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { period_id, is_year_end = false } = body;
        if (!period_id || !UUID_RE.test(period_id)) return err(ctx, 'period_id is required', 400, 'VALIDATION_ERROR');
        const { error } = await supabase.rpc('assign_period_to_fiscal_year' as never, {
          p_period_id:      period_id,
          p_fiscal_year_id: fyId,
          p_is_year_end:    is_year_end,
          p_actor_id:       ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/fiscal-years/assign-period');
          if (mapped) return mapped;
          throw error;
        }
        return json({ ok: true });
      }

      // POST /financial-close/fiscal-years/:id/validate
      if (req.method === 'POST' && seg3 === 'validate') {
        if (!hasPerm(ctx, 'finance:year_end:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase.rpc('validate_fiscal_year_for_close' as never, {
          p_fiscal_year_id: fyId,
          p_actor_id:       ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/fiscal-years/validate');
          if (mapped) return mapped;
          throw error;
        }
        return json(data);
      }

      // POST /financial-close/fiscal-years/:id/retained-earnings
      if (req.method === 'POST' && seg3 === 'retained-earnings') {
        if (!hasPerm(ctx, 'finance:year_end:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { data, error } = await supabase.rpc('post_retained_earnings_entry' as never, {
          p_fiscal_year_id: fyId,
          p_actor_id:       ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/fiscal-years/retained-earnings');
          if (mapped) return mapped;
          throw error;
        }
        return json({ journal_entry_id: data }, 201);
      }

      // POST /financial-close/fiscal-years/:id/close
      if (req.method === 'POST' && seg3 === 'close') {
        if (!hasPerm(ctx, 'finance:year_end:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const { error } = await supabase.rpc('close_fiscal_year' as never, {
          p_fiscal_year_id: fyId,
          p_actor_id:       ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/fiscal-years/close');
          if (mapped) return mapped;
          throw error;
        }
        return json({ ok: true });
      }

      // POST /financial-close/fiscal-years/:id/rollover
      if (req.method === 'POST' && seg3 === 'rollover') {
        if (!hasPerm(ctx, 'finance:year_end:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
        const body = await req.json().catch(() => ({}));
        const { target_period_id } = body;
        if (!target_period_id || !UUID_RE.test(target_period_id)) {
          return err(ctx, 'target_period_id is required', 400, 'VALIDATION_ERROR');
        }
        const { data, error } = await supabase.rpc('rollover_opening_balances' as never, {
          p_fiscal_year_id:   fyId,
          p_target_period_id: target_period_id,
          p_actor_id:         ctx.actorId,
        });
        if (error) {
          const mapped = handlePgError(ctx, error, 'financial-close/fiscal-years/rollover');
          if (mapped) return mapped;
          throw error;
        }
        return json({ accounts_rolled_over: data ?? 0 });
      }
    }

    return err(ctx, 'Not Found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[financial-close]', msg);
    return err(ctx, 'Internal server error', 500, 'INTERNAL_ERROR');
  }
}));
