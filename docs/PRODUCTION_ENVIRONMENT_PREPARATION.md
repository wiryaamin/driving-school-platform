# Production Environment Preparation — TrafikskolaOS

**Sprint type:** Preparation only. Nothing was deployed, no secrets were generated or rotated, no business logic, database schema, Supabase architecture, or authentication behavior was changed. This document records what was prepared, in what state, and what's still needed before `https://advertentia.com` can actually go live.

Follows on from the earlier **Production Environment Audit**, which identified the gaps this sprint prepares scaffolding for.

---

## 1. Production Environment Files

New files created this sprint (all placeholder-only, no real secrets):

| File | Status | Purpose |
|---|---|---|
| `apps/web/.env.production.example` | New, committed | Frontend production variable template |
| `supabase/functions/.env.production.example` | New, committed | Documents every Edge Function secret required for production (reference only — Edge Functions read secrets via `supabase secrets set`, never a committed file) |
| `apps/web/public/.htaccess` | New, committed | Hostinger/Apache SPA routing + caching + baseline security headers |
| `.gitignore` | Modified | Added `.env.production` to the ignore list (was previously only covering `.env`, `.env.local`, `.env.*.local`) so a real production env file can never be committed by accident; explicitly un-ignored both new `.example` templates |
| `docs/PRODUCTION_ENVIRONMENT_PREPARATION.md` | New, committed | This document |

No `.env.production` (real, populated file) was created — intentionally. Vite auto-loads `.env.production` during `vite build` with no suffix required, so committing one with placeholder values would risk silently shipping placeholders into a real build if someone forgot to override it. The `.local`-suffixed variant (`.env.production.local`) is the recommended real file — gitignored, never auto-loaded except by the build step, and never accidentally committed.

---

## 2. Production Variable Table

### Frontend (`apps/web/.env.production.example`)

| Variable | Required | Placeholder | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes | `https://<production-project-ref>.supabase.co` | Supabase project URL. **Open question:** same project as dev (`ulgsndzfksphquqakelq`, the only ref found anywhere in this repo) or a new dedicated production project — not resolved by this sprint |
| `VITE_SUPABASE_ANON_KEY` | Yes | `<production-anon-key>` | Public anon key for whichever project is designated production |
| `VITE_APP_ENV` | Yes | `production` (literal, not a placeholder) | Drives Sentry `environment` tag and the `x-app-env` header sent to Supabase |
| `VITE_APP_VERSION` | Recommended | `<release-version>` | No CI step currently bumps this — set by hand per deploy until one exists |
| `VITE_SENTRY_DSN` | Recommended | `<sentry-dsn-or-leave-empty>` | Safe to leave empty — monitoring no-ops without it; error reporting simply won't fire until a Sentry project exists |

Deliberately **not** included (confirmed unused anywhere in application code by repo-wide search): `VITE_APP_URL`, `VITE_STUDENT_APP_URL`, `VITE_FEATURE_BANKID`, `VITE_FEATURE_AI_ASSISTANT`, `VITE_FEATURE_CORPORATE_PORTAL`, `VITE_FEATURE_MOBILE_APP`, `VITE_ENABLE_QUERY_DEVTOOLS`, `VITE_ENABLE_DEBUG_LOGGING`.

### Supabase Edge Functions (`supabase/functions/.env.production.example` — reference only)

| Variable | Required | Placeholder | Description |
|---|---|---|---|
| `AUTH_HOOK_SECRET` | Yes | `v1,whsec_<production-value>` | GoTrue ↔ `auth-hook` HMAC key. **Blocker:** two different values currently exist across local dev files — this sprint does not pick one; that's a decision for whoever deploys |
| `WORKER_SECRET` | Yes | `<production-value>` | Used by 4 functions (`communication-worker`, `event-worker`, `instructor-ical`, `platform-bootstrap`). No existing value found anywhere in the repo to reuse — must be generated fresh |
| `APP_URL` | Yes | `https://advertentia.com` | CORS allowlist origin for the admin app |
| `STUDENT_APP_URL` | Yes | `https://app.advertentia.com` | CORS allowlist origin for the student portal. **Open question:** placeholder subdomain shown — real value not confirmed |
| `PLATFORM_BOOTSTRAP_SECRET` | Yes | `<production-value>` | Gates first-organization bootstrap |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Auto-injected by the Supabase runtime; never set manually, never stored in a file |
| 12 third-party integration variables (BankID, Fortnox, Stripe, Twilio, Vonage, 46elks, Mailjet, SendGrid, Resend, OneSignal, Firebase, Meta WhatsApp) | Unconfirmed | See `.env.production.example` for the full list | Referenced by deployed functions but absent from every local file; pilot scope for each needs a product decision before setting |

