import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { resolveLessonPackageCredit, insertLessonBooking, consumeLessonPackageCreditOrCompensate, reverseLessonCreditOnCancellation } from '../_shared/lesson-credits.ts';
import { getCancellationDeadlineHours, isWithinCancellationDeadline, DEFAULT_CANCELLATION_DEADLINE_HOURS } from '../_shared/cancellation-policy.ts';
import { registerPushToken, revokePushToken } from '../_shared/push-tokens.ts';
import { decryptCredential, encryptCredential } from '../_shared/credential-crypto.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const PORTAL_TOKEN_TTL_DAYS = 30;
const JSON_CT = { 'Content-Type': 'application/json' } as const;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const GenerateTokenSchema = z.object({
  student_id: z.string().uuid(),
});

const CreateBookingSchema = z.object({
  slot_id:         z.string().uuid(),
  // Required only when the slot itself has no fixed lesson type (generic
  // availability) — the lesson type the student was browsing under when
  // they picked this slot. See GET /slots' comment for why generic slots
  // are now visible here at all.
  lesson_type_id:  z.string().uuid().optional(),
});

const RescheduleSchema = z.object({
  new_slot_id: z.string().uuid(),
});

const CancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

const SlotsQuerySchema = z.object({
  from: z.string().optional(),
  to:   z.string().optional(),
});

const RegisterPushTokenSchema = z.object({
  token:          z.string().min(16),
  previous_token: z.string().min(16).optional(),
  platform:       z.enum(['web', 'ios', 'android']).optional(),
});

const RevokePushTokenSchema = z.object({
  token_id: z.string().uuid(),
});

const WaitlistJoinSchema = z.object({
  lesson_type_id:          z.string().uuid(),
  preferred_instructor_id: z.string().uuid().optional(),
});

const PracticeLogSchema = z.object({
  practice_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_minutes: z.number().int().min(1).max(480),
  notes:            z.string().max(500).optional(),
});

// ─── Response helpers ─────────────────────────────────────────────────────────

function ok<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), { status, headers: JSON_CT });
}

function fail(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_CT });
}

// ─── Authorization ────────────────────────────────────────────────────────────
//
// POST /generate-token is a staff-facing management route — it requires the
// same permission already used to gate editing a student's record elsewhere
// in the platform (students/index.ts, guardian-portal/index.ts). Mirrors the
// requirePerm() pattern already established across the codebase: platform
// admins bypass, otherwise the caller's JWT-derived permissions must include
// the required code.
function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.organizationId === null) return fail(403, 'Organization context required');
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(code)) return fail(403, `Requires permission: ${code}`);
  return null;
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash  = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Portal session validation ────────────────────────────────────────────────

interface PortalSession {
  session_id:      string;
  student_id:      string;
  organization_id: string;
}

