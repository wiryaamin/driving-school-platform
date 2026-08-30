/**
 * platform-admin — Platform Admin Control Plane Edge Function
 *
 * All routes require is_platform_admin: true in the JWT.
 * Uses service role client for all DB queries (bypasses tenant RLS).
 *
 * Routes:
 *   GET /dashboard               — aggregate platform statistics
 *   GET /admins                  — list of active platform administrators (legacy)
 *   GET /platform-admins         — enhanced admin list with auth details + MFA
 *   GET /operations-summary      — Operations Center: platform-wide queue/dead-letter snapshot
 *   GET /communications-summary  — Communications: platform-wide message deliverability
 *   GET /compliance-summary      — Compliance: platform-wide GDPR/consent + regulatory snapshot
 *   GET /recovery-queue          — Recovery Center: orgs with something to retry
 *   GET /orgs/counts             — per-org member/student/instructor counts
 *   GET /orgs/:id                — full organization profile
 *   GET /orgs/:id/stats          — aggregate stats for one organization
 *   GET /orgs/:id/admins         — administrators for one organization
 *   GET /orgs/:id/users          — every tenant user (any role), Users tab
 *   GET /orgs/:id/timeline       — audit-based timeline for one organization
 *   GET /orgs/:id/security       — org-scoped identity/security events
 *   GET /orgs/:id/compliance     — GDPR consent + regulatory workflow summary
 *   GET /orgs/:id/operations     — queue/dead-letter operational snapshot
 *   GET /orgs/:id/onboarding-journey — Onboarding Command Center: business-
 *                                   language stage, timeline, and recommended action
 *   PATCH /orgs/:id/notes        — set internal support notes
 *   POST /orgs/:id/operations/retry — retry dead-lettered events + failed messages
 *   POST /orgs/:id/delete-tenant-data — safely remove tenant-owned resources
 *                                   (vehicles/instructors/branches/users) and
 *                                   soft-delete the organization; requires the
 *                                   org to already be suspended or terminated
 *   GET /subscriptions           — all orgs with subscription data + usage counts
 *   GET /subscriptions/:id       — full subscription profile for one organization
 *   GET /subscriptions/:id/history — subscription-relevant audit events
 *   GET /audit                   — paginated platform audit log (filterable)
 *   GET /audit/security          — security-relevant events across all tenants
 *   GET /support/orgs/:id/health — org health snapshot; the one canonical org
 *                                   health endpoint, reused by both the Support
 *                                   workspace and Organization Detail's Overview
 *   GET /worker-runs             — paginated worker execution history (Epic 7.4)
 *   GET /worker-runs/summary     — latest run + rolling 24h health per worker
 *   POST /provision              — Automated Customer Provisioning: creates an
 *                                   organization, tenant administrator, membership,
 *                                   org_owner role, and enqueues an invitation event
 *   GET /tenant-onboarding        — Tenant Onboarding Monitoring: provisioned orgs
 *                                   not yet Live, with progress (Section 10)
 *   POST /tenant-onboarding/:id/go-live — Go Live Approval (Section 17)
 *   POST /orgs/:id/admins                          — Invite Administrator
 *   POST /orgs/:id/admins/:userId/role             — Change Administrator Role
 *   POST /orgs/:id/admins/:userId/disable          — Disable Administrator
 *   POST /orgs/:id/admins/:userId/reactivate       — Reactivate Administrator
 *   POST /orgs/:id/admins/:userId/transfer-ownership — Transfer Organization Ownership
 *   POST /orgs/:id/admins/:userId/resend-invitation  — Resend Invitation
 *   POST /orgs/:id/admins/:userId/cancel-invitation  — Cancel Invitation
 *   POST /orgs/:id/admins/:userId/send-password-reset  — Send Password Reset
 *   POST /orgs/:id/admins/:userId/force-password-reset  — Force Password Reset
 *   POST /orgs/:id/admins/:userId/force-logout          — Force Logout (revoke sessions)
 */

import { serveCors }          from '../_shared/cors.ts';
import { buildEdgeContext }   from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createServiceClient, createAnonClient } from '../_shared/supabase.ts';
import { computeOnboardingProgress } from '../_shared/tenant-onboarding-progress.ts';
import { getSeatEntitlement } from '../_shared/entitlements.ts';
import { getSubscriptionSnapshot } from '../_shared/platformSubscription.ts';
import { recordIdentityEvent } from '../_shared/identity-events.ts';
import { dispatchMessage }    from '../_shared/comm-providers.ts';
import { verifyEmailHtml, questionnaireEmailHtml, logTrialEvent } from '../_shared/trial-onboarding-lifecycle.ts';
import { provisionTrialOrganization } from '../_shared/trial-provisioning.ts';
import {
  provisionBusinessConfiguration, provisionBusinessResources,
  type CompleteAnswers as BusinessSetupAnswers,
} from '../_shared/business-setup-provisioning.ts';
import { logger }             from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

// Mirrors invite-user/index.ts's getAppOrigin() — the redirect target for
// every Supabase Auth email link (invite or recovery) this function issues.
function getAppOrigin(): string {
  const configured = Deno.env.get('APP_URL');
  return configured && configured.length > 0 ? configured : 'http://localhost:5173';
}

// UUID v4 pattern used to distinguish org-id segments from named segments like "counts"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve((req: Request) =>
  serveCors(req, async () => {
    const ctxResult = await buildEdgeContext(req);
    if (!ctxResult.ok) return ctxResult.response;
    const { ctx } = ctxResult;

    const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
    if (ipGuard) return ipGuard;
    if (req.method !== 'GET') {
      const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
      if (writeGuard) return writeGuard;
    }

    if (!ctx.isPlatformAdmin) {
      logger.warn('platform-admin.forbidden', {
        correlation_id: ctx.correlationId,
        actor_id:       ctx.actorId,
      });
      return forbidden(ctx);
    }

    const url      = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const fnIdx    = segments.findLastIndex((s) => s === 'platform-admin');
    const rest     = segments.slice(fnIdx + 1);
    const path     = rest.length ? '/' + rest.join('/') : '/';

    logger.info('platform-admin.request', {
      correlation_id: ctx.correlationId,
      actor_id:       ctx.actorId,
      method:         req.method,
      path,
    });

    // ── Dashboard + legacy admin list ────────────────────────────────────────
    if (req.method === 'GET' && path === '/dashboard')        return handleDashboard(ctx);
    if (req.method === 'GET' && path === '/admins')           return handleAdmins(ctx);
    if (req.method === 'GET' && path === '/platform-admins')  return handlePlatformAdminsDetail(ctx);

    // ── SaaS Operations Console — platform-wide workspace summaries ──────────
    if (req.method === 'GET' && path === '/operations-summary')     return handleOperationsSummary(ctx);
    if (req.method === 'GET' && path === '/communications-summary') return handleCommunicationsSummary(ctx);
    if (req.method === 'GET' && path === '/compliance-summary')     return handleComplianceSummary(ctx);
    if (req.method === 'GET' && path === '/recovery-queue')         return handleRecoveryQueue(ctx);

    // ── Audit routes (check /audit/security before generic /audit) ───────────
    if (req.method === 'GET' && path === '/audit/security') return handleSecurityEvents(ctx, url);
    if (req.method === 'GET' && path === '/audit')          return handleAuditLog(ctx, url);

    // ── Support workspace ─────────────────────────────────────────────────────
    const supportHealthMatch = /^\/support\/orgs\/([^/]+)\/health$/.exec(path);
    if (supportHealthMatch && req.method === 'GET') {
      const segment = supportHealthMatch[1] ?? '';
      if (UUID_RE.test(segment)) return handleOrgHealth(ctx, segment);
    }

    // ── Worker operations (Epic 7.4) ──────────────────────────────────────────
    if (req.method === 'GET' && path === '/worker-runs/summary') return handleWorkerRunSummary(ctx);
    if (req.method === 'GET' && path === '/worker-runs')         return handleWorkerRuns(ctx, url);

    // ── Org list enrichment ───────────────────────────────────────────────────
    if (req.method === 'GET' && path === '/orgs/counts') return handleOrgCounts(ctx);

    // ── Per-org detail sub-routes ─────────────────────────────────────────────
    // Matches /orgs/<uuid> and /orgs/<uuid>/<sub>
    const orgMatch = /^\/orgs\/([^/]+)(\/[a-z-]+)?$/.exec(path);
    if (orgMatch && req.method === 'GET') {
      const segment = orgMatch[1] ?? '';
      const sub     = orgMatch[2] ?? '';

      // Guard: only route if segment is a UUID (not "counts" or other named paths)
      if (UUID_RE.test(segment)) {
        const orgId = segment;
        if (sub === '')            return handleOrgDetail(ctx, orgId);
        if (sub === '/stats')      return handleOrgStats(ctx, orgId);
        if (sub === '/admins')     return handleOrgAdmins(ctx, orgId);
        if (sub === '/users')      return handleOrgUsers(ctx, orgId);
        if (sub === '/timeline')   return handleOrgTimeline(ctx, orgId);
        if (sub === '/security')   return handleOrgSecurity(ctx, orgId);
        if (sub === '/compliance') return handleOrgCompliance(ctx, orgId);
        if (sub === '/operations') return handleOrgOperations(ctx, orgId);
        if (sub === '/onboarding-journey') return handleOnboardingJourney(ctx, orgId);
      }
    }

    // ── Internal support notes ────────────────────────────────────────────────
    const notesMatch = /^\/orgs\/([^/]+)\/notes$/.exec(path);
    if (notesMatch && req.method === 'PATCH') {
      const orgId = notesMatch[1] ?? '';
      if (UUID_RE.test(orgId)) {
        let body: unknown;
        try { body = await req.json(); } catch { return badRequest(ctx, 'Request body must be valid JSON'); }
        return handleUpdateOrgNotes(ctx, orgId, body);
      }
    }

    // ── Operational recovery — retry dead-lettered events + failed messages ──
    const retryMatch = /^\/orgs\/([^/]+)\/operations\/retry$/.exec(path);
    if (retryMatch && req.method === 'POST') {
      const orgId = retryMatch[1] ?? '';
      if (UUID_RE.test(orgId)) return handleRetryOrgOperations(ctx, orgId);
    }

    // ── Tenant lifecycle — safe resource + access removal ────────────────────
    const deleteTenantDataMatch = /^\/orgs\/([^/]+)\/delete-tenant-data$/.exec(path);
    if (deleteTenantDataMatch && req.method === 'POST') {
      const orgId = deleteTenantDataMatch[1] ?? '';
      if (UUID_RE.test(orgId)) return handleDeleteTenantData(ctx, orgId);
    }

    // ── Provisioning (Automated Customer Provisioning) ───────────────────────
    if (req.method === 'POST' && path === '/provision') {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return badRequest(ctx, 'Request body must be valid JSON');
      }
      return handleProvision(ctx, body);
    }

    // ── Demo request rejection + deletion ─────────────────────────────────────
    const rejectDemoMatch = /^\/demo-requests\/([^/]+)\/reject$/.exec(path);
    if (rejectDemoMatch && req.method === 'POST') {
      const demoId = rejectDemoMatch[1] ?? '';
      if (UUID_RE.test(demoId)) {
        let body: unknown;
        try { body = await req.json(); } catch { return badRequest(ctx, 'Request body must be valid JSON'); }
        return handleRejectDemoRequest(ctx, demoId, body);
      }
    }
    const deleteDemoMatch = /^\/demo-requests\/([^/]+)$/.exec(path);
    if (deleteDemoMatch && req.method === 'DELETE') {
      const demoId = deleteDemoMatch[1] ?? '';
      if (UUID_RE.test(demoId)) return handleDeleteDemoRequest(ctx, demoId);
    }

    // ── Trial Requests — pre/post-provisioning lifecycle control ─────────────
    if (req.method === 'GET' && path === '/trial-requests') return handleListTrialRequests(ctx, url);

    const trialDetailMatch = /^\/trial-requests\/([^/]+)$/.exec(path);
    if (trialDetailMatch && req.method === 'GET') {
      const id = trialDetailMatch[1] ?? '';
      if (UUID_RE.test(id)) return handleTrialRequestDetail(ctx, id);
    }
    if (trialDetailMatch && req.method === 'DELETE') {
      const id = trialDetailMatch[1] ?? '';
      if (UUID_RE.test(id)) return handleDeleteTrialRequest(ctx, id);
    }

    const trialApproveMatch = /^\/trial-requests\/([^/]+)\/approve$/.exec(path);
    if (trialApproveMatch && req.method === 'POST') {
      const id = trialApproveMatch[1] ?? '';
      if (UUID_RE.test(id)) return handleApproveTrialRequest(ctx, id);
    }

    const trialRejectMatch = /^\/trial-requests\/([^/]+)\/reject$/.exec(path);
    if (trialRejectMatch && req.method === 'POST') {
      const id = trialRejectMatch[1] ?? '';
      if (UUID_RE.test(id)) {
        let body: unknown;
        try { body = await req.json(); } catch { return badRequest(ctx, 'Request body must be valid JSON'); }
        return handleRejectTrialRequest(ctx, id, body);
      }
    }

    const trialCancelMatch = /^\/trial-requests\/([^/]+)\/cancel$/.exec(path);
    if (trialCancelMatch && req.method === 'POST') {
      const id = trialCancelMatch[1] ?? '';
      if (UUID_RE.test(id)) {
        let body: unknown;
        try { body = await req.json(); } catch { body = {}; }
        return handleCancelTrialRequest(ctx, id, body);
      }
    }

    const trialExpireMatch = /^\/trial-requests\/([^/]+)\/expire$/.exec(path);
    if (trialExpireMatch && req.method === 'POST') {
      const id = trialExpireMatch[1] ?? '';
      if (UUID_RE.test(id)) return handleExpireTrialRequest(ctx, id);
    }

    const trialResendVerifyMatch = /^\/trial-requests\/([^/]+)\/resend-verification$/.exec(path);
    if (trialResendVerifyMatch && req.method === 'POST') {
      const id = trialResendVerifyMatch[1] ?? '';
      if (UUID_RE.test(id)) return handleResendTrialVerification(ctx, id);
    }

    const trialResendQuestMatch = /^\/trial-requests\/([^/]+)\/resend-questionnaire$/.exec(path);
    if (trialResendQuestMatch && req.method === 'POST') {
      const id = trialResendQuestMatch[1] ?? '';
      if (UUID_RE.test(id)) return handleResendTrialQuestionnaire(ctx, id);
    }

    // ── Organization Administrator Management ─────────────────────────────────
    const inviteAdminMatch = /^\/orgs\/([^/]+)\/admins$/.exec(path);
    if (inviteAdminMatch && req.method === 'POST') {
      const orgId = inviteAdminMatch[1] ?? '';
      if (UUID_RE.test(orgId)) {
        let body: unknown;
        try { body = await req.json(); } catch { return badRequest(ctx, 'Request body must be valid JSON'); }
        return handleInviteAdmin(ctx, orgId, body);
      }
    }

    const changeRoleMatch = /^\/orgs\/([^/]+)\/admins\/([^/]+)\/role$/.exec(path);
    if (changeRoleMatch && req.method === 'POST') {
      const [orgId, userId] = [changeRoleMatch[1] ?? '', changeRoleMatch[2] ?? ''];
      if (UUID_RE.test(orgId) && UUID_RE.test(userId)) {
        let body: unknown;
        try { body = await req.json(); } catch { return badRequest(ctx, 'Request body must be valid JSON'); }
        return handleChangeAdminRole(ctx, orgId, userId, body);
      }
    }

    const disableAdminMatch = /^\/orgs\/([^/]+)\/admins\/([^/]+)\/disable$/.exec(path);
    if (disableAdminMatch && req.method === 'POST') {
      const [orgId, userId] = [disableAdminMatch[1] ?? '', disableAdminMatch[2] ?? ''];
      if (UUID_RE.test(orgId) && UUID_RE.test(userId)) return handleDisableAdmin(ctx, orgId, userId);
    }

    const reactivateAdminMatch = /^\/orgs\/([^/]+)\/admins\/([^/]+)\/reactivate$/.exec(path);
    if (reactivateAdminMatch && req.method === 'POST') {
      const [orgId, userId] = [reactivateAdminMatch[1] ?? '', reactivateAdminMatch[2] ?? ''];
      if (UUID_RE.test(orgId) && UUID_RE.test(userId)) return handleReactivateAdmin(ctx, orgId, userId);
    }

    const transferOwnershipMatch = /^\/orgs\/([^/]+)\/admins\/([^/]+)\/transfer-ownership$/.exec(path);
    if (transferOwnershipMatch && req.method === 'POST') {
      const [orgId, userId] = [transferOwnershipMatch[1] ?? '', transferOwnershipMatch[2] ?? ''];
      if (UUID_RE.test(orgId) && UUID_RE.test(userId)) return handleTransferOwnership(ctx, orgId, userId);
    }

    const resendInviteMatch = /^\/orgs\/([^/]+)\/admins\/([^/]+)\/resend-invitation$/.exec(path);
    if (resendInviteMatch && req.method === 'POST') {
      const [orgId, userId] = [resendInviteMatch[1] ?? '', resendInviteMatch[2] ?? ''];
      if (UUID_RE.test(orgId) && UUID_RE.test(userId)) return handleResendInvitation(ctx, orgId, userId);
    }

    const cancelInviteMatch = /^\/orgs\/([^/]+)\/admins\/([^/]+)\/cancel-invitation$/.exec(path);
    if (cancelInviteMatch && req.method === 'POST') {
      const [orgId, userId] = [cancelInviteMatch[1] ?? '', cancelInviteMatch[2] ?? ''];
      if (UUID_RE.test(orgId) && UUID_RE.test(userId)) return handleCancelInvitation(ctx, orgId, userId);
    }

    const sendPasswordResetMatch = /^\/orgs\/([^/]+)\/admins\/([^/]+)\/send-password-reset$/.exec(path);
    if (sendPasswordResetMatch && req.method === 'POST') {
      const [orgId, userId] = [sendPasswordResetMatch[1] ?? '', sendPasswordResetMatch[2] ?? ''];
      if (UUID_RE.test(orgId) && UUID_RE.test(userId)) return handleSendPasswordReset(ctx, orgId, userId);
    }

    const forcePasswordResetMatch = /^\/orgs\/([^/]+)\/admins\/([^/]+)\/force-password-reset$/.exec(path);
    if (forcePasswordResetMatch && req.method === 'POST') {
      const [orgId, userId] = [forcePasswordResetMatch[1] ?? '', forcePasswordResetMatch[2] ?? ''];
      if (UUID_RE.test(orgId) && UUID_RE.test(userId)) return handleForcePasswordReset(ctx, orgId, userId);
    }

    const forceLogoutMatch = /^\/orgs\/([^/]+)\/admins\/([^/]+)\/force-logout$/.exec(path);
    if (forceLogoutMatch && req.method === 'POST') {
      const [orgId, userId] = [forceLogoutMatch[1] ?? '', forceLogoutMatch[2] ?? ''];
      if (UUID_RE.test(orgId) && UUID_RE.test(userId)) return handleForceLogout(ctx, orgId, userId);
    }

    // ── Tenant Onboarding Monitoring + Go Live Approval ───────────────────────
    if (req.method === 'GET' && path === '/tenant-onboarding') return handleTenantOnboardingList(ctx, url);

    const goLiveMatch = /^\/tenant-onboarding\/([^/]+)\/go-live$/.exec(path);
    if (goLiveMatch && req.method === 'POST') {
      const segment = goLiveMatch[1] ?? '';
      if (UUID_RE.test(segment)) return handleGoLive(ctx, segment);
    }

    // ── Subscription routes ───────────────────────────────────────────────────
    if (req.method === 'GET' && path === '/subscriptions') return handleSubscriptionList(ctx);

    // Matches /subscriptions/<uuid> and /subscriptions/<uuid>/history
    const subMatch = /^\/subscriptions\/([^/]+)(\/[a-z]+)?$/.exec(path);
    if (subMatch && req.method === 'GET') {
      const segment = subMatch[1] ?? '';
      const sub     = subMatch[2] ?? '';

      if (UUID_RE.test(segment)) {
        const orgId = segment;
        if (sub === '')         return handleSubscriptionDetail(ctx, orgId);
        if (sub === '/history') return handleSubscriptionHistory(ctx, orgId);
      }
    }

    // ── Announcements (Nyheter / TABSnytt) ────────────────────────────────────
    if (req.method === 'GET' && path === '/announcements') return handleAnnouncementList(ctx);

    if (req.method === 'POST' && path === '/announcements') {
      let body: unknown;
      try { body = await req.json(); } catch { return badRequest(ctx, 'Request body must be valid JSON'); }
      return handleCreateAnnouncement(ctx, body);
    }

    const announcementMatch = /^\/announcements\/([^/]+)$/.exec(path);
    if (announcementMatch && req.method === 'PATCH') {
      const id = announcementMatch[1] ?? '';
      if (UUID_RE.test(id)) {
        let body: unknown;
        try { body = await req.json(); } catch { return badRequest(ctx, 'Request body must be valid JSON'); }
        return handleUpdateAnnouncement(ctx, id, body);
      }
    }

    return notFound(ctx);
  }),
);

