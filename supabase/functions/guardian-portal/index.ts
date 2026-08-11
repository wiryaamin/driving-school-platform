import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { registerPushToken, revokePushToken } from '../_shared/push-tokens.ts';
import { decryptCredential } from '../_shared/credential-crypto.ts';

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

// ─── Authorization ────────────────────────────────────────────────────────────
//
// Staff-facing management routes (generate-token, guardians CRUD) require the
// same permission already used to gate editing the rest of a student's record
// elsewhere in the platform (StudentDetailPage.tsx, students/index.ts)  —
// guardians are managed as part of a student's record, not a separate
// resource with its own access tier. Mirrors the requirePerm() pattern
// already established in students/index.ts and every other Category D
// Edge Function: platform admins bypass, otherwise the caller's JWT-derived
// permissions (ctx.permissions) must include the required code.
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
    .select('id, guardian_id, student_id, organization_id, expires_at, student_guardians!guardian_id(deleted_at), students!student_id(deleted_at)')
    .eq('token_hash', hash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;

  // Same gap as student-portal/instructor-portal: a token issued before the
  // guardian or their student was removed otherwise stays valid until its
  // own TTL. Either side being gone should cut off access immediately.
  const row = data as unknown as {
    student_guardians: { deleted_at: string | null } | null;
    students:          { deleted_at: string | null } | null;
  };
  if (row.student_guardians?.deleted_at || row.students?.deleted_at) return null;

  void svc
    .from('guardian_portal_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', (data as GuardianSession).id);

  return data as GuardianSession;
}

