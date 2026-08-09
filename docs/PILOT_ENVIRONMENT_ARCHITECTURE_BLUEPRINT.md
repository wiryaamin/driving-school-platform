# Pilot Environment Architecture Blueprint — TrafikskolaOS

> **⚠️ Phase 1's recommendation below (a dedicated pilot Supabase project, separate from dev) is SUPERSEDED.** The project owner explicitly reversed this direction during Platform Environment Configuration Sprint 2: the platform now evolves as **one continuously-improved active environment** (`ulgsndzfksphquqakelq`), with baseline/rollback discipline substituting for environment duplication — see `docs/SECRETS_MANAGEMENT_GUIDE.md`'s "Strategic Pivot" section and `docs/DEPLOY.md`'s updated header note for the current, authoritative direction. The rest of this document (domain strategy, integration readiness, authentication plan, testing scope, go-live checklist, rollback plan) remains a useful reference for its individual findings, but read every mention of "the dedicated pilot project" or "a new/separate Supabase project" as historical context, not current guidance. Do not re-propose a second project without a new, compelling technical reason.

**Sprint type:** Architecture and planning only. No deployment performed, no source code modified, no environment files modified, no secrets generated or rotated, no authentication behavior changed, no database or infrastructure changed.

**Role assumed:** Senior SaaS Solution Architect / DevOps Architect / Cloud Architect / Security Architect, reviewing the existing project as-built.

**Relationship to existing governance.** This project already has an Enterprise Architecture & Governance Handbook (`docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md`), a **Version 1.0 Scope Freeze** limiting active work to nine approved Pilot Readiness actions, a deployment runbook (`docs/DEPLOY.md`), a pilot checklist (`docs/PILOT.md`), and an operational runbook (`docs/operational-runbook.md`). This document does not replace any of them — it answers the one question they don't yet answer: **how does this specific pilot get onto Hostinger at `advertentia.com`.** Every recommendation below is checked against those documents rather than assumed, and every item that would require new implementation work is classified per the Scope Freeze's own rule (Pilot Blocker / Commercial Release Enhancement / Version 1.1 Backlog) rather than treated as automatically in-scope.

---

## Phase 1 — Deployment Strategy

**Option A — single Supabase project (dev = pilot)**
**Option B — dedicated pilot Supabase project, separate from dev, feeding into a later production project**

| | Option A (shared) | Option B (dedicated pilot project) |
|---|---|---|
| Advantages | Zero migration effort — `ulgsndzfksphquqakelq` is already fully migrated (per `DEPLOY.md`, all migrations applied), all 55+ Edge Functions deployed, and is the only project ref referenced anywhere in this repo. Fastest path to a working pilot. | Clean separation between real pilot-customer data and development churn; a schema mistake or a bad seed script during ongoing dev work can never touch pilot data; secrets (service role key, auth hook secret) are scoped per-environment, reducing blast radius of a leak |
| Disadvantages | Development activity (migrations, seed scripts, manual testing, demo data) happens on the same database as the real pilot customer's data — a bad `supabase db push` or a stray demo-seed run is a real risk to production data once a pilot customer is live | Requires re-running the entire migration history (210+ migrations per `VERSION_1.1_ROADMAP.md`), redeploying all Edge Functions, regenerating `AUTH_HOOK_SECRET`/`WORKER_SECRET`, reconfiguring the auth hook, and re-bootstrapping the first org — effectively repeating `DEPLOY.md` Part 3 end-to-end on a second project |
| Operational risk | High once real customer data exists — every future dev-branch migration or seed run is a potential incident against live pilot data | Low — pilot is isolated; dev work is free to be aggressive without customer-facing consequence |
| Maintenance implications | Simple — one project, one set of secrets, one place to check logs | Two projects to keep in sync (migrations must be applied to both; Edge Function deploys must target both); doubles the operational surface documented in `operational-runbook.md` |
| Cost implications | No additional Supabase cost | A second project on Supabase Cloud — at minimum a second Free-tier project (fine for a small pilot), or a second Pro-tier project if the pilot needs point-in-time recovery/backup guarantees `operational-runbook.md` §10 already assumes are available ("Supabase provides point-in-time recovery on Pro+ plans") |

**Recommendation: Option B — a dedicated pilot Supabase project, separate from the development project.**

Reasoning: the moment a real driving school's students, schedules, and invoices exist in a database, that database needs to stop being also the project engineers migrate against, seed demo data into, and experiment on. This is a standard SaaS pattern (dev / staging-or-pilot / production) for exactly this reason, and this project is *architecturally* ready for it — every credential the second project needs (`AUTH_HOOK_SECRET`, `WORKER_SECRET`, `APP_URL`, `STUDENT_APP_URL`, the frontend `VITE_SUPABASE_*` pair) is already externalized to environment/secrets, never hardcoded (confirmed in the Production Environment Audit) — so pointing the same codebase at a second project is a configuration change, not a code change.