// ─── Handlers — platform-wide ─────────────────────────────────────────────────

async function handleDashboard(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_dashboard_stats');
  if (error) {
    logger.error('platform-admin.dashboard.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load dashboard statistics');
  }
  logger.info('platform-admin.dashboard.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as Record<string, unknown>);
}

async function handleAdmins(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_admins_list');
  if (error) {
    logger.error('platform-admin.admins.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load platform administrators');
  }
  logger.info('platform-admin.admins.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as unknown[]);
}

// ─── Handlers — org list ──────────────────────────────────────────────────────

async function handleOrgCounts(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_list_counts');
  if (error) {
    logger.error('platform-admin.org-counts.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load organization counts');
  }
  logger.info('platform-admin.org-counts.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as unknown[]);
}

// ─── Handlers — org detail ────────────────────────────────────────────────────

async function handleOrgDetail(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_detail', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.org-detail.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load organization detail');
  }
  if (!data) return notFound(ctx);
  logger.info('platform-admin.org-detail.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as Record<string, unknown>);
}

async function handleOrgStats(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_stats', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.org-stats.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load organization statistics');
  }
  logger.info('platform-admin.org-stats.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as Record<string, unknown>);
}

async function handleOrgAdmins(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_admins', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.org-admins.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load organization administrators');
  }
  logger.info('platform-admin.org-admins.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as unknown[]);
}

async function handleOrgUsers(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_users', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.org-users.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load organization users');
  }
  logger.info('platform-admin.org-users.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as unknown[]);
}

async function handleOrgTimeline(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_timeline', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.org-timeline.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load organization timeline');
  }
  logger.info('platform-admin.org-timeline.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as unknown[]);
}

// ─── SaaS Operations Console — Security / Compliance / Operations / Notes ───

async function handleOrgSecurity(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_security_events', { p_org_id: orgId, p_limit: 100 });
  if (error) {
    logger.error('platform-admin.org-security.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load security events');
  }
  logger.info('platform-admin.org-security.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as unknown[]);
}

async function handleOrgCompliance(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_compliance', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.org-compliance.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load compliance summary');
  }
  logger.info('platform-admin.org-compliance.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as Record<string, unknown>);
}

async function handleOrgOperations(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_operations', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.org-operations.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load operational snapshot');
  }
  logger.info('platform-admin.org-operations.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as Record<string, unknown>);
}

// ─── Onboarding Command Center ────────────────────────────────────────────
//
// Translates existing signals — demo_requests, organizations, memberships,
// auth.users, identity_security_events, computeOnboardingProgress (already
// built), and the platform's own historical go-live timing — into one
// business-language journey. No new write actions are introduced here;
// every recovery action this returns maps to a mutation that already
// exists (resend-invitation, send-password-reset, force-password-reset,
// force-logout, go-live, operations/retry).
//
// A note on honesty, not just labeling: "Invitation Delivered" does not
// appear anywhere below. No delivery receipt exists for the account-
// activation email today (Supabase Auth sends it directly; there is no
// bounce/delivery webhook wired to this platform) — showing a fabricated
// "delivered" checkmark would be worse than omitting it. The same applies
// to "Commercial Approval" as a distinct stage: today, approving a lead
// and triggering provisioning happen in the same single action (Convert
// to Customer), so there is no separately-observable "approved but not
// yet provisioning" moment to report — both are folded into one Provisioning
// timeline entry rather than inventing a timestamp that was never recorded.

const DAY_MS = 86_400_000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / DAY_MS;
}

// ─── Invitation delivery status (Resend) ───────────────────────────────────
//
// Answers the exact support question this was built for: "the customer says
// they never received the email" — did it actually deliver, bounce, or get
// suppressed? Supabase Auth's invite/recovery emails route through Resend's
// SMTP relay (same account as the app's own notification emails), so
// Resend's own send log is the only place this is genuinely observable —
// there is no local delivery-receipt table, and building one (a Resend
// webhook receiver + schema) is more infrastructure than a real pilot's
// current volume justifies. Best-effort, client-side filtered: Resend's
// public list endpoint doesn't support filtering by recipient server-side
// (confirmed live), so this scans the most recent sends and picks the
// newest one addressed to this email. At current pilot volume this reliably
// finds the relevant send; if send volume grows enough that the relevant
// invite falls off the first page, a webhook-based approach would be the
// correct next step — not needed today.
async function getInvitationDeliveryStatus(email: string): Promise<string | null> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const body = await res.json() as { data?: Array<{ to: string[]; last_event: string; created_at: string }> };
    const target = email.toLowerCase();
    const match = (body.data ?? [])
      .filter((e) => e.to.some((t) => t.toLowerCase() === target))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return match?.last_event ?? null;
  } catch {
    return null; // Best-effort — never blocks the onboarding journey view over an external API hiccup.
  }
}

// GoTrue's own configured OTP/link expiry for this project (Dashboard →
// Authentication → Rate Limits — confirmed live via the Management API,
// mailer_otp_exp: 3600). No CLI/API path exposes "is this specific token
// still valid" without consuming it, so expiry is estimated from elapsed
// time since the invite was (re)sent — the same approach GoTrue itself uses
// internally to reject an expired token.
const INVITE_LINK_EXPIRY_SECONDS = 3600;

interface JourneyTimelineEntry {
  label: string;
  occurred_at: string;
  /** Who performed it, where known from data already fetched for this
   *  request (identity_security_events.actor_email, or the admin's own
   *  email for self-service events like first login). Omitted rather than
   *  guessed when no actor is recorded for that kind of event. */
  actor?: string | null;
}

async function handleOnboardingJourney(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();

  const [factsResult, progress, securityResult, operationsResult, avgResult] = await Promise.all([
    db.rpc('get_onboarding_journey_facts', { p_org_id: orgId }),
    computeOnboardingProgress(db, orgId),
    db.rpc('get_platform_org_security_events', { p_org_id: orgId, p_limit: 100 }),
    db.rpc('get_platform_org_operations', { p_org_id: orgId }),
    db.rpc('get_average_go_live_duration_days'),
  ]);

  if (factsResult.error || !factsResult.data) {
    logger.error('platform-admin.onboarding-journey.facts_failed', { correlation_id: ctx.correlationId, org_id: orgId, error: factsResult.error?.message });
    return internalError(ctx, 'Failed to load onboarding journey');
  }
  if (!progress) return notFound(ctx);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const facts = factsResult.data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const securityEvents = (securityResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const operations = (operationsResult.data ?? {}) as any;
  const avgGoLiveDays = typeof avgResult.data === 'number' ? avgResult.data : null;

  const admin = facts.admin_user ?? null;
  const activated = Boolean(admin?.last_sign_in_at);

  const inviteEvents = securityEvents.filter((e) => e.event_type === 'invite.created' || e.event_type === 'invite.resent');
  const lastInviteAt: string | null =
    inviteEvents.length > 0
      ? inviteEvents.map((e) => e.occurred_at).sort().slice(-1)[0]
      : (admin?.invited_at ?? facts.organization?.created_at ?? null);

  // ── Invitation delivery + expiry — only meaningful before activation;
  // once the customer has actually logged in, whether the original email
  // delivered or expired is no longer operationally relevant.
  const invitationDeliveryStatus = (!activated && admin?.email)
    ? await getInvitationDeliveryStatus(admin.email as string)
    : null;
  const invitationExpired = Boolean(
    !activated && lastInviteAt && (Date.now() - new Date(lastInviteAt).getTime()) / 1000 > INVITE_LINK_EXPIRY_SECONDS
  );

  // ── The mandatory 10-step business workflow (Product Owner's exact order —
  // not to be merged, removed, or reordered). Steps 3/4/5 are genuinely one
  // atomic backend transaction (handleProvision creates org+admin+invite in
  // a single call) — shown here as three honest, separately-labeled rows
  // that happen to complete at the same instant, not collapsed into one.
  const demoRequest = facts.demo_request ?? null;
  const hasDemoRequest = Boolean(demoRequest);

  interface WorkflowStep {
    key: string; label: string; completed: boolean; owner: string;
    blocking_reason: string | null;
    primary_action: { label: string; action: string | null } | null;
  }

  const steps: WorkflowStep[] = [];

  const reviewed = !hasDemoRequest || Boolean(demoRequest?.reviewed_at);
  steps.push({
    key: 'review_customer', label: 'Registration Reviewed', completed: reviewed, owner: 'Platform',
    blocking_reason: null,
    primary_action: reviewed ? null : { label: 'Markera som granskad', action: 'mark-reviewed' },
  });

  const approved = !hasDemoRequest || Boolean(demoRequest?.approved_at);
  steps.push({
    key: 'approve_onboarding', label: 'Registration Approved', completed: approved, owner: 'Customer Success',
    blocking_reason: !reviewed ? 'Kunden måste granskas först' : null,
    primary_action: (!approved && reviewed) ? { label: 'Godkänn onboarding', action: 'approve-onboarding' } : null,
  });

  // "Choose Subscription" and "Create Administrator" remain their own rows
  // (not merged into "Organization Created") per the standing rule that this
  // 10-step order is the Product Owner's exact approved sequence — not to be
  // merged, removed, or reordered. Only the labels below were normalized to
  // business-event language; the structure is unchanged.
  steps.push({ key: 'choose_subscription', label: 'Subscription Selected', completed: true, owner: 'Platform', blocking_reason: null, primary_action: null });
  steps.push({ key: 'create_organization', label: 'Organization Created', completed: true, owner: 'Platform', blocking_reason: null, primary_action: null });
  steps.push({ key: 'create_administrator', label: 'Administrator Account Created', completed: true, owner: 'Platform', blocking_reason: null, primary_action: null });

  const invitationSent = inviteEvents.length > 0 || Boolean(admin?.invited_at);
  steps.push({
    key: 'send_invitation', label: 'Administrator Invitation Sent', completed: invitationSent, owner: 'Platform',
    blocking_reason: null,
    primary_action: invitationSent ? null : { label: 'Skicka inbjudan', action: 'resend-invitation' },
  });

  const DELIVERY_LABEL_SV: Record<string, string> = {
    bounced: 'senaste inbjudan studsade (ogiltig e-postadress)',
    suppressed: 'senaste inbjudan blockerades av leverantören (tidigare studsning)',
    delivered: 'senaste inbjudan levererades',
    delivery_delayed: 'senaste inbjudan är försenad',
    sent: 'senaste inbjudan skickades men leveransstatus är ännu okänd',
  };
  const activationBlockingReason = !invitationSent
    ? 'Inbjudan har inte skickats än'
    : invitationExpired
      ? 'Länken i senaste inbjudan har gått ut — skicka en ny'
      : (invitationDeliveryStatus && ['bounced', 'suppressed'].includes(invitationDeliveryStatus))
        ? `Leveransproblem: ${DELIVERY_LABEL_SV[invitationDeliveryStatus]}`
        : (invitationDeliveryStatus ? DELIVERY_LABEL_SV[invitationDeliveryStatus] ?? null : null);
  steps.push({
    key: 'administrator_activated', label: 'Administrator Activated Account', completed: activated, owner: 'Customer',
    blocking_reason: activationBlockingReason,
    primary_action: (!activated && invitationSent) ? { label: 'Skicka påminnelse', action: 'resend-invitation' } : null,
  });

  const schoolConfigured = progress.ready_for_go_live;
  steps.push({
    key: 'school_configuration', label: 'School Configuration Completed', completed: schoolConfigured, owner: 'Customer',
    blocking_reason: !activated ? 'Administratören har inte loggat in än' : null,
    primary_action: (!schoolConfigured && activated) ? { label: 'Kontakta kund för hjälp', action: 'contact-customer' } : null,
  });

  const paymentVerified = Boolean(facts.organization?.payment_verified_at);
  steps.push({
    key: 'verify_payment', label: 'Verify Payment', completed: paymentVerified, owner: 'Customer Success',
    blocking_reason: !schoolConfigured ? 'Skolans grundinställning är inte klar än' : null,
    primary_action: (!paymentVerified && schoolConfigured) ? { label: 'Bekräfta betalning verifierad', action: 'verify-payment' } : null,
  });

  const goLive = progress.is_live;
  steps.push({
    key: 'go_live_approval', label: 'Go Live Approval', completed: goLive, owner: 'Customer Success',
    blocking_reason: !paymentVerified ? 'Betalning är inte verifierad än' : (!schoolConfigured ? 'Skolans grundinställning är inte klar än' : null),
    primary_action: (!goLive && paymentVerified && schoolConfigured) ? { label: 'Godkänn driftsättning', action: 'approve-go-live' } : null,
  });

  const firstIncomplete = steps.find((s) => !s.completed) ?? null;
  const stage = firstIncomplete ? firstIncomplete.label : 'Pilot Ready';
  const stageIndex = firstIncomplete ? steps.indexOf(firstIncomplete) : steps.length;
  const progressLabel = `Step ${Math.min(stageIndex + 1, steps.length)} of ${steps.length}`;
  const progressPercent = Math.round((steps.filter((s) => s.completed).length / steps.length) * 100);

  // ── Health — derived from how long the current step has been waiting ───
  let health: 'green' | 'yellow' | 'red' = 'green';
  if (!firstIncomplete) {
    health = 'green';
  } else if (firstIncomplete.key === 'send_invitation') {
    health = 'red'; // nothing happens until the platform administrator acts
  } else if (firstIncomplete.key === 'administrator_activated') {
    const d = daysSince(lastInviteAt) ?? 0;
    health = d > 7 ? 'red' : d > 3 ? 'yellow' : 'green';
  } else if (firstIncomplete.key === 'school_configuration') {
    const d = daysSince(admin?.last_sign_in_at ?? null) ?? 0;
    health = d > 14 ? 'red' : d > 7 ? 'yellow' : 'green';
  } else if (firstIncomplete.key === 'verify_payment' || firstIncomplete.key === 'go_live_approval') {
    health = 'yellow'; // always needs a human decision, by design
  } else {
    health = 'yellow';
  }
  if ((operations.dead_letter_count ?? 0) > 0) health = 'red';

  const PENDING_OWNER: Record<string, string> = {
    Platform: 'Waiting for Platform', Customer: 'Waiting for Customer', 'Customer Success': 'Waiting for Customer Success',
  };

  // ── Next recommended action — exactly the first incomplete step's action ──
  let nextAction: { label: string; action: string | null } = firstIncomplete?.primary_action
    ?? { label: firstIncomplete ? 'Waiting for Customer' : 'No Action Required', action: null };
  if ((operations.dead_letter_count ?? 0) > 0) {
    nextAction = { label: 'Retry Failed Communication', action: 'retry-communication' };
  }

  // ── Recovery actions valid right now ───────────────────────────────────
  const recoveryActions: string[] = [];
  if (!activated) recoveryActions.push('resend-invitation', 'cancel-invitation');
  if (activated) recoveryActions.push('send-password-reset', 'force-password-reset');
  if (schoolConfigured && paymentVerified && !goLive) recoveryActions.push('approve-go-live');
  if ((operations.dead_letter_count ?? 0) > 0) recoveryActions.push('retry-communication');

  // ── Timeline (business language, real timestamps only) ────────────────
  // "Who performed it" is included wherever it's already part of data this
  // request already fetched (identity_security_events.actor_email) — never
  // guessed or backfilled with an extra query.
  const timeline: JourneyTimelineEntry[] = [];
  const push = (label: string, at: string | null | undefined, actor?: string | null) => {
    if (at) timeline.push({ label, occurred_at: at, ...(actor ? { actor } : {}) });
  };

  push('Registration Received', facts.demo_request?.created_at);
  // The welcome email is dispatched synchronously, best-effort, in the same
  // request that stores the registration (demo-requests/index.ts) — there is
  // no separate persisted send timestamp to report, so this reuses the
  // registration timestamp as an honest proxy for "at this same moment,"
  // not a fabricated distinct time. Only shown when a demo request actually
  // exists (the welcome email has nothing to attach to otherwise).
  if (facts.demo_request?.created_at) push('Welcome Email Sent', facts.demo_request.created_at);
  push('Organization Created', facts.organization?.created_at);
  for (const e of inviteEvents.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
    push(e.event_type === 'invite.created' ? 'Administrator Invitation Sent' : 'Administrator Invitation Resent', e.occurred_at, e.actor_email);
  }
  // First login (confirmed_at, fixed at the moment of first-ever
  // activation) is a distinct fact from last/most-recent login
  // (last_sign_in_at, which updates on every subsequent sign-in) — surfaced
  // separately per the account-support requirement to view both, not
  // conflated into one "activated" timestamp.
  push('Administrator Activated Account (First Login)', admin?.confirmed_at, admin?.email);
  push('First Branch Created', facts.first_location_at);
  push('First Vehicle Added', facts.first_vehicle_at);
  push('First Instructor Added', facts.first_instructor_at);
  push('Booking Configuration Set Up', facts.first_booking_config_at);
  push('Staff Member Invited', facts.first_staff_invited_at);
  push('Go Live Approved', progress.organization.go_live_at);

  // Password-reset activity belongs in the same recent-activity feed as the
  // invitation events already pushed above — one combined, deduplicated,
  // chronological feed rather than two overlapping lists (the previous
  // version repeated "Invitation Sent" in both a timeline and a separate
  // communication history).
  const COMM_LABEL: Record<string, string> = {
    'password_reset.sent': 'Password Reset Sent',
    'password_reset.forced': 'Password Reset Enforced',
  };
  for (const e of securityEvents) {
    if (COMM_LABEL[e.event_type]) push(COMM_LABEL[e.event_type], e.occurred_at, e.actor_email);
  }
  timeline.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  // ── Expected completion — real historical average, or an honest range ──
  let expectedCompletion: { type: 'date' | 'typical_range'; value: string } | null = null;
  if (stage !== 'Pilot Ready') {
    if (avgGoLiveDays !== null && avgGoLiveDays >= 1 && facts.organization?.created_at) {
      const est = new Date(new Date(facts.organization.created_at).getTime() + avgGoLiveDays * DAY_MS);
      expectedCompletion = { type: 'date', value: est.toISOString() };
    } else {
      expectedCompletion = { type: 'typical_range', value: '5–10 business days' };
    }
  }

  logger.info('platform-admin.onboarding-journey.ok', { correlation_id: ctx.correlationId, org_id: orgId, stage });

  return ok(ctx, {
    organization_id: orgId,
    organization_name: facts.organization?.name ?? null,
    subscription_tier: facts.organization?.subscription_tier ?? null,
    subscription_status: facts.organization?.subscription_status ?? null,
    stage,
    progress_label: progressLabel,
    progress_percent: progressPercent,
    health,
    pending_action_owner: firstIncomplete ? (PENDING_OWNER[firstIncomplete.owner] ?? 'No Action Required') : 'No Action Required',
    next_recommended_action: nextAction,
    recovery_actions: recoveryActions,
    expected_completion: expectedCompletion,
    steps,
    recent_activity: timeline,
    admin_contact: admin ? {
      user_id: admin.user_id,
      name: [admin.first_name, admin.last_name].filter(Boolean).join(' ') || null,
      email: admin.email,
      activated,
      // Distinct facts: confirmed_at is fixed at first-ever activation;
      // last_sign_in_at updates on every subsequent login. Conflating them
      // was a real gap — Platform Administration needs both to answer "when
      // did they first activate" vs. "are they still actively using it."
      first_login_at: admin.confirmed_at ?? null,
      last_login_at: admin.last_sign_in_at ?? null,
      invitation_delivery_status: invitationDeliveryStatus,
      invitation_expired: invitationExpired,
    } : null,
    customer_contact: facts.demo_request ? { name: facts.demo_request.contact_name, email: facts.demo_request.email, phone: facts.demo_request.phone } : null,
    demo_request_id: facts.demo_request?.id ?? null,
    operations_dead_letter_count: operations.dead_letter_count ?? 0,
  });
}

// Reuses requeue_dead_letter_events (event_outbox) and bulk_retry_messages
// (outbound_messages) — both already built and already used elsewhere
// (Communications' Queue Monitor page) — this just exposes the same
// recovery action scoped to one org from Platform Administration, so a
// Platform Administrator never needs direct database access to unstick a
// customer's stalled onboarding invite or failed notifications.
async function handleRetryOrgOperations(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: eventsRequeued, error: eventsError } = await db.rpc('requeue_dead_letter_events', { p_org_id: orgId });
  if (eventsError) {
    logger.error('platform-admin.retry-operations.events_failed', { correlation_id: ctx.correlationId, org_id: orgId, error: eventsError.message });
    return internalError(ctx, 'Failed to retry dead-lettered events');
  }

  const { data: messagesRequeued, error: messagesError } = await db.rpc('bulk_retry_messages', { p_org_id: orgId });
  if (messagesError) {
    logger.error('platform-admin.retry-operations.messages_failed', { correlation_id: ctx.correlationId, org_id: orgId, error: messagesError.message });
    return internalError(ctx, 'Failed to retry failed messages');
  }

  await recordIdentityEvent({
    eventType: 'operations.retry_triggered', provider: 'password', organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { events_requeued: eventsRequeued, messages_requeued: messagesRequeued },
  });

  logger.info('platform-admin.retry-operations.complete', {
    correlation_id: ctx.correlationId, org_id: orgId, events_requeued: eventsRequeued, messages_requeued: messagesRequeued,
  });
  return ok(ctx, { events_requeued: eventsRequeued ?? 0, messages_requeued: messagesRequeued ?? 0 });
}

