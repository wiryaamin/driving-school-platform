import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateRangeKey = '7d' | '30d' | '90d' | 'year';

export interface BookingBar {
  label:     string;
  total:     number;
  confirmed: number;
  cancelled: number;
  noShow:    number;
}

export interface RevenueBar {
  label:  string;
  amount: number;
}

export interface LessonTypeStat {
  name:  string;
  count: number;
  pct:   number;
}

export interface RapporterData {
  range:              DateRangeKey;
  totalBookings:      number;
  confirmedBookings:  number;
  cancelledBookings:  number;
  noShowBookings:     number;
  completionRate:     number;
  totalRevenue:       number;
  bookingBars:        BookingBar[];
  revenueBars:        RevenueBar[];
  lessonTypeStats:    LessonTypeStat[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SV_MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function buildBookingBars(
  bookings: { status: string; starts_at: string }[],
  rangeKey: DateRangeKey,
  to: Date,
): BookingBar[] {
  function addToBar(bar: BookingBar, status: string) {
    bar.total++;
    if (status === 'completed' || status === 'confirmed') bar.confirmed++;
    else if (status === 'cancelled') bar.cancelled++;
    else if (status === 'no_show')   bar.noShow++;
  }

  if (rangeKey === '7d') {
    const bars: BookingBar[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(to);
      d.setDate(d.getDate() - (6 - i));
      const label = d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric' });
      return { label, total: 0, confirmed: 0, cancelled: 0, noShow: 0 };
    });
    for (const b of bookings) {
      const daysAgo = Math.floor((to.getTime() - new Date(b.starts_at).getTime()) / 86_400_000);
      const idx = 6 - daysAgo;
      const bar = bars[idx];
      if (bar) addToBar(bar, b.status);
    }
    return bars;
  }

  if (rangeKey === '30d') {
    const NUM_WEEKS = 5;
    const bars: BookingBar[] = Array.from({ length: NUM_WEEKS }, (_, i) => ({
      label: i === NUM_WEEKS - 1 ? 'Denna v.' : `V−${NUM_WEEKS - 1 - i}`,
      total: 0, confirmed: 0, cancelled: 0, noShow: 0,
    }));
    for (const b of bookings) {
      const weeksAgo = (to.getTime() - new Date(b.starts_at).getTime()) / (7 * 86_400_000);
      if (weeksAgo < 0 || weeksAgo >= NUM_WEEKS) continue;
      const idx = (NUM_WEEKS - 1) - Math.floor(weeksAgo);
      const bar = bars[idx];
      if (bar) addToBar(bar, b.status);
    }
    return bars;
  }

  if (rangeKey === '90d') {
    const NUM_WEEKS = 13;
    const bars: BookingBar[] = Array.from({ length: NUM_WEEKS }, (_, i) => ({
      label: i === NUM_WEEKS - 1 ? 'Denna v.' : `V−${NUM_WEEKS - 1 - i}`,
      total: 0, confirmed: 0, cancelled: 0, noShow: 0,
    }));
    for (const b of bookings) {
      const weeksAgo = (to.getTime() - new Date(b.starts_at).getTime()) / (7 * 86_400_000);
      if (weeksAgo < 0 || weeksAgo >= NUM_WEEKS) continue;
      const idx = (NUM_WEEKS - 1) - Math.floor(weeksAgo);
      const bar = bars[idx];
      if (bar) addToBar(bar, b.status);
    }
    return bars;
  }

  // year: 12 monthly bars
  const bars: BookingBar[] = SV_MONTHS_SHORT.map((m) => ({
    label: m, total: 0, confirmed: 0, cancelled: 0, noShow: 0,
  }));
  for (const b of bookings) {
    const month = new Date(b.starts_at).getMonth();
    const bar   = bars[month];
    if (bar) addToBar(bar, b.status);
  }
  return bars;
}

function buildRevenueBars(
  payments: { amount: number; paid_at: string }[],
  rangeKey: DateRangeKey,
  to: Date,
): RevenueBar[] {
  if (rangeKey === '7d') {
    const bars: RevenueBar[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(to);
      d.setDate(d.getDate() - (6 - i));
      const label = d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric' });
      return { label, amount: 0 };
    });
    for (const p of payments) {
      const daysAgo = Math.floor((to.getTime() - new Date(p.paid_at).getTime()) / 86_400_000);
      const idx = 6 - daysAgo;
      const bar = bars[idx];
      if (bar) bar.amount += Number(p.amount) || 0;
    }
    return bars;
  }

  if (rangeKey === '30d') {
    const NUM_WEEKS = 5;
    const bars: RevenueBar[] = Array.from({ length: NUM_WEEKS }, (_, i) => ({
      label: i === NUM_WEEKS - 1 ? 'Denna v.' : `V−${NUM_WEEKS - 1 - i}`,
      amount: 0,
    }));
    for (const p of payments) {
      const weeksAgo = (to.getTime() - new Date(p.paid_at).getTime()) / (7 * 86_400_000);
      if (weeksAgo < 0 || weeksAgo >= NUM_WEEKS) continue;
      const idx = (NUM_WEEKS - 1) - Math.floor(weeksAgo);
      const bar = bars[idx];
      if (bar) bar.amount += Number(p.amount) || 0;
    }
    return bars;
  }