This resolves the "open question" flagged in the previous sprint's `apps/web/.env.production.example`: **production should use a new, dedicated Supabase project, not `ulgsndzfksphquqakelq`.** The dev project keeps its current name/role; a new project (suggested name: `trafikskolaos-pilot`) is provisioned for the pilot, following `DEPLOY.md` Part 3 exactly, once provisioning is authorized.

**Note on the Option B diagram as given** ("Development → Dedicated Pilot → Production"): this project's Scope Freeze treats *pilot* as the current, immediate target — there is no evidence anywhere in this repo of a third, separate "production" project beyond the pilot. Recommend treating **Pilot** and **Production** as the same Supabase project for this SaaS's first real customer(s), promoted in place rather than migrated again, unless/until scale requires otherwise. Introducing a third project now would be exactly the kind of "unnecessary infrastructure expansion" `CLAUDE.md`'s Anti-Overengineering Guardrails warn against.

---

## Phase 2 — Pilot Architecture

```
                              ┌─────────────────────┐
                              │   Client Browser     │
                              │ (desktop / mobile)    │
                              └──────────┬───────────┘
                                         │ HTTPS
                                         ▼
                         ┌───────────────────────────────┐
                         │   Hostinger (Apache, shared)    │
                         │   advertentia.com                │
                         │   apps/web/dist/ static files    │
                         │   .htaccess → SPA fallback +     │
                         │   HTTPS force + caching + headers│
                         └──────────────┬────────────────┘
                                        │ serves
                                        ▼
                         ┌───────────────────────────────┐
                         │   React 19 + Vite SPA            │
                         │   (React Router client-side)     │
                         │   Landing/marketing + AppShell   │
                         └──────────────┬────────────────┘
                                        │ HTTPS (fetch / supabase-js)
                                        ▼
                    ┌────────────────────────────────────────┐
                    │              Supabase Cloud                │
                    │         (dedicated pilot project)           │
                    │                                              │
                    │  ┌────────────────────────────────────┐    │
                    │  │ Authentication (GoTrue)                │    │
                    │  │  - Email/password                      │    │
                    │  │  - Custom Access Token Hook             │    │
                    │  │    → auth-hook Edge Function             │    │
                    │  │    → organization_id/role/permissions   │    │
                    │  │      injected into JWT                    │    │
                    │  └───────────────┬────────────────────┘    │
                    │                  ▼                            │
                    │  ┌────────────────────────────────────┐    │
                    │  │ PostgreSQL 15 + RLS                     │    │
                    │  │  - 210+ append-only migrations           │    │
                    │  │  - organization_id NOT NULL + RLS         │    │
                    │  │    on every domain table (BD-004)          │    │
                    │  │  - pg_cron (event-worker-tick, 1 min)     │    │
                    │  └───────────────┬────────────────────┘    │
                    │                  ▼                            │
                    │  ┌────────────────────────────────────┐    │
                    │  │ Storage (Supabase Storage)               │    │
                    │  │  - document/attachment buckets            │    │
                    │  │  - enabled per config.toml (50 MiB limit) │    │
                    │  └────────────────────────────────────┘    │
                    │                                              │
                    │  ┌────────────────────────────────────┐    │
                    │  │ Edge Functions (Deno, 55+)               │    │
                    │  │  - buildEdgeContext() (modern pattern)   │    │
                    │  │  - RLS-backed legacy pattern (27 fns)    │    │
                    │  │  - CORS via _shared/cors.ts               │    │
                    │  │    (APP_URL / STUDENT_APP_URL allowlist) │    │
                    │  │  - Rate limiting (_shared/rate-limit.ts) │    │
                    │  │  - health / event-worker / comms workers  │    │
                    │  └───────────────┬────────────────────┘    │
                    └──────────────────┼─────────────────────────┘
                                       │
                    ┌──────────────────┼─────────────────────────┐
                    ▼                  ▼                          ▼
          ┌──────────────┐   ┌──────────────────┐      ┌──────────────────┐
          │ Email          │   │ Optional channels  │      │ Optional business │
          │ Resend (primary)│   │ SMS/WhatsApp/Push  │      │ integrations       │
          │ + Supabase Auth │   │ (46elks, Twilio,    │      │ (Stripe, Fortnox,  │
          │  SMTP for       │   │  Vonage, Meta,       │      │  BankID)            │
          │  invites/reset  │   │  Firebase,           │      │ — see Phase 4       │
          │ — see Phase 5   │   │  OneSignal)          │      │                     │
          │                 │   │ — see Phase 4        │      │                     │
          └──────────────┘   └──────────────────┘      └──────────────────┘
```

**Layer notes (verified against code, not assumed):**

