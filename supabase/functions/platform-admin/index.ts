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
 */

import { serveCors }          from '../_shared/cors.ts';
import { buildEdgeContext }   from '../_shared/context.ts';
import { createServiceClient } from '../_shared/supabase.ts';
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

    if (!ctx.isPlatformAdmin) {
      logger.warn('platform-admin.forbidden', {
        correlation_id: ctx.correlationId,
        actor_id:       ctx.actorId,
      });
      return forbidden(ctx);
    }

    const url  = new URL(req.url);
    const path = url.pathname.replace(/^\/functions\/v1\/platform-admin/, '') || '/';

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
  logger.info('platform-admin.subscription-detail.ok', { correlation_id: ctx.correlationId, org_id: orgId });
  return ok(ctx, data as Record<string, unknown>);
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

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonHeaders(ctx: EdgeRequestContext): Record<string, string> {
  return {
    'Content-Type':     'application/json',
    'X-Correlation-ID': ctx.correlationId,
  };
}

function ok(ctx: EdgeRequestContext, data: unknown): Response {
  return new Response(JSON.stringify({ data }), { status: 200, headers: jsonHeaders(ctx) });
}

function forbidden(ctx: EdgeRequestContext): Response {
  return new Response(
    JSON.stringify({ code: 'FORBIDDEN', message: 'Platform admin access required', trace_id: ctx.correlationId }),
    { status: 403, headers: jsonHeaders(ctx) },
  );
}

function notFound(ctx: EdgeRequestContext): Response {
  return new Response(
    JSON.stringify({ code: 'NOT_FOUND', message: 'Unknown route or resource not found', trace_id: ctx.correlationId }),
    { status: 404, headers: jsonHeaders(ctx) },
  );
}

function internalError(ctx: EdgeRequestContext, message: string): Response {
  return new Response(
    JSON.stringify({ code: 'INTERNAL_ERROR', message, trace_id: ctx.correlationId }),
    { status: 500, headers: jsonHeaders(ctx) },
  );
}
