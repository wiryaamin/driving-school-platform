/**
 * invite-user — tenant-scoped staff invitation (Authentication Recovery
 * Module, Sprint 4). Backs the existing "Bjud in" dialog in
 * UsersSettingsPage.tsx, which already calls `invite-user` and has done so
 * since before this function existed (see the pre-written failure-toast
 * copy referencing it) — this is the missing half of that contract, not a
 * new one.
 *
 * New-user path issues a real Supabase Auth invite (admin.inviteUserByEmail),
 * matching EMAIL_ARCHITECTURE.md's Responsibility Matrix: Invitation email is
 * owned by Supabase Auth / Dashboard SMTP, not the app-level Resend path.
 * Existing-user path (the email already has an auth.users row, i.e. is a
 * member of some organization already) skips the email entirely and adds a
 * membership directly — there is nothing to "activate," they already have
 * credentials.
 *
 * verify_jwt stays at its default (true) — this is an authenticated,
 * permission-gated org-admin action, not a public entrypoint.
 */

import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext, requirePerm } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createServiceClient, createAnonClient } from '../_shared/supabase.ts';
import { getSeatEntitlement } from '../_shared/entitlements.ts';
import { recordIdentityEvent } from '../_shared/identity-events.ts';
import { inviteNewStaffMember, buildProfilePersonFields, buildMembershipEmploymentFields } from '../_shared/staff-invite.ts';
import { logger } from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

const JSON_CT = { 'Content-Type': 'application/json' } as const;

// Kept in sync with packages/validation/src/auth/password.schema.ts
// (INVITABLE_ROLES, PERSONNEL_JOB_TITLES) — Deno can't import workspace
// packages, so it's duplicated here per the established Edge Function
// convention.
const INVITABLE_ROLES = [
  'org_admin', 'org_manager', 'instructor', 'instructor_senior',
  'receptionist', 'finance_admin', 'student_admin', 'reporting_viewer',
  'corporate_contact',
] as const;

// 'trafiklarare' is deliberately absent — that professional role is
// represented by a public.instructors record via the existing InstructorForm
// flow, not through this invite path.
const PERSONNEL_JOB_TITLES = [
  'trafikskolechef', 'utbildningsledare', 'trafiklararpraktikant',
  'receptionist', 'administrativ_personal', 'ekonomipersonal', 'ovrig_personal',
] as const;

const EMPLOYMENT_TYPES = ['employed', 'contractor', 'external', 'on_leave', 'inactive'] as const;

// Subset of public.personal_identity_type this form collects — see the
// matching comment in packages/validation/src/auth/password.schema.ts.
const PERSONNEL_IDENTITY_TYPES = ['personnummer', 'samordningsnummer'] as const;

const InviteUserSchema = z.object({
  email:      z.string().trim().toLowerCase().email(),
  first_name: z.string().trim().min(1).max(100),
  last_name:  z.string().trim().min(1).max(100),
  role:       z.enum(INVITABLE_ROLES),

  // ── Common personnel record — all optional ────────────────────────────
  job_title:              z.enum(PERSONNEL_JOB_TITLES).optional(),
  mobile_phone:           z.string().trim().max(30).optional(),
  personnummer:           z.string().trim().regex(/^\d{8}-?\d{4}$/).optional(),
  identity_type:          z.enum(PERSONNEL_IDENTITY_TYPES).optional(),
  employment_type:        z.enum(EMPLOYMENT_TYPES).optional(),
  employment_number:      z.string().trim().max(50).optional(),
  employment_started_at:  z.string().optional(),
  employment_ended_at:    z.string().optional(), // absent = "Tills vidare"
  work_location_id:       z.string().uuid().optional(),
  address_line1:          z.string().trim().max(200).optional(),
  postal_code:            z.string().trim().max(20).optional(),
  city:                   z.string().trim().max(100).optional(),
});

// ─── Response helpers (mirrors instructors/index.ts) ──────────────────────────

