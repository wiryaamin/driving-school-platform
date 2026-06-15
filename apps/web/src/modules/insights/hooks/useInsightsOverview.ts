import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const insightsOverviewKeys = {
  all:      ['insights', 'overview'] as const,
  summary:  () => [...insightsOverviewKeys.all, 'summary'] as const,
  slots:    () => [...insightsOverviewKeys.all, 'slots'] as const,
  birthdays:() => [...insightsOverviewKeys.all, 'birthdays'] as const,
};

// ─── Summary (new customers + debt) ───────────────────────────────────────────

export interface OverviewSummary {
  newLast30:  number;
  newPrev30:  number;
  growthPct:  number | null;
  debtCount:  number;
  debtSek:    number;
  openPlaces: number;
}

function pct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function useOverviewSummary() {
  return useQuery({
    queryKey: insightsOverviewKeys.summary(),
    queryFn: async (): Promise<OverviewSummary> => {
      const now         = new Date();
      const d30         = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const d60         = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const in7days     = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const [newNow, newPrev, slots] = await Promise.all([
        // New students in last 30 days
        (supabase as unknown as any)
          .from('students')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', d30)
          .is('deleted_at', null),

        // New students 30–60 days ago
        (supabase as unknown as any)
          .from('students')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', d60)
          .lt('created_at', d30)
          .is('deleted_at', null),

        // Open lesson slots next 7 days
        (supabase as unknown as any)
          .from('lesson_slots')
          .select('max_bookings, current_bookings')
          .eq('status', 'open')
          .gte('starts_at', now.toISOString())
          .lte('starts_at', in7days)
          .gt('max_bookings', 0),
      ]);

      const newLast30 = newNow.count ?? 0;
      const newPrev30 = newPrev.count ?? 0;

      const openPlaces = ((slots.data ?? []) as { max_bookings: number; current_bookings: number }[])
        .reduce((acc, s) => acc + Math.max(0, s.max_bookings - s.current_bookings), 0);

      // Try to fetch overdue invoices (graceful fallback)
      let debtCount = 0;
      let debtSek   = 0;
      try {
        const { data: inv } = await (supabase as unknown as any)
          .from('invoices')
          .select('outstanding_amount')
          .in('status', ['overdue'])
          .is('deleted_at', null);
        if (inv) {
          const invoices = inv as { outstanding_amount: number }[];
          debtCount = invoices.length;
          debtSek   = invoices.reduce((s: number, i: { outstanding_amount: number }) => s + (i.outstanding_amount ?? 0), 0);
        }
      } catch { /* table may not be accessible */ }

      return {
        newLast30,
        newPrev30,
        growthPct: pct(newLast30, newPrev30),
        debtCount,
        debtSek,
        openPlaces,
      };
    },
    staleTime: 60_000,
  });
}

// ─── Upcoming slots ────────────────────────────────────────────────────────────

export interface UpcomingSlot {
  id: string;
  lesson_type_name: string;
  starts_at: string;
  ends_at: string;
  max_bookings: number;
  current_bookings: number;
}

export function useUpcomingSlots() {
  return useQuery({
    queryKey: insightsOverviewKeys.slots(),
    queryFn: async (): Promise<UpcomingSlot[]> => {
      const now     = new Date().toISOString();
      const in30d   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await (supabase as unknown as any)
        .from('lesson_slots')
        .select('id, starts_at, ends_at, max_bookings, current_bookings, lesson_types ( name )')
        .in('status', ['open', 'full'])
        .gte('starts_at', now)
        .lte('starts_at', in30d)
        .order('starts_at')
        .limit(6);

      if (error) return [];

      return ((data ?? []) as {
        id: string; starts_at: string; ends_at: string;
        max_bookings: number; current_bookings: number;
        lesson_types: { name: string } | null;
      }[]).map((s) => ({
        id:               s.id,
        lesson_type_name: s.lesson_types?.name ?? '—',
        starts_at:        s.starts_at,
        ends_at:          s.ends_at,
        max_bookings:     s.max_bookings,
        current_bookings: s.current_bookings,
      }));
    },
    staleTime: 30_000,
  });
}

// ─── Upcoming birthdays ────────────────────────────────────────────────────────

export interface UpcomingBirthday {
  id: string;
  name: string;
  date_of_birth: string;
  turns_age: number;
  days_until: number;
  birthday_this_year: string;
}

export function useUpcomingBirthdays() {
  return useQuery({
    queryKey: insightsOverviewKeys.birthdays(),
    queryFn: async (): Promise<UpcomingBirthday[]> => {
      const { data, error } = await (supabase as unknown as any)
        .from('students')
        .select('id, first_name, last_name, date_of_birth')
        .not('date_of_birth', 'is', null)
        .is('deleted_at', null)
        .in('status', ['active', 'onboarding', 'paused']);

      if (error || !data) return [];

      const today = new Date();
      const thisYear = today.getFullYear();
      const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      const results: UpcomingBirthday[] = [];
      for (const s of data as { id: string; first_name: string; last_name: string; date_of_birth: string }[]) {
        const dob = new Date(s.date_of_birth);
        const bday = new Date(thisYear, dob.getMonth(), dob.getDate());
        if (bday < today) bday.setFullYear(thisYear + 1);
        if (bday > in30) continue;

        const daysUntil = Math.round((bday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        results.push({
          id:                 s.id,
          name:               `${s.first_name} ${s.last_name}`,
          date_of_birth:      s.date_of_birth,
          turns_age:          bday.getFullYear() - dob.getFullYear(),
          days_until:         daysUntil,
          birthday_this_year: bday.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' }),
        });
      }

      return results.sort((a, b) => a.days_until - b.days_until).slice(0, 5);
    },
    staleTime: 60_000,
  });
}
