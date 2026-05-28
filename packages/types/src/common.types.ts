/** Shared primitive aliases — improves readability in domain types */
export type UUID = string;
export type Timestamp = string; // ISO 8601
export type DateString = string; // YYYY-MM-DD

// ─── Organization ──────────────────────────────────────────────────────────

export type OrganizationStatus = 'active' | 'suspended' | 'terminated';

export type SubscriptionTier = 'trial' | 'starter' | 'professional' | 'enterprise';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'suspended';

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
