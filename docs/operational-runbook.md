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
| `event-worker` | pg_cron every 1 minute |
| `communication-worker` | event-worker → dispatch |

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
