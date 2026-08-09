# Deployment Runbook

Platform: Trafikskolan SaaS — Swedish Driving School ERP  
Maintained by: Platform Engineering

> **This project uses hosted Supabase** (project ref: `ulgsndzfksphquqakelq`).
> Part 1 (local Docker setup) is optional for local development only.
> For day-to-day work, connect directly to the hosted project — no Docker required.
>
> **Single active environment (Platform Environment Configuration Sprint 2).** An earlier plan to provision a separate, dedicated Supabase project for pilot was explicitly reversed by the project owner. `ulgsndzfksphquqakelq` is the one active project and evolves in place through iterative, baseline-and-rollback-disciplined changes rather than environment duplication — Part 3 below ("Production Deployment") targets *this same project*, not a second one. Do not propose a second project without a new, compelling technical reason.

This runbook covers local development setup, pilot deployment, and production deployment sequencing. Follow the steps in order.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | `>=20.0.0` | https://nodejs.org |
| pnpm | `>=9.0.0` (exactly 9.15.0 recommended) | `npm install -g pnpm@9.15.0` |
| Docker Desktop | Latest stable | https://www.docker.com/products/docker-desktop |
| Supabase CLI | Latest | `npm install -g supabase` |

Verify before starting:
```bash
node --version    # must be >= 20
pnpm --version    # must be >= 9
docker --version  # must be running
supabase --version
```

---

## Part 1 — Local Development Setup

### Step 1 · Clone and install

```bash
git clone <repository-url>
cd <repository-root>
pnpm install
```

TypeScript build verification (optional but recommended):
```bash
pnpm typecheck   # must exit with 0 errors
```

---

### Step 2 · Generate the auth hook secret

The auth hook uses standard-webhook HMAC-SHA256 signing. The secret **must** be in `v1,whsec_<base64-key>` format.

```bash
# 1. Generate a random base64 key
openssl rand -base64 32
# Output example: mK4Lp2Rx7vNqY8Z0jW3sUeHdFcTbGnOi9AkXm1BpQ2E=

# 2. Prefix it — the final value must be:
#    v1,whsec_mK4Lp2Rx7vNqY8Z0jW3sUeHdFcTbGnOi9AkXm1BpQ2E=
```

**Important:** The `v1,whsec_` prefix is required by the standard-webhook signing protocol. Using the raw base64 value without this prefix will cause all auth events to fail the HMAC verification and every sign-in will return 401.

---

### Step 3 · Create local environment files

**`supabase/functions/.env`** (gitignored — create this file):
```
AUTH_HOOK_SECRET=v1,whsec_<your-generated-key>
WORKER_SECRET=<any-random-string-for-local-dev>
APP_URL=http://localhost:5173
STUDENT_APP_URL=http://localhost:5174
```

**`apps/web/.env.local`** (gitignored — create this file):

For **hosted Supabase** (the active project):
```
VITE_SUPABASE_URL=https://ulgsndzfksphquqakelq.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key from Dashboard → Settings → API>
VITE_APP_ENV=development
VITE_ENABLE_QUERY_DEVTOOLS=true
VITE_ENABLE_DEBUG_LOGGING=true
```

For **local Docker dev only** (optional):
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon-key-from-supabase-start-output>
VITE_APP_ENV=development
```

The anon key for local dev comes from `supabase start` output (Step 4).

---

### Step 4 · Start the Supabase local stack

```bash
supabase start
```

This starts PostgreSQL 15, GoTrue auth, Kong API gateway, Realtime, Edge Runtime, Studio, and Inbucket (local email).

Copy the `anon key` from the output into `apps/web/.env.local`.

Useful local ports:
| Service | URL |
|---|---|
| API / Edge Functions | `http://127.0.0.1:54321` |
| Studio (admin UI) | `http://127.0.0.1:54323` |
| Inbucket (local email) | `http://127.0.0.1:54324` |
| PostgreSQL direct | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

