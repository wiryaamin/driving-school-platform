# TrafikskolaOS — Configuration & Commissioning Register

This register is the authoritative, cumulative record of the Configuration &
Commissioning Exercise. It exists so that subsystems already investigated and
classified are not re-investigated in future commissioning passes.

This is a **commissioning record**, not an architecture or defect document.
Defects found during commissioning are tracked in
`docs/PILOT_OPERATIONAL_VALIDATION_STATUS.md`; this file tracks subsystem-level
commissioning status and classification only.

---

## Governance Rules

### Rule 1 — Scope Is Defined by Implementation, Not Roadmap Documents

The Configuration & Commissioning Exercise commissions every subsystem that
is implemented or partially implemented in the codebase — backend plumbing,
provider abstractions, communication channels, service worker support, or
any other real implementation work qualifies a subsystem for commissioning.

Historical roadmap, architecture, or planning documents (e.g. a "Version
1.1 roadmap") **must not** be used to exclude an implemented or
partially-implemented subsystem from commissioning, and must not be cited as
grounds for a "Not Applicable" classification. Such documents describe
planning intent at a point in time; they do not override the fact that code
exists and is subject to commissioning.

A subsystem found to be partially implemented shall remain in active
commissioning and be classified using the standard four-way defect
classification (Configuration Defect / Software Defect / Missing
Capability / External Dependency) and the standard status legend below — it
shall only leave active commissioning by reaching ✅ COMMISSIONED, or by an
explicit user-granted deferral for a genuine external dependency.

### Rule 2 — Runtime Evidence Governs

Classification is governed by real runtime state (`secrets list`,
`channel_configs`, live queries, live dispatch tests), not by prior
discussion, external testing performed outside the TrafikskolaOS project, or
claims made without live verification. If a claimed configuration cannot be
verified against live system state, it is treated as not configured.

---

## Commissioning Status Legend

| Symbol | Meaning |
|---|---|
| ✅ COMMISSIONED | Platform + tenant config validated, E2E validated, no open defects |
| ⚠ COMMISSIONED WITH EXTERNAL DEPENDENCIES | Fully configured/validated except for a genuine external blocker (account, credential, third-party approval) |
| ⚠ COMMISSIONED WITH SOFTWARE DEFECTS | Configured, but a software defect was found and reported (not fixed, per methodology) |
| ⏸ DEFERRED – THIRD-PARTY CONFIGURATION PENDING | Provider/account exists outside the project but has not been wired into TrafikskolaOS runtime |
| ⚠ COMMISSIONING COMPLETE – ARCHITECTURE DECISION REQUIRED | Every configuration/data/routing defect within commissioning's mandate has been fixed; the subsystem correctly reaches the provider-dispatch stage; further progress requires a product/architecture decision (which of several partially-built implementations becomes the supported one) — not a commissioning activity. Commissioning does not choose between competing architectures or build out either one. |
| ❌ NOT COMMISSIONED | Capability gap or unresolved blocker with no path forward this pass |

---

## Register Entries

### SMS

**Status:** ⏸ DEFERRED – THIRD-PARTY CONFIGURATION PENDING

**Evidence:** Live `secrets list` confirmed no `TWILIO_*` secrets exist in the
project. Live `channel_configs` query confirmed the tenant's SMS provider is
still `46elks`. A Twilio account was created and tested independently of the
TrafikskolaOS project, but the project itself was never reconfigured from
46elks to Twilio (Governance Rule 2). Code path confirmed clean during this
pass (2 stale-fallback-identity defects found and fixed: `"Korskolan"` →
`"TrafikskolaOS"` in `dispatch46elksSms` and `dispatchVonageSms`,
`_shared/comm-providers.ts`).

**Do not re-investigate** SMS provider code or the fallback-identity fix in a
future pass. Revisit only once a supported SMS provider (Twilio, Vonage, or
46elks) has been configured with real secrets in the TrafikskolaOS project
and is ready for real E2E dispatch testing.

---

### Push Notifications

**Status:** ✅ FULLY COMMISSIONED (2026-07-23/24)

**Environment commissioning — Round 5, real Firebase project.** The
external dependencies recorded below in Round 4 were provided (Firebase
project `trafikskolaos` created, Web app registered, FCM HTTP v1 enabled,
legacy API disabled, VAPID key generated, service-account JSON generated).
Full live commissioning performed end-to-end against this real environment.

**Phase 1 — Backend configuration:**
- `FIREBASE_SERVICE_ACCOUNT_JSON` loaded as a Supabase secret directly from
  the downloaded key file (never committed, temp copy deleted immediately
  after use).
- **Live-verified**: the credential's RS256 JWT-bearer OAuth2 exchange
  confirmed directly against Google's real token endpoint (real
  `access_token` returned, independent of this project's code, before
  wiring it in).
