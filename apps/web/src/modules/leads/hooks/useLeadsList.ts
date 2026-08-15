import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'contacted' | 'enrolled' | 'declined';

export interface Lead {
  id:                         string;
  first_name:                 string;
  last_name:                  string;
  email:                      string | null;
  phone:                      string | null;
  license_category:           string;
  notes:                      string | null;
  status:                     LeadStatus;
  source:                     string;
  created_at:                 string;
  updated_at:                 string;
  preferred_start_date:       string | null;
  driving_experience:         string | null;
  learner_permit_status:      string | null;
  preferred_transmission:     string;
  preferred_lesson_times:     string[];
  preferred_language:         string;
  existing_license_category:  string | null;
  needs_theory:                boolean;
  needs_risk1:                 boolean;
  needs_risk2:                 boolean;
}

// ─── Query hook ───────────────────────────────────────────────────────────────
//
// Extracted from LeadsPage.tsx (unchanged query/table/computation) so the
// Dashboard KPI card and the Leads page itself share one data-fetching path
// instead of each running its own copy.

export function useLeadsList() {
  const { organization } = useSession();
  const orgId = organization?.id;

  return useQuery<Lead[]>({
    queryKey: ['leads', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('student_leads')
        .select(`
          id, first_name, last_name, email, phone, license_category, notes, status, source, created_at, updated_at,
          preferred_start_date, driving_experience, learner_permit_status, preferred_transmission,
          preferred_lesson_times, preferred_language, existing_license_category, needs_theory, needs_risk1, needs_risk2
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as Lead[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

// ─── Derived counts ───────────────────────────────────────────────────────────
//
// Same grouping LeadsPage.tsx already computed inline — moved here so both
// consumers derive counts from the same shared leads array identically.

export interface LeadCounts {
  new:       number;
  contacted: number;
  enrolled:  number;
  declined:  number;
}

export function deriveLeadCounts(leads: Lead[]): LeadCounts {
  const counts: LeadCounts = { new: 0, contacted: 0, enrolled: 0, declined: 0 };
  for (const lead of leads) counts[lead.status]++;
  return counts;
}