async function handleUpdateOrgNotes(ctx: EdgeRequestContext, orgId: string, rawBody: unknown): Promise<Response> {
  const body = (typeof rawBody === 'object' && rawBody !== null) ? rawBody as Record<string, unknown> : {};
  const notes = typeof body['notes'] === 'string' ? body['notes'] : '';
  if (notes.length > 10_000) return badRequest(ctx, 'notes must be 10,000 characters or fewer');

  const db = createServiceClient();
  const { error } = await db.from('organizations').update({
    internal_notes: notes || null,
    internal_notes_updated_at: new Date().toISOString(),
    internal_notes_updated_by: ctx.actorId,
  }).eq('id', orgId);

  if (error) {
    logger.error('platform-admin.update-notes.failed', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to save notes');
  }
  logger.info('platform-admin.update-notes.complete', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, { org_id: orgId, notes_updated: true });
}

// Revokes every active session for an administrator — Supabase Auth's own
// mechanism (auth.admin.signOut with scope 'global'), not custom session
// handling. Distinct from Disable Administrator: this ends their *current*
// sessions immediately without changing their membership status or
// password — they can sign in again right away if their credentials still
// work, which is the point (a lost/stolen device scenario, not a suspected
// credential compromise — Force Password Reset is the right action for that).
async function handleForceLogout(ctx: EdgeRequestContext, orgId: string, userId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: membership } = await db
    .from('memberships').select('id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);

  const { error } = await db.auth.admin.signOut(userId, 'global');
  if (error) {
    logger.error('platform-admin.force-logout.failed', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId, error: error.message });
    return internalError(ctx, 'Failed to force logout');
  }

  await recordIdentityEvent({
    eventType: 'session.force_logout', provider: 'password', severity: 'warning', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { source: 'platform-admin/orgs/admins/force-logout' },
  });

  logger.info('platform-admin.force-logout.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return ok(ctx, { user_id: userId, logged_out: true });
}

// ─── Tenant lifecycle — Delete (CRITICAL: Tenant Trial Lifecycle) ─────────────
//
// Suspend/Restore/Terminate/Extend/End-Trial already existed as direct
// client-side RLS-gated `organizations` writes (organizations_update_platform
// policy) — those already fully revoke access the moment status leaves
// 'active' (get_user_jwt_claims()'s `o.status = 'active'` join excludes
// suspended/terminated orgs entirely, confirmed live). What was missing —
// the actual gap this task audited and found — is that "Delete" only ever
// flagged the organizations row itself (deleted_at); every vehicle,
// instructor, branch, and user membership it owned was left behind
// untouched. This closes that gap with a real, safe resource cascade,
// while deliberately NEVER touching anything append-only/audit (invoices,
// ledger entries, lesson_types referenced by historical bookings, or the
// audit_logs / tenant_trial_events tables themselves — those survive by
// design, matching "do not delete audit records").
//
// Guarded to only run once the organization is already non-active
// (suspended or terminated) — access must already be cut off before
// tenant-owned resources are removed, never the other way around.
async function handleDeleteTenantData(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: org, error: orgErr } = await db
    .from('organizations').select('id, name, status, deleted_at').eq('id', orgId).maybeSingle();
  if (orgErr || !org) return notFound(ctx);

  if (org.deleted_at) {
    return ok(ctx, { org_id: orgId, deleted: true, already_deleted: true });
  }
  if (org.status === 'active') {
    return badRequest(ctx, 'Organisationen måste suspenderas eller avslutas innan tenant-data kan tas bort säkert.');
  }

  const now = new Date().toISOString();

  // ── Operational resources: soft-delete only — never a hard DELETE, per
  // the platform's standing soft-delete convention. Reversible in principle
  // (a developer could clear deleted_at), matching how every other domain
  // delete in this codebase already works.
  const [vehiclesResult, instructorsResult, locationsResult] = await Promise.all([
    db.from('vehicles').update({ deleted_at: now, deleted_by: ctx.actorId })
      .eq('organization_id', orgId).is('deleted_at', null).select('id'),
    db.from('instructors').update({ deleted_at: now, deleted_by: ctx.actorId })
      .eq('organization_id', orgId).is('deleted_at', null).select('id'),
    db.from('organization_locations').update({ deleted_at: now, deleted_by: ctx.actorId })
      .eq('organization_id', orgId).is('deleted_at', null).select('id'),
  ]);

  // ── User access: fully removed, not just deactivated — mirrors
  // rollbackTrialProvisioning()'s established staff-cleanup pattern
  // (membership_roles → memberships → auth user, reverse dependency order).
  const { data: memberships } = await db
    .from('memberships').select('id, user_id').eq('organization_id', orgId);
  let usersRemoved = 0;
  for (const m of (memberships ?? []) as Array<{ id: string; user_id: string }>) {
    await db.from('membership_roles').delete().eq('membership_id', m.id);
    await db.from('memberships').delete().eq('id', m.id);
    const { error: deleteUserErr } = await db.auth.admin.deleteUser(m.user_id);
    if (deleteUserErr) {
      logger.warn('platform-admin.delete-tenant-data.user_delete_failed', {
        correlation_id: ctx.correlationId, org_id: orgId, user_id: m.user_id, error: deleteUserErr.message,
      });
    } else {
      usersRemoved++;
    }
  }

  const { error: orgUpdateErr } = await db.from('organizations')
    .update({ deleted_at: now, deleted_by: ctx.actorId, updated_by: ctx.actorId })
    .eq('id', orgId);
  if (orgUpdateErr) {
    logger.error('platform-admin.delete-tenant-data.org_update_failed', { correlation_id: ctx.correlationId, org_id: orgId, error: orgUpdateErr.message });
    return internalError(ctx, 'Failed to finalize tenant deletion');
  }

  // ── Close out the originating trial session, if any ───────────────────────
  // Found live (2026-08-09): deleting an org that came from a trial signup
  // left its tenant_trial_sessions row behind at status='active', still
  // pointing at the now-deleted organization_id. trial-signup's own
  // duplicate-request guard (handleStart) treats any non-terminal status as
  // "already an ongoing registration" — so that email could never start a
  // new trial again, the one path this platform is supposed to always allow
  // (a deleted tenant is a clean slate, exactly like the existing
  // reject-then-delete path already correctly is). 'cancelled' is reused
  // rather than a new status — it's already excluded from the duplicate
  // check and already means "terminal, no further action" everywhere else
  // in this lifecycle.
  const { data: originatingSession } = await db
    .from('tenant_trial_sessions').select('id, email, driving_school_name, status')
    .eq('organization_id', orgId).maybeSingle();
  if (originatingSession && !['rejected', 'cancelled', 'expired'].includes(originatingSession.status)) {
    const { error: sessionUpdateErr } = await db.from('tenant_trial_sessions')
      .update({ status: 'cancelled', cancelled_at: now, cancelled_by: ctx.actorId, cancellation_reason: 'Tenant deleted by platform admin' })
      .eq('id', originatingSession.id);
    if (sessionUpdateErr) {
      logger.warn('platform-admin.delete-tenant-data.session_update_failed', {
        correlation_id: ctx.correlationId, org_id: orgId, session_id: originatingSession.id, error: sessionUpdateErr.message,
      });
    } else {
      await logTrialEvent(db, {
        sessionId: originatingSession.id, email: originatingSession.email, drivingSchoolName: originatingSession.driving_school_name,
        eventType: 'cancelled', actorType: 'admin', actorId: ctx.actorId, actorEmail: ctx.actorEmail,
        metadata: { source: 'delete-tenant-data', organization_id: orgId },
      });
    }
  }

  logger.info('platform-admin.delete-tenant-data.complete', {
    correlation_id: ctx.correlationId, org_id: orgId, actor_id: ctx.actorId,
    vehicles_removed: vehiclesResult.data?.length ?? 0,
    instructors_removed: instructorsResult.data?.length ?? 0,
    locations_removed: locationsResult.data?.length ?? 0,
    users_removed: usersRemoved,
  });

  return ok(ctx, {
    org_id: orgId, deleted: true,
    vehicles_removed: vehiclesResult.data?.length ?? 0,
    instructors_removed: instructorsResult.data?.length ?? 0,
    locations_removed: locationsResult.data?.length ?? 0,
    users_removed: usersRemoved,
  });
}

// ─── Handlers — announcements (Nyheter / TABSnytt) ────────────────────────────
// Platform-wide content, not tenant data — no organization_id, service-role
// client bypasses the table's read-only RLS policy (which only allows
// authenticated SELECT of currently-live rows; all writes go through here).

const ANNOUNCEMENT_SEVERITIES = new Set(['info', 'warning', 'critical']);

async function handleAnnouncementList(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('announcements')
    .select('*')
    .order('published_at', { ascending: false });

  if (error) {
    logger.error('platform-admin.announcements.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load announcements');
  }
  return ok(ctx, data ?? []);
}

