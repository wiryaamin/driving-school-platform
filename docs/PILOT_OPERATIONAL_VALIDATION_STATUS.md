# Pilot Operational Validation — Status Dashboard

**Document type:** Authoritative, living operational-readiness status for Sprint 4H and all subsequent pilot-readiness work. Update this document as validation continues — don't create a new one per sprint.
**As of:** end of the defect-first investigation (`docs/PILOT_OPERATIONAL_VALIDATION_DEFECT_FIRST.md`).
**Source documents this dashboard consolidates:** `docs/PILOT_OPERATIONAL_VALIDATION.md`, `docs/PILOT_OPERATIONAL_VALIDATION_CONTINUATION.md`, `docs/PILOT_OPERATIONAL_VALIDATION_DEFECT_FIRST.md`, `docs/PILOT_VALIDATION_TENANT.md`.
**Evidence standard:** every status below reflects only what was actually observed running — a real login, a real form submission, a real network response, a real screenshot. Nothing here is inferred from source code, prior Epic completion records, or assumption. Where something hasn't been operationally tested, it is marked **Pending**, never assumed passing.

---

## 1. Sprint Progress

| Environment Verification | Status |
|---|---|
| Pilot Validation Tenant | ✅ Complete |
| Playwright Automation | ✅ Complete |
| Application Startup | ✅ Complete |

