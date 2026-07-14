/** Shared primitive aliases — improves readability in domain types */
export type UUID = string;
export type Timestamp = string; // ISO 8601
export type DateString = string; // YYYY-MM-DD

// ─── Organization ──────────────────────────────────────────────────────────

export type OrganizationStatus = 'active' | 'suspended' | 'terminated';

/**
 * Single source of truth for subscription tiers. Ordered lowest to highest.
 * Mirrored (by necessity — Deno Edge Functions cannot import workspace
 * packages) in supabase/functions/_shared/subscription.ts; keep both in sync.
 */
export const SUBSCRIPTION_TIERS = ['trial', 'starter', 'professional', 'enterprise'] as const;
export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[number];

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'suspended';

/**
 * Platform Plan Catalog — single source of truth for plan identity, marketing
 * copy, and default entitlements. `defaultMaxUsers`/`defaultMaxLocations` are
 * what a plan normally includes; they are NOT the live enforced limit for any
 * given organization — that is always `organizations.max_users`/`max_locations`
 * (independently, per-org overridable; see the Platform Entitlement Service).
 *
 * Static today by design. Every consumer goes through `getPlatformPlan()` /
 * `getAllPlatformPlans()` rather than touching `PLATFORM_PLAN_CATALOG`
 * directly, so a future database-backed catalog (a `platform_plans` table)
 * only requires changing these two functions' internals — no call site
 * anywhere else needs to change.
 *
 * Mirrored (by necessity — Deno Edge Functions cannot import workspace
 * packages) in supabase/functions/_shared/planCatalog.ts; keep both in sync.
 */
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

export interface Organization {
  id: UUID;
  slug: string;
  name: string;
  legal_name: string;
  org_number: string | null;
  vat_number: string | null;
  status: OrganizationStatus;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  trial_ends_at: Timestamp | null;
  settings: Record<string, unknown>;
  go_live_at: Timestamp | null;
  go_live_approved_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

// ─── Location ──────────────────────────────────────────────────────────────

export type LocationStatus = 'active' | 'inactive' | 'archived';

export interface Location {
  id: UUID;
  organization_id: UUID;
  name: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  city: string;
  county: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  status: LocationStatus;
  settings: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface PagedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

// ─── Generic utility types ──────────────────────────────────────────────────

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Pick<T, K>;
