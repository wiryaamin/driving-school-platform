# Integration Configuration & Environment Operations Guide — TrafikskolaOS

**Status:** Living document. **Audience:** future developers, administrators, and the product owner (non-technical sections are marked and written accordingly). **Sprint type this document was produced under:** documentation and planning only — nothing in this guide was configured, no account was created, no secret was generated, no code or environment file was changed to produce it.

**How to read this document.** Every chapter below explains **why** an integration exists before it explains **how** to configure it. If you only need the "how," you can skip straight to a chapter's Configuration/Pilot Setup sections — but reading the Purpose section first will make the rest make more sense.

**Relationship to other documents (do not duplicate — read these for what they own):**

| Document | What it owns |
|---|---|
| `docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` | Overall architecture, governance rules, the Version 1.0 Scope Freeze |
| `docs/DEPLOY.md` | Step-by-step deployment mechanics (migrations, Edge Function deploys, bootstrap) |
| `docs/PILOT.md` | The general pilot go-live checklist (not integration-specific) |
| `docs/operational-runbook.md` | Day-to-day operations: health checks, rate limits, incident response, GDPR procedure |
| `docs/PRODUCTION_ENVIRONMENT_PREPARATION.md` | The production `.env` templates and Hostinger `.htaccess` already prepared |
| `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` | The overall pilot deployment architecture, domain strategy, and go-live sequencing |
| **This document** | Everything specific to *third-party integrations*: what each one is, whether it's actually built, and exactly how to configure it |
| `docs/ENVIRONMENT_VARIABLE_REFERENCE.md` | The master table of every environment variable (companion to this guide — see Phase 5 note below) |
| `docs/SECRETS_MANAGEMENT_GUIDE.md` | The security/ownership/rotation policy for secrets (companion to this guide — see Phase 6 note below) |
| `docs/INTEGRATION_STATUS_REGISTER.md` | A short, frequently-updated status table (companion — see Phase 7 note below) |

---

## Phase 1 — Integration Discovery Report

Every integration below was verified against actual code in this repository — nothing here is assumed. "Implemented" means real, working code exists that calls the provider. "Partially Implemented" means the code exists but something outside the code (a credential, an external account, a business decision) is still needed before it actually works end-to-end. "Not Used" means no trace of it exists anywhere in the codebase.

| Integration | Status | Evidence |
|---|---|---|
| **Supabase** (Auth, Database, Storage, Edge Functions) | Implemented | The entire backend — not optional, not third-party in the usual sense, but documented here because every other integration's configuration lives inside it (Supabase Secrets) |
| **Resend** (email) | Implemented, not yet operationally configured | `supabase/functions/_shared/comm-providers.ts` has a complete, working `dispatchResend()` function. No `RESEND_API_KEY` found in any local environment file |
| **Stripe** (payments) | **Partially Implemented** | Checkout session *creation* works today (`supabase/functions/student-portal/index.ts`); the webhook that *confirms* a payment succeeded (`supabase/functions/stripe-webhook/index.ts`) is fully coded but fails closed because `STRIPE_WEBHOOK_SECRET` has never been set — confirmed explicitly in `docs/operational-runbook.md` §12 |
| **BankID** (identity verification) | **Partially Implemented** | Per the Enterprise Architecture Handbook's own Delivery Classification: "Development Complete," but "Operational Acceptance: Pending External Dependencies" (a BankID relying-party certificate must be obtained from BankID directly — an external business process, not an engineering task) and "Production Release: Not Yet Released." The frontend feature flag (`VITE_FEATURE_BANKID`) also defaults to `false` |
| **Fortnox** (Swedish accounting software sync) | Implemented, not yet operationally configured | `supabase/functions/fortnox/index.ts` is a complete 494-line OAuth2 (PKCE) connection flow — status/start/callback/refresh/disconnect. No `FORTNOX_CLIENT_ID`/`FORTNOX_CLIENT_SECRET` found in any local environment file, and no evidence any pilot organization needs this yet |
| **Twilio** (SMS, WhatsApp, voice) | Implemented, not yet operationally configured | `dispatchTwilioSms()`, `dispatchTwilioWhatsapp()`, `dispatchTwilioVoice()` all exist and work; no credentials configured anywhere |
| **Vonage** (SMS, voice) | Implemented, not yet operationally configured | Same pattern as Twilio |
| **46elks** (SMS, voice — Sweden-specific) | Implemented, not yet operationally configured | Same pattern; notably the only Sweden-domestic provider of the three |
| **Mailjet** (email, alternative to Resend) | Implemented, not yet operationally configured | Same pattern |
| **SendGrid** (email, alternative to Resend) | Implemented, not yet operationally configured | Same pattern |
| **OneSignal** (push notifications) | Implemented, not yet operationally configured | Same pattern |
| **Firebase** (push notifications, alternative to OneSignal) | Implemented, not yet operationally configured | Same pattern |
| **Meta WhatsApp Business API** | Implemented, not yet operationally configured | Same pattern; carries its own Meta Business verification process beyond a simple API key |
| **Sentry** (frontend error monitoring) | Implemented, dormant by design until configured | `apps/web/src/core/monitoring/index.ts` — never initializes without `VITE_SENTRY_DSN`, and the SDK is confirmed dead-code-eliminated from the production bundle entirely when absent (per `docs/operational-runbook.md` §11) |
| **Person Lookup / SPAR** (personnummer autofill) | **Partially Implemented** | `supabase/functions/_shared/person-lookup.ts` is a complete provider *framework* with one working provider — Mock (fixed test fixtures only). The real provider it's designed for (SPAR, Sweden's population register) has an explicit placeholder in the code (`// Future: case 'spar': ...`) but no implementation. Confirmed as "Mock-only by design" for Version 1.0 in `docs/VERSION_1.1_ROADMAP.md` (ADR-008) |
| **OpenStreetMap** | Implemented — but requires no account or configuration | A single `<iframe>` embed (`apps/web/src/modules/students/routes/StudentDetailPage.tsx`) using OpenStreetMap's free public embed widget. No API key exists for this widget, so there is nothing to configure — mentioned here for completeness, not given its own chapter below |
| **Google Maps** | Not Used | No reference anywhere in the codebase |
| **Google Places** | Not Used | No reference anywhere in the codebase |
| **Mapbox** | Not Used | No reference anywhere in the codebase |

**Important pattern to understand before reading further:** SMS, voice, WhatsApp, push, and (beyond Resend) email are all built as **pluggable, per-organization choices**, not fixed platform-wide integrations. The code that dispatches a message (`dispatchMessage()` in `comm-providers.ts`) looks at which provider a specific driving school has configured for a specific channel, and if none is configured, the message is simply marked `queued` rather than the system failing. This single architectural fact is why the vast majority of the "not yet operationally configured" integrations above are not blockers of anything — see Phase 2's "Mandatory/Optional" column, and the individual chapters in Phase 4.

---

## Phase 2 — Integration Inventory

| Integration | Purpose | Business Value | Used By | Mandatory / Optional | Version | Dependencies | Operational Owner |
|---|---|---|---|---|---|---|---|
| Supabase | The entire backend: login, database, file storage, server-side logic | Without it, nothing works — this is the platform, not an add-on | Every part of the application | **Mandatory** | Version 1.0 | None (foundation) | Platform Engineering |
| Resend | Sends transactional emails from the app (e.g. booking confirmations, staff notifications) | Keeps staff and customers informed without manual phone calls/texts | `communication-worker`, notification flows | **Mandatory for Pilot** (the one email provider a pilot needs configured) | Version 1.0 | Requires a working domain to send *from* (see its chapter) | Platform Engineering (account); the organization may want its own sender domain later |
| Stripe | Lets a driving school accept online card payments from students | Real revenue collection without manual bank transfers | `student-portal` (checkout), `stripe-webhook` (confirmation) | **Optional for Pilot** — works in a degraded, manually-reconciled form without the webhook secret | Version 1.0 (partial), full automation is a near-term follow-up | An organization must have its own Stripe account and provide its own secret key (per-tenant, not platform-wide) | Whichever pilot organization chooses to use it, with Platform Engineering support for the webhook piece |
| BankID | Lets Swedish users prove their identity/sign in using the national BankID system | Trust and convenience — BankID is the standard identity method in Sweden | `bankid-auth` | **Not Required for Pilot** — blocked on an external certificate application, not engineering | Future Release (Version 1.1+) | A signed relying-party agreement and certificate from BankID | Product Owner (initiates the business relationship with BankID) + Platform Engineering (technical setup once the certificate exists) |
| Fortnox | Syncs accounting data with Fortnox, a popular Swedish bookkeeping product many driving schools may already use | Avoids double bookkeeping for schools that already use Fortnox | `fortnox` | **Not Required for Pilot** | Future Release | A Fortnox developer account and app registration | Product Owner (business relationship) + Platform Engineering |
| Twilio / Vonage / 46elks | Sends SMS text messages and/or makes automated voice calls to students/instructors | Reminders and alerts reach people who don't check email | `communication-worker` | **Optional** — pick at most one per channel, only if a pilot organization wants SMS | Version 1.0 (available), actual use is a per-tenant decision | A phone-capable account with each respective provider | Whichever pilot organization opts in, supported by Platform Engineering |
| Mailjet / SendGrid | Alternative email senders to Resend | Redundancy/choice — not needed if Resend is working | `communication-worker` | **Not Required** (Resend already fills this role) | Version 1.0 (available, unused) | N/A | N/A unless activated |
| OneSignal / Firebase | Sends push notifications to a mobile app or browser | Real-time alerts without SMS/email cost | `communication-worker` | **Not Required for Pilot** — no push-dependent flow currently exercised | Future Release | N/A | N/A unless activated |
| Meta WhatsApp | Sends WhatsApp messages | WhatsApp is widely used in Sweden for informal communication | `communication-worker` | **Future Release** — heavier setup (Meta Business verification) than the pilot needs | Future Release | Meta Business verification | N/A unless activated |
| Sentry | Automatically reports frontend errors so problems can be found and fixed before customers report them | Faster bug detection, better reliability | `apps/web/src/core/monitoring` | **Optional for Pilot**, recommended before wider rollout | Version 1.0 (built, inactive) | A Sentry account (free tier is sufficient at pilot scale) | Platform Engineering |
| Person Lookup / SPAR | Auto-fills a new student's address/details from their personnummer during registration | Faster, more accurate student registration | `students` Edge Function, `usePersonLookup.ts` | **Not Required for Pilot** — Mock provider already satisfies Version 1.0's design intent | Version 1.0 (Mock), real provider is Version 1.1+ | A future SPAR provider would need a formal registration/agreement with Skatteverket or an approved reseller | Product Owner (future business relationship) + Platform Engineering (future implementation) |
| OpenStreetMap | Shows a small map on a student's detail page | Visual context for an address — no functional dependency | `StudentDetailPage.tsx` | Already working, nothing to configure | Version 1.0 | None | N/A |

---

## Phase 3 — Environment Strategy

This section summarizes the environment model; `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` Phase 1 contains the full reasoning behind the Development/Pilot separation — read that document for *why* a dedicated pilot Supabase project is recommended. This section exists so integration-specific environment differences are documented in one place, alongside the integrations themselves.

### Development