function errorResp(ctx: EdgeRequestContext, status: number, code: string, message: string, details?: unknown): Response {
  const body: Record<string, unknown> = { code, message, trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 };
  if (details !== undefined) body['details'] = details;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function successResp<T>(ctx: EdgeRequestContext, data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

// ─── Handler ────────────────────────────────────────────────────────────────

async function handleInvite(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'administration:user:create');
  if (guard) return guard;

  if (ctx.organizationId === null) {
    return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  }
  const orgId = ctx.organizationId;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResp(ctx, 400, 'BAD_REQUEST', 'Request body must be valid JSON');
  }

  const parsed = InviteUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid invitation payload', parsed.error.issues);
  }
  const input = parsed.data;

  const db = createServiceClient();

  const seatEntitlement = await getSeatEntitlement(db, orgId);
  if (!seatEntitlement.allowed) {
    return errorResp(ctx, 400, 'SEAT_LIMIT_EXCEEDED', 'This organization has reached its user seat limit. Increase the limit or remove an existing member before inviting another.');
  }

  const { data: roleRow } = await db.from('roles').select('id').eq('name', input.role).eq('is_system_role', true).maybeSingle();
  const roleId = (roleRow?.id as string | undefined) ?? null;
  if (!roleId) {
    logger.error('invite-user.role_missing', { correlation_id: ctx.correlationId, role: input.role });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Platform configuration error: role not found');
  }

  // profiles.email is how an existing account is discovered — no admin API
  // in supabase-js v2 filters auth.users by email directly, and profiles is
  // already the established identity-lookup surface elsewhere in this codebase.
  const { data: existingProfile } = await db.from('profiles').select('id').eq('email', input.email).maybeSingle();

  if (existingProfile) {
    return await addExistingUserToOrg(ctx, db, orgId, existingProfile.id as string, roleId, input);
  }
  return await inviteNewUser(ctx, db, orgId, roleId, input);
}

async function inviteNewUser(
  ctx: EdgeRequestContext,
  db: ReturnType<typeof createServiceClient>,
  orgId: string,
  roleId: string,
  input: z.infer<typeof InviteUserSchema>,
): Promise<Response> {
  const result = await inviteNewStaffMember(db, orgId, roleId, input, {
    actorId: ctx.actorId, actorEmail: ctx.actorEmail, correlationId: ctx.correlationId, appOrigin: getAppOrigin(),
  });
  if (!result.ok) {
    return errorResp(ctx, result.code === 'ALREADY_EXISTS' ? 409 : 500, result.code, result.message);
  }
  return successResp(ctx, { user_id: result.userId, membership_id: result.membershipId, role: input.role, status: 'invited' }, 201);
}

