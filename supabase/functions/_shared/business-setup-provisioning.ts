/**
 * Canonical business setup provisioning — the single implementation both
 * tenant-creation paths converge on (Tenant Registration Unification,
 * 2026-08-28).
 *
 * Extracted verbatim from trial-provisioning.ts's Steps B/B2/C/C2/C2b/C3 and
 * E1-E5, which previously ran ONLY for self-service trial signups. Platform
 * Admin's handleProvision (platform-admin/index.ts) now calls these exact
 * same functions when an admin supplies the optional canonical
 * business_setup payload, so a Platform-Admin-created tenant gets the same
 * branch/lesson types/pricing/VAT period/vehicles/instructors/staff/
 * schedule/slots initialization a self-service tenant gets — not a second,
 * thinner reimplementation.
 *
 * Deliberately does NOT create the organization, the administrator account,
 * or the org_owner membership — those remain each caller's own concern
 * (trial-provisioning.ts's session-based flow vs. platform-admin's
 * inviteUserByEmail-based flow), since those two flows have genuinely
 * different identity/rollback semantics (creation/provisioning authority
 * must not be weakened for either path). These functions only take an
 * EXISTING orgId and fill in its business configuration.
 *
 * Split into two functions, not one, because of a real data dependency —
 * not an arbitrary choice: instructor creation (E2) and staff invites (E3)
 * require an administrator account (userId) to already exist as the
 * actor/created_by, so both callers necessarily create their admin account
 * BETWEEN configuration and resources:
 *
 *   provisionBusinessConfiguration()  — channels, payment/person-lookup
 *                                       pilot defaults, Business Discovery
 *                                       pipeline, pricing, durations, VAT
 *                                       period. No admin account required.
 *   [ caller creates/confirms the administrator account here ]
 *   provisionBusinessResources()      — vehicles, instructors (+ their
 *                                       availability), additional staff
 *                                       invites, branches, bookable slots.
 *                                       Requires the administrator's userId.
 *
 * Neither function decides whether a validation shortfall (e.g. no price
 * set) is fatal — that differs by caller. Trial signup rolls the whole
 * organization back on a shortfall (see trial-provisioning.ts); an
 * admin-created organization must never be silently deleted out from under
 * a Platform Administrator, so handleProvision instead surfaces
 * validationWarnings and leaves the tenant exactly as complete as the admin
 * made it (the remaining gaps stay visible via Kom igång, same as any
 * organization created without business_setup at all).
 */

import { runFullPipeline, gatherKnownBusinessFacts } from './tenant-onboarding-pipeline.ts';
import type { RawBusinessDiscoveryAnswers } from './provisioning-extraction.ts';
import { createInstructorRecord, seedInstructorAvailabilityRules } from './instructor-provisioning.ts';
import { inviteNewStaffMember } from './staff-invite.ts';
import { logger } from './logger.ts';

// deno-lint-ignore no-explicit-any
type DbClient = any;

// ─── Answer shape — the canonical business setup model ───────────────────────
// Mirrors apps/web/src/modules/trial-onboarding/lib/businessSetupAnswers.ts's
// Answers interface field-for-field; keep both in sync when adding a field.

export interface VehicleAnswer {
  registration_number: string; make: string; model: string; model_year: number;
  transmission: 'manual' | 'automatic' | 'both'; fuel_type: string; seats: number;
  registration_expires_at: string; insurance_expires_at: string; color?: string;
}
export interface InstructorAnswer {
  first_name: string; last_name: string; email: string; phone?: string;
}
export interface StaffAnswer {
  first_name: string; last_name: string; email: string;
}
export interface BranchAnswer {
  name: string; address_line1: string; postal_code: string; city: string; phone?: string; email?: string;
}