- **Hostinger** serves only static build output — no server-side rendering, no Node process running on Hostinger. This is the correct model for a Vite SPA on shared Apache hosting, and is what the `.htaccess` prepared in the previous sprint supports.
- **Authentication → Database** is not a straight line — the Custom Access Token Hook (`auth-hook` Edge Function) sits between GoTrue issuing a token and the client receiving it, injecting `organization_id`, `role`, `permissions[]`, `location_ids`, `subscription_tier`, `is_platform_admin`. This hook is the single most operationally fragile point in the whole architecture (documented failure modes: `auth_degraded: true`, or missing `organization_id` entirely, in both `DEPLOY.md` and `operational-runbook.md`) and is exactly why the Handbook's Operational Governance section treats `verify_jwt` state as something that must be live-verified after every deploy, never assumed from config files.
- **Storage** is enabled in `config.toml` but this audit found no evidence of how heavily it's exercised in the current pilot-relevant flows (student documents, etc.) — flagged as an area to include in Phase 7 testing rather than assumed working.
- **Edge Functions → external providers** is deliberately drawn as a fan-out with "optional" labels — see Phase 4. Nothing downstream of the Edge Functions layer is required for the core product (scheduling, students, instructors, finance) to function.

---

## Phase 3 — Domain Strategy

**Recommended for Pilot v1.0:**

| Domain | Purpose | Status |
|---|---|---|
| `https://advertentia.com` | The entire application — public marketing/landing pages AND the authenticated admin app, on one domain | **Required** |
| `https://app.advertentia.com` | Not needed for Pilot v1.0 | **Not required now** |
| `https://student.advertentia.com` | Not needed for Pilot v1.0 | **Not required now — the app doesn't exist yet** |
| `https://api.advertentia.com` | Not needed | **Not required — Supabase's own project URL is the API endpoint; no custom API domain in front of it exists in this codebase** |

**Reasoning — avoid unnecessary complexity, per the sprint's own instruction:**

- `PILOT.md`'s own "Known Pilot-Phase Limitations" table states plainly: **"Student portal (`localhost:5174`) — Separate app not yet built."** There is no second frontend application to deploy to a `student.` subdomain yet. Provisioning that subdomain now would be infrastructure for a product surface that doesn't exist — exactly what `CLAUDE.md`'s Anti-Overengineering Guardrails warn against.
- The codebase's own routing (confirmed this session) already serves both the public marketing site (`/landing`, `/guides`, etc.) and the authenticated app (`/`, `/students`, `/dashboard`, etc.) from the **same** React Router instance in the **same** Vite build — there is no architectural split between "marketing site" and "app" that would justify `app.advertentia.com` as a separate deployment target today. Splitting them would be a real frontend-architecture change, not a domain configuration change, and is explicitly out of this planning-only sprint's scope.
- `api.advertentia.com` would require a reverse proxy or DNS-level routing in front of Supabase's own `https://<project-ref>.supabase.co` endpoint. Nothing in this codebase does that today (the frontend calls the Supabase URL directly via `VITE_SUPABASE_URL`), and introducing one is new infrastructure with no current requirement driving it.

**Where `STUDENT_APP_URL` fits, given no student app exists yet:** the CORS allowlist (`_shared/cors.ts`) still reads `STUDENT_APP_URL` from secrets and includes it if set. Since there's nothing to allow yet, the cleanest pilot-scoped answer is to **leave it unset** (or explicitly set to a value that matches nothing, e.g. leave it empty) rather than invent a placeholder subdomain — an unset `STUDENT_APP_URL` simply means the CORS allowlist has one fewer entry, which is correct, not a gap, until the student portal exists. This changes a value the previous sprint's audit flagged, not a recommendation to provision a domain.

**Future domains (not Pilot v1.0, noted for later reference only):** `app.advertentia.com` and `student.advertentia.com` become relevant if/when (a) the marketing site and authenticated app are deliberately split into separate deployments, or (b) the student portal is actually built as its own app. Both are Commercial Release Enhancement / Version 1.1 Backlog-shaped decisions, not Pilot v1.0 ones.

---

## Phase 4 — Pilot Integration Readiness Matrix