async function addExistingUserToOrg(
  ctx: EdgeRequestContext,
  db: ReturnType<typeof createServiceClient>,
  orgId: string,
  userId: string,
  roleId: string,
  input: z.infer<typeof InviteUserSchema>,
): Promise<Response> {
  const { data: existingMembership } = await db
    .from('memberships').select('id, status').eq('user_id', userId).eq('organization_id', orgId).maybeSingle();

  if (existingMembership && existingMembership.status !== 'removed') {
    return errorResp(ctx, 409, 'ALREADY_MEMBER', `${input.email} is already a member of this organization`);
  }

  // A profile row existing does not mean the account is actually usable yet —
  // it also exists for someone invited to a *different* org who never
  // accepted (no password set, can't sign in). Adding a membership here
  // would be a silent dead end: this path sends no email, so there would be
  // no way for them to ever discover or reach the new org. Same signal the
  // platform org timeline already uses to distinguish invited from accepted
  // (auth.users.last_sign_in_at) — reused here, not reinvented.
  const { data: authUser } = await db.auth.admin.getUserById(userId);
  if (!authUser?.user?.last_sign_in_at) {
    return errorResp(
      ctx, 409, 'PENDING_INVITATION_ELSEWHERE',
      `${input.email} has an existing invitation that hasn't been accepted yet. They must accept it before being added to another organization.`,
    );
  }

  const employmentFields = buildMembershipEmploymentFields(input);

  let personFields: Record<string, unknown>;
  try {
    personFields = await buildProfilePersonFields(input);
  } catch (err) {
    logger.error('invite-user.personnummer_failed', { correlation_id: ctx.correlationId, error: err instanceof Error ? err.message : String(err) });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to process personnummer');
  }
  if (Object.keys(personFields).length > 0) {
    const { error: profileUpdateError } = await db.from('profiles').update(personFields).eq('id', userId);
    if (profileUpdateError) {
      logger.warn('invite-user.existing_profile_update_failed', { correlation_id: ctx.correlationId, error: profileUpdateError.message });
    }
  }

  const nowIso = new Date().toISOString();
  const { data: membership, error: membershipError } = existingMembership
    ? await db.from('memberships').update({ status: 'active', joined_at: nowIso, ...employmentFields }).eq('id', existingMembership.id).select('id').single()
    : await db.from('memberships').insert({ user_id: userId, organization_id: orgId, status: 'active', joined_at: nowIso, ...employmentFields }).select('id').single();

  if (membershipError || !membership) {
    logger.error('invite-user.existing_membership_failed', { correlation_id: ctx.correlationId, error: membershipError?.message });
    if ((membershipError?.message ?? '').includes('SEAT_LIMIT_EXCEEDED')) {
      return errorResp(ctx, 400, 'SEAT_LIMIT_EXCEEDED', 'This organization has reached its user seat limit.');
    }
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to add user to organization');
  }
  const membershipId = membership.id as string;

  const { error: roleAssignError } = await db.from('membership_roles').insert({
    membership_id: membershipId, organization_id: orgId, role_id: roleId, is_active: true, assigned_by: ctx.actorId,
  });
  if (roleAssignError) {
    logger.error('invite-user.existing_role_assign_failed', { correlation_id: ctx.correlationId, error: roleAssignError.message });
    if (!existingMembership) await db.from('memberships').delete().eq('id', membershipId);
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to assign role');
  }

  await linkInstructorRecordIfApplicable(ctx, db, orgId, userId, input.email, input.role);

  await recordIdentityEvent({
    eventType: 'invite.existing_user_added',
    provider: 'password',
    userId,
    organizationId: orgId,
    actorEmail: ctx.actorEmail,
    correlationId: ctx.correlationId,
    metadata: { invited_email: input.email, role: input.role },
  });

  logger.info('invite-user.existing_user_added', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId, role: input.role });

  return successResp(ctx, { user_id: userId, membership_id: membershipId, role: input.role, status: 'added_existing_user' }, 201);
}

// Inviting a user (Users → "Bjud in") and creating an instructor resource
// (Personal → Lärare → "Skapa lärare") are two separate flows that never
// wired together — an instructor's schedule/students/vehicle only render in
// the Instructor Dashboard (instructor-app) once instructors.user_id points
// at their real auth account, and nothing set it. Best-effort, non-fatal
// (mirrors recordIdentityEvent/insert_outbox_event above): a school that
// invites staff in the other order, or hasn't created the instructor record
// yet, must not have the invite itself fail over this.
async function linkInstructorRecordIfApplicable(
  ctx: EdgeRequestContext,
  db: ReturnType<typeof createServiceClient>,
  orgId: string,
  userId: string,
  email: string,
  role: string,
): Promise<void> {
  if (role !== 'instructor' && role !== 'instructor_senior') return;
  try {
    const { error } = await db
      .from('instructors')
      .update({ user_id: userId })
      .eq('organization_id', orgId)
      .eq('email', email)
      .is('user_id', null)
      .is('deleted_at', null);
    if (error) {
      logger.warn('invite-user.link_instructor_failed', { correlation_id: ctx.correlationId, error: error.message });
    }
  } catch (err) {
    logger.warn('invite-user.link_instructor_exception', { correlation_id: ctx.correlationId, error: err instanceof Error ? err.message : String(err) });
  }
}

function getAppOrigin(): string {
  const configured = Deno.env.get('APP_URL');
  return configured && configured.length > 0 ? configured : 'http://localhost:5173';
}

