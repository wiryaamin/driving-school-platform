import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_TTL_DAYS = 30;
const JSON_CT = { 'Content-Type': 'application/json' } as const;

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

// ─── Guardian session ─────────────────────────────────────────────────────────

interface GuardianSession {
  id:              string;
  guardian_id:     string;
  student_id:      string;
  organization_id: string;
  expires_at:      string;
}

async function resolveGuardianToken(req: Request): Promise<GuardianSession | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  const hash  = await sha256hex(token);
  const svc   = createServiceClient();

  const { data, error } = await svc
    .from('guardian_portal_sessions')
    .select('id, guardian_id, student_id, organization_id, expires_at')
    .eq('token_hash', hash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;

  void svc
    .from('guardian_portal_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', (data as GuardianSession).id);

  return data as GuardianSession;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateGuardianSchema = z.object({
  student_id: z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name:  z.string().min(1).max(100),
  email:      z.string().email(),
  phone:      z.string().max(30).optional(),
  relation:   z.string().max(50).optional(),
  can_pay:    z.boolean().default(true),
});

const GenerateTokenSchema = z.object({
  guardian_id: z.string().uuid(),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve((req: Request) =>
  serveCors(req, async () => {
    const correlationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
    const rateLimitGuard = enforceIpRateLimit(req, 'ip_auth', correlationId);
    if (rateLimitGuard) return rateLimitGuard;

    const url  = new URL(req.url);
    const path = url.pathname.replace(/^\/guardian-portal/, '') || '/';

    // ── POST /generate-token — admin generates guardian portal link ────────────
    if (req.method === 'POST' && path === '/generate-token') {
      const ctxResult = await buildEdgeContext(req);
      if (!ctxResult.ok) return ctxResult.response;
      const { ctx } = ctxResult;
      if (!ctx.organizationId) return fail(403, 'Organization context required');

      const body   = await req.json().catch(() => null);
      const parsed = GenerateTokenSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'guardian_id required');

      const svc = createServiceClient();
      const { data: guardian, error: gErr } = await svc
        .from('student_guardians')
        .select('id, first_name, last_name, student_id, email')
        .eq('id', parsed.data.guardian_id)
        .eq('organization_id', ctx.organizationId)
        .is('deleted_at', null)
        .single();

      if (gErr || !guardian) return fail(404, 'Guardian not found');

      const token   = randomToken();
      const hash    = await sha256hex(token);
      const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000).toISOString();

      await svc
        .from('guardian_portal_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('guardian_id', parsed.data.guardian_id)
        .eq('organization_id', ctx.organizationId)
        .is('revoked_at', null);

      const { error: insErr } = await svc
        .from('guardian_portal_sessions')
        .insert({
          organization_id: ctx.organizationId,
          guardian_id:     (guardian as { id: string }).id,
          student_id:      (guardian as { student_id: string }).student_id,
          token_hash:      hash,
          expires_at:      expires,
          created_by:      ctx.actorId,
        });

      if (insErr) return fail(500, 'Failed to generate guardian portal link');

      const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
      return ok({
        token,
        url:           `${appUrl}/guardian?token=${token}`,
        expires_at:    expires,
        guardian_name: `${(guardian as { first_name: string }).first_name} ${(guardian as { last_name: string }).last_name}`,
      }, 201);
    }

    // ── POST /guardians — admin creates a guardian record ─────────────────────
    if (req.method === 'POST' && path === '/guardians') {
      const ctxResult = await buildEdgeContext(req);
      if (!ctxResult.ok) return ctxResult.response;
      const { ctx } = ctxResult;
      if (!ctx.organizationId) return fail(403, 'Organization context required');

      const body   = await req.json().catch(() => null);
      const parsed = CreateGuardianSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'Invalid guardian data');

      const svc = createServiceClient();
      const { data: guardian, error: insErr } = await svc
        .from('student_guardians')
        .insert({
          organization_id: ctx.organizationId,
          created_by:      ctx.actorId,
          ...parsed.data,
        })
        .select('id, first_name, last_name, email, phone, relation, can_pay')
        .single();

      if (insErr || !guardian) {
        logger.error('guardian-portal: create guardian failed', { error: insErr?.message });
        return fail(500, 'Failed to create guardian');
      }
      return ok(guardian, 201);
    }

    // ── GET /guardians?student_id= — list guardians for a student ─────────────
    if (req.method === 'GET' && path === '/guardians') {
      const ctxResult = await buildEdgeContext(req);
      if (!ctxResult.ok) return ctxResult.response;
      const { ctx } = ctxResult;
      if (!ctx.organizationId) return fail(403, 'Organization context required');

      const studentId = url.searchParams.get('student_id');
      if (!studentId) return fail(400, 'student_id required');

      const svc = createServiceClient();
      const { data: guardians, error } = await svc
        .from('student_guardians')
        .select('id, first_name, last_name, email, phone, relation, can_pay, created_at')
        .eq('student_id', studentId)
        .eq('organization_id', ctx.organizationId)
        .is('deleted_at', null)
        .order('created_at');

      if (error) return fail(500, 'Failed to fetch guardians');
      return ok(guardians ?? []);
    }

    // ── DELETE /guardians/:id — soft-delete a guardian ────────────────────────
    const deleteMatch = path.match(/^\/guardians\/([0-9a-f-]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      const ctxResult = await buildEdgeContext(req);
      if (!ctxResult.ok) return ctxResult.response;
      const { ctx } = ctxResult;
      if (!ctx.organizationId) return fail(403, 'Organization context required');

      const svc = createServiceClient();
      const { error } = await svc
        .from('student_guardians')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteMatch[1]!)
        .eq('organization_id', ctx.organizationId)
        .is('deleted_at', null);

      if (error) return fail(500, 'Failed to delete guardian');
      return ok({ success: true });
    }

    // ── Guardian portal routes — authenticated by guardian token ──────────────
    const session = await resolveGuardianToken(req);
    if (!session) return fail(401, 'Guardian authentication required');

    const { guardian_id, student_id, organization_id } = session;
    const svc = createServiceClient();

    // GET /me — guardian identity + student summary
    if (req.method === 'GET' && path === '/me') {
      const [guardianRes, studentRes, orgRes, locationRes] = await Promise.all([
        svc.from('student_guardians')
          .select('id, first_name, last_name, email, phone, relation, can_pay')
          .eq('id', guardian_id)
          .single(),
        svc.from('students')
          .select('id, first_name, last_name, permit_stage, target_licence_category')
          .eq('id', student_id)
          .single(),
        svc.from('organizations')
          .select('id, name')
          .eq('id', organization_id)
          .single(),
        svc.from('organization_locations')
          .select('phone, email')
          .eq('organization_id', organization_id)
          .eq('is_primary', true)
          .is('deleted_at', null)
          .maybeSingle(),
      ]);

      if (!guardianRes.data || !studentRes.data || !orgRes.data) {
        return fail(500, 'Failed to load guardian session data');
      }

      const loc = locationRes.data as { phone: string | null; email: string | null } | null;
      return ok({
        guardian:     guardianRes.data,
        student:      studentRes.data,
        organization: {
          ...orgRes.data,
          phone: loc?.phone ?? null,
          email: loc?.email ?? null,
        },
        session: { expires_at: session.expires_at },
      });
    }

    // GET /bookings — lesson history for the student (upcoming + past 6 months)
    if (req.method === 'GET' && path === '/bookings') {
      const { data: bookings, error } = await svc
        .from('lesson_bookings')
        .select('id, status, lesson_slots!slot_id(starts_at, ends_at, notes, lesson_types!lesson_type_id(name), instructors!instructor_id(first_name, last_name), organization_locations!location_id(name, address_line1, city), vehicles!vehicle_id(make, model, registration_number))')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .in('status', ['reserved', 'confirmed', 'completed', 'cancelled', 'no_show'])
        .limit(100);

      if (error) return fail(500, 'Failed to fetch bookings');

      // PostgREST cannot order by an embedded/joined table's column via dot
      // notation (order=lesson_slots.starts_at is rejected — confirmed live,
      // Production Readiness Sprint 4) — sort client-side instead.
      type BookingRow = { lesson_slots: { starts_at: string } | null };
      const sorted = ((bookings ?? []) as unknown as BookingRow[]).sort((a, b) =>
        (b.lesson_slots?.starts_at ?? '').localeCompare(a.lesson_slots?.starts_at ?? ''));

      return ok(sorted);
    }

    // GET /balance — student balance + unpaid invoices (only if guardian has can_pay)
    if (req.method === 'GET' && path === '/balance') {
      const { data: guardian } = await svc
        .from('student_guardians')
        .select('can_pay')
        .eq('id', guardian_id)
        .single();

      if (!(guardian as { can_pay: boolean } | null)?.can_pay) {
        return fail(403, 'Payment access not granted for this guardian');
      }

      const [balRes, invRes, pkgRes] = await Promise.all([
        svc.from('student_credit_balances')
          .select('balance_sek, credit_used_sek, total_paid_sek')
          .eq('student_id', student_id)
          .eq('organization_id', organization_id)
          .maybeSingle(),
        svc.from('invoices')
          .select('id, invoice_number, amount_sek, due_date, status')
          .eq('student_id', student_id)
          .eq('organization_id', organization_id)
          .in('status', ['issued', 'overdue'])
          .order('due_date')
          .limit(10),
        svc.from('student_packages')
          .select('id, status, quantity_granted, quantity_consumed, quantity_expired, expires_at, purchased_at, package_offerings!offering_id(name, package_type)')
          .eq('student_id', student_id)
          .eq('organization_id', organization_id)
          .in('status', ['active', 'depleted'])
          .order('purchased_at', { ascending: false })
          .limit(5),
      ]);

      type PkgRow = {
        id: string;
        status: string;
        quantity_granted: number;
        quantity_consumed: number;
        quantity_expired: number;
        expires_at: string | null;
        purchased_at: string;
        package_offerings: { name: string; package_type: string } | null;
      };

      return ok({
        balance:  balRes.data ?? { balance_sek: 0, credit_used_sek: 0, total_paid_sek: 0 },
        invoices: invRes.data ?? [],
        packages: ((pkgRes.data ?? []) as PkgRow[]).map(p => ({
          id:                 p.id,
          name:               p.package_offerings?.name ?? 'Paket',
          package_type:       p.package_offerings?.package_type ?? 'driving',
          quantity_granted:   p.quantity_granted,
          quantity_consumed:  p.quantity_consumed,
          quantity_remaining: Math.max(0, p.quantity_granted - p.quantity_consumed - p.quantity_expired),
          expires_at:         p.expires_at,
          status:             p.status,
        })),
      });
    }

    // GET /progress — student licence progress summary
    if (req.method === 'GET' && path === '/progress') {
      const [studentRes, statsRes] = await Promise.all([
        svc.from('students')
          .select('permit_stage, theory_passed_at, practical_passed_at, risk1_completed_at, risk2_completed_at')
          .eq('id', student_id)
          .single(),
        svc.from('lesson_bookings')
          .select('status')
          .eq('student_id', student_id)
          .eq('organization_id', organization_id),
      ]);

      if (!studentRes.data) return fail(500, 'Failed to load student progress');

      const allBookings = (statsRes.data ?? []) as Array<{ status: string }>;
      return ok({
        ...studentRes.data,
        completed_count: allBookings.filter(b => b.status === 'completed').length,
        upcoming_count:  allBookings.filter(b => b.status === 'confirmed' || b.status === 'reserved').length,
        cancelled_count: allBookings.filter(b => b.status === 'cancelled').length,
        no_show_count:   allBookings.filter(b => b.status === 'no_show').length,
      });
    }

    // GET /assessments — instructor competency assessments for the student
    if (req.method === 'GET' && path === '/assessments') {
      const { data, error } = await svc
        .from('instructor_student_assessments')
        .select('id, competencies, readiness, notes, updated_at, instructors!instructor_id(first_name, last_name)')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) return fail(500, 'Failed to fetch assessments');

      type AssRow = {
        id: string;
        competencies: Record<string, string>;
        readiness: Record<string, boolean>;
        notes: string | null;
        updated_at: string;
        instructors: { first_name: string; last_name: string } | null;
      };

      return ok(((data ?? []) as AssRow[]).map(a => ({
        id:              a.id,
        instructor_name: a.instructors
          ? `${a.instructors.first_name} ${a.instructors.last_name}`
          : 'Okänd instruktör',
        competencies:    a.competencies ?? {},
        readiness:       a.readiness    ?? {},
        notes:           a.notes,
        updated_at:      a.updated_at,
      })));
    }

    // GET /documents — guardian can view student's approved documents
    if (req.method === 'GET' && path === '/documents') {
      const { data: docs, error } = await svc
        .from('student_documents')
        .select('id, category, file_name, mime_type, file_size_bytes, description, expires_at, storage_path, storage_bucket, created_at')
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .eq('status', 'approved')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) return fail(500, 'Failed to fetch documents');

      type DocRow = {
        id: string; category: string; file_name: string; mime_type: string | null;
        file_size_bytes: number | null; description: string | null; expires_at: string | null;
        storage_path: string; storage_bucket: string; created_at: string;
      };

      const withUrls = await Promise.all(((docs ?? []) as DocRow[]).map(async (doc) => {
        const { data: signed } = await svc.storage
          .from(doc.storage_bucket)
          .createSignedUrl(doc.storage_path, 3600);
        return {
          id: doc.id, category: doc.category, file_name: doc.file_name,
          mime_type: doc.mime_type, file_size_bytes: doc.file_size_bytes,
          description: doc.description, expires_at: doc.expires_at,
          created_at: doc.created_at, download_url: signed?.signedUrl ?? null,
        };
      }));

      return ok(withUrls);
    }

    // PATCH /me — guardian updates their own contact info
    if (req.method === 'PATCH' && path === '/me') {
      const UpdateMeSchema = z.object({
        first_name: z.string().min(1).max(100).optional(),
        last_name:  z.string().min(1).max(100).optional(),
        phone:      z.string().max(30).nullable().optional(),
      });

      const body   = await req.json().catch(() => null);
      const parsed = UpdateMeSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'Invalid data');

      const updates = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(updates).length === 0) return fail(400, 'No fields to update');

      const { data: guardian, error } = await svc
        .from('student_guardians')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', guardian_id)
        .eq('organization_id', organization_id)
        .is('deleted_at', null)
        .select('id, first_name, last_name, email, phone, relation, can_pay')
        .single();

      if (error || !guardian) return fail(500, 'Failed to update account');
      return ok(guardian);
    }

    return fail(404, 'Route not found');
  })
);