- **Purpose:** where engineers build and test features, using fabricated/demo data
- **Hosting:** engineers' own machines (`pnpm dev`, `localhost:5173`)
- **Supabase Project:** the existing hosted project, `ulgsndzfksphquqakelq`
- **Authentication:** real Supabase Auth against the dev project; test accounts only
- **Payments:** not configured — no `STRIPE_SECRET_KEY` needed for ordinary development
- **Email:** not configured — `RESEND_API_KEY` unset; the app functions normally with messages simply queued rather than sent
- **SMS:** not configured, same reasoning
- **Push Notifications:** not configured, same reasoning
- **Logging:** structured JSON logs via Supabase's Edge Function log viewer (no separate logging service)
- **Monitoring:** Sentry never initializes in a development build regardless of configuration (a deliberate safeguard, not a gap — see the Sentry chapter)
- **Secrets:** local `.env`/`.env.local` files, gitignored, populated by each engineer individually per `docs/DEPLOY.md`

### Pilot

- **Purpose:** the first real driving school(s) using the live product
- **Hosting:** Hostinger Business Web Hosting, `https://advertentia.com`
- **Supabase Project:** recommended to be a **new, dedicated project**, separate from Development (`docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` Phase 1) — not yet provisioned as of this document
- **Authentication:** real Supabase Auth against the pilot project; Site URL and Redirect URLs configured for `advertentia.com`
- **Payments:** optional, per pilot organization — see the Stripe chapter for exactly what "on" looks like at this stage
- **Email:** Resend configured — this is the one integration this guide treats as required before pilot go-live
- **SMS:** optional, only if a pilot organization requests it
- **Push Notifications:** not required
- **Logging:** same structured logs, now against the pilot project's own Edge Function logs
- **Monitoring:** Sentry recommended but optional — see its chapter for the tradeoff
- **Secrets:** Supabase Secrets on the pilot project (`supabase secrets set`), never a committed file — see `docs/SECRETS_MANAGEMENT_GUIDE.md`

### Production

