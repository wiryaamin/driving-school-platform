# Environment Variable Reference — TrafikskolaOS

**Companion to `docs/INTEGRATION_CONFIGURATION_GUIDE.md`.** Read that document for the *why* behind each integration; this document is the *lookup table* — every environment variable used anywhere in the project, in one place, meant to be searched (Ctrl+F) rather than read top to bottom.

**No real secret values appear anywhere in this document.** The "Example" column shows format only, using obviously fake placeholder values.

**"Where Stored" values used below:**
- *Frontend build env* — baked into the static bundle at build time (`apps/web/.env.local` in development; the Hostinger build environment in pilot/production)
- *Supabase Secret* — set via `supabase secrets set`, read by Edge Functions at runtime, never in a committed file
- *Supabase (auto-injected)* — provided automatically by the Supabase Edge Function runtime; never set manually
- *Org settings (database)* — stored per-organization inside the application's own database, not an environment variable in the traditional sense, but documented here because it fills the same role for that specific integration
- *Not currently stored anywhere* — variable is referenced by code but has no value in any local file or (as far as this document can verify) hosted secret store

---

## Frontend (`VITE_*`)

| Variable | Integration | Purpose | Required | Development | Pilot | Production | Where Stored | Sensitive | Default Value | Example |
|---|---|---|---|---|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase | Backend project URL the frontend connects to | Yes | ✅ set | ✅ set (pilot project) | ✅ set | Frontend build env | No (public by design) | none | `https://abcdefghijklmnop.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase | Public API key, access controlled entirely by database-level Row Level Security | Yes | ✅ set | ✅ set | ✅ set | Frontend build env | No (public by design, RLS-protected) | none | `eyJhbGciOiJIUzI1NiIs...` (JWT format) |
| `VITE_APP_ENV` | Platform | Labels the running environment for monitoring/telemetry | Yes | `development` | `production` | `production` | Frontend build env | No | `development` | `production` |
| `VITE_APP_VERSION` | Platform | Release version tag attached to Sentry events and API requests | Recommended | `0.0.1` | release tag | release tag | Frontend build env | No | `0.0.1` | `1.0.0` |
| `VITE_SENTRY_DSN` | Sentry | Activates frontend error monitoring | Recommended, not required | empty | empty or set (pilot decision) | recommended set | Frontend build env | No (a DSN is not a secret in the traditional sense, but treat as sensitive-adjacent — don't publish it needlessly) | empty | `https://examplePublicKey@o0.ingest.sentry.io/0` |
| `VITE_APP_URL` | — | **Not read anywhere in application code** | No | set, unused | — | — | Frontend build env | No | — | — |
| `VITE_STUDENT_APP_URL` | — | **Not read anywhere in application code** | No | set, unused | — | — | Frontend build env | No | — | — |
| `VITE_FEATURE_BANKID` | BankID | Shows/hides the BankID login option | No | `false` | `false` | `false` until BankID is live | Frontend build env | No | `false` | `false` |
| `VITE_FEATURE_AI_ASSISTANT` | — | **Not read anywhere in application code** | No | `false`, unused | — | — | Frontend build env | No | — | — |
| `VITE_FEATURE_CORPORATE_PORTAL` | — | **Not read anywhere in application code** | No | `false`, unused | — | — | Frontend build env | No | — | — |
| `VITE_FEATURE_MOBILE_APP` | — | **Not read anywhere in application code**, and not even declared in `vite-env.d.ts` | No | `false`, unused | — | — | Frontend build env | No | — | — |
| `VITE_ENABLE_QUERY_DEVTOOLS` | — | **Not read anywhere in application code** | No | `true`, unused | — | — | Frontend build env | No | — | — |
| `VITE_ENABLE_DEBUG_LOGGING` | — | **Not read anywhere in application code** | No | `true`, unused | — | — | Frontend build env | No | — | — |

---

## Core Backend (Supabase / Edge Functions — platform-wide)

