import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// F3 V1 — shared read of the org's configured cancellation/reschedule
// deadline (organizations.settings.student_booking.cancellation_deadline_hours),
// same JSONB path and default as the Student Portal / backend. Used by
// CancelBookingDialog (staff, informational only — the backend is the real
// enforcement point) and ElevbokningConfigPage (settings UI).

export const DEFAULT_CANCELLATION_DEADLINE_HOURS = 24;

export function useCancellationDeadlineHours(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: ['org-settings', 'cancellation-deadline-hours', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organizationId!)
        .single();
      const settings = (data as unknown as { settings?: Record<string, unknown> } | null)?.settings ?? {};
      const studentBooking = (settings['student_booking'] as Record<string, unknown> | undefined) ?? {};
      const raw = studentBooking['cancellation_deadline_hours'];
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
        ? raw
        : DEFAULT_CANCELLATION_DEADLINE_HOURS;
    },
    enabled: Boolean(organizationId),
    staleTime: 5 * 60_000,
  });
}
