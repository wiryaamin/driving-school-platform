import type { SubscriptionTier } from '@platform/types';

// Single source of truth for the Swedish display label of each subscription
// tier. Previously duplicated identically across 7 Platform Administration
// files — consolidated here per the Platform Billing Hardening Sprint.
//
// Typed as Record<string, string> (not Record<SubscriptionTier, string>) so
// callers indexing by a DB-sourced `subscription_tier: string` field keep
// working without a wider retype of every org/subscription hook — the
// `satisfies` clause still guarantees this literal covers all four tiers
// and only those four at declaration time.
export const TIER_LABEL: Record<string, string> = {
  trial:        'Trial',
  starter:      'Starter',
  professional: 'Professional',
  enterprise:   'Enterprise',
} satisfies Record<SubscriptionTier, string>;
