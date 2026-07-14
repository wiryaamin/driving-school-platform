import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { EmptyState } from '@platform/ui';
import { useSession } from '@shared/hooks/useSession.js';

/**
 * Mirrors FEATURE_GATES in supabase/functions/_shared/subscription.ts exactly.
 * Duplicated by necessity — Deno Edge Functions cannot import workspace
 * packages, so the backend keeps its own copy; this is the frontend's.
 * Keep both in sync when a gate is added, removed, or its tier changes.
 */
const FEATURE_GATES = {
  'finance:sie4:export':         'starter',
  'finance:vat:report':          'starter',
  'finance:ledger:read':         'starter',
  'finance:reconciliation:run':  'professional',
  'finance:payroll:run':         'professional',
  'finance:financial-close:run': 'professional',
  'finance:accruals:manage':     'professional',
  'finance:fixed-assets:manage': 'professional',
  'finance:fortnox:sync':        'professional',
  'communication:templates:manage': 'starter',
  'corporate:customers:manage':     'starter',
  'admin:data-migration:run':       'professional',
} as const;

const TIER_ORDER = ['trial', 'starter', 'professional', 'enterprise'] as const;
const TIER_LABEL: Record<string, string> = {
  trial: 'Testperiod', starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise',
};

function tierSatisfies(userTier: string, requiredTier: string): boolean {
  const userIdx = TIER_ORDER.indexOf(userTier as (typeof TIER_ORDER)[number]);
  const reqIdx  = TIER_ORDER.indexOf(requiredTier as (typeof TIER_ORDER)[number]);
  if (userIdx === -1) return false;
  return userIdx >= reqIdx;
}

interface SubscriptionGateProps {
  /** Feature key — must match a FEATURE_GATES entry declared server-side. */
  feature: keyof typeof FEATURE_GATES;
  /** Rendered when the org's tier is insufficient — defaults to an upgrade notice. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Declarative subscription-tier guard component — the frontend counterpart to
 * requireFeature(ctx, key) (supabase/functions/_shared/subscription.ts).
 * Renders children only when the org's subscription tier satisfies the
 * feature's required tier, replacing what would otherwise be a raw 402 from
 * the gated Edge Function with the approved subscription experience.
 *
 * @example
 * <SubscriptionGate feature="finance:ledger:read">
 *   <LedgerContent />
 * </SubscriptionGate>
 */
export function SubscriptionGate({ feature, fallback, children }: SubscriptionGateProps) {
  const { user } = useSession();

  const requiredTier = FEATURE_GATES[feature];
  const currentTier   = user?.subscription_tier ?? 'trial';
  const allowed       = user?.is_platform_admin === true || tierSatisfies(currentTier, requiredTier);

  if (allowed) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;

  return (
    <EmptyState
      icon={Lock}
      title={`Kräver ${TIER_LABEL[requiredTier] ?? requiredTier}-plan eller högre`}
      description={`Din nuvarande plan är ${TIER_LABEL[currentTier] ?? currentTier}. Kontakta din kontoansvarige för att uppgradera.`}
    />
  );
}
