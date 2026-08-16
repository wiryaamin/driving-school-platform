/**
 * dashboard — aggregated metrics endpoint.
 *
 * Runs 4 DB queries in parallel and returns all dashboard KPIs in one response,
 * replacing the 4 separate Edge Function calls previously made by the frontend.
 *
 * Query params:
 *   slots_from  — ISO UTC string, start of "today" window (from startOfDay)
 *   slots_to    — ISO UTC string, end of "today" window (from endOfDay)
 *   month_from  — ISO UTC string, start of current month (from startOfMonth)
 *   today       — YYYY-MM-DD date string used for overdue invoice calculation
 *
 * Response shape:
 *   { data: { active_student_count, today_slots, pending_invoices, monthly_revenue } }
 *
 * Per-metric permission checks: metrics the caller cannot access are returned as null.
 * RLS enforces org isolation at the DB level (createSupabaseClient uses the caller JWT).
 */

import { serveCors }        from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { logger }           from '../_shared/logger.ts';

const JSON_CT = { 'Content-Type': 'application/json' } as const;

Deno.serve((req: Request) => serveCors(req, async () => {
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }),
      { status: 405, headers: JSON_CT },
    );
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

  const url       = new URL(req.url);
  const slotsFrom = url.searchParams.get('slots_from') ?? '';
  const slotsTo   = url.searchParams.get('slots_to')   ?? '';
  const monthFrom = url.searchParams.get('month_from') ?? '';
  const today     = url.searchParams.get('today')      ?? new Date().toISOString().slice(0, 10);

  logger.info('request.started', {
    method:         req.method,
    path:           url.pathname,
    correlation_id: ctx.correlationId,
    request_id:     ctx.requestId,
    org_id:         ctx.organizationId ?? 'platform',
    actor_id:       ctx.actorId,
  });

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const orgId  = ctx.organizationId;

  const canStudents = ctx.isPlatformAdmin || ctx.permissions.includes('students:student:read');
  const canSlots    = ctx.isPlatformAdmin || ctx.permissions.includes('scheduling:slot:read');
  const canFinance  = ctx.isPlatformAdmin || ctx.permissions.includes('finance:invoice:read');

  const startedAt = Date.now();

  try {
    const [studentsRes, slotsRes, invoiceMetricsRes] = await Promise.all([
      canStudents
        ? (client as any)
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('status', 'active')
            .is('deleted_at', null)
        : Promise.resolve({ count: null, error: null, data: null }),

      canSlots && slotsFrom && slotsTo
        ? (client as any)
            .from('lesson_slots')
            .select('*')
            .eq('organization_id', orgId)
            .is('deleted_at', null)
            .gte('starts_at', slotsFrom)
            .lte('starts_at', slotsTo)
            .order('starts_at', { ascending: true })
            .limit(20)
        : Promise.resolve({ data: null, error: null }),

      // Server-side aggregation (COUNT/SUM, no row cap) — see
      // tenant_overview_invoice_metrics() in the migrations for the exact
      // pending/overdue/monthly-revenue business rules being preserved.
      // p_month_from is passed as null when absent, matching the previous
      // behavior where a missing month_from only zeroed the revenue figure
      // rather than skipping the pending/overdue counts too.
      canFinance
        ? (client as any).rpc('tenant_overview_invoice_metrics', {
            p_org_id:     orgId,
            p_today:      today,
            p_month_from: monthFrom || null,
          })
        : Promise.resolve({ data: null, error: null }),
    ]);

    const activeStudentCount = canStudents ? (studentsRes.count ?? 0) : null;

    const todaySlots = canSlots
      ? { total: slotsRes.data?.length ?? 0, slots: slotsRes.data ?? [] }
      : null;

    const invoiceMetrics = invoiceMetricsRes.data as
      | { pending_count: number; overdue_count: number; monthly_revenue: number }
      | null;

    const pendingInvoices = canFinance
      ? {
          pendingCount: invoiceMetrics?.pending_count ?? 0,
          overdueCount: invoiceMetrics?.overdue_count ?? 0,
        }
      : null;

    const monthlyRevenue = canFinance
      ? {
          amount:  invoiceMetrics?.monthly_revenue ?? 0,
          hasMore: false,
        }
      : null;

    logger.info('request.completed', {
      method:         req.method,
      status:         200,
      correlation_id: ctx.correlationId,
      request_id:     ctx.requestId,
      org_id:         orgId,
      duration_ms:    Date.now() - startedAt,
    });

    return new Response(
      JSON.stringify({
        data: {
          active_student_count: activeStudentCount,
          today_slots:          todaySlots,
          pending_invoices:     pendingInvoices,
          monthly_revenue:      monthlyRevenue,
        },
      }),
      { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } },
    );
  } catch (err) {
    logger.error('dashboard.error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({
        code:       'INTERNAL_ERROR',
        message:    'Failed to fetch dashboard metrics',
        trace_id:   ctx.correlationId,
        request_id: ctx.requestId,
        version:    1,
      }),
      { status: 500, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } },
    );
  }
}));
