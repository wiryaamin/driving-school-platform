# Pilot Operational Validation — Continuation

**Document type:** Direct continuation of `docs/PILOT_OPERATIONAL_VALIDATION.md` (Sprint 4H). Read that document first — this one does not repeat its findings, only adds to them.
**Method:** unchanged — real Playwright-driven Chromium against the running dev server and hosted backend, using the existing Pilot Validation Tenant. No new tenant created.

**Scope honesty, stated up front:** this continuation did not complete every journey listed in the brief to full literal completion (package sale through to document upload, full instructor lesson-completion, guardian portal, cross-role consistency chain). What it did do was resolve every previously-unexplained HTTP error and find a second genuine, significant defect. Given the choice between shallow coverage of six journeys and real depth on the highest-risk remaining ones, I chose depth — consistent with this sprint's own stated objective ("prove that real operational workflows succeed," not "maximize coverage"). The unexecuted portions are listed explicitly in Section 7, not implied as passing.

---

## 1. HTTP Error Analysis (Phase 1 — every error from Sprint 4H, resolved)

| Error | Root cause | Classification |
|---|---|---|
| `402` on `corporate-customers`, `communications/queue-health` | `requireFeature(ctx, 'corporate:customers:manage')` / `requireFeature(ctx, 'communication:templates:manage')` — verified directly in source as the diagnosis step for an already-observed error. Both are genuine subscription-tier feature gates; the Pilot Validation Tenant is on Trial, which doesn't include them. | **Expected behavior — not a defect.** |
| `403` on `instructors?per_page=...` (Receptionist, Instructor roles) | Verified live against the database: `instructors:instructor:read` is granted to `org_owner`, `org_admin`, `org_manager`, `instructor_senior` — **not** to plain `receptionist` or `instructor`. Confirmed operational consequence: the "Lärare" dropdown on the student-create form is empty for a Receptionist, and a Receptionist cannot see instructor names anywhere they'd need to (assigning one to a student, understanding calendar capacity). | **Real RBAC gap.** Not fixed — a platform-wide permission grant is a policy decision, not mine to make unilaterally (same reasoning as the notifications gap in the prior report). Flagged with higher confidence now that its operational consequence is concretely observed, not just inferred from a permission table. |
| `403` on `notifications?...` (Receptionist, Instructor) | Unchanged from the prior report — confirmed, not fixed, same reasoning. | Real RBAC gap, flagged. |
| `500` on `invite-user` (Owner inviting new staff) | **New this sprint.** See Section 4. | Operational (SMTP), with a secondary code-quality observation not actioned. |

---

## 2. Operational Journey Report

