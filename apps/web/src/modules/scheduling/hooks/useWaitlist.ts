import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WaitlistStatus = 'waiting' | 'promoted' | 'cancelled' | 'expired';

export interface WaitlistEntry {
  id:                   string;
  organization_id:      string;
  slot_id:              string;
  student_id:           string;
  priority:             number;
  status:               WaitlistStatus;
  status_changed_at:    string | null;
  expires_at:           string | null;
  promoted_booking_id:  string | null;
  notified_at:          string | null;
  reservation_deadline: string | null;
  notes:                string | null;
  created_at:           string;
  updated_at:           string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const waitlistKeys = {
  all:    ['waitlist'] as const,
  bySlot: (slotId: string) => [...waitlistKeys.all, 'by-slot', slotId] as const,
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetchWaitlistForSlot(slotId: string): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase.functions.invoke<{ data: WaitlistEntry[] }>(
    `waitlist?slot_id=${slotId}&status=waiting`,
    { method: 'GET' }
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useWaitlistForSlot(slotId: string | null) {
  return useQuery({
    queryKey: waitlistKeys.bySlot(slotId ?? ''),
    queryFn:  () => apiFetchWaitlistForSlot(slotId!),
    enabled:  slotId !== null && slotId !== '',
  });
}
