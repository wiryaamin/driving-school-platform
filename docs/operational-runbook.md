# TrafikskolaOS — Operational Runbook

Platform: Supabase Hosted (project ref `ulgsndzfksphquqakelq`)
SPA: React 19 + Vite, deployed as static assets
Edge Functions: Deno, deployed to Supabase Functions

---

## 1. Platform Startup Checklist

Before going live with any environment (staging or production), verify:

### Auth Hook
1. Navigate to Supabase Dashboard → Authentication → Hooks
2. Confirm **Custom Access Token Hook** is configured:
   - URI: `https://ulgsndzfksphquqakelq.supabase.co/functions/v1/auth-hook`
   - Secret: matches `AUTH_HOOK_SECRET` in function secrets
3. Sign in with a test user and confirm JWT contains `organization_id`, `role`, `permissions[]`, `is_platform_admin`
4. If login loops back to `/auth/login`, the auth hook is failing — check function logs immediately

### Environment Variables (apps/web/.env.local or build env)
```
VITE_SUPABASE_URL=https://ulgsndzfksphquqakelq.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_APP_ENV=production
```

### Edge Function Secrets
```bash
supabase secrets set \
  AUTH_HOOK_SECRET="v1,whsec_<key>" \
  WORKER_SECRET="<key>" \
  APP_URL="https://your-app-domain.com" \
  APP_ENV="production" \
  APP_VERSION="1.0.0" \
  --project-ref ulgsndzfksphquqakelq
```

**`WORKER_SECRET` has a second copy — both must be updated together.** The
`event-worker-tick` and `communication-worker-tick` pg_cron jobs authenticate
to their Edge Functions via `WORKER_SECRET` read from **Supabase Vault**
(`invoke_event_worker()`/`invoke_communication_worker()`,
`SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'WORKER_SECRET'`),
which is a *separate* store from the Edge Function secret set above. Rotating
only the Edge Function secret (`supabase secrets set WORKER_SECRET=...`)
without also updating the vault copy leaves the two out of sync — every cron
tick then fails with a silent 401 (visible only in `net._http_response`, not
in `cron.job_run_details`, which reports "succeeded" regardless since it only
confirms the async HTTP call was queued). This happened in production for
~2 days (2026-08-02 → 2026-08-04) undetected, during which no automated
notification of any kind (booking confirmations, reminders, waitlist
promotion, etc.) was actually delivered — `event_outbox` silently accumulated
unprocessed rows the whole time.

When rotating `WORKER_SECRET`, always update both:
```bash
supabase secrets set WORKER_SECRET="<new-value>" --project-ref ulgsndzfksphquqakelq
```
```sql
-- Get the vault secret's id first:
select id from vault.secrets where name = 'WORKER_SECRET';
select vault.update_secret('<id-from-above>', '<same-new-value>');
```
Then verify: `select status_code from net._http_response order by created desc limit 3;` should show `200`, not `401`.

### First Org Bootstrap
Run `supabase/seed/bootstrap_org_admin.sql` in the SQL Editor (edit `v_user_id` and `v_user_email` first).

---

## 2. Health Endpoints

The `health` Edge Function provides three endpoints for monitoring:

| Route | Purpose | Auth | Expected Response |
|---|---|---|---|
| `GET /functions/v1/health/live` | Liveness (isolate alive) | None | `200 { status: "ok" }` |
| `GET /functions/v1/health/ready` | Readiness (DB connectivity) | None | `200 { status: "ok", checks: { database: "ok" } }` |
| `GET /functions/v1/health` | Full health report | None | `200 { status, checks, version, env, response_ms }` |

**Uptime monitoring configuration:**

- Primary check: `GET /functions/v1/health/live` — no DB call, responds in ~5ms
- Secondary check: `GET /functions/v1/health/ready` — confirms DB reachability
- Alert threshold: 503 response or >5s response time

**Degraded response:**
```json
{
  "status": "degraded",
  "timestamp": "2026-06-25T10:00:00.000Z",
  "checks": { "database": "failed" },
  "error": "Database connectivity check failed"
}
```

When `status` is `degraded`, the endpoint returns HTTP 503.