async function handleCreateAnnouncement(ctx: EdgeRequestContext, body: unknown): Promise<Response> {
  const input = (body ?? {}) as Record<string, unknown>;
  const title = typeof input['title'] === 'string' ? input['title'].trim() : '';
  const text  = typeof input['body']  === 'string' ? input['body'].trim()  : '';
  const severity = typeof input['severity'] === 'string' ? input['severity'] : 'info';
  const expiresAt = typeof input['expires_at'] === 'string' ? input['expires_at'] : null;

  if (!title) return badRequest(ctx, 'title is required');
  if (!text) return badRequest(ctx, 'body is required');
  if (!ANNOUNCEMENT_SEVERITIES.has(severity)) return badRequest(ctx, 'severity must be info, warning, or critical');

  const db = createServiceClient();
  const { data, error } = await db
    .from('announcements')
    .insert({ title, body: text, severity, expires_at: expiresAt, created_by: ctx.actorId })
    .select('*')
    .single();

  if (error) {
    logger.error('platform-admin.announcements.create_failed', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to create announcement');
  }
  logger.info('platform-admin.announcements.created', { correlation_id: ctx.correlationId, announcement_id: (data as { id: string }).id });
  return created(ctx, data);
}

async function handleUpdateAnnouncement(ctx: EdgeRequestContext, id: string, body: unknown): Promise<Response> {
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof input['title'] === 'string') patch['title'] = input['title'].trim();
  if (typeof input['body'] === 'string') patch['body'] = input['body'].trim();
  if (typeof input['severity'] === 'string') {
    if (!ANNOUNCEMENT_SEVERITIES.has(input['severity'])) return badRequest(ctx, 'severity must be info, warning, or critical');
    patch['severity'] = input['severity'];
  }
  if (typeof input['is_active'] === 'boolean') patch['is_active'] = input['is_active'];
  if (input['expires_at'] === null || typeof input['expires_at'] === 'string') patch['expires_at'] = input['expires_at'];

  if (Object.keys(patch).length === 0) return badRequest(ctx, 'No updatable fields provided');

  const db = createServiceClient();
  const { data, error } = await db
    .from('announcements')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('platform-admin.announcements.update_failed', { correlation_id: ctx.correlationId, announcement_id: id, error: error.message });
    return internalError(ctx, 'Failed to update announcement');
  }
  if (!data) return notFound(ctx);
  return ok(ctx, data);
}

// ─── Handlers — subscriptions ─────────────────────────────────────────────────

async function handleSubscriptionList(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_subscription_list');
  if (error) {
    logger.error('platform-admin.subscription-list.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load subscription list');
  }
  logger.info('platform-admin.subscription-list.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as unknown[]);
}

async function handleSubscriptionDetail(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_subscription_detail', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.subscription-detail.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load subscription detail');
  }
  if (!data) return notFound(ctx);

  // Additive enrichment via the Platform Subscription/Entitlement Services —
  // every existing field from the RPC above is preserved unchanged; only a
  // new `entitlements` key is added.
  const snapshot = await getSubscriptionSnapshot(db, orgId);

  logger.info('platform-admin.subscription-detail.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, { ...(data as Record<string, unknown>), entitlements: snapshot?.entitlements ?? null });
}

async function handleSubscriptionHistory(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_subscription_history', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.subscription-history.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load subscription history');
  }
  logger.info('platform-admin.subscription-history.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as unknown[]);
}

// ─── Handlers — Operations Center (Phase 1D) ─────────────────────────────────

async function handlePlatformAdminsDetail(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_admins_detail');
  if (error) {
    logger.error('platform-admin.platform-admins-detail.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load platform administrator details');
  }
  logger.info('platform-admin.platform-admins-detail.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as unknown[]);
}

// ─── SaaS Operations Console — platform-wide workspace summaries ────────────
// Each wraps one new platform-wide RPC (20260729000003_platform_ops_console_ia.sql),
// itself built on tables/views that already existed (event_outbox_health,
// outbound_messages, students' GDPR columns, regulatory_workflows) — these
// endpoints are read-only aggregation, not new business functionality.

async function handleOperationsSummary(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_operations_summary');
  if (error) {
    logger.error('platform-admin.operations-summary.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load operations summary');
  }
  logger.info('platform-admin.operations-summary.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as Record<string, unknown>);
}

async function handleCommunicationsSummary(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_communications_summary');
  if (error) {
    logger.error('platform-admin.communications-summary.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load communications summary');
  }
  logger.info('platform-admin.communications-summary.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as Record<string, unknown>);
}

async function handleComplianceSummary(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_compliance_summary');
  if (error) {
    logger.error('platform-admin.compliance-summary.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load compliance summary');
  }
  logger.info('platform-admin.compliance-summary.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as Record<string, unknown>);
}

async function handleRecoveryQueue(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_recovery_queue');
  if (error) {
    logger.error('platform-admin.recovery-queue.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load recovery queue');
  }
  logger.info('platform-admin.recovery-queue.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as unknown[]);
}

async function handleAuditLog(ctx: EdgeRequestContext, url: URL): Promise<Response> {
  const sp = url.searchParams;
  const orgId      = sp.get('org_id')      || null;
  const actorEmail = sp.get('actor_email') || null;
  const entityType = sp.get('entity_type') || null;
  const operation  = sp.get('operation')   || null;
  const dateFrom   = sp.get('date_from')   || null;
  const dateTo     = sp.get('date_to')     || null;
  const limit      = Math.min(parseInt(sp.get('limit')  ?? '50', 10), 200);
  const offset     = Math.max(parseInt(sp.get('offset') ?? '0',  10), 0);

  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_audit_log', {
    p_org_id:      orgId,
    p_actor_email: actorEmail,
    p_entity_type: entityType,
    p_operation:   operation,
    p_date_from:   dateFrom,
    p_date_to:     dateTo,
    p_limit:       limit,
    p_offset:      offset,
  });
  if (error) {
    logger.error('platform-admin.audit-log.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load audit log');
  }
  logger.info('platform-admin.audit-log.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as Record<string, unknown>);
}

async function handleSecurityEvents(ctx: EdgeRequestContext, url: URL): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500);
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_security_events', { p_limit: limit });
  if (error) {
    logger.error('platform-admin.security-events.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load security events');
  }
  logger.info('platform-admin.security-events.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as unknown[]);
}

async function handleOrgHealth(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_org_health', { p_org_id: orgId });
  if (error) {
    logger.error('platform-admin.org-health.rpc_error', { correlation_id: ctx.correlationId, org_id: orgId, error: error.message });
    return internalError(ctx, 'Failed to load organization health');
  }
  if (!data) return notFound(ctx);
  logger.info('platform-admin.org-health.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as Record<string, unknown>);
}

// ─── Handlers — worker operations (Epic 7.4) ─────────────────────────────────

async function handleWorkerRuns(ctx: EdgeRequestContext, url: URL): Promise<Response> {
  const sp          = url.searchParams;
  const workerName  = sp.get('worker_name') || null;
  const status      = sp.get('status')      || null;
  const limit       = Math.min(parseInt(sp.get('limit')  ?? '50', 10), 200);
  const offset      = Math.max(parseInt(sp.get('offset') ?? '0',  10), 0);

  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_worker_runs', {
    p_worker_name: workerName,
    p_status:      status,
    p_limit:       limit,
    p_offset:      offset,
  });
  if (error) {
    logger.error('platform-admin.worker-runs.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load worker run history');
  }
  logger.info('platform-admin.worker-runs.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as Record<string, unknown>);
}

async function handleWorkerRunSummary(ctx: EdgeRequestContext): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('get_platform_worker_run_summary');
  if (error) {
    logger.error('platform-admin.worker-run-summary.rpc_error', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to load worker run summary');
  }
  logger.info('platform-admin.worker-run-summary.ok', { correlation_id: ctx.correlationId });
  return ok(ctx, data as unknown[]);
}

// ─── Handlers — provisioning (Automated Customer Provisioning) ───────────────
//
// Automates the sequence previously performed manually via
// supabase/seed/bootstrap_org_admin.sql: organization → tenant administrator
// (auth user + profile) → membership → org_owner role → invitation enqueue.
// Runs as an Edge Function (not a single SQL function) because creating the
// auth user requires the Supabase Auth Admin API, which no SQL function can
// call — the same reason supabase/functions/platform-bootstrap/index.ts is
// an Edge Function with explicit compensating rollback rather than a single
// database transaction. That rollback pattern is reused here directly.
//
// Deliberately does NOT create an organization_locations row (see Customer
// Provisioning & Tenant Onboarding Architecture, Section 8 — "Branch
// Offices / Locations" is a Tenant Onboarding step performed later, with a
// real address, via the existing useCreateLocation hook). A demo request
// only ever captures a municipality, never a street address; inventing a
// placeholder address was considered and rejected in favor of not creating
// the location prematurely at all.
//
// Run tracking reuses the existing, already-built worker_run_log table
// (worker_name: 'customer-provisioning') rather than a new table — it
// already has status/timing/error columns and a jsonb metadata column, and
// is already surfaced in Platform Administration via the existing
// /worker-runs routes. Audit trail is free: organizations, profiles,
// memberships, and membership_roles already all have audit_trigger_fn()
// attached at the table level, so every insert below is captured
// automatically with no extra code.
//
// Hardening pass (Provisioning Stabilization Sprint): added an idempotency
// guard against re-converting an already-converted demo request; org_number
// uniqueness violations now return a specific 422 instead of a generic 500
// (previously silently broke CreateOrgDialog.tsx's existing error-matching);
// bounded admin_first_name/admin_last_name length; the invitation event now
// carries target_id; the final worker_run_log completion update is checked
// and logged rather than silently ignored. Reviewed and deliberately left
// unchanged: no uniqueness constraint exists on organizations.name (two
// legitimate schools may share a display name — this is an existing,
// intentional design point, not a gap); true concurrent-race protection for
// the idempotency guard (a database-level advisory lock) was not added —
// see the guard's own comment for why.

const VALID_PROVISION_TIERS = ['trial', 'starter', 'professional', 'enterprise'] as const;
type ProvisionTier = (typeof VALID_PROVISION_TIERS)[number];

interface ProvisionInput {
  demoRequestId:    string | null;
  name:             string;
  legalName:        string;
  orgNumber:        string | null;
  subscriptionTier: ProvisionTier;
  trialDays:        number;
  adminFirstName:   string;
  adminLastName:    string;
  adminEmail:       string;
  // Canonical business/setup information (Tenant Registration Unification,
  // 2026-08-28). Both normal UI entry points — CreateOrgDialog and
  // ConvertToCustomerDialog — now validate this as REQUIRED before
  // submitting (see their own client-side validateRequiredBusinessSetupFields
  // checks) and always send it; the field stays optional at this API
  // boundary only so a genuine future internal/admin-only exception could
  // still omit it without a schema change — no such caller exists in the
  // repository today (Corrective Pass audit, 2026-08-28). When present,
  // handleProvision runs it through the exact same
  // provisionBusinessConfiguration/provisionBusinessResources functions
  // trial-signup uses, so a Platform-Admin-created tenant reaches the same
  // initialization level as a self-service one.
  businessSetup:    BusinessSetupAnswers | null;
}

function validateProvisionBody(body: unknown): { ok: true; value: ProvisionInput } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;

  const name           = typeof b.name === 'string' ? b.name.trim() : '';
  const legalName       = typeof b.legal_name === 'string' ? b.legal_name.trim() : '';
  const adminFirstName  = typeof b.admin_first_name === 'string' ? b.admin_first_name.trim() : '';
  const adminLastName   = typeof b.admin_last_name === 'string' ? b.admin_last_name.trim() : '';
  const adminEmail      = typeof b.admin_email === 'string' ? b.admin_email.trim().toLowerCase() : '';
  const tier            = typeof b.subscription_tier === 'string' ? b.subscription_tier : '';
  const trialDays       = typeof b.trial_days === 'number' && Number.isInteger(b.trial_days) ? b.trial_days : 30;
  const orgNumberRaw    = typeof b.org_number === 'string' ? b.org_number.trim() : '';
  const demoRequestId   = typeof b.demo_request_id === 'string' && b.demo_request_id.trim() ? b.demo_request_id.trim() : null;

  if (name.length < 2 || name.length > 100)                  return { ok: false, message: 'name is required (2-100 characters)' };
  if (legalName.length < 2 || legalName.length > 200)        return { ok: false, message: 'legal_name is required (2-200 characters)' };
  if (adminFirstName.length < 1 || adminFirstName.length > 100) return { ok: false, message: 'admin_first_name is required (max 100 characters)' };
  if (adminLastName.length < 1 || adminLastName.length > 100)  return { ok: false, message: 'admin_last_name is required (max 100 characters)' };
  if (adminEmail.length > 200)                                return { ok: false, message: 'admin_email is too long (max 200 characters)' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail))         return { ok: false, message: 'admin_email must be a valid email address' };
  if (!(VALID_PROVISION_TIERS as readonly string[]).includes(tier)) {
    return { ok: false, message: `subscription_tier must be one of: ${VALID_PROVISION_TIERS.join(', ')}` };
  }
  if (tier === 'trial' && (trialDays < 1 || trialDays > 365)) {
    return { ok: false, message: 'trial_days must be between 1 and 365' };
  }
  if (orgNumberRaw && !/^\d{6}-\d{4}$/.test(orgNumberRaw)) {
    return { ok: false, message: 'org_number must match format XXXXXX-XXXX' };
  }

  // Deep field-level validation (per-vehicle/instructor/branch entry
  // completeness, licence category presence, etc.) is deliberately not
  // duplicated here — provisionBusinessConfiguration/provisionBusinessResources
  // already tolerate partial/malformed sub-fields the same way the trial
  // wizard's own submission does (filtering incomplete entries, defaulting
  // missing counts), so a loose "is this an object" check is sufficient at
  // this boundary. Business-rule validation stays owned by the shared
  // provisioning functions, not duplicated at two request-parsing layers.
  const businessSetupRaw = b.business_setup;
  const businessSetup: BusinessSetupAnswers | null =
    typeof businessSetupRaw === 'object' && businessSetupRaw !== null && !Array.isArray(businessSetupRaw)
      ? businessSetupRaw as BusinessSetupAnswers
      : null;

  return {
    ok: true,
    value: {
      demoRequestId,
      name, legalName,
      orgNumber:        orgNumberRaw || null,
      subscriptionTier: tier as ProvisionTier,
      trialDays,
      adminFirstName, adminLastName, adminEmail,
      businessSetup,
    },
  };
}

// Ports apps/web/src/modules/platform/lib/slugify.ts's algorithm — Edge
// Functions cannot import frontend module code (different runtime/bundler),
// so this mirrors that logic exactly rather than inventing a different one.
// deno-lint-ignore no-explicit-any
async function generateUniqueOrgSlug(db: any, name: string): Promise<string> {
  const raw = name
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  const base = raw.length >= 3 ? raw : (raw ? `${raw}org` : 'org');

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await db.from('organizations').select('id').eq('slug', candidate).maybeSingle();
    if (data === null) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

async function handleProvision(ctx: EdgeRequestContext, rawBody: unknown): Promise<Response> {
  const validation = validateProvisionBody(rawBody);
  if (!validation.ok) return badRequest(ctx, validation.message);
  const input = validation.value;

  const db = createServiceClient();
  const startedAt = Date.now();

  // ── Idempotency guard ──────────────────────────────────────────────────
  // The UI already hides "Convert to Customer" once converted_organization_id
  // is set (DemoRequestDetailSheet.tsx), so this only matters for a
  // double-submit, a stale second tab, or a direct API call bypassing the
  // UI — but the server must never trust a client-side guard is the only
  // one. This is a check-then-act read, not a database-enforced lock (no
  // advisory lock or SECURITY DEFINER transaction wraps the whole
  // sequence — see the file header), so a true millisecond-level race
  // between two simultaneous conversions of the same lead is not fully
  // closed. Accepted, disclosed risk: this is a low-frequency, platform-
  // admin-only action, not a hot path — a distributed lock for a scenario
  // this operationally unlikely would be exactly the kind of unwarranted
  // complexity CLAUDE.md's anti-overengineering guardrails argue against.
  if (input.demoRequestId) {
    const { data: existingRequest, error: existingRequestError } = await db
      .from('demo_requests')
      .select('converted_organization_id')
      .eq('id', input.demoRequestId)
      .maybeSingle();

    if (existingRequestError) {
      logger.error('platform-admin.provision.demo_request_lookup_failed', {
        correlation_id: ctx.correlationId, demo_request_id: input.demoRequestId, error: existingRequestError.message,
      });
      return internalError(ctx, 'Failed to look up demo request');
    }
    if (existingRequest?.converted_organization_id) {
      return badRequest(ctx, 'This demo request has already been converted to a customer');
    }
  }

  // ── Run tracking: reuses worker_run_log, no new table ────────────────────
  const { data: runRow, error: runInsertError } = await db
    .from('worker_run_log')
    .insert({
      worker_name: 'customer-provisioning',
      run_status:  'running',
      metadata: {
        triggered_by:    ctx.actorId,
        demo_request_id: input.demoRequestId,
        organization_name: input.name,
        admin_email:      input.adminEmail,
        correlation_id:   ctx.correlationId,
      },
    })
    .select('id')
    .single();

  if (runInsertError || !runRow) {
    logger.error('platform-admin.provision.run_log_insert_failed', {
      correlation_id: ctx.correlationId, error: runInsertError?.message,
    });
    return internalError(ctx, 'Failed to start provisioning run');
  }
  const runId = runRow.id as string;

  async function failRun(message: string): Promise<void> {
    await db.from('worker_run_log').update({
      run_status:    'failed',
      completed_at:  new Date().toISOString(),
      duration_ms:   Date.now() - startedAt,
      failed_count:  1,
      processed_count: 1,
      error_summary: message,
    }).eq('id', runId);
  }

  // ── Rollback: best-effort, reverse dependency order, never throws ────────
  //
  // Ordering matters and is deliberate: membership_roles → memberships →
  // organizations respects memberships_org_fkey's ON DELETE RESTRICT (an
  // organization can't be deleted while a membership still references it),
  // so the membership row is always gone before the org delete runs.
  //
  // Deleting the auth user last is itself a second, redundant safety net:
  // profiles_auth_user_fkey, memberships_user_fkey, and
  // membership_roles_membership_fkey are all ON DELETE CASCADE from
  // auth.users, so deleteUser() alone would clean up all four rows even if
  // the explicit deletes above were skipped. Both are kept — explicit
  // deletion first, cascade as a backstop — rather than relying on cascade
  // alone for a rollback path whose correctness actually matters.
  async function rollback(opts: { userId?: string; membershipId?: string; orgId?: string }): Promise<void> {
    if (opts.membershipId) {
      await db.from('membership_roles').delete().eq('membership_id', opts.membershipId);
      await db.from('memberships').delete().eq('id', opts.membershipId);
    }
    if (opts.orgId) {
      await db.from('organizations').delete().eq('id', opts.orgId);
    }
    if (opts.userId) {
      await db.auth.admin.deleteUser(opts.userId);
    }
  }

  // ── Step 1+2: Organization creation + Subscription assignment ────────────
  const slug = await generateUniqueOrgSlug(db, input.name);
  const isTrial = input.subscriptionTier === 'trial';

  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert({
      slug,
      name:                input.name,
      legal_name:          input.legalName,
      org_number:          input.orgNumber,
      status:              'active',
      subscription_tier:   input.subscriptionTier,
      subscription_status: isTrial ? 'trialing' : 'active',
      trial_ends_at:       isTrial ? new Date(Date.now() + input.trialDays * 86_400_000).toISOString() : null,
      settings: {
        timezone: 'Europe/Stockholm',
        currency: 'SEK',
        locale:   'sv-SE',
        vat_rate: 0.25,
      },
      created_by: ctx.actorId,
      updated_by: ctx.actorId,
    })
    .select('id, slug, name')
    .single();

  if (orgError || !org) {
    logger.error('platform-admin.provision.org_insert_failed', { correlation_id: ctx.correlationId, error: orgError?.message });
    await failRun(`Organization creation failed: ${orgError?.message ?? 'unknown error'}`);

    // Surface the specific, known constraint violation as a friendly 422 —
    // previously this fell through to a generic 500, which also silently
    // broke CreateOrgDialog.tsx's existing uq_organizations_org_number
    // string-match error handling (it never saw the real constraint name).
    // Any other org insert failure still returns the generic message —
    // this does not leak raw Postgres error text to the client.
    if ((orgError?.message ?? '').includes('uq_organizations_org_number')) {
      return badRequest(ctx, `Organization number ${input.orgNumber ?? ''} is already in use by another organization`);
    }
    return internalError(ctx, 'Failed to create organization');
  }
  const orgId = org.id as string;

  // Platform Entitlement Service pre-check — structurally near-unreachable on
  // a brand-new org (membership count is always 0 here), added for symmetry
  // with handleInviteAdmin rather than because a real gap was found.
  const seatEntitlement = await getSeatEntitlement(db, orgId);
  if (!seatEntitlement.allowed) {
    await rollback({ orgId });
    await failRun('Organization seat limit reached immediately after creation — max_users may be misconfigured');
    return internalError(ctx, 'Platform configuration error: organization has no available seats');
  }

  // ── org_owner role lookup (system role, seeded by migration) ─────────────
  const { data: ownerRole, error: roleError } = await db
    .from('roles')
    .select('id')
    .eq('name', 'org_owner')
    .eq('is_system_role', true)
    .single();

  if (roleError || !ownerRole) {
    logger.error('platform-admin.provision.owner_role_missing', { correlation_id: ctx.correlationId, error: roleError?.message });
    await rollback({ orgId });
    await failRun('org_owner system role not found — migrations may be out of sync');
    return internalError(ctx, 'Platform configuration error: org_owner role not found');
  }

  // ── Step 5: Tenant Administrator creation (Auth Admin API) ───────────────
  // Real Supabase Auth invitation — never a hidden, generated-then-discarded
  // password nobody knows (the prior behavior). inviteUserByEmail creates the
  // account in an unconfirmed/pending state and sends Supabase's own Invite
  // email with a secure link; the administrator chooses their own password
  // on first visit (AcceptInvitePage.tsx, already built for this exact flow).
  // Mirrors invite-user/index.ts's inviteNewUser() — the same mechanism
  // already used for regular staff invitations, applied here to tenant admins.
  const origin = getAppOrigin();
  const { data: authData, error: authError } = await db.auth.admin.inviteUserByEmail(input.adminEmail, {
    data:       { first_name: input.adminFirstName, last_name: input.adminLastName },
    redirectTo: `${origin}/auth/accept-invite`,
  });

  if (authError || !authData.user) {
    logger.error('platform-admin.provision.auth_user_failed', { correlation_id: ctx.correlationId, error: authError?.message });
    await rollback({ orgId });
    await failRun(`Tenant administrator creation failed: ${authError?.message ?? 'unknown error'}`);
    const isDuplicate = (authError?.message ?? '').toLowerCase().includes('already');
    return isDuplicate
      ? badRequest(ctx, `An account with email ${input.adminEmail} already exists`)
      : internalError(ctx, 'Failed to create tenant administrator account');
  }
  const userId = authData.user.id;

  // ── Global profile ────────────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const { error: profileError } = await db.from('profiles').upsert({
    id:           userId,
    first_name:   input.adminFirstName,
    last_name:    input.adminLastName,
    email:        input.adminEmail,
    is_active:    true,
    onboarded_at: nowIso,
  }, { onConflict: 'id' });

  if (profileError) {
    logger.error('platform-admin.provision.profile_failed', { correlation_id: ctx.correlationId, error: profileError.message });
    await rollback({ userId, orgId });
    await failRun(`Profile creation failed: ${profileError.message}`);
    return internalError(ctx, 'Failed to create tenant administrator profile');
  }

  // ── Step 6: Membership + org_owner role ──────────────────────────────────
  const { data: membership, error: membershipError } = await db
    .from('memberships')
    .insert({ user_id: userId, organization_id: orgId, status: 'pending', joined_at: nowIso })
    .select('id')
    .single();

  if (membershipError || !membership) {
    logger.error('platform-admin.provision.membership_failed', { correlation_id: ctx.correlationId, error: membershipError?.message });
    await rollback({ userId, orgId });
    await failRun(`Membership creation failed: ${membershipError?.message ?? 'unknown error'}`);
    return internalError(ctx, 'Failed to create membership');
  }
  const membershipId = membership.id as string;

  const { error: roleAssignError } = await db.from('membership_roles').insert({
    membership_id: membershipId,
    role_id:       ownerRole.id,
    is_active:     true,
  });

  if (roleAssignError) {
    logger.error('platform-admin.provision.role_assign_failed', { correlation_id: ctx.correlationId, error: roleAssignError.message });
    await rollback({ userId, membershipId, orgId });
    await failRun(`Role assignment failed: ${roleAssignError.message}`);
    return internalError(ctx, 'Failed to assign org_owner role');
  }

  logger.info('platform-admin.provision.tenant_created', {
    correlation_id: ctx.correlationId, org_id: orgId, user_id: userId, membership_id: membershipId,
  });

  // ── Step 6b: canonical business setup (optional) ─────────────────────────
  // Runs the exact same shared provisioning trial-signup uses (Tenant
  // Registration Unification, 2026-08-28), so a Platform-Admin-created
  // tenant can reach the same initialization level as a self-service one —
  // branch, priced lesson types, package templates, VAT period,
  // communication channels, vehicles, instructors (+ availability),
  // additional staff, extra branches, and bookable slots. Deliberately
  // non-fatal: a gap here (e.g. no price set) never rolls back the
  // organization/admin/membership already created above — those stay
  // Platform Admin's own authority, unaffected by an optional supplementary
  // payload. Any shortfall is surfaced in the response and worker_run_log
  // metadata instead, leaving the remaining gaps visible via Kom igång,
  // exactly like any organization provisioned without business_setup at all.
  let businessSetupSummary: Record<string, unknown> | null = null;
  if (input.businessSetup) {
    const configOutcome = await provisionBusinessConfiguration(db, orgId, input.businessSetup, { correlationId: ctx.correlationId });
    if (!configOutcome.ok) {
      logger.warn('platform-admin.provision.business_setup_configuration_failed', {
        correlation_id: ctx.correlationId, org_id: orgId, error: configOutcome.failure?.message,
      });
      businessSetupSummary = { ok: false, stage: 'configuration', error: configOutcome.failure?.message ?? 'unknown error' };
    } else {
      const resourcesOutcome = await provisionBusinessResources(db, orgId, input.businessSetup, {
        userId, correlationId: ctx.correlationId, actorEmail: ctx.actorEmail,
      });
      businessSetupSummary = {
        ok: true,
        validation_warnings: configOutcome.validationWarnings,
        lesson_types_created: configOutcome.lessonTypesCreated,
        package_templates_created: configOutcome.packageTemplatesCreated,
        branch_created: configOutcome.branchCreated + resourcesOutcome.primaryBranchFallbackCreated,
        priced_lesson_types: configOutcome.pricedLessonTypes,
        vehicles_created: resourcesOutcome.vehiclesCreated,
        instructors_created: resourcesOutcome.instructorsCreated,
        staff_invited: resourcesOutcome.staffInvited,
        additional_branches_created: resourcesOutcome.additionalBranchesCreated,
        slots_generated: resourcesOutcome.slotsGenerated,
        warnings: [...configOutcome.warnings, ...resourcesOutcome.warnings],
      };
      logger.info('platform-admin.provision.business_setup_completed', {
        correlation_id: ctx.correlationId, org_id: orgId, ...businessSetupSummary,
      });
    }
  }

  await recordIdentityEvent({
    eventType: 'invite.created', provider: 'password', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { invited_email: input.adminEmail, role: 'org_owner', source: 'platform-admin/provision' },
  });

  // ── Step 7: Invitation — enqueue immediately (see architecture decision:  ──
  // event_outbox.cancelled_at is the existing safety valve if a platform    ──
  // admin needs to stop dispatch before a future worker processes it).     ──
  // Non-fatal: the tenant is already fully created even if this fails.
  const { error: outboxError } = await db.rpc('insert_outbox_event', {
    p_event_type:      'tenant.provisioned',
    p_channel:          'email',
    p_organization_id:  orgId,
    // The email address a future event-worker handler dispatches to —
    // matches the convention target_id is meant for (see insert_outbox_event's
    // own signature), rather than leaving a future handler to dig it out of
    // payload alone.
    p_target_id:        input.adminEmail,
    p_payload: {
      organization_id:   orgId,
      organization_name: org.name,
      admin_email:       input.adminEmail,
      admin_first_name:  input.adminFirstName,
      admin_last_name:   input.adminLastName,
    },
    p_metadata: { source: 'platform-admin/provision', provisioning_run_id: runId, correlation_id: ctx.correlationId },
  });

  if (outboxError) {
    logger.warn('platform-admin.provision.invitation_enqueue_failed', {
      correlation_id: ctx.correlationId, org_id: orgId, error: outboxError.message,
    });
  }

  // ── Demo request conversion (if provisioning was triggered from one) ────
  // Non-fatal: the tenant is already fully created even if this update fails.
  let demoRequestUpdated = false;
  if (input.demoRequestId) {
    const { error: demoUpdateError } = await db
      .from('demo_requests')
      .update({ status: 'converted', converted_organization_id: orgId, converted_at: nowIso })
      .eq('id', input.demoRequestId);

    if (demoUpdateError) {
      logger.warn('platform-admin.provision.demo_request_update_failed', {
        correlation_id: ctx.correlationId, demo_request_id: input.demoRequestId, error: demoUpdateError.message,
      });
    } else {
      demoRequestUpdated = true;
    }
  }

  // ── Step 9: Failure recovery / run completion ────────────────────────────
  // Checked (unlike the two non-fatal steps above): if this update itself
  // fails, the run row is stuck showing 'running' forever even though
  // provisioning fully succeeded — a monitoring/observability defect, not a
  // provisioning defect, so it's logged but still doesn't fail the request
  // (the tenant is real and complete regardless of whether its own audit
  // row finishes updating).
  const { error: runCompleteError } = await db.from('worker_run_log').update({
    run_status:      'completed',
    completed_at:    new Date().toISOString(),
    duration_ms:     Date.now() - startedAt,
    processed_count: 1,
    success_count:   1,
    metadata: {
      triggered_by:       ctx.actorId,
      demo_request_id:    input.demoRequestId,
      organization_id:    orgId,
      organization_name:  org.name,
      tenant_admin_user_id: userId,
      membership_id:       membershipId,
      admin_email:          input.adminEmail,
      correlation_id:       ctx.correlationId,
      business_setup:       businessSetupSummary,
    },
  }).eq('id', runId);

  if (runCompleteError) {
    logger.warn('platform-admin.provision.run_log_complete_failed', {
      correlation_id: ctx.correlationId, provisioning_run_id: runId, org_id: orgId, error: runCompleteError.message,
    });
  }

  logger.info('platform-admin.provision.complete', {
    correlation_id: ctx.correlationId, org_id: orgId, provisioning_run_id: runId,
  });

  return created(ctx, {
    organization_id:      orgId,
    slug:                 org.slug,
    tenant_admin_user_id: userId,
    membership_id:        membershipId,
    provisioning_run_id:  runId,
    demo_request_updated: demoRequestUpdated,
    business_setup:       businessSetupSummary,
  });
}