| Role | Status |
|---|---|
| Platform Administrator | ✅ Validated |
| Organization Owner | ✅ Validated (full regression pass, zero unexplained errors) |
| Receptionist | 🟡 Partially Validated |
| Instructor | 🟡 Partially Validated |
| Student | 🟡 Partially Validated |
| Guardian | 🔴 Blocked (not a testing gap — the capability doesn't exist yet) |
| Public Visitor | 🟡 Partially Validated |
| Corporate Portal | ⏸ Out of Scope (Version 1) — confirmed via `VITE_FEATURE_CORPORATE_PORTAL=false` |

**Why "Partially Validated" instead of forcing ✅/⏳:** several roles have real, completed, evidenced journeys alongside real, un-executed ones. Collapsing that into a single ✅ or ⏳ would misrepresent one side or the other. Section 2 gives the precise breakdown per role.

---

## 2. Validated Business Journeys

| Journey | Evidence collected | Screenshots | Playwright execution | DB verification | Operational status | Confidence |
|---|---|---|---|---|---|---|
| Platform Admin: login + dashboard | Real dashboard: 42 orgs, worker health, subscription mix | `04-pa-login-isolated.png` | ✅ | Live org list cross-checked | ✅ Validated | High |
| Owner: login + dashboard + org settings + Users + Roles | Full regression pass, zero unexplained 4xx/5xx, zero console errors | `30`–`33-regression-*.png` | ✅ | Direct PostgREST queries confirming both fix and pre-fix states | ✅ Validated | High |
| Owner: invite new staff member | Real `500` from `invite-user`, root-caused to SMTP, confirmed no orphan data | `24`–`25-invite-*.png` | ✅ | Queried `auth.users`/`profiles` for the invited email — confirmed absent | ✅ Validated **as currently broken** — this is a completed, evidenced journey whose result is "fails," not an untested one | High |
| Receptionist: create student | Real "Elev skapad" toast, real student ID/detail page | `12-student-created.png` | ✅ | Student record reachable at a real URL with real ID | ✅ Validated | High |
| Receptionist: generate student portal access | Real `201` from `student-portal/generate-token`, real token/expiry | `13`–`14-portal-link-*.png` | ✅ | Token used successfully in the next journey | ✅ Validated | High |
| Student: portal login + dashboard | Full personalized portal (name, theory progress, journey tracker, quick links) | `15-student-portal.png` | ✅ | Token-based session, no password — by design | ✅ Validated | High |
| Public Visitor: browse site + demo form | Site renders; form renders with correct client-side validation (caught an intentionally incomplete test fill) | `21-public-home.png`, `22-demo-page.png`, `23-demo-submitted.png` | ✅ | `demo-requests` function confirmed deployed and reachable | 🟡 Validated for rendering/validation; **a fully successful submission was not completed** | Medium-High |
| Receptionist: booking calendar page | Full toolbar renders correctly (filters, week/day view, "Nytt pass") | `29-debug-scheduling.png` | ✅ | N/A — no booking was created | 🟡 Structural only — no actual booking workflow exercised | Low-Medium |
| Instructor: login + own-schedule page | Correct, graceful "Ditt konto är inte kopplat till en instruktör" message | `20-instructor-mitt-schema.png` | ✅ | Confirmed no `instructors` table row exists for this test account | 🟡 Login/shell validated; instructor-record-dependent workflows untested | Medium |

---

## 3. Defect Register

| ID | Description | Category | Severity | Status | Fixed in Sprint | Evidence | Pilot Blocker? |
|---|---|---|---|---|---|---|---|
| DEF-001 | `UsersSettingsPage.tsx` queried `profiles.organization_id`, a column that doesn't exist (`42703`) | Application defect | Critical | **Fixed** | 4H (initial) | `400`/`42703` response body; before/after screenshots; regression pass | Was Yes → now No |
| DEF-002 | Guardian creation not implemented anywhere in the UI (3 disabled entry points, consistently "Kommer snart") | Missing implementation (deliberate, disclosed) | High (impact) / Unclassified (scope) | **Deferred — requires new functionality** | — | 3 screenshots showing disabled controls; `/guardians` module confirmed list-only | Yes, if guardian self-service is required for pilot launch — business decision needed on whether staff-assisted guardian creation is an acceptable pilot-stage workaround |
| ISSUE-3 | `process_refund()` correctly reverses `payments`/`invoices`/`credit_ledger` and emits a `Refund.Processed` event, but `event-worker`'s handler for that event is an explicit stub (`// TODO: enqueue in accounting_export_queue`) — refunds never post a reversing journal entry, so the ledger and SIE4 exports diverge from actual cash movement after any refund | Missing implementation (accounting) | High — affects financial reporting accuracy after any refund | **Deferred — high-risk finance domain, requires business decision + explicit approval before implementation** | — | Live refund processed against the hosted project during Commercial Transaction Chain validation; confirmed correct reversal of payments/invoices/credits; confirmed no corresponding journal entry; `event-worker/index.ts` `handleRefundProcessed()` read directly, confirmed stub | No — refunds still work correctly for the student/finance-record side; only the ledger-posting completeness is affected, which is reconcilable manually for a small pilot's refund volume |
| DEF-003 | `notifications:notification:read` not granted to `receptionist`/`instructor` roles | Configuration (RBAC) | Low-Medium | **Fixed** (confirmed resolved) | Pilot Readiness Configuration Exercise | Direct `role_permissions` query confirms grant present for both roles, platform-wide (roles are global singletons, no per-org instantiation) | Was flagged → now No |
| DEF-004 | Inviting a new staff member fails (`500`) — root cause: SMTP rate-limit trickle (pre-existing, documented since Sprint 2B) | Operational | High (impact) / Not code-fixable | **Fixed** | Communications Configuration Domain | Custom SMTP configured in Dashboard → Authentication → Email; live re-test of staff invite flow confirmed success | Was Yes → now No |
| DEF-005 | `instructors:instructor:read` not granted to `receptionist`/`instructor` roles — empties the instructor-assignment dropdown on the student form, and likely affects booking (untested) | Configuration (RBAC) | Medium | **Fixed** (confirmed resolved) | Pilot Readiness Configuration Exercise | Direct `role_permissions` query confirms grant present for both roles, platform-wide | Was flagged → now No |
| DEF-006 | `RolesSettingsPage.tsx` — the identical `profiles.organization_id` defect as DEF-001, independent occurrence, different file | Application defect | Critical | **Fixed** | 4H (defect-first investigation) | `400`/`42703` response body, identical to DEF-001; before/after screenshots; regression pass | Was Yes → now No |
| DEF-007 | Storage RLS policies on `storage.objects` (student-documents bucket) included `auth.role() = 'authenticated'`, which is permanently false for every real user — this project's `auth-hook` deliberately overwrites the JWT `role` claim with the tenant's business role (e.g. `org_owner`), matching the pattern used by every other RLS policy in the schema, none of which check `auth.role()`. Blocked all document uploads/reads/deletes | Implementation defect (RLS policy) | Critical (Pilot Blocker — Documents) | **Fixed** | Pilot Readiness Stabilization Exercise | Migration `20260722000001_fix_storage_rls_auth_role_mismatch.sql`; validated via simulated JWT claims proving the old condition evaluated `false` for a real authorized user and the new condition evaluates `true`; regression-tested that an unauthorized user is still correctly denied | Was Yes → now No |
| DEF-008 | `student-packages` Edge Function deployed with `verify_jwt: false`, the only RBAC-protected tenant function among ~40 similar ones in this state — platform-level JWT verification was bypassed, relying solely on the function's own internal check | Deployment/security defect | Medium | **Fixed** | Pilot Readiness Stabilization Exercise | Redeployed with `verify_jwt: true` (default); confirmed via `supabase functions list`; regression-tested — unauthenticated request now returns `401` at the platform gate, matching sibling functions | No (defense-in-depth improvement) |
| DEF-009 | Generic `PATCH /bookings/:id` with `{status:'cancelled'}` always returned a raw `500` — the DB check constraint `lesson_bookings_cancel_consistency` requires `cancelled_at`/`cancelled_by`, which only the dedicated `/bookings/:id/cancel` endpoint (which also restores package credit) sets. Fixing by adding those fields to the generic path would have silently skipped credit restoration — a worse defect — so the correct fix is rejecting the transition with a clear error instead | Implementation defect (API contract) | Low (frontend never calls this path — confirmed via `SlotDetailSheet.tsx`/`useSchedulingMutations.ts`, cancellation always goes through the dedicated endpoint) | **Fixed** | Pilot Readiness Stabilization Exercise | `handleUpdate()` now rejects `status:'cancelled'` with a `422` pointing to the correct endpoint, before any DB write; live-tested against a real confirmed booking — `422` returned, booking status confirmed unchanged (no partial mutation); dedicated cancel endpoint untouched by the change | No |
| ISSUE-1 | Student Portal's `POST /bookings` never checked package-credit balance — students could self-book unlimited lessons through the portal without their package ever being debited, while the staff booking path enforced it correctly | Application defect | Critical | **Fixed** | 4I | Live API tests against the hosted project across 5 scenarios (staff/portal × sufficient/insufficient credit, no-package-type); shared credit logic extracted to `_shared/lesson-credits.ts`, used by both booking-creation paths | Was Yes → now No |
| ISSUE-2 | `event-worker`/`communication-worker`/`bookings`/`orders`/`public-enrollment`: `client.rpc(...).catch(...)` (and the equivalent on `.from().update().eq()`) throws `TypeError: ...catch is not a function` — supabase-js v2's query builder implements `.then()` but not `.catch()`. Surfaced on the workers' first-ever real invocation (pg_cron had never been scheduled before this sprint); the `bookings.ts` occurrence had no surrounding try/catch, so every staff "mark lesson completed" action was very likely returning a real `500` despite the DB update already succeeding | Application defect | Critical | **Fixed** | Scheduled Jobs domain (post-4I) | Live `500`→`200` on both workers; `event_outbox` continued draining (2,340→749 pending) with `dead_letter` unchanged at 30 (zero new failures); 16 occurrences fixed across 5 files (`.catch(fn)` → `.then(undefined, fn)`); full write-up in `docs/SCHEDULED_JOBS_ARCHITECTURE.md` §9 | Not separately tracked — surfaced during pg_cron configuration, not prior operational validation |
| OBSERVATION-1 | `net._http_response` regularly shows `timed_out = true` for both workers (pg_net's 5s default response-wait, shorter than a 50-event batch's 4-17s processing time) while the worker completes successfully | Operational characteristic (not a defect) | N/A | **Closed — documented, no code/config change** | — | `worker_run_log` confirmed `completed` with accurate counts for every run checked, including ones where `net._http_response` showed a timeout; verified pg_net's actual installed default (`5000`ms) directly against `pg_get_function_arguments()`, not assumed from docs | No |

---

## 4. Remaining Validation Scope

| Journey | Complexity | Estimated time | Notes |
|---|---|---|---|
| Receptionist: package sale → booking → reschedule → cancel → invoice → payment → document upload | **High** | 60–90 min | Longest remaining chain; each step needs live selector discovery; highest business-criticality untested area |
| Instructor: create `instructors` record, then schedule/lesson-completion/assigned-students | **Medium-High** | 30–45 min | Requires the setup step (linking a domain record to the login) before the actual workflows are reachable at all |
| Student: view bookings / package / lesson history | **Low-Medium** | 15–20 min | Portal access itself already proven; these are sub-views of an already-working shell |
| Public Visitor: one fully successful demo submission | **Low** | 5–10 min | Form and validation already proven; just needs a complete, valid fill |
| Branch Manager: own login + permission scope | **Low** | 10 min | Account already provisioned, never logged into |
| Guardian: any journey | **N/A** | N/A | **Blocked upstream by DEF-002** — cannot be tested until a guardian can be created |
| Cross-role consistency chain (Phase 3 of the original brief) | **Medium** | 20–30 min | Depends on the above being done first — needs real bookings/invoices/payments to exist to verify consistency across roles |

---

## 5. Pilot Readiness Score

| Area | Score | Justification |
|---|---|---|
| Environment | 100 | Fully verified: app starts, DB connects, Edge Functions reachable, real data flows throughout every test |
| Authentication | 95 | Exhaustively validated across all flows in Sprint 4B; the one gap is Invite-Staff's real-world SMTP dependency (DEF-004), which is Auth-adjacent but not Auth's own defect |
| Authorization | 75 | Core model (RLS, JWT claims, permission enforcement) is solid everywhere observed — but two confirmed, real RBAC gaps (DEF-003, DEF-005) are open and unresolved |
| Organization Management | 90 | Users and Roles both fully validated clean after fixes; Org Settings confirmed reachable but not deeply exercised |
| User Management | 85 | The page itself is now fully fixed and verified; the "invite a genuinely new person" path is currently broken in practice (DEF-004) |
| Scheduling | 40 | Calendar renders correctly structurally; **zero actual booking workflow has been operationally tested** — this is a real gap in evidence, not a confirmed defect, and the score reflects that absence of proof, not a presumption of failure |
| Student Management | 90 | Create-student journey fully validated end to end with real success |
| Instructor Management | 35 | Login/shell validated; every substantive workflow (assigned students, lesson completion) remains untested and is gated behind an un-created domain record |
| Guardian Management | 10 | Creation confirmed not implemented; everything downstream is un-testable by construction |
| Finance (Invoices/Payments) | 20 | Not operationally tested this sprint at all — no invoice or payment was created against the running app |
| Documents | 15 | Not operationally tested this sprint at all |
| Notifications | 50 | Confirmed broken (403) for 2 of the roles tested (DEF-003); presumed working for management roles based on the permission grant existing, but not independently exercised |
| Public Website | 90 | Site and demo form both validated for rendering and correctness; one fully successful submission still outstanding |
| **Overall Pilot Readiness** | **62** | A straight average would overstate this — several high-criticality commercial areas (Scheduling, Finance, Documents, Instructor workflows) are scored low specifically because they're **unproven**, not because anything observed was broken. This number reflects the current evidence base, not an estimate of underlying code quality. Treat it as "how much of Version 1 has been operationally proven," not "how good the software is." |

---

## 6. Open Pilot Blockers

| Blocker | Current status | Business impact | Required before pilot? | Owner | Est. effort |
|---|---|---|---|---|---|
| Guardian creation missing (DEF-002) | Confirmed, unclassified | Cannot onboard a guardian/parent portal user — a core capability for minor students | **Pending your classification** | Product (you) | Medium-Large if built (genuine new frontend, possibly backend, work) |
| SMTP not production-viable (DEF-004 and prior sprints) | Known, unchanged, now confirmed to also block Invite Staff | Password reset, invitations, and new-staff onboarding all unreliable | Yes | Operations (Dashboard/DNS access holder) | Small (human time) + DNS propagation |
| No database backups / PITR disabled | Known since Sprint 4C, unchanged | Unrecoverable data loss risk — unrelated to and larger than anything in this sprint | Yes, urgently, independent of pilot timing | Operations | Small (Dashboard/billing action) |
| Repository uncommitted / diverged from `main` | Known since Sprint 4C/4D, unchanged | The entire Platform Foundation exists only in a working tree | Yes, early | Operations/Process | Small-Medium (human git decision) |
| `notifications`/`instructors` RBAC gaps (DEF-003, DEF-005) | Confirmed, flagged | Degraded (not blocking) staff experience; DEF-005's real severity is still unconfirmed pending the Scheduling journey | No — but re-score DEF-005 once booking is tested | Product/Engineering | Small (a `role_permissions` grant, if approved) |

---

## 7. Go / No-Go Status

**🟡 On Track with Open Blockers**

Reasoning: nothing found across three rounds of operational validation suggests a structural or architectural problem — every defect found has been precisely root-caused, and two of them (both instances of the `profiles.organization_id` defect) are already fixed and regression-verified. What keeps this at 🟡 rather than a cleaner "on track" is that real, business-critical scope (the entire commercial chain — booking, invoicing, payment, documents) remains operationally unproven, and one real product decision (Guardian creation) is still open. Nothing observed rises to 🔴 — no defect found this sprint has been unfixable, unexplained, or indicative of a deeper problem; the open items are either external/operational (SMTP, backups, repo state) or awaiting a decision that isn't an engineering one.

---

## 8. Recommended Next Steps

Ordered by operational risk, not by the order originally listed in the brief:

1. **Receptionist commercial chain (package → booking → invoice → payment → document).** Highest business-criticality gap in the entire evidence base — a driving school's core daily function is currently the least-proven area of the platform. This should be the very next journey run.
2. **Instructor: create the missing `instructors` record, then the lesson-completion workflow.** Second priority — directly gates whether Scheduling can even be meaningfully tested (a lesson needs a real instructor to book against), and resolves whether DEF-005 (instructors-read permission gap) actually blocks anything or just degrades a dropdown.
3. **Student: booking/package/lesson-history sub-views.** Lower risk — the portal shell is already proven — but should follow immediately after step 1 so there's real booking/package data to verify the student actually sees it (this also starts Phase 3's cross-role consistency check for free).
4. **Public Visitor: one clean, fully successful demo submission.** Very low risk, ~5 minutes, closes out the one loose end in an otherwise-validated journey.
5. **Branch Manager: own login.** Low risk, quick, currently the only provisioned account never exercised at all.
6. **Guardian: hold.** Cannot proceed until DEF-002 is classified — don't spend validation time here until there's something to validate.

This ordering directly reflects Section 5's readiness scores: the lowest-scored areas with real business consequence (Scheduling, Finance, Documents, Instructor Management) are prioritized first; the areas already scoring well (Public Website, Student portal shell) are deliberately left for last, not because they don't matter, but because they carry the least remaining risk.
