import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { startOfDay, endOfDay, startOfMonth } from 'date-fns';
import type { LessonSlot } from '@platform/types';

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface TodaySlotsResult {
  total: number;
  slots: LessonSlot[];
}

export interface PendingInvoiceMetrics {
  pendingCount: number;
  overdueCount: number;
}

export interface MonthlyRevenueResult {
  amount:  number;
  hasMore: boolean;
}

export interface AllDashboardMetrics {
  active_student_count: number | null;
  today_slots:          TodaySlotsResult | null;
  pending_invoices:     PendingInvoiceMetrics | null;
  monthly_revenue:      MonthlyRevenueResult | null;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const dashboardKeys = {
  all:     ['dashboard'] as const,
  metrics: (today: string, month: string) => ['dashboard', 'metrics', today, month] as const,
};

// ─── Combined fetcher (single Edge Function call, 4 DB queries in parallel) ──

async function fetchAllMetrics(
  slotsFrom: string,
  slotsTo:   string,
  monthFrom: string,
  today:     string,
): Promise<AllDashboardMetrics> {
  const qs = [
    `slots_from=${encodeURIComponent(slotsFrom)}`,
    `slots_to=${encodeURIComponent(slotsTo)}`,
    `month_from=${encodeURIComponent(monthFrom)}`,
    `today=${encodeURIComponent(today)}`,
  ].join('&');

  // Client-side timeout: abort after 15 s so a cold-starting Edge Function
  // cannot hang for Supabase's full server-side 2-minute timeout.
  // 15 s is generous enough for most cold starts; the UI shows a notice after 5 s.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const { data, error } = await supabase.functions.invoke<{ data: AllDashboardMetrics }>(
      `dashboard?${qs}`,
      { method: 'GET', signal: controller.signal },
    );
    if (error) throw error;
    if (!data?.data) throw new Error('Empty response from dashboard endpoint');
    return data.data;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Combined hook — use this on DashboardPage ────────────────────────────────

export function useDashboardMetrics(options?: { enabled?: boolean }) {
  const now       = new Date();
  const slotsFrom = startOfDay(now).toISOString();
  const slotsTo   = endOfDay(now).toISOString();
  const monthFrom = startOfMonth(now).toISOString();
  const today     = now.toISOString().slice(0, 10);
  const month     = now.toISOString().slice(0, 7);

  return useQuery({
    queryKey:        dashboardKeys.metrics(today, month),
    queryFn:         () => fetchAllMetrics(slotsFrom, slotsTo, monthFrom, today),
    enabled:         options?.enabled ?? true,
    staleTime:       2 * 60 * 1000,
    gcTime:          30 * 60 * 1000,
    placeholderData: keepPreviousData,
    // Don't auto-retry on timeout (AbortError) — the Edge Function is still cold;
    // retry once on other transient errors (network blip, 5xx).
    retry: (failureCount, error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      if (error instanceof Error && error.name === 'AbortError')         return false;
      return failureCount < 1;
    },
    retryDelay: 3_000,
  });
}
