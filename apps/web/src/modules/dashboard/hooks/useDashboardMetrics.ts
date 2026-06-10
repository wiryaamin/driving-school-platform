import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { startOfDay, endOfDay, startOfMonth } from 'date-fns';
import type { Invoice, LessonSlot } from '@platform/types';

// ─── Response shapes ──────────────────────────────────────────────────────────

interface StudentCountResponse {
  data: unknown[];
  meta: { total: number };
}

interface SlotListResponse {
  data: LessonSlot[];
  meta: { total: number };
}

interface InvoiceListResponse {
  data: Invoice[];
  meta: { total: number };
}

// ─── Derived result types ─────────────────────────────────────────────────────

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

// ─── Query keys ───────────────────────────────────────────────────────────────

export const dashboardKeys = {
  all:             ['dashboard'] as const,
  activeStudents:  () => [...dashboardKeys.all, 'active-students'] as const,
  todaySlots:      (date: string) => [...dashboardKeys.all, 'today-slots', date] as const,
  pendingInvoices: () => [...dashboardKeys.all, 'pending-invoices'] as const,
  monthlyRevenue:  (month: string) => [...dashboardKeys.all, 'monthly-revenue', month] as const,
};

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchActiveStudentCount(): Promise<number> {
  const { data, error } = await supabase.functions.invoke<StudentCountResponse>(
    'students?status=active&per_page=1',
    { method: 'GET' }
  );
  if (error) throw error;
  return data?.meta.total ?? 0;
}

async function fetchTodaySlots(from: string, to: string): Promise<TodaySlotsResult> {
  const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&per_page=20&sort_by=starts_at&sort_dir=asc`;
  const { data, error } = await supabase.functions.invoke<SlotListResponse>(`slots?${qs}`, { method: 'GET' });
  if (error) throw error;
  return {
    total: data?.meta.total ?? 0,
    slots: data?.data ?? [],
  };
}

async function fetchPendingInvoiceMetrics(): Promise<PendingInvoiceMetrics> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.functions.invoke<InvoiceListResponse>(
    'invoices?status=issued&per_page=50',
    { method: 'GET' }
  );
  if (error) throw error;
  const invoices = data?.data ?? [];
  const overdueCount = invoices.filter(
    (inv) => inv.due_date !== null && inv.due_date !== undefined && inv.due_date < today
  ).length;
  return {
    pendingCount: data?.meta.total ?? 0,
    overdueCount,
  };
}

async function fetchMonthlyRevenue(from: string): Promise<MonthlyRevenueResult> {
  const qs = `status=paid&from=${encodeURIComponent(from)}&per_page=100`;
  const { data, error } = await supabase.functions.invoke<InvoiceListResponse>(`invoices?${qs}`, { method: 'GET' });
  if (error) throw error;
  const invoices = data?.data ?? [];
  const amount   = invoices.reduce((sum, inv) => sum + (inv.paid_amount ?? 0), 0);
  return {
    amount,
    hasMore: (data?.meta.total ?? 0) > 100,
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useActiveStudentCount() {
  return useQuery({
    queryKey: dashboardKeys.activeStudents(),
    queryFn:  fetchActiveStudentCount,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTodaySlots() {
  const now   = new Date();
  const from  = startOfDay(now).toISOString();
  const to    = endOfDay(now).toISOString();
  const today = now.toISOString().slice(0, 10);

  return useQuery({
    queryKey: dashboardKeys.todaySlots(today),
    queryFn:  () => fetchTodaySlots(from, to),
    staleTime: 2 * 60 * 1000,
  });
}

export function usePendingInvoiceMetrics() {
  return useQuery({
    queryKey: dashboardKeys.pendingInvoices(),
    queryFn:  fetchPendingInvoiceMetrics,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMonthlyRevenue() {
  const from  = startOfMonth(new Date()).toISOString();
  const month = new Date().toISOString().slice(0, 7);

  return useQuery({
    queryKey: dashboardKeys.monthlyRevenue(month),
    queryFn:  () => fetchMonthlyRevenue(from),
    staleTime: 5 * 60 * 1000,
  });
}