export interface CompleteAnswers {
  contact_first_name?: string; contact_last_name?: string;
  legal_name?: string; org_number?: string; vat_number?: string; contact_phone?: string;
  country?: string; default_language?: string; timezone?: string;
  address_line1?: string; postal_code?: string; city?: string;
  branches?: number; licence_categories?: string[]; standard_lesson_duration_minutes?: number;
  lesson_type_durations?: Record<string, number>;
  standard_lesson_price_sek?: number;
  teaching_languages?: string[];
  vehicle_count?: number; vehicle_transmission?: string;
  administrators?: number; receptionists?: number; instructors?: number;
  working_hours_start?: string; working_hours_end?: string; weekend_schedule?: string;
  channels?: { email?: boolean; sms?: boolean; whatsapp?: boolean; invoice_notifications?: boolean };
  vat_period?: string; payment_methods?: string[];
  vehicles?: VehicleAnswer[];
  instructor_entries?: InstructorAnswer[];
  admin_entries?: StaffAnswer[];
  receptionist_entries?: StaffAnswer[];
  branch_entries?: BranchAnswer[];
}

export interface BusinessConfigurationOutcome {
  ok: boolean;
  validationWarnings: string[];
  lessonTypesCreated: number; packageTemplatesCreated: number; branchCreated: number; pricedLessonTypes: number;
  failure?: { code: string; message: string; status: number };
}

export interface BusinessResourcesOutcome {
  vehiclesCreated: number; instructorsCreated: number; staffInvited: number;
  additionalBranchesCreated: number;
  /** Multi-branch fallback: the primary location, created here (Step E4) rather than
   * by provisionBusinessConfiguration's pipeline, when the tenant declared >1 branch. */
  primaryBranchFallbackCreated: number;
  slotsGenerated: number;
}

function computeVatPeriod(frequency: string, today: Date): { start: string; end: string } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (frequency === 'yearly') {
    return { start: iso(new Date(Date.UTC(y, 0, 1))), end: iso(new Date(Date.UTC(y, 11, 31))) };
  }
  if (frequency === 'quarterly') {
    const qStartMonth = Math.floor(m / 3) * 3;
    return { start: iso(new Date(Date.UTC(y, qStartMonth, 1))), end: iso(new Date(Date.UTC(y, qStartMonth + 3, 0))) };
  }
  return { start: iso(new Date(Date.UTC(y, m, 1))), end: iso(new Date(Date.UTC(y, m + 1, 0))) };
}

export function buildBusinessHours(start: string | undefined, end: string | undefined, weekend: string | undefined) {
  const open = start || '08:00';
  const close = end || '17:00';
  const weekday = { open, close, closed: false };
  const weekendDay = { open, close, closed: weekend !== 'open' };
  return { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat: weekendDay, sun: weekendDay };
}

// Shared Nets/Stripe/Roaring pilot sandbox source organizations — same
// known-good ciphertext copy pattern regardless of which path provisions
// the new tenant.
const PAYMENT_SANDBOX_SOURCE_ORG_ID = 'b5972cf7-1517-41b6-9dd2-8ebe3d8d9eb6';
const ROARING_SANDBOX_SOURCE_ORG_ID = 'd4279c49-c619-4c66-8c4b-db5e5c80af99';

// ─── Configuration phase — no administrator account required ────────────────

