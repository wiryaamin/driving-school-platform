import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Skolans standardarbetstid ────────────────────────────────────────────────
// Lagras i organizations.settings.schema (work_days / work_start / work_end) och
// ställs in under Inställningar → Schema → Schemainställningar. Används som
// förval när en ny lärare skapas och när ett schema skapas automatiskt.

export interface OrgWorkHours {
  /** 0 = söndag … 6 = lördag (samma som instructor_availability_rules.day_of_week) */
  days:  number[];
  start: string; // HH:MM
  end:   string; // HH:MM
}

export const DEFAULT_WORK_HOURS: OrgWorkHours = { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00' };

const HHMM = /^\d{2}:\d{2}/;

export function parseOrgWorkHours(settings: Record<string, unknown> | null | undefined): OrgWorkHours {
  const s = (settings?.['schema'] as Record<string, unknown> | undefined) ?? {};
  const rawDays = s['work_days'];
  const days = Array.isArray(rawDays)
    ? rawDays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
    : DEFAULT_WORK_HOURS.days;
  const start = typeof s['work_start'] === 'string' && HHMM.test(s['work_start']) ? s['work_start'].slice(0, 5) : DEFAULT_WORK_HOURS.start;
  const end   = typeof s['work_end']   === 'string' && HHMM.test(s['work_end'])   ? s['work_end'].slice(0, 5)   : DEFAULT_WORK_HOURS.end;
  return { days, start, end };
}

/** Delar cache med Schemainställningar (samma query key och form). */
export function useOrgSettings() {
  const { organization } = useSession();
  const orgId = organization?.id;
  return useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-schema', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      return ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

export function useOrgWorkHours(): OrgWorkHours {
  const { data } = useOrgSettings();
  return parseOrgWorkHours(data);
}

// ─── Skapa pass automatiskt ──────────────────────────────────────────────────

export interface GenerateScheduleResult {
  rules:     number;
  created:   number;
  skipped:   number;
  conflicts: number;
}

/** Skapar pass för läraren de kommande veckorna utifrån lärarens arbetstider. */
export function useGenerateInstructorSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ instructorId, weeks = 4 }: { instructorId: string; weeks?: number }): Promise<GenerateScheduleResult> => {
      const { data, error } = await supabase.rpc(
        'generate_instructor_schedule',
        { p_instructor_id: instructorId, p_weeks: weeks } as never,
      );
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as {
        out_rules_processed: number; out_slots_created: number; out_slots_skipped: number; out_conflicts_found: number;
      } | undefined;
      return {
        rules:     row?.out_rules_processed ?? 0,
        created:   row?.out_slots_created   ?? 0,
        skipped:   row?.out_slots_skipped   ?? 0,
        conflicts: row?.out_conflicts_found ?? 0,
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['slots'] });
    },
  });
}

const DAY_SHORT_SV = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

/** "mån–fre 08:00–17:00" eller "mån, ons, fre 08:00–17:00" */
export function formatWorkHours(h: OrgWorkHours): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const days = order.filter((d) => h.days.includes(d));
  if (days.length === 0) return 'Inga arbetsdagar';
  const idx = days.map((d) => order.indexOf(d));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
  const dayText = contiguous && days.length > 2
    ? `${DAY_SHORT_SV[days[0]!]}–${DAY_SHORT_SV[days[days.length - 1]!]}`
    : days.map((d) => DAY_SHORT_SV[d]).join(', ');
  return `${dayText} ${h.start}–${h.end}`;
}