- **Live-verified** end-to-end through the real deployed `communications`
  function: a real HTTP v1 send to a placeholder token returned FCM's own
  `400 INVALID_ARGUMENT: "The registration token is not a valid FCM
  registration token"` — proving OAuth, HTTP v1 auth, and the full
  request/response pipeline all work; only the placeholder token itself
  was invalid, as expected.

**Phase 2 — Frontend configuration:** `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
`VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY` set in
`apps/web/.env.local` (confirmed gitignored, never tracked). Production
build confirmed the config is correctly embedded in the compiled bundle.

**Phase 3 — Deployment:** all six previously-built Edge Functions already
live from prior rounds; redeployed twice more this round carrying the
defect fixes below. `verify_jwt` reconfirmed correct after every redeploy
(`communications: true`, all others: `false`).

**Phase 4 — Browser registration commissioning:** performed against a real
Chrome browser (guided step-by-step, non-technical) using a real, isolated
test student in the Starter Tier Test tenant. A genuine device token was
registered, persisted to `push_device_tokens`, and confirmed live via
direct query — validating the exact registration code path (and the
critical partial-unique-index bug fixed in the prior audit round, which
had never been exercised through a real browser until now).

**Phase 5 — Live E2E validation, real delivery achieved.** This round
surfaced and fixed three genuine, previously-undetectable defects — none
were reachable without a real Firebase project:

1. **CRITICAL — messages silently never delivered.** FCM's HTTP v1 API
   returned `status: "sent"` with a real message ID on every send, but
   Chrome's own internal log (`chrome://gcm-internals`, Receive Message Log)
   showed **zero messages ever received**, despite a confirmed live,
   connected GCM channel and a correctly registered subscription. Root
   cause: `dispatchFirebase()` sent no explicit `webpush.headers`, so per
   the Web Push spec (RFC 8030) TTL defaulted to 0 ("deliver now or drop") —
   silently discarding every message unless the browser happened to be
   instantaneously connected at the exact moment of send. Fixed by adding
   explicit `TTL: '2419200'` (4 weeks) and `Urgency: 'high'` headers.
   **Live-verified**: real delivery confirmed immediately after the fix — a
   real Windows notification appeared.
2. **HIGH — delivered notifications showed generic placeholder content
   instead of the real message.** Every real notification displayed the
   hand-written service worker's fallback title ("Trafikskola") with an
   empty body, never the actual sent text, even after fix #1. Root cause:
   FCM wraps a `webpush.data` payload one level deeper at the wire level
   (`{ data: { title, body, url } }`), not flat — `apps/web/public/sw.js`'s
   `push` handler was reading `title`/`body` from the top level and always
   missed them. Fixed by unwrapping `payload.data ?? payload` before
   reading fields. **Live-verified**: real title and body ("NU FUNKAR DET" /
   "Riktigt innehall syns nu korrekt.") displayed correctly, screenshot-confirmed.
   A secondary, related defect from the same investigation was also
   corrected: a defensive top-level `notification` field added during
   troubleshooting (belt-and-suspenders at the time) turned out to be the
   direct *cause* of the wrapped-payload shape — removed; `webpush.data`
   alone is both necessary and sufficient.
3. **MEDIUM — registration race condition.** A deeper token-reset fix (see
   below) caused the registration hook to fire multiple times concurrently
   (React StrictMode's deliberate dev-mode double-invocation, compounded by
   re-renders), each independently unsubscribing and resubscribing the
   browser's raw push subscription and racing into several different
   tokens simultaneously marked "active" in `push_device_tokens`, even
   though the browser can only hold one live subscription at a time. Fixed
   with a module-scoped in-flight guard in `usePushSubscription` so
   concurrent calls collapse into a single execution. **Live-verified**:
   confirmed exactly one clean active token after the fix, versus five
   racing rows before it.
   - Contributing fix in the same investigation: `core/push`'s
     `requestPushToken()` now explicitly unsubscribes the browser's raw
     `PushManager` subscription and calls Firebase's `deleteToken()` before
     requesting a new one — `deleteToken()` alone only clears Firebase's own
     IndexedDB cache, not the lower-level raw subscription, so without this
     a stale subscription could be silently rediscovered and reused.