// ─── Handlers — Demo Request Rejection / Deletion ─────────────────────────────
//
// Reject is the missing counterpart to Convert to Customer — a platform
// admin declining a request needs a real reason (for their own records and,
// per the Product Owner's explicit request, so the prospect is told
// something actionable) rather than just flipping status to 'declined' with
// no trace of why. Requires an Edge Function (not the plain client-side
// table update every other demo-request field uses) because sending the
// rejection email needs the service-role Resend credential, same reasoning
// as every other server-only action in this file.

const REJECTION_REASONS = [
  'duplicate_email', 'duplicate_request', 'spam_or_fraud', 'incomplete_invalid_info',
  'not_target_market', 'unable_to_verify_business', 'outside_service_area', 'other',
] as const;
type RejectionReason = typeof REJECTION_REASONS[number];

const REJECTION_EMAIL_COPY: Record<RejectionReason, { subject: string; body: (schoolName: string, description: string) => string }> = {
  duplicate_email: {
    subject: 'Angående er registrering hos Trafikcloud',
    body: (schoolName, description) => `
      <p>Hej,</p>
      <p>Tack för ert intresse för Trafikcloud på uppdrag av <strong>${schoolName}</strong>.</p>
      <p>Vi kan tyvärr inte gå vidare med den här förfrågan — e-postadressen är redan registrerad hos en annan trafikskola på plattformen.</p>
      <p>Om detta är fel, eller om ni vill registrera en ny, fristående trafikskola: skicka gärna in en ny förfrågan med en annan e-postadress, så hjälper vi er vidare.</p>
      ${description ? `<p>${description}</p>` : ''}
      <p>Har ni frågor är ni varmt välkomna att höra av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    `,
  },
  duplicate_request: {
    subject: 'Angående er registrering hos Trafikcloud',
    body: (schoolName, description) => `
      <p>Hej,</p>
      <p>Tack för ert intresse för Trafikcloud på uppdrag av <strong>${schoolName}</strong>.</p>
      <p>Vi ser att vi redan har en tidigare förfrågan från er — vi hör av oss om den istället för att hantera denna som en ny.</p>
      ${description ? `<p>${description}</p>` : ''}
      <p>Har ni frågor är ni varmt välkomna att höra av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    `,
  },
  spam_or_fraud: {
    subject: 'Angående er registrering hos Trafikcloud',
    body: (schoolName) => `
      <p>Hej,</p>
      <p>Vi kan tyvärr inte gå vidare med registreringen för ${schoolName}.</p>
      <p>Har ni frågor är ni varmt välkomna att höra av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    `,
  },
  incomplete_invalid_info: {
    subject: 'Vi behöver mer information om er trafikskola',
    body: (schoolName, description) => `
      <p>Hej,</p>
      <p>Tack för ert intresse för Trafikcloud på uppdrag av <strong>${schoolName}</strong>.</p>
      <p>Vi kunde tyvärr inte gå vidare med uppgifterna i er förfrågan.</p>
      ${description ? `<p>${description}</p>` : ''}
      <p>Skicka gärna in en ny förfrågan med kompletta uppgifter, så hjälper vi er vidare.</p>
      <p>Har ni frågor är ni varmt välkomna att höra av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    `,
  },
  not_target_market: {
    subject: 'Angående er registrering hos Trafikcloud',
    body: (schoolName, description) => `
      <p>Hej,</p>
      <p>Tack för ert intresse för Trafikcloud på uppdrag av <strong>${schoolName}</strong>.</p>
      <p>Trafikcloud är byggt specifikt för svenska trafikskolor, och vi kan tyvärr inte gå vidare med er förfrågan just nu.</p>
      ${description ? `<p>${description}</p>` : ''}
      <p>Har ni frågor är ni varmt välkomna att höra av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    `,
  },
  unable_to_verify_business: {
    subject: 'Vi behöver mer information om er trafikskola',
    body: (schoolName, description) => `
      <p>Hej,</p>
      <p>Tack för ert intresse för Trafikcloud på uppdrag av <strong>${schoolName}</strong>.</p>
      <p>Vi kunde tyvärr inte verifiera verksamheten utifrån uppgifterna i er förfrågan.</p>
      ${description ? `<p>${description}</p>` : ''}
      <p>Skicka gärna in en ny förfrågan, eller kontakta oss direkt på <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a> så hjälper vi er vidare.</p>
    `,
  },
  outside_service_area: {
    subject: 'Angående er registrering hos Trafikcloud',
    body: (schoolName, description) => `
      <p>Hej,</p>
      <p>Tack för ert intresse för Trafikcloud på uppdrag av <strong>${schoolName}</strong>.</p>
      <p>Vi kan tyvärr inte gå vidare med er förfrågan just nu.</p>
      ${description ? `<p>${description}</p>` : ''}
      <p>Har ni frågor är ni varmt välkomna att höra av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    `,
  },
  other: {
    subject: 'Angående er registrering hos Trafikcloud',
    body: (schoolName, description) => `
      <p>Hej,</p>
      <p>Tack för ert intresse för Trafikcloud på uppdrag av <strong>${schoolName}</strong>.</p>
      <p>Vi kan tyvärr inte gå vidare med er förfrågan.</p>
      ${description ? `<p>${description}</p>` : ''}
      <p>Har ni frågor är ni varmt välkomna att höra av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    `,
  },
};

