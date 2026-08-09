import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DemoRequestStatus =
  | 'new'
  | 'contacted'
  | 'demo_scheduled'
  | 'demo_completed'
  | 'qualified'
  | 'converted'
  | 'declined'
  | 'spam';

export type DemoRequestRejectionReason =
  | 'duplicate_email'
  | 'duplicate_request'
  | 'spam_or_fraud'
  | 'incomplete_invalid_info'
  | 'not_target_market'
  | 'unable_to_verify_business'
  | 'outside_service_area'
  | 'other';

export interface DemoRequest {
  id:                        string;
  name:                      string;
  school_name:               string;
  email:                     string;
  phone:                     string;
  municipality:              string;
  location_count:            number;
  student_count:             number;
  current_system:            string;
  message:                   string;
  source:                    string;
  status:                    DemoRequestStatus;
  assigned_to:               string | null;
  internal_notes:            string;
  converted_organization_id: string | null;
  created_at:                string;
  updated_at:                string;
  contacted_at:              string | null;
  converted_at:              string | null;
  approved_at:               string | null;
  approved_by:               string | null;
  reviewed_at:               string | null;
  reviewed_by:               string | null;
  rejection_reason:          DemoRequestRejectionReason | null;
  rejection_description:     string | null;
  rejected_at:               string | null;
  rejected_by:                string | null;
}

// ─── DB access helper ─────────────────────────────────────────────────────────
//
// demo_requests was added directly via SQL migration (20260710000001) and is
// not present in @platform/types' hand-maintained Database stub, so the
// typed client rejects the table name at compile time. Same escape hatch
// already used by usePlatformOrgMutations.ts for the analogous
// Insert/Update-resolves-to-never gap; RLS (demo_requests_select_platform_admin
// / demo_requests_update_platform_admin) is what actually enforces access,
// not this cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function demoRequests() { return (supabase as any).from('demo_requests'); }

const DEMO_REQUEST_SELECT =
  'id, name, school_name, email, phone, municipality, location_count, student_count, ' +
  'current_system, message, source, status, assigned_to, internal_notes, ' +
  'converted_organization_id, created_at, updated_at, contacted_at, converted_at, approved_at, approved_by, reviewed_at, reviewed_by, ' +
  'rejection_reason, rejection_description, rejected_at, rejected_by';

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useDemoRequests() {
  return useQuery({
    queryKey: ['platform', 'demo-requests'],
    queryFn: async (): Promise<DemoRequest[]> => {
      const { data, error } = await demoRequests()
        .select(DEMO_REQUEST_SELECT)
        .order('created_at', { ascending: false });

      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as DemoRequest[];
    },
    staleTime: 30_000,
  });
}