async function resolvePortalToken(req: Request): Promise<PortalSession | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;

  const token = auth.slice(7).trim();
  if (!token || token.length < 16) return null;

  const hash     = await sha256hex(token);
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('student_portal_sessions')
    .select('id, student_id, organization_id, students!student_id(deleted_at)')
    .eq('token_hash', hash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;

  // A token issued before the student was archived/withdrawn otherwise stays
  // fully valid until its own TTL expires — generate-token blocks *new*
  // links for an archived student, but never revokes ones already handed
  // out, so withdrawal doesn't actually cut off self-service portal access.
  const studentRow = (data as unknown as { students: { deleted_at: string | null } | null }).students;
  if (studentRow?.deleted_at) return null;

  // Update last_used_at asynchronously — don't await
  void supabase
    .from('student_portal_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    session_id:      data.id      as string,
    student_id:      data.student_id      as string,
    organization_id: data.organization_id as string,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve((req: Request) =>
  serveCors(req, async () => {
    const correlationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
    const rateLimitGuard = enforceIpRateLimit(req, 'ip_auth', correlationId);
    if (rateLimitGuard) return rateLimitGuard;

    const url  = new URL(req.url);
    // Supabase may present the URL in different formats depending on deployment flags.
    // Strip any known prefix so we always work with just the sub-path:
    //   /functions/v1/student-portal/path  → /path
    //   /student-portal/path               → /path
    //   /path                              → /path  (already stripped by gateway)
    const path = url.pathname
      .replace(/^\/functions\/v1\/student-portal/, '')
      .replace(/^\/student-portal/, '')
      || '/';

    // ── GET /ping — diagnostic: shows received headers (no auth required) ──────
    if (req.method === 'GET' && path === '/ping') {
      const auth = req.headers.get('Authorization') ?? 'MISSING';
      return ok({
        pong:         true,
        auth_present: auth !== 'MISSING',
        auth_prefix:  auth.substring(0, 15),
        has_apikey:   req.headers.has('apikey'),
      });
    }

    // ── POST /generate-token — admin generates a portal link ─────────────────
    if (req.method === 'POST' && path === '/generate-token') {
      const ctxResult = await buildEdgeContext(req);
      if (!ctxResult.ok) return ctxResult.response;
      const { ctx } = ctxResult;

      const permGuard = requirePerm(ctx, 'students:student:update');
      if (permGuard) return permGuard;

      const body   = await req.json().catch(() => null);
      const parsed = GenerateTokenSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'student_id required');

      const { student_id } = parsed.data;
      const supabase = createServiceClient();

      // Verify student belongs to this org
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('id, first_name, last_name, email, phone')
        .eq('id', student_id)
        .eq('organization_id', ctx.organizationId)
        .is('deleted_at', null)
        .single();

      if (studentErr || !student) return fail(404, 'Student not found');

      const token     = randomToken();
      const hash      = await sha256hex(token);
      const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_DAYS * 86_400_000).toISOString();

      // Revoke any existing active sessions for this student before creating a new one
      await supabase
        .from('student_portal_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('student_id', student_id)
        .eq('organization_id', ctx.organizationId)
        .is('revoked_at', null);

      const { error: insertErr } = await supabase
        .from('student_portal_sessions')
        .insert({
          organization_id: ctx.organizationId,
          student_id,
          token_hash:  hash,
          expires_at:  expiresAt,
          created_by:  ctx.actorId,
        });

      if (insertErr) {
        logger.error('student-portal: insert session failed', { error: insertErr.message });
        return fail(500, 'Failed to generate portal link');
      }

      const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

      logger.info('student-portal: token generated', {
        org_id:     ctx.organizationId,
        student_id,
        created_by: ctx.actorId,
      });

      return ok({
        token,
        url:          `${appUrl}/portal?token=${token}`,
        expires_at:   expiresAt,
        student_name: `${(student as { first_name: string }).first_name} ${(student as { last_name: string }).last_name}`,
      }, 201);
    }

    // ── GET /validate — validate a portal token (no auth required) ───────────
    if (req.method === 'GET' && path === '/validate') {
      const token = url.searchParams.get('token');
      if (!token) return fail(400, 'token parameter required');

      const hash     = await sha256hex(token);
      const supabase = createServiceClient();

      const { data: session, error: sessionErr } = await supabase
        .from('student_portal_sessions')
        .select('id, student_id, organization_id, expires_at')
        .eq('token_hash', hash)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (sessionErr || !session) return fail(401, 'Invalid or expired portal link');

      const [studentRes, orgRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, first_name, last_name, email, phone, target_licence_category, permit_stage')
          .eq('id', session.student_id as string)
          .single(),
        supabase
          .from('organizations')
          .select('id, name')
          .eq('id', session.organization_id as string)
          .single(),
      ]);

      if (!studentRes.data || !orgRes.data) return fail(500, 'Failed to load session data');

      return ok({
        student:     studentRes.data,
        organization: orgRes.data,
        expires_at:  session.expires_at,
      });
    }

    // Guardian portal functionality (token generation, guardian CRUD, guardian-facing
    // data routes) lives exclusively in supabase/functions/guardian-portal/index.ts —
    // this file previously carried a second, fully duplicated and already-drifted copy
    // (removed Production Readiness Sprint 4; confirmed zero frontend callers before removal).

    // ── All routes below require a valid portal token ─────────────────────────
    const session = await resolvePortalToken(req);
    if (!session) return fail(401, 'Portal authentication required');

    const { student_id, organization_id } = session;
    const supabase = createServiceClient();

    // ── GET /me ───────────────────────────────────────────────────────────────
    if (req.method === 'GET' && path === '/me') {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, email, phone, target_licence_category, permit_stage, risk1_completed_at, risk2_completed_at, theory_passed_at, practical_passed_at, date_of_birth, personnummer_last4, address_line1, postal_code, city')
        .eq('id', student_id)
        .single();

      if (error || !data) return fail(404, 'Student not found');

      const row = data as typeof data & {
        date_of_birth: string | null; personnummer_last4: string | null;
      };
      // Masked personnummer only — the encrypted/plaintext value is never
      // decrypted for portal display, matching the same partial-reveal
      // pattern already used staff-side (personnummer_last4, GDPR Art.5).
      const personnummer = row.date_of_birth
        ? `${row.date_of_birth.replace(/-/g, '')}${row.personnummer_last4 ? `-${row.personnummer_last4}` : ''}`
        : null;
      const { date_of_birth: _dob, personnummer_last4: _last4, ...rest } = row;
      return ok({ ...rest, personnummer });
    }

    // ── GET /progress — lesson stats + permit milestones ─────────────────────
    if (req.method === 'GET' && path === '/progress') {
      const [bookingsRes, studentRes] = await Promise.all([
        supabase
          .from('lesson_bookings')
          .select('status, slot_id, lesson_slots!inner(starts_at, ends_at)')
          .eq('student_id', student_id)
          .eq('organization_id', organization_id)
          .is('deleted_at', null),
        supabase
          .from('students')
          .select('permit_stage, risk1_completed_at, risk2_completed_at, theory_passed_at, practical_passed_at')
          .eq('id', student_id)
          .single(),
      ]);

      const bookings  = bookingsRes.data ?? [];
      const student   = studentRes.data;
      const nowStr    = new Date().toISOString();

      let totalMinutes  = 0;
      let completedCount = 0;
      let noShowCount    = 0;
      let upcomingCount  = 0;

      for (const b of bookings) {
        const slot = (b as unknown as { lesson_slots: { starts_at: string; ends_at: string } }).lesson_slots;
        if (b.status === 'completed') {
          completedCount++;
          totalMinutes += (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60_000;
        }
        if (b.status === 'no_show') noShowCount++;
        if ((b.status === 'confirmed' || b.status === 'reserved') && slot.starts_at > nowStr) upcomingCount++;
      }

      return ok({
        completed_count:     completedCount,
        no_show_count:       noShowCount,
        total_minutes:       Math.round(totalMinutes),
        upcoming_count:      upcomingCount,
        permit_stage:        student?.permit_stage         ?? 'not_started',
        risk1_completed_at:  student?.risk1_completed_at   ?? null,
        risk2_completed_at:  student?.risk2_completed_at   ?? null,
        theory_passed_at:    student?.theory_passed_at     ?? null,
        practical_passed_at: student?.practical_passed_at  ?? null,
      });
    }

    // ── GET /slots — available slots for booking ──────────────────────────────
    if (req.method === 'GET' && path === '/slots') {
      const qp     = SlotsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      const fromDt = qp.success && qp.data.from ? qp.data.from : new Date().toISOString();
      const toDt   = qp.success ? qp.data.to : undefined;

      let q = supabase
        .from('lesson_slots')
        .select('id, starts_at, ends_at, current_bookings, max_bookings, instructors(first_name, last_name), lesson_types(name), organization_locations(name), vehicles(make, model)')
        .eq('organization_id', organization_id)
        .eq('status', 'open')
        .is('deleted_at', null)
        // Generic-availability slots (lesson_type_id null) ARE included —
        // the frontend only surfaces them once the student has picked a
        // specific lesson type filter (see StudentPortalBokaPage.tsx), at
        // which point that choice becomes the booking's lesson_type_id.
        // Previously excluded entirely, meaning auto-provisioned instructor
        // availability (no fixed lesson type by default) was invisible to
        // self-service students even though staff could see and book it.
        .gte('starts_at', fromDt)
        .order('starts_at')
        .limit(80);

      if (toDt) q = q.lte('starts_at', toDt);

      const { data: slots, error: slotsErr } = await q;
      if (slotsErr) {
        logger.error('student-portal: slots fetch failed', { error: slotsErr.message });
        return fail(500, 'Failed to fetch available slots');
      }

      type SlotRow = {
        id: string; starts_at: string; ends_at: string;
        current_bookings: number; max_bookings: number;
        instructors:            { first_name: string; last_name: string } | null;
        lesson_types:           { name: string } | null;
        organization_locations: { name: string } | null;
        vehicles:               { make: string; model: string } | null;
      };

      const available = (slots as unknown as SlotRow[]).filter(s => s.current_bookings < s.max_bookings);

      return ok(available.map(s => ({
        id:                    s.id,
        starts_at:             s.starts_at,
        ends_at:               s.ends_at,
        current_bookings:      s.current_bookings,
        max_bookings:          s.max_bookings,
        lesson_type_name:      s.lesson_types?.name             ?? null,
        instructor_first_name: s.instructors?.first_name        ?? null,
        instructor_last_name:  s.instructors?.last_name         ?? null,
        location_name:         s.organization_locations?.name   ?? null,
        vehicle_label:         s.vehicles ? `${s.vehicles.make} ${s.vehicles.model}` : null,
      })));
    }

    // ── GET /bookings — student's booking history ─────────────────────────────
    if (req.method === 'GET' && path === '/bookings') {
      const { data: bookings, error: bErr } = await supabase
        .from('lesson_bookings')
        .select('id, slot_id, status, created_at, cancellation_reason, lesson_slots(starts_at, ends_at, instructors(first_name, last_name), lesson_types(name), organization_locations(name), vehicles(make, model))')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(60);

      if (bErr) return fail(500, 'Failed to fetch bookings');

      type BookingRow = {
        id: string; slot_id: string; status: string; created_at: string; cancellation_reason: string | null;
        lesson_slots: {
          starts_at: string; ends_at: string;
          instructors:  { first_name: string; last_name: string } | null;
          lesson_types: { name: string } | null;
          organization_locations: { name: string } | null;
          vehicles:               { make: string; model: string } | null;
        } | null;
      };

      return ok((bookings as unknown as BookingRow[]).map(b => ({
        id:                   b.id,
        slot_id:              b.slot_id,
        status:               b.status,
        created_at:           b.created_at,
        starts_at:            b.lesson_slots?.starts_at          ?? '',
        ends_at:              b.lesson_slots?.ends_at            ?? '',
        lesson_type_name:     b.lesson_slots?.lesson_types?.name ?? null,
        instructor_first_name: b.lesson_slots?.instructors?.first_name ?? null,
        instructor_last_name:  b.lesson_slots?.instructors?.last_name  ?? null,
        location_name:        b.lesson_slots?.organization_locations?.name ?? null,
        vehicle_label:        b.lesson_slots?.vehicles ? `${b.lesson_slots.vehicles.make} ${b.lesson_slots.vehicles.model}` : null,
        cancellation_reason:  b.cancellation_reason,
      })));
    }

    // ── POST /bookings — create a booking ─────────────────────────────────────
    if (req.method === 'POST' && path === '/bookings') {
      const body   = await req.json().catch(() => null);
      const parsed = CreateBookingSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'slot_id required');

      const { slot_id, lesson_type_id: dtoLessonTypeId } = parsed.data;

      // Verify slot exists and has capacity
      const { data: slot } = await supabase
        .from('lesson_slots')
        .select('id, status, current_bookings, max_bookings, lesson_type_id')
        .eq('id', slot_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .single();

      if (!slot) return fail(404, 'Slot not found');
      if ((slot as { status: string }).status !== 'open') return fail(409, 'Slot is not open for booking');
      if ((slot as { current_bookings: number }).current_bookings >= (slot as { max_bookings: number }).max_bookings) {
        return fail(409, 'Slot is fully booked');
      }

      const slotLessonTypeId = (slot as { lesson_type_id: string | null }).lesson_type_id;
      if (!slotLessonTypeId && !dtoLessonTypeId) {
        return fail(422, 'Detta pass har ingen förvald lektionstyp — ange lektionstyp vid bokning.');
      }
      // Same fallback the staff booking path already uses (bookings/index.ts):
      // the slot's own type wins when it has one; only a generic slot ever
      // needs the student-supplied one.
      const effectiveLessonTypeId = slotLessonTypeId ?? dtoLessonTypeId ?? null;

      // Prevent duplicate booking
      const { data: existing } = await supabase
        .from('lesson_bookings')
        .select('id')
        .eq('slot_id', slot_id)
        .eq('student_id', student_id)
        // 'cancelled' alone isn't enough — a rescheduled-away booking keeps its
        // old row (status: 'rescheduled') at this slot_id, and without excluding
        // it too, the student can never book back into their original slot.
        .not('status', 'in', '(cancelled,rescheduled)')
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) return fail(409, 'Du har redan en bokning för detta pass');

      // Package credit pre-flight — same rule the staff booking path enforces,
      // via the shared implementation in _shared/lesson-credits.ts. This
      // endpoint previously never checked package credit at all (ISSUE-1).
      const preflight = await resolveLessonPackageCredit(supabase, {
        organizationId: organization_id,
        studentId:      student_id,
        lessonTypeId:   effectiveLessonTypeId,
      });

      if (preflight.kind === 'insufficient') {
        return fail(409, 'Eleven saknar lektionstillgodokvitton för det här passet');
      }

      const { data: booking, error: insertErr } = await insertLessonBooking(
        supabase,
        {
          organization_id, slot_id, student_id, status: 'reserved',
          // Only set explicitly for generic slots — an already-typed slot's
          // own value flows through the DB trigger as before, untouched.
          ...(!slotLessonTypeId && dtoLessonTypeId ? { lesson_type_id: dtoLessonTypeId } : {}),
        },
        'id, slot_id, student_id, status, created_at',
      );

      if (insertErr) {
        // 23505 = unique_violation: duplicate booking (TOCTOU race — same student, same slot)
        if (insertErr.code === '23505') return fail(409, 'Du har redan en bokning för detta pass');
        // 23P01 = exclusion_violation: slot overbooked concurrently
        if (insertErr.code === '23P01') return fail(409, 'Platsen är fullbokad');
        logger.error('student-portal: booking insert failed', { error: insertErr.message });
        return fail(500, 'Booking failed — please try again');
      }

      if (preflight.kind === 'available') {
        const consumeResult = await consumeLessonPackageCreditOrCompensate(supabase, {
          assignmentId:   preflight.assignmentId,
          category:       preflight.category,
          organizationId: organization_id,
          bookingId:      (booking as { id: string }).id,
          actorId:        null,
          actorEmail:     null,
        });

        if (!consumeResult.ok) {
          logger.warn('student-portal: credit consume failed', {
            booking_id:    (booking as { id: string }).id,
            student_id,
            assignment_id: preflight.assignmentId,
            error:         consumeResult.errorMessage,
          });
          return fail(409, 'Eleven saknar lektionstillgodokvitton för det här passet');
        }
      }

      return ok(booking, 201);
    }

    // ── POST /bookings/:id/cancel ─────────────────────────────────────────────
    const cancelMatch = path.match(/^\/bookings\/([0-9a-f-]+)\/cancel$/);
    if (req.method === 'POST' && cancelMatch) {
      const bookingId = cancelMatch[1]!;
      const body      = await req.json().catch(() => ({}));
      const parsed    = CancelSchema.safeParse(body);

      const { data: booking } = await supabase
        .from('lesson_bookings')
        .select('id, status, starts_at')
        .eq('id', bookingId)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .single();

      if (!booking) return fail(404, 'Booking not found');

      const terminal = ['completed', 'cancelled', 'no_show', 'rescheduled'];
      if (terminal.includes((booking as { status: string }).status)) {
        return fail(409, 'This booking cannot be cancelled');
      }

      // F3 V1: every self-service cancellation is attributed to the student
      // by definition — the deadline check always applies here (unlike the
      // staff path, which only applies it when the staff-chosen category is
      // 'student_request').
      const deadlineHours = await getCancellationDeadlineHours(supabase, organization_id);
      const forfeitCredit = isWithinCancellationDeadline((booking as { starts_at: string }).starts_at, deadlineHours);

      const { error: updateErr } = await supabase
        .from('lesson_bookings')
        .update({
          status:                'cancelled',
          cancelled_at:          new Date().toISOString(),
          cancellation_category: 'student_request',
          cancellation_reason:   parsed.success ? (parsed.data.reason ?? null) : null,
        })
        .eq('id', bookingId);

      if (updateErr) return fail(500, 'Cancel failed');

      // Bug fix (found during the F3 audit): this endpoint previously never
      // restored the package credit at all, regardless of notice given — the
      // staff cancel path (bookings/index.ts) had this logic, the portal
      // never did. Reuses the exact same shared implementation as staff now.
      //
      // actorId must be null, not student_id: students authenticate via
      // portal tokens, not Supabase Auth, so a student's id is never a valid
      // auth.users row — package_credit_reversals.reversed_by has an FK to
      // that table. Mirrors the same actorId: null already used 70 lines up
      // by consumeLessonPackageCreditOrCompensate for booking creation.
      // Found live during the F3 authenticated-verification round: passing
      // student_id here made every >24h portal cancellation fail with a
      // 23503 foreign-key violation instead of actually restoring credit.
      const reversal = await reverseLessonCreditOnCancellation(supabase, {
        organizationId: organization_id,
        bookingId,
        forfeit:        forfeitCredit,
        actorId:        null,
        actorEmail:     null,
        reason:         'Lektion avbokad av eleven — kredit återställd automatiskt',
      });

      if (reversal.error) {
        logger.warn('student-portal.credit_reverse_failed', {
          booking_id: bookingId, student_id, organization_id, error: reversal.error,
        });
        return ok({ success: true, credit_reversal_failed: true });
      }

      return ok({ success: true, credit_forfeited: reversal.forfeited });
    }

    // ── POST /bookings/:id/reschedule ─────────────────────────────────────────
    const rescheduleMatch = path.match(/^\/bookings\/([0-9a-f-]+)\/reschedule$/);
    if (req.method === 'POST' && rescheduleMatch) {
      const bookingId = rescheduleMatch[1]!;
      const body      = await req.json().catch(() => null);
      const parsed    = RescheduleSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'new_slot_id required');

      const { new_slot_id } = parsed.data;

      const { data: booking } = await supabase
        .from('lesson_bookings')
        .select('id, status, starts_at')
        .eq('id', bookingId)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .single();

      if (!booking) return fail(404, 'Booking not found');

      const reschedulable = ['reserved', 'confirmed'];
      if (!reschedulable.includes((booking as { status: string }).status)) {
        return fail(409, 'This booking cannot be rescheduled');
      }

      // F3 V1: rescheduling inside the cancellation-deadline window is
      // rejected outright — otherwise it's a silent bypass of the
      // late-cancellation credit-forfeiture rule above.
      const deadlineHours = await getCancellationDeadlineHours(supabase, organization_id);
      if (isWithinCancellationDeadline((booking as { starts_at: string }).starts_at, deadlineHours)) {
        return fail(409, `Ombokning är inte längre möjlig — mindre än ${deadlineHours} timmar kvar till lektionen. Kontakta skolan om du behöver ändra tiden.`);
      }

      // Verify new slot availability
      const { data: newSlot } = await supabase
        .from('lesson_slots')
        .select('id, status, current_bookings, max_bookings')
        .eq('id', new_slot_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .single();

      type SlotBasic = { status: string; current_bookings: number; max_bookings: number };
      const s = newSlot as unknown as SlotBasic | null;
      if (!s || s.status !== 'open' || s.current_bookings >= s.max_bookings) {
        return fail(409, 'The selected slot is not available');
      }

      const originalStatus = (booking as { status: string }).status;

      // Mark old booking as rescheduled. cancelled_at must stay NULL here —
      // lesson_bookings_cancel_consistency CHECK requires
      // (status = 'cancelled') = (cancelled_at IS NOT NULL), so setting it
      // alongside status = 'rescheduled' violates the constraint on every
      // call. Confirmed live 2026-08-06 via direct reproduction: this was a
      // 100%-reproducible failure, not an edge case — every reschedule
      // attempt through this endpoint has always hit this constraint.
      const { error: markErr } = await supabase
        .from('lesson_bookings')
        .update({ status: 'rescheduled' })
        .eq('id', bookingId);

      if (markErr) {
        console.error('[student-portal] reschedule: failed to mark old booking', markErr.message, markErr.code);
        return fail(500, 'Reschedule failed');
      }

      // Create new booking
      const { data: newBooking, error: insertErr } = await supabase
        .from('lesson_bookings')
        .insert({ organization_id, slot_id: new_slot_id, student_id, status: 'reserved', rescheduled_from_id: bookingId })
        .select('id, slot_id, status, created_at')
        .single();

      if (insertErr) {
        // Compensating rollback: restore the original booking status so the
        // student is not left without a booking if the insert failed.
        await supabase
          .from('lesson_bookings')
          .update({ status: originalStatus, cancelled_at: null })
          .eq('id', bookingId);
        console.error('[student-portal] reschedule: failed to create new booking', insertErr.message, insertErr.code);
        // 23P01 = Postgres exclusion_violation — the student already has
        // another active booking overlapping the newly selected slot's time
        // window (lesson_bookings_student_no_overlap). A real conflict, not
        // a server error — surfaced distinctly so the student understands
        // why, instead of a generic failure.
        if (insertErr.code === '23P01') {
          return fail(409, 'Ni har redan en bokad lektion som krockar med den valda tiden.');
        }
        return fail(500, 'Failed to create rescheduled booking');
      }
      return ok(newBooking, 201);
    }

    // ── GET /balance — outstanding invoices ───────────────────────────────────
    if (req.method === 'GET' && path === '/balance') {
      // total_sek is not a real column (it's total_amount/outstanding_amount
      // here) — this query has been silently failing on every call (data
      // came back null, the error was never checked), always reporting 0
      // outstanding regardless of actual invoice state. Also widened the
      // status filter: 'partially_paid' invoices (e.g. after a partial
      // refund reduces paid_amount without zeroing the invoice) do have a
      // real outstanding balance and were being excluded entirely.
      const { data: invoices, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, outstanding_amount, status, issued_at, due_date')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        // invoices are append-only/void (not soft-deleted) — there is no
        // deleted_at column here, only void_at (this query 500'd on every
        // call until the error above was actually checked).
        .is('void_at', null)
        // draft invoices are an internal working state (no issued_at yet,
        // amount not finalized) and must never be shown to the customer.
        .neq('status', 'draft')
        .order('issued_at', { ascending: false })
        .limit(10);

      if (invErr) return fail(500, 'Failed to fetch balance');

      type InvoiceRow = {
        id: string; invoice_number: string | null; total_amount: number; outstanding_amount: number;
        status: string; issued_at: string; due_date: string | null;
      };
      const rows = (invoices as unknown as InvoiceRow[] | null) ?? [];

      const outstanding = rows
        .filter(i => i.status === 'issued' || i.status === 'overdue' || i.status === 'partially_paid')
        .reduce((sum, i) => sum + (i.outstanding_amount ?? 0), 0);

      return ok({
        outstanding_sek: outstanding,
        recent_invoices: rows.map(i => ({
          id:             i.id,
          invoice_number: i.invoice_number,
          total_sek:      i.total_amount,
          status:         i.status,
          issued_at:      i.issued_at,
          due_date:       i.due_date,
        })),
      });
    }

    // ── GET /history — past lessons with attendance notes ─────────────────────
    if (req.method === 'GET' && path === '/history') {
      const { data: bookings, error: bErr } = await supabase
        .from('lesson_bookings')
        .select(`
          id, slot_id, status, created_at,
          lesson_slots(starts_at, ends_at, instructors(first_name, last_name), lesson_types(name)),
          booking_attendance(instructor_notes, performance_rating),
          booking_notes(content, created_at, is_internal)
        `)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .in('status', ['completed', 'no_show', 'cancelled'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (bErr) {
        logger.error('student-portal: history fetch failed', { error: bErr.message });
        return fail(500, 'Failed to fetch lesson history');
      }

      type AttRow  = { instructor_notes: string | null; performance_rating: number | null };
      type NoteRow = { content: string; created_at: string; is_internal: boolean };
      type HRow = {
        id: string; slot_id: string; status: string; created_at: string;
        lesson_slots: { starts_at: string; ends_at: string; instructors: { first_name: string; last_name: string } | null; lesson_types: { name: string } | null } | null;
        booking_attendance: AttRow[] | AttRow | null;
        booking_notes:      NoteRow[] | null;
      };

      return ok((bookings as unknown as HRow[]).map(b => {
        const attArr = Array.isArray(b.booking_attendance) ? b.booking_attendance : (b.booking_attendance ? [b.booking_attendance] : []);
        const att    = attArr[0] ?? null;
        const publicNotes = (b.booking_notes ?? []).filter(n => !n.is_internal);
        return {
          id:                    b.id,
          slot_id:               b.slot_id,
          status:                b.status,
          created_at:            b.created_at,
          starts_at:             b.lesson_slots?.starts_at             ?? '',
          ends_at:               b.lesson_slots?.ends_at               ?? '',
          lesson_type_name:      b.lesson_slots?.lesson_types?.name    ?? null,
          instructor_first_name: b.lesson_slots?.instructors?.first_name ?? null,
          instructor_last_name:  b.lesson_slots?.instructors?.last_name  ?? null,
          instructor_notes:      att?.instructor_notes     ?? null,
          performance_rating:    att?.performance_rating   ?? null,
          notes: publicNotes.map(n => ({ content: n.content, created_at: n.created_at })),
        };
      }));
    }

    // ── GET /lesson-types — available lesson types for booking ────────────────
    if (req.method === 'GET' && path === '/lesson-types') {
      const { data: types, error: tErr } = await supabase
        .from('lesson_types')
        .select('id, name')
        .eq('organization_id', organization_id)
        .eq('is_active', true)
        .order('display_order')
        .order('name')
        .limit(30);

      if (tErr) return fail(500, 'Failed to fetch lesson types');
      return ok(types ?? []);
    }

    // ── GET /waitlist — student's active waitlist entries ─────────────────────
    if (req.method === 'GET' && path === '/waitlist') {
      const { data: entries } = await supabase
        .from('lesson_waitlist_entries')
        .select('id, lesson_type_id, status, created_at, expires_at, lesson_types(name)')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .in('status', ['waiting', 'notified'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      type WRow = { id: string; lesson_type_id: string; status: string; created_at: string; expires_at: string | null; lesson_types: { name: string } | null };
      return ok((entries as unknown as WRow[] ?? []).map(e => ({
        id:               e.id,
        lesson_type_id:   e.lesson_type_id,
        lesson_type_name: e.lesson_types?.name ?? null,
        status:           e.status,
        created_at:       e.created_at,
        expires_at:       e.expires_at,
      })));
    }

    // ── POST /waitlist — join the waitlist for a lesson type ──────────────────
    if (req.method === 'POST' && path === '/waitlist') {
      const body   = await req.json().catch(() => null);
      const parsed = WaitlistJoinSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'lesson_type_id required');

      const { lesson_type_id, preferred_instructor_id } = parsed.data;

      // Verify lesson type belongs to org
      const { data: lt } = await supabase
        .from('lesson_types')
        .select('id')
        .eq('id', lesson_type_id)
        .eq('organization_id', organization_id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle();

      if (!lt) return fail(404, 'Lesson type not found');

      // Check for duplicate active entry
      const { data: existing } = await supabase
        .from('lesson_waitlist_entries')
        .select('id')
        .eq('student_id', student_id)
        .eq('lesson_type_id', lesson_type_id)
        .in('status', ['waiting', 'notified'])
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) return fail(409, 'Du är redan på väntelistan för denna lektionstyp');

      const expiresAt = new Date(Date.now() + 60 * 86_400_000).toISOString();

      const { data: entry, error: insertErr } = await supabase
        .from('lesson_waitlist_entries')
        .insert({
          organization_id:         organization_id,
          student_id:              student_id,
          lesson_type_id:          lesson_type_id,
          preferred_instructor_id: preferred_instructor_id ?? null,
          status:                  'waiting',
          expires_at:              expiresAt,
        })
        .select('id, lesson_type_id, status, created_at, expires_at')
        .single();

      if (insertErr) {
        if (insertErr.code === '23505') return fail(409, 'Du är redan på väntelistan');
        logger.error('student-portal: waitlist insert failed', { error: insertErr.message });
        return fail(500, 'Could not join waitlist');
      }

      logger.info('student-portal: joined waitlist', { org_id: organization_id, student_id, lesson_type_id });
      return ok(entry, 201);
    }

    // ── DELETE /waitlist/:id — leave the waitlist ─────────────────────────────
    const waitlistLeaveMatch = path.match(/^\/waitlist\/([0-9a-f-]+)$/);
    if (req.method === 'DELETE' && waitlistLeaveMatch) {
      const entryId = waitlistLeaveMatch[1]!;

      const { error: delErr } = await supabase
        .from('lesson_waitlist_entries')
        .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
        .eq('id', entryId)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .in('status', ['waiting', 'notified']);

      if (delErr) return fail(500, 'Could not leave waitlist');
      return ok({ success: true });
    }

    // ── GET /org — public org info (name + Swish number for payment) ──────────
    if (req.method === 'GET' && path === '/org') {
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('name, settings')
        .eq('id', organization_id)
        .maybeSingle();
      if (orgErr) return fail(500, 'Failed to fetch org info');
      if (!org)   return fail(404, 'Organization not found');
      const settings = (org.settings ?? {}) as Record<string, unknown>;
      const studentBooking = (settings['student_booking'] ?? {}) as Record<string, unknown>;
      const rawDeadline = studentBooking['cancellation_deadline_hours'];
      return ok({
        name:          org.name,
        swish_number:  (settings['swish_number']  as string | undefined) ?? null,
        contact_phone: (settings['contact_phone'] as string | undefined) ?? null,
        contact_email: (settings['contact_email'] as string | undefined) ?? null,
        // F3 V1 — lets the portal UI reflect the org's actual configured
        // cancellation/reschedule deadline instead of a hardcoded literal.
        cancellation_deadline_hours:
          typeof rawDeadline === 'number' && Number.isFinite(rawDeadline) && rawDeadline >= 0
            ? rawDeadline
            : DEFAULT_CANCELLATION_DEADLINE_HOURS,
      });
    }

    // ── GET /materials — published training materials for this org ────────────
    if (req.method === 'GET' && path === '/materials') {
      const { data: materials, error: mErr } = await supabase
        .from('training_materials')
        .select('id, title, description, category, content_type, url, display_order')
        .eq('organization_id', organization_id)
        .eq('is_published', true)
        .is('deleted_at', null)
        .order('category')
        .order('display_order')
        .order('title')
        .limit(200);

      if (mErr) {
        logger.error('student-portal: materials fetch failed', { error: mErr.message });
        return fail(500, 'Failed to fetch materials');
      }
      return ok(materials ?? []);
    }

    // ── GET /completions — student's completed material IDs ───────────────────
    if (req.method === 'GET' && path === '/completions') {
      const { data, error } = await supabase
        .from('student_material_completions')
        .select('material_id')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null);
      if (error) return fail(500, 'Failed to fetch completions');
      return ok((data ?? []).map((r: { material_id: string }) => r.material_id));
    }

    // ── POST /completions — mark a material as complete ───────────────────────
    if (req.method === 'POST' && path === '/completions') {
      const body = await req.json().catch(() => null) as { material_id?: string } | null;
      if (!body?.material_id) return fail(400, 'material_id required');

      const materialId = body.material_id;

      // Verify the material belongs to this org and is published
      const { data: material } = await supabase
        .from('training_materials')
        .select('id')
        .eq('id', materialId)
        .eq('organization_id', organization_id)
        .eq('is_published', true)
        .is('deleted_at', null)
        .maybeSingle();

      if (!material) return fail(404, 'Material not found');

      const { error: insertErr } = await supabase
        .from('student_material_completions')
        .upsert(
          { organization_id, student_id, material_id: materialId, completed_at: new Date().toISOString(), deleted_at: null },
          { onConflict: 'organization_id,student_id,material_id' },
        );

      if (insertErr) return fail(500, 'Failed to mark completion');
      return ok({ success: true });
    }

    // ── DELETE /completions/:materialId — unmark a material ──────────────────
    const completionDeleteMatch = path.match(/^\/completions\/([0-9a-f-]+)$/);
    if (req.method === 'DELETE' && completionDeleteMatch) {
      const materialId = completionDeleteMatch[1]!;

      const { error: delErr } = await supabase
        .from('student_material_completions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .eq('material_id', materialId)
        .is('deleted_at', null);

      if (delErr) return fail(500, 'Failed to remove completion');
      return ok({ success: true });
    }

    // ── GET /terms — student's T&C acceptance status ─────────────────────────
    if (req.method === 'GET' && path === '/terms') {
      const { data, error } = await supabase
        .from('student_terms_acceptances')
        .select('terms_version, accepted_at')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .maybeSingle();
      if (error) return fail(500, 'Failed to fetch terms status');
      return ok({
        accepted:      data !== null,
        accepted_at:   (data as { accepted_at: string } | null)?.accepted_at   ?? null,
        terms_version: (data as { terms_version: string } | null)?.terms_version ?? null,
      });
    }

    // ── POST /terms/accept — record T&C acceptance ────────────────────────────
    if (req.method === 'POST' && path === '/terms/accept') {
      const { error: upsertErr } = await supabase
        .from('student_terms_acceptances')
        .upsert(
          { organization_id, student_id, terms_version: '1.0', accepted_at: new Date().toISOString() },
          { onConflict: 'organization_id,student_id' },
        );
      if (upsertErr) return fail(500, 'Failed to record acceptance');
      return ok({ success: true });
    }

    // ── GET /practice-log — student's private practice sessions ──────────────
    if (req.method === 'GET' && path === '/practice-log') {
      const { data, error } = await supabase
        .from('student_practice_log')
        .select('id, practice_date, duration_minutes, notes, created_at')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .order('practice_date', { ascending: false })
        .limit(50);
      if (error) return fail(500, 'Failed to fetch practice log');
      return ok(data ?? []);
    }

    // ── POST /practice-log — log a private practice session ──────────────────
    if (req.method === 'POST' && path === '/practice-log') {
      const body   = await req.json().catch(() => null);
      const parsed = PracticeLogSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'Invalid practice log entry');

      const { practice_date, duration_minutes, notes } = parsed.data;
      const { data: entry, error: insertErr } = await supabase
        .from('student_practice_log')
        .insert({ organization_id, student_id, practice_date, duration_minutes, notes: notes ?? null })
        .select('id, practice_date, duration_minutes, notes, created_at')
        .single();

      if (insertErr) {
        logger.error('student-portal: practice log insert failed', { error: insertErr.message });
        return fail(500, 'Failed to save practice entry');
      }
      return ok(entry, 201);
    }

    // ── DELETE /practice-log/:id — remove a practice session ─────────────────
    const practiceDeleteMatch = path.match(/^\/practice-log\/([0-9a-f-]+)$/);
    if (req.method === 'DELETE' && practiceDeleteMatch) {
      const entryId = practiceDeleteMatch[1]!;
      const { error: delErr } = await supabase
        .from('student_practice_log')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', entryId)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null);
      if (delErr) return fail(500, 'Failed to delete practice entry');
      return ok({ success: true });
    }

    // ── POST /payments/swish — record Swish deeplink initiation ──────────────
    if (req.method === 'POST' && path === '/payments/swish') {
      const body        = await req.json().catch(() => null) as { invoice_id?: string } | null;
      const invoiceId   = body?.invoice_id;
      if (!invoiceId) return fail(400, 'invoice_id required');

      // Verify invoice belongs to this student. total_sek/deleted_at are not
      // real columns on invoices (total_amount/outstanding_amount, void_at) —
      // this query 400'd on every call, so `inv` was always null and this
      // handler always returned a false "not found", meaning Swish payment
      // initiation from the student portal has never actually worked.
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, outstanding_amount')
        .eq('id', invoiceId)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .in('status', ['issued', 'overdue', 'partially_paid'])
        .is('void_at', null)
        .maybeSingle();

      if (!inv) return fail(404, 'Invoice not found or already paid');

      const { data: pr, error: prErr } = await supabase
        .from('payment_requests')
        .insert({
          organization_id,
          student_id,
          invoice_id: invoiceId,
          provider:   'swish',
          amount_sek: (inv as { outstanding_amount: number }).outstanding_amount,
          status:     'initiated',
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        })
        .select('id')
        .single();

      if (prErr) {
        logger.error('student-portal: swish payment_request insert failed', { error: prErr.message });
        return fail(500, 'Failed to record payment initiation');
      }

      return ok({ payment_request_id: (pr as { id: string }).id }, 201);
    }

    // ── POST /payments/stripe/checkout — create Stripe Checkout session ───────
    if (req.method === 'POST' && path === '/payments/stripe/checkout') {
      const body      = await req.json().catch(() => null) as { invoice_id?: string } | null;
      const invoiceId = body?.invoice_id;
      if (!invoiceId) return fail(400, 'invoice_id required');

      // Verify invoice belongs to this student (see the Swish handler above
      // for why total_sek/deleted_at were broken here too).
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, outstanding_amount, invoice_number')
        .eq('id', invoiceId)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .in('status', ['issued', 'overdue', 'partially_paid'])
        .is('void_at', null)
        .maybeSingle();

      if (!inv) return fail(404, 'Invoice not found or already paid');

      // Fetch org settings for Stripe key
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organization_id)
        .maybeSingle();

      // Dual-level payment architecture: a tenant's own (or explicitly-copied
      // pilot) credential in organizations.settings is the only valid
      // source. No platform Deno.env fallback here — see Payment Provider
      // Resolution Safety Check (2026-08-11).
      const settings   = ((orgRow as { settings?: Record<string, unknown> } | null)?.settings) ?? {};
      const storedKey  = settings['stripe_secret_key'] as string | undefined;
      // decryptCredential() transparently handles both newly-encrypted values
      // and any pre-existing plaintext value stored before ADR-022 was
      // applied to this field — see _shared/credential-crypto.ts.
      const stripeKey  = storedKey !== undefined ? await decryptCredential(storedKey) : '';

      if (!stripeKey) return fail(503, 'Online card payment is not configured for this school');

      const appUrl    = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
      const prId      = crypto.randomUUID();
      const invNum    = (inv as { invoice_number: string | null }).invoice_number;
      const amountSek = (inv as { outstanding_amount: number }).outstanding_amount;

      const params = new URLSearchParams({
        'mode':                                      'payment',
        'currency':                                  'sek',
        'line_items[0][price_data][currency]':       'sek',
        'line_items[0][price_data][unit_amount]':    String(Math.round(amountSek * 100)),
        'line_items[0][price_data][product_data][name]':
          `Faktura ${invNum ?? invoiceId.slice(0, 8)}`,
        'line_items[0][quantity]':                   '1',
        'success_url':                               `${appUrl}/portal/konto?payment=success&req=${prId}`,
        'cancel_url':                                `${appUrl}/portal/konto?payment=cancelled`,
        'metadata[invoice_id]':                      invoiceId,
        'metadata[payment_request_id]':              prId,
        'metadata[organization_id]':                 organization_id,
        'metadata[student_id]':                      student_id,
      });

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      type StripeSession = { id: string; url: string; error?: { message: string } };
      const stripeData = await stripeRes.json() as StripeSession;

      if (!stripeRes.ok || stripeData.error) {
        logger.error('student-portal: Stripe session creation failed', {
          status: stripeRes.status,
          error:  stripeData.error?.message,
        });
        return fail(502, 'Payment provider error — please try again');
      }

      // Record payment_request with the Stripe session ID (using the pre-generated UUID as PK)
      const { error: prErr } = await supabase
        .from('payment_requests')
        .insert({
          id:                  prId,
          organization_id,
          student_id,
          invoice_id:          invoiceId,
          provider:            'stripe',
          provider_session_id: stripeData.id,
          amount_sek:          amountSek,
          status:              'pending',
          return_url:          `${appUrl}/portal/konto`,
          expires_at:          new Date(Date.now() + 30 * 60_000).toISOString(),
          metadata:            { stripe_session_id: stripeData.id },
        });

      if (prErr) {
        logger.error('student-portal: payment_request insert failed', { error: prErr.message });
        // Session was already created at Stripe — log but don't fail
        logger.warn('student-portal: proceeding without payment_request record', { prId });
      }

      logger.info('student-portal: Stripe checkout created', {
        org_id: organization_id, student_id, invoice_id: invoiceId, pr_id: prId,
      });

      return ok({ session_url: stripeData.url, payment_request_id: prId }, 201);
    }

    // ── POST /payments/nets/checkout — create Nets Easy payment ──────────────
    // Nets' model differs from Stripe's in ways that matter, not cosmetically:
    //   - Auth is a Bearer secret key against test.api.dibspayment.eu / api.dibspayment.eu
    //     (two separate hostnames per environment, not one host + key prefix).
    //   - There is no dashboard-configured webhook: each payment registers its
    //     own webhook URL + a shared-secret "authorization" string (8-32
    //     alphanumeric chars) that Nets echoes back verbatim in the
    //     Authorization header of every callback — verified by nets-webhook
    //     as a direct string comparison, not an HMAC signature.
    //   - "checkout.charge: true" reserves AND captures in one step (the
    //     Stripe-equivalent immediate-payment behavior); Nets then fires both
    //     payment.checkout.completed (checkout form finished) and
    //     payment.charge.created.v2 (money actually captured) — settlement
    //     must wait for the latter, since a completed checkout can still fail
    //     to charge.
    if (req.method === 'POST' && path === '/payments/nets/checkout') {
      const body      = await req.json().catch(() => null) as { invoice_id?: string } | null;
      const invoiceId = body?.invoice_id;
      if (!invoiceId) return fail(400, 'invoice_id required');

      const { data: inv } = await supabase
        .from('invoices')
        .select('id, outstanding_amount, invoice_number')
        .eq('id', invoiceId)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .in('status', ['issued', 'overdue', 'partially_paid'])
        .is('void_at', null)
        .maybeSingle();

      if (!inv) return fail(404, 'Invoice not found or already paid');

      const { data: orgRow } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organization_id)
        .maybeSingle();

      // Dual-level payment architecture: a tenant's own (or explicitly-copied
      // pilot) credential in organizations.settings is the only valid
      // source. No platform Deno.env fallback here — see Payment Provider
      // Resolution Safety Check (2026-08-11).
      const settings = ((orgRow as { settings?: Record<string, unknown> } | null)?.settings) ?? {};
      const storedSecretKey = settings['nets_secret_key'] as string | undefined;
      const netsSecretKey = storedSecretKey !== undefined ? await decryptCredential(storedSecretKey) : '';

      if (!netsSecretKey) return fail(503, 'Nets-betalning är inte konfigurerad för denna skola');

      // Each org gets its own webhook authorization secret, generated once and
      // reused for every payment — Nets requires this per payment-creation
      // call (there is no dashboard-level webhook secret to configure ahead
      // of time the way Stripe's is).
      let webhookSecret: string;
      const storedWebhookSecret = settings['nets_webhook_secret'] as string | undefined;
      if (storedWebhookSecret !== undefined) {
        webhookSecret = await decryptCredential(storedWebhookSecret);
      } else {
        webhookSecret = crypto.randomUUID().replace(/-/g, '');
        await supabase
          .from('organizations')
          .update({ settings: { ...settings, nets_webhook_secret: await encryptCredential(webhookSecret) } })
          .eq('id', organization_id);
      }

      const appUrl      = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
      const functionsUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const netsBase     = Deno.env.get('NETS_ENV') === 'live' ? 'https://api.dibspayment.eu' : 'https://test.api.dibspayment.eu';
      const prId         = crypto.randomUUID();
      const invNum       = (inv as { invoice_number: string | null }).invoice_number;
      const amountSek    = (inv as { outstanding_amount: number }).outstanding_amount;
      const amountMinor  = Math.round(amountSek * 100);
      const webhookUrl   = `${functionsUrl}/functions/v1/nets-webhook/${organization_id}`;

      const netsRes = await fetch(`${netsBase}/v1/payments`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${netsSecretKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          order: {
            items: [{
              reference:        invoiceId,
              name:              `Faktura ${invNum ?? invoiceId.slice(0, 8)}`,
              quantity:          1,
              unit:              'st',
              unitPrice:         amountMinor,
              taxRate:           0,
              taxAmount:         0,
              netTotalAmount:    amountMinor,
              grossTotalAmount:  amountMinor,
            }],
            amount:    amountMinor,
            currency:  'SEK',
            reference: prId,
          },
          checkout: {
            integrationType: 'HostedPaymentPage',
            returnUrl:       `${appUrl}/portal/konto?payment=success&req=${prId}`,
            cancelUrl:       `${appUrl}/portal/konto?payment=cancelled`,
            termsUrl:        `${appUrl}/legal/terms`,
            charge:          true,
          },
          notifications: {
            webHooks: [
              { eventName: 'payment.checkout.completed', url: webhookUrl, authorization: webhookSecret },
              { eventName: 'payment.charge.created.v2',  url: webhookUrl, authorization: webhookSecret },
            ],
          },
        }),
      });

      const netsData = await netsRes.json() as { paymentId?: string; hostedPaymentPageUrl?: string; message?: string };

      if (!netsRes.ok || !netsData.paymentId) {
        logger.error('student-portal: Nets payment creation failed', {
          status: netsRes.status, error: netsData.message,
        });
        return fail(502, 'Payment provider error — please try again');
      }

      const paymentRequestRow = {
        id:                  prId,
        organization_id,
        student_id,
        invoice_id:          invoiceId,
        provider:            'nets',
        provider_session_id: netsData.paymentId,
        amount_sek:          amountSek,
        status:              'pending',
        return_url:          `${appUrl}/portal/konto`,
        expires_at:          new Date(Date.now() + 30 * 60_000).toISOString(),
        metadata:            { nets_payment_id: netsData.paymentId },
      };

      let { error: prErr } = await supabase.from('payment_requests').insert(paymentRequestRow);

      if (prErr) {
        // The Nets checkout session already exists at this point (real,
        // live, capable of accepting a real payment) — if the tracking row
        // never gets created, the payment.charge.created.v2 webhook (which
        // looks this row up by id/provider_session_id) will find nothing
        // when the student actually pays, silently losing the payment: the
        // invoice never gets marked paid and no payment record is ever
        // created, even though Nets captured real money. A transient DB
        // blip is retryable, so retry once before giving up rather than
        // silently handing the client an untrackable payment link.
        logger.error('student-portal: payment_request insert failed, retrying once', { error: prErr.message, pr_id: prId });
        const retry = await supabase.from('payment_requests').insert(paymentRequestRow);
        prErr = retry.error;
      }

      if (prErr) {
        logger.error('student-portal: payment_request insert failed after retry — refusing to hand out an untrackable Nets session', {
          error: prErr.message, pr_id: prId, nets_payment_id: netsData.paymentId,
        });
        return fail(502, 'Kunde inte förbereda betalningen — försök igen');
      }

      logger.info('student-portal: Nets checkout created', {
        org_id: organization_id, student_id, invoice_id: invoiceId, pr_id: prId,
      });

      return ok({ session_url: netsData.hostedPaymentPageUrl, payment_request_id: prId }, 201);
    }

    // ── GET /payments/requests/:id — poll payment request status ─────────────
    const paymentRequestMatch = path.match(/^\/payments\/requests\/([0-9a-f-]+)$/);
    if (req.method === 'GET' && paymentRequestMatch) {
      const prId = paymentRequestMatch[1]!;

      const { data: pr, error: prErr } = await supabase
        .from('payment_requests')
        .select('id, provider, amount_sek, status, completed_at, payment_id')
        .eq('id', prId)
        .eq('organization_id', organization_id)
        .eq('student_id', student_id)
        .maybeSingle();

      if (prErr) return fail(500, 'Failed to fetch payment request');
      if (!pr)   return fail(404, 'Payment request not found');
      return ok(pr);
    }

    // ── GET /quiz/categories — categories with question count + student progress ─
    if (req.method === 'GET' && path === '/quiz/categories') {
      const { data, error } = await supabase.rpc('get_quiz_categories', {
        p_org_id:     organization_id,
        p_student_id: student_id,
      });

      if (error) {
        logger.error('student-portal: get_quiz_categories failed', { error: error.message });
        return fail(500, 'Failed to fetch quiz categories');
      }
      return ok(data ?? []);
    }

    // ── POST /quiz/sessions — start a new quiz, receive questions ────────────
    if (req.method === 'POST' && path === '/quiz/sessions') {
      const StartQuizSchema = z.object({
        category:       z.string().optional(),
        question_count: z.number().int().min(5).max(40).default(10),
      });
      const body   = await req.json().catch(() => null);
      const parsed = StartQuizSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'Invalid quiz start params');
      const { category, question_count } = parsed.data;

      // Fetch questions (system-wide or org-specific, shuffled)
      let query = supabase
        .from('quiz_questions')
        .select('id, question_text, options, category, difficulty')
        .eq('is_active', true)
        .or(`organization_id.is.null,organization_id.eq.${organization_id}`);

      if (category) query = query.eq('category', category);

      const { data: allQs, error: qErr } = await query.order('sort_order').limit(200);
      if (qErr) return fail(500, 'Failed to fetch questions');

      const pool = (allQs ?? []) as Array<{
        id: string;
        question_text: string;
        options: Array<{ text: string; is_correct: boolean }>;
        category: string;
        difficulty: string;
      }>;

      if (pool.length === 0) return fail(404, 'No questions available for this category');

      // Shuffle using crypto.getRandomValues() for unpredictable question ordering
      const shuffled = pool
        .map(q => {
          const arr = new Uint32Array(1);
          crypto.getRandomValues(arr);
          return { q, sort: arr[0]! };
        })
        .sort((a, b) => a.sort - b.sort)
        .slice(0, question_count)
        .map(({ q }) => q);

      // Create session row
      const { data: session, error: sessErr } = await supabase
        .from('quiz_sessions')
        .insert({
          organization_id,
          student_id,
          category:       category ?? null,
          question_count: shuffled.length,
        })
        .select('id, created_at')
        .single();

      if (sessErr || !session) {
        logger.error('student-portal: create quiz_session failed', { error: sessErr?.message });
        return fail(500, 'Failed to create quiz session');
      }

      // Strip is_correct from options before sending to client
      const questions = shuffled.map(q => ({
        id:           q.id,
        question_text: q.question_text,
        category:     q.category,
        difficulty:   q.difficulty,
        options:      q.options.map((o: { text: string; is_correct: boolean }) => ({ text: o.text })),
      }));

      return ok({ session_id: (session as { id: string }).id, questions }, 201);
    }

    // ── POST /quiz/sessions/:id/submit — submit answers + get results ─────────
    const quizSubmitMatch = path.match(/^\/quiz\/sessions\/([0-9a-f-]+)\/submit$/);
    if (req.method === 'POST' && quizSubmitMatch) {
      const sessionId = quizSubmitMatch[1]!;

      // Verify session belongs to this student
      const { data: sess, error: sessErr } = await supabase
        .from('quiz_sessions')
        .select('id, question_count, completed_at')
        .eq('id', sessionId)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .maybeSingle();

      if (sessErr) return fail(500, 'Failed to look up session');
      if (!sess)   return fail(404, 'Session not found');
      if ((sess as { completed_at: string | null }).completed_at) {
        return fail(409, 'Session already submitted');
      }

      const SubmitSchema = z.object({
        answers:        z.array(z.object({
          question_id:    z.string().uuid(),
          selected_index: z.number().int().min(0).nullable(),
        })),
        time_spent_sec: z.number().int().min(0).optional(),
      });
      const body   = await req.json().catch(() => null);
      const parsed = SubmitSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'Invalid answer payload');
      const { answers, time_spent_sec } = parsed.data;

      type QuestionRow = {
        id:            string;
        question_text: string;
        options:       Array<{ text: string; is_correct: boolean }>;
        explanation:   string | null;
      };

      // Fetch correct answers — restrict to questions belonging to this org (or system-wide)
      const questionIds = answers.map((a: { question_id: string }) => a.question_id);
      const { data: correctQs, error: cqErr } = await supabase
        .from('quiz_questions')
        .select('id, question_text, options, explanation')
        .in('id', questionIds)
        .or(`organization_id.is.null,organization_id.eq.${organization_id}`);

      if (cqErr) return fail(500, 'Failed to verify answers');

      const qMap = new Map<string, QuestionRow>(
        (correctQs ?? []).map((q: QuestionRow) => [q.id, q] as [string, QuestionRow]),
      );

      // Grade answers
      let score = 0;
      const answerRows: Array<{
        session_id:     string;
        question_id:    string;
        selected_index: number | null;
        is_correct:     boolean;
      }> = [];
      const resultDetails: Array<{
        question_id:    string;
        question_text:  string;
        selected_index: number | null;
        correct_index:  number;
        is_correct:     boolean;
        explanation:    string | null;
      }> = [];

      for (const answer of answers) {
        const q = qMap.get(answer.question_id);
        if (!q) continue;

        const correctIdx = q.options.findIndex((o) => o.is_correct);
        const isCorrect = answer.selected_index === correctIdx;
        if (isCorrect) score++;

        answerRows.push({
          session_id:     sessionId,
          question_id:    answer.question_id,
          selected_index: answer.selected_index,
          is_correct:     isCorrect,
        });

        resultDetails.push({
          question_id:    answer.question_id,
          question_text:  q.question_text,
          selected_index: answer.selected_index,
          correct_index:  correctIdx,
          is_correct:     isCorrect,
          explanation:    q.explanation,
        });
      }

      // Persist answers
      if (answerRows.length > 0) {
        const { error: insErr } = await supabase
          .from('quiz_session_answers')
          .insert(answerRows);
        if (insErr) logger.warn('student-portal: quiz_session_answers insert failed', { error: insErr.message });
      }

      // Mark session complete
      const { error: updErr } = await supabase
        .from('quiz_sessions')
        .update({
          score,
          completed_at:   new Date().toISOString(),
          time_spent_sec: time_spent_sec ?? null,
        })
        .eq('id', sessionId);

      if (updErr) logger.warn('student-portal: quiz_session update failed', { error: updErr.message });

      return ok({
        session_id:     sessionId,
        score,
        total:          answers.length,
        percentage:     Math.round((score / Math.max(answers.length, 1)) * 100),
        passed:         score >= Math.ceil(answers.length * 0.75),
        details:        resultDetails,
      });
    }

    // ── GET /quiz/sessions — student's quiz history ───────────────────────────
    if (req.method === 'GET' && path === '/quiz/sessions') {
      const { data: history, error: hErr } = await supabase
        .from('quiz_sessions')
        .select('id, category, question_count, score, completed_at, time_spent_sec, created_at')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(50);

      if (hErr) return fail(500, 'Failed to fetch quiz history');
      return ok(history ?? []);
    }

    // ── GET /documents — student's approved documents with signed download URLs ─
    if (req.method === 'GET' && path === '/documents') {
      const { data: docs, error: docsErr } = await supabase
        .from('student_documents')
        .select('id, category, file_name, mime_type, file_size_bytes, description, expires_at, storage_path, storage_bucket, created_at')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .eq('status', 'approved')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (docsErr) {
        logger.error('student-portal: documents fetch failed', { error: docsErr.message });
        return fail(500, 'Failed to fetch documents');
      }

      type DocRow = {
        id:              string;
        category:        string;
        file_name:       string;
        mime_type:       string | null;
        file_size_bytes: number | null;
        description:     string | null;
        expires_at:      string | null;
        storage_path:    string;
        storage_bucket:  string;
        created_at:      string;
      };

      const rows = (docs ?? []) as DocRow[];

      const withUrls = await Promise.all(rows.map(async (doc) => {
        const { data: signed } = await supabase.storage
          .from(doc.storage_bucket)
          .createSignedUrl(doc.storage_path, 3600);

        return {
          id:              doc.id,
          category:        doc.category,
          file_name:       doc.file_name,
          mime_type:       doc.mime_type,
          file_size_bytes: doc.file_size_bytes,
          description:     doc.description,
          expires_at:      doc.expires_at,
          created_at:      doc.created_at,
          download_url:    signed?.signedUrl ?? null,
        };
      }));

      return ok(withUrls);
    }

    // ── GET /notifications — student's canonical notification history ─────────
    // (Notification Center, Version 1.1) — no longer reminder-only: every
    // business event the Communication Engine creates a canonical record
    // for (bookings, waitlist, invoices, reminders, ...) appears here,
    // regardless of which delivery channels succeeded/failed/are disabled.
    if (req.method === 'GET' && path === '/notifications') {
      const url_    = new URL(req.url);
      const limit   = Math.min(Number(url_.searchParams.get('limit') ?? '40'), 50);

      const { data: notifs, error: nErr } = await supabase
        .from('notifications')
        .select('id, subject, body, template_key, channel, status, category, priority, deep_link_identifier, read_at, created_at, reference_type, reference_id, metadata')
        .eq('organization_id', organization_id)
        .eq('recipient_id', student_id)
        .eq('recipient_type', 'student')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (nErr) {
        logger.error('student-portal: notifications fetch failed', { error: nErr.message });
        return fail(500, 'Failed to fetch notifications');
      }

      type NotifRow = {
        id:                   string;
        subject:              string | null;
        body:                 string | null;
        template_key:         string;
        channel:              string;
        status:               string;
        category:             string | null;
        priority:             string;
        deep_link_identifier: string | null;
        read_at:              string | null;
        created_at:           string;
        reference_type:       string | null;
        reference_id:         string | null;
        metadata:             Record<string, unknown>;
      };

      return ok((notifs ?? []) as NotifRow[]);
    }

    // ── GET /notifications/unread-count — lightweight badge poll ──────────────
    if (req.method === 'GET' && path === '/notifications/unread-count') {
      const { count, error: cErr } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .eq('recipient_id', student_id)
        .eq('recipient_type', 'student')
        .is('read_at', null)
        .is('archived_at', null);

      if (cErr) return fail(500, 'Failed to fetch unread count');
      return ok({ count: count ?? 0 });
    }

    // ── PATCH /notifications/read-all — mark all of the student's notifications read ──
    if (req.method === 'PATCH' && path === '/notifications/read-all') {
      const { error: raErr } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('organization_id', organization_id)
        .eq('recipient_id', student_id)
        .eq('recipient_type', 'student')
        .is('read_at', null);

      if (raErr) return fail(500, 'Failed to mark notifications read');
      return ok({ success: true });
    }

    // ── PATCH /notifications/:id/read — mark one notification read ────────────
    const notifReadMatch = path.match(/^\/notifications\/([0-9a-f-]+)\/read$/);
    if (req.method === 'PATCH' && notifReadMatch) {
      const notifId = notifReadMatch[1] as string;

      const { data, error: rErr } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notifId)
        .eq('organization_id', organization_id)
        .eq('recipient_id', student_id)
        .eq('recipient_type', 'student')
        .select('id')
        .maybeSingle();

      if (rErr) return fail(500, 'Failed to mark notification read');
      if (!data) return fail(404, 'Notification not found');
      return ok({ success: true });
    }

    // ── GET /packages — student's active lesson packages ─────────────────────
    // Reads student_package_assignments, not student_packages — the latter's
    // quantity_consumed is never updated by the consumption pipeline (lesson
    // completion writes lessons_used on the assignments row only; see
    // 20260720000006_sync_purchase_package_to_assignments.sql), so it always
    // reads back 0 regardless of actual usage. Assignments rows also only
    // exist once a sale is real, so unfinished/never-issued draft purchases
    // — which student_packages carries forever — don't leak through here.
    if (req.method === 'GET' && path === '/packages') {
      const { data: pkgs, error: pkgsErr } = await supabase
        .from('student_package_assignments')
        .select('id, package_name, lesson_category, package_quantity, lessons_used, expires_at, assigned_at, status')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .eq('status', 'active')
        .order('assigned_at', { ascending: false })
        .limit(20);

      if (pkgsErr) return fail(500, 'Failed to fetch packages');

      type PkgRow = {
        id: string; package_name: string; lesson_category: string | null;
        package_quantity: number; lessons_used: number;
        expires_at: string | null; assigned_at: string; status: string;
      };

      const result = ((pkgs ?? []) as PkgRow[]).map(p => ({
        id:                 p.id,
        name:               p.package_name,
        category:           p.lesson_category,
        quantity_granted:   p.package_quantity,
        quantity_consumed:  p.lessons_used,
        quantity_remaining: Math.max(0, p.package_quantity - p.lessons_used),
        expires_at:         p.expires_at,
        purchased_at:       p.assigned_at,
        status:             p.status,
      }));

      return ok(result);
    }

    // ── POST /push/register — register or refresh an FCM device token ────────
    if (req.method === 'POST' && path === '/push/register') {
      const body   = await req.json().catch(() => null);
      const parsed = RegisterPushTokenSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'Valid device token required');

      const result = await registerPushToken(
        supabase,
        {
          organizationId: organization_id,
          ownerColumn:    'student_id',
          ownerId:        student_id,
          token:          parsed.data.token,
          platform:       parsed.data.platform,
          userAgent:      req.headers.get('User-Agent'),
        },
        parsed.data.previous_token,
      );

      if ('error' in result) return fail(500, result.error);
      return ok({ id: result.id });
    }

    // ── DELETE /push/register — revoke a device token (logout / unsubscribe) ─
    if (req.method === 'DELETE' && path === '/push/register') {
      const body   = await req.json().catch(() => null);
      const parsed = RevokePushTokenSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'token_id required');

      const result = await revokePushToken(supabase, organization_id, 'student_id', student_id, parsed.data.token_id, 'client_unsubscribed');
      if ('error' in result) return fail(500, result.error);
      return ok({ revoked: true });
    }

    return fail(404, 'Route not found');
  }),
);
