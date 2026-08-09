/**
 * tenant-onboarding — Tenant Onboarding orchestration layer.
 *
 * Implements Customer Provisioning & Tenant Onboarding Architecture, Section 8.
 * Progress computation is a pure read: every step is computed live from the
 * module that already owns that data (see _shared/tenant-onboarding-progress.ts).
 *
 * An earlier implementation pass added mutation routes (POST /steps/:step/
 * confirm|skip) and a small table to record an explicit "skip" decision for
 * Staff Invitations and Data Migration. A follow-up architecture review
 * determined both capabilities are optional, not gated — so there is nothing
 * to skip past, and the decision (and the table that recorded it) was
 * removed entirely. See the Architecture doc's second refinement note and
 * migration 20260711000003_tenant_onboarding_remove_persistence.sql. That
 * removal was about a specific narrow "skip" decision, not a blanket ban on
 * this function ever writing anything — POST /business-profile below is a
 * new, deliberate, narrowly-scoped write (Execution Direction Change,
 * 2026-08-07: Intelligent Tenant Provisioning Engine foundation).
 *
 * POST /business-profile is the entry point into the four-engine
 * provisioning pipeline (Configuration Extraction → Business Rules →
 * Dependency → Provisioning — see _shared/provisioning-*.ts). This handler
 * only orchestrates: HTTP parsing, permission check, persisting the
 * Business Profile, and reporting the result. It contains no business logic
 * of its own — that all lives in the four engine modules so it stays
 * reusable by whatever calls into this pipeline next (Continuous Business
 * Discovery, a future re-run action, etc.).
 *
 * Tenant-context route (bounded to Tenant Workspace, per Playbook Section 6
 * question 6 — this stays separate from platform-admin's Go Live approval,
 * which is a Platform Administration responsibility, Architecture Section 10).
 *
 * Routes:
 *   GET  /progress          — this org's Tenant Onboarding progress
 *   GET  /business-profile  — this org's saved Business Discovery answers + rules
 *   POST /business-profile  — run the provisioning pipeline: extract →
 *                             derive rules → save profile → provision
 */

import { serveCors }          from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { buildErrorResponse, buildSuccessResponse } from '../_shared/errors.ts';
import { computeOnboardingProgress } from '../_shared/tenant-onboarding-progress.ts';
import { extractConfiguration, type RawBusinessDiscoveryAnswers, type KnownBusinessFacts } from '../_shared/provisioning-extraction.ts';
import { deriveBusinessRules } from '../_shared/provisioning-rules.ts';
import { type CapabilityAssessment } from '../_shared/provisioning-capabilities.ts';
import { deriveDomains, type DomainAssessment } from '../_shared/provisioning-domains.ts';
import {
  runFullPipeline, gatherKnownBusinessFacts, activeCapabilityKeys, type SavedBusinessProfileRecord,
} from '../_shared/tenant-onboarding-pipeline.ts';
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

  if (req.method === 'GET'  && path === '/progress')         return handleProgress(ctx, orgId);
  if (req.method === 'GET'  && path === '/business-profile') return handleGetBusinessProfile(ctx, orgId);
  if (req.method === 'POST' && path === '/business-profile') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
    return handleRunProvisioningPipeline(req, ctx, orgId);
  }

  return buildErrorResponse(ctx, 404, 'NOT_FOUND', 'Unknown route or resource not found');
}));

function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(code)) return buildErrorResponse(ctx, 403, 'FORBIDDEN', `Requires permission: ${code}`);
  return null;
}

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

// ─── Business Discovery — profile read ────────────────────────────────────────
// Pipeline (Configuration Extraction → Business Rules → save → Provisioning)
// now lives in _shared/tenant-onboarding-pipeline.ts — shared with the
// pre-account trial-signup Edge Function. Behavior below is unchanged.

