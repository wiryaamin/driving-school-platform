# Secrets Management Guide — TrafikskolaOS

**Companion to `docs/INTEGRATION_CONFIGURATION_GUIDE.md`** (the *why* for each integration) and `docs/ENVIRONMENT_VARIABLE_REFERENCE.md` (the full variable-by-variable table). This document is narrower and more focused: it's the policy layer — *how* secrets are categorized, stored, protected, and rotated, regardless of which specific integration they belong to.

No secret **value** is ever printed or exposed in this document. Section "Pilot Environment Configuration — Sprint 1 Log" below records that local, gitignored files *were* edited in that sprint (fixing an inconsistency, removing a misplaced key, adding a local-only development value) — every value affected is masked here exactly as everywhere else in this guide.

---

## Pilot Environment Configuration — Sprint 1 Log (Platform Core Secrets)

**What this sprint found live on the hosted dev project (`ulgsndzfksphquqakelq`), via the read-only `supabase secrets list` command (which returns a SHA-256 fingerprint per secret, never the plaintext):** `AUTH_HOOK_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `WORKER_SECRET`, plus two identity-related secrets (`IDENTITY_ENCRYPTION_KEY`, `IDENTITY_HASH_KEY`) not previously documented in this guide. **`PLATFORM_BOOTSTRAP_SECRET`, `APP_URL`, and `STUDENT_APP_URL` were confirmed genuinely absent** — not a local-file-only gap, actually missing from the live project.

This corrects the previous audit's framing in one important way: `WORKER_SECRET` is **not** missing — it was missing only from local files. The live one (set 2026-06-11) is presumably already correctly referenced by the deployed workers, and this sprint deliberately did not touch it.

**Actions taken (local, gitignored files only — nothing pushed to the hosted project):**

1. **`AUTH_HOOK_SECRET` inconsistency resolved.** `supabase/.env` and `supabase/functions/.env` held two different values. Rather than guessing or generating a third value, both local values' SHA-256 fingerprints were compared against the live secret's fingerprint (no value was ever re-exposed to do this — fingerprint comparison only). `supabase/functions/.env`'s value matched the live secret exactly; `supabase/.env`'s did not. `supabase/.env` was corrected to match `supabase/functions/.env`. **No change was made to the hosted project or the Supabase Dashboard's Auth Hook configuration** — both local files now correctly reflect what's already live and (presumably) working.
2. **A local-development-only `WORKER_SECRET` was generated** (`openssl rand -base64 32`) and added to `supabase/functions/.env`, clearly documented as distinct from the hosted project's own already-set value. This value only matters if someone runs `supabase functions serve` against a local `supabase start` Docker stack — it is not, and does not need to be, the same value as the live one.
3. **`SUPABASE_SERVICE_ROLE_KEY` removed from `supabase/functions/.env`.** It was hand-copied there previously (a real finding from the earlier Production Environment Audit). It served no correct purpose in that file — the Edge Function runtime auto-injects the real value regardless, and if this file's copy were ever used for local Docker-stack testing, it would have been the *wrong* key for that context anyway (the local stack has its own separate service-role key). **The live key itself was not rotated** — only the misplaced local copy was removed. Rotating the live key is a separate, more disruptive decision not made in this sprint (see Rotation Policy below).
4. **`PLATFORM_BOOTSTRAP_SECRET` was generated as a candidate value, then deliberately not applied anywhere and not persisted.** Confirmed genuinely absent from the hosted project. Pushing a first-time value for it would have been low-risk (nothing currently depends on it, so nothing could break), but the user chose to wait for a dedicated pilot project rather than set a pilot-scoped secret on the shared dev project — consistent with the Pilot Environment Architecture Blueprint's own recommendation at the time. **Superseded by the strategic pivot below.**

---

## Strategic Pivot (Platform Environment Configuration Sprint 2 — "Active Environment")

The dedicated-pilot-project model recommended by earlier sprints was **explicitly reversed** by the project owner: rather than provisioning a separate Supabase project, the platform now evolves as **one continuously-improved active environment** (`ulgsndzfksphquqakelq`, still referred to informally as "dev" in older docs, now the single active/pilot/production project going forward), with baseline/rollback discipline substituting for environment duplication. Earlier documents' repeated "provision a dedicated pilot project" recommendation is superseded by this decision — do not re-propose it without a new, compelling technical reason, per this sprint's own explicit rule.

**Actions taken this sprint (pushed live to the active project — a deliberate change from Sprint 1's "wait" decision, now appropriate since there is no longer a separate pilot project to wait for):**

1. **`APP_URL` set to `https://advertentia.com`** via `supabase secrets set`. Verified live: a CORS preflight (`OPTIONS`) request from that exact origin against the `students` function now returns `Access-Control-Allow-Origin: https://advertentia.com`. Purely additive — the existing `localhost:5173`/`5174` allowlist entries (hardcoded in `_shared/cors.ts`) are unaffected, so local development continues to work exactly as before.
2. **`PLATFORM_BOOTSTRAP_SECRET` generated fresh and set** via `supabase secrets set`. Confirmed present via `supabase secrets list`. Not yet exercised (see Outstanding Issues) — actually invoking the bootstrap flow would create real organization/admin data, out of scope for an environment-configuration sprint.
3. **`STUDENT_APP_URL` deliberately left unset**, unchanged from Sprint 1's reasoning — no student portal app exists to have an origin yet.
4. **`supabase config push` (Site URL / Redirect URLs / email confirmation / password recovery / session / JWT settings) was investigated and explicitly NOT run.** The CLI's `config` command has exactly one subcommand, `push` — no `pull`, no `diff`, no dry-run. Local `config.toml`'s `[auth]` section currently contains only `localhost` values (`site_url = "http://localhost:5173"`, redirect URLs all `localhost`). Running `config push` blind would silently overwrite whatever Site URL/Redirect URLs are actually live and working on the hosted project right now with those localhost-only values — a real risk of breaking live authentication with no way to preview or undo the change first. This needs to be resolved via the Supabase Dashboard directly (Authentication → URL Configuration), not this CLI command, until/unless a safer read-then-write path is found.

