/**
 * Shared Business Discovery provisioning pipeline — Configuration Extraction
 * → Business Rules → save profile → Provisioning. Extracted verbatim from
 * tenant-onboarding/index.ts (2026-08-07) so the new pre-account trial-signup
 * Edge Function can call the exact same, already-proven pipeline instead of
 * a second, drifting reimplementation ("do not duplicate provisioning
 * logic" — the same principle already applied to Business Capabilities).
 *
 * tenant-onboarding/index.ts (authenticated, in-app "Berätta om er
 * verksamhet") and trial-signup/index.ts (public, pre-account onboarding
 * wizard) both call runFullPipeline() — behavior for the existing
 * authenticated path is unchanged, this is a pure move.
 */

import {
  extractConfiguration, type RawBusinessDiscoveryAnswers, type KnownBusinessFacts, type ExtractedBusinessConfiguration,
} from './provisioning-extraction.ts';
import { deriveBusinessRules, type BusinessRules } from './provisioning-rules.ts';
import { runProvisioning, type ProvisioningResult } from './provisioning-engine.ts';
import { type CapabilityAssessment } from './provisioning-capabilities.ts';
import { deriveDomains, type DomainAssessment } from './provisioning-domains.ts';

// deno-lint-ignore no-explicit-any
type DbClient = any;

export interface SavedBusinessProfileRecord {
  branches: number; instructors: number; vehicles: number;
  licence_categories: string[]; standard_lesson_duration_minutes: number;
  completed_at: string;
  count_sources: { branches: string; instructors: string; vehicles: string };
  analysis: { archetype: string; business_type: string; signals: Record<string, number>; computed_at: string };
  /** Absent on profiles saved before the Capability Model shipped — treat as "unknown, recompute". */
  capabilities?: CapabilityAssessment[];
  /** Absent on profiles saved before the Business Domain layer shipped — same treatment. */
  domains?: DomainAssessment[];
}

export function buildProfileRecord(
  config: ExtractedBusinessConfiguration, rules: BusinessRules, domains: DomainAssessment[], capabilities: CapabilityAssessment[], completedAt: string,
): SavedBusinessProfileRecord {
  return {
    branches:                          config.structure.branches.value,
    instructors:                       config.resources.instructors.value,
    vehicles:                          config.resources.vehicles.value,
    licence_categories:                config.trainingServices.licenceCategories,
    standard_lesson_duration_minutes:  config.trainingServices.standardLessonDurationMinutes,
    completed_at:                      completedAt,
    // Which count came from real existing records vs. what the tenant
    // typed — "reuse existing business knowledge" (Automatic Configuration
    // priority #1) should be inspectable, not just applied silently.
    count_sources: {
      branches:    config.structure.branches.source,
      instructors: config.resources.instructors.source,
      vehicles:    config.resources.vehicles.source,
    },
    analysis: {
      archetype:     rules.archetype,
      business_type: rules.businessType,
      signals:       rules.signals,
      computed_at:   rules.computedAt,
    },
    domains,
    capabilities,
  };
}

/** Sorted active capability keys — the cheap, stable thing to diff two assessments by. */
export function activeCapabilityKeys(capabilities: CapabilityAssessment[] | undefined): string {
  return (capabilities ?? []).filter((c) => c.active).map((c) => c.key).sort().join(',');
}

export type PipelineResult =
  | { ok: true; config: ExtractedBusinessConfiguration; rules: BusinessRules; domains: DomainAssessment[]; capabilities: CapabilityAssessment[]; provisioning: ProvisioningResult; record: SavedBusinessProfileRecord }
  | { ok: false; kind: 'validation'; message: string }
  | { ok: false; kind: 'save_failed'; message: string };