Classification checked against `supabase/functions/_shared/comm-providers.ts` (confirms every SMS/email/WhatsApp/push channel is **pluggable per-organization** and degrades gracefully to `status: 'queued'` when no provider is configured — none of them are hard requirements for the app to run), `operational-runbook.md` §12 (Stripe's actual live state), `VERSION_1.1_ROADMAP.md` (SMS/communication automation status), and the Handbook's BankID Delivery Classification.

| Integration | Classification | Why |
|---|---|---|
| **Resend** (email) | **Required for Pilot** | Password reset, invitations, and any transactional email need a working email channel. Resend is the first-listed/primary email provider in `comm-providers.ts` and the simplest to configure (single API key). See Phase 5 for the distinction between this (app-level notification email) and Supabase Auth's own separate SMTP configuration — **both** need attention before pilot, not just this one. |
| **BankID** | **Not Required for Pilot** | Handbook: Development Complete, but "Operational Acceptance: Pending External Dependencies" and "Production Release: Not Yet Released" — blocked purely on obtaining a relying-party certificate from BankID, an external business process with its own timeline. `VITE_FEATURE_BANKID` also defaults to `false`. Do not block pilot launch on this. |
| **Fortnox** | **Not Required for Pilot** | No evidence in `operational-runbook.md`, `PILOT.md`, or `CLAUDE.md`'s current-phase priorities that Fortnox sync is part of the pilot's tested surface. The `fortnox` function exists but is one of the 27 "legacy" (`enrichUserFromJwt`) functions per the runbook's Edge Function Reference, not called out as pilot-critical anywhere. |
| **Stripe** | **Optional for Pilot** | `operational-runbook.md` §12 is explicit and current: checkout *session creation* works today (org's own `stripe_secret_key`), but the *webhook confirmation* step is dead — `STRIPE_WEBHOOK_SECRET` "does not exist in `supabase secrets list`." If a pilot organization wants to accept online payment, it can, but every payment currently requires **manual reconciliation** until the webhook secret is configured. Fine for a small pilot with few transactions; should not be presented as "fully working" payments. |
| **Twilio** | **Optional for Pilot** | One of three interchangeable SMS/WhatsApp providers; framework-ready, "credentials/testing pending per tenant" per `VERSION_1.1_ROADMAP.md` — "a customer/business decision on provider, not an engineering blocker." |
| **Vonage** | **Optional for Pilot** | Same as Twilio — an alternative SMS provider choice, not required to be all three. |
| **46elks** | **Optional for Pilot** | Same category — notably the only Sweden-specific SMS/voice provider of the three, which may make it the natural pilot choice *if* SMS is wanted, but still not required to launch. |
| **Mailjet** | **Not Required for Pilot** | Third alternative email provider alongside Resend/SendGrid — the app needs *one* working email provider (Resend, above), not three configured simultaneously. |
| **SendGrid** | **Not Required for Pilot** | Same reasoning as Mailjet — redundant with Resend for pilot purposes. |
| **OneSignal** | **Not Required for Pilot** | Push notification provider; no evidence a push-notification-dependent flow is part of pilot testing scope. |
| **Firebase** | **Not Required for Pilot** | Alternative push provider — same reasoning as OneSignal. |
| **Meta WhatsApp** | **Future Release** | WhatsApp Business API integration carries its own external approval process (Meta Business verification) beyond a simple API key — heavier lift than Twilio/Vonage's WhatsApp support for no pilot-stage benefit. |

**Net effect:** exactly **one** integration (Resend, for email) is a real pilot blocker. Everything else the pilot organization can operate without on day one, consistent with the graceful `queued` degradation already built into `comm-providers.ts`.

---

## Phase 5 — Authentication Strategy

**Site URL:** `https://advertentia.com` (the single domain from Phase 3).

**Redirect URLs (Dashboard → Authentication → URL Configuration):** must include `https://advertentia.com` and any specific callback paths the app's password-reset/invitation flows land on (e.g. `https://advertentia.com/auth/*` — confirm exact paths against `apps/web/src/app/router/routes.tsx`'s `/auth/*` tree before configuring). **This is a hosted-project Dashboard setting, not a repo file** — `supabase/config.toml`'s `[auth]` `site_url`/`additional_redirect_urls` (currently all `localhost`) apply only to the local Docker stack per `supabase start`; they have no effect on the hosted pilot project and should not be mistaken for pilot configuration.

**Allowed Origins / CORS:** driven entirely by the `APP_URL` (and, once relevant, `STUDENT_APP_URL`) Edge Function secrets consumed by `_shared/cors.ts` — already environment-driven, no code change needed. Set `APP_URL=https://advertentia.com` on the pilot project via `supabase secrets set` (per Phase 1's dedicated-project recommendation, this happens once, on the new pilot project, not on the shared dev project).

**Session handling:** already implemented and unchanged by this sprint — `autoRefreshToken: true`, `persistSession: true`, custom `storageKey: 'platform_auth'` (`core/api/supabase.ts`, verified this session). No action needed beyond confirming it behaves correctly against the pilot project during Phase 7 testing.

**Password reset:** flows through Supabase Auth's own email delivery, **not** through `comm-providers.ts`/Resend — these are two separate systems. This is the most important, easy-to-miss finding in this phase: configuring `RESEND_API_KEY` for the app's own notification system (Phase 4) does **not** make Supabase Auth's password-reset/invitation emails work. Supabase's default built-in email sender has a strict rate limit (a small number of emails per hour) that will not sustain even a small pilot's onboarding traffic. **Recommend configuring a custom SMTP provider in Dashboard → Authentication → Email (Resend supports SMTP as well as its HTTP API, so the same provider/account can serve both systems) before pilot launch.** This is a configuration task, not a code change, and belongs in the Go-Live Checklist (Phase 8).

**Invitation flow / tenant invitations:** implemented via `tenant-onboarding`, `platform-admin`, and `auth-hook` Edge Functions (confirmed present this session) plus `_shared/tenant-onboarding-progress.ts`. Per the Handbook's Operational Governance section, invitation endpoints are explicitly named as one of the categories requiring `verify_jwt` live-verification after every deploy ("Student Portal, Guardian Portal, Invitation endpoints, Password reset endpoints, BankID callback endpoints... intentionally bypass Supabase Auth['s default JWT check]") — this is a governance requirement already established, not a new recommendation; it must be carried into Phase 8 for the pilot deployment specifically, since it's a *new* deployment (dedicated project) that has never been through this verification.

**Recommended production configuration summary:**
- Site URL: `https://advertentia.com`
- Redirect URLs: `https://advertentia.com` + confirmed `/auth/*` callback paths
- CORS: `APP_URL` secret = `https://advertentia.com`; `STUDENT_APP_URL` left unset (Phase 3)
- Custom SMTP (Dashboard, not a secret): configured before launch, using the same provider as Phase 4's Resend account where practical
- `verify_jwt` state: explicitly verified against the *live* pilot project after deployment, per the Handbook's mandatory checklist — not assumed from `config.toml`

---

## Phase 6 — Secrets Strategy

No secret is generated, changed, or exposed by this document. Every value below is a name and a category, never a value.

### Must Exist Before Pilot

| Secret | Why it exists | Where stored | Owner | How managed |
|---|---|---|---|---|
| `AUTH_HOOK_SECRET` | HMAC signing between GoTrue and `auth-hook` — without a correct, matching value, every sign-in fails | Supabase Secrets (pilot project) + Dashboard → Authentication → Hooks (must match exactly) | Platform engineering | `supabase secrets set`; **generate fresh for the pilot project** — do not reuse either of the two conflicting dev-project values found in the Production Environment Audit |
| `WORKER_SECRET` | Authenticates cron-triggered internal calls to `communication-worker`, `event-worker`, `instructor-ical`, `platform-bootstrap` | Supabase Secrets (pilot project) | Platform engineering | `supabase secrets set`; generate fresh — no existing value found anywhere in this repo to reuse |
| `APP_URL` | Drives the CORS allowlist for the admin app origin | Supabase Secrets (pilot project) | Platform engineering | `supabase secrets set APP_URL="https://advertentia.com"` |
| `PLATFORM_BOOTSTRAP_SECRET` | Gates the one-time first-organization bootstrap flow | Supabase Secrets (pilot project) | Platform engineering | `supabase secrets set`; generate fresh per project |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Frontend's only way to reach the backend | Hostinger build environment (baked into the static bundle at build time — anon key is public-by-design, protected by RLS) | Platform engineering | Set once the pilot project exists; from Dashboard → Settings → API |
| `RESEND_API_KEY` | The one integration classified Required in Phase 4 | Supabase Secrets (pilot project) | Platform engineering (business may need to create the Resend account) | `supabase secrets set` |
| Supabase Auth custom SMTP credentials | Password reset / invitation email deliverability (Phase 5) | Dashboard → Authentication → Email (not a `supabase secrets set` value — a Dashboard-only setting) | Platform engineering | Configured directly in Dashboard |

### Can Be Added Later

| Secret | Why |
|---|---|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Payments work in degraded (manual-reconciliation) form without the webhook secret today; add when a pilot org actually needs automated payment confirmation |
| `TWILIO_*` / `VONAGE_*` / `ELKS_*` | Only needed once a pilot organization actually wants SMS/WhatsApp — per-tenant, per Phase 4 |
| `STUDENT_APP_URL` | Only relevant once the student portal app exists (Phase 3) |
| `FORTNOX_CLIENT_ID` / `FORTNOX_CLIENT_SECRET` | No pilot dependency identified |

### Optional

| Secret | Why |
|---|---|
| `ONESIGNAL_*` / `FIREBASE_SERVER_KEY` | Push notifications — no pilot flow depends on them |
| `META_WHATSAPP_TOKEN` / `META_PHONE_NUMBER_ID` | Future Release per Phase 4 |
| `PERSON_LOOKUP_PROVIDER` | Already has a safe `'mock'` default in code; only set once a real personnummer lookup provider (e.g. SPAR) is contracted |
| `VITE_SENTRY_DSN` | Monitoring degrades safely to inactive without it (confirmed: dead-code-eliminated from the bundle entirely per `operational-runbook.md` §11) |

### Generated Automatically (never set manually)

| Secret | Source |
|---|---|
| `SUPABASE_URL` | Injected by the Supabase Edge Function runtime |
| `SUPABASE_ANON_KEY` | Injected by the Supabase Edge Function runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Injected by the Supabase Edge Function runtime — **the Production Environment Audit found this hand-copied into a local `.env` file, which it should never be; the pilot project's copy of this key should only ever exist as this auto-injected runtime value** |

**Ownership and management, generally:** every "Must Exist" secret above is a **Platform Engineering** responsibility to generate/set (using `supabase secrets set` against the dedicated pilot project once Phase 1's provisioning decision is executed), verified via `supabase secrets list --project-ref <pilot-project-ref>` per the existing audit's own recommended verification pattern. None of them belong in a committed file — this matches, and does not change, the `.gitignore` protections already in place from the previous sprint.

---

## Phase 7 — Pilot Testing Scope

| Area | Priority | Notes |
|---|---|---|
| Authentication (sign-in, JWT claims, `auth_degraded` absence) | **Critical** | `PILOT.md`'s "Login & JWT Validation" section is the authoritative existing test — re-run it against the *pilot* project specifically, not assumed carried over from dev |
| Tenant onboarding / organization creation | **Critical** | First real customer's entire entry point; exercised by `bootstrap_org_admin.sql` for the very first org, `tenant-onboarding` function for any subsequent one |
| Multi-tenancy / RLS isolation | **Critical** | The platform's core architectural guarantee (BD-004); must be verified on the *pilot* project's actual data, not inferred from dev-project testing |
| Role permissions | **Critical** | `VERSION_1.1_ROADMAP.md` already flags `PermissionGate` gaps in Corporate/Reports/Data-Migration/Settings pages as a known, accepted-risk item (RLS backstop verified present in the sampled case) — re-confirm the backstop holds on the pilot project rather than re-litigating the frontend gap, which is already classified as Commercial Release Enhancement, out of Version 1.0 scope |
| Landing page | **High** | Public-facing, first impression; this session's prior sprints already brought it through several visual-polish passes — verify it renders correctly against the real `advertentia.com` domain (fonts, assets, CORS-free since it's same-origin) |
| Scheduling / Calendar | **High** | Core operational workflow per `CLAUDE.md`'s stated priorities |
| Student management | **High** | Core operational workflow |
| Instructor management | **High** | Core operational workflow |
| Invoices | **High** | Finance is immutable/append-only by design (BD-003) — a pilot-stage mistake here is harder to casually fix than elsewhere; test the full issue/void/reversal path, not just creation |
| Edge Functions (general health) | **High** | Run `GET /functions/v1/health` and `/health/ready` against the pilot project post-deploy, per `operational-runbook.md` §2 |
| Branch management | **Medium** | Confirm this maps to the existing "locations" concept (`location_ids` in JWT claims) rather than a separate unbuilt feature — verify terminology before testing scope is finalized |
| Organization creation (subsequent orgs, not just the bootstrap org) | **Medium** | Distinct from the one-time SQL bootstrap; exercises `tenant-onboarding` and invitation flows for real |
| Email | **Medium** | Both systems from Phase 5 — app notification email (Resend) *and* Supabase Auth's own password-reset/invite email — test both explicitly, they are easy to conflate |
| Payments (if enabled for the pilot org) | **Medium** | Only relevant if a pilot organization opts into Stripe; if so, test manually reconciling a payment given the known webhook gap (Phase 4) |
| Notifications | **Medium** | In-app notification delivery; per `VERSION_1.1_ROADMAP.md`, automated triggers (`reservation.expired`, `credit.expired`) are stubbed/log-only — do not test as if they fire automatically; manual send is what actually works today |
| Mobile responsiveness | **Medium** | `VERSION_1.1_ROADMAP.md` notes only 131/227 route files use responsive Tailwind prefixes, with finance/admin tables flagged as the likely weak spot — worth a pilot-scale spot check, not a full audit |
| Browser compatibility | **Low** | No B2B SaaS-specific compatibility concerns identified beyond standard modern-browser support; not flagged as a risk anywhere in existing docs |
| Performance | **Low** | Two build chunks already exceed 500kB uncompressed (`VERSION_1.1_ROADMAP.md`) — acceptable for a small pilot's user count, worth revisiting before wider rollout, not before pilot |
| Security | **Critical**, but **already substantially covered** | Rate limiting, security headers, RLS, and the `verify_jwt` governance process are all pre-existing and documented (`operational-runbook.md` §§3–4, Handbook Operational Governance) — pilot testing here means *re-verifying* these hold on the new pilot project, not designing new security testing from scratch |

---

## Phase 8 — Go-Live Checklist

Organized in dependency order. Items marked *(existing)* point to a task already documented elsewhere in this repo — included here for completeness, not duplicated in full.

**Provisioning**
- [ ] Decide and execute Phase 1's recommendation: provision a dedicated pilot Supabase project
- [ ] Apply all migrations to the pilot project *(existing: `DEPLOY.md` §3.4)*
- [ ] Deploy all Edge Functions to the pilot project *(existing: `DEPLOY.md`, `operational-runbook.md` §7)*
- [ ] Run `pnpm verify:deployment` against the pilot project and confirm every function's `verify_jwt` state matches `supabase/config.toml`'s approved manifest — do not trust the deploy command's exit code alone (Handbook, Operational Governance)

**Secrets** *(Phase 6 — all against the pilot project specifically)*
- [ ] Generate and set a fresh `AUTH_HOOK_SECRET` (do not reuse either conflicting dev-project value)
- [ ] Generate and set a fresh `WORKER_SECRET`
- [ ] Set `APP_URL=https://advertentia.com`
- [ ] Generate and set `PLATFORM_BOOTSTRAP_SECRET`
- [ ] Set `RESEND_API_KEY`
- [ ] Verify via `supabase secrets list --project-ref <pilot-project-ref>`

**Authentication** *(Phase 5)*
- [ ] Configure Custom Access Token Hook in Dashboard, matching the fresh `AUTH_HOOK_SECRET`
- [ ] Configure Site URL and Redirect URLs in Dashboard
- [ ] Configure custom SMTP for Supabase Auth's own password-reset/invitation email
- [ ] Run the full "Edge Function Authentication Verification checklist" from the Handbook against every `verify_jwt = false` function (Student Portal, Guardian Portal, invitation endpoints, password-reset endpoints)

**Frontend / Hosting**
- [ ] Populate `apps/web/.env.production.local` from the template prepared last sprint, using pilot-project values
- [ ] `pnpm typecheck` and `pnpm build` clean *(existing: `PILOT.md` Build Verification)*
- [ ] Deploy `apps/web/dist/` contents (including `.htaccess`) to Hostinger `public_html/`
- [ ] Confirm HTTPS is active for `advertentia.com` on Hostinger before relying on the `.htaccess` forced-HTTPS redirect
- [ ] Load `https://advertentia.com/landing` and confirm no console errors, correct fonts/assets, correct CORS behavior (same-origin, so should be moot, but verify)
- [ ] Directly navigate to a non-root route (e.g. `https://advertentia.com/students`) to confirm the `.htaccess` SPA fallback works — this exact scenario is unverifiable from `localhost` and must be checked against the real Hostinger deployment

**Bootstrap**
- [ ] Create the pilot organization's admin auth user in Dashboard
- [ ] Run `bootstrap_org_admin.sql` with real pilot org details *(existing: `DEPLOY.md` §3.5, `PILOT.md` Bootstrap Validation)*
- [ ] Complete `PILOT.md`'s full "Login & JWT Validation" and "Module Smoke Test" sections against the live pilot deployment

**Background jobs**
- [ ] Set up the `event-worker-tick` pg_cron job on the pilot project *(existing: `DEPLOY.md` Part 2)*
- [ ] Confirm it's actually running via `cron.job_run_details` after the first few minutes

**Monitoring**
- [ ] Decide whether Sentry is in scope for pilot go-live (Phase 6: Optional) — if yes, create the project and set `VITE_SENTRY_DSN`; if no, explicitly note it's deferred rather than forgotten

**Governance / repository**
- [ ] Resolve, or explicitly accept as a known risk, the `main` branch ancestry gap and the unmerged PR-2 release branch (`VERSION_1.1_ROADMAP.md` §3, "Immediate") **before** treating any specific commit as the pilot's deployed source of truth — confirm exactly which branch/commit is being built and deployed to Hostinger, and record it
- [ ] Confirm this planning sprint's own new files (`docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md`, and the previous sprint's `.env.production.example` files, `.htaccess`, `.gitignore` change) are committed on whatever branch is actually deployed from

