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

  const url       = new URL(req.url);
  const slotsFrom = url.searchParams.get('slots_from') ?? '';
  const slotsTo   = url.searchParams.get('slots_to')   ?? '';
  const monthFrom = url.searchParams.get('month_from') ?? '';
  const today     = url.searchParams.get('today')      ?? new Date().toISOString().slice(0, 10);

  const client = createSupabaseClient(req);
  const orgId  = ctx.organizationId;

  const canStudents = ctx.isPlatformAdmin || ctx.permissions.includes('students:student:read');
  const canSlots    = ctx.isPlatformAdmin || ctx.permissions.includes('scheduling:booking:read');
  const canFinance  = ctx.isPlatformAdmin || ctx.permissions.includes('finance:invoice:read');

  const startedAt = Date.now();

  try {
    const [studentsRes, slotsRes, pendingInvRes, paidInvRes] = await Promise.all([
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

      canFinance
        ? (client as any)
            .from('invoices')
            .select('id, due_date', { count: 'exact' })
            .eq('organization_id', orgId)
            .eq('status', 'issued')
            .is('deleted_at', null)
            .limit(50)
        : Promise.resolve({ data: null, count: null, error: null }),

      canFinance && monthFrom
        ? (client as any)
            .from('invoices')
            .select('paid_amount', { count: 'exact' })
            .eq('organization_id', orgId)
            .eq('status', 'paid')
            .is('deleted_at', null)
            .gte('created_at', monthFrom)
            // No .limit() — PostgREST default (max_rows=1000 per config.toml) is sufficient
            // for monthly invoice volume at any Swedish driving school.
        : Promise.resolve({ data: null, count: null, error: null }),
    ]);

    const activeStudentCount = canStudents ? (studentsRes.count ?? 0) : null;

    const todaySlots = canSlots
      ? { total: slotsRes.data?.length ?? 0, slots: slotsRes.data ?? [] }
      : null;

    const pendingInvoices = canFinance
      ? {
          pendingCount: pendingInvRes.count ?? 0,
          overdueCount: ((pendingInvRes.data ?? []) as Array<{ due_date: string | null }>).filter(
            (inv) => inv.due_date !== null && inv.due_date < today,
          ).length,
        }
      : null;

    const paidInvData = (paidInvRes.data ?? []) as Array<{ paid_amount: number | null }>;
    const monthlyRevenue = canFinance
      ? {
          amount:  paidInvData.reduce((sum, inv) => sum + (inv.paid_amount ?? 0), 0),
          hasMore: (paidInvRes.count ?? 0) > paidInvData.length,
        }
      : null;

    logger.info('dashboard.metrics_fetched', {
      correlation_id: ctx.correlationId,
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
      { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } },
    );
  } catch (err) {
    logger.error('dashboard.error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({
        code:     'INTERNAL_ERROR',
        message:  'Failed to fetch dashboard metrics',
        trace_id: ctx.correlationId,
      }),
      { status: 500, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } },
    );
  }
}));