// ─── Staff Invitation Lifecycle (Resend / Cancel / Change Email / Password Reset) ──
//
// Tenant-scoped counterpart to platform-admin's Administrator Invitation
// Lifecycle (supabase/functions/platform-admin/index.ts, "Administrator
// Invitation Lifecycle" section) — identical technique (auth.users.last_sign_in_at
// as the pending/accepted signal, auth.admin.generateLink for reset/resend,
// auth.admin.deleteUser to fully undo a never-accepted invite), reused rather
// than reimplemented, but callable by a tenant's own org_admin/org_owner via
// `administration:user:*` permissions instead of platform-admin-only, and
// covering any invitable staff role (not just admin-tier).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StaffInvitationRow {
  user_id:            string;
  email:              string;
  first_name:         string;
  last_name:          string;
  is_active:          boolean;
  role:               string;
  role_display:       string;
  membership_status:  string;
  invitation_status:  'pending' | 'accepted';
  invited_at:         string | null;
  last_sign_in_at:    string | null;
  joined_at:          string;
}

async function handleListStaffInvitations(ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'administration:user:read');
  if (guard) return guard;
  if (ctx.organizationId === null) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');

  const db = createServiceClient();
  const { data, error } = await db.rpc('get_org_staff_invitations', { p_org_id: ctx.organizationId });
  if (error) {
    logger.error('invite-user.list.query_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to load staff invitations');
  }
  return successResp(ctx, (data ?? []) as StaffInvitationRow[]);
}

async function getStaffMember(
  ctx: EdgeRequestContext,
  db: ReturnType<typeof createServiceClient>,
  orgId: string,
  userId: string,
): Promise<
  | { ok: true; profile: { email: string; first_name: string; last_name: string }; accepted: boolean }
  | { ok: false; response: Response }
> {
  const { data: membership } = await db
    .from('memberships').select('id, status').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return { ok: false, response: errorResp(ctx, 404, 'NOT_FOUND', 'Staff member not found') };

  const { data: authUser, error: authLookupError } = await db.auth.admin.getUserById(userId);
  if (authLookupError || !authUser?.user) {
    return { ok: false, response: errorResp(ctx, 404, 'NOT_FOUND', 'Staff member not found') };
  }

  const { data: profile } = await db.from('profiles').select('email, first_name, last_name').eq('id', userId).maybeSingle();
  if (!profile?.email) {
    return { ok: false, response: errorResp(ctx, 500, 'INTERNAL_ERROR', 'Staff profile not found') };
  }

  // membership.status (not last_sign_in_at) is the authoritative "activated"
  // signal — see handleResendInvitation in platform-admin for why
  // last_sign_in_at alone can't distinguish "accepted" from "opened the
  // invite link and abandoned it".
  return { ok: true, profile: profile as { email: string; first_name: string; last_name: string }, accepted: membership.status !== 'pending' };
}