  if (rangeKey === '90d') {
    const NUM_WEEKS = 13;
    const bars: RevenueBar[] = Array.from({ length: NUM_WEEKS }, (_, i) => ({
      label: i === NUM_WEEKS - 1 ? 'Denna v.' : `V−${NUM_WEEKS - 1 - i}`,
      amount: 0,
    }));
    for (const p of payments) {
      const weeksAgo = (to.getTime() - new Date(p.paid_at).getTime()) / (7 * 86_400_000);
      if (weeksAgo < 0 || weeksAgo >= NUM_WEEKS) continue;
      const idx = (NUM_WEEKS - 1) - Math.floor(weeksAgo);
      const bar = bars[idx];
      if (bar) bar.amount += Number(p.amount) || 0;
    }
    return bars;
  }

  // year: monthly
  const bars: RevenueBar[] = SV_MONTHS_SHORT.map((m) => ({ label: m, amount: 0 }));
  for (const p of payments) {
    const month = new Date(p.paid_at).getMonth();
    const bar   = bars[month];
    if (bar) bar.amount += Number(p.amount) || 0;
  }
  return bars;
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useInsightsRapporter(rangeKey: DateRangeKey) {
  const { user } = useSessionStore();
  const orgId    = user?.organization_id ?? '';

  return useQuery<RapporterData>({
    queryKey:  ['insights', 'rapporter', rangeKey, orgId],
    enabled:   Boolean(orgId),
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<RapporterData> => {
      const now = new Date();
      let from: Date;
      if      (rangeKey === '7d')  from = new Date(now.getTime() -  7 * 86_400_000);
      else if (rangeKey === '30d') from = new Date(now.getTime() - 30 * 86_400_000);
      else if (rangeKey === '90d') from = new Date(now.getTime() - 90 * 86_400_000);
      else                         from = new Date(now.getFullYear(), 0, 1);

      const fromISO = from.toISOString();
      const toISO   = now.toISOString();

      const [bookingsRes, paymentsRes, slotsRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('lesson_bookings')
          .select('id, status, starts_at')
          .eq('organization_id', orgId)
          .gte('starts_at', fromISO)
          .lte('starts_at', toISO)
          .is('deleted_at', null)
          .limit(5000),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('payments')
          .select('amount, paid_at')
          .eq('organization_id', orgId)
          .eq('status', 'confirmed')
          .gte('paid_at', fromISO)
          .lte('paid_at', toISO)
          .not('paid_at', 'is', null)
          .limit(2000),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('lesson_slots')
          .select('id, starts_at, lesson_types(name)')
          .eq('organization_id', orgId)
          .gte('starts_at', fromISO)
          .lte('starts_at', toISO)
          .is('deleted_at', null)
          .limit(3000),
      ]);

      const bookings = (bookingsRes.data ?? []) as { id: string; status: string; starts_at: string }[];
      const payments = (paymentsRes.data ?? []) as { amount: number; paid_at: string }[];
      const slots    = (slotsRes.data ?? [])    as { id: string; starts_at: string; lesson_types: { name: string } | null }[];

      // Totals
      const totalBookings     = bookings.length;
      const confirmedBookings = bookings.filter((b) => b.status === 'completed' || b.status === 'confirmed').length;
      const cancelledBookings = bookings.filter((b) => b.status === 'cancelled').length;
      const noShowBookings    = bookings.filter((b) => b.status === 'no_show').length;
      const completionBase    = confirmedBookings + noShowBookings;
      const completionRate    = completionBase > 0 ? Math.round((confirmedBookings / completionBase) * 100) : 0;
      const totalRevenue      = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

      // Bars
      const bookingBars = buildBookingBars(bookings, rangeKey, now);
      const revenueBars = buildRevenueBars(payments, rangeKey, now);

      // Lesson type distribution
      const typeMap = new Map<string, number>();
      for (const s of slots) {
        const name = s.lesson_types?.name ?? 'Okänd typ';
        typeMap.set(name, (typeMap.get(name) ?? 0) + 1);
      }
      const totalSlots       = slots.length;
      const lessonTypeStats: LessonTypeStat[] = [...typeMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({
          name,
          count,
          pct: totalSlots > 0 ? Math.round((count / totalSlots) * 100) : 0,
        }));

      return {
        range: rangeKey,
        totalBookings,
        confirmedBookings,
        cancelledBookings,
        noShowBookings,
        completionRate,
        totalRevenue,
        bookingBars,
        revenueBars,
        lessonTypeStats,
      };
    },
  });
}
