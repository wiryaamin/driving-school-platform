/**
 * enrollments — Operator workspace for enrollment request management.
 *
 * All routes require authentication + permission checks.
 *
 * Routes:
 *   GET    /enrollments                        — list (paginated, filterable by status/search)
 *   GET    /enrollments/:id                    — detail with events + package assignment
 *   GET    /enrollments/:id/duplicates         — check for duplicate email/phone/personnummer
 *   PATCH  /enrollments/:id                    — update internal_notes
 *   PATCH  /enrollments/:id/onboarding         — update linked student onboarding_status
 *   POST   /enrollments/:id/approve            — submitted|pending_review → approved
 *   POST   /enrollments/:id/reject             — any non-converted → rejected (with reason)
 *   POST   /enrollments/:id/convert            — approved → converted (creates student + package assignment)
 *   POST   /enrollments/:id/assign-package     — manually create package assignment if missing
 *   POST   /enrollments/:id/create-invoice     — create or retry invoice for a converted enrollment
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors }        from '../_shared/cors.ts';
import { enrichUserFromJwt, getOrgIdFromBearer } from '../_shared/jwt.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined ? { code } : {}) }, status);
}
function getOrgId(user: { app_metadata?: Record<string, unknown> }): string | null {
  return (user.app_metadata?.['organization_id'] as string | undefined) ?? null;
}
function hasPermission(user: { app_metadata?: Record<string, unknown> }, perm: string): boolean {
  if (user.app_metadata?.['is_platform_admin'] === true) return true;
  const perms = (user.app_metadata?.['permissions'] as string[] | undefined) ?? [];
  return perms.includes(perm);
}

function parsePath(req: Request): { id: string | null; action: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'enrollments');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return { id: null, action: null };
  const first = after[0] ?? '';
  if (UUID_RE.test(first)) return { id: first, action: after[1] ?? null };
  return { id: null, action: first };
}

// ─── Event emission helper ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function emitEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client:       any,
  orgId:        string,
  enrollmentId: string,
  eventType:    string,
  actorId:      string | null = null,
  actorEmail:   string | null = null,
  metadata:     Record<string, unknown> = {},
): Promise<void> {
  console.debug('[enrollments] emit_enrollment_event start', { enrollmentId, eventType });
  try {
    await client.rpc('emit_enrollment_event', {
      p_organization_id: orgId,
      p_enrollment_id:   enrollmentId,
      p_event_type:      eventType,
      ...(actorId    != null ? { p_actor_id:    actorId }    : {}),
      ...(actorEmail != null ? { p_actor_email: actorEmail } : {}),
      p_metadata: metadata,
    });
    console.debug('[enrollments] emit_enrollment_event ok', { enrollmentId, eventType });
  } catch (e: unknown) {
    console.warn('[enrollments] emit_enrollment_event failed (non-critical):', { enrollmentId, eventType, error: e });
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const url     = new URL(req.url);
  const page    = Number(url.searchParams.get('page')     ?? '1');
  const perPage = Number(url.searchParams.get('per_page') ?? '25');
  const status  = url.searchParams.get('status');
  const search  = url.searchParams.get('search') ?? '';
  const from    = (page - 1) * perPage;
  const to      = from + perPage - 1;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('enrollment_requests')
    .select(
      'id, status, first_name, last_name, email, phone, package_name, lesson_category, final_price_incl_vat, currency, campaign_name, coupon_code, submitted_at, reviewed_at, converted_at, student_id',
      { count: 'exact' },
    )
    .eq('organization_id', orgId)
    .order('submitted_at', { ascending: false })
    .range(from, to);

  if (status && status !== 'all') q = q.eq('status', status);
  if (search) {
    q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, count, error } = await q;
  if (error) return err('Failed to load enrollments', 500, 'QUERY_FAILED');

  const total = count ?? 0;
  return json({
    data: data ?? [],
    meta: { total, page, per_page: perPage, has_more: page * perPage < total },
  });
}

// ─── Detail ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDetail(_req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:read')) return err('Forbidden', 403, 'FORBIDDEN');

  // Fetch enrollment + events + package assignment in parallel
  const [enrollmentRes, eventsRes, assignmentRes] = await Promise.all([
    client
      .from('enrollment_requests')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle(),
    client
      .from('enrollment_events')
      .select('id, event_type, actor_email, metadata, created_at')
      .eq('enrollment_id', id)
      .order('created_at', { ascending: true }),
    client
      .from('student_package_assignments')
      .select('*')
      .eq('enrollment_id', id)
      .maybeSingle(),
  ]);

  if (enrollmentRes.error) return err('Failed to load enrollment', 500, 'QUERY_FAILED');
  if (!enrollmentRes.data) return err('Enrollment not found', 404, 'NOT_FOUND');

  const enrollment = enrollmentRes.data as Record<string, unknown>;

  // Auto-transition submitted → pending_review on first open, and emit event
  const isFirstOpen = enrollment['status'] === 'submitted';
  if (isFirstOpen) {
    await client
      .from('enrollment_requests')
      .update({ status: 'pending_review' })
      .eq('id', id);
    enrollment['status'] = 'pending_review';

    await emitEvent(client, orgId, id, 'viewed', user.id as string | null, user.email as string | null);
  }

  // Fetch student onboarding_status if converted
  let studentOnboardingStatus: string | null = null;
  const studentId = enrollment['student_id'] as string | null;
  if (studentId) {
    const { data: student } = await client
      .from('students')
      .select('onboarding_status')
      .eq('id', studentId)
      .maybeSingle();
    studentOnboardingStatus = (student?.onboarding_status as string | undefined) ?? null;
  }

  // Never expose the submitter IP to the frontend
  delete enrollment['submitter_ip'];

  return json({
    data: {
      ...enrollment,
      events:                    eventsRes.data ?? [],
      package_assignment:        assignmentRes.data ?? null,
      student_onboarding_status: studentOnboardingStatus,
    },
  });
}

// ─── Duplicates check ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDuplicates(_req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data: enrollment } = await client
    .from('enrollment_requests')
    .select('email, phone, personnummer')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!enrollment) return err('Enrollment not found', 404, 'NOT_FOUND');

  const email        = enrollment.email       as string;
  const phone        = enrollment.phone       as string | null;
  const personnummer = enrollment.personnummer as string | null;
  const last4        = personnummer && personnummer.replace(/\D/g, '').length >= 4
    ? personnummer.replace(/\D/g, '').slice(-4)
    : null;

  const [byEmail, byPhone, byPersonnummer] = await Promise.all([
    client
      .from('students')
      .select('id, first_name, last_name, email, status, onboarding_status')
      .eq('organization_id', orgId)
      .ilike('email', email)
      .is('deleted_at', null),
    phone
      ? client
          .from('students')
          .select('id, first_name, last_name, phone, status')
          .eq('organization_id', orgId)
          .ilike('phone', phone)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    last4
      ? client
          .from('students')
          .select('id, first_name, last_name, personnummer_last4, status')
          .eq('organization_id', orgId)
          .eq('personnummer_last4', last4)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return json({
    data: {
      by_email:        byEmail.data ?? [],
      by_phone:        byPhone.data ?? [],
      by_personnummer: byPersonnummer.data ?? [],
    },
  });
}

// ─── Update (internal notes) ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpdate(req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:update')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON', 400, 'INVALID_JSON'); }

  const allowed: Record<string, unknown> = {};
  if (typeof body['internal_notes'] === 'string') allowed['internal_notes'] = body['internal_notes'];

  if (Object.keys(allowed).length === 0) return err('No valid fields to update', 400, 'NO_FIELDS');

  const { data, error } = await client
    .from('enrollment_requests')
    .update(allowed)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id, status, internal_notes, updated_at')
    .single();

  if (error || !data) return err('Update failed', 500, 'UPDATE_FAILED');

  await emitEvent(client, orgId, id, 'notes_updated', user.id as string | null, user.email as string | null);

  return json({ data });
}

// ─── Onboarding status update ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleOnboarding(req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:update')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON', 400, 'INVALID_JSON'); }

  const VALID = ['new_student', 'documents_pending', 'ready_for_booking', 'active_student'];
  const onboardingStatus = body['onboarding_status'];
  if (typeof onboardingStatus !== 'string' || !VALID.includes(onboardingStatus)) {
    return err('Invalid onboarding_status value', 400, 'INVALID_STATUS');
  }

  const { data: enrollment } = await client
    .from('enrollment_requests')
    .select('student_id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!enrollment) return err('Enrollment not found', 404, 'NOT_FOUND');
  if (!enrollment.student_id) return err('No student linked to this enrollment', 409, 'NO_STUDENT');

  const { error } = await client.rpc('set_student_onboarding_status', {
    p_organization_id:   orgId,
    p_student_id:        enrollment.student_id as string,
    p_onboarding_status: onboardingStatus,
  });

  if (error) {
    console.error('set_student_onboarding_status failed:', error);
    return err('Failed to update onboarding status', 500, 'UPDATE_FAILED');
  }

  await emitEvent(client, orgId, id, 'status_updated', user.id as string | null, user.email as string | null, {
    onboarding_status: onboardingStatus,
  });

  return json({ data: { onboarding_status: onboardingStatus } });
}

// ─── Approve ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleApprove(_req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:update')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data: current } = await client
    .from('enrollment_requests')
    .select('id, status')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!current) return err('Enrollment not found', 404, 'NOT_FOUND');
  if (!['submitted', 'pending_review'].includes(current.status as string)) {
    return err(`Cannot approve enrollment in status "${current.status}"`, 409, 'INVALID_STATUS');
  }

  const { data, error } = await client
    .from('enrollment_requests')
    .update({
      status:      'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', id)
    .select('id, status, reviewed_at')
    .single();

  if (error || !data) return err('Approve failed', 500, 'UPDATE_FAILED');

  await emitEvent(client, orgId, id, 'approved', user.id as string | null, user.email as string | null);

  return json({ data });
}

// ─── Reject ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReject(req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:update')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* reason optional */ }
  const reason = typeof body['reason'] === 'string' && body['reason'].trim()
    ? body['reason'].trim()
    : 'Inte angett';

  const { data: current } = await client
    .from('enrollment_requests')
    .select('id, status')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!current) return err('Enrollment not found', 404, 'NOT_FOUND');
  if (current.status === 'converted') {
    return err('Cannot reject a converted enrollment', 409, 'ALREADY_CONVERTED');
  }

  const { data, error } = await client
    .from('enrollment_requests')
    .update({
      status:          'rejected',
      rejected_reason: reason,
      reviewed_at:     new Date().toISOString(),
      reviewed_by:     user.id,
    })
    .eq('id', id)
    .select('id, status, rejected_reason, reviewed_at')
    .single();

  if (error || !data) return err('Reject failed', 500, 'UPDATE_FAILED');

  await emitEvent(client, orgId, id, 'rejected', user.id as string | null, user.email as string | null, {
    reason,
  });

  return json({ data });
}

