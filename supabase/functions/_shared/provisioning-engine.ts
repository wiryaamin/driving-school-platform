/**
 * Provisioning Engine.
 *
 * Executes the Dependency Engine's resolved order, running each
 * `implemented` node's real executor against the Business Rules Engine's
 * output. Not-yet-implemented nodes are skipped and reported as such —
 * never silently treated as done.
 *
 * Three node executors exist today, all reusing already-proven patterns from
 * elsewhere in this codebase rather than inventing new ones:
 *   - branch: creates exactly one organization_locations row, and only when
 *     every one of the "can this be automated" tests actually passes — the
 *     tenant said they operate one branch, no real location row exists yet,
 *     AND a complete visit address was already typed into Company Settings.
 *     Address text is never invented; when any part is missing the executor
 *     reports created:0 rather than guessing. Multi-branch (>1) is always
 *     left to the tenant — which specific addresses those branches are is a
 *     genuine business decision no existing data can answer.
 *   - lesson_types: same idempotent-insert shape already used by the
 *     Business Discovery slice (name/category/duration filled, pricing left
 *     null — mirrors real production data, e.g. Rissne Trafikskola).
 *   - schedule_templates: one scheduling_generation_configs row per lesson
 *     type (existing table — 20260528000008_phase2d_scheduling_ops_infra.sql),
 *     auto_generation_enabled/generation_frequency set from the Business
 *     Rules Engine's schedulingModel — the exact archetype-driven decision
 *     Business Discovery Engine v2 Section 2 describes.
 *   - package_templates: three tiered package_catalog rows (5/10/20 lessons)
 *     for the 'driving' lesson_category — every school teaches driving
 *     lessons, and a tiered assortment is itself the Swedish best practice
 *     (not a specific guessed size). default_price is always 0: exact SEK
 *     pricing is a genuine business decision no existing data answers,
 *     mirroring lesson_types' pricing_sek being left null. Deliberately
 *     does NOT touch package_offerings (the sellable, priced instance) —
 *     the tenant must still explicitly price and publish a template before
 *     it can be sold, same two-step gap Ekonomi → Lektionstyper already has
 *     for lesson_types.
 *
 * instructor/vehicle remain unimplemented deliberately: a specific person's
 * name/email or a specific vehicle's registration number are not inferable
 * from anything the platform already knows, so there is no safe executor to
 * write for them — see provisioning-dependency.ts.
 *
 * Business Capability gating (provisioning-capabilities.ts): a node only
 * runs when at least one *active* capability owns it. Today every
 * implemented node (branch/lesson_types/schedule_templates) is owned by
 * `core_operations`, which is always active — so this gate has no
 * observable effect on any org yet. It exists so the causal chain the
 * Capability Model describes (Business Knowledge → Capability →
 * Provisioning) is real and load-bearing now, not just documentation —
 * the next capability-specific executor (e.g. something only
 * `motorcycle_training` should provision) plugs in without touching this
 * loop again.
 */

import { resolveExecutionOrder, type ProvisioningNodeKey, PROVISIONING_GRAPH } from './provisioning-dependency.ts';
import { activeNodeKeys, type CapabilityAssessment } from './provisioning-capabilities.ts';
import type { BusinessRules } from './provisioning-rules.ts';
import type { KnownBusinessFacts } from './provisioning-extraction.ts';

// deno-lint-ignore no-explicit-any
type DbClient = any;

export interface ProvisioningResult {
  executed:      Partial<Record<ProvisioningNodeKey, { created: number; updated?: number }>>;
  skipped:       ProvisioningNodeKey[];
  notApplicable: ProvisioningNodeKey[];
}