async function handleGetBusinessProfile(ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const db = createServiceClient();
  const { data, error } = await db.from('organizations').select('business_profile').eq('id', orgId).maybeSingle();
  if (error || !data) {
    logger.error('tenant-onboarding.business_profile.get_failed', { correlation_id: ctx.correlationId, org_id: orgId, error: error?.message });
    return buildErrorResponse(ctx, 500, 'INTERNAL_ERROR', 'Failed to load business profile');
  }

  // known_counts lets the interview hide/lock a field the platform can
  // already answer itself — "never ask what's already known" needs the
  // frontend to be able to see that before the tenant ever submits anything.
  const known = await gatherKnownBusinessFacts(db, orgId);
  const saved = (data.business_profile ?? {}) as Partial<SavedBusinessProfileRecord>;

  // Business Knowledge Evolution: a tenant that completed the interview as
  // solo and later hired 6 more instructors (via the normal Instructors
  // page — nobody resubmits an interview to announce that) should see their
  // archetype/businessType and downstream scheduling automation reflect
  // that on the very next read, not stay frozen at signup-time values.
  // Re-run the same pipeline the tenant's own answers already produced, but
  // against freshly-gathered known facts; only write anything if the
  // recomputed classification actually differs.
  if (saved.completed_at && saved.analysis) {
    const raw: RawBusinessDiscoveryAnswers = {
      branches: saved.branches, instructors: saved.instructors, vehicles: saved.vehicles,
      licence_categories: saved.licence_categories, standard_lesson_duration_minutes: saved.standard_lesson_duration_minutes,
    };
    const recomputed = extractConfiguration(raw, known);
    if (recomputed.ok) {
      const rules = deriveBusinessRules(recomputed.value);
      const { capabilities } = deriveDomains(recomputed.value, rules, known);
      const changed = rules.archetype !== saved.analysis.archetype
        || rules.businessType !== saved.analysis.business_type
        || activeCapabilityKeys(capabilities) !== activeCapabilityKeys(saved.capabilities);
      if (changed) {
        const result = await runFullPipeline(db, orgId, raw, known, saved.completed_at);
        if (result.ok) {
          logger.info('tenant-onboarding.business_profile.auto_recomputed', {
            correlation_id: ctx.correlationId, org_id: orgId,
            previous_archetype: saved.analysis.archetype, new_archetype: result.rules.archetype,
            previous_business_type: saved.analysis.business_type, new_business_type: result.rules.businessType,
            previous_capabilities: activeCapabilityKeys(saved.capabilities), new_capabilities: activeCapabilityKeys(result.capabilities),
            executed: result.provisioning.executed,
          });
          return buildSuccessResponse(ctx, { ...result.record, known_counts: known.liveCounts });
        }
        logger.error('tenant-onboarding.business_profile.auto_recompute_save_failed', {
          correlation_id: ctx.correlationId, org_id: orgId, kind: result.kind, message: result.message,
        });
        // Fall through and serve the last-known-good saved profile rather
        // than failing the read over a background recompute's write error.
      }
    }
  }

  return buildSuccessResponse(ctx, { ...saved, known_counts: known.liveCounts });
}

// ─── Provisioning pipeline entry point ────────────────────────────────────────
// Configuration Extraction Engine → Business Rules Engine → (save profile) →
// Provisioning Engine (which itself consumes the Dependency Engine). Each
// stage is a plain function call into its own module — this handler is
// purely the HTTP boundary around that pipeline (runFullPipeline, above).

async function handleRunProvisioningPipeline(req: Request, ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:slot:create');
  if (guard) return guard;

  let body: RawBusinessDiscoveryAnswers;
  try { body = await req.json(); }
  catch { return buildErrorResponse(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const db    = createServiceClient();
  const known = await gatherKnownBusinessFacts(db, orgId);
  const result = await runFullPipeline(db, orgId, body, known, new Date().toISOString());

  if (!result.ok) {
    if (result.kind === 'validation') return buildErrorResponse(ctx, 422, 'VALIDATION_ERROR', result.message);
    logger.error('tenant-onboarding.business_profile.save_failed', { correlation_id: ctx.correlationId, org_id: orgId, error: result.message });
    return buildErrorResponse(ctx, 500, 'INTERNAL_ERROR', 'Failed to save business profile');
  }

  const { config, rules, domains, capabilities, provisioning } = result;

  logger.info('tenant-onboarding.business_profile.provisioned', {
    correlation_id: ctx.correlationId, org_id: orgId, archetype: rules.archetype, business_type: rules.businessType,
    count_sources: { branches: config.structure.branches.source, instructors: config.resources.instructors.source, vehicles: config.resources.vehicles.source },
    active_domains: domains.filter((d) => d.active).map((d) => d.key).join(','),
    active_capabilities: activeCapabilityKeys(capabilities),
    executed: provisioning.executed, skipped: provisioning.skipped, not_applicable: provisioning.notApplicable,
  });

  return buildSuccessResponse(ctx, {
    business_profile: {
      branches: config.structure.branches.value,
      instructors: config.resources.instructors.value,
      vehicles: config.resources.vehicles.value,
      licence_categories: config.trainingServices.licenceCategories,
      standard_lesson_duration_minutes: config.trainingServices.standardLessonDurationMinutes,
      analysis: { archetype: rules.archetype, business_type: rules.businessType, signals: rules.signals, computed_at: rules.computedAt },
      domains,
      capabilities,
    },
    count_sources: {
      branches: config.structure.branches.source,
      instructors: config.resources.instructors.source,
      vehicles: config.resources.vehicles.source,
    },
    branch_created:           provisioning.executed.branch?.created ?? 0,
    lesson_types_created:     provisioning.executed.lesson_types?.created ?? 0,
    package_templates_created: provisioning.executed.package_templates?.created ?? 0,
    provisioning,
  }, 201);
}

// gatherKnownBusinessFacts also moved to _shared/tenant-onboarding-pipeline.ts (imported above).