async function handleRejectDemoRequest(ctx: EdgeRequestContext, demoId: string, rawBody: unknown): Promise<Response> {
  const db = createServiceClient();

  const body = (rawBody ?? {}) as { reason?: unknown; description?: unknown };
  const reason = typeof body.reason === 'string' ? body.reason : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!REJECTION_REASONS.includes(reason as RejectionReason)) {
    return badRequest(ctx, `reason must be one of: ${REJECTION_REASONS.join(', ')}`);
  }
  if (reason === 'other' && description.length === 0) {
    return badRequest(ctx, 'A description is required when reason is "other"');
  }

  const { data: request, error: fetchErr } = await db
    .from('demo_requests')
    .select('id, school_name, email, converted_organization_id, status')
    .eq('id', demoId)
    .maybeSingle();

  if (fetchErr || !request) return notFound(ctx);
  if (request.converted_organization_id) {
    return badRequest(ctx, 'This request has already been converted to a customer and cannot be rejected');
  }

  const { error: updateErr } = await db
    .from('demo_requests')
    .update({
      status: 'declined',
      rejection_reason:      reason,
      rejection_description: description || null,
      rejected_at: new Date().toISOString(),
      rejected_by: ctx.actorId,
    })
    .eq('id', demoId);

  if (updateErr) {
    logger.error('platform-admin.demo_request.reject_failed', { correlation_id: ctx.correlationId, demo_request_id: demoId, error: updateErr.message });
    return internalError(ctx, 'Failed to reject demo request');
  }

  // Best-effort — never fail the reject action over email delivery, matching
  // demo-requests/index.ts's own welcome-email pattern.
  let emailSent = false;
  try {
    const copy = REJECTION_EMAIL_COPY[reason as RejectionReason];
    const result = await dispatchMessage({
      channel: 'email', provider: 'resend', to: request.email, from: 'Trafikcloud <info@trafikcloud.se>',
      subject: copy.subject,
      body: copy.body(request.school_name, description),
    });
    emailSent = result.status === 'sent';
    if (!emailSent) {
      logger.warn('platform-admin.demo_request.reject_email_failed', { correlation_id: ctx.correlationId, demo_request_id: demoId, error: result.error });
    }
  } catch (err) {
    logger.warn('platform-admin.demo_request.reject_email_exception', { correlation_id: ctx.correlationId, demo_request_id: demoId, error: err instanceof Error ? err.message : String(err) });
  }

  logger.info('platform-admin.demo_request.rejected', { correlation_id: ctx.correlationId, demo_request_id: demoId, reason, actor_id: ctx.actorId, email_sent: emailSent });

  return ok(ctx, { id: demoId, status: 'declined', rejection_reason: reason, email_sent: emailSent });
}

async function handleDeleteDemoRequest(ctx: EdgeRequestContext, demoId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: request } = await db
    .from('demo_requests')
    .select('id, converted_organization_id')
    .eq('id', demoId)
    .maybeSingle();

  if (!request) return notFound(ctx);
  if (request.converted_organization_id) {
    return badRequest(ctx, 'This request has already been converted to a customer and cannot be deleted');
  }

  // Hard delete, by design — demo_requests has no RLS delete policy (service
  // role only), and a rejected/spam lead has no downstream records depending
  // on it (unlike an organization, which always gets a soft delete instead).
  const { error } = await db.from('demo_requests').delete().eq('id', demoId);
  if (error) {
    logger.error('platform-admin.demo_request.delete_failed', { correlation_id: ctx.correlationId, demo_request_id: demoId, error: error.message });
    return internalError(ctx, 'Failed to delete demo request');
  }

  logger.info('platform-admin.demo_request.deleted', { correlation_id: ctx.correlationId, demo_request_id: demoId, actor_id: ctx.actorId });
  return ok(ctx, { id: demoId, deleted: true });
}

// ─── Handlers — Trial Requests (pre/post-provisioning lifecycle control) ────
//
// tenant_trial_sessions / tenant_trial_events (migrations 20260807215630,
// 20260808174906, 20260808180915) — full lifecycle documented in
// trial-signup/index.ts's own header comment. Platform Admin's real control
// window is everything before a session reaches 'provisioning' — no
// organization, tenant user, or external integration exists before then, so
// Reject/Cancel/Expire/Delete here are always safe, cheap operations. Once a
// session reaches 'active' (a real organization now exists), the existing
// Organisationer page's Suspend/Terminate/Extend Trial/Delete — already
// built, already correctly enforced via get_user_jwt_claims' `o.status =
// 'active'` join — is the right tool, not duplicated here.

const TRIAL_TERMINAL_STATUSES = ['active', 'rejected', 'cancelled', 'expired'];

async function handleListTrialRequests(ctx: EdgeRequestContext, url: URL): Promise<Response> {
  const db = createServiceClient();
  const statusFilter = url.searchParams.get('status');

  let q = db.from('tenant_trial_sessions')
    .select('id, token, email, driving_school_name, organization_id, admin_user_id, status, expires_at, email_verified_at, completed_at, rejected_at, rejection_reason, cancelled_at, cancellation_reason, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (statusFilter) q = q.eq('status', statusFilter);

  const { data, error } = await q;
  if (error) {
    logger.error('platform-admin.trial_requests.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to list trial requests');
  }
  return ok(ctx, data ?? []);
}

async function handleTrialRequestDetail(ctx: EdgeRequestContext, id: string): Promise<Response> {
  const db = createServiceClient();
  const { data: session, error } = await db.from('tenant_trial_sessions').select('*').eq('id', id).maybeSingle();
  if (error || !session) return notFound(ctx);

  const { data: events } = await db.from('tenant_trial_events').select('*').eq('session_id', id).order('created_at', { ascending: true });
  return ok(ctx, { session, events: events ?? [] });
}

// Statuses a trial request must be in for approval to make sense — a
// completed questionnaire waiting for review, or a previously-failed
// provisioning attempt: either the applicant corrected and resubmitted
// (lands back on questionnaire_completed via POST /:token/complete), or
// Platform Admin wants to immediately retry a run that failed for a
// transient/platform reason with no answers to fix.
const TRIAL_APPROVABLE_STATUSES = ['questionnaire_completed', 'provisioning_failed'];

async function handleApproveTrialRequest(ctx: EdgeRequestContext, id: string): Promise<Response> {
  const db = createServiceClient();
  const { data: session, error: fetchErr } = await db.from('tenant_trial_sessions')
    .select('id, email, driving_school_name, status, interview_answers').eq('id', id).maybeSingle();
  if (fetchErr || !session) return notFound(ctx);
  if (!TRIAL_APPROVABLE_STATUSES.includes(session.status)) {
    return badRequest(ctx, `This request is ${session.status} and cannot be approved — it must be questionnaire_completed (submitted, awaiting review).`);
  }

  await logTrialEvent(db, {
    sessionId: id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'approved', actorType: 'admin', actorId: ctx.actorId, actorEmail: ctx.actorEmail,
  });
  await db.from('tenant_trial_sessions').update({ status: 'approved' }).eq('id', id);
  logger.info('platform-admin.trial_requests.approved', { correlation_id: ctx.correlationId, id, actor_id: ctx.actorId });

  const result = await provisionTrialOrganization(db, session, ctx.correlationId);
  if (!result.ok) {
    logger.error('platform-admin.trial_requests.provisioning_failed', { correlation_id: ctx.correlationId, id, code: result.code, error: result.message });
    return new Response(
      JSON.stringify({ code: result.code, message: result.message, trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
      { status: result.status, headers: jsonHeaders(ctx) },
    );
  }

  logger.info('platform-admin.trial_requests.provisioned', { correlation_id: ctx.correlationId, id, organization_id: result.organizationId });
  return ok(ctx, {
    id, status: 'active', organization_id: result.organizationId,
    lesson_types_created: result.lessonTypesCreated, package_templates_created: result.packageTemplatesCreated,
    branch_created: result.branchCreated, priced_lesson_types: result.pricedLessonTypes,
    vehicles_created: result.vehiclesCreated, instructors_created: result.instructorsCreated,
    staff_invited: result.staffInvited, additional_branches_created: result.additionalBranchesCreated,
    slots_generated: result.slotsGenerated, provisioning_warnings: result.provisioningWarnings,
  });
}

async function handleRejectTrialRequest(ctx: EdgeRequestContext, id: string, rawBody: unknown): Promise<Response> {
  const db = createServiceClient();
  const body = (rawBody ?? {}) as { reason?: unknown; description?: unknown };
  const reason = typeof body.reason === 'string' ? body.reason : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!REJECTION_REASONS.includes(reason as RejectionReason)) {
    return badRequest(ctx, `reason must be one of: ${REJECTION_REASONS.join(', ')}`);
  }
  if (reason === 'other' && description.length === 0) {
    return badRequest(ctx, 'A description is required when reason is "other"');
  }

  const { data: session, error: fetchErr } = await db.from('tenant_trial_sessions').select('id, email, driving_school_name, status').eq('id', id).maybeSingle();
  if (fetchErr || !session) return notFound(ctx);
  if (TRIAL_TERMINAL_STATUSES.includes(session.status)) {
    return badRequest(ctx, `This request is already ${session.status} and cannot be rejected`);
  }

  const { error: updateErr } = await db.from('tenant_trial_sessions').update({
    status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: ctx.actorId, rejection_reason: reason,
  }).eq('id', id);
  if (updateErr) {
    logger.error('platform-admin.trial_requests.reject_failed', { correlation_id: ctx.correlationId, id, error: updateErr.message });
    return internalError(ctx, 'Failed to reject trial request');
  }
  await logTrialEvent(db, {
    sessionId: id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'rejected', actorType: 'admin', actorId: ctx.actorId, actorEmail: ctx.actorEmail,
    metadata: { reason, description },
  });

  let emailSent = false;
  try {
    const result = await dispatchMessage({
      channel: 'email', provider: 'resend', to: session.email, from: 'Trafikcloud <info@trafikcloud.se>',
      subject: 'Angående er registrering hos Trafikcloud',
      body: `
        <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
          <p style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Trafikcloud</p>
          <h2 style="font-size: 18px; margin-top: 24px;">Angående er registrering</h2>
          <p>Hej,</p>
          <p>Tack för ert intresse för Trafikcloud på uppdrag av <strong>${session.driving_school_name}</strong>. Vi kan tyvärr inte gå vidare med den här förfrågan just nu.</p>
          ${description ? `<p>${description}</p>` : ''}
          <p>Har ni frågor är ni varmt välkomna att höra av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
        </div>`,
    });
    emailSent = result.status === 'sent';
  } catch (err) {
    logger.warn('platform-admin.trial_requests.reject_email_exception', { correlation_id: ctx.correlationId, id, error: err instanceof Error ? err.message : String(err) });
  }

  logger.info('platform-admin.trial_requests.rejected', { correlation_id: ctx.correlationId, id, reason, actor_id: ctx.actorId, email_sent: emailSent });
  return ok(ctx, { id, status: 'rejected' });
}

async function handleCancelTrialRequest(ctx: EdgeRequestContext, id: string, rawBody: unknown): Promise<Response> {
  const db = createServiceClient();
  const body = (rawBody ?? {}) as { reason?: unknown };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  const { data: session, error: fetchErr } = await db.from('tenant_trial_sessions').select('id, email, driving_school_name, status, organization_id').eq('id', id).maybeSingle();
  if (fetchErr || !session) return notFound(ctx);
  if (['rejected', 'cancelled', 'expired'].includes(session.status)) {
    return badRequest(ctx, `This request is already ${session.status}`);
  }
  if (session.status === 'active' && session.organization_id) {
    return badRequest(ctx, 'This trial has already been provisioned — use Suspend/Terminate on the organization instead (Organisationer).');
  }

  const { error: updateErr } = await db.from('tenant_trial_sessions').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: ctx.actorId, cancellation_reason: reason || null,
  }).eq('id', id);
  if (updateErr) {
    logger.error('platform-admin.trial_requests.cancel_failed', { correlation_id: ctx.correlationId, id, error: updateErr.message });
    return internalError(ctx, 'Failed to cancel trial request');
  }
  await logTrialEvent(db, {
    sessionId: id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'cancelled', actorType: 'admin', actorId: ctx.actorId, actorEmail: ctx.actorEmail,
    metadata: { reason },
  });

  logger.info('platform-admin.trial_requests.cancelled', { correlation_id: ctx.correlationId, id, actor_id: ctx.actorId });
  return ok(ctx, { id, status: 'cancelled' });
}

async function handleExpireTrialRequest(ctx: EdgeRequestContext, id: string): Promise<Response> {
  const db = createServiceClient();
  const { data: session, error: fetchErr } = await db.from('tenant_trial_sessions').select('id, email, driving_school_name, status').eq('id', id).maybeSingle();
  if (fetchErr || !session) return notFound(ctx);
  if (TRIAL_TERMINAL_STATUSES.includes(session.status)) {
    return badRequest(ctx, `This request is already ${session.status}`);
  }

  const { error: updateErr } = await db.from('tenant_trial_sessions').update({ status: 'expired' }).eq('id', id);
  if (updateErr) {
    logger.error('platform-admin.trial_requests.expire_failed', { correlation_id: ctx.correlationId, id, error: updateErr.message });
    return internalError(ctx, 'Failed to expire trial request');
  }
  await logTrialEvent(db, {
    sessionId: id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'expired', actorType: 'admin', actorId: ctx.actorId, actorEmail: ctx.actorEmail,
  });

  logger.info('platform-admin.trial_requests.expired', { correlation_id: ctx.correlationId, id, actor_id: ctx.actorId });
  return ok(ctx, { id, status: 'expired' });
}

async function handleDeleteTrialRequest(ctx: EdgeRequestContext, id: string): Promise<Response> {
  const db = createServiceClient();
  const { data: session } = await db.from('tenant_trial_sessions').select('id, email, driving_school_name').eq('id', id).maybeSingle();
  if (!session) return notFound(ctx);

  // tenant_trial_events.session_id is ON DELETE SET NULL — the audit trail
  // survives this delete (email/driving_school_name are denormalized onto
  // each event row for exactly this reason — "preserve the audit record").
  await logTrialEvent(db, {
    sessionId: id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'deleted', actorType: 'admin', actorId: ctx.actorId, actorEmail: ctx.actorEmail,
  });

  const { error } = await db.from('tenant_trial_sessions').delete().eq('id', id);
  if (error) {
    logger.error('platform-admin.trial_requests.delete_failed', { correlation_id: ctx.correlationId, id, error: error.message });
    return internalError(ctx, 'Failed to delete trial request');
  }

  logger.info('platform-admin.trial_requests.deleted', { correlation_id: ctx.correlationId, id, actor_id: ctx.actorId });
  return ok(ctx, { id, deleted: true });
}

async function handleResendTrialVerification(ctx: EdgeRequestContext, id: string): Promise<Response> {
  const db = createServiceClient();
  const { data: session } = await db.from('tenant_trial_sessions').select('id, token, email, driving_school_name, status, email_verified_at').eq('id', id).maybeSingle();
  if (!session) return notFound(ctx);
  if (session.email_verified_at) return badRequest(ctx, 'This email is already verified');
  if (TRIAL_TERMINAL_STATUSES.includes(session.status)) return badRequest(ctx, `This request is ${session.status} and cannot be resent`);

  const functionsUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const verifyUrl = `${functionsUrl}/functions/v1/trial-signup/${session.token}/verify-email`;

  let sent = false;
  try {
    const result = await dispatchMessage({
      channel: 'email', provider: 'resend', to: session.email, from: 'Trafikcloud <info@trafikcloud.se>',
      subject: 'Bekräfta din e-postadress – Trafikcloud',
      body: verifyEmailHtml(session.driving_school_name, verifyUrl),
    });
    sent = result.status === 'sent';
  } catch (err) {
    logger.warn('platform-admin.trial_requests.resend_verification_exception', { correlation_id: ctx.correlationId, id, error: err instanceof Error ? err.message : String(err) });
  }
  await logTrialEvent(db, {
    sessionId: id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'verification_email_resent', actorType: 'admin', actorId: ctx.actorId, actorEmail: ctx.actorEmail, metadata: { sent },
  });

  logger.info('platform-admin.trial_requests.verification_resent', { correlation_id: ctx.correlationId, id, actor_id: ctx.actorId, sent });
  return ok(ctx, { id, sent });
}