---

### Step 5 · Apply migrations

```bash
supabase db push
```

This applies every migration in `supabase/migrations/` in lexicographic filename order — run `ls supabase/migrations/*.sql | wc -l` for the current count rather than trusting a number here, since this file drifts every time a migration is added (224 as of Sprint 4F; do not treat that as current by the time you read this). On a fresh local stack this is equivalent to `supabase db reset` followed by the seed.

Verify migration status:
```bash
supabase migration list
# All migrations should show 'Applied'
```

---

### Step 6 · Bootstrap the first organization and admin

Open `supabase/seed/bootstrap_org_admin.sql` and update the four configurable values at the top:

```sql
v_user_id         := '388776a2-fecc-4058-9846-dae6dbe6aeda';  -- REPLACE THIS
v_user_email      := 'admin@trafikskola.se';                   -- match your auth user
v_user_first_name := 'Admin';
v_user_last_name  := 'Administratör';
```

**You must create the auth user first:**

1. Open Studio → `http://127.0.0.1:54323`
2. Navigate to Authentication → Users → Add User
3. Enter the email you'll use to sign in
4. Copy the UUID shown after creation
5. Paste that UUID as `v_user_id` in the seed file

Then run the seed:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f supabase/seed/bootstrap_org_admin.sql
```

The script has three guards and will exit cleanly with a `NOTICE` if already run. On success, it prints the organization ID, user UUID, and membership ID.

---

### Step 7 · Load demo data (optional)

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f supabase/seed/demo_data.sql

psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f supabase/seed/demo_continuity.sql
```

Both scripts are idempotent — safe to run multiple times. `demo_continuity.sql` anchors lesson slots to the next calendar week so demo content stays current.

---

### Step 8 · Serve Edge Functions

```bash
supabase functions serve --env-file supabase/functions/.env
```

The Edge Runtime reads secrets from `supabase/functions/.env`. Leave this terminal running during development.

---

### Step 9 · Start the web app

```bash
pnpm dev
# or to run only the web app:
pnpm --filter @platform/web dev
```

App runs at `http://localhost:5173`. Sign in with the credentials from Step 6.

---

### Step 10 · Validate the setup

After signing in, open the browser developer console and verify the JWT claims:

```javascript
const { data } = await window.__supabase?.auth.getSession?.() 
  ?? supabase.auth.getSession();
const token = data.session.access_token;
const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
console.log(JSON.stringify(payload, null, 2));
```

Expected shape for the bootstrapped org admin:
```json
{
  "organization_id": "<uuid>",
  "active_membership_id": "<uuid>",
  "role": "org_owner",
  "permissions": ["students:student:read", "..."],
  "location_ids": ["<uuid>"],
  "subscription_tier": "trial",
  "is_platform_admin": false
}
```

If `auth_degraded: true` appears, the auth hook is not running or the `AUTH_HOOK_SECRET` format is wrong.

---

## Part 2 — Event Worker Setup

The `event-worker` Edge Function drains the transactional outbox and runs maintenance ticks (reminders, reservation expiry, dunning). It must be invoked on a schedule.

### Local development

To invoke manually against the hosted project:

