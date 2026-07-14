import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const PORTAL_TOKEN_TTL_DAYS = 30;
const JSON_CT = { 'Content-Type': 'application/json' } as const;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const GenerateTokenSchema = z.object({
  instructor_id: z.string().uuid(),
});

const AttendanceSchema = z.object({
  status:                    z.enum(['present', 'absent', 'late', 'no_show']),
  notes:                     z.string().max(1000).optional(),
  evaluation_outcome:        z.string().max(2000).optional(),
  evaluation_strengths:      z.string().max(2000).optional(),
  evaluation_improvements:   z.string().max(2000).optional(),
  evaluation_recommendation: z.string().max(2000).optional(),
});

const AssessmentSchema = z.object({
  competencies: z.record(z.string()).optional(),
  readiness:    z.record(z.boolean()).optional(),
  notes:        z.string().max(5000).optional(),
});

const SlotsQuerySchema = z.object({
  from: z.string().optional(),
  to:   z.string().optional(),
});

// ─── Response helpers ─────────────────────────────────────────────────────────

function ok<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), { status, headers: JSON_CT });
}

function fail(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_CT });
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
  instructor_id:   string;
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
    .from('instructor_portal_sessions')
    .select('id, instructor_id, organization_id')
    .eq('token_hash', hash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;

  // Update last_used_at asynchronously — don't await
  void supabase
    .from('instructor_portal_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id as string);

  return {
    session_id:      data.id              as string,
    instructor_id:   data.instructor_id   as string,
    organization_id: data.organization_id as string,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve((req: Request) =>
  serveCors(req, async () => {
    const url  = new URL(req.url);
    const path = url.pathname
      .replace(/^\/functions\/v1\/instructor-portal/, '')
      .replace(/^\/instructor-portal/, '')
      || '/';

    // ── GET /ping — diagnostic ─────────────────────────────────────────────
    if (req.method === 'GET' && path === '/ping') {
      return ok({ pong: true });
    }

    // ── POST /generate-token — admin generates a portal link ──────────────
    if (req.method === 'POST' && path === '/generate-token') {
      const ctxResult = await buildEdgeContext(req);
      if (!ctxResult.ok) return ctxResult.response;
      const { ctx } = ctxResult;

      const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
      if (ipGuard) return ipGuard;
      if (req.method !== 'GET') {
        const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
        if (writeGuard) return writeGuard;
      }

      if (!ctx.organizationId) return fail(403, 'Organization context required');

      const body   = await req.json().catch(() => null);
      const parsed = GenerateTokenSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'instructor_id required');

      const { instructor_id } = parsed.data;
      const supabase = createServiceClient();

      // Verify instructor belongs to this org
      const { data: instructor, error: instructorErr } = await supabase
        .from('instructors')
        .select('id, first_name, last_name, email')
        .eq('id', instructor_id)
        .eq('organization_id', ctx.organizationId)
        .is('deleted_at', null)
        .single();

      if (instructorErr || !instructor) return fail(404, 'Instructor not found');

      const token     = randomToken();
      const hash      = await sha256hex(token);
      const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_DAYS * 86_400_000).toISOString();

      // Revoke existing active sessions for this instructor before creating a new one
      await supabase
        .from('instructor_portal_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('instructor_id', instructor_id)
        .eq('organization_id', ctx.organizationId)
        .is('revoked_at', null);

      const { error: insertErr } = await supabase
        .from('instructor_portal_sessions')
        .insert({
          organization_id: ctx.organizationId,
          instructor_id,
          token_hash:  hash,
          expires_at:  expiresAt,
          created_by:  ctx.actorId,
        });

      if (insertErr) {
        logger.error('instructor-portal: insert session failed', { error: insertErr.message });
        return fail(500, 'Failed to generate portal link');
      }

      const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
      const ins = instructor as { first_name: string; last_name: string };

      logger.info('instructor-portal: token generated', {
        org_id:        ctx.organizationId,
        instructor_id,
        created_by:    ctx.actorId,
      });

      return ok({
        token,
        url:             `${appUrl}/instructor-portal?token=${token}`,
        expires_at:      expiresAt,
        instructor_name: `${ins.first_name} ${ins.last_name}`,
      }, 201);
    }

    // ── GET /validate — validate a portal token (no auth required) ────────
    if (req.method === 'GET' && path === '/validate') {
      const token = url.searchParams.get('token');
      if (!token) return fail(400, 'token parameter required');

      const hash     = await sha256hex(token);
      const supabase = createServiceClient();

      const { data: session, error: sessionErr } = await supabase
        .from('instructor_portal_sessions')
        .select('id, instructor_id, organization_id, expires_at')
        .eq('token_hash', hash)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (sessionErr || !session) {
        return fail(401, 'Invalid or expired token');
      }

      const { data: instructor, error: instructorErr } = await supabase
        .from('instructors')
        .select('id, first_name, last_name, email, phone, teaching_categories, languages_spoken, employment_type')
        .eq('id', session.instructor_id as string)
        .is('deleted_at', null)
        .single();

      if (instructorErr || !instructor) return fail(404, 'Instructor not found');

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', session.organization_id as string)
        .single();

      if (orgErr || !org) return fail(404, 'Organization not found');

      return ok({
        instructor,
        organization: org,
        expires_at:   session.expires_at,
      });
    }

    // ── All routes below require a valid portal session ────────────────────
    const portalSession = await resolvePortalToken(req);
    if (!portalSession) return fail(401, 'Invalid or expired portal session');

    const { instructor_id, organization_id } = portalSession;
    const supabase = createServiceClient();

    // ── GET /me — instructor profile ───────────────────────────────────────
    if (req.method === 'GET' && path === '/me') {
      const { data, error } = await supabase
        .from('instructors')
        .select('id, first_name, last_name, email, phone, teaching_categories, languages_spoken, employment_type')
        .eq('id', instructor_id)
        .is('deleted_at', null)
        .single();

      if (error || !data) return fail(404, 'Instructor not found');
      return ok(data);
    }

    // ── GET /stats — lesson statistics ────────────────────────────────────
    if (req.method === 'GET' && path === '/stats') {
      const now   = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const baseFilter = supabase
        .from('lesson_bookings')
        .select('id, starts_at, ends_at, student_id', { count: 'exact' })
        .eq('instructor_id', instructor_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .not('status', 'eq', 'cancelled');

      const [todayRes, weekRes, monthRes, upcomingRes] = await Promise.all([
        baseFilter
          .gte('starts_at', today.toISOString())
          .lt('starts_at', new Date(today.getTime() + 86_400_000).toISOString()),
        baseFilter
          .gte('starts_at', weekStart.toISOString())
          .lt('starts_at', now.toISOString()),
        baseFilter
          .gte('starts_at', monthStart.toISOString())
          .lt('starts_at', now.toISOString()),
        supabase
          .from('lesson_bookings')
          .select('id', { count: 'exact' })
          .eq('instructor_id', instructor_id)
          .eq('organization_id', organization_id)
          .is('deleted_at', null)
          .not('status', 'eq', 'cancelled')
          .gt('starts_at', now.toISOString()),
      ]);

      // Compute total hours and unique students from month data
      const monthBookings = monthRes.data ?? [];
      let totalMinutes = 0;
      const studentSet = new Set<string>();
      for (const b of monthBookings) {
        const s = b as { starts_at: string; ends_at: string; student_id: string };
        totalMinutes += (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60_000;
        studentSet.add(s.student_id);
      }

      return ok({
        lessons_today:          todayRes.count    ?? 0,
        lessons_this_week:      weekRes.count     ?? 0,
        lessons_this_month:     monthRes.count    ?? 0,
        total_hours_this_month: Math.round(totalMinutes / 60 * 10) / 10,
        unique_students:        studentSet.size,
        upcoming_count:         upcomingRes.count ?? 0,
      });
    }

    // ── GET /slots — instructor's slots in a date range ───────────────────
    if (req.method === 'GET' && path === '/slots') {
      const qp     = Object.fromEntries(url.searchParams.entries());
      const parsed = SlotsQuerySchema.safeParse(qp);
      if (!parsed.success) return fail(400, 'Invalid query parameters');

      const { from, to } = parsed.data;
      const now = new Date().toISOString();

      let q = supabase
        .from('lesson_slots')
        .select(`
          id, starts_at, ends_at, status, current_bookings, max_bookings, notes,
          lesson_types ( name ),
          organization_locations ( name ),
          vehicles ( registration_number, make, model )
        `)
        .eq('instructor_id', instructor_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .order('starts_at', { ascending: true })
        .limit(200);

      if (from) q = q.gte('starts_at', from);
      else      q = q.gte('starts_at', now);
      if (to)   q = q.lte('starts_at', to);

      const { data, error } = await q;
      if (error) return fail(500, error.message);

      const slots = (data ?? []).map((s: Record<string, unknown>) => {
        const lt  = s['lesson_types']  as { name: string } | null;
        const loc = s['organization_locations'] as { name: string } | null;
        const v   = s['vehicles'] as { registration_number: string; make: string; model: string } | null;
        return {
          id:               s['id'],
          starts_at:        s['starts_at'],
          ends_at:          s['ends_at'],
          status:           s['status'],
          current_bookings: s['current_bookings'],
          max_bookings:     s['max_bookings'],
          lesson_type_name: lt?.name  ?? null,
          location_name:    loc?.name ?? null,
          vehicle_label:    v ? `${v.make} ${v.model}`.trim() : null,
        };
      });

      return ok(slots);
    }

    // ── GET /bookings/today ────────────────────────────────────────────────
    if (req.method === 'GET' && path === '/bookings/today') {
      const now   = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(today.getTime() + 86_400_000);

      const { data, error } = await supabase
        .from('lesson_bookings')
        .select(`
          id, slot_id, starts_at, ends_at, status,
          students ( first_name, last_name ),
          lesson_types ( name ),
          booking_attendance ( attended, instructor_notes, evaluation_outcome, evaluation_strengths, evaluation_improvements, evaluation_recommendation )
        `)
        .eq('instructor_id', instructor_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .not('status', 'eq', 'cancelled')
        .gte('starts_at', today.toISOString())
        .lt('starts_at', todayEnd.toISOString())
        .order('starts_at', { ascending: true });

      if (error) return fail(500, error.message);
      return ok(mapBookings(data ?? []));
    }

    // ── GET /bookings/upcoming ─────────────────────────────────────────────
    if (req.method === 'GET' && path === '/bookings/upcoming') {
      const now     = new Date();
      const in7days = new Date(now.getTime() + 7 * 86_400_000);

      const { data, error } = await supabase
        .from('lesson_bookings')
        .select(`
          id, slot_id, starts_at, ends_at, status,
          students ( first_name, last_name ),
          lesson_types ( name ),
          booking_attendance ( attended, instructor_notes, evaluation_outcome, evaluation_strengths, evaluation_improvements, evaluation_recommendation )
        `)
        .eq('instructor_id', instructor_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .not('status', 'eq', 'cancelled')
        .gte('starts_at', now.toISOString())
        .lte('starts_at', in7days.toISOString())
        .order('starts_at', { ascending: true })
        .limit(100);

      if (error) return fail(500, error.message);
      return ok(mapBookings(data ?? []));
    }

    // ── GET /students — students who have had a lesson with this instructor ─
    if (req.method === 'GET' && path === '/students') {
      const now = new Date().toISOString();
      // Limit to last 12 months to avoid loading unbounded all-time history
      // for veteran instructors who may have thousands of historical bookings.
      const twelveMonthsAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();

      // Get distinct student IDs from bookings with this instructor
      const { data: bookingRows, error: bookingErr } = await supabase
        .from('lesson_bookings')
        .select('student_id, starts_at, ends_at, status')
        .eq('instructor_id', instructor_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .not('status', 'eq', 'cancelled')
        .gte('starts_at', twelveMonthsAgo)
        .limit(500);

      if (bookingErr) return fail(500, bookingErr.message);

      const rows = bookingRows as Array<{ student_id: string; starts_at: string; ends_at: string; status: string }>;

      // Aggregate per student
      const byStudent = new Map<string, { completed: number; lastPast: string | null; nextFuture: string | null }>();
      for (const row of rows) {
        const entry = byStudent.get(row.student_id) ?? { completed: 0, lastPast: null, nextFuture: null };
        if (row.starts_at < now) {
          entry.completed++;
          if (!entry.lastPast || row.starts_at > entry.lastPast) entry.lastPast = row.starts_at;
        } else {
          if (!entry.nextFuture || row.starts_at < entry.nextFuture) entry.nextFuture = row.starts_at;
        }
        byStudent.set(row.student_id, entry);
      }

      if (byStudent.size === 0) return ok([]);

      const studentIds = [...byStudent.keys()];
      const { data: students, error: studErr } = await supabase
        .from('students')
        .select('id, first_name, last_name, email, phone, permit_stage, target_licence_category')
        .in('id', studentIds)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .order('last_name', { ascending: true });

      if (studErr) return fail(500, studErr.message);

      const result = (students ?? []).map((s: Record<string, unknown>) => {
        const agg = byStudent.get(s['id'] as string);
        return {
          id:                      s['id'],
          first_name:              s['first_name'],
          last_name:               s['last_name'],
          email:                   s['email'] ?? null,
          phone:                   s['phone'] ?? null,
          permit_stage:            s['permit_stage'],
          target_licence_category: s['target_licence_category'],
          completed_lessons:       agg?.completed ?? 0,
          last_lesson_at:          agg?.lastPast  ?? null,
          next_lesson_at:          agg?.nextFuture ?? null,
        };
      });

      return ok(result);
    }

    // ── POST /bookings/:id/attendance ──────────────────────────────────────
    const attendanceMatch = /^\/bookings\/([0-9a-f-]+)\/attendance$/.exec(path);
    if (req.method === 'POST' && attendanceMatch) {
      const bookingId = attendanceMatch[1];

      const body   = await req.json().catch(() => null);
      const parsed = AttendanceSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'status required (present|absent|late|no_show)');

      const { status, notes, evaluation_outcome, evaluation_strengths, evaluation_improvements, evaluation_recommendation } = parsed.data;

      // Verify booking belongs to this instructor
      const { data: booking, error: bookingErr } = await supabase
        .from('lesson_bookings')
        .select('id, student_id, organization_id, starts_at')
        .eq('id', bookingId)
        .eq('instructor_id', instructor_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .single();

      if (bookingErr || !booking) return fail(404, 'Booking not found');

      const bk = booking as { id: string; student_id: string; organization_id: string; starts_at: string };

      // Soft-delete any existing attendance record for this booking
      await supabase
        .from('booking_attendance')
        .update({ deleted_at: new Date().toISOString() })
        .eq('booking_id', bookingId)
        .is('deleted_at', null);

      const attended = status === 'present' || status === 'late';

      const { error: insertErr } = await supabase
        .from('booking_attendance')
        .insert({
          organization_id:           bk.organization_id,
          booking_id:                bk.id,
          student_id:                bk.student_id,
          attended,
          instructor_notes:          notes ?? null,
          evaluation_outcome:        evaluation_outcome        ?? null,
          evaluation_strengths:      evaluation_strengths      ?? null,
          evaluation_improvements:   evaluation_improvements   ?? null,
          evaluation_recommendation: evaluation_recommendation ?? null,
          recorded_at:               new Date().toISOString(),
        });

      if (insertErr) {
        logger.error('instructor-portal: attendance insert failed', { error: insertErr.message });
        return fail(500, 'Failed to record attendance');
      }

      logger.info('instructor-portal: attendance recorded', {
        booking_id:    bookingId,
        instructor_id,
        attended,
      });

      return ok({ success: true });
    }

    // ── GET /students/:id/assessment ──────────────────────────────────────
    const assessmentMatch = /^\/students\/([0-9a-f-]+)\/assessment$/.exec(path);
    if (req.method === 'GET' && assessmentMatch) {
      const studentId = assessmentMatch[1];
      const { data, error } = await supabase
        .from('instructor_student_assessments')
        .select('id, competencies, readiness, notes, assessed_at, updated_at')
        .eq('instructor_id', instructor_id)
        .eq('student_id', studentId)
        .eq('organization_id', organization_id)
        .maybeSingle();

      if (error) return fail(500, error.message);
      return ok(data ?? null);
    }

    // ── PUT /students/:id/assessment ──────────────────────────────────────
    if (req.method === 'PUT' && assessmentMatch) {
      const studentId = assessmentMatch[1]!;
      const body   = await req.json().catch(() => null);
      const parsed = AssessmentSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'Invalid assessment payload');

      const { competencies, readiness, notes } = parsed.data;

      const { error } = await supabase
        .from('instructor_student_assessments')
        .upsert(
          {
            organization_id: organization_id,
            instructor_id:   instructor_id,
            student_id:      studentId,
            competencies:    competencies ?? {},
            readiness:       readiness    ?? {},
            notes:           notes        ?? null,
            assessed_at:     new Date().toISOString(),
          },
          { onConflict: 'instructor_id,student_id' },
        );

      if (error) {
        logger.error('instructor-portal: assessment upsert failed', { error: error.message });
        return fail(500, 'Failed to save assessment');
      }

      return ok({ success: true });
    }

    return fail(404, 'Route not found');
  }),
);

// ─── Booking shape mapper ─────────────────────────────────────────────────────

interface AttendanceRow {
  attended:                 boolean;
  instructor_notes:         string | null;
  evaluation_outcome:       string | null;
  evaluation_strengths:     string | null;
  evaluation_improvements:  string | null;
  evaluation_recommendation:string | null;
}

function mapBookings(rows: unknown[]): unknown[] {
  return rows.map((r: unknown) => {
    const b   = r as Record<string, unknown>;
    const s   = b['students']  as { first_name: string; last_name: string } | null;
    const lt  = b['lesson_types'] as { name: string } | null;
    const att = (b['booking_attendance'] as AttendanceRow[] | null)?.[0];

    let attendanceStatus: string | null = null;
    if (att) attendanceStatus = att.attended ? 'present' : 'absent';

    return {
      id:                 b['id'],
      slot_id:            b['slot_id'],
      starts_at:          b['starts_at'],
      ends_at:            b['ends_at'],
      status:             b['status'],
      student_first_name: s?.first_name ?? null,
      student_last_name:  s?.last_name  ?? null,
      lesson_type_name:   lt?.name       ?? null,
      attendance_status:         attendanceStatus,
      notes:                     att?.instructor_notes         ?? null,
      evaluation_outcome:        att?.evaluation_outcome       ?? null,
      evaluation_strengths:      att?.evaluation_strengths     ?? null,
      evaluation_improvements:   att?.evaluation_improvements  ?? null,
      evaluation_recommendation: att?.evaluation_recommendation ?? null,
    };
  });
}