// ─── Convert to student ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleConvert(_req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:convert')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data: enrollment } = await client
    .from('enrollment_requests')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!enrollment) return err('Enrollment not found', 404, 'NOT_FOUND');
  if (enrollment.status !== 'approved') {
    return err('Only approved enrollments can be converted', 409, 'INVALID_STATUS');
  }
  if (enrollment.student_id) {
    return err('Already converted', 409, 'ALREADY_CONVERTED');
  }

  // Check for existing student with same email in this org
  const { data: existingStudent } = await client
    .from('students')
    .select('id')
    .eq('organization_id', orgId)
    .ilike('email', enrollment.email as string)
    .is('deleted_at', null)
    .maybeSingle();

  let studentId: string;

  if (existingStudent) {
    studentId = existingStudent.id as string;
  } else {
    const { data: newStudent, error: studentErr } = await client
      .from('students')
      .insert({
        organization_id:    orgId,
        first_name:         enrollment.first_name,
        last_name:          enrollment.last_name,
        email:              enrollment.email,
        phone:              enrollment.phone,
        ...(enrollment.address     != null ? { address_line1: enrollment.address }            : {}),
        preferred_language: enrollment.preferred_language,
        ...(enrollment.license_category != null
          ? { target_licence_category: enrollment.license_category }
          : {}),
        status:             'onboarding',
        identity_type:      'none',
        gdpr_consent_given_at: enrollment.submitted_at,
        ...(enrollment.comments != null ? { notes: enrollment.comments } : {}),
      })
      .select('id')
      .single();

    if (studentErr || !newStudent) {
      console.error('student creation failed', studentErr);
      return err('Kunde inte skapa elev', 500, 'STUDENT_CREATE_FAILED');
    }
    studentId = newStudent.id as string;
  }

  // Update enrollment to converted
  const { data: updated, error: updateErr } = await client
    .from('enrollment_requests')
    .update({
      status:       'converted',
      student_id:   studentId,
      converted_at: new Date().toISOString(),
      converted_by: user.id,
    })
    .eq('id', id)
    .select('id, status, student_id, converted_at')
    .single();

  if (updateErr || !updated) return err('Conversion update failed', 500, 'UPDATE_FAILED');

  // ── D3.E2: Set initial commercial status ──────────────────────────────────────
  // Marks the student as activated-but-not-yet-invoiced. Non-critical: status gap
  // is cosmetic; financial integrity is determined by the invoice record.
  const { error: statusInitErr } = await client.rpc('set_student_commercial_status', {
    p_organization_id: orgId,
    p_student_id:      studentId,
    p_status:          'aktiverad_ej_fakturerad',
  });
  if (statusInitErr) {
    console.warn('set_student_commercial_status(aktiverad_ej_fakturerad) failed (non-critical):', statusInitErr);
  }

  // ── H-1: Create order from enrollment ────────────────────────────────────────
  // Non-critical: if order creation fails the conversion still completes so
  // operators are not blocked.  The unique index (H-3) prevents a second order
  // from being created on any retry.
  let orderId:     string | null = null;
  let orderNumber: number | null = null;

  const { data: orderResult, error: orderErr } = await client.rpc('create_order', {
    p_organization_id:     orgId,
    p_student_id:          studentId,
    p_enrollment_id:       id,
    p_package_offering_id: enrollment.package_offering_id as string | null,
    p_package_name:        enrollment.package_name        as string | null,
    p_package_code:        enrollment.package_code        as string | null,
    p_lesson_category:     enrollment.lesson_category     as string | null,
    p_package_quantity:    enrollment.package_quantity     as number | null,
    p_campaign_id:         enrollment.campaign_id         as string | null,
    p_campaign_name:       enrollment.campaign_name       as string | null,
    p_coupon_id:           enrollment.coupon_id           as string | null,
    p_coupon_code:         enrollment.coupon_code         as string | null,
    p_base_price:          enrollment.base_price          as number ?? 0,
    p_campaign_discount:   enrollment.campaign_discount   as number ?? 0,
    p_coupon_discount:     enrollment.coupon_discount     as number ?? 0,
    p_vat_rate:            enrollment.vat_rate            as number ?? 0.25,
    p_currency:            enrollment.currency            as string ?? 'SEK',
    p_actor_id:            user.id    as string | null,
    p_actor_email:         user.email as string | null,
    p_metadata:            { enrollment_id: id, source: 'enrollment_conversion' },
  });

  if (orderErr) {
    console.warn('create_order failed during conversion (non-critical):', orderErr);
  } else if (orderResult != null) {
    const res = orderResult as Record<string, unknown>;
    orderId     = res['order_id']     as string | null;
    orderNumber = res['order_number'] as number | null;
  }

  // ── Auto-create package assignment from enrollment price snapshot ─────────────
  let packageAssignmentId: string | null = null;
  const { data: assignment, error: assignErr } = await client
    .from('student_package_assignments')
    .insert({
      organization_id:     orgId,
      student_id:          studentId,
      enrollment_id:       id,
      ...(orderId != null ? { order_id: orderId } : {}),
      package_offering_id: enrollment.package_offering_id as string,
      package_name:        enrollment.package_name as string,
      ...(enrollment.package_code  != null ? { package_code:  enrollment.package_code }  : {}),
      lesson_category:     enrollment.lesson_category as string,
      package_quantity:    enrollment.package_quantity as number,
      ...(enrollment.campaign_id   != null ? { campaign_id:   enrollment.campaign_id }   : {}),
      ...(enrollment.campaign_name != null ? { campaign_name: enrollment.campaign_name } : {}),
      ...(enrollment.coupon_id     != null ? { coupon_id:     enrollment.coupon_id }     : {}),
      ...(enrollment.coupon_code   != null ? { coupon_code:   enrollment.coupon_code }   : {}),
      base_price:          enrollment.base_price as number,
      vat_rate:            enrollment.vat_rate as number,
      campaign_discount:   enrollment.campaign_discount as number,
      coupon_discount:     enrollment.coupon_discount as number,
      final_price:         enrollment.final_price as number,
      final_price_incl_vat: enrollment.final_price_incl_vat as number,
      currency:            enrollment.currency as string,
      assigned_by:         user.id,
    })
    .select('id')
    .single();

  if (assignErr) {
    console.warn('Package assignment creation failed (non-critical):', assignErr);
  } else {
    packageAssignmentId = assignment?.id as string | null;
  }

  // ── H-2: Link orders.assignment_id ↔ package assignment ─────────────────────
  if (orderId != null && packageAssignmentId != null) {
    console.debug('[enrollments] link_order_assignment start', { orderId, packageAssignmentId });
    try {
      await client.rpc('link_order_assignment', {
        p_order_id:        orderId,
        p_assignment_id:   packageAssignmentId,
        p_organization_id: orgId,
      });
      console.debug('[enrollments] link_order_assignment ok', { orderId, packageAssignmentId });
    } catch (e: unknown) {
      console.warn('[enrollments] link_order_assignment failed (non-critical):', { orderId, packageAssignmentId, error: e });
    }
  }

  await emitEvent(client, orgId, id, 'converted', user.id as string | null, user.email as string | null, {
    student_id:             studentId,
    student_created:        !existingStudent,
    ...(packageAssignmentId != null ? { package_assignment_id: packageAssignmentId } : {}),
    ...(orderId             != null ? { order_id: orderId }                          : {}),
  });

  if (packageAssignmentId) {
    await emitEvent(client, orgId, id, 'package_assigned', user.id as string | null, user.email as string | null, {
      student_package_assignment_id: packageAssignmentId,
    });
    // emit package_assigned to package_consumption_events timeline
    console.debug('[enrollments] record_package_assigned_event start', { packageAssignmentId });
    try {
      await client.rpc('record_package_assigned_event', {
        p_assignment_id:   packageAssignmentId,
        p_organization_id: orgId,
        p_actor_id:        user.id   ?? null,
        p_actor_email:     user.email ?? null,
      });
      console.debug('[enrollments] record_package_assigned_event ok', { packageAssignmentId });
    } catch (e: unknown) {
      console.warn('[enrollments] record_package_assigned_event failed (non-critical):', { packageAssignmentId, error: e });
    }
  }

  // H-1: emit order_created enrollment event when an order was created
  if (orderId != null) {
    await emitEvent(client, orgId, id, 'order_created', user.id as string | null, user.email as string | null, {
      order_id:     orderId,
      order_number: orderNumber,
      student_id:   studentId,
    });
  }

  // ── D3.E1: Create and issue invoice from order ─────────────────────────────
  // Non-critical: failure surfaces in invoice_error but does not block conversion.
  // The invoice_created enrollment event is emitted atomically inside the DB
  // function — not from this handler — preserving the correct event sequence:
  //   converted → package_assigned → order_created → invoice_created
  // Retry a failed invoice via POST /enrollments/:id/create-invoice.
  let invoiceId:     string | null = null;
  let invoiceNumber: string | null = null;
  // Seed with ORDER_NOT_CREATED when orderId is null so the caller can distinguish
  // "invoice not attempted" from "invoice attempted and succeeded".
  let invoiceError:  string | null = orderId === null ? 'ORDER_NOT_CREATED' : null;

  if (orderId != null) {
    console.debug('[enrollments] create_invoice_from_order start', { orderId, enrollmentId: id });
    const { data: invoiceResult, error: invoiceErr } = await client.rpc('create_invoice_from_order', {
      p_order_id:      orderId,
      p_enrollment_id: id,
      p_actor_id:      user.id    as string | null,
      p_actor_email:   user.email as string | null,
    });
    console.debug('[enrollments] create_invoice_from_order done', { orderId, hasError: !!invoiceErr, hasResult: invoiceResult != null });

    if (invoiceErr) {
      console.warn('[enrollments] create_invoice_from_order failed (non-critical):', { orderId, error: invoiceErr });
      invoiceError = (invoiceErr as { message?: string }).message ?? 'INVOICE_CREATION_FAILED';
    } else if (invoiceResult != null) {
      const inv = invoiceResult as Record<string, unknown>;
      invoiceId     = inv['invoice_id']     as string | null;
      invoiceNumber = inv['invoice_number'] as string | null;

      // ── D3.E3: Advance commercial status to awaiting_payment ──────────────
      const { error: statusPayErr } = await client.rpc('set_student_commercial_status', {
        p_organization_id: orgId,
        p_student_id:      studentId,
        p_status:          'awaiting_payment',
      });
      if (statusPayErr) {
        console.warn('set_student_commercial_status(awaiting_payment) failed (non-critical):', statusPayErr);
      }
    }
  }

  // D3.E4: response augmented with invoice outcome fields
  return json({
    data: {
      ...updated,
      student_created:         !existingStudent,
      package_assignment_id:   packageAssignmentId,
      order_id:                orderId,
      order_number:            orderNumber,
      invoice_id:              invoiceId,
      invoice_number:          invoiceNumber,
      invoice_error:           invoiceError,
    },
  });
}

