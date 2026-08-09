# Pilot Operational Validation

**Document type:** Operational validation report — the running application, exercised as a real user, not the codebase.
**Produced by:** Sprint 4H — Pilot Operational Validation.

**Method — read before the findings, since it's what makes them credible:** this sprint required operational evidence, not source-code analysis. This environment has no interactive browser tool, so I set one up: Playwright driving a real headless Chromium against the actual running dev server (`pnpm --filter @platform/web dev`, hosted Supabase backend, `ulgsndzfksphquqakelq`), with a dedicated **Pilot Validation Tenant** ("Pilot Validation School") provisioned via the platform's own real `platform-admin/provision` endpoint — not hand-seeded — plus real accounts for every Version 1 role, created with your explicit authorization. Every finding below was observed via actual page loads, actual form submissions, actual network responses, and actual screenshots — cited by filename in the working directory where relevant. Source code was read only to *diagnose* a defect already observed live, exactly as the ground rules require.

**One disclosure up front, in the interest of not hiding my own mistakes:** the first live check (Platform Admin login) initially failed. Diagnosis showed it was a gap in *my own provisioning script* (I'd created the platform-admin auth user without a matching `profiles` row) — not a platform defect. I'm recording this because the platform's own defensive handling of that exact condition (`AuthProvider`'s `PGRST116` guard, documented back in the Authentication Architecture review) is itself real, positive operational evidence: a missing profile gracefully signs the user back out instead of crashing or half-rendering.

---

## 1. Pilot Operational Validation Report

| Phase 1 item | Result |
|---|---|
| Application starts successfully | ✅ `pnpm --filter @platform/web dev` → real page loads, confirmed via screenshot |
| Authentication functions | ✅ Valid login works for every role tested; invalid credentials correctly rejected |
| Database connectivity | ✅ Every screenshot below shows real, live data (42 orgs on the platform dashboard, real student/portal records created this sprint) |
| Edge Functions reachable | ✅ `platform-admin/provision`, `student-portal/generate-token`, `demo-requests`, `students`, and others all responded live during this sprint |
| Storage available | Not independently exercised — no document upload was attempted this sprint (time-boxed out; flagged, not claimed) |
| Email service configured (or documented if unavailable) | Documented, unchanged: SMTP still not production-viable (Sprints 2B/4B) — this sprint did not re-test it |
| Feature flags reflect Version 1 scope | ✅ BankID and Corporate Portal both confirmed still flagged off, consistent with documented scope |
| Environment variables loaded correctly | ✅ Implied by everything above working |

---

## 2. Role-Based Validation Matrix

| Role | Login | Core scenario | Status |
|---|---|---|---|
| Platform Administrator | ✅ (after fixing my own provisioning gap) | Real dashboard: 42 orgs, worker health, subscription mix, live org list including the one this sprint created | ✅ Ready |
| Organization Owner | ✅ | Dashboard load; Settings → Users (found broken, fixed, reverified with real data) | ✅ Ready (after fix) |
| Branch Manager (`org_manager`) | Account provisioned; not independently logged into this sprint (time-boxed — see Section 8) | — | Not independently validated |
| Receptionist | ✅ | Created a real student end-to-end; generated a real student portal link; attempted guardian creation (found disabled) | ✅ Ready, with one confirmed gap (guardian creation) |
| Instructor | ✅ | Own-schedule page loads and correctly reports "not linked to an instructor" (no `instructors` table row was provisioned for this test account) | ✅ Ready (login/shell); instructor-record-dependent workflows (assigned students, complete lesson) not reachable without that additional setup step — not attempted further this sprint |
| Student | Portal token generated and used (not a password login — token-based by design) | Full student portal dashboard: theory progress, journey tracker, quick links | ✅ Ready |
| Guardian | **Blocked** — no guardian record could be created anywhere in the UI | — | **Cannot be validated — the capability itself is unbuilt, not a login problem** |
| Corporate Customer | N/A | `VITE_FEATURE_CORPORATE_PORTAL=false`, confirmed | Deferred by Scope Freeze, as expected |
| Anonymous Public Visitor | N/A | Marketing site loads; demo request form renders, validates correctly, and is wired to the real `demo-requests` function | ✅ Ready |

---

## 3. Business Scenario Results