**Sign-off**
- [ ] All Phase 7 Critical-priority testing items pass
- [ ] `PILOT.md`'s existing "Pilot Sign-Off Criteria" met, re-run against the pilot project

---

## Phase 9 — Rollback Strategy

Grounded in the Handbook's existing Release Management rollback principles (§6) rather than inventing a new model.

**Application rollback (Hostinger frontend):** Hostinger has no built-in atomic deploy/rollback for shared hosting. Recommend: before overwriting `public_html/` with a new `dist/` build, archive the currently-live contents (a simple copy to a dated backup directory on the same hosting account, or download via FTP/File Manager). If a deploy misbehaves, restore that archived copy. This is a manual but sufficient process at pilot scale — no CI/CD pipeline exists yet for this repository (`VERSION_1.1_ROADMAP.md` confirms this explicitly), so an automated blue/green frontend deploy is out of scope for this pilot.

**Database rollback:** per the Handbook (§6) and `operational-runbook.md` §10 — migrations are append-only and never edited after being applied (P-007); a bad migration is fixed by writing a *new* migration that undoes it, never by editing history. For catastrophic data issues, Supabase's point-in-time recovery (available on Pro+ plans — confirm the pilot project's plan tier covers this before go-live, since it directly affects this rollback path's availability) is the recovery mechanism, via Dashboard → Settings → Backups → Restore.