export async function provisionBusinessConfiguration(
  db: DbClient, orgId: string, answers: CompleteAnswers, opts: { correlationId: string },
): Promise<BusinessConfigurationOutcome> {
  const { correlationId } = opts;

  // ── Step B: communication channel activation ─────────────────────────────
  if (answers.channels) {
    if (answers.channels.email) {
      await db.from('channel_configs').upsert(
        { organization_id: orgId, channel: 'email', enabled: true, provider: 'resend', metadata: { setup_preference: true, platform_pilot_configuration: true } },
        { onConflict: 'organization_id,channel' },
      );
    }
    if (answers.channels.sms) {
      await db.from('channel_configs').upsert(
        { organization_id: orgId, channel: 'sms', enabled: true, provider: '46elks', metadata: { setup_preference: true, platform_pilot_configuration: true, platform_account_note: 'bounded pilot credit' } },
        { onConflict: 'organization_id,channel' },
      );
    }
    if (answers.channels.whatsapp) {
      await db.from('channel_configs').upsert(
        { organization_id: orgId, channel: 'whatsapp', enabled: true, provider: 'meta', metadata: { setup_preference: true, platform_pilot_configuration: true, platform_account_note: 'Meta test number — delivery limited to pre-approved recipients' } },
        { onConflict: 'organization_id,channel' },
      );
    }
  }

  // ── Step B2: pilot-default payment (Nets + Stripe) and person-lookup (Roaring) ──
  if (Array.isArray(answers.payment_methods) && answers.payment_methods.includes('card')) {
    const { data: paymentSource } = await db
      .from('organizations').select('settings').eq('id', PAYMENT_SANDBOX_SOURCE_ORG_ID).maybeSingle();
    const sourceSettings = (paymentSource?.settings ?? {}) as Record<string, unknown>;

    const paymentUpdate: Record<string, unknown> = {};
    if (typeof sourceSettings['nets_secret_key'] === 'string' && typeof sourceSettings['nets_checkout_key'] === 'string') {
      paymentUpdate['nets_secret_key'] = sourceSettings['nets_secret_key'];
      paymentUpdate['nets_secret_key_masked'] = sourceSettings['nets_secret_key_masked'];
      paymentUpdate['nets_checkout_key'] = sourceSettings['nets_checkout_key'];
      paymentUpdate['nets_checkout_key_masked'] = sourceSettings['nets_checkout_key_masked'];
      paymentUpdate['nets_pilot_configuration'] = true;
    }
    if (typeof sourceSettings['stripe_secret_key'] === 'string') {
      paymentUpdate['stripe_secret_key'] = sourceSettings['stripe_secret_key'];
      paymentUpdate['stripe_secret_key_masked'] = sourceSettings['stripe_secret_key_masked'];
      if (typeof sourceSettings['stripe_publishable_key'] === 'string') {
        paymentUpdate['stripe_publishable_key'] = sourceSettings['stripe_publishable_key'];
      }
      paymentUpdate['stripe_pilot_configuration'] = true;
    }

    if (Object.keys(paymentUpdate).length > 0) {
      const { data: orgRow } = await db.from('organizations').select('settings').eq('id', orgId).maybeSingle();
      const current = (orgRow?.settings ?? {}) as Record<string, unknown>;
      const { error: paymentErr } = await db.from('organizations').update({ settings: { ...current, ...paymentUpdate } }).eq('id', orgId);
      if (paymentErr) {
        logger.warn('business-setup-provisioning.payment_pilot_default_failed', { correlation_id: correlationId, error: paymentErr.message });
      }
    }
  }

  {
    const { data: roaringSource } = await db
      .from('person_lookup_provider_configs')
      .select('credentials_encrypted, base_url, active_provider')
      .eq('organization_id', ROARING_SANDBOX_SOURCE_ORG_ID)
      .eq('is_active', true)
      .maybeSingle();
    if (roaringSource?.credentials_encrypted) {
      const { error: roaringErr } = await db.from('person_lookup_provider_configs').upsert(
        { organization_id: orgId, active_provider: roaringSource.active_provider ?? 'roaring', credentials_encrypted: roaringSource.credentials_encrypted, base_url: roaringSource.base_url, is_active: true },
        { onConflict: 'organization_id' },
      );
      if (roaringErr) {
        logger.warn('business-setup-provisioning.roaring_pilot_default_failed', { correlation_id: correlationId, error: roaringErr.message });
      }
    }
  }

  // ── Step C: the existing, already-proven configuration engine ────────────
  const known = await gatherKnownBusinessFacts(db, orgId);
  const raw: RawBusinessDiscoveryAnswers = {
    branches: answers.branches ?? 1,
    instructors: answers.instructor_entries?.length ?? answers.instructors,
    vehicles: answers.vehicles?.length ?? answers.vehicle_count,
    licence_categories: answers.licence_categories,
    standard_lesson_duration_minutes: answers.standard_lesson_duration_minutes ?? 45,
  };
  const pipelineResult = await runFullPipeline(db, orgId, raw, known, new Date().toISOString());
  if (!pipelineResult.ok) {
    return {
      ok: false, validationWarnings: [],
      lessonTypesCreated: 0, packageTemplatesCreated: 0, branchCreated: 0, pricedLessonTypes: 0,
      failure: { code: 'CONFIGURATION_FAILED', message: pipelineResult.message, status: pipelineResult.kind === 'validation' ? 422 : 500 },
    };
  }

  // ── Step C2: apply real pricing ───────────────────────────────────────────
  const priceSek = Number(answers.standard_lesson_price_sek);
  let pricedLessonTypes = 0;
  if (Number.isFinite(priceSek) && priceSek > 0) {
    const { data: pricedRows, error: priceErr } = await db
      .from('lesson_types').update({ pricing_sek: priceSek }).eq('organization_id', orgId).is('pricing_sek', null).select('id');
    if (priceErr) {
      logger.warn('business-setup-provisioning.pricing_apply_failed', { correlation_id: correlationId, error: priceErr.message });
    } else {
      pricedLessonTypes = pricedRows?.length ?? 0;
    }
  }

  // ── Step C2b: apply per-licence-category lesson durations ────────────────
  if (answers.lesson_type_durations && typeof answers.lesson_type_durations === 'object') {
    for (const [cat, minutes] of Object.entries(answers.lesson_type_durations)) {
      const duration = Number(minutes);
      if (!Number.isFinite(duration) || duration <= 0) continue;
      const { error: durationErr } = await db.from('lesson_types')
        .update({ default_duration_minutes: duration })
        .eq('organization_id', orgId).eq('code', `driving_${cat.toLowerCase()}`);
      if (durationErr) {
        logger.warn('business-setup-provisioning.duration_apply_failed', { correlation_id: correlationId, category: cat, error: durationErr.message });
      }
    }
  }

  // ── Step C3: real VAT period ──────────────────────────────────────────────
  const vatFrequency = ['monthly', 'quarterly', 'yearly'].includes(answers.vat_period ?? '') ? answers.vat_period as string : 'monthly';
  const vatPeriodRange = computeVatPeriod(vatFrequency, new Date());
  const { error: vatErr } = await db.rpc('create_vat_period', { p_org_id: orgId, p_period_start: vatPeriodRange.start, p_period_end: vatPeriodRange.end, p_frequency: vatFrequency });
  if (vatErr && !vatErr.message?.includes('VAT_PERIOD_DUPLICATE')) {
    logger.warn('business-setup-provisioning.vat_period_failed', { correlation_id: correlationId, error: vatErr.message });
  }

  // ── Validation Engine — non-fatal here; caller decides ────────────────────
  const validationWarnings: string[] = [];
  if (pricedLessonTypes === 0) validationWarnings.push('Inget pris angavs för lektionstyperna.');
  if (!Array.isArray(answers.licence_categories) || answers.licence_categories.length === 0) validationWarnings.push('Ingen behörighet vald.');

  return {
    ok: true, validationWarnings,
    lessonTypesCreated: pipelineResult.provisioning.executed.lesson_types?.created ?? 0,
    packageTemplatesCreated: pipelineResult.provisioning.executed.package_templates?.created ?? 0,
    branchCreated: pipelineResult.provisioning.executed.branch?.created ?? 0,
    pricedLessonTypes,
  };
}

