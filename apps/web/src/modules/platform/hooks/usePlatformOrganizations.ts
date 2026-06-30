import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformOrganization {
  id:                  string;
  slug:                string;
  name:                string;
  legal_name:          string;
  org_number:          string | null;
  status:              string;
  subscription_tier:   string;
  subscription_status: string;
  trial_ends_at:       string | null;
  settings:            Record<string, unknown>;
  created_at:          string;
}

export interface PlatformOrgStats {
  total:     number;
  active:    number;
  suspended: number;
  trialing:  number;
  pastDue:   number;
  tierDist:  Record<string, number>;
}

export interface AuditLogEntry {
  id:             string;
  operation:      string;
  changed_fields: string[] | null;
  old_values:     Record<string, unknown> | null;
  new_values:     Record<string, unknown> | null;
  actor_id:       string | null;
  actor_email:    string | null;
  actor_display:  string | null; // resolved from profiles at query time
  occurred_at:    string;
}

// System sentinel org — never shown in platform admin lists
export const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000';

const ORG_SELECT =
  'id, slug, name, legal_name, org_number, status, subscription_tier, subscription_status, trial_ends_at, settings, created_at';

// ─── Queries ─────────────────────────────────────────────────────────────────

export function usePlatformOrganizations(search?: string) {
  return useQuery({
    queryKey: ['platform', 'organizations', search ?? ''],
    queryFn: async (): Promise<PlatformOrganization[]> => {
      let q = supabase
        .from('organizations')
        .select(ORG_SELECT)
        .neq('id', SYSTEM_ORG_ID)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (search?.trim()) {
        q = q.ilike('name', `%${search.trim()}%`);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as PlatformOrganization[];
    },
    staleTime: 60_000,
  });
}

export function usePlatformOrgStats() {
  return useQuery({
    queryKey: ['platform', 'org-stats'],
    queryFn: async (): Promise<PlatformOrgStats> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('status, subscription_tier, subscription_status')
        .neq('id', SYSTEM_ORG_ID)
        .is('deleted_at', null);

      if (error) throw new Error(error.message);

      const orgs = (data ?? []) as Array<{ status: string; subscription_tier: string; subscription_status: string }>;
      const total     = orgs.length;
      const active    = orgs.filter(o => o.status === 'active').length;
      const suspended = orgs.filter(o => o.status === 'suspended').length;
      const trialing  = orgs.filter(o => o.subscription_status === 'trialing').length;
      const pastDue   = orgs.filter(o => o.subscription_status === 'past_due').length;

      const tierDist: Record<string, number> = {};
      for (const o of orgs) {
        tierDist[o.subscription_tier] = (tierDist[o.subscription_tier] ?? 0) + 1;
      }

      return { total, active, suspended, trialing, pastDue, tierDist };
    },
    staleTime: 60_000,
  });
}

export function useOrgAuditHistory(orgId: string | null) {
  return useQuery({
    queryKey: ['platform', 'audit', orgId],
    enabled: orgId !== null,
    queryFn: async (): Promise<AuditLogEntry[]> => {
      if (!orgId) return [];
      const { data: entries, error } = await supabase
        .from('audit_logs')
        .select('id, operation, changed_fields, old_values, new_values, actor_id, actor_email, occurred_at')
        .eq('organization_id', orgId)
        .eq('entity_type', 'organizations')
        .order('occurred_at', { ascending: false })
        .limit(20);

      if (error) throw new Error(error.message);

      const rows = (entries ?? []) as Array<Omit<AuditLogEntry, 'actor_display'>>;

      // Batch-fetch profiles for all distinct actor_ids.
      // RLS profiles_select_self_or_same_org allows platform admins to read all profiles.
      const actorIds = [...new Set(rows.map(r => r.actor_id).filter((id): id is string => id !== null))];
      const profileMap: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', actorIds);
        for (const p of profiles ?? []) {
          const prof = p as { id: string; first_name: string; last_name: string };
          const display = `${prof.first_name} ${prof.last_name}`.trim();
          if (display) profileMap[prof.id] = display;
        }
      }

      return rows.map(r => ({
        ...r,
        actor_display: r.actor_id ? (profileMap[r.actor_id] ?? null) : null,
      }));
    },
    staleTime: 30_000,
  });
}
