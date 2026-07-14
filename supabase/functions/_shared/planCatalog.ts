/**
 * Platform Plan Catalog — Deno Edge Function mirror.
 *
 * Must mirror packages/types/src/common.types.ts's PLATFORM_PLAN_CATALOG —
 * this file cannot import that package (Deno Edge Functions may not import
 * workspace packages), so the catalog is duplicated by necessity and must be
 * kept in sync. Same rule already applies to SUBSCRIPTION_TIERS in
 * supabase/functions/_shared/subscription.ts.
 *
 * `defaultMaxUsers`/`defaultMaxLocations` are what a plan normally includes —
 * NOT the live enforced limit for any given organization, which is always
 * `organizations.max_users`/`max_locations` (see _shared/entitlements.ts).
 *
 * Static today by design. Every consumer goes through `getPlatformPlan()` /
 * `getAllPlatformPlans()` so a future database-backed catalog only requires
 * changing these two functions' internals.
 */

import type { SubscriptionTier } from './subscription.ts';
import { SUBSCRIPTION_TIERS } from './subscription.ts';

export interface PlatformPlanDefinition {
  id: SubscriptionTier;
  name: string;
  description: string;
  defaultMaxUsers: number | null;
  defaultMaxLocations: number | null;
  modules: string[];
  features: string[];
}

export const PLATFORM_PLAN_CATALOG: Record<SubscriptionTier, PlatformPlanDefinition> = {
  trial: {
    id: 'trial',
    name: 'Trial',
    description: '14-dagars provperiod med grundläggande funktioner.',
    defaultMaxUsers: 5,
    defaultMaxLocations: 1,
    features: ['Upp till 5 användare', '1 plats', 'E-postsupport'],
    modules: ['Bokningar', 'Elever'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Perfekt för mindre trafikskolor med en enda plats.',
    defaultMaxUsers: 10,
    defaultMaxLocations: 1,
    features: ['Upp till 10 användare', '1 plats', 'Prioriterad e-postsupport'],
    modules: ['Bokningar', 'Elever', 'Ekonomi', 'Lärare'],
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'Idealisk för medelstora trafikskolor med flera platser.',
    defaultMaxUsers: 25,
    defaultMaxLocations: 3,
    features: ['Upp till 25 användare', 'Upp till 3 platser', 'Prioriterad support', 'Avancerade rapporter'],
    modules: ['Bokningar', 'Elever', 'Ekonomi', 'Lärare', 'Företagskunder', 'Kommunikation', 'Rapporter'],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'För stora trafikskolor och kedjor med anpassade behov.',
    defaultMaxUsers: null,
    defaultMaxLocations: null,
    features: ['Obegränsade användare', 'Obegränsade platser', 'Dedikerad support', 'Anpassad integrering', 'SLA-garanti'],
    modules: ['Bokningar', 'Elever', 'Ekonomi', 'Lärare', 'Företagskunder', 'Kommunikation', 'Rapporter', 'API-åtkomst', 'AI-funktioner', 'Elevportal', 'Målsmannaportalen'],
  },
};

export function getPlatformPlan(tier: SubscriptionTier): PlatformPlanDefinition {
  return PLATFORM_PLAN_CATALOG[tier];
}

export function getAllPlatformPlans(): PlatformPlanDefinition[] {
  return SUBSCRIPTION_TIERS.map((tier) => PLATFORM_PLAN_CATALOG[tier]);
}
