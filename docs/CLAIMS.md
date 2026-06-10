# JWT Claims Contract

Platform: Trafikskolan SaaS — Swedish Driving School ERP  
Maintained by: Authorization Governance (Phase A series)

---

## Overview

All custom claims are injected into the Supabase access token by the `auth-hook` Edge Function via `get_user_jwt_claims()`. The frontend reads these claims in `AuthProvider` using `parseJwtClaims()`. RLS policies read them via `current_setting('request.jwt.claims', true)`.

---

## Canonical Claim Schema

| Claim | Type | Required | Description |
|---|---|---|---|
| `organization_id` | `uuid \| null` | Yes | The tenant the user belongs to. `null` for platform admins. |
| `active_membership_id` | `uuid \| null` | Yes | The active membership record ID. |
| `location_ids` | `uuid[]` | Yes | Location IDs the user is assigned to. Empty array if none. |
| `role` | `string` | Yes | Primary role name (e.g. `org_owner`, `instructor`). |
| `permissions` | `string[]` | Yes | Flat list of permission codes granted via role assignments. |
| `subscription_tier` | `string \| null` | Yes | Organization's subscription tier (e.g. `starter`, `professional`). |
| `is_platform_admin` | `boolean` | Yes | `true` for users in `platform_admins` table. Controls cross-tenant access. |
| `impersonator_id` | `uuid` | No | Set when a platform admin is acting as a tenant user. Absent in normal sessions. |
| `auth_degraded` | `boolean` | No | Set to `true` if `get_user_jwt_claims()` fell back to unmodified claims due to a DB error. Session is treated as unauthenticated when this is present. |

---

## Claim Details

### `is_platform_admin`

**Source:** `public.is_platform_admin()` — reads this boolean directly from `request.jwt.claims`.  
**Set by:** `get_user_jwt_claims()` — queries `public.platform_admins` table.  
**RLS impact:** Bypasses all tenant-scoped `organization_id` checks when `true`.  
**Contract:** Always a boolean — never absent for authenticated users. Unauthenticated callers receive `false` from `COALESCE(…, false)`.

### `permissions`

**Source:** `get_user_jwt_claims()` — JOIN on `memberships → membership_roles → role_permissions → permissions`.  
**RLS use:** `public.has_permission(code)` and `public.has_any_permission(codes[])`.  
**Frontend use:** `useSessionStore().hasPermission(code)` — checked against this array.  
**Contract:** All codes follow `{domain}:{resource}:{action}` format. An empty array means the user has no explicit permissions (possible for `student` role or broken onboarding).

### `organization_id`

**Contract:** `null` for platform admins. Non-null for all tenant users.  
**RLS use:** `public.auth_organization_id()` — reads this claim.  
**Frontend use:** Used to scope all Supabase queries via `organization_id = …`.

### `impersonator_id`

**Contract:** Absent from JWT in normal sessions — not set to `null`, simply not present.  
**RLS use:** `public.is_impersonating()` — returns `auth_impersonator_id() IS NOT NULL`.  
**Write guard:** RESTRICTIVE policies on `memberships` and `membership_roles` block all writes when this claim is present.  
**Set by:** Impersonation Edge Function (not yet built as of 2026-06-17). Guard is pre-activated.

### `auth_degraded`

**Contract:** Only present when the auth hook failed to enrich the JWT. The frontend treats this as an unauthenticated session and calls `clearSession()`.  
**Purpose:** Prevents a user from operating with a partially-built JWT that lacks `organization_id` or `permissions`.

---

## RLS Helper Functions

| Function | Returns | Description |
|---|---|---|
| `public.auth_organization_id()` | `uuid \| null` | `organization_id` claim |
| `public.auth_membership_id()` | `uuid \| null` | `active_membership_id` claim |
| `public.auth_location_ids()` | `uuid[]` | `location_ids` claim |
| `public.auth_subscription_tier()` | `text \| null` | `subscription_tier` claim |
| `public.auth_impersonator_id()` | `uuid \| null` | `impersonator_id` claim — `null` in normal sessions |
| `public.is_platform_admin()` | `boolean` | Reads `is_platform_admin` boolean claim directly |
| `public.is_impersonating()` | `boolean` | `true` when `impersonator_id` is present |
| `public.has_permission(code)` | `boolean` | Checks `permissions` array for a single code |
| `public.has_any_permission(codes)` | `boolean` | Checks `permissions` array for any of the given codes |

---

## Frontend Consumption

**`parseJwtClaims(token)`** (`apps/web/src/lib/auth/jwt.ts`) — decodes the access token without verification (Supabase verifies on the server) and returns the typed claims object.

**`AuthProvider`** (`apps/web/src/app/providers/AuthProvider.tsx`) — subscribes to Supabase auth events. On each `SIGNED_IN` / `TOKEN_REFRESHED` event:

1. Parses JWT claims
2. Aborts if `auth_degraded = true` (calls `clearSession()`)
3. Fetches `profiles` row (with retry on transient errors; PGRST116 not retried)
4. Fetches `organizations` row if `organization_id` is non-null (same retry logic)
5. Calls `setSession(authUser, profile, organization)`

**`useSessionStore()`** — Zustand store. `hasPermission(code)` checks the `permissions` array loaded from the JWT. No state is persisted to localStorage — the session is fully rebuilt on each page load.

---

## Governance Rules

1. **Never add new claims without updating this file.**
2. **New boolean claims** must be null-safe: `COALESCE((claims ->> 'key')::boolean, false)`.
3. **New array claims** must default to `'{}'::uuid[]` — never `null`.
4. **`is_platform_admin` is the only cross-tenant bypass.** No other claim grants cross-tenant reads.
5. **JWT size warning** is logged if the token exceeds 4KB (set in `get_user_jwt_claims`). If triggered, audit `permissions` array length.