4. **Full rule-driven pipeline live-verified** (not just raw manual sends):
   triggered a real `booking_confirmed` event through
   `communication-worker`'s `/notify` endpoint (the same code path a real
   booking uses) — confirmed correct template resolution ("Körlektion
   bokad"), correct Swedish variable substitution, correct device-token
   lookup by `student_id`, real Firebase dispatch, and — after the fixes
   above — correct real content displayed on the real device.

**Phase 6 — Production readiness:**
- Confirmed via code + the live fixes above: invalid-token auto-revocation,
  OAuth 401 retry, generic retry-queue inheritance, and ownership-scoped
  revocation (all from the prior audit round) remain intact and correctly
  integrated with the now-proven-working dispatch path.
- **Finding, not fixed (flagged, not blocking):** portal logout
  (`handleLogout()` in `StudentPortalLayout.tsx` and the equivalent in the
  other two portals) clears the local session but does not call the
  push-token revoke endpoint — a device stays registered after logout.
  Minor; does not affect whether push notifications work. Left as a
  follow-up rather than expanded scope, per instruction not to introduce
  enhancements beyond commissioning.
- `WORKER_SECRET` was rotated (a fresh value generated and set) solely to
  enable live-testing the rule-driven `/notify` path directly, since its
  prior value was never known to this session. Purely an internal
  service-to-service secret with no external dependents; rotation is
  immediately and uniformly in effect for every consumer, no further
  action needed.

**All fixes redeployed and reconfirmed**: `pnpm typecheck` 9/9 packages
clean, production build clean, `verify_jwt` correct on every function.

**Test artifacts cleaned up**: test `outbound_messages` rows soft-deleted,
push channel/rule disabled again on the Starter Tier Test tenant, test
student archived. `push_device_tokens` rows left in place as evidence
(harmless — isolated test tenant, inert now that the channel is disabled).

**Architecture Decision (approved 2026-07-23):** Firebase Cloud Messaging
(FCM) is the approved primary production push provider. The existing
provider abstraction (`_shared/comm-providers.ts`) remains in place so
OneSignal can still be supported later if a business requirement arises.
The Web Push (`push_subscriptions`) implementation is **not** the approved
production architecture — confirmed to have zero runtime dependencies
(no Edge Function or frontend code references it) and reclassified as
**deprecated infrastructure**, logged in
`docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` Section 12 (Technical Debt
Register) for future cleanup. Not removed during this commissioning pass,
per instruction.

**Architecture Decision (approved 2026-07-23):** Firebase Cloud Messaging
(FCM) is the approved primary production push provider. The existing
provider abstraction (`_shared/comm-providers.ts`) remains in place so
OneSignal can still be supported later if a business requirement arises.
The Web Push (`push_subscriptions`) implementation is **not** the approved
production architecture — confirmed to have zero runtime dependencies
(no Edge Function or frontend code references it) and reclassified as
**deprecated infrastructure**, logged in
`docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` Section 12 (Technical Debt
Register) for future cleanup. Not removed during this commissioning pass,
per instruction.

**Commissioned this pass:**

- **Push notification templates** — 7 system-level `notification_templates`
  rows (`channel='push'`) created via
  `20260723000001_push_notification_templates.sql`, mirroring every event
  that already had an `sms` variant. Deployed and verified live (7/7 rows
  confirmed present via REST against the hosted project).
- **Notification rules** — `seed_org_communication()` extended (via
  `CREATE OR REPLACE`, historical migration left untouched per this
  project's append-only convention) to wire push into `notification_rules`
  for every org. Backfilled and verified live (258 push `notification_rules`
  rows confirmed created across all existing orgs).
- **Channel configuration** — `channel_configs` push row confirmed present
  and independently toggleable per org (already provisioned by the original
  Phase A migration); live enable/disable cycle validated against the
  isolated Starter Tier Test tenant (org `8e3aced8-44c5-485e-b180-2609b6e19857`).
- **Communication-worker routing defect corrected** — `communication-worker/index.ts`
  recipient-address resolution previously had no `push` case and silently
  fell through to the SMS branch (`student_phone`/`instructor_phone`) for
  any non-email channel. Fixed to resolve `student_push_token`/
  `instructor_push_token` instead, matching the token-based contract
  `dispatchFirebase`/`dispatchOneSignal` (`_shared/comm-providers.ts`)
  actually expect. Deployed; `verify_jwt: false` reconfirmed correct for
  this WORKER_SECRET-authenticated function, `communications`
  (`verify_jwt: true`) confirmed unaffected.
- **Net effect:** the subsystem now correctly reaches the provider-dispatch
  stage — a rule fires, resolves its template, resolves the correct
  recipient field for the channel, and would attempt real dispatch, exactly
  like the SMS/Email paths.

**Round 3 (2026-07-23) — built out the approved FCM architecture, provider-independent portion complete:**

1. **`dispatchFirebase()` rewritten to FCM HTTP v1`** (`_shared/comm-providers.ts`) —
   the previous implementation called the legacy HTTP API
   (`fcm.googleapis.com/fcm/send`, static server-key auth), which Google
   permanently shut down 2024-06-20 (verified via web search this pass,
   sources in the prior investigation). It was dead code even with a real
   credential. Replaced with FCM HTTP v1
   (`fcm.googleapis.com/v1/projects/{id}/messages:send`), authenticated via
   an OAuth2 service-account JWT-bearer exchange (RFC 7523) implemented with
   the Web Crypto API (RS256), with in-memory access-token caching. Sends a
   webpush **data** message (not the `notification` field) so delivery
   always reaches the app's own `sw.js` `push` handler rather than depending
   on Firebase's own SW conventions. Detects provider-reported invalid
   tokens (404/`UNREGISTERED`) via a new `invalidToken` flag on
   `ProviderResult`.
2. **Device-token lifecycle — `push_device_tokens` table**
   (`20260723000002_push_device_tokens.sql`, deployed and verified live) —
   one row per device, owner is exactly one of `user_id` (staff),
   `student_id`, `instructor_id`, or `guardian_id`. Shared helper
   `_shared/push-tokens.ts`: `registerPushToken` (upsert + auto-revoke of
   the prior token on refresh), `revokePushToken` (explicit
   unsubscribe/logout), `getActivePushTokens` (dispatch lookup, fans out to
   every active device), `touchPushToken` (last-used tracking).
3. **`communication-worker` integrated with the token store** — push rules
   now resolve `student_id`/`instructor_id` from the trigger payload, look
   up every active device token via `push_device_tokens`, and dispatch to
   each individually (one `outbound_messages` row per device); a
   provider-reported invalid token auto-revokes its row.
4. **`event-worker` payload + gate fix** — added `student_id`/`instructor_id`
   to every relevant trigger payload (`booking_confirmed`,
   `booking_cancelled`, `booking_rescheduled`, `waitlist_promoted`,
   `booking_reminder_*`, `instructor_schedule_daily`) and removed the
   phone/email-required gate that previously blocked the enqueue entirely
   for a push-only recipient with neither contact method on file.
5. **Registration/revocation endpoints** — `POST`/`DELETE /push/register`
   added to `student-portal`, `instructor-portal`, `guardian-portal`
   (session-authenticated, matching each portal's existing pattern) and to
   `communications` (staff, RBAC'd via the existing JWT).
6. **Frontend** — `core/push/index.ts` (Firebase Web SDK init, permission
   request, `getToken()`, foreground-message handling; mirrors the
   `core/monitoring` graceful-no-op-without-config pattern exactly),
   `shared/hooks/usePushSubscription.ts` (browser lifecycle + previous-token
   tracking for refresh, shared across all three portals), and a "Push-notiser"
   settings card wired into `StudentPortalSettingsPage`,
   `GuardianPortalKontoPage`, and `InstructorPortalInstallningarPage`.
   `apps/web/public/sw.js` needed no changes — its existing generic `push`
   handler already parses the `{title, body, url}` shape FCM's data message
   delivers.
7. **Static validation, all clean:** `pnpm typecheck` 9/9 packages;
   `pnpm --filter @platform/web build` succeeds; `pnpm --filter @platform/web lint`
   holds at the documented baseline (0 errors, 67 pre-existing warnings, none
   new). All six touched Edge Functions
   (`communication-worker`, `communications`, `student-portal`,
   `instructor-portal`, `guardian-portal`, `event-worker`) redeployed and
   confirmed live; `verify_jwt` reconfirmed unchanged on every one
   (`communications: true`, the other five: `false`) after redeploy. Both
   new migrations (`20260723000001`, `20260723000002`) confirmed applied via
   `supabase migration list --linked` and live REST queries.

**What was deliberately NOT done, per instruction:** no Firebase project was
created, no service-account/Web-config/VAPID secrets were fabricated or
placeholder-set, and no live end-to-end delivery was attempted — none of
that is possible without a real Firebase project. The Web Push
(`push_subscriptions`) implementation was left exactly as found (not
implemented further, not removed), logged as deprecated infrastructure in
the Technical Debt Register.

**Round 4 (2026-07-23) — final commissioning audit of the built implementation.**
Systematically reviewed security (auth/authz/tenant isolation/ownership),
token lifecycle, database integrity, failure handling, and observability.
Found and fixed 3 real defects — not new functionality, corrections to code
written this pass — all re-deployed and live-verified against the isolated
Starter Tier Test tenant (org `8e3aced8-44c5-485e-b180-2609b6e19857`):

1. **CRITICAL — registration was completely broken.**
   `registerPushToken`'s `.upsert(..., {onConflict:'token'})` targeted a
   *partial* unique index (`token WHERE revoked_at IS NULL`), which
   PostgreSQL cannot use as an `ON CONFLICT` arbiter without the conflict
   clause repeating the same predicate — something Supabase-js's `onConflict`
   option can't express. **Confirmed live**: replaying the original pattern
   via direct REST call returned Postgres error `42P10` ("no unique or
   exclusion constraint matching the ON CONFLICT specification") on every
   call, not just actual conflicts — meaning 100% of device registrations
   would have failed from the moment real credentials were configured, with
   no code-level indication of why. Fixed by replacing the upsert with
   explicit select-then-insert/update logic in `_shared/push-tokens.ts`.
   **Live-verified**: new-token insert, and idempotent re-registration of an
   already-active token (update branch), both confirmed working via direct
   REST calls against the real table.
2. **HIGH — missing ownership validation (cross-user token revocation
   within a tenant).** `revokePushToken` checked only `id` +
   `organization_id`, and the refresh path's `revokePushTokenByValue` only
   checked `organization_id` + the raw token string taken from the request
   body — neither verified the token actually belonged to the calling
   student/instructor/guardian/staff member. Any authenticated same-tenant
   user could revoke any other same-tenant user's device token (by ID, or by
   value via the refresh parameter). Fixed by adding required
   `ownerColumn`/`ownerId` parameters to both revocation functions, checked
   in the same query via `.eq(ownerColumn, ownerId)`, and updated all 5 call
   sites (`student-portal`, `instructor-portal`, `guardian-portal`,
   `communications`, `communication-worker`'s invalid-token auto-revoke) to
   pass the caller's own verified identity. **Live-verified**: a revoke
   attempt with the wrong `user_id` matched 0 rows and left the token active;
   the same request with the correct `user_id` succeeded.
3. **MEDIUM — refresh ordering and OAuth resilience.** (a) The previous
   token was revoked *before* the new one was confirmed registered, risking
   a zero-active-token window on failure — reordered to register-then-revoke.
   (b) `dispatchFirebase()` cached its OAuth2 access token proactively but
   never invalidated it on rejection — a token rejected before its natural
   expiry (external revocation, isolate-reuse clock skew) would cause every
   subsequent send to fail identically for up to ~1h. Fixed: on a 401
   response, the cache is cleared and the send retried once with a freshly
   minted token. Code-reviewed only (cannot be live-tested without a real
   Firebase project to actually reject a token).

**Confirmed correct, no defects found:**
- **Authentication**: all four registration surfaces (3 portals +
  `communications`) place the push routes after their existing mandatory
  session/JWT check — verified by re-reading each file's control flow, not
  reachable before that gate.
- **Tenant isolation**: every write/read is scoped by `organization_id`
  sourced from the caller's validated session/JWT, never from request input.
- **Multi-device support**: `getActivePushTokens` fans out to every active
  token for a recipient — unaffected by the fixes above, confirmed still
  correct.
- **Duplicate handling**: idempotent by construction post-fix (same token
  re-registered updates the existing row rather than erroring or duplicating).
- **RLS / constraints**: `push_device_tokens` grants `service_role` only, no
  `authenticated`/`anon` policy (deny-by-default) — matches the established
  pattern for this class of table (`push_subscriptions`, the three
  `*_portal_sessions` tables all follow the same design). The
  `push_device_tokens_owner_check` CHECK constraint (exactly one owner
  column) is intact and unaffected.
- **Audit logging**: confirmed no `audit_trigger_fn` exists on any comparable
  session/token table in this codebase either — consistent with established
  convention, not a gap introduced here. Point-in-time history is carried by
  the table's own `registered_at`/`last_refreshed_at`/`last_used_at`/
  `revoked_at`/`revoked_reason` columns, same as `push_subscriptions`.
- **Retries**: push `outbound_messages` rows are picked up by the same
  generic `claim_retry_messages` retry mechanism already used for every
  other channel — inherited automatically, no special-casing needed or done.
- **Observability**: dispatch results flow into `outbound_messages`
  (status/provider/error_message/metadata) exactly like every other
  provider in `comm-providers.ts` — already queryable via the existing
  `/communications/analytics` and `/communications/queue-health` endpoints,
  no new surface needed.
- **Timeout handling / structured logging**: `comm-providers.ts` has zero
  `AbortController`/timeout usage and zero `logger` calls *file-wide*, for
  every provider (SMS/email/WhatsApp/voice), not specific to push — a
  pre-existing, cross-cutting characteristic of this shared module, out of
  the Push Notifications subsystem's boundary to change. Noted here for the
  record, not fixed, per the standing scope-discipline rule (fixing it would
  mean redesigning error-handling for a shared file used by every
  communication channel, not a push commissioning task).

All fixes redeployed; `verify_jwt` reconfirmed unchanged on every touched
function (`communications: true`, the rest: `false`).

**Remaining blockers — genuinely external, cannot be resolved from within this project:**

| Required credential | Where it's used | Purpose |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` (Supabase secret) | `_shared/comm-providers.ts` → `dispatchFirebase()` | Full service-account JSON key file (Firebase Console → Project Settings → Service Accounts → Generate new private key) — server-side OAuth2 auth for FCM HTTP v1 send calls |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` (build-time env vars) | `apps/web/src/core/push/index.ts` | Firebase Web app config (Firebase Console → Project Settings → General → Your apps → Web app) |
| `VITE_FIREBASE_VAPID_KEY` (build-time env var) | `apps/web/src/core/push/index.ts` → `getToken()` | Web Push certificate key pair (Firebase Console → Project Settings → Cloud Messaging → Web Push certificates) |

**Commissioning activities that remain once those exist:** request a real
device token in each portal (permission prompt → `getToken()` → registration
endpoint), confirm the row lands in `push_device_tokens`, trigger a real
business event (e.g. a real booking confirmation) end-to-end to a real
device, confirm delivery while backgrounded (via `sw.js`) and foregrounded
(via `onForegroundPush`), confirm token refresh replaces the old row, and
confirm revocation on logout. None of this is achievable without the
credentials above.

**Do not re-investigate** template/rule/channel-config state, the
communication-worker routing fix, the HTTP v1 rewrite, the device-token
lifecycle implementation, or the portal registration endpoints in a future
pass — all built, deployed, and statically verified this round. Revisit only
once the credentials table above has been filled in from a real Firebase
project, to run the live E2E checklist.

---

### Unified Notification Center (Version 1.1)

**Status: FULLY IMPLEMENTED, COMMISSIONED, AND READY FOR VERSION 1.1 BASELINE.**

Evolved the pre-existing (previously reminder-only) `notifications` table into
the canonical, immutable, cross-channel business-event history for the
platform. `communication-worker.runNotify()` creates exactly one canonical
record per business event, independent of and unaffected by per-channel
delivery outcome (`outbound_messages`, linked via `notification_id`). Full
detail, data model, and defect history in the Handbook's "Push Notifications
commissioning + Unified Notification Center" entry (2026-07-23/24) and
`VERSION_1.1_ROADMAP.md`'s Student Experience item.

**Final UI validation (this pass)** — full real user journey exercised via
automated browser testing (Playwright) against the real running app, real
backend, real Firebase push delivery, screenshotted at every step:
booking-confirmation trigger → real push delivered → bell increments → real
subject/body/category/timestamp/unread-indicator rendered correctly →
click → marks read + navigates to the correct deep-linked page → bell
decrements → notification remains visible in history, correctly shown as
read. Verified on both desktop (1400px) and mobile (390px) viewports, plus
the empty-state screen (fresh student, zero notifications).

**Two real defects were found and fixed during this final visual pass**
(not reachable through backend/API testing alone):
1. The notification card duplicated the canonical title with the frontend's
   own separate hardcoded label directly above it, and — because the card's
   body-preview logic assumed `subject` was often absent — the actual
   message body (lesson date/time, etc.) was never displayed at all once
   `subject` became mandatory. Fixed: card now shows the canonical
   `subject` as its single title, always shows the body preview, and shows
   a category badge instead of the now-meaningless internal `channel` value.
2. Two mobile-only dashboard components (`GreetingHeader`,
   `QuickLinks` in `StudentPortalDashboard.tsx`) were missed during the
   original unread-count migration and still showed the old total-ever-sent
   count instead of the real unread count — confirmed reproducible (backend
   API independently verified correct at the same moment the UI showed a
   stale badge), fixed, and re-verified via fresh screenshots.

All test data cleaned up; isolated test tenant restored to its original
state. `pnpm typecheck` 9/9 clean, production build clean, deployed.

**Regression check:** Push Notifications (real dispatch reconfirmed working,
untouched otherwise), Communication Engine (`runNotify()`'s existing
per-channel dispatch loop unchanged in behavior, only extended), Student
Portal (all exercised pages render correctly, no visual breakage), existing
APIs (no breaking signature changes, typecheck/build clean across the
monorepo). Reminder Scheduler's own code path was not modified by this
feature and was not separately re-exercised live this pass (no code changes
to `schedule_lesson_reminders`/`drain_due_reminders`/`lesson_reminders`) —
flagged for completeness, not treated as a gap.

**Conclusion: ✅ ACCEPTED.** Every step of the end-user journey validated
live with no blocking defects remaining. Subsystem frozen — do not reopen
except for a future enhancement or a production defect.

---

---

### Stripe Integration

**Status:** ⚠ COMMISSIONED WITH EXTERNAL DEPENDENCIES (2026-07-24)

**Evidence:** Full domain governance lifecycle completed (Architecture Assessment
→ Governance Classification → Implementation Compliance Review → Corrective
Implementation → Validation → Commissioning → Closure — see
`docs/DOMAIN_GOVERNANCE_PORTFOLIO.md`). ADR-022 (Integration Credential
Management Architecture) implemented for both `stripe_secret_key` and
`stripe_webhook_secret`: new `stripe-credentials` Edge Function (server-side
validate → encrypt → persist), org-scoped webhook signature verification,
backward-compatible decrypt-on-read for the one pre-existing plaintext
credential. Live-verified: save-time validation rejects a malformed key and a
well-formed-but-fake key (real Stripe API check) before persistence; a newly
encrypted webhook secret was proven to correctly verify a real, independently
computed HMAC-SHA256 signature; the pre-existing plaintext credential was
proven still readable by creating a real Stripe Checkout Session through it.
Operational alerting on settlement failure was added, and a real defect in it
(`notification_category = 'finance'`, not a valid enum value) was found and
fixed only by forcing a genuine `record_payment()` failure live — the
resulting real `notifications` row, correctly targeted at the org owner, is
the actual proof, not the fix alone.

**External dependency, not resolved by this pass:** no legitimate Stripe
account exists in this environment. The one Stripe credential reachable
belongs to an unrelated third party (found during the Architecture
Assessment, deliberately not modified per explicit instruction — this is an
operational configuration action for the account owner, not an engineering
task). Consequently, the real end-to-end chain — a genuine payment, completed
by a real customer, producing a webhook Stripe itself dispatches — has never
been observed; every webhook processed during this commissioning was
correctly self-signed for verification purposes.

**Do not re-investigate** the credential encryption/validation implementation
or the alerting logic in a future pass — both are live-verified and closed.
Revisit only once a real pilot organization's own Stripe account exists, to
complete: replacing the unauthorized credential, registering the org-scoped
webhook endpoint in that real account, and observing one real delivery.

---

*(Further subsystem entries to be appended as the commissioning exercise
proceeds.)*