**Gap, discovered 2026-08-04 (see `WORKER_SECRET` note above):** none of these
three endpoints detect a stalled `event_outbox`/`communication-worker` cron
pipeline — that failure mode is invisible to `health`/`health/live`/`health/ready`
entirely, since it's a pg_cron → pg_net → Edge Function auth failure, not an
Edge Function or database liveness issue. Until a dedicated check exists,
periodically verify manually:
```sql
select count(*) from event_outbox where status = 'pending' and created_at < now() - interval '10 minutes';
select status_code, count(*) from net._http_response where created > now() - interval '15 minutes' group by status_code;
```
A non-zero pending backlog older than a few minutes, or any `401`/non-`200`
status codes, means the automation pipeline is not actually running even
though `cron.job_run_details` will still report every tick as "succeeded."

---

## 3. Rate Limiting

Rate limiting is implemented in `supabase/functions/_shared/rate-limit.ts` using an in-memory sliding-window counter per isolate.

### Current Limits

| Tier | Limit | Window | Applies to |
|---|---|---|---|
| `ip_public` | 30 req/min | 60 seconds | Unauthenticated endpoints (`/public-booking`, `/public-catalog`) |
| `ip_auth` | 200 req/min | 60 seconds | All authenticated endpoints (IP-level) |
| `user_default` | 120 req/min | 60 seconds | Per authenticated user |
| `user_write` | 40 req/min | 60 seconds | Write operations (POST/PATCH/DELETE) |
| `platform_admin` | 600 req/min | 60 seconds | Platform admin workspace |

### Response when rate limited (HTTP 429)
```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later.",
  "retry_after": 47,
  "trace_id": "<correlation-id>"
}
```

Headers:
- `Retry-After: <seconds>`
- `X-RateLimit-Limit: <limit>`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: <unix timestamp>`

### Architecture note
The in-memory rate limiter is per-isolate. Multiple isolates running concurrently each maintain independent counters. This provides effective burst protection but does not enforce a strict global limit. For global rate limiting, configure Supabase Edge Function rate limits in the Dashboard under **Functions → Rate Limits**.

### Adding rate limiting to a new function
```typescript
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';

// After buildEdgeContext:
const ipGuard = enforceIpRateLimit(req, 'ip_auth', correlationId);
if (ipGuard) return ipGuard;

const userGuard = enforceUserRateLimit(ctx.actorId!, 'user_write', ctx.correlationId);
if (userGuard) return userGuard;
```

---

## 4. Security Headers

All responses from `serveCors()` automatically include:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Cache-Control` | `no-store` |

These are injected in `cors.ts` `serveCors()` and require no per-function action.

---

## 5. Structured Logging

All Edge Functions emit structured JSON logs. Every entry includes `level`, `event`, `timestamp`, and a `function` field (when using `createFunctionLogger`).

### Standard request log fields
```json
{
  "level": "info",
  "event": "request.started",
  "function": "students",
  "method": "GET",
  "path": "/functions/v1/students",
  "correlation_id": "abc-123",
  "org_id": "uuid-of-org",
  "actor_id": "uuid-of-user",
  "timestamp": "2026-06-25T10:00:00.000Z"
}
```

```json
{
  "level": "info",
  "event": "request.completed",
  "function": "students",
  "method": "GET",
  "path": "/functions/v1/students",
  "status": 200,
  "correlation_id": "abc-123",
  "duration_ms": 45,
  "timestamp": "2026-06-25T10:00:00.000Z"
}
```

### Finding logs in Supabase Dashboard
Navigate to: **Edge Functions → Logs**
Filter by function name or search for `correlation_id` values from error reports.

### Correlation IDs
Every request includes an `X-Correlation-ID` header in the response.
Frontend clients propagate this header in bug reports.
When investigating an incident, search Supabase logs for the correlation ID.

---

## 6. Subscription Enforcement

Subscription enforcement is implemented as a foundation layer in `supabase/functions/_shared/subscription.ts`.

Current enforcement status: **Foundation ready, not yet applied to routes.**

### How to apply enforcement to a route
```typescript
import { requireSubscriptionTier, requireFeature } from '../_shared/subscription.ts';

// Require professional tier or higher:
const guard = requireSubscriptionTier(ctx, 'professional');
if (guard) return guard;

// Require a specific feature gate:
const guard = requireFeature(ctx, 'finance:payroll:run');
if (guard) return guard;
```

