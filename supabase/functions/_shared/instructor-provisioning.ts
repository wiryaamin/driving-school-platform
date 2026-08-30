/**
 * Shared instructor creation + working-hours seeding logic.
 *
 * Extracted so both the authenticated `instructors` Edge Function
 * (POST /instructors, called from InstructorForm.tsx) and `trial-signup`
 * (pre-account onboarding questionnaire) create instructor records — and
 * seed their initial `instructor_availability_rules` — through the exact
 * same code path. Neither caller may diverge on required fields, defaults,
 * or duplicate-detection: this is the single source of truth for what "an
 * instructor" is on this platform.
 */

// deno-lint-ignore no-explicit-any
type DbClient = any;

import { identityCryptoConfigured, encryptPersonalNumber, hashPersonalNumber } from './bankid-crypto.ts';

export interface CreateInstructorDto {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  personnummer?: string;
  identity_type?: string;
  employment_type?: string;
  teaching_categories?: string[];
  languages_spoken?: string[];
  [key: string]: unknown;
}

export type CreateInstructorResult =
  | { ok: true; instructor: Record<string, unknown> }
  | { ok: false; code: 'IDENTITY_CRYPTO_NOT_CONFIGURED' | 'DUPLICATE_EMAIL' | 'DUPLICATE_PERSONAL_NUMBER' | 'INSERT_FAILED'; message: string };

/**
 * Turns a raw `personnummer` (YYYYMMDD-XXXX) into personnummer_encrypted/
 * _hash/_last4 via AES-256-GCM + HMAC-SHA256 and drops the raw field.
 *
 * Exported: also used directly by instructors/index.ts's handleUpdate,
 * which doesn't go through createInstructorRecord (that's create-only) but
 * needs the identical encrypt/hash/last4 transform whenever an update
 * includes a new personnummer. A local copy in instructors/index.ts existed
 * here previously and was consolidated into this one shared implementation
 * so the two call sites can't independently drift on how a personnummer is
 * turned into its stored form — Partial<> because handleUpdate's DTO has
 * every field optional (a PATCH), unlike handleCreate's.
 */
export async function resolvePersonnummer(
  dto: Partial<CreateInstructorDto>,
): Promise<{ ok: true; dto: Record<string, unknown> } | { ok: false; code: 'IDENTITY_CRYPTO_NOT_CONFIGURED'; message: string }> {
  const { personnummer, ...rest } = dto;
  if (personnummer === undefined) return { ok: true, dto: rest };

  if (!identityCryptoConfigured()) {
    return { ok: false, code: 'IDENTITY_CRYPTO_NOT_CONFIGURED', message: 'Identity encryption is not configured' };
  }

  const raw = personnummer.replace(/-/g, '');
  const [personnummer_encrypted, personnummer_hash] = await Promise.all([
    encryptPersonalNumber(raw),
    hashPersonalNumber(raw),
  ]);

  return {
    ok: true,
    dto: {
      ...rest,
      personnummer_encrypted,
      personnummer_hash,
      personnummer_last4: raw.slice(-4),
      identity_type: rest.identity_type ?? 'personnummer',
    },
  };
}

export async function createInstructorRecord(
  db: DbClient,
  orgId: string,
  dto: CreateInstructorDto,
  actorId: string | null,
): Promise<CreateInstructorResult> {
  const pnrResult = await resolvePersonnummer(dto);
  if (!pnrResult.ok) return { ok: false, code: pnrResult.code, message: pnrResult.message };
  const resolved = pnrResult.dto as Record<string, unknown> & { email: string; personnummer_hash?: string };

  const { data: emailDup } = await db
    .from('instructors').select('id')
    .eq('organization_id', orgId).eq('email', resolved.email).is('deleted_at', null).maybeSingle();
  if (emailDup !== null) {
    return { ok: false, code: 'DUPLICATE_EMAIL', message: `An instructor with email ${resolved.email} already exists in this organisation` };
  }

  if (resolved.personnummer_hash !== undefined) {
    const { data: pnrDup } = await db
      .from('instructors').select('id')
      .eq('organization_id', orgId).eq('personnummer_hash', resolved.personnummer_hash).is('deleted_at', null).maybeSingle();
    if (pnrDup !== null) {
      return { ok: false, code: 'DUPLICATE_PERSONAL_NUMBER', message: 'An instructor with this personnummer is already registered in this organisation' };
    }
  }

  const { data: instructor, error } = await db
    .from('instructors')
    .insert({ ...resolved, organization_id: orgId, created_by: actorId, updated_by: actorId })
    .select().single();
  if (error || !instructor) {
    return { ok: false, code: 'INSERT_FAILED', message: error?.message ?? 'Failed to create instructor' };
  }
  return { ok: true, instructor };
}

// Working-hours slot cadence used everywhere an instructor's recurring
// availability is auto-seeded from a simple start/end range — matches
// InstructorForm.tsx's Arbetstider section exactly (40-min lessons, 20-min
// buffer, back-to-back on the hour — duration + buffer = 60 is the
// invariant generate_slots_for_rule's v_slot_step relies on to land slots
// exactly on the hour; 40 replaces the previous 45-min default so it
// matches the platform's own standard lesson length everywhere else,
// 2026-08-30).
export const WORKING_HOURS_SLOT_DURATION_MIN = 40;
export const WORKING_HOURS_SLOT_BUFFER_MIN = 20;

/**
 * Seeds `instructor_availability_rules` for a working-day range, mirroring
 * useCreateAvailabilityRulesBatch (useInstructors.ts) row-for-row: one rule
 * per day, day_of_week 0=Sun..6=Sat (this table's own encoding, distinct
 * from slot_templates'/lesson_waitlist_entries' 1=Mon..7=Sun ISO encoding).
 */
export async function seedInstructorAvailabilityRules(
  db: DbClient,
  orgId: string,
  instructorId: string,
  opts: { weekdays: number[]; startTime: string; endTime: string },
): Promise<{ ok: boolean; error?: string }> {
  if (opts.weekdays.length === 0) return { ok: true };
  const rows = opts.weekdays.map((day_of_week) => ({
    instructor_id: instructorId,
    organization_id: orgId,
    day_of_week,
    start_time: opts.startTime,
    end_time: opts.endTime,
    slot_duration_minutes: WORKING_HOURS_SLOT_DURATION_MIN,
    slot_buffer_minutes: WORKING_HOURS_SLOT_BUFFER_MIN,
    timezone: 'Europe/Stockholm',
  }));
  const { error } = await db.from('instructor_availability_rules').insert(rows);
  return error ? { ok: false, error: error.message } : { ok: true };
}
