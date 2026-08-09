/**
 * Shared "invite a new staff member into an organization" logic.
 *
 * Extracted from invite-user/index.ts's inviteNewUser so both the
 * authenticated Users settings page (POST /invite-user) and trial-signup
 * (pre-account onboarding questionnaire, inviting additional
 * administrators/receptionists beyond the primary contact) create the
 * exact same auth user + profile + membership + membership_roles state —
 * neither caller may diverge on what "inviting someone" means on this
 * platform. Existing-user linking (addExistingUserToOrg) stays in
 * invite-user/index.ts — a pre-account trial signup can never collide with
 * an existing platform user, so that branch has no onboarding caller.
 */

import { recordIdentityEvent } from './identity-events.ts';
import { logger } from './logger.ts';

// deno-lint-ignore no-explicit-any
type DbClient = any;

export interface InviteStaffInput {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

export type InviteStaffResult =
  | { ok: true; userId: string; membershipId: string }
  | { ok: false; code: 'ALREADY_EXISTS' | 'INTERNAL_ERROR'; message: string };

export async function inviteNewStaffMember(
  db: DbClient,
  orgId: string,
  roleId: string,
  input: InviteStaffInput,
  actor: { actorId: string | null; actorEmail: string | null; correlationId: string; appOrigin: string },
): Promise<InviteStaffResult> {
  async function rollback(opts: { userId?: string; membershipId?: string }): Promise<void> {
    if (opts.membershipId) {
      await db.from('membership_roles').delete().eq('membership_id', opts.membershipId);
      await db.from('memberships').delete().eq('id', opts.membershipId);
    }
    if (opts.userId) await db.auth.admin.deleteUser(opts.userId);
  }

  const { data: inviteData, error: inviteError } = await db.auth.admin.inviteUserByEmail(input.email, {
    data: { first_name: input.first_name, last_name: input.last_name },
    redirectTo: `${actor.appOrigin}/auth/accept-invite`,
  });
  if (inviteError || !inviteData?.user) {
    logger.error('staff-invite.invite_failed', { correlation_id: actor.correlationId, error: inviteError?.message });
    const isDuplicate = (inviteError?.message ?? '').toLowerCase().includes('already');
    return {
      ok: false,
      code: isDuplicate ? 'ALREADY_EXISTS' : 'INTERNAL_ERROR',
      message: isDuplicate ? `An account with email ${input.email} already exists` : 'Failed to create invitation',
    };
  }
  const userId = inviteData.user.id as string;

  const { error: profileError } = await db.from('profiles').upsert({
    id: userId, first_name: input.first_name, last_name: input.last_name, email: input.email, is_active: true,
  }, { onConflict: 'id' });
  if (profileError) {
    logger.error('staff-invite.profile_failed', { correlation_id: actor.correlationId, error: profileError.message });
    await rollback({ userId });
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Failed to create user profile' };
  }

  const nowIso = new Date().toISOString();
  const { data: membership, error: membershipError } = await db
    .from('memberships')
    .insert({ user_id: userId, organization_id: orgId, status: 'pending', joined_at: nowIso })
    .select('id').single();
  if (membershipError || !membership) {
    logger.error('staff-invite.membership_failed', { correlation_id: actor.correlationId, error: membershipError?.message });
    await rollback({ userId });
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Failed to create membership' };
  }
  const membershipId = membership.id as string;

  const { error: roleAssignError } = await db.from('membership_roles').insert({
    membership_id: membershipId, organization_id: orgId, role_id: roleId, is_active: true, assigned_by: actor.actorId,
  });
  if (roleAssignError) {
    logger.error('staff-invite.role_assign_failed', { correlation_id: actor.correlationId, error: roleAssignError.message });
    await rollback({ userId, membershipId });
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Failed to assign role' };
  }

  await linkInstructorRecordIfApplicable(db, orgId, userId, input.email, input.role, actor.correlationId);

  await recordIdentityEvent({
    eventType: 'invite.created', provider: 'password', userId, organizationId: orgId,
    actorEmail: actor.actorEmail, correlationId: actor.correlationId,
    metadata: { invited_email: input.email, role: input.role },
  });

  const { error: outboxError } = await db.rpc('insert_outbox_event', {
    p_event_type: 'org.member_invited',
    p_channel: 'email',
    p_organization_id: orgId,
    p_target_id: input.email,
    p_payload: { organization_id: orgId, member_email: input.email, first_name: input.first_name, last_name: input.last_name, role: input.role },
    p_metadata: { source: 'staff-invite', correlation_id: actor.correlationId },
  });
  if (outboxError) {
    logger.warn('staff-invite.outbox_failed', { correlation_id: actor.correlationId, error: outboxError.message });
  }

  logger.info('staff-invite.complete', { correlation_id: actor.correlationId, org_id: orgId, user_id: userId, role: input.role });

  return { ok: true, userId, membershipId };
}

// Mirrors invite-user/index.ts's linkInstructorRecordIfApplicable exactly —
// best-effort, non-fatal: links a freshly-invited instructor/instructor_senior
// user to a pre-existing instructors row with a matching email, if one exists.
async function linkInstructorRecordIfApplicable(
  db: DbClient, orgId: string, userId: string, email: string, role: string, correlationId: string,
): Promise<void> {
  if (role !== 'instructor' && role !== 'instructor_senior') return;
  try {
    const { error } = await db
      .from('instructors')
      .update({ user_id: userId })
      .eq('organization_id', orgId).eq('email', email).is('user_id', null).is('deleted_at', null);
    if (error) {
      logger.warn('staff-invite.link_instructor_failed', { correlation_id: correlationId, error: error.message });
    }
  } catch (err) {
    logger.warn('staff-invite.link_instructor_exception', { correlation_id: correlationId, error: err instanceof Error ? err.message : String(err) });
  }
}
