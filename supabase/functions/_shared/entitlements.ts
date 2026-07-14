/**
 * Platform Entitlement Service — the authoritative implementation of
 * commercial subscription policy (ADR-004, Enterprise Architecture Handbook).
 *
 * Owns: seat limits, location limits, feature entitlements, storage limits
 * (stubbed — see getStorageEntitlement), and is the extension point for any
 * future commercial entitlement (grace periods, purchased seat add-ons,
 * unlimited-tier overrides, promotional exceptions).
 *
 * Reuses, never duplicates:
 *   - organizations.max_users / max_locations for live, per-org limits.
 *   - FEATURE_GATES / tierSatisfies (_shared/subscription.ts) for feature
 *     entitlement — this module wraps them, it does not reimplement the
 *     comparison. requireFeature(ctx, key) (_shared/subscription.ts) remains
 *     the mechanism for "is this request allowed" and is unchanged; this
 *     module answers "what does organization X have" for an arbitrary org.
 *
 * The PostgreSQL triggers (enforce_max_users, enforce_max_locations;
 * migration 20260711000006_platform_billing_hardening.sql) remain the
 * transactional safety guard against races on these same multi-row count
 * invariants — they intentionally stay a simple `count(*) >= max` check and
 * must never gain new conditions. Any new entitlement rule belongs here, in
 * application code, per P-024. See ADR-004 for the full rationale.
 */

import { FEATURE_GATES, tierSatisfies, type SubscriptionTier } from './subscription.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SeatEntitlement {
  allowed:   boolean;
  current:   number;
  max:       number;
  remaining: number;
}

export interface LocationEntitlement {
  allowed:   boolean;
  current:   number;
  max:       number;
  remaining: number;
}

export interface FeatureEntitlement {
  allowed:      boolean;
  /** null = this feature key has no gate (always allowed). */
  requiredTier: SubscriptionTier | null;
}

export interface StorageEntitlement {
  allowed: boolean;
  /**
   * false = no per-org storage usage is tracked anywhere in the platform
   * today (confirmed, Platform Billing Capability Audit). Always reports
   * `allowed: true` honestly rather than fabricating enforcement. The
   * signature is stable so a future storage-quota data model can be wired
   * in here without any caller changing.
   */
  tracked: boolean;
}

export interface EntitlementSummary {
  seats:     SeatEntitlement;
  locations: LocationEntitlement;
  storage:   StorageEntitlement;
  features:  Record<string, FeatureEntitlement>;
}

// ─── Seat / location entitlement ───────────────────────────────────────────

async function getOrgLimits(
  db: DbClient,
  orgId: string
): Promise<{ maxUsers: number; maxLocations: number } | null> {
  const { data, error } = await db
    .from('organizations')
    .select('max_users, max_locations')
    .eq('id', orgId)
    .maybeSingle();
  if (error || !data) return null;
  return { maxUsers: data.max_users as number, maxLocations: data.max_locations as number };
}

/**
 * The application-layer policy check for the seat entitlement. Mirrors the
 * enforce_max_users trigger's comparison exactly (organizations.max_users vs.
 * a live, non-removed membership count) — this is intentional: the trigger
 * is the atomic backstop for this exact policy, not an independent rule.
 */
export async function getSeatEntitlement(db: DbClient, orgId: string): Promise<SeatEntitlement> {
  const limits = await getOrgLimits(db, orgId);
  const max = limits?.maxUsers ?? 0;

  const { count, error } = await db
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .neq('status', 'removed');

  const current = error ? 0 : (count ?? 0);
  return { allowed: current < max, current, max, remaining: Math.max(0, max - current) };
}

/**
 * The application-layer policy check for the location entitlement. Mirrors
 * the enforce_max_locations trigger's comparison exactly, for the same
 * reason as getSeatEntitlement above.
 */
export async function getLocationEntitlement(db: DbClient, orgId: string): Promise<LocationEntitlement> {
  const limits = await getOrgLimits(db, orgId);
  const max = limits?.maxLocations ?? 0;

  const { count, error } = await db
    .from('organization_locations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .is('deleted_at', null);

  const current = error ? 0 : (count ?? 0);
  return { allowed: current < max, current, max, remaining: Math.max(0, max - current) };
}

// ─── Feature entitlement ────────────────────────────────────────────────────
//
// Evaluated by tier, not by EdgeRequestContext — this is an "entitlement
// lookup" for an arbitrary organization (e.g. a platform admin viewing a
// tenant's subscription detail), which must reflect that organization's own
// tier regardless of who is asking. requireFeature(ctx, key) — unchanged, in
// its existing 3 call sites (communications, corporate-customers,
// data-migration) — remains the correct mechanism for "is this request
// allowed", where the platform-admin bypass is intentional. Both reuse the
// same tierSatisfies()/FEATURE_GATES; neither duplicates the comparison.

/** Thin, typed wrapper over the existing FEATURE_GATES / tierSatisfies() mechanism. */
export function getFeatureEntitlement(tier: SubscriptionTier, featureKey: string): FeatureEntitlement {
  const requiredTier = FEATURE_GATES[featureKey] ?? null;
  const allowed = requiredTier === null || tierSatisfies(tier, requiredTier);
  return { allowed, requiredTier };
}

/** Evaluates every declared feature gate for a given tier in one pass. */
export function getAllFeatureEntitlements(tier: SubscriptionTier): Record<string, FeatureEntitlement> {
  const result: Record<string, FeatureEntitlement> = {};
  for (const key of Object.keys(FEATURE_GATES)) {
    result[key] = getFeatureEntitlement(tier, key);
  }
  return result;
}

// ─── Storage entitlement (stub — see StorageEntitlement doc) ──────────────

export function getStorageEntitlement(_orgId: string): StorageEntitlement {
  return { allowed: true, tracked: false };
}

// ─── Summary ────────────────────────────────────────────────────────────────

export async function getEntitlementSummary(
  db: DbClient,
  orgId: string,
  tier: SubscriptionTier
): Promise<EntitlementSummary> {
  const [seats, locations] = await Promise.all([
    getSeatEntitlement(db, orgId),
    getLocationEntitlement(db, orgId),
  ]);
  return {
    seats,
    locations,
    storage:  getStorageEntitlement(orgId),
    features: getAllFeatureEntitlements(tier),
  };
}