**Environment rollback:** since the pilot uses a dedicated Supabase project (Phase 1), the dev project (`ulgsndzfksphquqakelq`) is never at risk from a pilot rollback — this is one of the direct benefits of the Phase 1 recommendation. If the pilot project itself needs to be abandoned and recreated, that's a re-run of the Phase 8 checklist against a fresh project, not a partial rollback.

**DNS rollback:** if `advertentia.com`'s DNS is repointed toward Hostinger as part of go-live, keep a record of the previous DNS configuration (registrar screenshot or export) before changing it, so it can be restored if Hostinger hosting needs to be abandoned. Not applicable if `advertentia.com` has never pointed anywhere else.

**Secrets rollback:** Supabase Secrets have no built-in version history exposed via the CLI/Dashboard. Recommend recording (outside the repository, per the existing GDPR manual-procedure precedent in `operational-runbook.md` §13 for similarly sensitive manual records) the secret *names* and *rotation dates* set during Phase 8, so that if a secret needs to be reverted, there's at least a record of when and what changed — not the values themselves, which should never be stored outside Supabase's own secret store.

**General principle, restated from the Handbook:** for anything not yet pushed, prefer the least destructive recovery step available (a new corrective migration/secret update, not a forced revert) — this mirrors the Handbook's own "never force past a rejected operation, investigate" governance rule (P-023's `git stash` guidance), applied here to infrastructure rather than git.

