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
 *   GET /orgs/counts             — per-org member/student/instructor counts
 *   GET /orgs/:id                — full organization profile
 *   GET /orgs/:id/stats          — aggregate stats for one organization
 *   GET /orgs/:id/admins         — administrators for one organization
 *   GET /orgs/:id/timeline       — audit-based timeline for one organization
 *   GET /subscriptions           — all orgs with subscription data + usage counts
 *   GET /subscriptions/:id       — full subscription profile for one organization
 *   GET /subscriptions/:id/history — subscription-relevant audit events
 *   GET /audit                   — paginated platform audit log (filterable)
 *   GET /audit/security          — security-relevant events across all tenants
 *   GET /support/orgs/:id/health — org health snapshot for support workspace
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
 */

import { serveCors }          from '../_shared/cors.ts';
import { buildEdgeContext }   from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { computeOnboardingProgress } from '../_shared/tenant-onboarding-progress.ts';
import { getSeatEntitlement } from '../_shared/entitlements.ts';
import { getSubscriptionSnapshot } from '../_shared/platformSubscription.ts';
import { logger }             from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

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
    const orgMatch = /^\/orgs\/([^/]+)(\/[a-z]+)?$/.exec(path);
    if (orgMatch && req.method === 'GET') {
      const segment = orgMatch[1] ?? '';
      const sub     = orgMatch[2] ?? '';

      // Guard: only route if segment is a UUID (not "counts" or other named paths)
      if (UUID_RE.test(segment)) {
        const orgId = segment;
        if (sub === '')          return handleOrgDetail(ctx, orgId);
        if (sub === '/stats')    return handleOrgStats(ctx, orgId);
        if (sub === '/admins')   return handleOrgAdmins(ctx, orgId);
        if (sub === '/timeline') return handleOrgTimeline(ctx, orgId);
      }
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

  return {
    ok: true,
    value: {
      demoRequestId,
      name, legalName,
      orgNumber:        orgNumberRaw || null,
      subscriptionTier: tier as ProvisionTier,
      trialDays,
      adminFirstName, adminLastName, adminEmail,
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
  const temporaryPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email:         input.adminEmail,
    password:      temporaryPassword,
    email_confirm: true,
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
    .insert({ user_id: userId, organization_id: orgId, status: 'active', joined_at: nowIso })
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
  });
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

  const temporaryPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email: input.email, password: temporaryPassword, email_confirm: true,
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
    .insert({ user_id: userId, organization_id: orgId, status: 'active', joined_at: nowIso })
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

  // Non-fatal — mirrors the invitation-enqueue step in handleProvision (same
  // disclosed gap: no email provider processes this event yet).
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
// Organization Administration, Phase 4. The current invitation has no
// token or link — auth.admin.createUser(email_confirm:true) activates the
// account immediately (see handleInviteAdmin's own comment) — so there is
// nothing for Supabase Auth to expire, and neither action below tries to
// invent one. Both are scoped to invitation_status = 'pending' only (i.e.
// last_sign_in_at IS NULL): an administrator who has already logged in is
// no longer "an invitation," they're a real administrator — Disable
// Administrator is the correct action for them, not these two.

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
    .from('memberships').select('id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);

  const { data: authUser, error: authLookupError } = await db.auth.admin.getUserById(userId);
  if (authLookupError || !authUser?.user) return notFound(ctx);
  if (authUser.user.last_sign_in_at) {
    return badRequest(ctx, 'This administrator has already accepted their invitation — use Disable Administrator instead');
  }

  const { data: profile } = await db.from('profiles').select('email, first_name, last_name').eq('id', userId).maybeSingle();
  if (!profile?.email) return internalError(ctx, 'Administrator profile not found');

  // Rotate the credential — the original temp password was never delivered
  // (no email provider processes these events yet, the same disclosed gap
  // as Provisioning), so resending must issue a genuinely new one rather
  // than just re-notifying with nothing changed.
  const newTemporaryPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { error: pwError } = await db.auth.admin.updateUserById(userId, { password: newTemporaryPassword });
  if (pwError) {
    logger.error('platform-admin.resend-invitation.password_rotate_failed', { correlation_id: ctx.correlationId, error: pwError.message });
    return internalError(ctx, 'Failed to resend invitation');
  }

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
    .from('memberships').select('id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (!membership) return notFound(ctx);
  const membershipId = membership.id as string;

  const { data: authUser, error: authLookupError } = await db.auth.admin.getUserById(userId);
  if (authLookupError || !authUser?.user) return notFound(ctx);
  if (authUser.user.last_sign_in_at) {
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