### Response when subscription insufficient (HTTP 402)
```json
{
  "code": "SUBSCRIPTION_REQUIRED",
  "message": "This feature requires the 'professional' plan or higher. Your current plan is 'trial'.",
  "required_tier": "professional",
  "current_tier": "trial",
  "trace_id": "<correlation-id>"
}
```

### Feature gate registry
Located in `_shared/subscription.ts` → `FEATURE_GATES`. Update this map when gating new features.

---

## 7. Deployment Procedure

### Edge Functions
```bash
# Deploy all functions
supabase functions deploy --project-ref ulgsndzfksphquqakelq

# Deploy a single function
supabase functions deploy students --project-ref ulgsndzfksphquqakelq
```

### Database Migrations
```bash
# Apply pending migrations to hosted project
supabase db push --linked

# Verify migration status
supabase migration list --linked
```

### Frontend
```bash
pnpm typecheck      # must pass
pnpm build          # must succeed
# then deploy dist/ to your hosting provider
```

---

## 8. Incident Response

### Auth loop (users redirected to login repeatedly)

**Cause**: Auth hook is failing or misconfigured.

1. Check Dashboard → Edge Functions → auth-hook → Logs
2. Verify `AUTH_HOOK_SECRET` is set correctly in function secrets
3. Verify auth hook URI is configured in Dashboard → Authentication → Hooks
4. Check that the auth hook function is deployed (not returning 404)
5. If `auth_degraded: true` appears in JWT — the hook ran but the DB call failed. Check DB connectivity.

### Database connectivity failure

1. Check `GET /functions/v1/health/ready`
2. If `database: failed` — check Supabase Dashboard → Database → Health
3. Connection pool exhausted: check pgBouncer settings in Dashboard → Settings → Database
4. In a persistent outage: users with valid JWTs can still authenticate but queries will fail

### Rate limit alerts

If users report 429 errors:
1. Check for traffic spikes in Supabase Edge Function metrics
2. Identify abusive IPs from Supabase logs
3. Temporarily lower limits by updating `RATE_LIMIT_TIERS` in `_shared/rate-limit.ts` and redeploying
4. Block persistent abusers via Supabase Dashboard → Edge Functions → deny list

### JWT size warning

If `auth-hook` logs contain `jwt_size_warning`:
1. The JWT is approaching the 4096 byte cookie limit
2. Reduce permissions array size by consolidating permission codes
3. Or reduce `location_ids` if the user has many location assignments

---

## 9. Edge Function Reference

### Auth Functions
| Function | Purpose | Auth |
|---|---|---|
| `auth-hook` | Adds custom claims to JWT | Supabase internal |
| `switch-tenant` | Changes active organization | JWT |

### Operational Functions (modern `buildEdgeContext` pattern)
| Function | Routes |
|---|---|
| `students` | CRUD + batch |
| `instructors` | CRUD |
| `slots` | CRUD + availability checks |
| `bookings` | CRUD + cancel/reschedule |
| `invoices` | CRUD + issue/void |
| `payments` | CRUD + allocate |
| `wallet` | Balance + ledger + grant |
| `packages` | Offerings + catalog |
| `notifications` | CRUD + preferences |
| `dashboard` | Aggregated KPIs |
| `corporate-customers` | CRUD |
| `corporate-contracts` | CRUD |
| `platform-admin` | Platform control plane |
| `health` | Liveness + readiness |

### Legacy Functions (jwt.ts pattern — migration pending)
These 27 functions use the older `enrichUserFromJwt` auth pattern. They are protected by PostgREST RLS but do not use explicit `buildEdgeContext` JWT verification. Migration is tracked as a future hardening task.

Functions: `orders`, `enrollments`, `communications`, `data-migration`, `fortnox`, `package-consumption`, `campaigns`, `waitlist`, `swedish-vat`, `swedish-settings`, `student-packages`, `sie4`, `reports`, `replay-architecture`, `regulatory-exports`, `refunds`, `reconciliation`, `payroll`, `ledger-replay`, `ledger-governance`, `ledger`, `fixed-assets`, `financial-close`, `dunning`, `discounts`, `compliance`, `accruals`