```bash
curl -s -X POST https://ulgsndzfksphquqakelq.supabase.co/functions/v1/event-worker \
  -H "Authorization: Bearer <WORKER_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Replace `<WORKER_SECRET>` with the value set via `supabase secrets set`.

### Production — pg_cron setup

**Configured and live as of 2026-07-21.** `event-worker-tick` (every minute) and `communication-worker-tick` (every 2 minutes) are both registered and running against the hosted project. Full architecture, the wrapper-function pattern actually used, Vault secret handling, monitoring guidance, and the operational runbook (manual invocation, health checks, troubleshooting, secret rotation): see `docs/SCHEDULED_JOBS_ARCHITECTURE.md`.

Note for anyone provisioning a fresh project from scratch: the current setup reads `WORKER_SECRET` from Supabase Vault via a `SECURITY DEFINER` wrapper function (`public.invoke_event_worker()` / `public.invoke_communication_worker()`), rather than embedding the secret directly in the `cron.schedule()` command string — do not use the inline-secret pattern this section previously documented; it stores the secret in plain text inside `cron.job`, which the Vault-based wrapper approach avoids. See `docs/SCHEDULED_JOBS_ARCHITECTURE.md` §4–§5 for the actual function definitions and setup steps.

To verify the worker is running:
```sql
SELECT * FROM cron.job_run_details 
WHERE jobname = 'event-worker-tick' 
ORDER BY start_time DESC 
LIMIT 5;
```
Note: `cron.job_run_details` only reflects the wrapper function's own (near-instant) execution, not the downstream worker run — use `worker_run_log` for actual worker health (`docs/SCHEDULED_JOBS_ARCHITECTURE.md` §9, §12).

---

## Part 3 — Production Deployment

### 3.1 · Link to the hosted Supabase project

```bash
supabase link --project-ref <project-id>
```

Find the project ref in the Supabase Dashboard URL: `https://supabase.com/dashboard/project/<project-id>`.

---

### 3.2 · Configure production secrets

Set all Edge Function secrets via the CLI (these are NOT stored in `config.toml` for production):

```bash
# Generate the auth hook secret for production (new key — not the same as local)
openssl rand -base64 32   # note the output as <base64-key>

supabase secrets set \
  AUTH_HOOK_SECRET="v1,whsec_<base64-key>" \
  WORKER_SECRET="<random-string>" \
  APP_URL="https://admin.your-domain.com" \
  STUDENT_APP_URL="https://app.your-domain.com"
```

Verify secrets are set:
```bash
supabase secrets list
# Should show: AUTH_HOOK_SECRET, WORKER_SECRET, APP_URL, STUDENT_APP_URL
```

---

### 3.3 · Configure the production auth hook

1. Open the Supabase Dashboard → Authentication → Hooks
2. Under "Custom Access Token", set:
   - **URI:** `https://<project-id>.supabase.co/functions/v1/auth-hook`
   - **Secret:** the same `v1,whsec_<base64-key>` used in Step 3.2
3. Save the hook

The `config.toml` auth hook URI is for local development only — it uses `host.docker.internal` which only resolves inside Docker. Production hooks are configured exclusively via the Dashboard.

---

### 3.4 · Push migrations

```bash
supabase db push --linked
```

This applies all unapplied migrations to the production database in order. Migrations are non-destructive — they use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, and `CREATE OR REPLACE`.

Verify all migrations applied:
```bash
supabase migration list --linked
```

---

### 3.5 · Bootstrap the first organization and admin

1. Create the auth user in the Supabase Dashboard → Authentication → Users → Add User
2. Copy the UUID
3. Update `supabase/seed/bootstrap_org_admin.sql` with the real UUID, email, and organization details
4. Connect to the production database and run the seed:

```bash
# Get the connection string from Dashboard → Settings → Database → Connection string (URI)
psql "<production-connection-string>" -f supabase/seed/bootstrap_org_admin.sql
```

Or copy and paste the SQL directly into Dashboard → SQL Editor.

---

### 3.6 · Configure the production frontend environment

Create the production `.env` for the build:

```
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<production-anon-key>
VITE_APP_URL=https://admin.your-domain.com
VITE_APP_ENV=production
VITE_APP_VERSION=<git-tag-or-sha>
VITE_STUDENT_APP_URL=https://app.your-domain.com
VITE_ENABLE_QUERY_DEVTOOLS=false
VITE_ENABLE_DEBUG_LOGGING=false
```

Find the production anon key: Dashboard → Settings → API → Project API keys → `anon` `public`.

---

### 3.7 · Build and deploy the frontend

```bash
pnpm build
```

