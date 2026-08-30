/**
 * Configuration Extraction Engine.
 *
 * Converts everything the platform knows about a tenant — Business Discovery
 * answers, plus already-real records elsewhere in the platform — into one
 * structured configuration object, grouped the same way the agreed Business
 * Profile Model groups them (identity / structure / resources /
 * trainingServices / ...). Nothing downstream of this module reads a raw
 * form field or queries a table directly — the Business Rules Engine and
 * Provisioning Engine both consume this shape only.
 *
 * "Reuse existing business knowledge" is priority #1 in the Automatic
 * Configuration ordering (Execution Direction, 2026-08-07): if a tenant
 * already has 3 real instructor rows, asking them to also type "3" into an
 * interview field is exactly the duplicated-question problem the platform is
 * meant to eliminate. `resolveKnownCount()` is the mechanism for that — a
 * live count from an existing table always wins over a typed answer; the
 * typed answer is only load-bearing before any real records exist yet.
 */

export const VALID_LICENCE_CATEGORIES = [
  'AM', 'A1', 'A2', 'A', 'B', 'B96', 'BE', 'C1', 'C', 'C1E', 'CE', 'D1', 'D', 'D1E', 'DE', 'Traktor',
] as const;

export type LicenceCategory = typeof VALID_LICENCE_CATEGORIES[number];

export interface RawBusinessDiscoveryAnswers {
  branches?:                          unknown;
  instructors?:                       unknown;
  vehicles?:                          unknown;
  licence_categories:                unknown;
  standard_lesson_duration_minutes:  unknown;
}

/** Facts the platform already knows independent of this interview submission. */
export interface KnownBusinessFacts {
  identity: {
    legalName:  string | null;
    brandName:  string | null;
    orgNumber:  string | null;
    vatNumber:  string | null;
    email:      string | null;
    phone:      string | null;
    /**
     * Visit address already collected in Company Settings, when complete
     * (all three parts present). Lets the Provisioning Engine create a
     * tenant's first branch from real, already-told-us data instead of
     * either asking again or fabricating a placeholder address.
     */
    visitAddress: { line1: string; zip: string; city: string } | null;
  };
  /** null = no real records exist yet, the typed answer is authoritative. */
  liveCounts: {
    branches:    number | null;
    instructors: number | null;
    vehicles:    number | null;
  };
  /**
   * Real signals the Capability Model (provisioning-capabilities.ts) infers
   * business capabilities from — never asked about directly, always read
   * from whatever module already owns that data (Företagskunder,
   * Kommunikation, public booking toggle in Company Settings).
   */
  capabilitySignals: {
    corporateCustomers:           number | null;
    activeCommunicationChannels:  number | null;
    publicBookingEnabled:         boolean;
  };
}

export interface ResolvedCount {
  value:  number;
  source: 'known_records' | 'tenant_answer';
}

export interface ExtractedBusinessConfiguration {
  identity: KnownBusinessFacts['identity'];
  structure: { branches: ResolvedCount };
  resources: { instructors: ResolvedCount; vehicles: ResolvedCount };
  trainingServices: { licenceCategories: LicenceCategory[]; standardLessonDurationMinutes: number };
}

export type ExtractionError = { field: string; message: string };

function resolveKnownCount(known: number | null, answer: unknown, fallback: number): ResolvedCount {
  if (known !== null && known > 0) return { value: known, source: 'known_records' };
  const n = Number(answer);
  return { value: Number.isInteger(n) ? n : fallback, source: 'tenant_answer' };
}

export function extractConfiguration(
  raw: RawBusinessDiscoveryAnswers,
  known: KnownBusinessFacts,
): { ok: true; value: ExtractedBusinessConfiguration } | { ok: false; error: ExtractionError } {
  const branches    = resolveKnownCount(known.liveCounts.branches, raw.branches, 1);
  const instructors = resolveKnownCount(known.liveCounts.instructors, raw.instructors, 1);
  const vehicles     = resolveKnownCount(known.liveCounts.vehicles, raw.vehicles, 0);
  const duration     = Number(raw.standard_lesson_duration_minutes);

  if (branches.source === 'tenant_answer' && (!Number.isInteger(branches.value) || branches.value < 1 || branches.value > 200)) {
    return { ok: false, error: { field: 'branches', message: 'branches must be a positive integer' } };
  }
  // >= 0, not >= 1 (Starta provperiod — direct registration + email
  // verification + password activation, 2026-08-30): the short registration
  // form no longer requires staff/instructors at signup — a real trial
  // submitting instructors: 0 hit this exact >= 1 floor and failed
  // provisioning outright ("instructors must be a positive integer"),
  // caught only by a real end-to-end test against the hosted database.
  // Mirrors vehicles' own non-negative bound directly below.
  if (instructors.source === 'tenant_answer' && (!Number.isInteger(instructors.value) || instructors.value < 0 || instructors.value > 2000)) {
    return { ok: false, error: { field: 'instructors', message: 'instructors must be a non-negative integer' } };
  }
  if (vehicles.source === 'tenant_answer' && (!Number.isInteger(vehicles.value) || vehicles.value < 0 || vehicles.value > 2000)) {
    return { ok: false, error: { field: 'vehicles', message: 'vehicles must be a non-negative integer' } };
  }
  // Platform floor: 40 minutes, 5-minute granularity (lesson_types_default_dur_rule /
  // lesson_types_min_dur_granularity DB constraints) — must match here or the
  // provisioning DB insert fails instead of surfacing a clear onboarding error.
  if (!Number.isInteger(duration) || duration < 40 || duration % 5 !== 0 || duration > 240) {
    return { ok: false, error: { field: 'standard_lesson_duration_minutes', message: 'standard_lesson_duration_minutes must be at least 40 and in steps of 5 minutes' } };
  }
  if (!Array.isArray(raw.licence_categories) || raw.licence_categories.length === 0) {
    return { ok: false, error: { field: 'licence_categories', message: 'licence_categories must be a non-empty array' } };
  }
  const licenceCategories = [...new Set(raw.licence_categories.map((c) => String(c)))];
  const invalid = licenceCategories.filter((c) => !VALID_LICENCE_CATEGORIES.includes(c as LicenceCategory));
  if (invalid.length > 0) {
    return { ok: false, error: { field: 'licence_categories', message: `Unknown licence categories: ${invalid.join(', ')}` } };
  }

  return {
    ok: true,
    value: {
      identity: known.identity,
      structure: { branches },
      resources: { instructors, vehicles },
      trainingServices: {
        licenceCategories: licenceCategories as LicenceCategory[],
        standardLessonDurationMinutes: duration,
      },
    },
  };
}