async function handleResendTrialQuestionnaire(ctx: EdgeRequestContext, id: string): Promise<Response> {
  const db = createServiceClient();
  const { data: session } = await db.from('tenant_trial_sessions').select('id, token, email, driving_school_name, status, email_verified_at').eq('id', id).maybeSingle();
  if (!session) return notFound(ctx);
  if (!session.email_verified_at) return badRequest(ctx, 'This email has not been verified yet — resend the verification email instead');
  if (TRIAL_TERMINAL_STATUSES.includes(session.status)) return badRequest(ctx, `This request is ${session.status} and cannot be resent`);

  const setupUrl = `${getAppOrigin()}/onboarding/${session.token}`;

  let sent = false;
  try {
    const result = await dispatchMessage({
      channel: 'email', provider: 'resend', to: session.email, from: 'Trafikcloud <info@trafikcloud.se>',
      subject: 'Berätta om er verksamhet – Trafikcloud',
      body: questionnaireEmailHtml(session.driving_school_name, setupUrl),
    });
    sent = result.status === 'sent';
  } catch (err) {
    logger.warn('platform-admin.trial_requests.resend_questionnaire_exception', { correlation_id: ctx.correlationId, id, error: err instanceof Error ? err.message : String(err) });
  }
  await logTrialEvent(db, {
    sessionId: id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'questionnaire_email_resent', actorType: 'admin', actorId: ctx.actorId, actorEmail: ctx.actorEmail, metadata: { sent },
  });

  logger.info('platform-admin.trial_requests.questionnaire_resent', { correlation_id: ctx.correlationId, id, actor_id: ctx.actorId, sent });
  return ok(ctx, { id, sent });
}

// ─── Handlers — Organization Administrator Management ────────────────────────
//
// Organization Administration Capability Review, Stage 1. Reuses
// handleProvision's own patterns directly rather than inventing new ones:
// Admin-API user creation with compensating rollback (Invite Administrator
// mirrors provisioning's step 5 exactly, minus the organization-creation
// steps, since the org already exists); the org_owner/org_admin/org_manager
// role-lookup pattern; audit trail is free (memberships/membership_roles
// already carry audit_trigger_fn() at the table level, same as provisioning).
//
// "Administrator" is scoped identically to get_platform_org_admins: exactly
// the three system roles org_owner/org_admin/org_manager. Disable/Reactivate
// operates on the membership itself (memberships.status), not the role
// assignment — this fully revokes the person's access to the org, mirroring
// exactly how organization-level Suspend/Reactivate already works, just one
// level down. A membership is never set to 'removed' by this capability —
// only 'active' ⇄ 'suspended', consistent with "Disable / Reactivate" (not
// "Remove") being the requested capability.

const ADMIN_ROLE_NAMES = ['org_owner', 'org_admin', 'org_manager'] as const;
type AdminRoleName = (typeof ADMIN_ROLE_NAMES)[number];

function isAdminRoleName(value: unknown): value is AdminRoleName {
  return typeof value === 'string' && (ADMIN_ROLE_NAMES as readonly string[]).includes(value);
}

async function lookupOrgExists(db: ReturnType<typeof createServiceClient>, orgId: string): Promise<boolean> {
  const { data } = await db.from('organizations').select('id').eq('id', orgId).is('deleted_at', null).maybeSingle();
  return Boolean(data);
}

async function lookupRoleId(db: ReturnType<typeof createServiceClient>, roleName: AdminRoleName): Promise<string | null> {
  const { data } = await db.from('roles').select('id').eq('name', roleName).eq('is_system_role', true).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// Fetches all three admin-tier role ids in one query — used whenever a
// handler needs to deactivate "whichever admin-tier role this membership
// currently holds" without knowing in advance which of the three it is.
async function lookupAdminRoleIds(db: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const { data } = await db.from('roles').select('id').in('name', ADMIN_ROLE_NAMES as unknown as string[]);
  return (data ?? []).map((r: { id: string }) => r.id);
}

// Counts OTHER active administrators for the org (excluding the given
// membership id) — the safety guard behind Disable Administrator: an org
// must never be left with zero people who can manage it.
async function countOtherActiveAdmins(
  db: ReturnType<typeof createServiceClient>, orgId: string, excludingMembershipId: string,
): Promise<number> {
  const { count } = await db
    .from('membership_roles')
    .select('id, memberships!inner(id, status, organization_id), roles!inner(name)', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('memberships.organization_id', orgId)
    .eq('memberships.status', 'active')
    .neq('membership_id', excludingMembershipId)
    .in('roles.name', ADMIN_ROLE_NAMES as unknown as string[]);
  return count ?? 0;
}

// ─── Invite Administrator ─────────────────────────────────────────────────────

interface InviteAdminInput {
  firstName: string;
  lastName:  string;
  email:     string;
  role:      AdminRoleName;
}

function validateInviteAdminBody(body: unknown): { ok: true; value: InviteAdminInput } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;
  const firstName = typeof b.first_name === 'string' ? b.first_name.trim() : '';
  const lastName  = typeof b.last_name  === 'string' ? b.last_name.trim()  : '';
  const email     = typeof b.email      === 'string' ? b.email.trim().toLowerCase() : '';
  const role      = typeof b.role === 'string' ? b.role : 'org_admin';

  if (firstName.length < 1 || firstName.length > 100) return { ok: false, message: 'first_name is required (max 100 characters)' };
  if (lastName.length  < 1 || lastName.length  > 100) return { ok: false, message: 'last_name is required (max 100 characters)' };
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'email must be a valid email address' };
  if (!isAdminRoleName(role)) return { ok: false, message: `role must be one of: ${ADMIN_ROLE_NAMES.join(', ')}` };

  return { ok: true, value: { firstName, lastName, email, role } };
}

async function handleInviteAdmin(ctx: EdgeRequestContext, orgId: string, rawBody: unknown): Promise<Response> {
  const validation = validateInviteAdminBody(rawBody);
  if (!validation.ok) return badRequest(ctx, validation.message);
  const input = validation.value;

  const db = createServiceClient();

  if (!(await lookupOrgExists(db, orgId))) return notFound(ctx);

  // Platform Entitlement Service pre-check — same policy the enforce_max_users
  // trigger applies at insert time (ADR-004: the trigger is the atomic
  // backstop, this is the policy layer). Checking here, before creating an
  // auth user + profile, avoids doing both just to roll them back when the
  // org is already at its seat limit.
  const seatEntitlement = await getSeatEntitlement(db, orgId);
  if (!seatEntitlement.allowed) {
    return badRequest(ctx, 'This organization has reached its administrator/member seat limit (max_users). Increase the limit or remove an existing member before inviting another.');
  }

  const roleId = await lookupRoleId(db, input.role);
  if (!roleId) {
    logger.error('platform-admin.invite-admin.role_missing', { correlation_id: ctx.correlationId, role: input.role });
    return internalError(ctx, 'Platform configuration error: role not found');
  }

  // Same compensating-rollback shape as handleProvision, scoped down to the
  // three steps that apply here (no organization to create or roll back).
  async function rollback(opts: { userId?: string; membershipId?: string }): Promise<void> {
    if (opts.membershipId) {
      await db.from('membership_roles').delete().eq('membership_id', opts.membershipId);
      await db.from('memberships').delete().eq('id', opts.membershipId);
    }
    if (opts.userId) await db.auth.admin.deleteUser(opts.userId);
  }

  // Real Supabase Auth invitation, same mechanism and rationale as
  // handleProvision's Step 5 — no hidden, never-delivered password.
  const origin = getAppOrigin();
  const { data: authData, error: authError } = await db.auth.admin.inviteUserByEmail(input.email, {
    data:       { first_name: input.firstName, last_name: input.lastName },
    redirectTo: `${origin}/auth/accept-invite`,
  });
  if (authError || !authData.user) {
    logger.error('platform-admin.invite-admin.auth_user_failed', { correlation_id: ctx.correlationId, error: authError?.message });
    const isDuplicate = (authError?.message ?? '').toLowerCase().includes('already');
    return isDuplicate
      ? badRequest(ctx, `An account with email ${input.email} already exists`)
      : internalError(ctx, 'Failed to create administrator account');
  }
  const userId = authData.user.id;

  const nowIso = new Date().toISOString();
  const { error: profileError } = await db.from('profiles').upsert({
    id: userId, first_name: input.firstName, last_name: input.lastName, email: input.email,
    is_active: true, onboarded_at: nowIso,
  }, { onConflict: 'id' });
  if (profileError) {
    logger.error('platform-admin.invite-admin.profile_failed', { correlation_id: ctx.correlationId, error: profileError.message });
    await rollback({ userId });
    return internalError(ctx, 'Failed to create administrator profile');
  }

  const { data: membership, error: membershipError } = await db
    .from('memberships')
    .insert({ user_id: userId, organization_id: orgId, status: 'pending', joined_at: nowIso })
    .select('id')
    .single();
  if (membershipError || !membership) {
    logger.error('platform-admin.invite-admin.membership_failed', { correlation_id: ctx.correlationId, error: membershipError?.message });
    await rollback({ userId });
    if ((membershipError?.message ?? '').includes('SEAT_LIMIT_EXCEEDED')) {
      return badRequest(ctx, 'This organization has reached its administrator/member seat limit (max_users). Increase the limit or remove an existing member before inviting another.');
    }
    return internalError(ctx, 'Failed to create membership');
  }
  const membershipId = membership.id as string;

  const { error: roleAssignError } = await db.from('membership_roles').insert({
    membership_id: membershipId, organization_id: orgId, role_id: roleId, is_active: true, assigned_by: ctx.actorId,
  });
  if (roleAssignError) {
    logger.error('platform-admin.invite-admin.role_assign_failed', { correlation_id: ctx.correlationId, error: roleAssignError.message });
    await rollback({ userId, membershipId });
    return internalError(ctx, 'Failed to assign role');
  }

  await recordIdentityEvent({
    eventType: 'invite.created', provider: 'password', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { invited_email: input.email, role: input.role, source: 'platform-admin/orgs/admins' },
  });

  // Kept for the org timeline (get_platform_org_timeline reads these rows
  // directly, regardless of whether an email-worker ever processes them —
  // the real email now goes out via inviteUserByEmail above).
  const { data: org } = await db.from('organizations').select('name').eq('id', orgId).maybeSingle();
  const { error: outboxError } = await db.rpc('insert_outbox_event', {
    p_event_type: 'org.admin_invited',
    p_channel: 'email',
    p_organization_id: orgId,
    p_target_id: input.email,
    p_payload: {
      organization_id: orgId, organization_name: org?.name ?? null,
      admin_email: input.email, admin_first_name: input.firstName, admin_last_name: input.lastName, role: input.role,
    },
    p_metadata: { source: 'platform-admin/orgs/admins', correlation_id: ctx.correlationId },
  });
  if (outboxError) {
    logger.warn('platform-admin.invite-admin.outbox_failed', { correlation_id: ctx.correlationId, error: outboxError.message });
  }

  logger.info('platform-admin.invite-admin.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId, role: input.role });

  return created(ctx, { user_id: userId, membership_id: membershipId, role: input.role });
}

// ─── Change Administrator Role ────────────────────────────────────────────────

async function handleChangeAdminRole(ctx: EdgeRequestContext, orgId: string, userId: string, rawBody: unknown): Promise<Response> {
  const body = (typeof rawBody === 'object' && rawBody !== null) ? rawBody as Record<string, unknown> : {};
  const targetRole = body.role;
  if (!isAdminRoleName(targetRole)) return badRequest(ctx, `role must be one of: ${ADMIN_ROLE_NAMES.join(', ')}`);

  const db = createServiceClient();

  const { data: membership } = await db
    .from('memberships').select('id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);
  const membershipId = membership.id as string;

  const roleId = await lookupRoleId(db, targetRole);
  if (!roleId) return internalError(ctx, 'Platform configuration error: role not found');

  // Guard: changing the sole remaining org_owner away from org_owner would
  // leave the organization with no owner. Transfer Ownership is the correct
  // path for that — it demotes the previous owner atomically instead of
  // stranding the org.
  if (targetRole !== 'org_owner') {
    const ownerRoleId = await lookupRoleId(db, 'org_owner');
    const { data: currentlyOwner } = await db
      .from('membership_roles').select('id').eq('membership_id', membershipId).eq('role_id', ownerRoleId).eq('is_active', true).maybeSingle();
    if (currentlyOwner) {
      const { count: otherOwnerCount } = await db
        .from('membership_roles')
        .select('id, memberships!inner(organization_id, status)', { count: 'exact', head: true })
        .eq('is_active', true).eq('role_id', ownerRoleId)
        .eq('memberships.organization_id', orgId).eq('memberships.status', 'active')
        .neq('membership_id', membershipId);
      if ((otherOwnerCount ?? 0) === 0) {
        return badRequest(ctx, 'Cannot change the role of the only remaining owner — use Transfer Ownership instead');
      }
    }
  }

  const adminRoleIds = await lookupAdminRoleIds(db);
  const { error: deactivateError } = await db
    .from('membership_roles')
    .update({ is_active: false })
    .eq('membership_id', membershipId)
    .eq('is_active', true)
    .in('role_id', adminRoleIds);
  if (deactivateError) {
    logger.error('platform-admin.change-role.deactivate_failed', { correlation_id: ctx.correlationId, error: deactivateError.message });
    return internalError(ctx, 'Failed to change role');
  }

  const { error: insertError } = await db.from('membership_roles').insert({
    membership_id: membershipId, organization_id: orgId, role_id: roleId, is_active: true, assigned_by: ctx.actorId,
  });
  if (insertError) {
    logger.error('platform-admin.change-role.insert_failed', { correlation_id: ctx.correlationId, error: insertError.message });
    return internalError(ctx, 'Failed to change role');
  }

  logger.info('platform-admin.change-role.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId, role: targetRole });
  return ok(ctx, { user_id: userId, role: targetRole });
}

// ─── Disable / Reactivate Administrator ───────────────────────────────────────

async function handleDisableAdmin(ctx: EdgeRequestContext, orgId: string, userId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: membership } = await db
    .from('memberships').select('id, status').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);
  const membershipId = membership.id as string;

  if (membership.status === 'active') {
    const remaining = await countOtherActiveAdmins(db, orgId, membershipId);
    if (remaining === 0) return badRequest(ctx, 'Cannot disable the only remaining administrator');
  }

  const { error } = await db.from('memberships').update({
    status: 'suspended', suspended_at: new Date().toISOString(), suspended_by: ctx.actorId,
  }).eq('id', membershipId);
  if (error) {
    logger.error('platform-admin.disable-admin.failed', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to disable administrator');
  }

  logger.info('platform-admin.disable-admin.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return ok(ctx, { user_id: userId, membership_status: 'suspended' });
}

async function handleReactivateAdmin(ctx: EdgeRequestContext, orgId: string, userId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: membership } = await db
    .from('memberships').select('id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);

  // suspended_at must be cleared alongside status — memberships_suspended_check
  // requires suspended_at IS NULL whenever status != 'suspended'.
  const { error } = await db.from('memberships').update({
    status: 'active', suspended_at: null, suspended_by: null,
  }).eq('id', membership.id as string);
  if (error) {
    logger.error('platform-admin.reactivate-admin.failed', { correlation_id: ctx.correlationId, error: error.message });
    return internalError(ctx, 'Failed to reactivate administrator');
  }

  logger.info('platform-admin.reactivate-admin.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return ok(ctx, { user_id: userId, membership_status: 'active' });
}

// ─── Transfer Organization Ownership ──────────────────────────────────────────
//
// Exactly one org_owner at all times: the previous owner(s) are demoted to
// org_admin (never stranded without any admin access), the target is
// promoted to org_owner. Target must already be an active member of the org
// — this transfers ownership between existing people, it does not invite a
// new one (Invite Administrator is the separate, correct path for that).

async function handleTransferOwnership(ctx: EdgeRequestContext, orgId: string, userId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: targetMembership } = await db
    .from('memberships').select('id, status').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!targetMembership) return notFound(ctx);
  if (targetMembership.status !== 'active') return badRequest(ctx, 'The target administrator must have an active membership');
  const targetMembershipId = targetMembership.id as string;

  const ownerRoleId = await lookupRoleId(db, 'org_owner');
  const adminRoleId = await lookupRoleId(db, 'org_admin');
  if (!ownerRoleId || !adminRoleId) return internalError(ctx, 'Platform configuration error: role not found');

  // Demote every current active owner (there should be exactly one, but this
  // is written to be correct even if data drift ever produced more than one).
  const { data: currentOwners } = await db
    .from('membership_roles')
    .select('id, membership_id, memberships!inner(organization_id, status)')
    .eq('role_id', ownerRoleId).eq('is_active', true)
    .eq('memberships.organization_id', orgId);

  for (const row of (currentOwners ?? []) as unknown as { id: string; membership_id: string }[]) {
    if (row.membership_id === targetMembershipId) continue; // target already owner — nothing to demote
    await db.from('membership_roles').update({ is_active: false }).eq('id', row.id);
    await db.from('membership_roles').insert({
      membership_id: row.membership_id, organization_id: orgId, role_id: adminRoleId, is_active: true, assigned_by: ctx.actorId,
    });
  }

  // Deactivate the target's own current admin-tier role (if any) and grant org_owner.
  const adminRoleIds = await lookupAdminRoleIds(db);
  await db.from('membership_roles')
    .update({ is_active: false })
    .eq('membership_id', targetMembershipId)
    .eq('is_active', true)
    .neq('role_id', ownerRoleId)
    .in('role_id', adminRoleIds);

  const { data: alreadyOwner } = await db
    .from('membership_roles').select('id').eq('membership_id', targetMembershipId).eq('role_id', ownerRoleId).eq('is_active', true).maybeSingle();

  if (!alreadyOwner) {
    const { error: insertError } = await db.from('membership_roles').insert({
      membership_id: targetMembershipId, organization_id: orgId, role_id: ownerRoleId, is_active: true, assigned_by: ctx.actorId,
    });
    if (insertError) {
      logger.error('platform-admin.transfer-ownership.insert_failed', { correlation_id: ctx.correlationId, error: insertError.message });
      return internalError(ctx, 'Failed to transfer ownership');
    }
  }

  logger.info('platform-admin.transfer-ownership.complete', { correlation_id: ctx.correlationId, org_id: orgId, new_owner_user_id: userId });
  return ok(ctx, { user_id: userId, role: 'org_owner' });
}

// ─── Administrator Invitation Lifecycle (Resend / Cancel) ────────────────────
//
// Organization Administration, Phase 4. Administrators are created via
// auth.admin.inviteUserByEmail (handleProvision / handleInviteAdmin) — a real
// Supabase invite token/link that expires, so Resend genuinely has something
// to reissue. Both actions below are scoped to invitation_status = 'pending'
// only (i.e. last_sign_in_at IS NULL): an administrator who has already
// logged in is no longer "an invitation," they're a real administrator —
// Disable Administrator is the correct action for them, not these two.

// Cancels any not-yet-processed invite/resend outbox events for this target,
// so a future notification worker never dispatches a stale one —
// event_outbox.cancelled_at is the existing safety valve named for exactly
// this purpose (Customer Provisioning & Tenant Onboarding Architecture,
// Section 7, step 7).
async function supersedeInviteEvents(db: ReturnType<typeof createServiceClient>, orgId: string, email: string): Promise<void> {
  await db.from('event_outbox').update({ cancelled_at: new Date().toISOString() })
    .eq('organization_id', orgId).eq('target_id', email)
    .in('event_type', ['tenant.provisioned', 'org.admin_invited', 'org.admin_invitation_resent'])
    .is('cancelled_at', null).is('processed_at', null);
}

async function handleResendInvitation(ctx: EdgeRequestContext, orgId: string, userId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: membership } = await db
    .from('memberships').select('id, status').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);
  // membership.status (not last_sign_in_at) is the authoritative signal: it
  // only leaves 'pending' once activate_membership() runs after a successful
  // password submission — merely opening the invite link already sets
  // last_sign_in_at, so that alone can't distinguish "accepted" from
  // "opened the link and abandoned it".
  if (membership.status !== 'pending') {
    return badRequest(ctx, 'This administrator has already accepted their invitation — use Disable Administrator instead');
  }

  const { data: profile } = await db.from('profiles').select('email, first_name, last_name').eq('id', userId).maybeSingle();
  if (!profile?.email) return internalError(ctx, 'Administrator profile not found');

  // Re-sends a real, working link via Supabase Auth's own recovery mechanism
  // (the pending administrator never had a password to begin with under the
  // inviteUserByEmail-based flow, so there is nothing to rotate) — lands on
  // the existing ResetPasswordPage, which lets them set their first password
  // exactly like AcceptInvitePage does for a first-time invite.
  //
  // resetPasswordForEmail (not admin.generateLink, which only mints a token
  // and never sends mail) is what actually dispatches the email, via the
  // same GoTrue/SMTP path ForgotPasswordPage.tsx's self-service flow already
  // relies on — confirmed live: generateLink left zero trace in Auth/Resend
  // logs despite reporting success, resetPasswordForEmail does not.
  const origin = getAppOrigin();
  const { error: linkError } = await createAnonClient().auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${origin}/auth/reset-password`,
  });
  if (linkError) {
    logger.error('platform-admin.resend-invitation.link_failed', { correlation_id: ctx.correlationId, error: linkError.message });
    return internalError(ctx, 'Failed to resend invitation');
  }

  await recordIdentityEvent({
    eventType: 'invite.resent', provider: 'password', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { email: profile.email, source: 'platform-admin/orgs/admins/resend-invitation' },
  });

  await supersedeInviteEvents(db, orgId, profile.email);

  const { data: org } = await db.from('organizations').select('name').eq('id', orgId).maybeSingle();
  const { error: outboxError } = await db.rpc('insert_outbox_event', {
    p_event_type: 'org.admin_invitation_resent',
    p_channel: 'email',
    p_organization_id: orgId,
    p_target_id: profile.email,
    p_payload: {
      organization_id: orgId, organization_name: org?.name ?? null,
      admin_email: profile.email, admin_first_name: profile.first_name, admin_last_name: profile.last_name,
    },
    p_metadata: { source: 'platform-admin/orgs/admins/resend-invitation', correlation_id: ctx.correlationId },
  });
  if (outboxError) {
    logger.warn('platform-admin.resend-invitation.outbox_failed', { correlation_id: ctx.correlationId, error: outboxError.message });
  }

  logger.info('platform-admin.resend-invitation.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return ok(ctx, { user_id: userId, invitation_status: 'pending' });
}

async function handleCancelInvitation(ctx: EdgeRequestContext, orgId: string, userId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: membership } = await db
    .from('memberships').select('id, status').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);
  const membershipId = membership.id as string;

  // See handleResendInvitation: membership.status, not last_sign_in_at, is
  // the authoritative "not yet activated" signal.
  if (membership.status !== 'pending') {
    return badRequest(ctx, 'This administrator has already accepted their invitation — use Disable Administrator instead');
  }

  // Captured before deletion — profiles cascades away with the auth user
  // (profiles_auth_user_fkey ON DELETE CASCADE), same as handleProvision's
  // rollback already relies on.
  const { data: profile } = await db.from('profiles').select('email, first_name, last_name').eq('id', userId).maybeSingle();

  // Same compensating-rollback shape as handleInviteAdmin/handleProvision —
  // cancelling a never-accepted invitation fully undoes the account it
  // created, it does not merely disable it. Disable Administrator is the
  // correct action for someone with real, already-accepted access.
  await db.from('membership_roles').delete().eq('membership_id', membershipId);
  await db.from('memberships').delete().eq('id', membershipId);
  const { error: deleteUserError } = await db.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    logger.error('platform-admin.cancel-invitation.delete_user_failed', { correlation_id: ctx.correlationId, error: deleteUserError.message });
    return internalError(ctx, 'Failed to cancel invitation');
  }

  if (profile?.email) {
    await supersedeInviteEvents(db, orgId, profile.email);

    const { data: org } = await db.from('organizations').select('name').eq('id', orgId).maybeSingle();
    const { error: outboxError } = await db.rpc('insert_outbox_event', {
      p_event_type: 'org.admin_invitation_cancelled',
      p_channel: 'email',
      p_organization_id: orgId,
      p_target_id: profile.email,
      p_payload: {
        organization_id: orgId, organization_name: org?.name ?? null,
        admin_email: profile.email, admin_first_name: profile.first_name, admin_last_name: profile.last_name,
      },
      p_metadata: { source: 'platform-admin/orgs/admins/cancel-invitation', correlation_id: ctx.correlationId },
    });
    if (outboxError) {
      logger.warn('platform-admin.cancel-invitation.outbox_failed', { correlation_id: ctx.correlationId, error: outboxError.message });
    }
  }

  logger.info('platform-admin.cancel-invitation.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return ok(ctx, { user_id: userId, cancelled: true });
}

// ─── Password Reset (Send / Force) ───────────────────────────────────────────
//
// Both let a Platform Administrator help an administrator regain access
// without ever knowing, typing, or storing that administrator's password —
// "never expose existing passwords" is satisfied structurally, not by
// convention, since neither handler ever reads or sets a password value the
// caller could see. Both use auth.admin.generateLink(type: 'recovery'), the
// same Supabase-native mechanism ForgotPasswordPage.tsx's self-service flow
// uses, landing on the same existing ResetPasswordPage.
//
// Send Password Reset: for an administrator who already has real access and
// simply needs a way back in (forgot their password, locked out, etc.) —
// the platform-admin-initiated equivalent of them clicking "Glömt lösenord"
// themselves. Their current password keeps working until they complete the
// reset.
//
// Force Password Reset: for a security-relevant situation (suspected
// compromise, admin leaving, etc.) where the *current* password must stop
// working immediately, not just whenever the administrator gets around to
// resetting it. Rotates the credential to a throwaway value the platform
// administrator never sees (auth.admin.updateUserById), then sends the same
// recovery link. This also serves as the platform's "change an
// administrator's password" capability — the account's password is changed,
// just never by a human directly typing a new one in, per Supabase Auth
// best practice and the same "never expose existing passwords" constraint.

async function handleSendPasswordReset(ctx: EdgeRequestContext, orgId: string, userId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: membership } = await db
    .from('memberships').select('id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);

  const { data: profile } = await db.from('profiles').select('email').eq('id', userId).maybeSingle();
  if (!profile?.email) return internalError(ctx, 'Administrator profile not found');

  // resetPasswordForEmail actually dispatches the email via GoTrue/SMTP —
  // admin.generateLink only mints a token and never sends mail, see
  // handleResendInvitation above for the same fix rationale.
  const origin = getAppOrigin();
  const { error: linkError } = await createAnonClient().auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${origin}/auth/reset-password`,
  });
  if (linkError) {
    logger.error('platform-admin.send-password-reset.link_failed', { correlation_id: ctx.correlationId, error: linkError.message });
    return internalError(ctx, 'Failed to send password reset');
  }

  await recordIdentityEvent({
    eventType: 'password_reset.sent', provider: 'password', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { email: profile.email, source: 'platform-admin/orgs/admins/send-password-reset' },
  });

  logger.info('platform-admin.send-password-reset.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return ok(ctx, { user_id: userId, password_reset: 'sent' });
}