async function handleResendStaffInvitation(ctx: EdgeRequestContext, userId: string): Promise<Response> {
  const guard = requirePerm(ctx, 'administration:user:update');
  if (guard) return guard;
  if (ctx.organizationId === null) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  const orgId = ctx.organizationId;

  const db = createServiceClient();
  const staff = await getStaffMember(ctx, db, orgId, userId);
  if (!staff.ok) return staff.response;
  if (staff.accepted) {
    return errorResp(ctx, 400, 'ALREADY_ACCEPTED', 'This staff member has already activated their account — use Disable User instead.');
  }

  // The pending staff member never had a password under the
  // inviteUserByEmail-based flow, so a recovery link is the correct way to
  // re-send access — lands on the existing ResetPasswordPage, exactly like
  // AcceptInvitePage does for a first-time invite. resetPasswordForEmail
  // (not admin.generateLink, which only mints a token and never sends mail)
  // is what actually dispatches the email, via the same GoTrue/SMTP path
  // ForgotPasswordPage.tsx's self-service flow already relies on.
  const origin = getAppOrigin();
  const { error: linkError } = await createAnonClient().auth.resetPasswordForEmail(staff.profile.email, {
    redirectTo: `${origin}/auth/reset-password`,
  });
  if (linkError) {
    logger.error('invite-user.resend.link_failed', { correlation_id: ctx.correlationId, error: linkError.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to resend invitation');
  }

  await recordIdentityEvent({
    eventType: 'invite.resent', provider: 'password', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { email: staff.profile.email, source: 'invite-user/resend-invitation' },
  });

  logger.info('invite-user.resend.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return successResp(ctx, { user_id: userId, invitation_status: 'pending' });
}

async function handleCancelStaffInvitation(ctx: EdgeRequestContext, userId: string): Promise<Response> {
  const guard = requirePerm(ctx, 'administration:user:update');
  if (guard) return guard;
  if (ctx.organizationId === null) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  const orgId = ctx.organizationId;

  const db = createServiceClient();
  const staff = await getStaffMember(ctx, db, orgId, userId);
  if (!staff.ok) return staff.response;
  if (staff.accepted) {
    return errorResp(ctx, 400, 'ALREADY_ACCEPTED', 'This staff member has already activated their account — use Disable User instead.');
  }

  const { data: membership } = await db
    .from('memberships').select('id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  const membershipId = membership?.id as string | undefined;

  // Cancelling a never-accepted invitation fully undoes the account it
  // created — profiles cascades away with the auth user
  // (profiles_auth_user_fkey ON DELETE CASCADE) — same shape as
  // platform-admin's handleCancelInvitation.
  if (membershipId) {
    await db.from('membership_roles').delete().eq('membership_id', membershipId);
    await db.from('memberships').delete().eq('id', membershipId);
  }
  const { error: deleteUserError } = await db.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    logger.error('invite-user.cancel.delete_user_failed', { correlation_id: ctx.correlationId, error: deleteUserError.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to cancel invitation');
  }

  await recordIdentityEvent({
    eventType: 'invite.cancelled', provider: 'password', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { email: staff.profile.email, first_name: staff.profile.first_name, last_name: staff.profile.last_name, source: 'invite-user/cancel-invitation' },
  });

  logger.info('invite-user.cancel.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return successResp(ctx, { user_id: userId, cancelled: true });
}

async function handleSendStaffPasswordReset(ctx: EdgeRequestContext, userId: string): Promise<Response> {
  const guard = requirePerm(ctx, 'administration:user:update');
  if (guard) return guard;
  if (ctx.organizationId === null) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  const orgId = ctx.organizationId;

  const db = createServiceClient();
  const staff = await getStaffMember(ctx, db, orgId, userId);
  if (!staff.ok) return staff.response;
  if (!staff.accepted) {
    return errorResp(ctx, 400, 'NOT_ACTIVATED', 'This staff member has not activated their account yet — use Resend Invitation instead.');
  }

  // resetPasswordForEmail actually dispatches the email via GoTrue/SMTP —
  // admin.generateLink only mints a token and never sends mail, see
  // handleResendStaffInvitation above for the same fix rationale.
  const origin = getAppOrigin();
  const { error: linkError } = await createAnonClient().auth.resetPasswordForEmail(staff.profile.email, {
    redirectTo: `${origin}/auth/reset-password`,
  });
  if (linkError) {
    logger.error('invite-user.send-password-reset.link_failed', { correlation_id: ctx.correlationId, error: linkError.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to send password reset');
  }

  await recordIdentityEvent({
    eventType: 'password_reset.sent', provider: 'password', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { email: staff.profile.email, source: 'invite-user/send-password-reset' },
  });

  logger.info('invite-user.send-password-reset.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return successResp(ctx, { user_id: userId, password_reset: 'sent' });
}

async function handleChangeStaffEmail(ctx: EdgeRequestContext, userId: string, rawBody: unknown): Promise<Response> {
  const guard = requirePerm(ctx, 'administration:user:update');
  if (guard) return guard;
  if (ctx.organizationId === null) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  const orgId = ctx.organizationId;

  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(rawBody);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'A valid email address is required', parsed.error.issues);
  const newEmail = parsed.data.email;

  const db = createServiceClient();
  const staff = await getStaffMember(ctx, db, orgId, userId);
  if (!staff.ok) return staff.response;
  if (staff.accepted) {
    return errorResp(ctx, 400, 'ALREADY_ACCEPTED', 'This staff member has already activated their account — the email address can no longer be changed here.');
  }

  const oldEmail = staff.profile.email;

  const { data: existingProfile } = await db.from('profiles').select('id').eq('email', newEmail).maybeSingle();
  if (existingProfile && existingProfile.id !== userId) {
    return errorResp(ctx, 409, 'ALREADY_EXISTS', `An account with email ${newEmail} already exists`);
  }

  const { error: authUpdateError } = await db.auth.admin.updateUserById(userId, { email: newEmail });
  if (authUpdateError) {
    logger.error('invite-user.change-email.auth_update_failed', { correlation_id: ctx.correlationId, error: authUpdateError.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update email address');
  }

  const { error: profileUpdateError } = await db.from('profiles').update({ email: newEmail }).eq('id', userId);
  if (profileUpdateError) {
    logger.error('invite-user.change-email.profile_update_failed', { correlation_id: ctx.correlationId, error: profileUpdateError.message });
    // Best-effort rollback of the auth-side change so the two stores don't diverge.
    await db.auth.admin.updateUserById(userId, { email: oldEmail });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update email address');
  }

  // A pending invite has no password yet, so the only way back in is a fresh
  // link sent to the corrected address — same recovery mechanism as Resend.
  // resetPasswordForEmail actually dispatches the email; admin.generateLink
  // only mints a token and never sends mail (see handleResendStaffInvitation).
  const origin = getAppOrigin();
  const { error: linkError } = await createAnonClient().auth.resetPasswordForEmail(newEmail, {
    redirectTo: `${origin}/auth/reset-password`,
  });
  if (linkError) {
    logger.warn('invite-user.change-email.resend_link_failed', { correlation_id: ctx.correlationId, error: linkError.message });
  }

  await recordIdentityEvent({
    eventType: 'invite.email_changed', provider: 'password', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { old_email: oldEmail, new_email: newEmail, source: 'invite-user/change-email' },
  });

  logger.info('invite-user.change-email.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return successResp(ctx, { user_id: userId, email: newEmail });
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
  if (writeGuard) return writeGuard;

  const path = new URL(req.url).pathname.replace(/^\/invite-user/, '') || '/';

  logger.info('request.started', {
    method: req.method, path,
    request_id: ctx.requestId, correlation_id: ctx.correlationId,
    org_id: ctx.organizationId ?? 'platform', actor_id: ctx.actorId,
  });

  try {
    if (req.method === 'GET' && path === '/list') {
      return await handleListStaffInvitations(ctx);
    }

    if (req.method === 'POST' && (path === '/' || path === '')) {
      return await handleInvite(req, ctx);
    }

    const resendMatch = /^\/([^/]+)\/resend-invitation$/.exec(path);
    if (resendMatch && req.method === 'POST' && UUID_RE.test(resendMatch[1] ?? '')) {
      return await handleResendStaffInvitation(ctx, resendMatch[1] as string);
    }

    const cancelMatch = /^\/([^/]+)\/cancel-invitation$/.exec(path);
    if (cancelMatch && req.method === 'POST' && UUID_RE.test(cancelMatch[1] ?? '')) {
      return await handleCancelStaffInvitation(ctx, cancelMatch[1] as string);
    }

    const pwResetMatch = /^\/([^/]+)\/send-password-reset$/.exec(path);
    if (pwResetMatch && req.method === 'POST' && UUID_RE.test(pwResetMatch[1] ?? '')) {
      return await handleSendStaffPasswordReset(ctx, pwResetMatch[1] as string);
    }

    const changeEmailMatch = /^\/([^/]+)\/change-email$/.exec(path);
    if (changeEmailMatch && req.method === 'POST' && UUID_RE.test(changeEmailMatch[1] ?? '')) {
      let body: unknown;
      try { body = await req.json(); } catch { return errorResp(ctx, 400, 'BAD_REQUEST', 'Request body must be valid JSON'); }
      return await handleChangeStaffEmail(ctx, changeEmailMatch[1] as string, body);
    }

    return errorResp(ctx, 404, 'NOT_FOUND', 'Route not found');
  } catch (err) {
    logger.error('invite-user.unhandled_error', { correlation_id: ctx.correlationId, error: err instanceof Error ? err.message : String(err) });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}));
