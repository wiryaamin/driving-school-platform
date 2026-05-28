import type { UUID, Timestamp } from './common.types.js';
import type { SystemRole } from './rbac.types.js';

// ─── JWT Claims (set by Supabase Auth Hook) ─────────────────────────────────

export interface JwtClaims {
  sub: string;                        // user UUID
  email: string;
  organization_id: UUID | null;       // null for platform admins
  active_membership_id: UUID | null;  // null for platform admins
  location_ids: UUID[];               // location-scoped role assignments
  role: SystemRole | null;            // null when user has no active membership
  permissions: string[];
  subscription_tier: string;
  is_platform_admin: boolean;
  impersonator_id?: UUID;             // present only during impersonation sessions
  auth_degraded?: boolean;            // true when auth hook fell back due to a DB error
  iat: number;
  exp: number;
}

// ─── Authenticated User ──────────────────────────────────────────────────────

export interface AuthUser {
  id: UUID;
  email: string;
  organization_id: UUID | null;       // null for platform admins
  active_membership_id: UUID | null;
  location_ids: UUID[];
  role: SystemRole | null;
  permissions: string[];
  subscription_tier: string;
  is_platform_admin: boolean;
  impersonator_id?: UUID;
}

// ─── User Profile (stored in public.profiles) ────────────────────────────────
// Note: organization_id was removed from profiles in Phase 1B.2.
// Org context flows through memberships only — use AuthUser.organization_id.

export interface UserProfile {
  id: UUID;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  language_preference: 'sv' | 'en';
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface UserWithProfile extends AuthUser {
  profile: UserProfile;
}

// ─── Auth State ───────────────────────────────────────────────────────────────

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionData {
  user: AuthUser;
  profile: UserProfile;
}

// ─── Sign-in / Sign-out ───────────────────────────────────────────────────────

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignInResult {
  success: boolean;
  error?: string;
}
