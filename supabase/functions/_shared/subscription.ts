/**
 * Subscription enforcement utilities — foundation layer for RRP-1.
 *
 * This module provides:
 *   1. Tier ordering and comparison utilities
 *   2. Feature gate definitions (which features require which tier)
 *   3. requireSubscriptionTier() — call after buildEdgeContext to gate a route
 *   4. Grace period and expiry handling
 *
 * Billing integration (Stripe) is NOT part of this module. This module
 * reads subscription state from the JWT (subscription_tier, subscription_status)
 * and enforces access — it does not modify subscription state.
 *
 * Usage:
 *   const guard = requireSubscriptionTier(ctx, 'professional');
 *   if (guard) return guard;
 *
 * Adding enforcement to a new route:
 *   1. Find the feature key in FEATURE_GATES or add a new one
 *   2. Call requireFeature(ctx, 'your:feature:key') at the top of the handler
 */

import type { EdgeRequestContext } from './context.ts';

// ─── Tier hierarchy ───────────────────────────────────────────────────────────

/**
 * Ordered from lowest to highest. A tier satisfies itself and all tiers below it.
 * 'enterprise' is the highest; 'trial' is the lowest.
 *
 * Must mirror packages/types/src/common.types.ts's SubscriptionTier — this file
 * cannot import that package (Deno Edge Functions may not import workspace
 * packages), so the tier list is duplicated by necessity and must be kept in sync.
 */
export const SUBSCRIPTION_TIERS = ['trial', 'starter', 'professional', 'enterprise'] as const;
export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[number];

export function tierSatisfies(
  userTier: string,
  requiredTier: SubscriptionTier
): boolean {
  const userIdx = SUBSCRIPTION_TIERS.indexOf(userTier as SubscriptionTier);
  const reqIdx  = SUBSCRIPTION_TIERS.indexOf(requiredTier);
  if (userIdx === -1) return false; // unknown tier → deny
  return userIdx >= reqIdx;
}

// ─── Subscription status ──────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'      // in grace period — read access allowed, writes may be blocked
  | 'grace_period'  // explicit grace period label
  | 'cancelled'
  | 'suspended'
  | 'expired';

/** Statuses where the org still has some level of access (read operations). */
const ACTIVE_STATUSES: Set<string> = new Set(['active', 'trialing', 'past_due', 'grace_period']);

/** Statuses where ALL access is blocked (org has fully churned or is suspended). */
const BLOCKED_STATUSES: Set<string> = new Set(['cancelled', 'suspended', 'expired']);