---

## Deliverables Summary

1. **Recommended Pilot Architecture** — Phase 2's diagram: Hostinger (static SPA + `.htaccess`) → Supabase Cloud (dedicated pilot project: Auth, Postgres+RLS, Storage, Edge Functions) → optional external providers.
2. **Deployment Strategy Recommendation** — Phase 1: a dedicated pilot Supabase project, separate from dev, treated as both pilot and production going forward (no third project).
3. **Recommended Domain Structure** — Phase 3: `https://advertentia.com` only for Pilot v1.0; `app.`/`student.`/`api.` subdomains explicitly deferred, with reasoning tied to what's actually built today.
4. **Integration Readiness Matrix** — Phase 4: only Resend (email) is Required; BankID/Fortnox Not Required; Stripe/Twilio/Vonage/46elks Optional; Mailjet/SendGrid/OneSignal/Firebase Not Required; Meta WhatsApp Future Release.
5. **Authentication Configuration Plan** — Phase 5: Site URL, redirect URLs, and CORS all point to `advertentia.com`; the critical, easy-to-miss item is that Supabase Auth's own email (password reset/invites) needs its own SMTP configuration, separate from the app's Resend integration.
6. **Secrets Management Plan** — Phase 6: 7 secrets must exist before pilot (all generated fresh for the new project, none reused from dev), a clear "can be added later / optional / automatic" tier for the rest, no values generated or exposed by this document.
7. **Pilot Testing Checklist** — Phase 7: Critical items are auth, tenant onboarding, multi-tenancy/RLS, role permissions, invoices, and security re-verification; several items explicitly scoped down to match already-documented limitations (stubbed notification triggers, known `PermissionGate` gaps) rather than re-litigated.
8. **Go-Live Checklist** — Phase 8: ordered, dependency-aware checklist spanning provisioning through sign-off, explicitly incorporating the Handbook's mandatory `verify_jwt` verification and the unresolved branch-ancestry governance item.
9. **Rollback Plan** — Phase 9: manual archive-and-restore for the Hostinger frontend, append-only-migration + point-in-time-recovery for the database, project isolation as the environment safety net, DNS/secrets record-keeping.
10. **Overall Recommendation** — below.

