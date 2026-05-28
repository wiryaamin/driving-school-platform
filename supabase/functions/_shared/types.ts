// ─── Supabase Auth Hook ───────────────────────────────────────────────────────

export interface AuthHookClaims {
  aud: string;
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  email?: string;
  phone?: string;
  app_metadata: {
    provider?: string;
    providers?: string[];
    preferred_org_id?: string;   // set by /switch-tenant; consumed by auth hook
    [key: string]: unknown;
  };
  user_metadata: Record<string, unknown>;
  role: string;
  aal: string;
  amr: Array<{ method: string; timestamp: number }>;
  session_id: string;
  [key: string]: unknown;
}

export interface AuthHookPayload {
  user_id: string;
  authentication_method: string;
  claims: AuthHookClaims;
}

export interface CustomClaims {
  organization_id: string | null;
  active_membership_id: string | null;
  role: string | null;
  permissions: string[];
  location_ids: string[];
  subscription_tier: string;
  is_platform_admin: boolean;
  // Set to true when the auth hook fell back to unmodified claims due to a DB error.
  // Allows the client to show a degraded-session warning and trigger a retry.
  auth_degraded?: boolean;
}

export interface AuthHookResponse {
  claims: AuthHookClaims & CustomClaims;
}

// ─── Tenant Switch ────────────────────────────────────────────────────────────

export interface SwitchTenantRequest {
  target_org_id: string;
}

export interface SwitchTenantResponse {
  success: boolean;
  message: string;
}

// ─── Impersonation (foundation only — not yet active) ─────────────────────────
//
// When impersonation is implemented, the platform_superadmin signs an
// impersonation token (stored in platform_admins.active_impersonation_token).
// The /impersonate Edge Function validates it, then calls:
//   get_user_jwt_claims(target_user_id, target_org_id)
// and adds impersonator_id to the returned claims.
//
// The auth hook detects impersonator_id ≠ null and:
//   1. Sets a shorter JWT expiry (e.g. 30 minutes)
//   2. Emits an audit event via event_outbox
//   3. Strips any permission escalation (impersonator cannot exceed target's grants)
//
// Required DB changes (Phase 2+):
//   - platform_admins.active_impersonation_token text
//   - impersonation_sessions table with start/end tracking
//   - get_user_jwt_claims() extended to accept p_impersonator_id
//
// The impersonator_id claim is already present in JwtClaims (packages/types).
// is_impersonating() and auth_impersonator_id() DB helpers are already deployed.

export interface ImpersonationContext {
  impersonator_id: string;
  target_user_id: string;
  target_org_id: string | null;
  session_id: string;
  expires_at: string;
}

// ─── Shared ───────────────────────────────────────────────────────────────────

export interface EdgeFunctionError {
  error: string;
  code?: string;
}
