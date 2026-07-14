/**
 * tenant-onboarding — Tenant Onboarding orchestration layer.
 *
 * Implements Customer Provisioning & Tenant Onboarding Architecture, Section 8.
 * This function is a pure read: every step is computed live from the module
 * that already owns that data (organizations, organization_locations,
 * memberships, data_migration_sessions, slot_templates, lesson_types,
 * vehicles, instructors, accounting_chart_of_accounts, vat_periods,
 * channel_configs — see _shared/tenant-onboarding-progress.ts). Nothing here
 * is a second copy of any of it, and this function performs no writes at all.
 *
 * An earlier implementation pass added mutation routes (POST /steps/:step/
 * confirm|skip) and a small table to record an explicit "skip" decision for
 * Staff Invitations and Data Migration. A follow-up architecture review
 * determined both capabilities are optional, not gated — so there is nothing
 * to skip past, and the decision (and the table that recorded it) was
 * removed entirely. See the Architecture doc's second refinement note and
 * migration 20260711000003_tenant_onboarding_remove_persistence.sql.
 *
 * Tenant-context route (bounded to Tenant Workspace, per Playbook Section 6
 * question 6 — this stays separate from platform-admin's Go Live approval,
 * which is a Platform Administration responsibility, Architecture Section 10).
 *
 * Routes:
 *   GET  /progress — this org's Tenant Onboarding progress
 */

import { serveCors }          from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { buildErrorResponse, buildSuccessResponse } from '../_shared/errors.ts';
import { computeOnboardingProgress } from '../_shared/tenant-onboarding-progress.ts';
import { logger }             from '../_shared/logger.ts';

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;

  if (!ctx.organizationId) {
    return buildErrorResponse(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  }
  const orgId = ctx.organizationId;

  const url      = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'tenant-onboarding');
  const rest     = segments.slice(fnIdx + 1);
  const path     = rest.length ? '/' + rest.join('/') : '/';

  logger.info('tenant-onboarding.request', {
    correlation_id: ctx.correlationId, actor_id: ctx.actorId, org_id: orgId, method: req.method, path,
  });

  if (req.method === 'GET' && path === '/progress') return handleProgress(ctx, orgId);

  return buildErrorResponse(ctx, 404, 'NOT_FOUND', 'Unknown route or resource not found');
}));

// ─── Progress computation ─────────────────────────────────────────────────────

async function handleProgress(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const progress = await computeOnboardingProgress(db, orgId);

  if (!progress) {
    logger.error('tenant-onboarding.progress.org_lookup_failed', { correlation_id: ctx.correlationId, org_id: orgId });
    return buildErrorResponse(ctx, 500, 'INTERNAL_ERROR', 'Failed to load organization');
  }

  logger.info('tenant-onboarding.progress.ok', { correlation_id: ctx.correlationId, org_id: orgId, ready_for_go_live: progress.ready_for_go_live });

  return buildSuccessResponse(ctx, progress);
}