---

## Overall Recommendation

**⚠ Pilot Architecture Approved with Recommendations**

The architecture question this sprint set out to answer has a clear answer: Hostinger serving a static Vite build with the previously-prepared `.htaccess`, talking to a **new, dedicated** Supabase project, on a single domain (`advertentia.com`), with exactly one external integration (Resend) actually required to launch. Nothing about the existing codebase blocks this — every piece of configuration this requires is already externalized correctly (confirmed twice now, in the audit and again in this review).

The "Recommendations" qualifier reflects real, unresolved items this sprint intentionally did not decide unilaterally, consistent with its own constraints:

- The Phase 1 dedicated-project decision needs explicit business/engineering sign-off before Phase 8 provisioning begins — it's a recommendation, not yet a decision.
- Supabase Auth's separate SMTP requirement (Phase 5) is easy to miss and should be explicitly assigned as a task, not left implicit.
- The unmerged PR-2 release branch and `main` ancestry gap (`VERSION_1.1_ROADMAP.md` §3) should be resolved, or at minimum explicitly acknowledged and worked around with a documented decision, before anyone treats a specific commit as "the pilot's deployed source" — deploying an ambiguous source is a governance risk this repository has already paid for once (the `verify_jwt` incident) and built process specifically to prevent.
- Per the Version 1.0 Scope Freeze, if executing this blueprint surfaces any item requiring actual code change beyond configuration (for example, if Phase 7 testing finds a real defect), that item must be classified as Pilot Blocker / Commercial Release Enhancement / Version 1.1 Backlog through the existing process before work begins on it — this blueprint plans the deployment; it does not pre-authorize scope changes.