---

## Email Infrastructure — Sprint 3 Log

**Sprint 3 (provisioning attempt):** objective was to configure Resend as Supabase Auth's SMTP provider. Not completed — every step requires access this session doesn't have: a real account signup, DNS zone access for `advertentia.com`, and the Supabase Dashboard UI. No secret was set, no account was created, no DNS was touched.

**Sprint 3 (architecture, this entry):** before re-attempting provisioning, a full architecture review was produced — `docs/EMAIL_ARCHITECTURE.md`. Its finding: the existing `_shared/comm-providers.ts` provider-abstraction pattern is already correctly shaped and should be extended, not replaced; the only real gap is operational (no SMTP provider configured), not architectural. No secret-management policy changed as a result — the categories/rotation/ownership guidance elsewhere in this document already covers `RESEND_API_KEY` and Auth SMTP credentials correctly.

**What this sprint did deliver:** a complete, step-by-step runbook (`docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.2, "Supabase Auth SMTP Runbook") precise enough for a human to execute in one pass — exact DNS record types, exact Resend SMTP connection details (host/port/username), and the exact `curl` command to re-run afterward to confirm the fix, reusing the same test that found the original blocker in Sprint 2B.

**Root cause, restated precisely for this log:** Supabase's own default email sender has a low rate limit; it was already exhausted as of Sprint 2B (`429 over_email_send_rate_limit`, reproduced twice, reproducibly, with zero orphan records created). This blocks the confirmation email every new signup requires, which blocks account creation, which blocks the rest of the authentication lifecycle validation. It is an external quota, not a secret this session could set — `RESEND_API_KEY` (for the app's own notifications) and Supabase Auth's SMTP credentials (Dashboard-only, not a Supabase Secret at all) are two different things; setting one does not fix the other. See `docs/ENVIRONMENT_VARIABLE_REFERENCE.md`'s Email section for both, side by side.

---

## Platform Validation & Readiness — Sprint 2A Log

**Baseline confirmed unchanged from Sprint 2** before any new action: same HEAD (`bf00c69`), same 13 live secrets, 224/224 migrations in sync, 59/59 Edge Functions `ACTIVE`.

**New read-only visibility gained this sprint**, via CLI subcommands not previously explored (`supabase inspect db`, `supabase storage ls --experimental`):
- Database health: 100% index/table cache hit rate, 44MB database size, zero blocking queries, zero long-running queries — no evidence of any performance or contention problem.
- Storage: exactly one bucket exists (`student-documents`), consistent with the one known Storage consumer in the codebase (`apps/web/src/modules/documents/hooks/useDocuments.ts`).
- `IDENTITY_ENCRYPTION_KEY`/`IDENTITY_HASH_KEY` (flagged in Sprint 1 as "live but undocumented") confirmed **not obsolete** — both actively consumed by `students/index.ts` and `_shared/bankid-crypto.ts` for personnummer encryption/hashing. Now properly documented in this guide and in `docs/ENVIRONMENT_VARIABLE_REFERENCE.md`.

**Still no safe read path found for Supabase Auth Dashboard settings** (Site URL, Redirect URLs, email confirmation, password recovery, session/JWT settings). The `supabase config` command has exactly one subcommand (`push`) — confirmed again this sprint, no `pull`/`diff`/dry-run exists in this CLI version. This remains a manual-verification item, not a tooling gap this session can close.

**One code fix made**, explicitly authorized by this sprint's rules ("implement the smallest possible fix" for the health endpoint specifically): `supabase/functions/health/index.ts`'s route-matching regex corrected (one line), redeployed with `--no-verify-jwt` (verified `verify_jwt: false` held after deploy — this is the exact failure mode a past incident on this project was caused by, per the Enterprise Architecture Handbook's Operational Governance section), all three health routes now return `200` live.

**One local-file correction**: `supabase/functions/.env`'s `APP_URL`/`STUDENT_APP_URL` held non-local placeholder domains inconsistent with `docs/DEPLOY.md`'s own documented local-dev values — corrected to `localhost` values matching that documentation. Gitignored, local-only, no live/hosted effect.

---

## Frontend Variables vs. Backend Secrets — the one distinction that matters most

Everything prefixed `VITE_` ends up **inside the JavaScript bundle a browser downloads.** Anyone can view it — it is not private, no matter how it's stored beforehand. This is normal and fine for values *designed* to be public (a project URL, an anon key protected by database-level security rules). It is a serious mistake for anything that isn't.

Everything else — every Supabase Secret consumed inside an Edge Function — never reaches the browser. It lives only on Supabase's servers and is injected into the function's execution environment at request time.

**The practical rule:** if a value is prefixed `VITE_`, treat it as public the moment it's built into the app, even before anyone actually looks. If it isn't prefixed `VITE_`, it belongs in Supabase Secrets, never in frontend code, never in a `VITE_` variable, and never committed to the repository.

---

## Safe Public Variables

These are designed to be visible in the browser and are not a security concern if seen:

- `VITE_SUPABASE_URL` — a project URL, not a credential
- `VITE_SUPABASE_ANON_KEY` — a public API key; security comes entirely from Row Level Security rules in the database, not from keeping this key secret (this is Supabase's own designed model, not a weakness specific to this project)
- `VITE_APP_ENV`, `VITE_APP_VERSION` — plain labels
- `VITE_SENTRY_DSN` — technically visible in the bundle if set; not a credential an attacker can use to read your data (it only lets someone submit fake error reports to your Sentry project, a low-severity nuisance at worst)

## Private Variables (must never reach the frontend or the repository)

Everything in `docs/ENVIRONMENT_VARIABLE_REFERENCE.md` marked "Sensitive: Yes" — most notably:

- `SUPABASE_SERVICE_ROLE_KEY` — bypasses every database security rule; the single most dangerous value in the entire project if leaked
- `AUTH_HOOK_SECRET`, `WORKER_SECRET`, `PLATFORM_BOOTSTRAP_SECRET` — platform-internal authentication secrets
- `IDENTITY_ENCRYPTION_KEY`, `IDENTITY_HASH_KEY` — protect encrypted/hashed personnummer values at rest (found live during Sprint 1, properly documented as of Sprint 2A — see the log below)
- Every third-party API key/secret (`RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_AUTH_TOKEN`, `BANKID_CLIENT_KEY`, etc.)
- Per-organization Stripe secret keys — private to that organization even from other organizations on the same platform, stored in the database (org settings), never in an environment variable at all

---

## Where Each Category Is Stored

| Category | Storage location | Never store here |
|---|---|---|
| Frontend public variables | The Hostinger build environment (baked into `dist/` at build time) | Anywhere they'd be treated as secret — they aren't |
| Platform-wide backend secrets | Supabase Secrets (`supabase secrets set`), on the correct project (dev vs. pilot/production are separate secret stores — see `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` Phase 1) | A committed file, a local `.env` that isn't gitignored, chat/email, or a shared document |
| Per-organization secrets (e.g. an individual driving school's Stripe key, Roaring/Biluppgifter credentials for Person/Vehicle Lookup) | The application's own database, encrypted via `credential-crypto.ts` (AES-256-GCM), entered by that organization's administrator through the app's settings screen | A platform-wide Supabase Secret (would leak one organization's key to all) |
| Local development secrets | `apps/web/.env.local`, `supabase/functions/.env`, `supabase/.env` — all gitignored | Committed to git under any circumstance |

**Repository protection currently in place** (verified, not assumed): `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`, and — as of the Production Environment Preparation sprint — `.env.production` as well, while explicitly allowing the placeholder-only `.env.example` and `.env.production.example` templates. This was specifically checked and closed as a real gap during that sprint (a bare `.env.production` was not previously covered by the ignore rule).

---

## Rotation Policy

No formal, automated rotation schedule exists in this codebase today — this section states a recommended policy, which is a process decision, not something implemented by this document.

**Recommended cadence:**

- **`SUPABASE_SERVICE_ROLE_KEY`** — the misplaced local copy found by the Production Environment Audit was removed during the Pilot Environment Configuration Sprint 1 (see log above). **The live key itself has not been rotated.** Whether to rotate it as a precaution (it was exposed to a local file, even though gitignored and never committed) is a judgment call the project owner should make explicitly — rotating it is disruptive (every Edge Function depends on it) and should be scheduled deliberately, not done reflexively. Absent a rotation decision, no fixed schedule; Supabase manages this key's lifecycle.
- **`AUTH_HOOK_SECRET`** — now single-sourced correctly across local files (Sprint 1). Rotate on team-member departure if that person had access, and consider a routine annual rotation as a baseline hygiene practice. Rotating it requires updating both the Supabase Secret *and* the Dashboard's Auth Hook configuration in the same action — updating only one side causes an immediate auth outage (this is the exact failure mode the Enterprise Architecture Handbook's Operational Governance section was written to prevent).
- **`WORKER_SECRET`** — the hosted project's live value was deliberately left untouched this sprint (already working, no reason found to disrupt it). A separate, local-only value now exists for local Docker-stack testing. Rotate the live value on team-member departure or suspected exposure, same as any other platform secret.
- **`PLATFORM_BOOTSTRAP_SECRET`** — does not exist yet; "rotation" isn't applicable until it's first created. See "Recommended Next Step" below.
- **Third-party API keys (Resend, Stripe, Twilio, etc.)** — rotate immediately on suspected exposure; otherwise follow whatever rotation guidance each vendor recommends in their own dashboard/security settings
- **Per-organization secrets (e.g. Stripe)** — rotation is that organization's own responsibility and decision; the platform should support it (via the same settings screen used to enter the key originally) but does not enforce a schedule

**Immediate rotation triggers, regardless of schedule:**
- A secret is found in a place it shouldn't be (a file, a screenshot, a chat message, a public repository)
- A team member with access to a secret leaves the team
- A vendor notifies of a security incident on their side

---

## Ownership

| Category | Owner |
|---|---|
| Supabase project itself (who can view/set secrets) | Platform Engineering |
| `AUTH_HOOK_SECRET`, `WORKER_SECRET`, `PLATFORM_BOOTSTRAP_SECRET` | Platform Engineering |
| `RESEND_API_KEY`, `VITE_SENTRY_DSN` | Platform Engineering (account creation may involve the Product Owner for billing/business decisions, per `docs/INTEGRATION_CONFIGURATION_GUIDE.md`) |
| `STRIPE_WEBHOOK_SECRET` (platform-wide) | Platform Engineering |
| Per-organization Stripe keys | That organization's own administrator |
| BankID certificates | Product Owner initiates the external relationship; Platform Engineering handles the technical configuration once obtained |
| Fortnox client credentials | Platform Engineering (application-level); each organization owns its own OAuth authorization |
| SMS/voice/push/WhatsApp provider credentials | Whichever party (Platform Engineering or a specific pilot organization) decides to activate that integration |

---

## Recommended Next Step

**Superseded** — the dedicated-pilot-project plan this section originally described was reversed (see "Strategic Pivot" above). `APP_URL` and `PLATFORM_BOOTSTRAP_SECRET` are now live on the one active project; no second project's secrets need provisioning.

What remains:

1. Resolve the Site URL / Redirect URLs / email / session / JWT settings gap via the Supabase Dashboard directly (Authentication → URL Configuration, Authentication → Email, Authentication → Sessions) — not `supabase config push`, per the risk noted above.
2. Exercise the bootstrap flow with real parameters when ready to create the platform's actual first organization/admin (a deliberate, one-time action outside the scope of environment configuration).

---

## What This Guide Deliberately Does Not Cover

- **Specific current secret values** — never included, per this sprint's explicit constraint and general good practice
- **Automated secret-scanning tooling** — no such tooling was found configured in this repository; recommending one is a Version 1.1 Backlog / Commercial Release Enhancement-shaped decision per the Version 1.0 Scope Freeze's classification rule, not something this document authorizes
- **General deployment sequencing** — see `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` and `docs/DEPLOY.md`
