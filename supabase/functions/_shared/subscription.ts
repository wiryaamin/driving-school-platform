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
  'finance:vat:report':           'starter',
  'finance:ledger:read':          'starter',

  // Finance — professional tier
  'finance:reconciliation:run':   'professional',
  'finance:payroll:run':          'professional',
  'finance:financial-close:run':  'professional',
  'finance:accruals:manage':      'professional',
  'finance:fixed-assets:manage':  'professional',
  'finance:fortnox:sync':         'professional',

  // Communication — starter tier
  'communication:campaigns:send': 'starter',
  'communication:templates:manage': 'starter',

  // Reporting — starter tier
  'reports:standard':             'starter',
  // Reporting — professional tier
  'reports:advanced':             'professional',

  // Corporate customers — starter tier
  'corporate:customers:manage':   'starter',

  // Data migration tools — professional tier
  'admin:data-migration:run':     'professional',
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
