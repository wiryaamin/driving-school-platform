import type { Organization } from '@platform/types';

/**
 * Trial-expiry enforcement: grace period, then hard lock.
 *
 * Days 0-7 after trial_ends_at: full access continues, a warning banner is
 * shown. Day 8+: access is blocked until a platform admin manually extends
 * or upgrades the org. Pure function of organization.subscription_status +
 * trial_ends_at (already loaded into session by AuthProvider) — no extra
 * fetch, no stored "locked" flag to drift out of sync. Mirrored server-side
 * in supabase/functions/_shared/context.ts so the same 7-day grace window is
 * enforced at the API layer too, not just the UI.
 */
export const TRIAL_GRACE_PERIOD_DAYS = 7;

export interface TrialLockState {
  /** True once the grace period has elapsed — access should be blocked. */
  locked: boolean;
  /** True during trial_ends_at..trial_ends_at+7d — show the warning banner. */
  inGracePeriod: boolean;
  /** Whole days left before lock, only meaningful while inGracePeriod. */
  daysRemaining: number;
}

export function getTrialLockState(organization: Organization | null): TrialLockState {
  const notLocked: TrialLockState = { locked: false, inGracePeriod: false, daysRemaining: 0 };

  if (!organization || organization.subscription_status !== 'trialing' || !organization.trial_ends_at) {
    return notLocked;
  }

  const trialEndsAt = new Date(organization.trial_ends_at).getTime();
  const lockAt       = trialEndsAt + TRIAL_GRACE_PERIOD_DAYS * 86_400_000;
  const now          = Date.now();

  if (now < trialEndsAt) return notLocked;
  if (now >= lockAt) return { locked: true, inGracePeriod: false, daysRemaining: 0 };

  const daysRemaining = Math.max(1, Math.ceil((lockAt - now) / 86_400_000));
  return { locked: false, inGracePeriod: true, daysRemaining };
}
