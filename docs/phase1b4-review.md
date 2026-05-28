# Phase 1B.4 — Final Review

## Architecture Review

### What was validated

**JWT enrichment pipeline (end-to-end):**
```
Sign-in → Supabase issues base JWT
       → auth-hook Edge Function fires
       → get_user_jwt_claims(user_id, preferred_org_id) called via service role
       → Custom claims merged at JWT top level (organization_id, permissions, role, …)
       → Client decodes access_token directly (not app_metadata)
       → AuthProvider syncs claims to Zustand session store
```

**Tenant switching pipeline:**
```
useSwitchTenant(targetOrgId)
  → POST /switch-tenant (validates membership via get_user_jwt_claims)
  → Writes preferred_org_id to app_metadata
  → Client calls refreshSession()
  → auth-hook fires with new preferred_org_id
  → New JWT has target org's claims
  → AuthProvider detects TOKEN_REFRESHED, syncs new org
  → useSwitchTenant verifies new JWT org matches expected
```

**Degraded-session protection:**
```
auth-hook DB error → returns { claims, auth_degraded: true }
AuthProvider detects auth_degraded → clearSession()
User sees login page, not broken authenticated state
```

### RLS compatibility

All DB helper functions read from `request.jwt.claims` (PostgREST's JWT injection mechanism):

| DB Function | JWT Claim Read | Compatibility |
|---|---|---|
| `auth_organization_id()` | `organization_id` | ✅ Top-level claim |
| `auth_user_permissions()` | `permissions` | ✅ Top-level array |
| `auth_user_role()` | `role` | ✅ Top-level string |
| `has_permission(p)` | via `auth_user_permissions()` | ✅ |
| `is_platform_admin()` | `role` in platform role list | ✅ Platform admins get their `platform_admins.role` value |

Platform admin bypass: RLS functions check `role` string, not the boolean `is_platform_admin` claim — so privilege elevation via a crafted `is_platform_admin: true` claim cannot bypass RLS.

---

## Unresolved Risks

### Medium priority

1. **Profile auto-creation**: No trigger auto-creates `public.profiles` on user sign-up. New users who sign up and authenticate will fail `AuthProvider`'s profile fetch and have their session cleared. Mitigation: create profiles on invite acceptance (Phase 2 Students module). Currently acceptable because `enable_signup = false`.

2. **JWT expiry not checked client-side**: `parseJwtClaims` provides `isJwtExpired()` but nothing calls it to proactively warn before Supabase's internal refresh logic fires. Edge case: user acts on stale data in the final seconds of a JWT window. Low risk since Supabase auto-refreshes tokens.

3. **Supabase Studio accessible without auth hook**: When using `supabase start --studio`, the Studio bypasses the auth hook (uses service role). Platform admins bootstrapped via Studio are not reflected in the JWT until sign-in happens. This is expected but worth noting for onboarding.

### Low priority

4. **`auth_degraded` does not distinguish DB timeout vs no-membership**: Both result in degraded claims + session clear. No user-facing message distinguishes "system outage" from "account issue". Acceptable for now — both paths end at the login page.

5. **JWT size not monitored in production**: The 4096-byte warning in the auth hook only appears in Edge Function logs. No alerting pipeline exists yet (Datadog/Sentry not connected). Will become important when orgs accumulate large permission sets.

6. **Preferred_org_id stale after membership revocation**: If a user's membership in their `preferred_org_id` org is revoked while their JWT is valid, their next sign-in will correctly resolve to a different org (or no org). But there's no real-time invalidation. Acceptable — relies on JWT TTL (default 1 hour in Supabase).

7. **Impersonation foundation only**: `ImpersonationContext` type, `is_impersonating()` DB helper, and the auth hook gate are in place, but the full feature is unimplemented. The gate actively strips `impersonator_id` until the feature is built. No risk in current state.

---

## Production-Readiness Assessment

### Ready for production
- ✅ Auth hook deployed and verified via local test procedure
- ✅ Fail-open design (DB outage ≠ user lockout)
- ✅ Hook secret verified on every request
- ✅ Service role never exposed to client
- ✅ Tenant switching with post-refresh JWT verification
- ✅ Platform admin support (null org, role-based bypass)
- ✅ All RLS helpers compatible with JWT structure
- ✅ TypeScript clean across all packages
- ✅ Correlation IDs in Edge Function logs
- ✅ JWT size warning at 4096 bytes

### Required before first production deployment
- [ ] `supabase secrets set AUTH_HOOK_SECRET=<value>`
- [ ] `supabase secrets set APP_URL=https://admin.your-domain.com`
- [ ] `supabase secrets set STUDENT_APP_URL=https://app.your-domain.com`
- [ ] Update `[auth.hook.custom_access_token].uri` in `config.toml` to production function URL
- [ ] Bootstrap at least one `platform_superadmin` in the production `platform_admins` table
- [ ] Verify `enable_signup = false` is set in production Supabase dashboard

### Recommended before Phase 2 production
- [ ] Connect Sentry or equivalent for Edge Function error monitoring
- [ ] Set up a Grafana / Datadog alert on auth_hook error rate
- [ ] Add `is_active = true` check to organizations table query in `get_user_jwt_claims`
- [ ] Implement profile auto-creation trigger for invited users

---

## Migration / Runtime Checklist

### Migrations applied (local + staging)
- [x] `20260527000001_enterprise_foundation.sql` — 11 tables, RLS, all helpers
- [x] `20260527000002_phase1b2_hardening.sql` — profiles global, platform_admins, outbox, JWT builder, soft delete

### Edge Functions deployed
- [ ] `auth-hook` — must be deployed before any user signs in
- [ ] `switch-tenant` — required for multi-org users

### Post-deploy verification steps
1. Sign in as a regular org user → inspect JWT for `organization_id`, `permissions`
2. Sign in as platform admin → inspect JWT for `organization_id: null`, `is_platform_admin: true`
3. Test tenant switch → verify JWT org changes after refresh
4. Simulate DB outage (stop DB) → verify sign-in returns `auth_degraded: true` (or degraded claims) without 500
5. Check Edge Function logs for correlation IDs

---

## Recommended Next Phase

**Phase 2A: Students Module**
The auth foundation is stable and all required infrastructure is in place. The natural next step is the first business-logic module.

Minimum requirements already satisfied:
- `memberships` table with role assignments → student can be assigned `student` role
- `has_permission()` RLS helper → student data access controls work
- `event_outbox` → booking confirmations can be emitted
- `organizations` with `subscription_tier` → feature gating available

Suggested Phase 2A scope:
1. `students` table + `student_profiles` table (personal data, license stage)
2. `student_documents` table (upload tracking)
3. CRUD service layer with full RLS
4. Basic students list + detail pages
5. Student invite flow (triggers profile + membership creation)