// ─── Resources phase — requires the administrator's userId ──────────────────

export async function provisionBusinessResources(
  db: DbClient, orgId: string, answers: CompleteAnswers,
  opts: { userId: string; correlationId: string; actorEmail?: string | null; appOrigin?: string },
): Promise<BusinessResourcesOutcome> {
  const { userId, correlationId, actorEmail = null, appOrigin = Deno.env.get('APP_URL') ?? 'http://localhost:5173' } = opts;

  // ── Step E1: real vehicles ─────────────────────────────────────────────────
  let vehiclesCreated = 0;
  if (Array.isArray(answers.vehicles) && answers.vehicles.length > 0) {
    const vehicleRows = answers.vehicles
      .filter((v) => v.registration_number?.trim() && v.make?.trim() && v.model?.trim())
      .map((v) => ({
        organization_id: orgId, registration_number: v.registration_number.trim().toUpperCase(),
        make: v.make.trim(), model: v.model.trim(), model_year: v.model_year, color: v.color?.trim() || null,
        transmission: v.transmission, has_dual_controls: true, fuel_type: v.fuel_type, seats: v.seats,
        teaching_categories: answers.licence_categories?.length ? answers.licence_categories : ['B'],
        ownership_type: 'owned', operational_status: 'available',
        registration_expires_at: v.registration_expires_at, insurance_expires_at: v.insurance_expires_at,
      }));
    if (vehicleRows.length > 0) {
      const { data: insertedVehicles, error: vehicleErr } = await db.from('vehicles').insert(vehicleRows).select('id');
      if (vehicleErr) {
        logger.warn('business-setup-provisioning.vehicles_failed', { correlation_id: correlationId, error: vehicleErr.message });
      } else {
        vehiclesCreated = insertedVehicles?.length ?? 0;
      }
    }
  }

  // ── Step E2: real instructors + auto-seeded working hours ────────────────
  let instructorsCreated = 0;
  const createdInstructorIds: string[] = [];
  if (Array.isArray(answers.instructor_entries) && answers.instructor_entries.length > 0) {
    const weekdays = [1, 2, 3, 4, 5, ...(answers.weekend_schedule === 'open' ? [0, 6] : [])];
    for (const entry of answers.instructor_entries) {
      if (!entry.first_name?.trim() || !entry.last_name?.trim() || !entry.email?.trim()) continue;
      const result = await createInstructorRecord(db, orgId, {
        first_name: entry.first_name.trim(), last_name: entry.last_name.trim(), email: entry.email.trim().toLowerCase(),
        phone: entry.phone?.trim() || undefined, teaching_categories: answers.licence_categories, languages_spoken: answers.teaching_languages,
      }, userId);
      if (!result.ok) {
        logger.warn('business-setup-provisioning.instructor_create_failed', { correlation_id: correlationId, code: result.code, error: result.message });
        continue;
      }
      instructorsCreated += 1;
      const instructorId = result.instructor['id'] as string;
      createdInstructorIds.push(instructorId);
      if (answers.working_hours_start && answers.working_hours_end) {
        const seedResult = await seedInstructorAvailabilityRules(db, orgId, instructorId, { weekdays, startTime: answers.working_hours_start, endTime: answers.working_hours_end });
        if (!seedResult.ok) {
          logger.warn('business-setup-provisioning.instructor_availability_seed_failed', { correlation_id: correlationId, error: seedResult.error });
        }
      }
    }
  }

  // ── Step E3: additional administrators/receptionists ─────────────────────
  let staffInvited = 0;
  async function inviteEntries(entries: StaffAnswer[] | undefined, role: 'org_admin' | 'receptionist'): Promise<void> {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const { data: roleRow } = await db.from('roles').select('id').eq('name', role).eq('is_system_role', true).maybeSingle();
    const roleId = roleRow?.id as string | undefined;
    if (!roleId) {
      logger.error('business-setup-provisioning.staff_role_missing', { correlation_id: correlationId, role });
      return;
    }
    for (const entry of entries) {
      if (!entry.first_name?.trim() || !entry.last_name?.trim() || !entry.email?.trim()) continue;
      const result = await inviteNewStaffMember(db, orgId, roleId, {
        email: entry.email.trim().toLowerCase(), first_name: entry.first_name.trim(), last_name: entry.last_name.trim(), role,
      }, { actorId: userId, actorEmail, correlationId, appOrigin });
      if (!result.ok) {
        logger.warn('business-setup-provisioning.staff_invite_failed', { correlation_id: correlationId, role, code: result.code, error: result.message });
        continue;
      }
      staffInvited += 1;
    }
  }
  await inviteEntries(answers.admin_entries, 'org_admin');
  await inviteEntries(answers.receptionist_entries, 'receptionist');

  // ── Step E4: real branches ─────────────────────────────────────────────────
  let primaryBranchFallbackCreated = 0;
  let branchesCreated = 0;
  const businessHours = buildBusinessHours(answers.working_hours_start, answers.working_hours_end, answers.weekend_schedule);

  if (answers.branches === 1) {
    const { data: primaryLocation } = await db
      .from('organization_locations').select('id, settings')
      .eq('organization_id', orgId).eq('is_primary', true).is('deleted_at', null).maybeSingle();
    if (primaryLocation && !(primaryLocation.settings as Record<string, unknown> | null)?.['business_hours']) {
      const currentSettings = (primaryLocation.settings ?? {}) as Record<string, unknown>;
      const { error: hoursErr } = await db.from('organization_locations')
        .update({ settings: { ...currentSettings, business_hours: businessHours } }).eq('id', primaryLocation.id);
      if (hoursErr) {
        logger.warn('business-setup-provisioning.primary_branch_hours_failed', { correlation_id: correlationId, error: hoursErr.message });
      }
    }
  }

  if (answers.branches !== 1 && answers.address_line1 && answers.postal_code && answers.city) {
    const { count: existingLocations } = await db
      .from('organization_locations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active').is('deleted_at', null);
    if ((existingLocations ?? 0) === 0) {
      const { error: primaryBranchErr } = await db.from('organization_locations').insert({
        organization_id: orgId, name: answers.legal_name ?? 'Huvudkontor',
        address_line1: answers.address_line1, postal_code: answers.postal_code, city: answers.city,
        country: 'SE', is_primary: true, status: 'active', settings: { business_hours: businessHours },
      });
      if (primaryBranchErr) {
        logger.warn('business-setup-provisioning.primary_branch_failed', { correlation_id: correlationId, error: primaryBranchErr.message });
      } else {
        primaryBranchFallbackCreated = 1;
      }
    }
  }
  if (Array.isArray(answers.branch_entries) && answers.branch_entries.length > 0) {
    const branchRows = answers.branch_entries
      .filter((b) => b.name?.trim() && b.address_line1?.trim() && b.postal_code?.trim() && b.city?.trim())
      .map((b) => ({
        organization_id: orgId, name: b.name.trim(), address_line1: b.address_line1.trim(), postal_code: b.postal_code.trim(), city: b.city.trim(),
        country: 'SE', phone: b.phone?.trim() || null, email: b.email?.trim() || null, is_primary: false, status: 'active', settings: { business_hours: businessHours },
      }));
    if (branchRows.length > 0) {
      const { data: insertedBranches, error: branchErr } = await db.from('organization_locations').insert(branchRows).select('id');
      if (branchErr) {
        logger.warn('business-setup-provisioning.branch_entries_failed', { correlation_id: correlationId, error: branchErr.message });
      } else {
        branchesCreated += insertedBranches?.length ?? 0;
      }
    }
  }

  // ── Step E5: materialize real, bookable lesson_slots ──────────────────────
  let slotsGenerated = 0;
  if (createdInstructorIds.length > 0) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const rangeEndIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: genResult, error: genErr } = await db.rpc('generate_slots_for_organization', { p_organization_id: orgId, p_lesson_type_id: null, p_start_date: todayIso, p_end_date: rangeEndIso });
    if (genErr) {
      logger.warn('business-setup-provisioning.slot_generation_failed', { correlation_id: correlationId, error: genErr.message });
    } else {
      const row = (Array.isArray(genResult) ? genResult[0] : genResult) as { slots_created?: number } | undefined;
      slotsGenerated = row?.slots_created ?? 0;
    }
  }

  return {
    vehiclesCreated, instructorsCreated, staffInvited,
    additionalBranchesCreated: branchesCreated,
    primaryBranchFallbackCreated,
    slotsGenerated,
  };
}