- **Purpose:** the platform once it has moved beyond a single controlled pilot
- **Hosting, Supabase Project:** per `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md`'s recommendation, Production is the *same* Supabase project as Pilot, promoted in place rather than migrated a second time — introducing a third project is treated as unnecessary complexity unless a specific scale-driven reason emerges later
- **Authentication, Payments, Email, SMS, Push, Logging, Secrets:** same mechanisms as Pilot, at whatever scale of provider plan (see each chapter's "Production Setup" section for what changes, if anything, purely due to volume)
- **Monitoring:** Sentry becomes a stronger recommendation at this stage — a wider, less-directly-observed user base benefits more from automatic error capture than a small, closely-watched pilot does

---

## Phase 4 — Individual Integration Guides

**A note on how these chapters are grouped**, since not every integration gets an identically-sized chapter: Supabase, Resend, Stripe, BankID, Fortnox, and Sentry each get a full, standalone chapter — each is configured independently, with its own account and its own operational story. The SMS/voice providers (Twilio, Vonage, 46elks) share one chapter, because they are three interchangeable implementations of the exact same code path (`dispatchMessage()` with `channel: 'sms'` or `'voice'`) — a driving school picks one, not all three, and explaining the shared architecture once is clearer than repeating it three times. The same reasoning groups the push providers (OneSignal, Firebase) into one chapter. Meta WhatsApp gets its own short chapter because, unlike Twilio's WhatsApp support, it carries a distinct account-verification process worth calling out separately. SendGrid and Mailjet — both fully interchangeable with Resend for the same `channel: 'email'` code path — are covered as a short addendum inside the Resend chapter rather than full chapters of their own, since Resend is the one this guide actually recommends using. Person Lookup (§4.10) gets its own chapter despite having no real external provider connected yet, specifically *because* that "framework exists, no live provider yet" state is easy to misread as either "not built" or "fully working" — it's neither, and it's the kind of nuance a table row can't carry on its own.

---

### 4.1 Supabase

#### Purpose

Supabase is not "an integration" in the usual sense — it *is* the backend. It provides four things TrafikskolaOS depends on completely: the database that stores every driving school's students, schedules, and invoices; the authentication system that logs users in; the file storage for uploaded documents; and the serverless functions ("Edge Functions") that run the platform's business logic. Every other integration in this guide is configured *through* Supabase (as a "Supabase Secret"), not around it.

#### Architecture

- **Frontend:** the React app talks to Supabase directly using the `@supabase/supabase-js` library, configured with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (`apps/web/src/core/api/supabase.ts`)
- **Edge Functions:** ~55 small Deno programs, one per feature area (students, bookings, invoices, etc.), each deployed to Supabase and reachable at `https://<project-ref>.supabase.co/functions/v1/<function-name>`
- **Database:** PostgreSQL, with Row Level Security (RLS) enforcing that one driving school can never see another's data — this is the platform's core safety guarantee
- **Storage:** Supabase's built-in file storage, used today for student documents (`apps/web/src/modules/documents/hooks/useDocuments.ts`)
- **External API:** none — Supabase itself is the "external API" every other integration's secrets are stored inside

#### Account Creation

- Created at [supabase.com](https://supabase.com)
- **Plan:** the existing development project is on a plan sufficient for development traffic. For the pilot project (recommended to be a new, separate project — see Phase 3), a **Pro plan or higher is recommended specifically because it unlocks point-in-time backup recovery**, which `docs/operational-runbook.md` §10 already assumes is available as the disaster-recovery mechanism. A Free-tier project would leave the pilot without that safety net.
- **Expected cost:** Supabase's pricing is public and changes over time — confirm current pricing at [supabase.com/pricing](https://supabase.com/pricing) at the time of purchase rather than relying on a number written into this document, which could go stale.

#### Configuration

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — frontend, from Dashboard → Settings → API
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — auto-injected into every Edge Function by Supabase itself; **never set these manually, and never store the service role key in a file** (the Production Environment Audit found this had happened once in a local development file — a practice to stop, not repeat)
- Auth Hook: Dashboard → Authentication → Hooks → Custom Access Token Hook, pointing at the `auth-hook` Edge Function, secured with `AUTH_HOOK_SECRET`

#### Pilot Setup (non-technical walkthrough)

1. **Create the new pilot project** in the Supabase dashboard. *Why:* keeps the real driving school's data completely separate from the development/testing database, so nothing engineers do while building new features can ever affect a real customer. *Success looks like:* a new project appears in the Supabase dashboard with its own unique URL.
2. **Apply the database structure** to the new project (a developer runs `supabase db push --linked` — see `docs/DEPLOY.md`). *Why:* an empty Supabase project has no tables yet; this step builds the entire database structure the app expects. *Success looks like:* the developer reports "all migrations applied" with no errors.
3. **Deploy the Edge Functions** to the new project. *Why:* the database alone can't run the app's business logic — the functions are the "brain" that enforces rules like "a student can only be booked into one lesson at a time." *Success looks like:* the developer confirms all functions show as deployed in the dashboard.
4. **Configure the Auth Hook** (Dashboard → Authentication → Hooks). *Why:* without this, users can log in, but the system won't know which driving school they belong to — everything downstream depends on this working correctly. *Success looks like:* a test login produces a session that correctly shows the driving school's information.
5. **Create the first organization and admin account** (a developer runs a one-time setup script). *Why:* the platform needs at least one driving school and one administrator account to be usable at all. *Success looks like:* the administrator can log in and see their (empty, until real data is added) dashboard.

#### Production Setup

No separate production project — per Phase 3, the pilot project *is* promoted to production use rather than migrated again. What changes at that point is operational discipline: stricter secret rotation (see `docs/SECRETS_MANAGEMENT_GUIDE.md`), and closer monitoring of the plan's usage limits as more driving schools join.

**Security recommendations:** never share the service role key outside Supabase's own secret store; review Dashboard → Authentication → Users periodically for unexpected accounts; keep the Pro-tier backup retention window in mind when planning any destructive operation.

**Key rotation:** the `AUTH_HOOK_SECRET` and `WORKER_SECRET` should be rotated on a routine schedule (see `docs/SECRETS_MANAGEMENT_GUIDE.md`) and immediately if anyone who had access to them leaves the team.

#### Testing

- Run `GET https://<project-ref>.supabase.co/functions/v1/health` and confirm a `200 { status: "ok" }` response (`docs/operational-runbook.md` §2)
- Sign in as a test user and inspect the JWT (browser console steps in `docs/PILOT.md`) to confirm `organization_id`, `role`, and `permissions` are present and `auth_degraded` is absent

**Failure scenario — sign-in loops back to the login page:** the Auth Hook is not configured or not working. See `docs/operational-runbook.md` §8, "Auth loop."

**Recovery:** re-check the Auth Hook configuration against the exact steps in `docs/DEPLOY.md` §3.3; check Edge Function logs for the `auth-hook` function for the specific error.

#### Troubleshooting

| Issue | Likely cause | Solution |
|---|---|---|
| Blank page on load | Missing/incorrect `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` in the build | Confirm the values used to build the deployed frontend match Dashboard → Settings → API for the correct project |
| JWT missing `organization_id` | Auth Hook not configured | Follow `docs/DEPLOY.md` §3.3 exactly |
| JWT has `auth_degraded: true` | Auth Hook ran but a downstream database call failed | Check `auth-hook` function logs for the specific database error |
| 401 on every API call | CORS origin not allowlisted, or wrong anon key | Confirm `APP_URL` Supabase Secret matches the exact domain making the request |

#### Operational Notes

- **Maintenance:** none beyond the routine migration/deploy cadence already documented in `docs/DEPLOY.md`
- **Limits:** plan-dependent (connection pool size, function invocation limits) — check the dashboard's usage page periodically
- **Pricing:** see [supabase.com/pricing](https://supabase.com/pricing) for current figures
- **Monitoring:** `docs/operational-runbook.md` §2 (health endpoints) and §5 (structured logging)
- **Backups:** point-in-time recovery, Pro+ plans only — confirm the pilot project's tier
- **Vendor recommendation:** stay on the officially supported CLI/SDK versions; avoid direct database connections outside the documented connection-string pattern in `docs/DEPLOY.md`

---

### 4.2 Resend (Email)

> **For the long-term email architecture** (categories, multi-tenant sending strategy, provider abstraction design, what's frozen for Version 1.0 vs. deferred to later) — see `docs/EMAIL_ARCHITECTURE.md`. This chapter stays operational: account creation, configuration, and the step-by-step SMTP runbook.

#### Purpose

Resend sends the emails the *application itself* generates — things like a booking confirmation or a staff notification. (This is different from the emails Supabase Auth sends for password resets and invitations — that's a separate system, explained in the "Important distinction" box below. Confusing the two is the single most common mistake when setting this up.)

**Why TrafikskolaOS needs it:** without a working email provider, the app's own notification messages simply queue up and never actually send — nothing breaks, but nobody receives anything.

**Business process this depends on:** any workflow that notifies a student, guardian, or instructor by email.

> **Important distinction — read this before configuring anything.** There are *two separate* email systems in this platform:
> 1. **The app's own notification emails** (this chapter) — sent via Resend, configured as a Supabase Secret (`RESEND_API_KEY`).
> 2. **Supabase Auth's own emails** — password reset links, account invitations — sent through Supabase's *own* email configuration (Dashboard → Authentication → Email), which is unrelated to Resend unless you deliberately connect the same Resend account as Supabase's custom SMTP provider too.
>
> Setting up #1 alone does **not** make password resets work. Both need attention. `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` Phase 5 covers #2 in more detail.

#### Architecture

- **Frontend:** no direct connection — the frontend never talks to Resend
- **Edge Functions:** `communication-worker` calls `dispatchMessage()` (`_shared/comm-providers.ts`), which calls Resend's HTTP API directly via `fetch()` — no SDK/library dependency
- **Supabase:** the API key is stored as a Supabase Secret, read at the moment a message is dispatched
- **External API:** [resend.com](https://resend.com)'s email-sending API

#### Account Creation

- Created at [resend.com](https://resend.com)
- **Free tier:** Resend offers a free tier sufficient for a small pilot's email volume — confirm current limits at [resend.com/pricing](https://resend.com/pricing), since free-tier allowances change over time
- **Pilot:** the free tier is very likely adequate for a single pilot organization's volume
- **Production:** upgrade only once actual sending volume approaches the free tier's limit — no need to pre-pay for capacity that isn't needed yet
- **Expected cost:** confirm at [resend.com/pricing](https://resend.com/pricing) at time of signup

#### Configuration

- **API Key:** generated in the Resend dashboard, stored as the Supabase Secret `RESEND_API_KEY`
- **Domain (recommended, not strictly required to start):** Resend can send from a shared/testing address immediately, but for real deliverability (avoiding spam folders), verifying your own sending domain (e.g. `mail.advertentia.com`) is strongly recommended. This requires adding DNS records (SPF/DKIM) that Resend provides — done through whichever service manages `advertentia.com`'s DNS.
- **No webhook is currently used** — the code only sends email, it doesn't need to receive delivery-status callbacks today

#### Pilot Setup (non-technical walkthrough)

1. **Create a Resend account.** *Why:* this is the account that will actually send the emails. *Success looks like:* you can log into resend.com.
2. **Generate an API Key** (Resend dashboard → API Keys). *Why:* this is the "password" the platform uses to prove to Resend it's allowed to send email on your behalf — it must be kept secret. *Success looks like:* a key starting with `re_` is shown (copy it immediately — Resend only shows it once).
3. **Give the API key to a developer to set as a Supabase Secret** (`RESEND_API_KEY`) on the pilot project. *Why:* the key needs to live inside Supabase's secure secret storage, never in an email, chat message, or document. *Success looks like:* the developer confirms via `supabase secrets list` that `RESEND_API_KEY` is set (they will not, and should not, show you the value back).
4. **(Recommended) Verify a sending domain.** *Why:* emails from an unverified/shared domain are more likely to land in spam. *Success looks like:* Resend's dashboard shows the domain as "Verified."
5. **Send a test email** (a developer triggers a real notification in the app, e.g. a test booking). *Why:* confirms the whole chain — app → Resend → real inbox — actually works. *Success looks like:* the test email arrives in a real inbox within a few minutes.

#### Production Setup

No structural difference from Pilot — the same account, scaled up if volume grows. **Security recommendation:** rotate the API key if it's ever suspected of being exposed (e.g. accidentally pasted somewhere it shouldn't have been). **Monitoring:** Resend's own dashboard shows delivery/bounce statistics; no additional monitoring integration exists in this codebase today.

#### Testing

Trigger any real notification-sending action in the app and confirm the email arrives. **Expected result:** email received within a few minutes, from the configured sender address.

**Failure scenario — message stays "queued" forever:** `RESEND_API_KEY` is not set, or is set but invalid. Check Edge Function logs for `communication-worker` for the specific Resend API error.

**Recovery:** re-generate the API key in Resend's dashboard if it was invalidated, and update the Supabase Secret.

#### Troubleshooting

| Issue | Likely cause | Solution |
|---|---|---|
| Emails never send, stay "queued" | `RESEND_API_KEY` not set | Set it as a Supabase Secret |
| Emails send but land in spam | Sending domain not verified | Complete Resend's domain verification (SPF/DKIM DNS records) |
| Password reset emails don't work even though Resend is configured | Confusing the two email systems (see the box above) | Configure Supabase Auth's own SMTP separately |

#### Operational Notes

- **Maintenance:** none beyond periodic API key rotation
- **Limits:** free-tier sending volume caps — check Resend's current published limits
- **Pricing:** [resend.com/pricing](https://resend.com/pricing)
- **Monitoring:** Resend's own delivery dashboard
- **Backups:** not applicable (Resend does not store data the platform depends on)
- **Vendor recommendation:** Resend is a good fit here specifically because it's already the only email provider with real, tested code in this repository — prefer it over enabling SendGrid or Mailjet unless there's a specific reason to switch

**Alternative email providers (SendGrid, Mailjet) — addendum.** Both are fully implemented in `comm-providers.ts` using the identical `dispatchMessage()` pattern as Resend (`SENDGRID_API_KEY`; `MAILJET_API_KEY` + `MAILJET_SECRET_KEY`). Neither is recommended for pilot use — they exist as alternatives in case a future business reason (existing vendor relationship, pricing, deliverability issue with Resend) makes switching worthwhile. If ever activated, the account-creation and configuration pattern mirrors Resend's above, substituting the relevant provider's dashboard and API key name.

#### Supabase Auth SMTP Runbook (Sprint 3 — ready to execute, requires a human with Resend/DNS/Dashboard access)

**Why this exists as its own runbook, separate from the account-creation steps above:** everything above this point configures Resend for the *app's own* notification emails. This section configures the completely separate thing Sprint 3 was actually trying to fix — **Supabase Auth's own transactional email** (invitations, password resets, email confirmation), which currently uses Supabase's default built-in sender. That sender's rate limit was confirmed exhausted during Sprint 2B's live testing (`POST /auth/v1/signup` → `429 over_email_send_rate_limit`, reproduced twice), which is the concrete, live-verified reason new account creation is currently blocked. Removing Supabase's default limit entirely — by pointing Auth at a real SMTP relay — is the fix. **No part of this runbook can be executed by an AI agent**: it requires a real account signup, real DNS zone access for `advertentia.com`, and the Supabase Dashboard UI, none of which this session has access to. What follows is written so a human can execute it in one pass with no additional research.

1. **Create (or reuse) the Resend account** — [resend.com](https://resend.com). If Resend is also being set up for the app's own notifications (§4.2 above), this is the same account; no need for two.
2. **Add and verify the sending domain** (Resend dashboard → Domains → Add Domain). Use a subdomain rather than the bare root domain if `advertentia.com`'s root is needed for anything else DNS-sensitive — e.g. `mail.advertentia.com`. Resend will generate the exact DNS records to add:
   - **SPF**: a `TXT` record (Resend provides the exact value — typically `v=spf1 include:amazonses.com ~all` or similar, tied to Resend's sending infrastructure)
   - **DKIM**: one or more `CNAME` or `TXT` records (Resend provides the exact host/value pairs)
   - **DMARC** (recommended, not required by Resend, but strengthens deliverability and is good practice for a domain sending authentication-critical email): a `TXT` record at `_dmarc.<domain>`, e.g. `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@advertentia.com` — adjust the policy (`p=`) and report address to whatever the domain owner wants to receive
   - Add all records at whichever DNS host manages `advertentia.com` — this session has no visibility into which provider that is
3. **Wait for verification** — Resend's dashboard shows each record's status; DNS propagation is usually minutes, occasionally up to 24–48 hours depending on the registrar/TTLs. Do not proceed until Resend shows the domain as fully verified — an unverified domain will fail to send or land in spam.
4. **Generate SMTP credentials** — Resend dashboard → API Keys (Resend's SMTP relay uses an API key as the SMTP password, not a separate credential). Resend's stable SMTP connection details:
   - **Host:** `smtp.resend.com`
   - **Port:** `465` (SSL) or `587` (STARTTLS) — either works; Supabase's SMTP form typically expects one of these
   - **Username:** `resend` (literal string, not the account email)
   - **Password:** the API key generated in this step
   - **Sender email:** an address on the newly-verified domain, e.g. `noreply@advertentia.com` or `noreply@mail.advertentia.com`
5. **Configure Supabase Dashboard → Authentication → Email → SMTP Settings** (Dashboard-only, no CLI/API path exists — confirmed across Sprints 2A/2B/3): toggle "Enable Custom SMTP," fill in the host/port/username/password/sender values from step 4, save.
6. **Re-run the exact verification this session used to find the original blocker**, to confirm the fix:
   ```bash
   curl -s -w "\nHTTP_STATUS:%{http_code}\n" "https://ulgsndzfksphquqakelq.supabase.co/auth/v1/signup" \
     -H "apikey: <VITE_SUPABASE_ANON_KEY>" -H "Content-Type: application/json" \
     -d '{"email":"<a-real-inbox-you-can-check>@<domain>","password":"<a-throwaway-test-password-12+chars>"}'
   ```
   Expect `200`/`201` instead of `429`, and a real confirmation email arriving in the target inbox within a minute or two. This is the exact test to hand back to continue Sprint 2B/3's authentication lifecycle validation once SMTP is live.
7. **Only after step 6 passes**, proceed to creating the dedicated validation tenant and running the full authentication lifecycle tests (Sprint 2B's Phase 3 onward) — there is no reason to attempt them before SMTP is confirmed working, since the same rate limit will block them identically.

---

### 4.3 Stripe (Payments)

#### Purpose

Stripe lets a driving school accept card payments from students online, instead of relying on bank transfers or cash. **This is a per-organization choice** — each driving school connects its *own* Stripe account; TrafikskolaOS does not process payments through one central platform account.

**Business process this depends on:** any workflow where a student pays for lessons/packages online rather than being invoiced separately.

#### Architecture — and the one thing every reader needs to understand about its current state

Stripe integration here has **two separate halves**, and only one of them is fully working today:

1. **Taking the payment (working):** `supabase/functions/student-portal/index.ts` creates a Stripe "Checkout Session" — the page a student is redirected to in order to enter their card details. This uses the driving school's own stored Stripe secret key (or, as a fallback, a platform-wide `STRIPE_SECRET_KEY` if the organization hasn't set its own). **This part works right now.**
2. **Confirming the payment (not working yet):** `supabase/functions/stripe-webhook/index.ts` is the code that's supposed to receive a message from Stripe saying "this payment succeeded," and automatically update the invoice. This code is fully written and correct, but it refuses to run because its one required secret, `STRIPE_WEBHOOK_SECRET`, has never been set. Confirmed directly in `docs/operational-runbook.md` §12.

**What this means in plain terms:** a student *can* pay today, and the money genuinely reaches the driving school's Stripe account — but the platform doesn't automatically find out the payment happened. Someone has to check Stripe's own dashboard and manually mark the invoice as paid until the webhook is configured.

- **Frontend:** the frontend never talks to Stripe directly — it calls `student-portal`, which redirects the browser to a Stripe-hosted checkout page
- **Edge Functions:** `student-portal` (session creation), `stripe-webhook` (confirmation, currently inactive)
- **Supabase:** per-organization `stripe_secret_key` stored in that organization's settings; `STRIPE_WEBHOOK_SECRET` as a platform-wide Supabase Secret
- **External API:** [stripe.com](https://stripe.com)

#### Account Creation

- Each participating driving school creates its own account at [stripe.com](https://stripe.com)
- **Free tier:** Stripe has no subscription fee — it takes a percentage of each transaction instead. Confirm current transaction fees at [stripe.com/pricing](https://stripe.com/pricing)
- **Pilot:** Stripe's own "test mode" (a built-in Stripe feature, not something this codebase adds) allows testing the entire flow with fake card numbers before accepting real payments — recommended before going live with a real pilot organization's account
- **Production:** switch from Stripe's test mode to live mode once testing is complete

#### Configuration

- **Per-organization secret key:** stored in that organization's own settings inside the app (not a Supabase Secret) — this is how each driving school connects its own Stripe account
- **`STRIPE_WEBHOOK_SECRET`:** a Supabase Secret, currently unset — this is the missing piece described above
- **Webhook:** must be registered in the Stripe dashboard, pointing at `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`, listening for `checkout.session.completed`. The exact steps are already documented in `docs/operational-runbook.md` §12 — this guide references rather than repeats them

#### Pilot Setup (non-technical walkthrough)

1. **Decide whether the pilot organization wants online payments at all.** *Why:* this integration is entirely optional for the pilot — many driving schools may be fine invoicing manually at first. *Success looks like:* a clear yes/no decision, not an assumption.
2. **If yes: the driving school creates its own Stripe account.** *Why:* the money needs to go to *their* bank account, not a shared one. *Success looks like:* they can log into their own Stripe dashboard.
3. **The driving school's Stripe secret key is entered into their organization settings in the app** (by an administrator, through the app's own settings screen — not a developer task). *Why:* this connects their Stripe account to their TrafikskolaOS organization specifically. *Success looks like:* a test checkout session can be created.
4. **A developer configures the webhook** per `docs/operational-runbook.md` §12. *Why:* without this step, payments will still work, but someone will have to manually check Stripe and mark invoices as paid — doable for a handful of pilot payments, not sustainable beyond that. *Success looks like:* a test payment in Stripe's test mode automatically marks the corresponding invoice as paid in the app.
5. **Test with a real (small) transaction, or Stripe's test-mode fake cards, before relying on it for real customer payments.**

#### Production Setup

**Differences from Pilot:** switch from Stripe test mode to live mode; ensure the webhook secret is set for live mode specifically (Stripe issues separate webhook secrets per mode). **Security recommendations:** never let a driving school's Stripe secret key be visible to anyone outside that organization's own admins — this is already how it's stored (per-organization, not shared) by design. **Key rotation:** if a driving school suspects their key was exposed, they should regenerate it directly in their own Stripe dashboard — this is the organization's own responsibility, not a platform-wide secret. **Monitoring:** Stripe's own dashboard shows every transaction and its status — the ultimate source of truth until the webhook automation is active. **Operational ownership:** the webhook secret itself (platform-wide) is Platform Engineering's responsibility; each organization's own Stripe account is that organization's responsibility.

#### Testing

- **Checkout session creation:** initiate a test purchase in the app and confirm it redirects to a real Stripe checkout page
- **Webhook (once configured):** use Stripe dashboard's "Send test webhook" feature and confirm the `stripe-webhook` function's logs show `payment settled`, and the corresponding invoice status becomes `completed` (exact steps: `docs/operational-runbook.md` §12)

**Failure scenario — payment succeeds in Stripe but the invoice never updates:** the webhook is not configured. This is the *expected current behavior*, not a bug, until `STRIPE_WEBHOOK_SECRET` is set. **Recovery:** manually mark the invoice as paid in the app until the webhook is configured.

#### Troubleshooting

| Issue | Likely cause | Solution |
|---|---|---|
| "Checkout not available" error | No Stripe key configured for the organization (and no platform-wide fallback set) | Enter the organization's Stripe secret key in settings |
| Payment succeeds, invoice stays unpaid | Webhook not configured (current default state) | Follow `docs/operational-runbook.md` §12, or reconcile manually |
| Webhook returns an error in Stripe's dashboard | Signature mismatch — wrong `STRIPE_WEBHOOK_SECRET` | Re-copy the exact signing secret from Stripe's webhook settings page |

#### Operational Notes

- **Maintenance:** monitor Stripe's own dashboard for disputes/chargebacks — nothing in this codebase automates that today
- **Limits:** Stripe's own rate limits, unlikely to be relevant at pilot scale
- **Pricing:** [stripe.com/pricing](https://stripe.com/pricing), and note it's per-transaction, not a subscription
- **Monitoring:** Stripe's dashboard is the primary source of truth until the webhook is live
- **Backups:** not applicable — Stripe is the system of record for payment events, not this platform
- **Vendor recommendation:** finish the webhook configuration before actively marketing online payments to more than a handful of pilot customers, so reconciliation doesn't become a growing manual burden

---

### 4.4 BankID

#### Purpose

BankID is Sweden's national digital identity system — the same login method used for banking, tax filing, and government services. Supporting it would let TrafikskolaOS users log in (and potentially sign documents) with a method Swedish users already trust and use daily, instead of a username/password.

**Business process this depends on:** none yet in the pilot — this feature is not active.

#### Architecture

- **Frontend:** the `VITE_FEATURE_BANKID` flag exists to show/hide BankID as a login option, and currently defaults to `false` (off) everywhere
- **Edge Functions:** `bankid-auth` (424 lines) is a complete, real implementation — not a stub
- **Supabase:** would write to the shared `auth_identity_links` table per the Handbook's identity-provider integration pattern (P-027/ADR-007) — this is the architecturally-approved way any identity provider connects, BankID included
- **External API:** BankID's own relying-party API, which requires a signed agreement and a certificate — this is the piece that's missing, not code

#### Account Creation

- Requires a formal application to BankID (or a BankID-approved reseller) as a "relying party" — this is a business/legal process, not a self-service signup, and involves a signed agreement plus a certificate (`BANKID_CLIENT_CERT`, `BANKID_CLIENT_KEY`, `BANKID_CA_CERT`)
- **Expected cost and timeline:** varies and should be confirmed directly with BankID or a reseller — this is not something this document can estimate reliably

#### Configuration

- `BANKID_CLIENT_CERT`, `BANKID_CLIENT_KEY`, `BANKID_CA_CERT`, `BANKID_ENV` (test vs. production BankID environment) — Supabase Secrets, none currently set
- `VITE_FEATURE_BANKID` — frontend flag, currently `false`

#### Pilot Setup

**Not applicable for Pilot v1.0.** Per the Enterprise Architecture Handbook's Delivery Classification, this integration is "Development Complete" but blocked on external certificate acquisition, and explicitly should not block pilot launch (`docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` Phase 4). If the product owner wants to begin the BankID relying-party application process now, that's a business action that can run in parallel with the pilot, independent of engineering work.

#### Production Setup

Once a certificate exists: set the four secrets above, flip `VITE_FEATURE_BANKID` to `true`, and — per the Handbook's Operational Governance section — run the full "Edge Function Authentication Verification checklist" against the live deployment, since `bankid-auth` is explicitly named as one of the endpoints that bypasses standard Supabase JWT verification and therefore needs manual post-deploy confirmation every time.

#### Testing

BankID provides its own test environment (`BANKID_ENV=test`) with test-only BankID credentials for verifying the integration before going live — use this rather than testing against real BankID accounts.

#### Troubleshooting

Not applicable until configuration begins — no live troubleshooting history exists yet.

#### Operational Notes

- **Maintenance:** BankID certificates expire and must be renewed — track the expiry date once obtained
- **Vendor recommendation:** engage BankID (or a reseller) early if this is wanted for a near-term release, given the external approval timeline is the actual bottleneck, not engineering effort

---

### 4.5 Fortnox

#### Purpose

Fortnox is one of the most widely used bookkeeping/accounting programs among small Swedish businesses. Connecting to it lets a driving school that already uses Fortnox keep its books in one place, rather than maintaining financial records in both Fortnox and TrafikskolaOS separately.

**Business process this depends on:** none yet in the pilot — no organization has connected Fortnox.

#### Architecture

- **Frontend:** no dedicated UI confirmed in this review beyond whatever the `fortnox` function's routes support
- **Edge Functions:** `supabase/functions/fortnox/index.ts` — a complete OAuth2 (PKCE) flow: `oauth/status`, `oauth/start`, `oauth/callback`, `oauth/refresh`, `oauth/disconnect`
- **Supabase:** per-organization OAuth tokens stored in that organization's settings, refreshed automatically when expired
- **External API:** Fortnox's own OAuth and accounting API

#### Account Creation

- Requires registering a Fortnox developer app to obtain `FORTNOX_CLIENT_ID`/`FORTNOX_CLIENT_SECRET` — done at Fortnox's developer portal
- Each participating driving school separately authorizes the connection to *their own* Fortnox account through the OAuth flow (they don't share credentials with TrafikskolaOS directly — this is the standard, safer OAuth pattern)

#### Configuration

- `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET` — Supabase Secrets (platform-wide, since these identify the TrafikskolaOS *application* to Fortnox, not any individual driving school)
- No local environment file currently contains these

#### Pilot Setup

**Not required for Pilot v1.0** — no evidence any pilot organization needs this. If a specific pilot organization does want it, the sequence is: register the Fortnox developer app → set the two client secrets → the organization completes the OAuth authorization inside the app.

#### Production Setup

Same mechanism, activated per organization as needed — this doesn't have a separate "production configuration," since it's already designed to be turned on selectively.

#### Testing

Use Fortnox's own sandbox/test account (if available through their developer program) before connecting a real driving school's live bookkeeping data.

#### Troubleshooting

| Issue | Likely cause | Solution |
|---|---|---|
| OAuth connection fails immediately | `FORTNOX_CLIENT_ID`/`SECRET` not set | Register the Fortnox app and set the secrets |
| Connection works, then stops after some time | Refresh token expired or revoked | Organization must reconnect via `oauth/start` again |

#### Operational Notes

- **Maintenance:** token refresh is automatic per the code; no manual renewal expected under normal operation
- **Vendor recommendation:** only pursue this once a specific pilot organization actually asks for it — building demand ahead of a concrete need isn't necessary at this stage

---

### 4.6 SMS & Voice Providers (Twilio, Vonage, 46elks)

#### Purpose

These send text messages and automated voice calls — for example, a reminder the day before a lesson. TrafikskolaOS supports **three interchangeable providers** for this; a driving school (or the platform) picks one, not all three.

**Business process this depends on:** SMS/voice-based reminders and alerts — currently optional, not part of any workflow that requires it to function.

#### Architecture

All three plug into the exact same code path: `dispatchMessage()` in `_shared/comm-providers.ts`, selected by a `provider` value (`'twilio'`, `'vonage'`, or `'46elks'`) stored per-organization. If no provider is set for a channel, messages simply queue instead of failing — nothing breaks by leaving this unconfigured.

| Provider | Channels | Notable |
|---|---|---|
| **46elks** | SMS, voice | Sweden-domestic provider — likely the most natural first choice for a Swedish driving school, if SMS is wanted at all |
| **Twilio** | SMS, voice, WhatsApp | The most globally established of the three, broadest feature set (also handles WhatsApp — see the addendum below) |
| **Vonage** | SMS, voice | A third alternative, functionally similar to Twilio for this use case |

#### Account Creation

- **46elks:** [46elks.se](https://46elks.se) — Sweden-based, likely the simplest for a Sweden-only pilot
- **Twilio:** [twilio.com](https://twilio.com) — global provider, usage-based pricing
- **Vonage:** [vonage.com](https://vonage.com) — global provider, usage-based pricing
- All three are pay-as-you-go (no subscription); confirm current per-message/per-minute pricing directly with each provider before choosing, since pricing varies by destination country and changes over time

#### Configuration

- 46elks: `ELKS_API_USERNAME`, `ELKS_API_PASSWORD`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER`
- Vonage: `VONAGE_API_KEY`, `VONAGE_API_SECRET`
- All as Supabase Secrets; none currently set

#### Pilot Setup

**Not required for Pilot v1.0.** If a pilot organization specifically requests SMS reminders: (1) decide which one provider to use — 46elks is the natural default for a Sweden-only pilot given its domestic focus, (2) create an account with that provider, (3) a developer sets that provider's secrets, (4) send a real test SMS to a real phone and confirm delivery, (5) set that provider as the organization's chosen SMS provider.

#### Production Setup

No structural difference — the same per-provider setup, at whatever volume is needed. **Security:** rotate credentials if ever exposed. **Monitoring:** each provider's own dashboard shows delivery status.

#### Testing

Send a real test message to a real phone number and confirm it arrives. **Failure scenario:** message stays "queued" — provider secrets not set, or the organization has no provider selected for that channel.

#### Troubleshooting

| Issue | Likely cause | Solution |
|---|---|---|
| Messages queue but never send | No provider secrets set, or none selected for the organization | Configure one provider fully |
| "Missing secrets" error in logs | Partially-set credentials (e.g. Vonage key without the secret) | Confirm all required values for that specific provider are set |

#### Operational Notes

- **Maintenance:** minimal — these are pay-as-you-go APIs with no ongoing account maintenance beyond billing
- **Pricing:** varies by provider and destination — confirm directly, do not rely on a fixed number here
- **Vendor recommendation:** pick one provider deliberately (46elks for a Sweden-only pilot is the most defensible default) rather than configuring multiple "just in case" — extra configured providers are extra credentials to secure for no benefit, since only one is ever used per organization per channel

**WhatsApp via Twilio — addendum.** Twilio's WhatsApp support (`TWILIO_WHATSAPP_NUMBER`) uses the same Twilio account as SMS, so if Twilio is already the chosen SMS provider, enabling WhatsApp is a small additive step rather than a separate integration.

---

### 4.7 Meta WhatsApp Business API

#### Purpose

An alternative way to send WhatsApp messages, directly through Meta (WhatsApp's parent company) rather than through Twilio. WhatsApp is widely used informally in Sweden, so this could be a natural fit for reminders/alerts some users would actually read promptly.

**Business process this depends on:** none currently — not active.

#### Architecture

- **Edge Functions:** `dispatchMetaWhatsapp()` in `comm-providers.ts`, same `dispatchMessage()` pattern as everything else in this guide
- **External API:** Meta's own WhatsApp Business Platform API

#### Account Creation

Requires Meta Business verification — a more involved process than a simple API signup, since Meta requires business identity verification before granting WhatsApp Business API access. Start this process at [business.facebook.com](https://business.facebook.com) if pursued.

#### Configuration

`META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID` — Supabase Secrets, not currently set.

#### Pilot Setup / Production Setup

**Future Release — not part of Pilot v1.0.** Given Twilio already offers WhatsApp support with a substantially simpler setup process (Section 4.6's addendum), recommend starting there if WhatsApp is wanted at all during the pilot, and revisiting Meta's direct API only if a specific reason (cost at scale, feature need) makes it worthwhile later.

#### Testing / Troubleshooting / Operational Notes

Not applicable — no live configuration exists to test or troubleshoot yet.

---

### 4.8 Push Notification Providers (OneSignal, Firebase)

#### Purpose

Push notifications are the alerts a mobile app or browser can show even when the app isn't open (similar to a phone's regular notification banner). TrafikskolaOS's own dedicated mobile app does not exist yet (`docs/PILOT.md`'s "Known Pilot-Phase Limitations" confirms this), so there is currently no product surface that would deliver a push notification even if this were configured.

**Business process this depends on:** none — no current feature requires push notifications.

#### Architecture

Same `dispatchMessage()` pattern (`channel: 'push'`), provider selectable per organization between OneSignal and Firebase Cloud Messaging.

#### Account Creation, Configuration

- OneSignal: [onesignal.com](https://onesignal.com); `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY`
- Firebase: [firebase.google.com](https://firebase.google.com); `FIREBASE_SERVER_KEY`

#### Pilot Setup / Production Setup

**Not Required for Pilot v1.0, and arguably not actionable yet** — without a mobile app or a browser-push-enabled frontend, there's no client to actually *receive* a push notification, regardless of which provider is configured. Recommend revisiting this once (or if) a dedicated mobile/PWA experience is built.

#### Testing / Troubleshooting / Operational Notes

Not applicable — no active configuration.

---

### 4.9 Sentry (Frontend Error Monitoring)

#### Purpose

Sentry automatically catches and reports errors that happen in a user's browser while using the app — for example, if a page crashes for one user, Sentry tells the engineering team exactly what went wrong, without waiting for that user to report it themselves.

**Business process this depends on:** none directly — this is an engineering/quality tool, not a customer-facing feature. It exists to catch problems faster.

#### Architecture

- **Frontend only:** `apps/web/src/core/monitoring/index.ts`, using the `@sentry/react` package
- **No Edge Function or backend involvement** — this is purely a frontend concern
- Deliberately **never initializes** outside a production build, and **never initializes** without `VITE_SENTRY_DSN` set — confirmed the SDK is fully removed from the bundle (not just inactive) when the DSN is absent, so there is zero cost to leaving it unconfigured during the pilot if that's the decision made

#### Account Creation

- Created at [sentry.io](https://sentry.io)
- **Free tier:** Sentry's free tier is very likely sufficient for a small pilot's error volume — confirm current limits at [sentry.io/pricing](https://sentry.io/pricing)
- **Recommendation from `docs/operational-runbook.md` §11:** choose the **EU data region** specifically, for GDPR alignment with this platform's Sweden-first posture

#### Configuration

- `VITE_SENTRY_DSN` — the one value needed, obtained from the Sentry project settings after creating a project
- Optional, not enabled by default: source map upload for readable stack traces (`docs/operational-runbook.md` §11 point 3) — a "nice to have," not required to get basic error reporting working

#### Pilot Setup (non-technical walkthrough)

1. **Create a Sentry account and a new project** (choose "React" as the platform). *Why:* this is where error reports will appear. *Success looks like:* a new, empty project in the Sentry dashboard.
2. **Choose the EU data region when creating the project.** *Why:* keeps error data in Europe, consistent with this platform's Sweden-first data handling posture. *Success looks like:* the project's region shows as EU in Sentry's settings.
3. **Copy the DSN** (a URL-like value shown in the project's settings). *Why:* this tells the app which Sentry project to report to. *Success looks like:* a value starting with `https://` that includes `.ingest.` in it.
4. **Give it to a developer to set as `VITE_SENTRY_DSN`** in the production build configuration. *Why:* this activates monitoring — without it, nothing changes from today's behavior. *Success looks like:* the developer confirms a test error appears in the Sentry dashboard after redeploying.

#### Production Setup

No structural difference — the decision to activate this is really a Pilot-stage decision (Phase 3), and Production simply continues whatever was decided. **Recommendation:** even if skipped for the initial pilot, activate before a wider rollout beyond a single closely-watched pilot organization, since manual observation doesn't scale.

#### Testing

Temporarily trigger a real error in a test/staging context and confirm it appears in the Sentry dashboard within a minute or two (`docs/operational-runbook.md` §11, Activating step 5).

#### Troubleshooting

| Issue | Likely cause | Solution |
|---|---|---|
| No errors ever appear in Sentry | `VITE_SENTRY_DSN` not set in the actual deployed build, or build was not a production build | Confirm the exact environment variables used for the deployed build |
| Errors appear but with unreadable minified stack traces | Source map upload not configured (optional feature) | Follow `docs/operational-runbook.md` §11 point 3 if readable traces are wanted |

#### Operational Notes

- **Maintenance:** none beyond periodic review of incoming issues
- **Limits:** free-tier event volume caps — check Sentry's current published limits
- **Pricing:** [sentry.io/pricing](https://sentry.io/pricing)
- **Monitoring:** this *is* the monitoring tool — no further layer needed for frontend errors
- **Privacy:** already configured with `sendDefaultPii: false` and explicit PII stripping in code — confirmed in `docs/operational-runbook.md` §11, "Privacy / GDPR"
- **Vendor recommendation:** the EU region choice is a one-time decision made at project creation and cannot be easily changed later — get it right the first time

---

### 4.10 Person Lookup (Personnummer) — v3.0 Production-Grade Framework

#### Purpose

When staff register a new student, typing in the student's full address, postal code, and date of birth by hand is slow and error-prone. A "person lookup" service takes a personnummer (the Swedish personal identity number) and looks up the person's registered details automatically, so the registration form can pre-fill them.

**Why TrafikskolaOS needs it:** faster, more accurate student registration — less manual typing, fewer data-entry mistakes.

**What changed in v3.0.** Every item the v2.0 pass explicitly deferred — a caching layer, a standardized cross-provider error taxonomy, structured audit logging, and per-tenant provider configuration — was built in this pass, along with a first real production provider (Roaring). This was an explicit, approved scope expansion (previously classified as Version 1.1 Backlog; that classification has been superseded). Mock remains fully supported and is still the zero-config default for any tenant that hasn't configured a real provider.

#### Supported Providers

| Provider | Status |
|---|---|
| **Mock** | ✅ Implemented, default for any org with no configuration row. 9 fixed fictional test personas — both genders, deceased, protected identity, emigrated, and "found but incomplete" — plus a clean not-found result for everything else. No network call. |
| **Roaring** | ✅ Implemented (`RoaringPersonLookupProvider`) — see Production Provider below. Field-mapping code is isolated in `mapRoaringResponseToCanonical()` pending verification against a live sandbox response (see "Commissioning Status"). |
| **SPAR** (Statens personadressregister) | ❌ Not implemented — registered name, no self-service path exists (see Provider Comparison) |
| **Navet** | ❌ Not implemented — same status as SPAR (Navet is the source system SPAR itself distributes from) |
| **Creditsafe** | ❌ Not implemented — sales-gated, not evaluated further after Roaring was confirmed self-service |
| **Ratsit** | ❌ Not implemented — not evaluated in depth |
| **Custom** | ❌ Reserved name for a bespoke/future integration |

#### Provider Comparison (researched this pass — no more "Unknown"s for the evaluated set)

| Provider | Coverage | Pricing | Sandbox | Self-Service Signup | GDPR | Verdict |
|---|---|---|---|---|---|---|
| **Mock** | 8-9 fixed test personas only | Free | N/A — it IS the sandbox | N/A | No real data ever leaves the process | Pilot and all dev/testing |
| **Roaring** | Nordic population register (name, address, deceased/protected/emigrated status, relations, historical addresses) | Pay-as-you-go from ~0.20 SEK/credit; free sandbox with dummy data, no cost until production activated | ✅ **Confirmed** — free developer sandbox, immediate API key | ✅ **Confirmed** — `developer.roaring.io`, "Create account" → instant sandbox, no sales call | Standard commercial DPA; confirm terms before production activation | **Recommended production choice** — the only evaluated option with genuine self-service |
| **SPAR/Navet (direct)** | Sweden's full population register — most authoritative | Real per-lookup/subscription — confirm with Skatteverket | None self-service | ❌ Requires a formal SPAR-ombud/reseller commercial agreement — same category of blocker as BankID's production certificate, a months-long legal process | Would need its own DPA review | Most authoritative but not implementable without a real business relationship first |
| **TIC** (The Intelligence Company) | SPAR-based person data + business intelligence | Not published | Unclear | ❌ **Confirmed sales-gated** — site explicitly directs to "contact us for a demo," no self-service found | Purpose-validation required per their docs | Not viable without a sales relationship |
| **ZignSec** | Official Swedish Population Registry — best-matching status taxonomy found (Active/Deceased/Protected/DeRegistered/**Emigrated** — the direct inspiration for this framework's own `emigrated` field) | Not published | Documented test environment (`test-gateway.zignsec.com`) exists | ❌ **Confirmed sales-gated** — "subscription key issued by ZignSec support," no public self-service signup | Not evaluated (no account) | Best data-model fit; worth revisiting if a commercial relationship is established for other reasons |

#### Production Provider — Roaring

**Recommended and implemented.** Roaring (`roaring.io`, Stockholm) was chosen over the alternatives specifically because it is the only evaluated option with a genuine, immediately-usable self-service developer sandbox — confirmed directly (not assumed) by locating their real "Create account" onboarding flow and their documented Get Started guide, which states a sandbox environment and test-call tooling exist. SPAR/Navet direct access requires a formal reseller agreement; TIC and ZignSec are both sales-gated with no public self-service path — all three would block implementation on an external business relationship before any technical work could even be verified, the same category of blocker BankID's production certificate presented earlier in this project.

**Commissioning status: verified live against a real sandbox account (2026-07-27).** The original implementation guessed a single-API-key Bearer auth model from public docs alone; that guess was wrong. The real model, confirmed against `developer.roaring.io`'s Authorization Guide and a live token exchange, is **OAuth2 client-credentials**: a Client ID + Client Secret pair exchanged at `POST https://api.roaring.io/token` (Basic auth, `grant_type=client_credentials`) for a short-lived Bearer token, used against `GET /person/1.0/person?personalNumber={12-digit personnummer}`. `RoaringPersonLookupProvider` was corrected to match, end-to-end tested through the standard `students/lookup-person` route against the live sandbox (found/cache-hit/deceased-derivation all confirmed with real response data), and redeployed. `mapRoaringResponseToCanonical()` now parses the real `{posts: [{details: [...], address: {nationalRegistrationAddress: [...]}, secrecyMarked, ...}]}` shape, not a guessed flat object.

**One disclosed, narrower gap remains:** Roaring reports a single-letter `deRegistrationReason` code when a person is no longer an active resident. Only code `'A'` (deceased) is corroborated by both the live test data and independent public documentation of the underlying Skatteverket/SPAR code scheme; every other code is conservatively reported as `emigrated: true` (a deregistration occurred, reason unconfirmed) rather than asserting a specific meaning that could be wrong. Also disclosed: `municipality`/`county` are returned as Skatteverket numeric codes (e.g. `"25"`, `"01"`), not resolved names — Roaring's response only gives a name for `city`, not for commune/county.

#### Architecture (v3.0 — service-layer separation)

```
Frontend (usePersonLookup.ts) — additive changes only, backward compatible
   ↓  supabase.functions.invoke('students', ...)
Edge Function (supabase/functions/students/index.ts)
   routes: POST /lookup-person, GET /lookup-person/status
   ↓  performPersonLookup() / getPersonLookupStatus()   ← THE Person Lookup Service
_shared/person-lookup-service.ts                         (NEW — orchestration layer)
   ↓ resolves tenant config (person_lookup_provider_configs, decrypted credentials)
   ↓ cache-first (_shared/person-lookup-cache.ts → person_lookup_cache table)
   ↓ retry+timeout wrapper around the one real network call
   ↓ getPersonLookupProvider({ provider, clientId, clientSecret, baseUrl, timeoutMs })  ← Provider Factory
_shared/person-lookup.ts                                 (provider interface + implementations)
   MockPersonLookupProvider, RoaringPersonLookupProvider, NotImplementedPersonLookupProvider
   ↓ lookupByPersonnummer() → CanonicalPersonRecord → toWireFormat()
   ↓ recordIdentityEvent() → identity_security_events (audit, provider='person_lookup')
   ↓ health row → person_lookup_provider_health
Student Registration form (StudentForm.tsx)
   pre-fills name/address/etc.; now also warns on emigrated/protected-identity results
```

**The Student Domain (`students/index.ts`) no longer imports the provider factory or any provider class at all** — only `performPersonLookup()`/`getPersonLookupStatus()` from the service layer. This is what makes "business logic must never know which provider is being used" mechanically enforced by the module boundary, not just a convention someone has to remember.

#### Normalized Data Model

`CanonicalPersonRecord` now covers every field this chapter's Phase 3 requirement named: personal identity number, first/middle/last name, **full legal name** (computed if a provider doesn't supply one distinctly), address (street/postal code/city/municipality/county), **identity valid**, alive/deceased, protected identity, **emigrated**, plus metadata (provider, lookup timestamp, cache timestamp, confidence, response status). The wire format (`PersonLookupData`) mirrors all of it in `snake_case`, additively — no field that existed before this pass was renamed or removed.

#### Caching

`person_lookup_cache` (migration `20260727000001`) caches both `found` and `not_found` results (never `unavailable` — a transient failure is never remembered as a real answer) for a per-tenant configurable duration (`cache_ttl_seconds`, default 30 days; `0` disables caching entirely). Keyed by a keyed-HMAC hash of the personnummer (`hashPersonalNumber()`, the same primitive as `students.personnummer_hash` — the raw value is never stored). Cached person data is encrypted at rest (`encryptCredential()`/AES-256-GCM — the same primitive ADR-022 uses for credentials, applied here to real personal data, which is no less sensitive). Manual refresh: pass `force_refresh: true` to `POST /lookup-person`, which invalidates the cache entry before calling the provider fresh.

#### Tenant Configuration

`person_lookup_provider_configs` (one row per org) holds: active provider, encrypted credentials, optional custom `base_url`, `timeout_ms` (500–30000), `max_retries` (0–5) with `retry_backoff_ms`, `auto_lookup_enabled`/`auto_address_update_enabled` toggles, and `cache_ttl_seconds`. Managed via the new `person-lookup-config` Edge Function (`GET`/`POST`, `administration:organization:update` permission — the same tenant-configuration permission as `nets-credentials`/`stripe-credentials`). **No credentials are ever hardcoded** — an org with no config row simply gets Mock with framework defaults, the same graceful-degradation idiom as every other integration on this platform.

#### Security

- **Permissions:** unchanged — `students:student:create` for a lookup, `students:student:read` for the status check, `administration:organization:update` for configuration changes.
- **Audit logging:** every lookup (cache hit or a real provider call) writes to `identity_security_events` via `recordIdentityEvent()` — **not** a second parallel audit table. This required widening that table's `provider` CHECK constraint to admit `'person_lookup'` (migration `20260727000001`) — the exact same enum-drift bug class found and fixed the same day in `payment_method` and `payment_requests.provider`.
- **Rate limiting:** a dedicated `person_lookup` tier (20 requests/min per user) — tighter than the general `user_write` tier (40/min), since a real provider call has a genuine per-call cost. Uses the platform's existing in-memory, per-isolate limiter (see `_shared/rate-limit.ts`'s own header comment on its known cross-isolate limitation — supplement with Supabase Dashboard-level function rate limits for a hard global cap; this is a pre-existing platform characteristic, not specific to this integration).
- **GDPR:** raw personnummer never stored in the cache (HMAC hash only); cached person data encrypted at rest; `not_found`/`unavailable` results carry no personal data to protect in the first place.

#### Testing (all scenarios verified this pass against the live deployed platform)

- ✅ Found (male/female), deceased, protected identity (address withheld), "found but incomplete" (`confidence: 'partial'`), emigrated (new fixture, address withheld) — all via Mock
- ✅ Not found (valid format, no fixture match)
- ✅ Invalid personnummer format (rejected before reaching any provider)
- ✅ Cache hit on a repeated lookup (`from_cache: true`, matching `cached_at`)
- ✅ Not-found caching (repeated not-found lookup also returns `from_cache: true`)
- ✅ Manual refresh (`force_refresh: true` bypasses a warm cache entry)
- ✅ Registered-but-unimplemented provider path (`active_provider: 'spar'` → clean `unavailable`/`misconfigured`, never a crash)
- ✅ Tenant configuration change (provider/timeout/retries) persists and takes effect on the next lookup
- ✅ Audit trail confirmed written (`identity_security_events`, `provider: 'person_lookup'`, both `person_lookup.performed` and `person_lookup.cache_hit` event types)
- ✅ Provider health rows confirmed written (`person_lookup_provider_health`)
- ⚠️ Rate limiting: mechanism correctly wired (identical to every other rate-limited route on this platform) but did not trigger under a 22-request burst test in the hosted environment — consistent with the limiter's own documented per-isolate limitation, not a defect in this integration specifically
- ✅ Roaring adapter: **verified live** against a real sandbox account through the standard `students/lookup-person` route — found (real dummy-data record, all fields correctly mapped including `deceased: true` derived from Roaring's own deregistration code), cache hit on repeat, `force_refresh` bypass, not-found (404 from Roaring's own endpoint). A real integration bug was caught and fixed during this verification: Roaring's endpoint requires the full 12-digit personnummer, while the framework's shared `normalize10()` helper (correct for Mock's internal fixtures) was stripping it to 10 digits — fixed with a dedicated `normalize12()` used only for the outbound Roaring query

#### Troubleshooting

| Issue | Likely cause | Solution |
|---|---|---|
| Lookup always returns "not found," even for real students | Mock is still the active provider for this tenant | Configure Roaring (or another real provider) via `person-lookup-config`, or accept manual entry during pilot |
| Lookup returns `status: 'unavailable'`, `error_type: 'misconfigured'` | Tenant's `active_provider` is set to a registered-but-unimplemented name (SPAR/Navet/Creditsafe/Ratsit/Custom), or Roaring is selected with no `client_id`/`client_secret` configured | Set `active_provider` back to `'mock'`, or supply real credentials |
| Lookup returns `error_type: 'authentication_failed'` | Roaring Client ID/Secret is wrong, revoked, or the token exchange itself failed | Rotate the credential pair via `person-lookup-config` (`client_id` + `client_secret` together) |
| Lookup returns `error_type: 'timeout'` repeatedly | Tenant's `timeout_ms` is too low for real network latency, or Roaring is degraded | Raise `timeout_ms`, check `person_lookup_provider_health` for a pattern |
| A field that should be present is missing from a Roaring "found" result | The best-effort field mapping in `mapRoaringResponseToCanonical()` doesn't match Roaring's actual response shape yet | Compare against a real sandbox response and adjust the mapping — see Commissioning Status |

#### Pricing

Mock: free. Roaring: pay-as-you-go from ~0.20 SEK/credit, free sandbox with no cost until production is explicitly activated — confirm current pricing directly with Roaring before budgeting for a live tenant.

#### Fallback Behaviour

Unchanged: unset/empty/`'mock'` → Mock, zero configuration required. Any registered-but-unimplemented value → a structured `unavailable`/`misconfigured` result, never a thrown exception. Student registration itself never breaks because of this framework — at worst, autofill doesn't happen (or the "found" result includes an emigrated/protected-identity warning the receptionist should read before confirming) and staff complete registration manually.

#### Future Provider Integration Guide (unchanged from v2.0 — still accurate)

Adding another real provider (SPAR, ZignSec, or otherwise) still requires only:

1. Write one new class in `_shared/person-lookup.ts` implementing `PersonLookupProvider`.
2. Return a `CanonicalPersonRecord` from `lookupByPersonnummer()` — the one place provider-specific field names are allowed to exist.
3. Report accurate capabilities from `getProviderCapabilities()`.
4. Add one case to `getPersonLookupProvider()`'s switch statement, and one value to `KNOWN_PROVIDER_NAMES`/`PersonLookupProviderName`.
5. Do not touch `person-lookup-service.ts`, `students/index.ts`'s handlers, `toWireFormat()`, or any frontend file.
6. New credential fields, if the provider's shape differs from a single API key, extend `PersonLookupProviderResolutionConfig` and `person-lookup-config`'s POST body additively.
7. Rewrite this chapter's Purpose/Provider Comparison/Production Provider/Testing/Troubleshooting sections with that provider's real details.

---

### 4.11 Vehicle Registry Lookup (Transportstyrelsen vägtrafikregistret via a licensed reseller)

#### Purpose

Automatically populate a vehicle's registration status, besiktning (inspection) due date/result, and technical data from Transportstyrelsen's Road Traffic Register (vägtrafikregistret) when a school adds or edits a vehicle — instead of hand-typing it from the paper registration certificate. Same problem shape as Person Lookup (§4.10): manual data entry replaced by a licensed, cacheable, tenant-configurable external lookup.

#### Architecture

Identical service-layer pattern to Person Lookup, reapplied to a different domain:

```
apps/web resources module (VehicleFormSheet "Hämta uppgifter" button)
   ↓  supabase.functions.invoke('vehicle-registry/lookup', ...)
vehicle-registry Edge Function (lookup + status routes)
   ↓  performVehicleLookup() / getVehicleRegistryStatus()
_shared/vehicle-registry-service.ts                       (NEW — orchestration layer)
   ↓ resolves tenant config (vehicle_registry_provider_configs)
   ↓ cache-first (vehicle_registry_cache, 90-day default TTL)
   ↓ retry+timeout, then getVehicleRegistryProvider()      ← Provider Factory
_shared/vehicle-registry.ts
   MockVehicleRegistryProvider, BiluppgifterVehicleRegistryProvider, NotImplemented
   ↓ lookupByRegistrationNumber() → CanonicalVehicleRecord → wire format
   ↓ insert_activity_log() audit (entity_type='vehicle') + health row
Vehicle create form — pre-fills make/model/year/color/registration date;
inspection due date/result surfaced via toast (no create-form field for it —
see the BesiktningTab note below)
```

There is no pre-existing `vehicles` Edge Function to extend — Vehicle CRUD runs directly against PostgREST+RLS (`modules/resources/hooks/useVehicles.ts`), unlike the Student domain. `vehicle-registry` and `vehicle-registry-config` are new, narrowly-scoped functions, used only for what genuinely needs a server-side secret; the lookup result is never written to `vehicles` by the function itself — the frontend pre-fills the existing create form and the existing `useCreateVehicle`/`useUpdateVehicle` hooks perform the actual write, the same non-auto-committing pattern Person Lookup already established for `StudentForm`.

**Commissioning update (2026-07-27, completion pass):** the lookup button is now wired in *two* places, not one — the vehicle create form (`VehicleFormSheet`, prefilling make/model/year/color/registration date) **and** the besiktning-logging dialog (`InspectionFormDialog` in `ResourcesPage.tsx`, prefilling inspection due date/result/station name directly into the fields that actually use them — the more natural fit for inspection-specific data, missed in the original pass). The permission check was also corrected: it now requires `vehicles:vehicle:update` when looking up an *existing* vehicle (`vehicle_id` supplied) and only `vehicles:vehicle:create` for a brand-new registration — the original implementation required `create` unconditionally, which would have wrongly blocked a user who can edit vehicles but not create new ones.

**Settings UI (added in the completion pass):** a real "Konfigurera" dialog now exists on `/settings/external-services` (Fordon section) — provider selection (Mock/Biluppgifter) and API key entry, calling `vehicle-registry-config` exactly as documented below. Before this, the config Edge Function existed but had no UI reachable by a non-technical user — a real gap, since it made "credential management" theoretical rather than usable.

#### Provider Comparison

| Provider | Coverage | Pricing | Sandbox | Self-Service Signup | Swedish Market Adoption | Verdict |
|---|---|---|---|---|---|---|
| **Mock** | 4 fixed test fixtures (registered+passed, registered+overdue, deregistered, found-with-debt) | Free | N/A — it IS the sandbox | N/A | N/A | Pilot and all dev/testing |
| **Biluppgifter.se** | Full vägtrafikregistret via their own Transportstyrelsen direct-access permit: registration status, besiktning dates/results, technical data, ownership, valuation | Contact sales — no public pricing page found | ✅ **Confirmed** — a test/sandbox API key is issued before production use | ❌ Requires contacting their sales team for an API key (not instant self-service like Roaring) | Strong — a long-established, widely-recognized Swedish consumer vehicle-check brand (73+ Trustpilot reviews found) | **Recommended** — the only evaluated option confirmed to offer a pre-production test key |
| **Fordonsfakta.se** | Same underlying register, same permit model | **Transparent, published**: 300 SEK/month + per-call tiers (1.95 SEK down to 1.25 SEK at volume) | Not confirmed publicly (a Postmark/Postman collection is provided with each key, per their own marketing, suggesting real dev tooling exists even without a named "sandbox") | ❌ Requires contacting them for the permit application form | Positioned specifically as an API-first product (less of a consumer brand than Biluppgifter) | Strong alternative — better pricing transparency, worth a second quote once budgeting |
| **Car.info** | Full vehicle data, but positioned for dealer/insurance/finance marketplace use cases | Fully custom, contact sales | Not confirmed | ❌ Sales contact required | Established international brand, less driving-school-specific | Not the best fit for this platform's specific need (registration/inspection compliance, not marketplace listings) |
| **TIC** | Vehicle info product exists | Not published | Unclear | ❌ **Confirmed sales-gated** — same posture as their person-data product (§4.10) | N/A | Ruled out — consistent with the sales-gated pattern already found for this vendor |

**Important difference from Person Lookup:** every evaluated vehicle-data reseller — including the recommended one — requires the customer to go through a **Transportstyrelsen direct-access permit application** (Road Traffic Data Act 2019:369), facilitated by the reseller rather than self-service. This is a real regulatory step, not just a commercial signup — budget for it to take longer than opening a Roaring account did.

#### Recommended Production Provider — Biluppgifter.se

Chosen because it is the only evaluated reseller with a **confirmed pre-production test key** — the same practical factor that made Roaring the right Person Lookup choice, and directly addresses the lesson learned there: verify field mappings against a real response before trusting them. Fordonsfakta.se's transparent published pricing is a genuine advantage worth a comparative quote once a school is ready to commit, but it does not change the sandbox-availability recommendation.

**Commissioning status: implemented, not yet verified against a live account** — same disclosed gap as Roaring initially had, but more pronounced here: Biluppgifter's own technical API reference (`apidocs.biluppgifter.se`) blocks automated/bot access (HTTP 403), and even getting an API key requires a sales conversation, so not even the exact endpoint path or auth header name could be confirmed from public sources. Every assumption (base URL, endpoint, header, response field names) is isolated in `mapBiluppgifterResponseToCanonical()` and the surrounding `BiluppgifterVehicleRegistryProvider` class specifically so it is a small, mechanical correction — not a rewrite — once a real sandbox key and one real response are available.

#### Tenant Configuration

`vehicle_registry_provider_configs` (mirrors `person_lookup_provider_configs`): active provider, encrypted API key, timeout/retry, `cache_ttl_seconds` (90-day default — registration/inspection data changes far less often than a person's address). Managed via `vehicle-registry-config` (`GET`/`POST`, `administration:organization:update` permission, same as every other tenant-configuration surface) — and, as of the completion pass, a real settings dialog at `/settings/external-services`, not just an API. `timeout_ms`/`max_retries`/`retry_backoff_ms`/`cache_ttl_seconds` are validated against the same bounds the database enforces (500–30000ms, 0–5, 100–10000ms, ≥0 respectively) *before* reaching the database, returning a clear 422 instead of a generic 500 on an out-of-range value.

#### Caching & Audit

Cached by registration number (not hashed — a Swedish plate is a public identifier, not personal data the way a personnummer is), both `found` and `not_found` cached, `unavailable` never cached. Every lookup (cache hit or real call) is audited via `insert_activity_log()` (`entity_type: 'vehicle'`) — reused rather than `identity_security_events`, since a vehicle registration lookup is not an identity-security concern and doesn't belong in that table's domain.

#### Testing (verified live via the E2E infrastructure, Mock provider)

Found (registered+passed, registered+inspection-overdue, deregistered, found-with-debt-flag), not-found, invalid registration-number format, cache hit, force-refresh, and misconfigured-provider (Biluppgifter selected with no credential) — all confirmed via the standard `vehicle-registry/lookup` route against the isolated E2E test org. Biluppgifter itself has not been exercised against a live account — see Commissioning Status above.

#### Troubleshooting

| Issue | Likely cause | Solution |
|---|---|---|
| Lookup always returns "not found" | Mock is still the active provider for this tenant | Configure Biluppgifter (or Fordonsfakta, once built) via `vehicle-registry-config` |
| `status: 'unavailable'`, `error_type: 'misconfigured'` | `active_provider` set to a registered-but-unimplemented name (`fordonsfakta`/`custom`), or Biluppgifter selected with no `api_key` | Set `active_provider` back to `'mock'`, or supply a real credential |
| A field is missing from a Biluppgifter "found" result | The best-effort mapping in `mapBiluppgifterResponseToCanonical()` doesn't match their actual response shape | Compare against a real sandbox response (requires contacting their sales team for a key) and correct the mapping |

---

### 4.12 Manual Government Workflow Tracker (Transportstyrelsen/Trafikverket processes with no API)

#### Purpose

Research (this platform's own Transportstyrelsen/Trafikverket integration research pass) found that most regulatory processes relevant to a driving school have **no sanctioned API at all** — Transportstyrelsen's risk-education reporting is a personal e-legitimation web portal (or an XML upload, still human-triggered); Trafikverket's driving-test booking has no partner API, only a consumer web portal. Rather than attempt unsupported automation — browser scraping or reverse-engineering a private API, both explicitly excluded from this platform's approach — this gives staff a structured place inside TrafikskolaOS to track that manual work so it's never silently lost: what's due, who's responsible, what confirmation number the government portal returned, and a full history.

#### What This Is Not

Not an integration in the API sense — there is nothing to authenticate against, no provider to configure, no external secret. It's a purpose-built internal tracking domain, architecturally simple (direct PostgREST+RLS CRUD, the same pattern already used for Vehicle CRUD — no Edge Function needed since there's no external secret involved).

#### Supported Workflow Types

| Type | Agency | Official Portal | Automatable? |
|---|---|---|---|
| Risk education (Risk 1/2) reporting | Transportstyrelsen | Rapportera riskutbildning e-service | No — personal e-legitimation portal only |
| Instructor/driving-school-manager reporting | Transportstyrelsen | E-tjänster inom vägtrafik hub | No — e-tjänst only |
| Driving-school permit (tillstånd att driva trafikskola) | Transportstyrelsen | Driva trafikskola | No — application/renewal process |
| Driving-test (förarprov) booking | Trafikverket | Boka och betala körkortsprov | No — no partner API exists; an unofficial scraping tool was found during research and explicitly rejected as an integration path |

Introduktionsutbildning reporting is **deliberately not a workflow type** — that requirement is abolished by Riksdagen effective 2026-08-01 (Prop. 2025/26:127); building tracking for it would be immediately obsolete.

#### Data Model

`regulatory_workflows` (one generic table, not one per type — all four share the same shape): `workflow_type`, `status` (not_started/in_progress/submitted/confirmed/rejected/expired), `title`/`description`, an optional polymorphic `related_entity_type`/`related_entity_id` (e.g. a student for risk-education reporting), `external_reference` (the government portal's confirmation number), `due_date`, `submitted_at`/`confirmed_at`, `responsible_user_id`, `notes`, standard soft-delete + full audit trail (`audit_trigger_fn()`, the platform's standard mechanism — no bespoke logging needed here, unlike Person/Vehicle Lookup's external-call auditing). `regulatory_workflow_documents` is a small companion table for supporting-document uploads (its own Storage bucket, `regulatory-workflow-documents`) — not a reuse of `student_documents`, whose FK is specifically to `student_id`, not a generic entity reference.

Official portal URLs are **not** stored per-row — they're static, Sweden-wide constants (`WORKFLOW_TYPE_PORTAL_URL` in `useRegulatoryWorkflows.ts`), not tenant configuration.

#### Reminders

`event-worker`'s existing maintenance tick gained one new check, `checkDueRegulatoryWorkflows()`: items due within 7 days with no reminder sent yet get a direct `notifications` insert (`recipient_type: 'admin'`, `channel: 'internal'`, `category: 'compliance'`) to the organization's owner, the same idiom already used by `stripe-webhook`'s settlement-failure alert — not the outbox/communication-worker pipeline, whose recipient resolution doesn't cover this case either.

**Escalation (added in the completion pass).** The original design sent a reminder exactly once per item, ever (`reminder_sent_at` set and never re-checked) — reviewed and found insufficient: an item that stays overdue and unresolved for weeks would otherwise never remind again. Now: an item still overdue and unresolved gets re-reminded every 3 days (a higher-priority, differently-worded notification — "är försenat" instead of "förfarller snart") until it's confirmed/rejected/expired or deleted. Clicking either notification deep-links to `/regulatory?open=<id>`, landing on the exact item rather than just the list (also added this pass — the original notification only routed to the bare list).

**A genuine, pre-existing platform bug was found and fixed while commissioning this**: `notification_category` (the enum `notifications.category` uses) had no `'compliance'` value — widened via `ALTER TYPE ... ADD VALUE`, the same enum-drift bug class found three times elsewhere this session. Separately, and more significantly: the `notifications_select` RLS policy checked a permission code (`notifications:read`) that was never seeded or granted to any role — the real, granted code is `notifications:notification:read` (used correctly by the `notifications` Edge Function's own permission check, but that check passing didn't matter, because the underlying RLS policy silently filtered out every row regardless). This meant **the in-app Notification Bell / notification list had been returning zero results for every organization since Phase 3D**, discovered only because this reminder feature's own commissioning test surfaced it. Fixed in the same pass — see `docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` Version History for the full account.

#### Permissions

`regulatory:workflow:create/read/update/delete` — a new domain (not reused from `finance:compliance:*`, which is Finance's own regulatory-reporting permission for an unrelated purpose). Granted: org_owner/org_admin (all), org_manager (all but delete), instructor/instructor_senior/receptionist (read-only awareness) — mirrors the exact grant shape already established for `vehicles:vehicle:*`.

#### Audit History & Filtering (added in the completion pass)

"Complete audit history" was a stated requirement that the original pass under-delivered: `audit_trigger_fn()` was already firing on every INSERT/UPDATE/DELETE against `regulatory_workflows` (the platform's standard mechanism, no new logging needed), but nothing in the UI ever showed it. The workflow detail dialog now includes a compact change history (operation, changed fields, actor, timestamp) sourced directly from `audit_logs`, gated behind `administration:audit:read` (the same permission that table's own RLS already requires) so a role without it simply doesn't see the section rather than hitting an error. The list view also gained status and workflow-type filter dropdowns, alongside the existing text search.

#### Testing

Verified live end-to-end, including a full regression pass after the fixes below: create/list/update-status/set-confirmation-number/document-upload/audit-history all work via direct PostgREST+RLS as the E2E org's `org_owner`; the due-date reminder — including the escalation logic — was verified against the **real scheduled pg_cron tick** (not a manual invocation) both before and after the event-worker redeploy; document upload was verified against the *actual* Storage API (not just the metadata table) after the RLS fix below, since the first attempt caught it broken.

**A second, more significant defect was found and fixed while commissioning document upload**: the `regulatory-workflow-documents` storage bucket's RLS policies included an `auth.role() = 'authenticated'` check — permanently false on this platform, since the auth-hook deliberately overwrites the JWT's `role` claim with the tenant's business role (`org_owner`, etc.) rather than preserving GoTrue's default. This is the *identical* bug already found and fixed once before, for `student-documents`, in migration `20260722000001` — copied back in by mistake when this bucket's policies were written from the pre-fix version of that pattern. Investigating it further surfaced that **the same mistake had independently recurred a second time, two days after the original fix**, in the `org-branding` bucket (`20260724000007`) — a live, currently-broken feature (`ProdukterSettingsPage.tsx`'s logo upload, reachable and used by every tenant) that had nothing to do with this sprint, confirmed broken via a direct test before touching it. Both were fixed together in migration `20260727000008` — the `auth.role()` check removed from all six affected policies, matching the already-established correct pattern. **Because this bug class has now recurred three times, any future storage bucket policy on this platform must never include `auth.role() = 'authenticated'`** — rely on `has_permission()` (and a folder-scoping check where cross-tenant writes matter) alone, per `20260722000001`'s own header comment.

#### Troubleshooting

| Issue | Likely cause | Solution |
|---|---|---|
| No reminder appears for an item due soon | `event-worker`'s scheduled tick runs on its own cron cadence (not on-demand) — allow up to a few minutes | Check `regulatory_workflows.reminder_sent_at`; if still null after several minutes, check event-worker logs for `maintenance.regulatory_reminders_failed` |
| A reminder was sent but doesn't appear in the Notification Bell | Confirm migration `20260727000007` (the `notifications_select` RLS fix) has been applied — without it, no organization's notifications are visible at all | Re-run `supabase db push` |
| Document upload fails with "new row violates row-level security policy" | Confirm migration `20260727000008` has been applied — see the disclosed defect above | Re-run `supabase db push`; if it recurs on a *new* bucket, check for the `auth.role() = 'authenticated'` anti-pattern first |
| No audit history shown in the workflow detail dialog | The viewing user lacks `administration:audit:read` (expected — not a bug) | Only org_owner/org_admin-tier roles see this section by design |

---

## Phase 5 — Environment Variable Reference

**This phase is intentionally its own document, not a section here** — see `docs/ENVIRONMENT_VARIABLE_REFERENCE.md` for the complete master table of every environment variable used by the project, cross-referenced against the integration chapters above. Kept separate because it's used as a lookup reference (scanned for one specific variable), not read narratively, and changes independently as new variables are added — splitting it out means updates there never require touching this guide.

## Phase 6 — Secrets Management

**Also its own document** — see `docs/SECRETS_MANAGEMENT_GUIDE.md` for the policy layer: which variables are public-safe versus private, where each category is stored, who owns rotation, and the recommended rotation cadence. Split out for the same reason as Phase 5, and because its intended reader (whoever is operationally responsible for secret hygiene) is a narrower audience than this guide's.

## Phase 7 — Integration Status Register

**Also its own document** — see `docs/INTEGRATION_STATUS_REGISTER.md`. The sprint that requested this guide explicitly described the status register as "a living document" — meaning it should be editable and re-checked frequently without anyone needing to re-read or regenerate this entire guide each time. Keeping it as a small, separate file makes that realistic.

---

## Phase 8 & 9 — Pilot and Production Configuration Checklists (Integrations Only)

`docs/PILOT.md` and `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` Phase 8 already contain the complete, general pilot go-live checklist (provisioning, bootstrap, hosting, DNS, etc.). Repeating that here would be exactly the duplication this sprint's brief asked to avoid. What follows is scoped **specifically to integrations** — treat it as an insert into that larger checklist, at the "Secrets" and "Frontend/Hosting" stages.

### Pilot Configuration Checklist (integrations)

- [ ] **Resend** — create account, generate API key, set `RESEND_API_KEY` as a Supabase Secret, (recommended) verify a sending domain, send a real test email
- [ ] **Supabase Auth email** — separately configure custom SMTP for password reset/invitation emails (do not assume Resend setup covers this)
- [ ] **Sentry** — decide in/out for pilot; if in, create project (EU region), set `VITE_SENTRY_DSN`, trigger and confirm a test error
- [ ] **Stripe** — decide per pilot organization whether online payment is wanted; if yes, organization creates its own account and enters its key in settings; developer configures the webhook and confirms a test payment auto-confirms
- [ ] **SMS/Voice** — decide whether any pilot organization wants this; if yes, choose one provider (46elks recommended default for Sweden), create account, set secrets, send a real test message
- [ ] Confirm **BankID, Fortnox, WhatsApp (Meta), Push (OneSignal/Firebase), SendGrid, Mailjet, Vonage/Twilio (if 46elks was chosen instead)** are deliberately left unconfigured — not overlooked

### Production Readiness Checklist (integrations)

- [ ] **Security:** confirm no integration secret exists in any committed file or local `.env` outside `.gitignore`'s protection (re-run the checks from the earlier Production Environment Audit)
- [ ] **Monitoring:** Sentry active if the pilot decision was to enable it; Resend/Stripe/SMS provider dashboards bookmarked for whoever owns day-to-day operations
- [ ] **Backups:** confirmed Supabase project tier includes point-in-time recovery (Phase 3/4.1)
- [ ] **Disaster Recovery:** confirmed against `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` Phase 9 (Rollback Strategy) — integration secrets specifically are covered under its "Secrets rollback" section
- [ ] **Key Rotation:** rotation schedule agreed for `AUTH_HOOK_SECRET`, `WORKER_SECRET`, and any active third-party API keys — see `docs/SECRETS_MANAGEMENT_GUIDE.md`
- [ ] **Operational Monitoring:** clear answer to "who checks the Resend/Stripe/SMS dashboards, and how often" — not left implicit
- [ ] **Vendor SLA:** for any integration a pilot organization is financially depending on (chiefly Stripe, if activated), confirm awareness of that vendor's own status page / SLA — this platform has no control over a vendor outage

---

## Phase 10 — Documentation Structure Recommendation

**Recommended structure (four files, as delivered):**

1. **`docs/INTEGRATION_CONFIGURATION_GUIDE.md`** (this document) — the narrative source of truth: discovery, inventory, environment strategy, and every individual integration's full story
2. **`docs/ENVIRONMENT_VARIABLE_REFERENCE.md`** — the master variable table, split out because it's a lookup reference, not a read-through document, and changes independently
3. **`docs/SECRETS_MANAGEMENT_GUIDE.md`** — the security/ownership/rotation policy layer, split out because its audience (whoever is responsible for secret hygiene) is narrower than this guide's, and because policy documents benefit from being short and unambiguous rather than embedded in a longer narrative
4. **`docs/INTEGRATION_STATUS_REGISTER.md`** — the living status table, split out specifically because the sprint brief itself called for it to be a frequently-updated living document, and a living document should not require touching a large narrative guide every time a status changes

**Why not one single file:** Phase 4 alone, done properly for every implemented integration, is already the bulk of this document's length. Folding Phases 5–7 into the same file as well would produce a document long enough that its two stated audiences — a non-technical product owner reading Phase 1–4 narratively, and a developer or administrator scanning Phase 5–7 as reference tables — would actively get in each other's way. Splitting along "read once, understand the system" (this guide) versus "look something up, or check current status" (the other three) matches how each audience actually uses the material.

**Why not more than four files:** Phase 8/9's checklists were folded into this guide rather than spawned as a fifth/sixth file, specifically because `docs/PILOT.md` and `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` already own the general pilot/production checklist — a separate integrations-only checklist file would either duplicate them or need constant cross-referencing to stay coherent. Keeping it as a short, clearly-scoped section inside this guide, explicitly framed as "insert into the existing checklist," avoids both problems.

---

## Overall Status

**✅ Documentation Complete**

---

## Prioritized Implementation Roadmap (Pilot Configuration Order)

1. **Resend** — the one genuinely required integration; configure first
2. **Supabase Auth custom SMTP** — do immediately alongside Resend, since it's the easy-to-miss companion piece for the same underlying need (email actually reaching people)
3. **Sentry** *(if the decision is to include it for pilot)* — cheap to set up, immediate ongoing value, no dependency on anything else
4. **Stripe** *(only if a specific pilot organization wants online payment)* — configure the webhook at the same time as enabling checkout, not as an afterthought, to avoid the manual-reconciliation gap becoming normal practice
5. **SMS/Voice provider** *(only if a specific pilot organization requests it)* — pick one (46elks as the Sweden-first default), configure fully rather than partially
6. **Everything else in this guide** (BankID, Fortnox, Meta WhatsApp, OneSignal/Firebase, SendGrid, Mailjet) — **deliberately last**, because none of them are blocked by anything except a business decision to pursue them, and pursuing them before the pilot's core email/monitoring/payment story is solid would be exactly the kind of premature scope expansion the Version 1.0 Scope Freeze exists to prevent.