### Background Workers
| Function | Trigger |
|---|---|
| `event-worker` | pg_cron every 1 minute (`event-worker-tick`) — configured and live as of 2026-07-21 |
| `communication-worker` | pg_cron every 2 minutes (`communication-worker-tick`), plus dispatched directly by `event-worker` for `Communication.Requested` events — configured and live as of 2026-07-21 |

Full architecture, wrapper functions, Vault secret handling, monitoring guidance, and operational runbook (manual invocation, health checks, troubleshooting, secret rotation): `docs/SCHEDULED_JOBS_ARCHITECTURE.md`. In particular, do not use `net._http_response` as a health signal for these workers — see that document §10/§12 for why, and use `worker_run_log` instead.

---

## 10. Recovery Procedures

### Restore from backup
Supabase provides point-in-time recovery on Pro+ plans.
Dashboard → Settings → Backups → Restore

### Roll back a migration
Migrations are append-only. To roll back, create a new migration that undoes the change.
Never edit or delete historical migrations.

### Emergency platform admin access
If the normal admin account is locked out:
1. Use the Supabase Dashboard SQL Editor
2. Run `supabase/seed/bootstrap_org_admin.sql` with updated credentials
3. This re-creates or updates the platform admin record

### Reset a specific Edge Function
If a function is stuck in a bad state (cold-start loop):
```bash
supabase functions delete <function-name> --project-ref ulgsndzfksphquqakelq
supabase functions deploy <function-name> --project-ref ulgsndzfksphquqakelq
```

---

## 11. Frontend Error Monitoring

The SPA (`apps/web`) forwards production client-side errors to Sentry through the existing `@platform/utils` logger — there is no separate/parallel reporting path. `logger.error(...)` (already used throughout `apps/web/src`) is the single call site every error goes through; `apps/web/src/core/monitoring/index.ts` registers the Sentry sink that `logger.error()` forwards to.

### What is captured
- React rendering failures — `apps/web/src/shared/components/errors/ErrorBoundary.tsx` (mounted once, around `AppRouter`) calls `logger.error()` from `componentDidCatch`.
- Runtime exceptions and unhandled promise rejections — captured automatically by the Sentry SDK's default `GlobalHandlers` integration once `Sentry.init()` runs (no hand-rolled `window.onerror`/`unhandledrejection` listeners were added, to avoid a second, parallel capture path).
- Bootstrap failures (i18n init) — `apps/web/src/main.tsx`'s top-level `.catch()`, which runs before the React tree exists.

### Enable/disable behavior
Monitoring is environment-aware and **off by default**:
- Never initializes in a development build, regardless of configuration (`import.meta.env.PROD` must be true).
- Never initializes without `VITE_SENTRY_DSN` set. Empty by default in `.env.example`.
- When disabled, the Sentry SDK is fully dead-code-eliminated from the production bundle (confirmed: ~0.03 kB `monitoring` chunk with no DSN vs. ~86 kB with one set) — there is no runtime or bundle-size cost until activated.
- Console logging (dev and prod) is unchanged either way — monitoring is additive, not a replacement.

### Activating it (once a Sentry account/project exists)
1. Create a Sentry project (React platform), EU data region recommended for GDPR alignment with the platform's Sweden-first posture.
2. Set `VITE_SENTRY_DSN` in the production build environment (CI/hosting provider env vars — never commit a real DSN to `.env.local`).
3. Optional, for readable production stack traces: set `build.sourcemap` to `'hidden'` in `apps/web/vite.config.ts` and add `@sentry/vite-plugin` with a `SENTRY_AUTH_TOKEN` to upload and strip source maps from the deployed bundle. Not enabled by default — shipping source maps without an upload-and-delete step would expose readable source in `dist/`.
4. Redeploy the frontend (`pnpm build`, then deploy `dist/` as usual — no Edge Function or backend change is involved).
5. Verify: trigger a test error (e.g. temporarily throw inside a route component) and confirm the event appears in the Sentry project.