// ─── Manual package assignment ────────────────────────────────────────────────
// Fallback for cases where auto-assignment during convert failed.
// Returns existing assignment immediately if one already exists.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAssignPackage(_req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:convert')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data: enrollment } = await client
    .from('enrollment_requests')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!enrollment)                 return err('Enrollment not found', 404, 'NOT_FOUND');
  if (enrollment.status !== 'converted') return err('Enrollment must be converted first', 409, 'NOT_CONVERTED');
  if (!enrollment.student_id)      return err('No student linked to this enrollment', 409, 'NO_STUDENT');

  // Return existing assignment if present
  const { data: existing } = await client
    .from('student_package_assignments')
    .select('*')
    .eq('enrollment_id', id)
    .maybeSingle();

  if (existing) return json({ data: existing, already_assigned: true });

  const { data: assignment, error } = await client
    .from('student_package_assignments')
    .insert({
      organization_id:     orgId,
      student_id:          enrollment.student_id as string,
      enrollment_id:       id,
      package_offering_id: enrollment.package_offering_id as string,
      package_name:        enrollment.package_name as string,
      ...(enrollment.package_code  != null ? { package_code:  enrollment.package_code }  : {}),
      lesson_category:     enrollment.lesson_category as string,
      package_quantity:    enrollment.package_quantity as number,
      ...(enrollment.campaign_id   != null ? { campaign_id:   enrollment.campaign_id }   : {}),
      ...(enrollment.campaign_name != null ? { campaign_name: enrollment.campaign_name } : {}),
      ...(enrollment.coupon_id     != null ? { coupon_id:     enrollment.coupon_id }     : {}),
      ...(enrollment.coupon_code   != null ? { coupon_code:   enrollment.coupon_code }   : {}),
      base_price:          enrollment.base_price as number,
      vat_rate:            enrollment.vat_rate as number,
      campaign_discount:   enrollment.campaign_discount as number,
      coupon_discount:     enrollment.coupon_discount as number,
      final_price:         enrollment.final_price as number,
      final_price_incl_vat: enrollment.final_price_incl_vat as number,
      currency:            enrollment.currency as string,
      assigned_by:         user.id,
    })
    .select('*')
    .single();

  if (error || !assignment) {
    console.error('handleAssignPackage failed:', error);
    return err('Package assignment failed', 500, 'ASSIGN_FAILED');
  }

  await emitEvent(client, orgId, id, 'package_assigned', user.id as string | null, user.email as string | null, {
    student_package_assignment_id: assignment.id as string,
  });
  // H-2: emit package_assigned to package_consumption_events timeline
  console.debug('[enrollments] record_package_assigned_event start (assign-package)', { assignmentId: assignment.id });
  try {
    await client.rpc('record_package_assigned_event', {
      p_assignment_id:   assignment.id as string,
      p_organization_id: orgId,
      p_actor_id:        user.id   ?? null,
      p_actor_email:     user.email ?? null,
    });
    console.debug('[enrollments] record_package_assigned_event ok (assign-package)', { assignmentId: assignment.id });
  } catch (e: unknown) {
    console.warn('[enrollments] record_package_assigned_event failed (non-critical, assign-package):', { assignmentId: assignment.id, error: e });
  }

  return json({ data: assignment, already_assigned: false });
}