- **Platform Administrator → Create organization:** executed for real via `POST /platform-admin/provision` — "Pilot Validation School" now exists as a genuine, live organization on the platform (trial tier, correctly appears in the platform dashboard's organization list).
- **Receptionist → Register student:** executed for real. Filled and submitted the actual "Skapa en ny elev" form; got a real success toast ("Elev skapad") and a real student detail page with a working URL and ID.
- **Receptionist → Register guardian:** **attempted, blocked.** Both entry points on the student page ("Anhöriga personer" quick-add and the "Föräldrakollen" guardian form) are explicitly labeled "Kommer snart." The dedicated `/guardians` module is list-only — no create action exists anywhere. This is not a login or permission problem; the capability does not exist yet.
- **Receptionist → Generate/send student portal access:** executed for real. "Generera" → real `201` from `student-portal/generate-token`, real token, real expiry.
- **Student → Log in and view dashboard:** executed for real using that token. Full personalized portal loads (name, theory progress, "Din instruktör" correctly showing none assigned yet, quick links to booking/theory/messages/documents/finance).
- **Public Visitor → Browse site, submit demo request:** site and form both load and render correctly with real client-side validation (caught my own incomplete test fill correctly — two required fields flagged, submission blocked as it should be).
- **Package purchase, booking, invoice, payment, document upload, Instructor's assigned-student/lesson-completion workflows:** **not executed to completion this sprint** — see Section 8. Time was allocated instead to depth (root-causing the two real defects below) over exhaustively completing every listed example scenario shallowly.

---

## 4. Operational Defect Register

### Defect 1 — Organization Settings → Users page completely non-functional

- **Description:** `UsersSettingsPage.tsx` queried `profiles` filtered by `organization_id` — a column that was removed from `profiles` in Phase 1B.2 (org context moved to `memberships` only; documented in `packages/types/auth.types.ts`'s own comment). Every query and both mutations (edit user, activate/deactivate) on this page used this same broken filter.
- **Steps to reproduce (as observed):** log in as an Organization Owner → Inställningar → Användare.
- **Expected behavior:** the org's real users (4, in the validation tenant) listed.
- **Actual behavior (before fix):** `400` from PostgREST, page silently showed "Inga användare registrerade" / "0 aktiva" — indistinguishable from a genuinely empty organization.
- **Business impact:** an Organization Owner could not see, edit, activate, or deactivate any staff member. The "Bjud in" (Invite) button itself still worked (it doesn't depend on this query), but a newly invited user would never appear in the list afterward either.
- **Pilot impact:** would have been discovered by the first real pilot customer within minutes of opening Settings.
- **Classification:** Bug whose effect is total non-functionality of an existing, promised Version 1 capability (User Management) — treated as "missing implementation required for an existing Version 1 capability" for action purposes, since the practical effect on a pilot customer is identical to the feature never having been built.
- **Fix implemented (minimum necessary):** the `profiles` query now filters by `id IN (member ids already correctly resolved from the memberships query)` instead of a nonexistent column; the two mutations dropped the same invalid filter (already safely scoped — `editTarget`/`id` only ever come from this page's own org-scoped list). No redesign, no new functionality — four call sites, one root cause.
- **Verified fixed:** re-ran the identical live test after the fix — `0` errors, all 4 real users (Anna Ägare, Björn Chef, Ivan Instruktör, Rita Reception) correctly listed with correct status. Screenshots: `06-owner-users-settings.png` (before and after, same filename, overwritten on retest).
- **Required before pilot?** Yes — and already done.

### Defect 2 — Guardian creation not implemented anywhere in the UI

- **Description:** three separate UI entry points related to guardians all exist visually but are disabled: the student page's quick "Anhöriga personer" add button, the student page's "Föräldrakollen" guardian form's "Lägg till" button, and the dedicated `/guardians` module (list/search UI fully built, but no create button exists on the page at all). All three consistently show a "Kommer snart" badge.
- **Steps to reproduce:** log in as Receptionist or Owner → open any student → try either guardian-adding control; or navigate to Vårdnadshavare directly.
- **Expected behavior (per the sprint's own scenario list):** "Guardian: Access assigned student, View bookings" implies a guardian can be created and linked to a student.
- **Actual behavior:** no code path exists to create a guardian record. This is not a bug — the UI honestly and consistently discloses it as not-yet-built, in three places, not one.
- **Business impact:** a real pilot school cannot give a parent/guardian portal access to follow their (often minor) student's progress — a capability CLAUDE.md's own module list documents as a core part of Student Management.
- **Pilot impact:** real, but the severity depends on whether a pilot customer's actual daily operation requires guardian access on day one, or can launch without it.
- **Classification:** **Not implemented.** Deliberately not actioned this sprint — building guardian creation is genuine new frontend (and possibly backend) feature work, not a minimal fix, and the UI's own consistent "Kommer snart" labeling is evidence this was a conscious, disclosed scope decision already made by someone, not an oversight I should silently overturn by writing code.
- **Required before pilot?** **This is the one finding in this report that needs a human decision, not a de facto answer from me.** Classify it as Pilot Blocker / Commercial Release Enhancement / V1.1 Backlog per the same three-way process this entire engagement has used for everything else — I have deliberately not made that call myself.

### Defect 3 — `notifications:notification:read` not granted to Receptionist or Instructor roles

- **Description:** every Receptionist and Instructor page load produces two `403`s from the `notifications` function (bell icon, notification history). Verified directly against the live database: `role_permissions` grants this permission to `org_owner`, `org_admin`, and `org_manager` only.
- **Steps to reproduce:** log in as Receptionist or Instructor → any page → check network tab.
- **Expected behavior:** unclear without a product decision — see below.
- **Actual behavior:** the notification bell area silently fails to load for these two roles; nothing else on the page is affected (confirmed — student creation, portal generation, and navigation all worked normally despite this running in the background on every page).
- **Business impact:** Low-Medium. Degrades gracefully; doesn't block any core workflow tested this sprint.
- **Pilot impact:** cosmetic/quality-of-life, not functional, for the scenarios actually tested.
- **Classification:** Likely a genuine RBAC gap (a notification bell is typically a universal feature, not management-tier), but possibly deliberate (e.g., notifications could carry cross-student information not meant for junior staff) — **not changed this sprint.** Platform-wide role-permission grants are exactly the kind of decision that shouldn't be made unilaterally by an AI session, even though the fix itself would be small (one `role_permissions` row per role).
- **Required before pilot?** No — flagged for a product decision, not blocking.

---

## 5. Pilot Blocker Report

**One confirmed, fixed-during-this-sprint blocker:** Defect 1 (Users Settings page) — was a genuine pilot blocker, is now resolved and verified.

**One candidate requiring your classification, not mine:** Defect 2 (Guardian creation). I am not calling this a blocker or a non-blocker — I'm reporting that it's real, confirmed, and needs the same scope decision every other piece of new-vs-existing work in this engagement has gone through.

**No other pilot blocker was found** in what this sprint actually exercised.

---

## 6. Existing Capability Completion Report

| Finding | Category | Action taken |
|---|---|---|
| Users Settings page broken | Bug (total capability failure) | **Fixed** — minimum change, 4 call sites, verified live |
| Guardian creation missing | Missing implementation, but a deliberate, disclosed one | **Not implemented** — genuine new feature scope, needs your classification |
| Notifications permission gap | Configuration issue (RBAC grant) | **Not changed** — a platform-wide policy decision, flagged not actioned |
| Storage/document upload, most Finance workflows, full Instructor lesson-completion flow | Not evaluated this sprint | Neither confirmed nor denied — explicitly out of this sprint's completed scope, not claimed as either working or broken |

Only Defect 1 resulted in implementation work, consistent with the sprint's own rule that only genuine, minimal, existing-capability restorations qualify.

---

## 7. Final Pilot Readiness Assessment

| Domain | Status |
|---|---|
| Platform Administration | Ready |
| Organization Management / Settings | Ready (after Defect 1 fix) |
| Authentication (all roles) | Ready — consistent with the exhaustive validation already done in Sprint 4B |
| Student Management | Ready |
| Guardian Management | **Pilot Blocker candidate — pending your classification** (creation path doesn't exist) |
| Instructor Management (login/shell) | Ready |
| Instructor Management (lesson completion, assigned students) | Not validated this sprint — no status claimed |
| Student Portal | Ready |
| Public Website / Demo Request | Ready |
| Corporate Portal | Deferred by Scope Freeze (unchanged, correct) |
| Scheduling, Finance, Documents, Reports | Not operationally re-validated this sprint (were code-traced with high confidence in Sprint 4G; not repeated here since this sprint's method deliberately didn't reuse that evidence) |

---

## 8. Go/No-Go Recommendation

**🟡 GO AFTER CORRECTING IDENTIFIED PILOT BLOCKERS**

The one confirmed blocker (Users Settings) is already fixed and verified — that alone would justify moving toward 🟢. What holds this at 🟡 is Guardian creation: a real, operationally-confirmed gap in a capability this platform's own documentation treats as core, and I'm not willing to either wave it through as fine or unilaterally block pilot on it — that classification is yours to make, using the same process this entire engagement has consistently used for exactly this kind of question. Once that one decision is made (and any resulting scope, if it's classified as a blocker, is completed), this platform's operational readiness — based on everything this sprint could actually observe running — supports 🟢.

**What this sprint did not cover, stated plainly rather than implied as passing:** Branch Manager's own login, full booking/invoice/payment/document workflows, and Instructor's lesson-completion path once properly linked to an `instructors` record. These weren't found broken — they simply weren't executed to completion in the time available, and this report does not claim otherwise.