export async function runFullPipeline(
  db: DbClient, orgId: string, raw: RawBusinessDiscoveryAnswers, known: KnownBusinessFacts, completedAt: string,
): Promise<PipelineResult> {
  const extraction = extractConfiguration(raw, known);
  if (!extraction.ok) return { ok: false, kind: 'validation', message: extraction.error.message };

  const config = extraction.value;
  const rules  = deriveBusinessRules(config);
  // Business Domains (2026-08-07) sit above Business Capabilities; this
  // single call derives both — capabilities are not computed a second time
  // anywhere else in this pipeline.
  const { domains, capabilities } = deriveDomains(config, rules, known);
  const record = buildProfileRecord(config, rules, domains, capabilities, completedAt);

  const { error: saveErr } = await db.from('organizations').update({ business_profile: record }).eq('id', orgId);
  if (saveErr) return { ok: false, kind: 'save_failed', message: saveErr.message };

  const provisioning = await runProvisioning(db, orgId, rules, known, capabilities);
  return { ok: true, config, rules, domains, capabilities, provisioning, record };
}

// ─── Known facts gathering ─────────────────────────────────────────────────────
// "Can an existing record determine it?" (Automatic Configuration, priority
// #1) — checked here, once, before extraction ever looks at what the tenant
// typed. Real branch/instructor/vehicle rows always outrank a typed guess;
// see resolveKnownCount() in provisioning-extraction.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gatherKnownBusinessFacts(db: any, orgId: string): Promise<KnownBusinessFacts> {
  const [orgRes, locationsRes, instructorsRes, vehiclesRes, corporateRes, channelsRes] = await Promise.all([
    db.from('organizations').select('name, legal_name, org_number, vat_number, settings').eq('id', orgId).maybeSingle(),
    db.from('organization_locations').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'active').is('deleted_at', null),
    db.from('instructors').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).is('deleted_at', null),
    db.from('vehicles').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).is('deleted_at', null),
    // Business Capability signals (Execution Direction, 2026-08-07 —
    // "Next Evolution") — real rows/flags this org already has, read from
    // whichever module owns that data. Never asked about directly.
    db.from('corporate_customers').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).is('deleted_at', null),
    db.from('channel_configs').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('enabled', true),
  ]);

  const settings = (orgRes.data?.settings ?? {}) as Record<string, unknown>;

  // Prefer the visit address (where lessons/branch actually operate); fall
  // back to the postal address if visit fields weren't filled in. Only
  // usable when all three parts are present — a partial address can't
  // safely become a branch record.
  const visitLine1 = (settings['visit_address'] as string | undefined) || (settings['postal_address'] as string | undefined) || '';
  const visitZip    = (settings['visit_zip'] as string | undefined)    || (settings['postal_zip'] as string | undefined)    || '';
  const visitCity   = (settings['visit_city'] as string | undefined)   || (settings['postal_city'] as string | undefined)   || '';
  const visitAddress = (visitLine1 && visitZip && visitCity) ? { line1: visitLine1, zip: visitZip, city: visitCity } : null;

  // Matches the CompanySettingsPage form's own default — absence of the key
  // means the tenant never touched the toggle, not that they turned it off.
  const publicBookingEnabled = (settings['public_booking_enabled'] as boolean | undefined) ?? true;

  return {
    identity: {
      legalName: orgRes.data?.legal_name ?? null,
      brandName: orgRes.data?.name ?? null,
      orgNumber: orgRes.data?.org_number ?? null,
      vatNumber: orgRes.data?.vat_number ?? null,
      email:     (settings['customer_email'] as string | undefined) ?? null,
      phone:     (settings['customer_phone'] as string | undefined) ?? null,
      visitAddress,
    },
    liveCounts: {
      branches:    locationsRes.count ?? null,
      instructors: instructorsRes.count ?? null,
      vehicles:    vehiclesRes.count ?? null,
    },
    capabilitySignals: {
      corporateCustomers:          corporateRes.count ?? null,
      activeCommunicationChannels: channelsRes.count ?? null,
      publicBookingEnabled,
    },
  };
}
