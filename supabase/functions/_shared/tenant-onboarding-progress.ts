/**
 * Tenant Onboarding progress computation — shared between tenant-onboarding
 * (tenant-facing progress read) and platform-admin (Tenant Onboarding
 * Monitoring list + Go Live approval), so the completion logic has exactly
 * one owner (Development & Implementation Playbook, Section 1: "Every
 * capability has one owner").
 *
 * Implements Customer Provisioning & Tenant Onboarding Architecture,
 * Section 8. Pure orchestration layer: every step is read live from the
 * module that already owns that data — organizations, organization_locations,
 * memberships, data_migration_sessions, slot_templates, lesson_types,
 * vehicles, instructors, accounting_chart_of_accounts, vat_periods,
 * channel_configs. Nothing here is a second copy of any of it, and nothing
 * here is written anywhere except the Go Live event itself
 * (organizations.go_live_at / go_live_approved_by, written by platform-admin).
 *
 * Two categories (Architecture Section 8.1 / 8.2):
 *   - 'go_live_requirement'    — six steps, all gate Ready for Go Live.
 *   - 'recommended_configuration' — Staff Invitations and Data Migration.
 *     Optional business capabilities, not gated workflow steps (a
 *     single-owner-operator school may never need either) — shown with the
 *     same live-derived status as any other step, but never contribute to
 *     ready_for_go_live. This is why no "skip" action exists anywhere in
 *     this capability: neither is mandatory, so there is nothing to skip
 *     past, and no decision needs to be recorded.
 */

// deno-lint-ignore no-explicit-any
type DbClient = any;

export type StepStatus   = 'completed' | 'pending';
export type StepCategory = 'go_live_requirement' | 'recommended_configuration' | 'system';

export interface StepResult {
  key:      string;
  category: StepCategory;
  status:   StepStatus;
  detail:   Record<string, unknown>;
}

export interface OnboardingProgress {
  organization: {
    id: string;
    name: string;
    legal_name: string;
    org_number: string | null;
    go_live_at: string | null;
    go_live_approved_by: string | null;
  };
  steps:             StepResult[];
  ready_for_go_live: boolean;
  is_live:           boolean;
}

export async function computeOnboardingProgress(db: DbClient, orgId: string): Promise<OnboardingProgress | null> {
  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id, name, legal_name, org_number, go_live_at, go_live_approved_by')
    .eq('id', orgId)
    .maybeSingle();

  if (orgError || !org) return null;

  const today = new Date().toISOString().slice(0, 10);

  const [
    locationsCount,
    membershipsCount,
    migrationSessions,
    slotTemplatesCount,
    lessonTypesCount,
    vehiclesCount,
    instructorsCount,
    chartOfAccountsCount,
    currentVatPeriod,
    channelsEnabledCount,
  ] = await Promise.all([
    db.from('organization_locations').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'active').is('deleted_at', null),
    db.from('memberships').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'active'),
    db.from('data_migration_sessions').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'completed'),
    db.from('slot_templates').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('is_active', true),
    db.from('lesson_types').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('is_active', true),
    db.from('vehicles').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    db.from('instructors').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    db.from('accounting_chart_of_accounts').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('is_active', true),
    db.from('vat_periods').select('id').eq('organization_id', orgId)
      .lte('period_start', today).gte('period_end', today).maybeSingle(),
    db.from('channel_configs').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('enabled', true),
  ]);

  const steps: StepResult[] = [];

  // ── 8.1 Go Live Readiness Requirements — all six gate ready_for_go_live ──

  const profileComplete = Boolean(org.legal_name) && Boolean(org.org_number);
  steps.push({
    key: 'organization_profile', category: 'go_live_requirement',
    status: profileComplete ? 'completed' : 'pending',
    detail: { legal_name: org.legal_name, org_number: org.org_number },
  });

  const activeLocations = locationsCount.count ?? 0;
  steps.push({
    key: 'locations', category: 'go_live_requirement',
    status: activeLocations >= 1 ? 'completed' : 'pending',
    detail: { active_locations: activeLocations },
  });

  const bookingConfigured = (slotTemplatesCount.count ?? 0) >= 1 || (lessonTypesCount.count ?? 0) >= 1;
  steps.push({
    key: 'booking_configuration', category: 'go_live_requirement',
    status: bookingConfigured ? 'completed' : 'pending',
    detail: { slot_templates: slotTemplatesCount.count ?? 0, lesson_types: lessonTypesCount.count ?? 0 },
  });

  const vehiclesRegistered = (vehiclesCount.count ?? 0) >= 1;
  const instructorsRegistered = (instructorsCount.count ?? 0) >= 1;
  steps.push({
    key: 'vehicles_instructors', category: 'go_live_requirement',
    status: vehiclesRegistered && instructorsRegistered ? 'completed' : 'pending',
    detail: { vehicles: vehiclesCount.count ?? 0, instructors: instructorsCount.count ?? 0 },
  });

  const chartSeeded = (chartOfAccountsCount.count ?? 0) >= 1;
  const vatPeriodConfirmed = Boolean(currentVatPeriod.data);
  steps.push({
    key: 'finance_configuration', category: 'go_live_requirement',
    status: chartSeeded && vatPeriodConfirmed ? 'completed' : 'pending',
    detail: { chart_of_accounts_entries: chartOfAccountsCount.count ?? 0, current_vat_period: vatPeriodConfirmed },
  });

  const channelsEnabled = channelsEnabledCount.count ?? 0;
  steps.push({
    key: 'communication_configuration', category: 'go_live_requirement',
    status: channelsEnabled >= 1 ? 'completed' : 'pending',
    detail: { channels_enabled: channelsEnabled },
  });

  // ── 8.2 Recommended Configuration — never gates ready_for_go_live ────────

  const additionalStaff = Math.max((membershipsCount.count ?? 1) - 1, 0); // exclude the tenant admin
  steps.push({
    key: 'staff_invitations', category: 'recommended_configuration',
    status: additionalStaff >= 1 ? 'completed' : 'pending',
    detail: { additional_staff: additionalStaff },
  });

  const completedSessions = migrationSessions.count ?? 0;
  steps.push({
    key: 'data_migration', category: 'recommended_configuration',
    status: completedSessions >= 1 ? 'completed' : 'pending',
    detail: { completed_sessions: completedSessions },
  });

  // ── 8.3 Verification and Go Live ──────────────────────────────────────────

  const readyForGoLive = steps
    .filter((s) => s.category === 'go_live_requirement')
    .every((s) => s.status === 'completed');

  steps.push({
    key: 'verification', category: 'system',
    status: readyForGoLive ? 'completed' : 'pending',
    detail: { ready_for_go_live: readyForGoLive },
  });

  steps.push({
    key: 'go_live', category: 'system',
    status: org.go_live_at ? 'completed' : 'pending',
    detail: { go_live_at: org.go_live_at, go_live_approved_by: org.go_live_approved_by },
  });

  return {
    organization: {
      id: org.id, name: org.name, legal_name: org.legal_name, org_number: org.org_number,
      go_live_at: org.go_live_at, go_live_approved_by: org.go_live_approved_by,
    },
    steps,
    ready_for_go_live: readyForGoLive,
    is_live: Boolean(org.go_live_at),
  };
}