### Privacy / GDPR
- `sendDefaultPii` is explicitly `false` — no request bodies, cookies, or IP-derived PII are attached by default.
- Only non-PII operational tags are attached (`organization_id`, `role`, `is_platform_admin`, `subscription_tier`), set from `AuthProvider` via `setMonitoringTags()`. Email, name, and personnummer are never sent — `beforeSend` additionally strips `email`/`ip_address`/`username` defensively if ever present.
- Performance monitoring and session replay are explicitly disabled (`tracesSampleRate: 0`, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`) — this integration is error monitoring only.

### Finding errors
Once activated: Sentry project → Issues, filtered by `environment` (`production`/`staging`) and the `organization_id`/`role` tags for tenant-specific triage. Correlate with backend Edge Function logs (Section 5 above) using the timestamp and, where the error originated from an API call, the `X-Correlation-ID`.

---

## 12. Stripe Payment Webhook Configuration

`supabase/functions/stripe-webhook/index.ts` verifies Stripe's HMAC-SHA256 request signature and, on `checkout.session.completed`, calls `record_payment()` to settle the invoice. The implementation is correct (signature verification, 5-minute replay window, idempotency on `payment_request.status`) — it fails closed with `503 {"error":"Webhook not configured"}` when its one required secret is absent, which is the current live state on this project: `STRIPE_WEBHOOK_SECRET` does not exist in `supabase secrets list` for `ulgsndzfksphquqakelq`. Checkout *session creation* (`student-portal/index.ts`, uses the org's own `stripe_secret_key`) is unaffected by this — customers can still be redirected to Stripe and charged. What's blocked is exclusively the confirmation step: the platform never learns the payment succeeded, so the invoice/wallet is never updated automatically, and reconciliation must currently be manual.

### Required configuration (not yet performed — no Stripe account/credentials available to this runbook's author at the time of writing)
1. In the Stripe Dashboard → Developers → Webhooks, add an endpoint: `https://ulgsndzfksphquqakelq.supabase.co/functions/v1/stripe-webhook`.
2. Select events: `checkout.session.completed`, `checkout.session.expired`.
3. Copy the endpoint's signing secret (starts `whsec_`).
4. Set it: `supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_<value>" --project-ref ulgsndzfksphquqakelq`.
5. Trigger a real test event from the Stripe Dashboard ("Send test webhook") and confirm `stripe-webhook`'s logs (Edge Functions → Logs) show `stripe-webhook: payment settled`, and that the corresponding `payment_request` row's `status` becomes `completed`.

No code change is required — this is an operational configuration gap only.

---

## 13. Supabase Auth SMTP Configuration

*(Operational state and fix steps only — for the long-term email architecture behind this decision, see `docs/EMAIL_ARCHITECTURE.md`.)*

**Current live state (confirmed, not assumed — re-verified Sprint 4B):** Supabase Auth on `ulgsndzfksphquqakelq` is still using Supabase's own default, rate-limited email sender. No custom SMTP provider is configured. **Refinement from Sprint 4B:** the quota is not a hard zero — it's a very small trickle. A same-day re-verification saw one probe return `200` (the default sender's window happened to have quota available) immediately followed by a second probe returning the original `429 {"error_code":"over_email_send_rate_limit"}`. The conclusion is unchanged (this sender cannot be relied on for real invitation/recovery volume and custom SMTP is still required before pilot go-live) but "always 429" was an overstatement of the original Sprint 2B finding — "rate-limited to an operationally-unusable trickle" is the precise, now twice-confirmed characterization. **Caution for future re-verification:** unlike a guaranteed-429 probe, a probe that lands inside the trickle's window creates a real `auth.users` row — Sprint 4B's first re-check did exactly this and required a manual cleanup (`DELETE /auth/v1/admin/users/{id}` via service_role) that earlier sprints never needed. Prefer a single probe per verification pass, not a loop, and check for a stray row afterward if a `200` comes back unexpectedly.

**Impact:** any flow requiring Supabase Auth to send an email — new signup confirmation, password reset, admin invitation — is currently blocked. This is upstream of application code; nothing in this repository can work around it.

**Required fix (Dashboard + DNS + Resend account — none of it executable via this repository's tooling):** configure a custom SMTP provider under Dashboard → Authentication → Email → SMTP Settings. Full step-by-step runbook, including exact DNS record types and Resend's SMTP connection details: `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.2, "Supabase Auth SMTP Runbook."

**Verification after fixing:**
```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "https://ulgsndzfksphquqakelq.supabase.co/auth/v1/signup" \
  -H "apikey: <VITE_SUPABASE_ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"email":"<a-real-checkable-inbox>@<verified-domain>","password":"<throwaway-test-password>"}'
```
Expect `200`/`201`, not `429`. This is the same command used to find the blocker — reusing it to confirm the fix avoids any ambiguity about whether the underlying cause actually changed.

**Frontend readiness (Sprint 4, Authentication Recovery Module — resolved, no longer a blocker):** a second, independent gap was found and closed alongside SMTP provisioning — the frontend previously had no route or session logic to consume a Supabase Auth recovery/invite email link at all (`detectSessionInUrl: false`, no `/auth/reset-password` or `/auth/accept-invite` route, and the "Glömt lösenordet?" button on the login page had no handler). This meant password reset and invitation acceptance would still have failed even with SMTP working. The full recovery/invitation lifecycle is now implemented:

- `/auth/forgot-password` — request a reset link (`ForgotPasswordPage.tsx`)
- `/auth/reset-password` — consumes the recovery link, sets a new password, returns to login (`ResetPasswordPage.tsx`)
- `/auth/accept-invite` — consumes the invitation link, sets an initial password, routes into the dashboard (`AcceptInvitePage.tsx`)
- `invite-user` Edge Function — backs the "Bjud in" dialog in Settings → Users (`UsersSettingsPage.tsx`), which already called this function name before it existed; issues a real Supabase Auth invite for new emails, or adds a direct membership for emails that already have an account. **Sprint 4B fix:** an email with a *pending, unaccepted* invitation to a different org (a `profiles` row exists, but `auth.users.last_sign_in_at` is still null) now returns `409 PENDING_INVITATION_ELSEWHERE` instead of silently creating a membership the person has no way to ever discover or reach — the earlier behavior sent no email on the existing-user path, so a second invite before the first was accepted was a true dead end.

Both callback routes handle either link format Supabase Auth's email templates can produce (`?token_hash=&type=` via `verifyOtp()`, or the default template's `#access_token=&refresh_token=` via `setSession()`), so no Dashboard email-template customization is required for this to work — see `apps/web/src/modules/auth/lib/authCallback.ts` for the exact detection logic. Full architecture, the session model, and the complete authentication state diagram: `docs/AUTHENTICATION_ARCHITECTURE.md` (Sprint 4A). **These two paths (`/auth/reset-password`, `/auth/accept-invite`) must be added to the Supabase Dashboard's Redirect URL allowlist** (Authentication → URL Configuration) for both the production origin and `http://localhost:5173`, or GoTrue will reject the `redirectTo` and fall back to the Dashboard's default Site URL — this is a Dashboard-only step, listed in the Environment Provisioning Checklist below.

---

## 14. GDPR — Data Subject Requests (Manual Procedure)

No automated data-subject-request workflow exists in Version 1.0 (by design — see Handbook Technical Debt Register). This section is the actual, current, staff-executed procedure. It intentionally requires direct Supabase Dashboard / SQL Editor access — do not build a self-service flow against this section without an Architecture Review.

### Consent (already implemented, no manual step needed)
`students.data_processing_consent`, `marketing_consent`, `gdpr_consent_given_at`, `gdpr_consent_version` are captured automatically at registration/enrollment (`students/index.ts`, `enrollments/index.ts`). Nothing to do here.

### Access / export requests
1. Verify the requester's identity through the driving school (organization) that holds the relationship — TrafikskolaOS is a data processor for the school, not the controller; the school (org_owner/org_admin) is the first point of contact for its own students/guardians/instructors and should be looped in before platform staff act directly.
2. In the Supabase Dashboard SQL Editor, query the subject's rows scoped to their `organization_id`: `students`, `student_guardians` (if the subject is a guardian), `instructors` (if the subject is an instructor), plus related tables (`lesson_bookings`, `invoices`, `student_documents`, etc.) filtered by their id.
3. Export the result set (CSV/JSON from the SQL Editor) and provide it to the organization to relay to the data subject, or directly if the organization has authorized platform staff to do so.
4. Respond within the statutory window (ordinarily one month under GDPR Article 12(3), extendable by two further months for complex requests — notify the subject if extending).

### Right to erasure requests
Financial/accounting records (`invoices`, `ledger` journal entries, `payments`, payroll-related instructor records) are **not erasable** — Swedish Bokföringslagen requires a minimum 7-year retention, and GDPR Article 17(3)(b) explicitly exempts records retained for compliance with a legal obligation. Erasure applies to the subject's *personal* data outside that scope:

- **Students** (`supabase/migrations/20260528000001_phase2a_domain_foundation.sql:142-145`): set `status = 'archived'`, NULL out `personnummer_encrypted`, `personnummer_hash`, `personnummer_last4`, name, email, phone, and address fields. The row itself (id, dates, permit milestones) may be retained for operational reporting per the organization's retention policy.
- **Student emergency contacts** (`student_emergency_contacts`, third-party PII): erase on the student's own erasure request.
- **Student guardians** (`student_guardians`, third-party PII): same treatment as emergency contacts — erase on the student's own erasure request, or independently if the guardian themself is the requester and has no other student relationship.
- **Instructors** (`supabase/migrations/20260528000001_phase2a_domain_foundation.sql:441-445`): **always consult legal before executing** — active-employee payroll records carry the same 7-year Bokföringslagen retention as financial records, so an erasure request from a current or recently-departed instructor requires legal review to determine what, if anything, can be erased versus retained.
- **Demo/lead requests** (`demo_requests`): no `deleted_at` column, no self-service delete path by design — remove manually via SQL Editor on request.

Execute the NULL-out via the Supabase Dashboard SQL Editor, scoped precisely to the requesting subject's row(s) by id — never a bulk operation. Log the action (who requested it, when, what was erased) outside the platform (e.g. in the organization's own records) until/unless a future Version formalizes this.

### Escalation
Legal review is mandatory before any instructor erasure. For ambiguous cases (a request spanning both erasable and retention-locked data), default to retaining and consult legal rather than erasing prematurely.

## 15. Person Lookup Framework Operations

See `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.10 for the full architecture. This section covers day-to-day operation only.

### Monitoring provider health
`person_lookup_provider_health` records one row per lookup/status-check attempt (`organization_id`, `provider`, `is_healthy`, `latency_ms`, `error_message`, `created_at`). A sustained run of `is_healthy = false` for one org's configured provider indicates a credential, network, or upstream-outage problem — check the `error_message` column first, it carries the standardized `errorType` (`timeout`/`rate_limited`/`authentication_failed`/`misconfigured`/`provider_unavailable`/`invalid_request`) rather than a raw stack trace.

```sql
select provider, is_healthy, error_message, latency_ms, created_at
from person_lookup_provider_health
where organization_id = '<org_id>'
order by created_at desc
limit 20;
```

### Monitoring cache behavior
`person_lookup_cache` holds one row per (org, provider, hashed personnummer). A cache-hit-rate that never rises after the first day for an active tenant suggests `cache_ttl_seconds` is misconfigured (e.g. accidentally set to `0`, which disables caching entirely) — check `person_lookup_provider_configs.cache_ttl_seconds` for that org.

### Rotating a tenant's Roaring credentials
Roaring uses OAuth2 client-credentials (a Client ID + Client Secret pair, not a single API key — corrected during commissioning, 2026-07-27).
1. Obtain the new Client ID + Client Secret from the org's Roaring account (Admin → Account information → Permissions).
2. `POST` to `person-lookup-config` with **both** `client_id` and `client_secret` in the request body (same auth/permission as any other tenant settings call — `administration:organization:update`) — the two must be supplied together, the Edge Function rejects one without the other. They are JSON-encoded as a pair and encrypted via the existing `credential-crypto.ts` primitive before storing; the old encrypted value is overwritten, never retained.
3. Confirm via `GET person-lookup-config` that `credentials_configured: true`, or trigger one lookup with `force_refresh: true` and check `person_lookup_provider_health` for a fresh healthy row.

### Troubleshooting a stuck "misconfigured" result
`errorType: 'misconfigured'` means either: the org's `active_provider` is a registered-but-unimplemented name (SPAR/Navet/Creditsafe/Ratsit/Custom — expected, not a bug), or Roaring is selected with no `api_key` stored. Fix by setting `active_provider` back to `'mock'` or supplying a real credential via `person-lookup-config`.

### Rate limiting
Person Lookup uses the same per-isolate, in-memory rate limiter as every other route (`_shared/rate-limit.ts`, `person_lookup` tier: 20 requests/min/user) — this bounds a single warm isolate's burst rate, not a hard global cap across Supabase's distributed edge network. If a genuine global cap is ever required, configure it at the Supabase Dashboard function level rather than modifying this shared module (a platform-wide characteristic, not specific to this integration).

## 16. Vehicle Registry Lookup Operations

See `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.11 for the full architecture. Operationally identical to Person Lookup (§15 above) — same `vehicle_registry_provider_health`/`vehicle_registry_cache` table shapes, same troubleshooting patterns. Two differences worth calling out:

- **Rotating a tenant's Biluppgifter API key**: `POST` to `vehicle-registry-config` with `api_key` (a single key, not a client ID/secret pair like Roaring) — obtained by contacting Biluppgifter's sales team, not a self-service dashboard.
- **Cache TTL default is 90 days, not 30** — vehicle registration/inspection data changes far less often than a person's address. If a tenant reports stale inspection data after a real besiktning, check whether `force_refresh: true` was used, or manually invalidate via `vehicle_registry_cache` if needed.

Both this and Person Lookup now have a real settings dialog at **Settings → Externa tjänster** (`/settings/external-services`) — provider selection and credential entry no longer require a direct API call. If a config change made through the dialog doesn't seem to take effect, check the response of `GET vehicle-registry-config` directly to rule out a stale frontend cache versus a real save failure.

## 17. Manual Government Workflow Tracker Operations

See `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.12 for the full architecture. No external provider — this is an internal tracking tool, so operations are limited to monitoring the reminder mechanism:

### Monitoring reminders
`event-worker`'s maintenance tick runs `checkDueRegulatoryWorkflows()` on its normal cron cadence (the same tick that already drains lesson reminders). If a workflow's `due_date` has passed and `reminder_sent_at` is still null, check event-worker's logs for `maintenance.regulatory_reminders_failed` or `maintenance.regulatory_due_query_failed`.

```sql
select id, organization_id, title, due_date, status, reminder_sent_at
from regulatory_workflows
where due_date <= now() + interval '7 days'
  and reminder_sent_at is null
  and status not in ('confirmed', 'rejected', 'expired')
  and deleted_at is null;
```

### Known dependency: notifications visibility
Reminders are delivered as rows in `notifications` (`category: 'compliance'`, `reference_type: 'regulatory_workflow'`). This depends on migration `20260727000007` (a fix to the `notifications_select` RLS policy, which previously checked a permission code — `notifications:read` — that was never granted to any role, silently hiding every notification for every organization since Phase 3D). If a fresh environment is ever provisioned from an old snapshot predating this migration, the Notification Bell will appear to work with zero results platform-wide — not specific to this feature. Confirm all migrations through `20260727000008` are applied (see next note — a second, unrelated storage bug was fixed in that same later migration).

### Escalating reminders
An item that's still overdue and unresolved re-reminds every 3 days (not just once) — a higher-priority, differently-worded notification. Clicking any reminder deep-links to the specific item (`/regulatory?open=<id>`), not just the list.

### Audit history
The workflow detail dialog shows a change history sourced from `audit_logs` (`entity_type = 'regulatory_workflows'`) — no separate logging mechanism, this is the platform's standard `audit_trigger_fn()` output. Only visible to roles holding `administration:audit:read`; its absence for other roles is by design, not a bug.

### Known dependency: document upload (storage RLS)
Uploading a supporting document depends on migration `20260727000008`, which removed an `auth.role() = 'authenticated'` check from this bucket's storage policies — a check that is **permanently false** on this platform (the auth-hook overwrites the JWT `role` claim with the tenant's business role). This exact bug has now recurred three times platform-wide (`student-documents`, `org-branding`, and this bucket) — if a future storage bucket's uploads mysteriously fail with "new row violates row-level security policy" despite the user clearly holding the required permission, check for this exact anti-pattern first before assuming anything else.
