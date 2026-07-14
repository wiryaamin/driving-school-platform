/**
 * Platform Subscription Service — a reusable read facade over an
 * organization's commercial subscription state.
 *
 * Responsible for: active subscription, trial status, subscription status,
 * plan lookup, entitlement lookup. Does not implement payments or invoices
 * (out of scope — Platform Billing Phase 1 Foundation).
 *
 * Reuses, never duplicates:
 *   - isSubscriptionActive / isSubscriptionBlocked / isInGracePeriod
 *     (_shared/subscription.ts) for status interpretation.
 *   - getPlatformPlan (_shared/planCatalog.ts) for plan identity.
 *   - getEntitlementSummary (_shared/entitlements.ts) for seat/location/
 *     feature/storage entitlements — the Platform Entitlement Service.
 */

import {
  isSubscriptionActive,
  isSubscriptionBlocked,
  isInGracePeriod,
  type SubscriptionTier,
} from './subscription.ts';
import { getPlatformPlan, type PlatformPlanDefinition } from './planCatalog.ts';
import { getEntitlementSummary, type EntitlementSummary } from './entitlements.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export interface SubscriptionSnapshot {
  orgId:           string;
  tier:            SubscriptionTier;
  status:          string;
  trialEndsAt:     string | null;
  isActive:        boolean;
  isTrialing:      boolean;
  isBlocked:       boolean;
  isInGracePeriod: boolean;
  plan:            PlatformPlanDefinition;
  entitlements:    EntitlementSummary;
}

/**
 * Loads the full commercial subscription snapshot for one organization: one
 * `organizations` read plus the Entitlement Service's seat/location/feature/
 * storage lookups. Returns null if the organization does not exist.
 */
export async function getSubscriptionSnapshot(
  db: DbClient,
  orgId: string
): Promise<SubscriptionSnapshot | null> {
  const { data, error } = await db
    .from('organizations')
    .select('subscription_tier, subscription_status, trial_ends_at')
    .eq('id', orgId)
    .maybeSingle();

  if (error || !data) return null;

  const tier   = (data.subscription_tier as SubscriptionTier) ?? 'trial';
  const status = (data.subscription_status as string) ?? 'trialing';

  const entitlements = await getEntitlementSummary(db, orgId, tier);

  return {
    orgId,
    tier,
    status,
    trialEndsAt:     (data.trial_ends_at as string | null) ?? null,
    isActive:        isSubscriptionActive(status),
    isTrialing:      status === 'trialing',
    isBlocked:       isSubscriptionBlocked(status),
    isInGracePeriod: isInGracePeriod(status),
    plan:            getPlatformPlan(tier),
    entitlements,
  };
}