async function handleForcePasswordReset(ctx: EdgeRequestContext, orgId: string, userId: string): Promise<Response> {
  const db = createServiceClient();

  const { data: membership } = await db
    .from('memberships').select('id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);

  const { data: profile } = await db.from('profiles').select('email').eq('id', userId).maybeSingle();
  if (!profile?.email) return internalError(ctx, 'Administrator profile not found');

  // Invalidate the current password immediately — a throwaway value the
  // platform administrator never sees or stores.
  const throwawayPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { error: pwError } = await db.auth.admin.updateUserById(userId, { password: throwawayPassword });
  if (pwError) {
    logger.error('platform-admin.force-password-reset.rotate_failed', { correlation_id: ctx.correlationId, error: pwError.message });
    return internalError(ctx, 'Failed to force password reset');
  }

  // resetPasswordForEmail actually dispatches the email via GoTrue/SMTP —
  // admin.generateLink only mints a token and never sends mail, see
  // handleResendInvitation above for the same fix rationale.
  const origin = getAppOrigin();
  const { error: linkError } = await createAnonClient().auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${origin}/auth/reset-password`,
  });
  if (linkError) {
    logger.error('platform-admin.force-password-reset.link_failed', { correlation_id: ctx.correlationId, error: linkError.message });
    return internalError(ctx, 'Password was invalidated but the reset email could not be sent — use Send Password Reset to retry');
  }

  await recordIdentityEvent({
    eventType: 'password_reset.forced', provider: 'password', severity: 'warning', userId, organizationId: orgId,
    actorEmail: ctx.actorEmail, correlationId: ctx.correlationId,
    metadata: { email: profile.email, source: 'platform-admin/orgs/admins/force-password-reset' },
  });

  logger.info('platform-admin.force-password-reset.complete', { correlation_id: ctx.correlationId, org_id: orgId, user_id: userId });
  return ok(ctx, { user_id: userId, password_reset: 'forced' });
}

// ─── Handlers — Tenant Onboarding Monitoring + Go Live Approval ─────────────
//
// Implements Customer Provisioning & Tenant Onboarding Architecture, Section
// 10 (Platform Administration Responsibilities) and Section 17 (Go Live
// Definition). Progress computation itself lives in
// _shared/tenant-onboarding-progress.ts, shared with the tenant-facing
// tenant-onboarding Edge Function, so the Go Live Readiness Requirement /
// Recommended Configuration completion logic (Architecture Section 8) has
// exactly one owner rather than two copies.

async function handleTenantOnboardingList(ctx: EdgeRequestContext, url: URL): Promise<Response> {
  const sp     = url.searchParams;
  const limit  = Math.min(parseInt(sp.get('limit')  ?? '25', 10), 100);
  const offset = Math.max(parseInt(sp.get('offset') ?? '0',  10), 0);
  const search = sp.get('search')?.trim() || null;

  const db = createServiceClient();

  // Only provisioned-but-not-live organizations belong on this list — once
  // go_live_at is set, a tenant is Platform Administration's Customer Success
  // concern (Architecture Section 15), not a Tenant Onboarding one.
  let query = db
    .from('organizations')
    .select('id, name, legal_name, org_number, subscription_tier, subscription_status, created_at', { count: 'exact' })
    .is('go_live_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) query = query.ilike('name', `%${search}%`);

  const { data: orgs, error: orgsError, count } = await query;

  if (orgsError) {
    logger.error('platform-admin.tenant-onboarding-list.query_failed', { correlation_id: ctx.correlationId, error: orgsError.message });
    return internalError(ctx, 'Failed to load tenant onboarding list');
  }

  const rows = await Promise.all(
    (orgs ?? []).map(async (org: { id: string; name: string; legal_name: string; org_number: string | null; subscription_tier: string; subscription_status: string; created_at: string }) => {
      const progress = await computeOnboardingProgress(db, org.id);
      const requirementSteps = progress?.steps.filter((s) => s.category === 'go_live_requirement') ?? [];
      const recommendedSteps = progress?.steps.filter((s) => s.category === 'recommended_configuration') ?? [];
      return {
        ...org,
        // Ratio reflects only what actually gates Go Live (Architecture
        // Section 8.1) — Recommended Configuration items (8.2) are reported
        // separately so a "6/6" row unambiguously means ready.
        completed_requirements: requirementSteps.filter((s) => s.status === 'completed').length,
        total_requirements:     requirementSteps.length,
        completed_recommended:  recommendedSteps.filter((s) => s.status === 'completed').length,
        total_recommended:      recommendedSteps.length,
        ready_for_go_live:      progress?.ready_for_go_live ?? false,
      };
    }),
  );

  logger.info('platform-admin.tenant-onboarding-list.ok', { correlation_id: ctx.correlationId, count: rows.length });
  return ok(ctx, { organizations: rows, total: count ?? rows.length });
}

async function handleGoLive(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();

  const progress = await computeOnboardingProgress(db, orgId);
  if (!progress) return notFound(ctx);

  // Idempotency guard — mirrors the same pattern used for demo-request
  // conversion in handleProvision: the UI hides the action once already
  // live, but the server is the authoritative check, not the client.
  if (progress.is_live) {
    return badRequest(ctx, 'This organization has already gone live');
  }

  // The server-side gate for Go Live Approval (Architecture Section 17) —
  // Ready for Go Live is a precondition, never inferred from the client.
  // Only Go Live Requirements (Section 8.1) can ever appear here —
  // Recommended Configuration (Section 8.2) never blocks this gate.
  if (!progress.ready_for_go_live) {
    const pending = progress.steps
      .filter((s) => s.category === 'go_live_requirement' && s.status === 'pending')
      .map((s) => s.key);
    return badRequest(ctx, `Not all Go Live Readiness Requirements are complete: ${pending.join(', ')}`);
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from('organizations')
    .update({ go_live_at: nowIso, go_live_approved_by: ctx.actorId, updated_by: ctx.actorId })
    .eq('id', orgId)
    .select('id, name, go_live_at, go_live_approved_by')
    .single();

  if (updateError || !updated) {
    logger.error('platform-admin.go-live.update_failed', { correlation_id: ctx.correlationId, org_id: orgId, error: updateError?.message });
    return internalError(ctx, 'Failed to record Go Live approval');
  }

  logger.info('platform-admin.go-live.ok', { correlation_id: ctx.correlationId, org_id: orgId, actor_id: ctx.actorId });
  return ok(ctx, updated);
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonHeaders(ctx: EdgeRequestContext): Record<string, string> {
  return {
    'Content-Type':     'application/json',
    'X-Correlation-ID': ctx.correlationId,
    'X-Request-ID':     ctx.requestId,
  };
}

function ok(ctx: EdgeRequestContext, data: unknown): Response {
  return new Response(JSON.stringify({ data }), { status: 200, headers: jsonHeaders(ctx) });
}

function created(ctx: EdgeRequestContext, data: unknown): Response {
  return new Response(JSON.stringify({ data }), { status: 201, headers: jsonHeaders(ctx) });
}

function badRequest(ctx: EdgeRequestContext, message: string): Response {
  return new Response(
    JSON.stringify({ code: 'VALIDATION_ERROR', message, trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
    { status: 422, headers: jsonHeaders(ctx) },
  );
}

function forbidden(ctx: EdgeRequestContext): Response {
  return new Response(
    JSON.stringify({ code: 'FORBIDDEN', message: 'Platform admin access required', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
    { status: 403, headers: jsonHeaders(ctx) },
  );
}

function notFound(ctx: EdgeRequestContext): Response {
  return new Response(
    JSON.stringify({ code: 'NOT_FOUND', message: 'Unknown route or resource not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
    { status: 404, headers: jsonHeaders(ctx) },
  );
}

function internalError(ctx: EdgeRequestContext, message: string): Response {
  return new Response(
    JSON.stringify({ code: 'INTERNAL_ERROR', message, trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
    { status: 500, headers: jsonHeaders(ctx) },
  );
}