export async function runProvisioning(
  db: DbClient, orgId: string, rules: BusinessRules, known: KnownBusinessFacts, capabilities: CapabilityAssessment[],
): Promise<ProvisioningResult> {
  const order = resolveExecutionOrder();
  const byKey = new Map(PROVISIONING_GRAPH.map((n) => [n.key, n]));
  const owned  = activeNodeKeys(capabilities);
  const result: ProvisioningResult = { executed: {}, skipped: [], notApplicable: [] };

  for (const key of order) {
    const node = byKey.get(key)!;
    if (!node.implemented) { result.skipped.push(key); continue; }
    if (!owned.has(key)) { result.notApplicable.push(key); continue; }

    if (key === 'branch') {
      const created = await provisionBranch(db, orgId, rules, known);
      result.executed.branch = { created };
    }
    if (key === 'lesson_types') {
      const outcome = await provisionLessonTypes(db, orgId, rules);
      result.executed.lesson_types = { created: outcome.createdCount };
    }
    if (key === 'schedule_templates') {
      // Scoped to EVERY active lesson type the org has, not just the ones
      // matching this run's submitted licence categories — the archetype's
      // generation frequency is an org-wide operational decision (Business
      // Knowledge Evolution: a school's older lesson types, from categories
      // not mentioned in the latest interview answer, must still track the
      // current archetype, not stay frozen at whatever was true when they
      // were created).
      const outcome = await provisionScheduleTemplates(db, orgId, rules);
      result.executed.schedule_templates = outcome;
    }
    if (key === 'package_templates') {
      const created = await provisionPackageTemplates(db, orgId);
      result.executed.package_templates = { created };
    }
  }

  return result;
}

// ─── branch executor ────────────────────────────────────────────────────────
// Only creates a location when EVERY automation test passes: the tenant
// operates exactly one branch, no real organization_locations row exists
// yet, and a complete visit address was already typed into Company
// Settings. Anything less (>1 branch, or a missing/partial address) is a
// genuine business decision — created:0, left for the tenant to do via
// Settings → Filialer, same as before this executor existed.
async function provisionBranch(
  db: DbClient, orgId: string, rules: BusinessRules, known: KnownBusinessFacts,
): Promise<number> {
  if (rules.signals.branches !== 1) return 0;
  if (known.liveCounts.branches !== null && known.liveCounts.branches > 0) return 0;
  const address = known.identity.visitAddress;
  if (!address) return 0;

  // Swedish postal code format the table enforces (organization_locations_postal_fmt).
  const normalizedZip = address.zip.trim();
  if (!/^\d{3}\s?\d{2}$/.test(normalizedZip)) return 0;

  // Idempotency guard: another request could have raced in a location
  // between gatherKnownBusinessFacts() and this insert.
  const { count: raceCheck } = await db
    .from('organization_locations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).eq('status', 'active').is('deleted_at', null);
  if ((raceCheck ?? 0) > 0) return 0;

  const { error } = await db.from('organization_locations').insert({
    organization_id: orgId,
    name: known.identity.brandName ?? 'Huvudkontor',
    address_line1: address.line1,
    postal_code: normalizedZip,
    city: address.city,
    country: 'SE',
    email: known.identity.email,
    phone: known.identity.phone,
    is_primary: true,
    status: 'active',
  });
  return error ? 0 : 1;
}

// ─── lesson_types executor ─────────────────────────────────────────────────

async function provisionLessonTypes(
  db: DbClient, orgId: string, rules: BusinessRules,
): Promise<{ createdCount: number; lessonTypeIds: string[] }> {
  const { data: existing, error: existingErr } = await db
    .from('lesson_types')
    .select('id, code')
    .eq('organization_id', orgId);
  if (existingErr) return { createdCount: 0, lessonTypeIds: [] };

  const existingRows = (existing ?? []) as Array<{ id: string; code: string }>;
  const existingByCode = new Map(existingRows.map((r) => [r.code, r.id]));

  const wanted = rules.lessonModel.licenceCategories.map((cat) => ({
    cat, code: `driving_${cat.toLowerCase()}`,
  }));

  const toInsert = wanted
    .filter(({ code }) => !existingByCode.has(code))
    .map(({ cat, code }, i) => ({
      organization_id: orgId,
      name: `Körlektion ${cat}`,
      code,
      category: 'driving',
      default_duration_minutes: rules.lessonModel.defaultDurationMinutes,
      requires_vehicle: true,
      requires_instructor: true,
      is_active: true,
      display_order: i,
    }));

  let createdCount = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error } = await db.from('lesson_types').insert(toInsert).select('id, code');
    if (!error && inserted) {
      createdCount = inserted.length;
      for (const row of inserted as Array<{ id: string; code: string }>) existingByCode.set(row.code, row.id);
    }
  }

  const lessonTypeIds = wanted
    .map(({ code }) => existingByCode.get(code))
    .filter((id): id is string => Boolean(id));

  return { createdCount, lessonTypeIds };
}