// ─── Access audit logging ──────────────────────────────────────────────────────
//
// Guardian read access to a student's data was previously untracked. Reuses
// the existing insert_activity_log() RPC (enterprise_foundation migration —
// "Inserts an activity log entry. Called from Edge Functions via service
// role.") rather than audit_logs/insert_audit_log(), whose `operation` enum
// is locked to INSERT/UPDATE/DELETE/RESTORE and has no value for a read.
// Fire-and-forget (not awaited), matching the existing last_used_at update
// pattern above — logging must never add latency to the guardian's request.
// No PII is logged: only UUIDs (organization/student/guardian ids) and the
// action name.
function logGuardianAccess(
  svc: ReturnType<typeof createServiceClient>,
  session: GuardianSession,
  action: string,
): void {
  void svc.rpc('insert_activity_log', {
    p_organization_id: session.organization_id,
    p_user_id:         null,
    p_user_email:       null,
    p_action:           action,
    p_entity_type:      'student',
    p_entity_id:        session.student_id,
    p_metadata:         { guardian_id: session.guardian_id },
  }).then(({ error }: { error: { message: string } | null }) => {
    if (error) logger.error('guardian-portal: audit log write failed', { error: error.message, action });
  });
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

const RegisterPushTokenSchema = z.object({
  token:          z.string().min(16),
  previous_token: z.string().min(16).optional(),
  platform:       z.enum(['web', 'ios', 'android']).optional(),
});

const RevokePushTokenSchema = z.object({
  token_id: z.string().uuid(),
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
      const permGuard = requirePerm(ctx, 'students:student:update');
      if (permGuard) return permGuard;

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
      const permGuard = requirePerm(ctx, 'students:student:update');
      if (permGuard) return permGuard;

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
      const permGuard = requirePerm(ctx, 'students:student:read');
      if (permGuard) return permGuard;

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
      const permGuard = requirePerm(ctx, 'students:student:update');
      if (permGuard) return permGuard;

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
      logGuardianAccess(svc, session, 'guardian_portal.viewed_me');
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

      logGuardianAccess(svc, session, 'guardian_portal.viewed_bookings');
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
          // invoices has no amount_sek column — it's total_amount. Aliased here
          // (not renamed) so the response shape/frontend type is unchanged.
          // Found via live pilot simulation: every /balance call silently
          // returned invoices: [] (the query 42703-errored and the ?? []
          // fallback masked it) — a guardian with can_pay=true could never
          // see or act on what they owed.
          .select('id, invoice_number, amount_sek:total_amount, due_date, status')
          .eq('student_id', student_id)
          .eq('organization_id', organization_id)
          .in('status', ['issued', 'overdue'])
          .order('due_date')
          .limit(10),
        // student_package_assignments, not student_packages — quantity_consumed
        // on the latter is never updated by the consumption pipeline (lesson
        // completion writes lessons_used on the assignments row only; see
        // 20260720000006_sync_purchase_package_to_assignments.sql), and
        // assignments rows only exist once a sale is real, so never-issued
        // draft purchases don't leak through here either.
        svc.from('student_package_assignments')
          .select('id, status, package_name, lesson_category, package_quantity, lessons_used, expires_at, assigned_at')
          .eq('student_id', student_id)
          .eq('organization_id', organization_id)
          .in('status', ['active', 'completed'])
          .order('assigned_at', { ascending: false })
          .limit(5),
      ]);

      type PkgRow = {
        id: string;
        status: string;
        package_name: string;
        lesson_category: string | null;
        package_quantity: number;
        lessons_used: number;
        expires_at: string | null;
        assigned_at: string;
      };

      logGuardianAccess(svc, session, 'guardian_portal.viewed_balance');
      return ok({
        balance:  balRes.data ?? { balance_sek: 0, credit_used_sek: 0, total_paid_sek: 0 },
        invoices: invRes.data ?? [],
        packages: ((pkgRes.data ?? []) as PkgRow[]).map(p => ({
          id:                 p.id,
          name:               p.package_name,
          package_type:       p.lesson_category ?? 'driving',
          quantity_granted:   p.package_quantity,
          quantity_consumed:  p.lessons_used,
          quantity_remaining: Math.max(0, p.package_quantity - p.lessons_used),
          expires_at:         p.expires_at,
          status:             p.status,
        })),
      });
    }

    // POST /payments/stripe/checkout — guardian-initiated Stripe Checkout
    // session for one of their student's unpaid invoices. Business Workflow
    // Execution Audit (2026-08-07): the guardian portal's own can_pay flag
    // and Ekonomi tab gated a payment capability that never existed — this
    // was a dead end to "kontakta skolan för betalning." Mirrors
    // student-portal's own POST /payments/stripe/checkout exactly (same
    // Stripe params shape, same payment_requests row shape), scoped to the
    // guardian's session student instead of a logged-in student.
    if (req.method === 'POST' && path === '/payments/stripe/checkout') {
      const { data: guardian } = await svc
        .from('student_guardians')
        .select('can_pay')
        .eq('id', guardian_id)
        .single();

      if (!(guardian as { can_pay: boolean } | null)?.can_pay) {
        return fail(403, 'Payment access not granted for this guardian');
      }

      const body      = await req.json().catch(() => null) as { invoice_id?: string } | null;
      const invoiceId = body?.invoice_id;
      if (!invoiceId) return fail(400, 'invoice_id required');

      const { data: inv } = await svc
        .from('invoices')
        .select('id, outstanding_amount, invoice_number')
        .eq('id', invoiceId)
        .eq('student_id', student_id)
        .eq('organization_id', organization_id)
        .in('status', ['issued', 'overdue', 'partially_paid'])
        .is('void_at', null)
        .maybeSingle();

      if (!inv) return fail(404, 'Invoice not found or already paid');

      const { data: orgRow } = await svc
        .from('organizations')
        .select('settings')
        .eq('id', organization_id)
        .maybeSingle();

      // Dual-level payment architecture: a tenant's own (or explicitly-copied
      // pilot) credential in organizations.settings is the only valid
      // source. No platform Deno.env fallback here — see Payment Provider
      // Resolution Safety Check (2026-08-11).
      const settings  = ((orgRow as { settings?: Record<string, unknown> } | null)?.settings) ?? {};
      const storedKey = settings['stripe_secret_key'] as string | undefined;
      const stripeKey = storedKey !== undefined ? await decryptCredential(storedKey) : '';

      if (!stripeKey) return fail(503, 'Online card payment is not configured for this school');

      const appUrl    = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
      const prId       = crypto.randomUUID();
      const invNum    = (inv as { invoice_number: string | null }).invoice_number;
      const amountSek = (inv as { outstanding_amount: number }).outstanding_amount;

      const params = new URLSearchParams({
        'mode':                                   'payment',
        'currency':                               'sek',
        'line_items[0][price_data][currency]':    'sek',
        'line_items[0][price_data][unit_amount]': String(Math.round(amountSek * 100)),
        'line_items[0][price_data][product_data][name]':
          `Faktura ${invNum ?? invoiceId.slice(0, 8)}`,
        'line_items[0][quantity]': '1',
        'success_url':             `${appUrl}/guardian/ekonomi?payment=success&req=${prId}`,
        'cancel_url':              `${appUrl}/guardian/ekonomi?payment=cancelled`,
        'metadata[invoice_id]':         invoiceId,
        'metadata[payment_request_id]': prId,
        'metadata[organization_id]':    organization_id,
        'metadata[student_id]':         student_id,
        'metadata[guardian_id]':        guardian_id,
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
        logger.error('guardian-portal: Stripe session creation failed', {
          status: stripeRes.status,
          error:  stripeData.error?.message,
        });
        return fail(502, 'Payment provider error — please try again');
      }

      const { error: prErr } = await svc.from('payment_requests').insert({
        id:                  prId,
        organization_id,
        student_id,
        invoice_id:          invoiceId,
        provider:            'stripe',
        provider_session_id: stripeData.id,
        amount_sek:          amountSek,
        status:              'pending',
        return_url:          `${appUrl}/guardian/ekonomi`,
        expires_at:          new Date(Date.now() + 30 * 60_000).toISOString(),
        metadata:            { stripe_session_id: stripeData.id, guardian_id },
      });

      if (prErr) {
        logger.warn('guardian-portal: payment_request insert failed, proceeding without record', { prId, error: prErr.message });
      }

      logGuardianAccess(svc, session, 'guardian_portal.requested_payment');
      return ok({ session_url: stripeData.url, payment_request_id: prId }, 201);
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
      logGuardianAccess(svc, session, 'guardian_portal.viewed_progress');
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

      logGuardianAccess(svc, session, 'guardian_portal.viewed_assessments');
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

      logGuardianAccess(svc, session, 'guardian_portal.viewed_documents');
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

    // ── POST /push/register — register or refresh an FCM device token ────────
    if (req.method === 'POST' && path === '/push/register') {
      const body   = await req.json().catch(() => null);
      const parsed = RegisterPushTokenSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'Valid device token required');

      const result = await registerPushToken(
        svc,
        {
          organizationId: organization_id,
          ownerColumn:    'guardian_id',
          ownerId:        guardian_id,
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

      const result = await revokePushToken(svc, organization_id, 'guardian_id', guardian_id, parsed.data.token_id, 'client_unsubscribed');
      if ('error' in result) return fail(500, result.error);
      return ok({ revoked: true });
    }

    return fail(404, 'Route not found');
  })
);