export function isSubscriptionActive(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isSubscriptionBlocked(status: string): boolean {
  return BLOCKED_STATUSES.has(status);
}

export function isInGracePeriod(status: string): boolean {
  return status === 'past_due' || status === 'grace_period';
}

// ─── Feature gate definitions ─────────────────────────────────────────────────

/**
 * Maps feature identifiers to the minimum subscription tier required.
 * Platform admins bypass all feature gates.
 * Trial orgs can access only unlisted features (no entry = always allowed).
 */
export const FEATURE_GATES: Record<string, SubscriptionTier> = {
  // Finance — starter tier
  'finance:sie4:export':          'starter',
  'finance:ledger:read':          'starter',

  // Finance — trial tier (basic VAT period tracking is one of the six
  // mandatory Go Live Readiness Requirements — see
  // _shared/tenant-onboarding-progress.ts finance_configuration — so it
  // cannot require an upgrade a trial customer hasn't made yet; a trial org
  // must be able to reach Go Live without paying first. Gating VAT period
  // creation behind 'starter' made ready_for_go_live permanently
  // unreachable for every new customer, since every org starts on trial).
  'finance:vat:report':           'trial',

  // Finance — professional tier
  'finance:reconciliation:run':   'professional',
  'finance:payroll:run':          'professional',
  'finance:financial-close:run':  'professional',
  'finance:accruals:manage':      'professional',
  'finance:fixed-assets:manage':  'professional',
  'finance:fortnox:sync':         'professional',

  // Communication — starter tier
  'communication:campaigns:send': 'starter',

  // Communication — trial tier. This key gates the entire communication
  // module (channel setup, compose, delivery log, queue monitor, etc.).
  // Enabling at least one channel is one of the six mandatory Go Live
  // Readiness Requirements (finance_configuration's sibling
  // communication_configuration — see _shared/tenant-onboarding-progress.ts),
  // so it cannot require an upgrade a trial customer hasn't made yet, for
  // the same reason as finance:vat:report above.
  'communication:templates:manage': 'trial',

  // Reporting — starter tier
  'reports:standard':             'starter',
  // Reporting — professional tier
  'reports:advanced':             'professional',

  // Corporate customers — starter tier
  'corporate:customers:manage':   'starter',

  // Data migration tools — trial tier (a prospective customer needs to be
  // able to import their existing student/booking data during the trial to
  // meaningfully evaluate the platform against their real setup, not just a
  // demo org — gating this behind a paid tier would mean nobody could try it
  // before committing).
  'admin:data-migration:run':     'trial',
} as const;

// ─── Enforcement helpers ──────────────────────────────────────────────────────

/**
 * Returns a 402 Response if the context's subscription tier does not satisfy
 * the required tier, or null if access is allowed.
 *
 * Platform admins always pass.
 */
export function requireSubscriptionTier(
  ctx: EdgeRequestContext,
  required: SubscriptionTier
): Response | null {
  if (ctx.isPlatformAdmin) return null;

  const userTier = ctx.subscriptionTier ?? 'trial';
  if (tierSatisfies(userTier, required)) return null;

  return subscriptionGatedResponse(ctx.correlationId, userTier, required);
}

/**
 * Returns a 402 Response if the feature is gated and the org's tier is insufficient,
 * or null if access is allowed or the feature has no gate.
 */
export function requireFeature(
  ctx: EdgeRequestContext,
  featureKey: string
): Response | null {
  if (ctx.isPlatformAdmin) return null;

  const required = FEATURE_GATES[featureKey];
  if (required === undefined) return null; // feature has no gate

  return requireSubscriptionTier(ctx, required);
}

/**
 * Returns a 403 Response if the org's subscription is in a blocked state.
 * Use at the top of write handlers for orgs that may have churned.
 */
export function requireActiveSubscription(
  ctx: EdgeRequestContext,
  subscriptionStatus: string
): Response | null {
  if (ctx.isPlatformAdmin) return null;
  if (isSubscriptionBlocked(subscriptionStatus)) {
    return suspendedOrgResponse(ctx.correlationId, subscriptionStatus);
  }
  return null;
}

// ─── Trial expiry (grace period, then hard lock) ──────────────────────────────
// Approved design: 7 days after trial_ends_at, access continues with a
// warning banner (frontend-only, see apps/web/src/core/auth/trialLock.ts);
// past that, every Edge Function call is blocked here until a platform admin
// extends or upgrades the org. Mirrors the frontend's getTrialLockState
// exactly — same two fields (subscription_status, trial_ends_at), same
// 7-day constant — so both layers agree on the same instant, computed live
// rather than from a stored flag that could drift.

export const TRIAL_GRACE_PERIOD_DAYS = 7;

/**
 * Returns true once a 'trialing' org is past its 7-day grace period.
 * Platform admins have no organizationId tied to a trial and are unaffected —
 * callers should check ctx.isPlatformAdmin first regardless.
 */
export function isTrialLocked(
  subscriptionStatus: string | null,
  trialEndsAt: string | null
): boolean {
  if (subscriptionStatus !== 'trialing' || !trialEndsAt) return false;
  const lockAt = new Date(trialEndsAt).getTime() + TRIAL_GRACE_PERIOD_DAYS * 86_400_000;
  return Date.now() >= lockAt;
}

/**
 * Returns a 403 TRIAL_EXPIRED Response if the org's trial has passed its
 * grace period, or null if access is allowed. Called unconditionally from
 * buildEdgeContext (context.ts) — every Edge Function is protected the same
 * way JWT verification already is, with no per-handler opt-in to forget.
 */
export function checkTrialLock(ctx: EdgeRequestContext): Response | null {
  if (ctx.isPlatformAdmin) return null;
  if (!isTrialLocked(ctx.subscriptionStatus, ctx.trialEndsAt)) return null;

  return new Response(
    JSON.stringify({
      code:      'TRIAL_EXPIRED',
      message:   'Testperioden har gått ut. Kontakta oss för att uppgradera och återfå åtkomst.',
      trace_id:  ctx.correlationId,
    }),
    { status: 403, headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': ctx.correlationId } },
  );
}

// ─── Response builders ────────────────────────────────────────────────────────

function subscriptionGatedResponse(
  correlationId: string,
  currentTier: string,
  requiredTier: SubscriptionTier
): Response {
  return new Response(
    JSON.stringify({
      code:          'SUBSCRIPTION_REQUIRED',
      message:       `This feature requires the '${requiredTier}' plan or higher. Your current plan is '${currentTier}'.`,
      required_tier: requiredTier,
      current_tier:  currentTier,
      trace_id:      correlationId,
    }),
    {
      status: 402,
      headers: {
        'Content-Type':     'application/json',
        'X-Correlation-ID': correlationId,
      },
    }
  );
}

function suspendedOrgResponse(
  correlationId: string,
  status: string
): Response {
  return new Response(
    JSON.stringify({
      code:    'SUBSCRIPTION_SUSPENDED',
      message: `Organisation access is suspended (status: ${status}). Please contact support or renew your subscription.`,
      status,
      trace_id: correlationId,
    }),
    {
      status: 403,
      headers: {
        'Content-Type':     'application/json',
        'X-Correlation-ID': correlationId,
      },
    }
  );
}