The build outputs to `apps/web/dist/`. Deploy this directory to any static hosting provider (Vercel, Netlify, Cloudflare Pages, S3 + CloudFront, etc.).

Build verification:
```bash
pnpm typecheck   # must pass before deploying
pnpm build       # must succeed before deploying
```

---

### 3.8 · Set up event worker cron (production)

After confirming the deployment is functional, set up the pg_cron job as documented in Part 2 — Production pg_cron setup.

---

## Deployment Ordering Summary

The sequence must be followed in order — later steps depend on earlier ones:

```
1. pnpm install
2. supabase start (local) / supabase link (production)
3. supabase db push                    ← migrations before anything else
4. Create auth user in Dashboard
5. Run bootstrap_org_admin.sql         ← requires migrations to be applied
6. supabase functions serve / secrets set
7. Configure auth hook in Dashboard    ← production only
8. pnpm dev / pnpm build               ← frontend last
9. Set up event-worker cron            ← after confirming deployment healthy
```

---

## Troubleshooting

### Sign-in succeeds but JWT shows `auth_degraded: true`

The auth hook is running but `get_user_jwt_claims()` failed, or the hook itself errored. Check:
1. `supabase functions serve` is running and `supabase/functions/.env` has `AUTH_HOOK_SECRET`
2. The secret format is `v1,whsec_<base64>` — not the raw base64 value
3. The database has the user's profile and membership rows (bootstrap ran successfully)

### Sign-in succeeds but JWT has no `organization_id`

The auth hook is not running at all. Check:
1. Auth hook is enabled in `config.toml` (`enabled = true` under `[auth.hook.custom_access_token]`)
2. Edge Functions are being served (`supabase functions serve`)
3. Production: hook URL is configured in Dashboard → Authentication → Hooks

### `bootstrap_org_admin.sql` fails with "User not found"

The `v_user_id` UUID does not match any auth user. Create the auth user in Dashboard → Authentication → Users first, copy the UUID, then update the seed file and re-run.

### `pnpm build` fails with module-not-found errors

The TypeScript path aliases require all imports to be resolvable. Run `pnpm typecheck` first to identify missing files. All source files should be present after cloning from the repository.

### Migrations fail mid-way

Each migration is a single transaction. A failure leaves the database in the last-successful-migration state. Fix the failing migration and re-run `supabase db push` — already-applied migrations are skipped automatically.

### New user signup / invitation / password reset fails with a rate-limit or never arrives

**Known, live, currently unresolved as of Sprint 3 (Email Infrastructure & Authentication Completion).** Supabase Auth on the hosted project is still using Supabase's own default email sender, which has a low rate limit — confirmed exhausted (`429 over_email_send_rate_limit`) during live testing. No custom SMTP provider is configured. This blocks every Auth flow that requires sending an email. Fix (Dashboard + DNS + Resend account, none executable from this repository): `docs/operational-runbook.md` §13 and the full step-by-step runbook in `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.2.

### `GET /functions/v1/health`, `/health/live`, `/health/ready` all return 404 `Unknown health route`

**Fixed in Sprint 2A (Platform Validation & Readiness).** Found during Sprint 2 (Platform Environment Configuration), fixed the following sprint. Root cause: `supabase/functions/health/index.ts` stripped a `/functions/v1/health` prefix from `req.url`'s pathname before matching routes, but the hosted gateway actually delivers the pathname already stripped down to just `/health`, `/health/live`, or `/health/ready` — so the prefix-strip regex never matched, and every route fell through to the 404 handler. Fix: changed the prefix-strip to match `/health` instead of `/functions/v1/health` (one line), redeployed only the `health` function with `--no-verify-jwt` (required — see the `verify_jwt` warning below), and confirmed live: all three routes now return `200` with correct JSON bodies. If this regresses in the future (e.g. Supabase changes gateway path-forwarding behavior again), the same `curl` test used to find and verify this fix is the fastest way to confirm.