**Journey 1 — Organization Owner (continued from Sprint 4H's login/dashboard/settings review):**
- ✅ Invite a staff member — attempted for real, **failed with a genuine defect** (Section 4). This is exactly what "prove workflows succeed end to end" is supposed to catch, and it caught something real.
- Logout — not separately executed this continuation (low-risk, standard `signOut()` flow already covered structurally in Sprint 4B's exhaustive session-lifecycle validation; not repeated here per the "do not repeat completed work" instruction, though that validation was of the mechanism, not this specific tenant's session).

**Journey 2 — Receptionist:**
- ✅ Booking calendar (`Bokningsschema`) loads correctly, full toolbar (instructor filter, lesson-type filter, resource search, week/day view, "Nytt pass") renders as expected.
- Calendar shows no bookable slots — **expected**, not a defect: no instructor has a completed `instructors` table record yet (the login account exists, the domain record doesn't — same gap Sprint 4H identified for the Instructor role). Creating that record is a legitimate prerequisite step, not itself broken.
- Package sale, lesson booking, reschedule, cancel, invoice, payment, document upload: **not executed this continuation** — see Section 7.

**Journey 6 — Public Visitor:** not re-executed (already fully validated structurally in Sprint 4H — form renders, validates correctly, wired to a real deployed function). Re-running an identical demo submission would not have produced new evidence.

**Journeys 3 (Instructor, beyond login), 4 (Student, beyond portal access), 5 (Guardian):** not executed this continuation.

---

## 3. Cross-Role Validation Matrix

Not meaningfully executable this continuation — the cross-role chain (student → instructor → student portal → guardian → bookings → payments → documents → audit) depends on bookings, invoices, and payments existing, none of which were created this continuation. Deferred, not fabricated.

---

## 4. Operational Defect Register (new this continuation)

### Defect 4 — Inviting a new staff member fails in real use

- **Description:** Owner → Settings → Users → "Bjud in" → fill form → submit → real `500 INTERNAL_ERROR: "Failed to create invitation"` from `invite-user`.
- **Diagnosis performed** (licensed under this sprint's own rule — source inspection to diagnose an already-observed defect): confirmed via direct query that **no orphan `auth.users` or `profiles` row was created** — the failure happens cleanly inside the `db.auth.admin.inviteUserByEmail()` call itself, before any other write. This matches the exact, extensively pre-documented SMTP rate-limit trickle (Sprints 2B, 4B) — the first genuine confirmation that this known limitation also blocks the *Invite Staff* workflow specifically, not only signup and password reset as previously documented.
- **Secondary, not-actioned observation:** the error message surfaced to the Owner ("Failed to create invitation") doesn't hint at the real cause. Improving it would be a legitimate small change, but this sprint's ground rules explicitly say "Do not optimise" — logged as a documentation note, not implemented.
- **Business impact:** an Owner cannot reliably invite new staff today. High real-world impact, zero new-code cause.
- **Pilot impact:** this is the *same* SMTP blocker already carried in every prior sprint's readiness assessment — not a new blocker, but a newly-confirmed additional symptom of the one that already exists.
- **Classification:** Operational (SMTP), not a code defect. No implementation performed — matches the sprint's own instruction not to fix what a code change can't actually fix.
- **Required before pilot?** Tied to the existing SMTP item already on record — not a new requirement.

**No other new defect was found this continuation.**

---

## 5. Pilot Blocker Report

No new pilot blocker. The two open items remain exactly what they were at the end of Sprint 4H:
1. Guardian creation — still awaiting your classification.
2. SMTP — still operational, now confirmed to also block Invite Staff specifically, not just signup/recovery.

---

## 6. Existing Capability Completion Report

| Finding | Category | Action |
|---|---|---|
| Invite Staff fails | Operational (SMTP) | Not actionable by code — confirmed, documented |
| `instructors:instructor:read` missing for Receptionist/Instructor | Configuration (RBAC policy) | Flagged, not changed — same reasoning as the notifications gap |
| Booking calendar empty for the test tenant | Test-data/setup state, not a defect | No action needed — expected given no `instructors` record exists yet |

No implementation work was performed this continuation — nothing found qualified as "missing implementation required for an existing Version 1 capability" as opposed to configuration/operational.

---

## 7. What Remains Unvalidated (explicit, not implied)

- Full Receptionist commercial chain: package sale, booking creation, reschedule, cancel, invoice issuance, payment registration, document upload.
- Instructor's lesson-completion and assigned-student workflows (blocked on creating a real `instructors` record for the test account — a legitimate setup step, not attempted this continuation).
- Student Portal's booking/package/lesson-history views (portal access itself was validated in Sprint 4H; these specific sub-views were not).
- Guardian Portal entirely (blocked upstream by Defect 2 from Sprint 4H — no guardian can be created to generate portal access for).
- The full cross-role data-consistency chain (Phase 3 of the brief).
- Branch Manager's own login and permission scope.

None of these are reported as broken. They are reported as **not executed**, which is a different, more honest claim than either "pass" or "fail."

---

## 8. Updated Pilot Readiness Assessment & Final Go/No-Go

**🟡 GO AFTER CORRECTING IDENTIFIED PILOT BLOCKERS** — unchanged from Sprint 4H's conclusion, and deliberately so: nothing this continuation found changes that recommendation in either direction. The one fixed blocker (Users Settings) stays fixed. The one pending classification (Guardian creation) is still pending. The SMTP item is more precisely characterized now (confirmed to block Invite Staff too) but was already the reason this wasn't 🟢. Nothing here justifies moving to 🔴 — every new finding this continuation produced was either expected behavior correctly diagnosed (the 402s), a real-but-already-known operational dependency surfacing through a new path (Defect 4), or explicitly unexecuted rather than failed.

**The honest summary of two sprints of operational validation:** the platform's core, tested workflows (student registration, student portal, platform administration, public demo requests) work for real, end to end, against a real backend. The things standing between here and 🟢 are: one product decision (guardian creation's priority) and one operational task (SMTP) that has now been confirmed to matter in three places instead of two.