---

## 3. Hostinger Deployment Assets

| Asset | Location | What it does |
|---|---|---|
| `.htaccess` | `apps/web/public/.htaccess` → copied to `dist/.htaccess` by `vite build` | (1) Forces HTTPS. (2) Serves real files/directories (hashed JS/CSS, `manifest.json`, `robots.txt`, etc.) unchanged. (3) Falls back to `index.html` for everything else, so React Router paths like `/students/123` or `/dashboard` don't 404 on direct navigation or refresh on Apache. (4) Sets long-lived immutable caching on hashed assets and no-cache on `index.html`, so a new deploy is always picked up. (5) Adds baseline security headers matching the intent already used for API responses |
| Vite `base` path | Verified, not changed | Confirmed default (`/`) is correct for a root-domain deploy to `https://advertentia.com`. Only needs changing if the site is ever deployed into a subdirectory instead |

Build verified locally: `pnpm --filter @platform/web build` succeeds, and `.htaccess` lands correctly at `dist/.htaccess` alongside `dist/index.html`. Deploying the contents of `apps/web/dist/` as-is to Hostinger's `public_html/` (or equivalent) requires no further file manipulation.

---

## 4. Remaining Deployment Blockers

These are the items this sprint intentionally did **not** resolve, per the "do not rotate secrets / do not deploy" constraints — they require a decision or an action from the team, not more preparation:

- **`AUTH_HOOK_SECRET` conflict** — two different local values exist. Pick one (or generate a fresh one), set it via `supabase secrets set`, and set the identical value in Dashboard → Authentication → Hooks.
- **`WORKER_SECRET` missing** — generate one (`openssl rand -base64 32`) and set it via `supabase secrets set`; no existing value to reuse.
- **`APP_URL` / `STUDENT_APP_URL`** — set to the real production origins via `supabase secrets set`. `APP_URL=https://advertentia.com` is confirmed by the sprint brief; the student-portal origin is still an open question.
- **Supabase project decision** — confirm whether production uses the existing dev project (`ulgsndzfksphquqakelq`) or a new, separate one. This determines the real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` values and whether any data migration or fresh provisioning is needed.
- **`PLATFORM_BOOTSTRAP_SECRET`** — confirm a value exists/is set on the target production project; not found in any local file.
- **Third-party integration scope** — decide which of the 12 integration secrets are actually needed for the pilot before setting any of them; run `supabase secrets list` against the target project to see current state.
- **Sentry** — no Sentry project exists yet. Monitoring will stay silently inactive in production until one is created and its DSN set.
- **Auth redirect URLs** — `supabase/config.toml`'s `site_url`/`additional_redirect_urls` only apply to the local Docker stack (`supabase start`) and were not touched, per this project's hosted-only setup. The hosted project's real redirect URLs must be confirmed/set separately via Dashboard → Authentication → URL Configuration — not something a repo file controls.
- **HTTPS certificate** — the new `.htaccess` assumes Hostinger's SSL is already active for `advertentia.com`; confirm before relying on the forced-HTTPS rewrite.

None of these require code changes — every one is a value to set or a decision to make, using the scaffolding this sprint put in place.

---

## 5. Production Readiness

**⚠️ Ready with Minor Remaining Tasks**

All deployment scaffolding (environment templates, Edge Function secret documentation, Hostinger `.htaccess`, gitignore protection) is in place and verified against a real build. What's left is exclusively populating real values for the blockers listed above and making the two open-question decisions (Supabase project choice, student-portal origin) — no further preparation work is needed to get there.