// ─── Create / retry invoice ───────────────────────────────────────────────────
// Idempotent: create_invoice_from_order() returns the existing invoice when one
// already exists for the order, making repeated calls safe.
// Intended as the recovery path when invoice creation failed during convert.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateInvoice(_req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'enrollment:request:convert')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data: enrollment } = await client
    .from('enrollment_requests')
    .select('id, status, student_id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!enrollment)                          return err('Enrollment not found', 404, 'NOT_FOUND');
  if (enrollment.status !== 'converted')    return err('Enrollment must be converted before creating an invoice', 409, 'NOT_CONVERTED');
  if (!enrollment.student_id)              return err('No student linked to this enrollment', 409, 'NO_STUDENT');

  // Find the most recent eligible order for this enrollment.
  // ORDER BY created_at DESC LIMIT 1 selects the newest in the rare case where
  // multiple draft orders exist from prior retry bugs.
  const { data: order, error: orderQueryErr } = await client
    .from('orders')
    .select('id, order_number')
    .eq('enrollment_id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .not('status', 'in', '(cancelled,refunded)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderQueryErr) {
    console.error('handleCreateInvoice order query failed:', orderQueryErr);
    return err('Failed to load order', 500, 'QUERY_FAILED');
  }
  if (!order) return err('No eligible order found for this enrollment', 409, 'ORDER_MISSING');

  // create_invoice_from_order() is idempotent: returns the existing invoice
  // with idempotent=true when orders.invoice_id is already set.
  const { data: invoiceResult, error: invoiceErr } = await client.rpc('create_invoice_from_order', {
    p_order_id:      order.id  as string,
    p_enrollment_id: id,
    p_actor_id:      user.id    as string | null,
    p_actor_email:   user.email as string | null,
  });

  if (invoiceErr) {
    console.error('create_invoice_from_order failed in handleCreateInvoice:', invoiceErr);
    return err((invoiceErr as { message?: string }).message ?? 'Invoice creation failed', 422, 'INVOICE_CREATION_FAILED');
  }

  const result = invoiceResult as Record<string, unknown>;

  // Confirm or advance commercial status — safe to re-set on idempotent calls.
  const { error: statusErr } = await client.rpc('set_student_commercial_status', {
    p_organization_id: orgId,
    p_student_id:      enrollment.student_id as string,
    p_status:          'awaiting_payment',
  });
  if (statusErr) {
    console.warn('set_student_commercial_status(awaiting_payment) failed in handleCreateInvoice (non-critical):', statusErr);
  }

  return json({
    data: {
      invoice_id:        result['invoice_id'],
      invoice_number:    result['invoice_number'],
      total_amount:      result['total_amount'],
      currency:          result['currency'],
      order_id:          result['order_id'],
      order_number:      result['order_number'],
      idempotent:        result['idempotent'],
      commercial_status: 'awaiting_payment',
    },
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')      ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization')  ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: rawUser }, error: authErr } = await client.auth.getUser();
  if (authErr !== null || rawUser === null) return err('Unauthorized', 401, 'UNAUTHORIZED');
  const user = enrichUserFromJwt(req, rawUser);

  const orgId = getOrgId(user) ?? getOrgIdFromBearer(req);
  if (orgId === null) return err('No organization context', 400, 'NO_ORG_CONTEXT');

  const { id, action } = parsePath(req);

  try {
    // Routes without an id
    if (!id) {
      if (req.method === 'GET') return await handleList(req, client, orgId, user);
      return err('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
    }

    // Action sub-routes
    if (action === 'approve'        && req.method === 'POST')  return await handleApprove(req, client, orgId, user, id);
    if (action === 'reject'         && req.method === 'POST')  return await handleReject(req, client, orgId, user, id);
    if (action === 'convert'        && req.method === 'POST')  return await handleConvert(req, client, orgId, user, id);
    if (action === 'assign-package' && req.method === 'POST')  return await handleAssignPackage(req, client, orgId, user, id);
    if (action === 'create-invoice' && req.method === 'POST')  return await handleCreateInvoice(req, client, orgId, user, id);
    if (action === 'duplicates'     && req.method === 'GET')   return await handleDuplicates(req, client, orgId, user, id);
    if (action === 'onboarding'     && req.method === 'PATCH') return await handleOnboarding(req, client, orgId, user, id);

    // Base id routes
    if (!action) {
      if (req.method === 'GET')   return await handleDetail(req, client, orgId, user, id);
      if (req.method === 'PATCH') return await handleUpdate(req, client, orgId, user, id);
    }

    return err('Not found', 404, 'NOT_FOUND');
  } catch (e) {
    console.error('enrollments error', e);
    return err('Internal server error', 500, 'INTERNAL_ERROR');
  }
}));
