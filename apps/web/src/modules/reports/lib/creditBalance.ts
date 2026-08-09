import { supabase } from '@core/api/supabase.js';

// Students carry no single "credit balance" column — credits are materialized
// per (student, lesson_category) in credit_balance_cache (see
// supabase/migrations/20260530000001_phase4a_commercial_core.sql, Section 2.5:
// "PRIMARY source for balance reads"). Reports operate on the student's total
// balance across all categories, so this sums client-side.

/** Map of student_id -> summed credit balance across all lesson categories. */
export async function fetchStudentBalanceTotals(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('credit_balance_cache').select('student_id, balance');
  if (error) throw error;
  const totals = new Map<string, number>();
  for (const row of (data ?? []) as { student_id: string; balance: number }[]) {
    totals.set(row.student_id, (totals.get(row.student_id) ?? 0) + row.balance);
  }
  return totals;
}

/** Students filtered/sorted by total credit balance, joined with their profile fields. */
export async function fetchStudentCreditBalances(
  filter: 'negative' | 'positive' | 'all',
  limit = 1000,
) {
  const totals = await fetchStudentBalanceTotals();

  let entries = [...totals.entries()];
  if (filter === 'negative') entries = entries.filter(([, b]) => b < 0);
  if (filter === 'positive') entries = entries.filter(([, b]) => b > 0);
  entries.sort((a, b) => filter === 'negative' ? a[1] - b[1] : b[1] - a[1]);
  entries = entries.slice(0, limit);
  if (entries.length === 0) return [];

  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('id, first_name, last_name, email, phone, status, created_at')
    .in('id', entries.map(([id]) => id))
    .is('deleted_at', null);
  if (stuErr) throw stuErr;

  const byId = new Map((students ?? []).map((s: Record<string, unknown>) => [s['id'] as string, s]));
  return entries
    .map(([id, balance]) => ({ student: byId.get(id), balance }))
    .filter((r): r is { student: Record<string, unknown>; balance: number } => Boolean(r.student));
}