// ─── schedule_templates executor ───────────────────────────────────────────
// This table has no other writer anywhere in the codebase (no settings UI
// exposes generation_frequency/auto_generation_enabled for editing) — so
// updating an existing row to match a freshly-recomputed schedulingModel
// can never clobber a tenant's own manual choice. That's what makes it safe
// to keep these rows current as the business grows (e.g. solo → multiBranch
// should flip manual generation to weekly-automatic without the tenant
// having to notice and go find a settings toggle) — Business Knowledge
// Evolution, not just a one-time default at signup.

async function provisionScheduleTemplates(
  db: DbClient, orgId: string, rules: BusinessRules,
): Promise<{ created: number; updated: number }> {
  const { data: activeLessonTypes, error: activeErr } = await db
    .from('lesson_types')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_active', true);
  if (activeErr) return { created: 0, updated: 0 };

  const lessonTypeIds = ((activeLessonTypes ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (lessonTypeIds.length === 0) return { created: 0, updated: 0 };

  const { data: existing, error: existingErr } = await db
    .from('scheduling_generation_configs')
    .select('lesson_type_id, generation_frequency, auto_generation_enabled')
    .eq('organization_id', orgId)
    .in('lesson_type_id', lessonTypeIds);
  if (existingErr) return { created: 0, updated: 0 };

  type ExistingConfig = { lesson_type_id: string; generation_frequency: string; auto_generation_enabled: boolean };
  const existingByLessonType = new Map(((existing ?? []) as ExistingConfig[]).map((r) => [r.lesson_type_id, r]));

  const toInsert = lessonTypeIds
    .filter((id) => !existingByLessonType.has(id))
    .map((lessonTypeId) => ({
      organization_id: orgId,
      lesson_type_id: lessonTypeId,
      generation_frequency: rules.schedulingModel.generationFrequency,
      auto_generation_enabled: rules.schedulingModel.autoGenerationEnabled,
    }));

  let created = 0;
  if (toInsert.length > 0) {
    const { error } = await db.from('scheduling_generation_configs').insert(toInsert);
    if (!error) created = toInsert.length;
  }

  const toUpdate = lessonTypeIds.filter((id) => {
    const row = existingByLessonType.get(id);
    if (!row) return false;
    return row.generation_frequency !== rules.schedulingModel.generationFrequency
      || row.auto_generation_enabled !== rules.schedulingModel.autoGenerationEnabled;
  });

  let updated = 0;
  for (const lessonTypeId of toUpdate) {
    const { error } = await db.from('scheduling_generation_configs')
      .update({
        generation_frequency: rules.schedulingModel.generationFrequency,
        auto_generation_enabled: rules.schedulingModel.autoGenerationEnabled,
      })
      .eq('organization_id', orgId).eq('lesson_type_id', lessonTypeId);
    if (!error) updated += 1;
  }

  return { created, updated };
}

// ─── package_templates executor ────────────────────────────────────────────
// Tiered 'driving' package_catalog templates — see the module comment above
// for exactly what this does and does not do (no offerings, no pricing).

const PACKAGE_TIERS = [5, 10, 20] as const;

async function provisionPackageTemplates(db: DbClient, orgId: string): Promise<number> {
  const { data: existing, error: existingErr } = await db
    .from('package_catalog')
    .select('default_quantity')
    .eq('organization_id', orgId)
    .eq('lesson_category', 'driving');
  if (existingErr) return 0;

  const existingQuantities = new Set(((existing ?? []) as Array<{ default_quantity: number }>).map((r) => r.default_quantity));
  const toInsert = PACKAGE_TIERS
    .filter((qty) => !existingQuantities.has(qty))
    .map((qty) => ({
      organization_id: orgId,
      name: `Paket – ${qty} lektioner`,
      description: 'Automatiskt skapad mall — ange pris för att aktivera för försäljning.',
      package_type: 'driving',
      lesson_category: 'driving',
      default_quantity: qty,
      default_price: 0,
      currency: 'SEK',
      validity_days: 365,
      is_active: true,
    }));

  if (toInsert.length === 0) return 0;

  const { error } = await db.from('package_catalog').insert(toInsert);
  return error ? 0 : toInsert.length;
}