| Variable | Integration | Purpose | Required | Development | Pilot | Production | Where Stored | Sensitive | Default Value | Example |
|---|---|---|---|---|---|---|---|---|---|---|
| `SUPABASE_URL` | Supabase | Project URL, available inside every Edge Function | Yes | auto-injected | auto-injected | auto-injected | Supabase (auto-injected) | No | none | — |
| `SUPABASE_ANON_KEY` | Supabase | Public key, available inside every Edge Function | Yes | auto-injected | auto-injected | auto-injected | Supabase (auto-injected) | No | none | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | RLS-bypassing admin key for privileged server-side operations | Yes | auto-injected | auto-injected | auto-injected | Supabase (auto-injected) **only** — never a file | **Yes — highest sensitivity in the project** | none | — |
| `AUTH_HOOK_SECRET` | Supabase Auth | HMAC signing key between GoTrue and the `auth-hook` function | Yes | ✅ set, and — as of the Pilot Environment Configuration Sprint 1 — both local files verified consistent with each other and fingerprint-matched against the live dev-project secret | must be set fresh for the pilot project (do not reuse the dev project's value) | same as pilot | Supabase Secret | Yes | none | `v1,whsec_<base64>` |
| `WORKER_SECRET` | Platform (internal) | Authenticates cron-triggered calls to background worker functions | Yes | ✅ **Live on the dev project already** (confirmed via `supabase secrets list`) — a separate local-only value was added in Sprint 1 for testing against a local Docker stack; the two are intentionally different values | must be set fresh for the pilot project | same | Supabase Secret | Yes | none | random string, e.g. `k3nJ8...` |
| `APP_URL` | Platform (CORS) | Allowed browser origin for the admin app | Yes | `http://localhost:5173` (local file) | ✅ **Live on the active project as of Platform Environment Configuration Sprint 2** — set to `https://advertentia.com`, CORS-verified via a real preflight request | same | Supabase Secret | No (a URL, not a credential) | none | `https://advertentia.com` |
| `STUDENT_APP_URL` | Platform (CORS) | Allowed browser origin for the (not-yet-built) student portal | No — leave unset until that app exists | `http://localhost:5174` | recommend leaving unset | set once the student app exists | Supabase Secret | No | none | `https://app.advertentia.com` |
| `APP_ENV` | Platform | Backend-side environment label | Recommended | `development` | `production` | `production` | Supabase Secret | No | — | `production` |
| `APP_VERSION` | Platform | Backend-side release version label | Recommended | — | release tag | release tag | Supabase Secret | No | — | `1.0.0` |
| `PLATFORM_BOOTSTRAP_SECRET` | Platform | Gates the one-time first-organization bootstrap flow | Yes | N/A (Supabase Secret, not a local file value) | ✅ **Live on the active project as of Sprint 2** — generated fresh, set via `supabase secrets set`, confirmed present via `supabase secrets list`. Not yet exercised — no real organization/admin has been bootstrapped with it | same | Supabase Secret | Yes | none | random string |
| `RESERVATION_EXPIRY_MINUTES` | Scheduling | Tuning value for how long a tentative booking hold lasts | No (has a code default, not individually confirmed) | not set | not set | confirm before relying on non-default behavior | Supabase Secret | No | code default (unconfirmed exact value) | `30` |
| `EVENT_WORKER_BATCH_SIZE` / `EVENT_WORKER_LOCK_TTL` / `EVENT_WORKER_REMINDER_BATCH` / `EVENT_WORKER_ACCT_BATCH` | Background worker | Tuning values for the outbox-draining worker | No | not set | not set | confirm before relying on non-default behavior | Supabase Secret | No | code defaults (unconfirmed exact values) | integers |
| `DUNNING_BATCH` / `CREDIT_EXPIRY_BATCH` | Finance workers | Batch-size tuning for dunning/credit-expiry processing | No | not set | not set | confirm before relying on non-default behavior | Supabase Secret | No | code defaults (unconfirmed exact values) | integers |

---

## Email

| Variable | Integration | Purpose | Required | Development | Pilot | Production | Where Stored | Sensitive | Default Value | Example |
|---|---|---|---|---|---|---|---|---|---|---|
| `RESEND_API_KEY` | Resend (app notifications) | Sends the app's own notification emails | **Yes — the one required third-party integration secret for pilot** | not set | must be set | same | Supabase Secret | Yes | none | `re_examplekey123` |
| `SENDGRID_API_KEY` | SendGrid | Alternative to Resend | No | not set | not set | not needed unless switching away from Resend | Supabase Secret | Yes | none | `SG.exampleKey` |
| `MAILJET_API_KEY` / `MAILJET_SECRET_KEY` | Mailjet | Alternative to Resend | No | not set | not set | not needed unless switching away from Resend | Supabase Secret | Yes | none | — |
| *(not an environment variable)* Supabase Auth SMTP host/port/username/password/sender | Resend (Auth transactional email) | Password resets, invitations, email confirmation | **Yes — confirmed a hard blocker as of Sprint 2B/3** (`429 over_email_send_rate_limit` on Supabase's default sender, reproduced live) | Dashboard-default (Inbucket locally, Supabase's own limited sender on hosted) | Must configure via Dashboard → Authentication → Email → SMTP Settings — full runbook in `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.2 | same | **Supabase Dashboard only — not a Supabase Secret, not any environment variable, not settable via CLI** | Yes (the SMTP password is a Resend API key) | none | — |

**This is not the same system as `RESEND_API_KEY` above, even though both can use the same Resend account.** `RESEND_API_KEY` is read by `_shared/comm-providers.ts` for the app's *own* notification messages. Supabase Auth's SMTP configuration is a completely separate, Dashboard-only setting that GoTrue (Supabase's auth server) uses for its *own* emails. Setting one does not configure the other — confirmed as the exact confusion this session's Sprint 3 runbook was written to prevent.

---

## Payments

| Variable | Integration | Purpose | Required | Development | Pilot | Production | Where Stored | Sensitive | Default Value | Example |
|---|---|---|---|---|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe | Platform-wide fallback checkout key (each org's own key, below, takes precedence when set) | Optional | not set | only if used as a platform-wide fallback | same | Supabase Secret | Yes | none | `sk_live_example` / `sk_test_example` |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Verifies that a webhook call genuinely came from Stripe, confirming payment success | Required only if Stripe payments are enabled for any organization | not set | not set (currently absent — confirmed in `operational-runbook.md` §12) | required before relying on automatic payment confirmation | Supabase Secret | Yes | none | `whsec_example` |
| *(per-organization Stripe secret key)* | Stripe | The specific driving school's own Stripe account key | Required only for organizations using Stripe | — | organization-specific | organization-specific | **Org settings (database)**, not an environment variable | Yes | none | `sk_live_example` |

---

## Identity

| Variable | Integration | Purpose | Required | Development | Pilot | Production | Where Stored | Sensitive | Default Value | Example |
|---|---|---|---|---|---|---|---|---|---|---|
| `BANKID_CLIENT_CERT` | BankID | Relying-party client certificate | No — blocked on external process, not pilot-required | not set | not set | required only once BankID is activated | Supabase Secret | Yes | none | PEM certificate content |
| `BANKID_CLIENT_KEY` | BankID | Private key paired with the client certificate | No | not set | not set | required only once BankID is activated | Supabase Secret | **Yes — highest sensitivity among third-party secrets** | none | PEM key content |
| `BANKID_CA_CERT` | BankID | Certificate authority chain for verifying BankID's server | No | not set | not set | required only once BankID is activated | Supabase Secret | Yes | none | PEM certificate content |
| `BANKID_ENV` | BankID | Selects BankID's test vs. production environment | No | not set | not set | `production` once activated | Supabase Secret | No | none | `test` / `production` |
| `IDENTITY_ENCRYPTION_KEY` | Platform (personnummer handling) | Encrypts stored personnummer values | Yes | ✅ Live on the active project (found during Sprint 1's read-only audit, confirmed in use by `students/index.ts` and `_shared/bankid-crypto.ts` during Sprint 2A's Security Review — previously live but undocumented in this guide, not obsolete) | ✅ Already live | same | Supabase Secret | **Yes — protects encrypted PII at rest** | none | random string |
| `IDENTITY_HASH_KEY` | Platform (personnummer handling) | Deterministic hash key for personnummer duplicate-detection lookups | Yes | ✅ Live, same consumers as above | ✅ Already live | same | Supabase Secret | Yes | none | random string |

---

## Person Lookup (Personnummer)

Full explanation: `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.10. As of the v2.0 provider-architecture refactor, `PERSON_LOOKUP_PROVIDER` now correctly distinguishes "unset/Mock" from "a registered-but-unimplemented provider name" (see that chapter's "Behavior Change" note) — every other variable below remains unread by any code.

| Variable | Integration | Purpose | Required | Development | Pilot | Production | Where Stored | Sensitive | Default Value | Example |
|---|---|---|---|---|---|---|---|---|---|---|
| `PERSON_LOOKUP_PROVIDER` | Person Lookup | Selects the personnummer lookup backend | No — Mock is the safe default | unset | unset | set only once a real provider (e.g. SPAR) is built and contracted | Supabase Secret | No | `mock` (confirmed safe fallback in code) | `mock` |
| `PERSON_LOOKUP_API_KEY` | Person Lookup | **Not implemented — Future Release.** No code reads this variable | No | — | — | — | — | — | — | not real yet |
| `PERSON_LOOKUP_CLIENT_ID` | Person Lookup | **Not implemented — Future Release.** Anticipated for an OAuth-style provider (mirrors the Fortnox pattern) | No | — | — | — | — | — | — | not real yet |
| `PERSON_LOOKUP_CLIENT_SECRET` | Person Lookup | **Not implemented — Future Release.** Same as above | No | — | — | — | — | — | — | not real yet |
| `PERSON_LOOKUP_BASE_URL` | Person Lookup | **Not implemented — Future Release.** No code reads this variable | No | — | — | — | — | — | — | not real yet |
| `PERSON_LOOKUP_TIMEOUT` | Person Lookup | **Not implemented — Future Release.** No code reads this variable | No | — | — | — | — | — | — | not real yet |
| `PERSON_LOOKUP_CACHE_TTL` | Person Lookup | **Not implemented — Future Release.** Would only matter if a caching layer is built (deliberately deferred — see the guide's "What Was Deliberately Deferred") | No | — | — | — | — | — | — | not real yet |
| `PERSON_LOOKUP_RATE_LIMIT` | Person Lookup | **Not implemented — Future Release.** Would only matter alongside the deferred standardized error taxonomy | No | — | — | — | — | — | — | not real yet |

Every row below `PERSON_LOOKUP_PROVIDER` is an anticipated name for whatever a future real provider will need — documented here so none of them are mistaken for a configuration gap. Setting any of them today has no effect.

---

## Accounting

| Variable | Integration | Purpose | Required | Development | Pilot | Production | Where Stored | Sensitive | Default Value | Example |
|---|---|---|---|---|---|---|---|---|---|---|
| `FORTNOX_CLIENT_ID` | Fortnox | Identifies the TrafikskolaOS application to Fortnox's OAuth system | No — not required for pilot | not set | not set | required only if an organization connects Fortnox | Supabase Secret | No (client ID, not a secret by itself) | none | `example-client-id` |
| `FORTNOX_CLIENT_SECRET` | Fortnox | Paired secret for the OAuth application | No | not set | not set | required only if Fortnox is connected | Supabase Secret | Yes | none | `example-client-secret` |

---

## SMS, Voice & WhatsApp

| Variable | Integration | Purpose | Required | Development | Pilot | Production | Where Stored | Sensitive | Default Value | Example |
|---|---|---|---|---|---|---|---|---|---|---|
| `ELKS_API_USERNAME` / `ELKS_API_PASSWORD` | 46elks | SMS/voice (Sweden-domestic) | No | not set | only if a pilot org requests SMS | same | Supabase Secret | Yes | none | — |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` / `TWILIO_WHATSAPP_NUMBER` | Twilio | SMS/voice/WhatsApp | No | not set | only if chosen over 46elks/Vonage | same | Supabase Secret | Yes (SID less so than the auth token) | none | — |
| `VONAGE_API_KEY` / `VONAGE_API_SECRET` | Vonage | SMS/voice | No | not set | only if chosen | same | Supabase Secret | Yes | none | — |
| `META_WHATSAPP_TOKEN` / `META_PHONE_NUMBER_ID` | Meta WhatsApp | WhatsApp Business API | No — Future Release | not set | not set | Future Release | Supabase Secret | Yes | none | — |

---

## Push Notifications

| Variable | Integration | Purpose | Required | Development | Pilot | Production | Where Stored | Sensitive | Default Value | Example |
|---|---|---|---|---|---|---|---|---|---|---|
| `ONESIGNAL_APP_ID` / `ONESIGNAL_API_KEY` | OneSignal | Push notifications | No — no client exists to receive them yet | not set | not set | revisit once a mobile/PWA client exists | Supabase Secret | Yes (API key; App ID less so) | none | — |
| `FIREBASE_SERVER_KEY` | Firebase | Push notifications, alternative to OneSignal | No | not set | not set | revisit once a mobile/PWA client exists | Supabase Secret | Yes | none | — |

---

## Rollup: Variables Confirmed Unused Anywhere in Application Code

These are set in local template files but never read by any code found in this repository. Listed here so nobody spends time "fixing" a missing value for a variable nothing actually consumes: `VITE_APP_URL`, `VITE_STUDENT_APP_URL`, `VITE_FEATURE_BANKID` *(exception — this one is genuinely read, listed above; kept out of this rollup)*, `VITE_FEATURE_AI_ASSISTANT`, `VITE_FEATURE_CORPORATE_PORTAL`, `VITE_FEATURE_MOBILE_APP`, `VITE_ENABLE_QUERY_DEVTOOLS`, `VITE_ENABLE_DEBUG_LOGGING`.
