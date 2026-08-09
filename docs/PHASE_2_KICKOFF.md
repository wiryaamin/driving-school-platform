# Phase 2 Development Kickoff

**Document type:** Strategic planning record — the formal transition from Platform Foundation to Business Domain development.
**Produced by:** Sprint 5 — Phase 2 Development Kickoff.
**Relationship to existing documents (read this first — this document does not repeat their content):**

| Document | Owns |
|---|---|
| `docs/VERSION_1.1_ROADMAP.md` | The actual product roadmap (Section 4), governance model (Sections 5–7), and versioning strategy — written 2026-07-09, its Section 9 recommendation was superseded by the 2026-07-14 Pilot Readiness Assessment. **This document lifts that supersession** (see Phase 3) and reactivates Sections 4–8 of that roadmap as the live plan, under the name "Phase 2" rather than "Version 1.1" (same content, this engagement's terminology) |
| `docs/PLATFORM_FOUNDATION_CLOSURE.md` | The frozen foundation baseline (Sprint 4C) |
| `docs/PHASE_2_HANDOVER.md` | Repository/release/operational readiness (Sprint 4D) — its Risk Register is carried forward unchanged into this sprint's gap analysis |
| `docs/AUTHENTICATION_ARCHITECTURE.md`, `docs/EMAIL_ARCHITECTURE.md` | Auth/email architecture, now part of the frozen foundation this document builds on top of |

No new functionality is proposed anywhere below that isn't already in `VERSION_1.1_ROADMAP.md` Section 4, per this sprint's explicit instruction.

---

## Phase 1 — Confirm Foundation Freeze

The Platform Foundation (Sprint 4C) remains frozen. Explicit boundaries:

**Permanently frozen** (an ACR is required to touch these, per `VERSION_1.1_ROADMAP.md` Section 5 and `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` Section 5):
- Tenant isolation model (`organization_id` + RLS as the authoritative control)
- Authentication/session architecture (`AuthProvider` → `useSessionStore`, the one-session-model principle from `AUTHENTICATION_ARCHITECTURE.md`)
- Authorization model (JWT-claims-based RBAC, `get_user_jwt_claims()`, `requirePerm()`)
- Finance/accounting immutability model (append-only ledger, BAS 2020, VAT, SIE4, reversal-based correction)
- Canonical error schema (`{code, message, trace_id, request_id, details?, version}`)
- Two-email-system separation (GoTrue vs. `comm-providers.ts`)

**May evolve without special process** (routine extension — new PR, ordinary review):
- New business-domain modules, tables (with proper RLS), Edge Functions, and migrations that follow the existing patterns
- Frontend modules, components, and routes within the established `apps/web/src/modules/*` structure
- Shared library additions **only once a second real caller needs the logic** (the rule this engagement itself exercised twice — `edgeFunctionRetry.ts` being the most recent example)

**Requires architectural approval before modification** (ADR or ACR, per the Handbook's governance table):
- Any new cross-cutting pattern (e.g., "how do we do push notifications platform-wide")
- Any change to a Handbook Section 5 constraint or an existing ADR's decision

This boundary set is not new — it is `VERSION_1.1_ROADMAP.md` Section 5's decision table, reconfirmed still valid and now explicitly the standing rule for Phase 2.

---

## Phase 2 — Business Domain Inventory

Grounded in `VERSION_1.1_ROADMAP.md` Section 2's baseline (6 operational portals, 55 Edge Functions, 210+ migrations) and project memory's Epic/Phase completion record, cross-checked this sprint against actual current module presence (not assumed from documentation alone — `docs/PILOT.md`'s "Known Pilot-Phase Limitations" table was found stale during this check, see note below).

| Domain | Status | Completion | Notes |
|---|---|---|---|
| Student Management | ✅ Built | High | `modules/students` — Epics 2.1–2.8 per memory; CRUD, guardians, timeline, search all live |
| Instructor Management | ✅ Built | High | `modules/instructors` |
| Scheduling | ✅ Built | High | `modules/scheduling` — Epics 4.1–4.5 (booking, calendar, rescheduling, waitlist) per memory |
| Bookings | ✅ Built | High | Within `modules/scheduling` (`bookings` Edge Function live) |
| Vehicles | ✅ Built | Medium-High | Lives inside `modules/resources` (not a standalone module — a naming mismatch against the sprint brief's list, not a gap; Epic 3.5 vehicle maintenance/inspections per memory) |
| Lesson Packages | ✅ Built | High | `modules/packages` — Epic 5.1 per memory |
| Finance (core) | ✅ Built | High | `modules/finance` — ledger, VAT, SIE4, AGI, double-entry per `VERSION_1.1_ROADMAP.md` baseline; **frozen**, not open for Phase 2 modification without an ACR |
| Invoices | ✅ Built | High | Within `modules/finance` |
| Payments | ✅ Built | High | Within `modules/finance`; Stripe webhook live, Klarna/Swish not yet (tracked in the roadmap, not a gap in what exists) |
| Reporting | ✅ Built | Medium | `modules/reports` — `PermissionGate` coverage flagged as 0/11 pages in the existing tech-debt register (Section 3 below carries this forward, not a new finding) |
| Communication | ✅ Built | Medium-High | `modules/communication` — multi-channel dispatch live; automation triggers for `reservation.expired`/`credit.expired` are log-only (already tracked, not new) |
| Corporate Customers | ✅ Built | Medium | `modules/corporate` — `PermissionGate` coverage flagged as 0/4 pages (already tracked) |
| Student Portal | ✅ Built | High | `modules/student-portal` — token-based, separate from main app auth; **`docs/PILOT.md` currently lists this as "Separate app not yet built" — that line is stale and should be corrected or the document retired** |
| Teacher (Instructor) Portal | ✅ Built | High | `modules/instructor-portal` + `modules/instructor-app` (two distinct surfaces exist) |
| Organization Settings | ✅ Built | High | `modules/settings` — now including the completed Authentication Recovery Module's user-invitation UI (Sprint 4) |
| Platform Administration | ✅ Built | High | `modules/platform` — provisioning, admin invitation, seat entitlements all live |

**Dependencies across domains:** Finance depends on Scheduling/Packages (lesson completion drives billing); Reporting depends on all operational domains having real data flowing through them; Communication is a shared substrate every other domain calls into, not a dependency chain of its own.

**Known risks, carried forward (not newly discovered this sprint):** `PermissionGate` frontend gaps in Corporate/Reports/Data Migration (RLS backstop confirmed present in the sampled case, not audited platform-wide); Category C observability cleanup (21 functions with commingled correlation plumbing) still open.

**Priority** is addressed directly in Phase 4's roadmap below — it is already prioritized in the source document and not re-derived here.

---

## Phase 3 — Gap Analysis (Pilot Readiness)

This is the section that determines whether Phase 2 can actually begin. Reconciling three independent sources:

1. **The original 9-item Pilot Readiness Action Plan** (Action 0 + Actions 1–8, per project memory) — **confirmed complete via git history**, not assumed: `588fc83` (Action 4, `ok()` fix), `a09b4fc` (Action 5, personnummer hash), `91b6af6` (Action 6, dunning dispatch), `2f8c95e`/`b528d21` (Action 7/7A, deployment safety), `bc95625` (Action 8, Sentry), followed by two closing commits — `87df28c` ("close Final Pilot Blocker Remediation Sprint findings") and `bf00c69` ("remediate final 2 Critical defects from Go-Live Certification"). All of this predates this session and is already committed.

2. **This session's own findings** (Sprints 4A/4B) — the Authentication Recovery Module gap (password reset and invitation acceptance had no working frontend at all) was a genuine, retroactively-classified Pilot Blocker by the freeze's own definition ("genuinely required before the first pilot customer"). **Now built, reviewed, and validated** — closed.

3. **`VERSION_1.1_ROADMAP.md` Section 3's "Immediate" technical debt** (the two-item gate on starting Version 1.1/Phase 2): the `ok()` defect is resolved (item 1, confirmed above). **The `main` branch ancestry / PR-2 merge item is not resolved** — independently reconfirmed this sprint: current branch (`release/pr-2-error-schema-standardization`) is 0 commits ahead of `main`, 27 behind, with 73 uncommitted files (`docs/PHASE_2_HANDOVER.md`, Sprint 4D).

| Finding | Severity | Business Impact | Recommended Sprint | Est. Complexity |
|---|---|---|---|---|
| Branch/`main` reconciliation unresolved | **High** | Repository traceability risk compounds with every Phase 2 epic that branches from the same unreconciled base — the exact risk `VERSION_1.1_ROADMAP.md` flagged and that has now sat open since 2026-07-09 | **Wave 1, first item** — before or alongside the first Phase 2 feature branch, not necessarily before Phase 2 planning itself | Small–Medium (human git decision + execution, not a code change) |
| SMTP not production-viable | High | Password recovery/invitation email unusable at real volume | Operational (Sprint 4D Risk Register) — parallel to Phase 2, not blocking it | Small (human time), pending DNS propagation |
| No database backups / PITR disabled | **Critical** (operational) | Unrecoverable data loss risk for 42 real organizations, independent of any Phase 2 work | Operational — highest urgency of anything in this entire report, immediate | Small (Dashboard/billing action) |
| No disaster recovery documentation | High (operational) | Compounds the backup gap | Operational, alongside the above | Small–Medium |
| `PermissionGate` coverage gaps (Corporate/Reports/Data Migration) | Medium | RLS backstop present where sampled; not audited platform-wide | Wave 2 or 3 — bundle with whichever roadmap domain touches each area | Medium |
| Category C observability cleanup (21 functions) | Medium | No functional risk; git-attribution/traceability only | Wave 1 or 2 | Medium |

**No Critical software defect blocks Phase 2.** The one Critical item found (backups) is operational, not software, per this sprint's own instruction not to conflate the two — but it is flagged here with the same urgency it was given in `PHASE_2_HANDOVER.md`, because a gap doesn't stop being urgent for being correctly categorized.

---

## Phase 4 — Roadmap

This is `VERSION_1.1_ROADMAP.md` Section 4's domain table and recommended implementation order, **reactivated under the name "Phase 2"** — not re-derived, per this sprint's explicit "do not invent functionality" instruction. Reproduced here for a single point of reference; see the source document for the full per-domain candidate-item detail.

**Wave 1 — Pilot Blockers / Immediate**
- Branch/`main` reconciliation (Phase 3, above) — process, not product, but gates a clean starting line
- Category C observability cleanup + remaining canonical-error-schema coverage (closes out PR-2 properly before new feature surface makes it harder to isolate)

**Wave 2 — Operational Improvements / High-Leverage Domain Work**
- Instructor Experience: assessment recording + direct messaging (highest leverage, contained blast radius, builds on existing portal infrastructure)
- Student Experience: push notifications across the three token-based portals (shared infrastructure, high visible value)
- `PermissionGate` coverage completion (Corporate/Reports/Data Migration) — bundle with whichever domain work touches each area

**Wave 3 — Commercial Features**
- Finance: Stripe/Klarna/Swish at checkout (extends payment collection only — the accounting core stays frozen)
- Reporting & Analytics: lead funnel + BI reporting (additive, low architectural risk)
- Core Platform: multi-branch location-filtered reporting
- Administration: tenant impersonation UI + feature flags (sequenced after the above so the impersonation audit model has more real activity to be tested against)

**Wave 4 — Scale & Optimization / Integrations**
- Integrations: Transport Agency API, Fortnox sync deepening, Person Lookup live provider, Visma/Google Calendar/Microsoft 365
- AI Capabilities: schedule optimization, broader mobile app integration — exploratory, no fixed sequencing, revisit once real usage data exists

This is the same 10-step order the source document already specified; the wave grouping above is this sprint's mapping of that existing sequence onto the brief's requested wave structure, not a re-prioritization.

---

## Phase 5 — Sprint Plan

Each Wave 1–2 item, structured per this sprint's requested format. Wave 3–4 items are deliberately left at roadmap granularity (Phase 4) rather than sprint-planned yet — per `VERSION_1.1_ROADMAP.md`'s own "Planning is mandatory but lightweight" model (Section 6), sprint-level detail is produced when a wave is about to start, not three waves in advance.

**Sprint: Branch Reconciliation**
- *Objective:* Resolve the `main`/release-branch divergence before Phase 2 feature branches accumulate on top of it.
- *Scope:* Commit the 73 outstanding files in logical groups; reconcile `release/pr-2-error-schema-standardization` with `main`.
- *Dependencies:* None — can start immediately.
- *Acceptance criteria:* `git rev-list --left-right --count main...HEAD` shows a clean, understood relationship (either merged, or explicitly 0 behind); no uncommitted foundation work remains.
- *Expected deliverable:* A reconciled `main`, ready to branch Phase 2 work from.
- *Risk:* Low-Medium — mechanical, but touches a large, unreviewed diff spanning ~8 sprints of unrelated work; recommend chunked commits, not one giant merge.

**Sprint: Category C Observability Cleanup**
- *Objective:* Finish the canonical error schema / correlation-ID rollout to the remaining functions.
- *Scope:* 21 Category C functions (commingled plumbing) + 10 functions with no coverage yet.
- *Dependencies:* Branch reconciliation (cleaner to do this on a settled base).
- *Acceptance criteria:* All Edge Functions emit the canonical `{code, message, trace_id, request_id, version}` shape; `git add -p` used to separate hunks per file, not bulk-committed.
- *Expected deliverable:* Full observability coverage across all ~55 functions.
- *Risk:* Low functional risk; Medium effort (per-file review).

**Sprint: Instructor Experience — Assessment Recording + Direct Messaging**
- *Objective:* Close the loop the Instructor Portal currently only reads from.
- *Scope:* Assessment recording directly in the portal; direct instructor-to-student messaging (reuses `communication` module's existing dispatch layer).
- *Dependencies:* None beyond the frozen foundation.
- *Acceptance criteria:* An instructor can record a lesson assessment and message a student without leaving the portal; RLS confirmed on any new table.
- *Expected deliverable:* Shipped, live-verified feature; a Release Record per `VERSION_1.1_ROADMAP.md` Section 5.
- *Risk:* Low — contained to one portal, existing patterns.

**Sprint: Student Portal Push Notifications**
- *Objective:* Shared push-notification infrastructure across Student Portal, Instructor App, Guardian Portal.
- *Scope:* One infrastructure build, three consumers — sequence together per the source roadmap's own note.
- *Dependencies:* None beyond the frozen foundation; benefits from Category C cleanup being done first if it touches Edge Functions.
- *Acceptance criteria:* A real notification (e.g. booking reminder) reaches a real device in all three portals.
- *Expected deliverable:* Shipped feature, Release Record.
- *Risk:* Medium — new infrastructure (push provider integration), not just a UI extension.

---

## Phase 6 — Development Governance

Reactivating `VERSION_1.1_ROADMAP.md` Sections 5–7 in full as the mandatory Phase 2 engineering rules — not restated in different words here, referenced as binding:

- **Architecture Freeze rules:** Section 5's decision table (ADR for new patterns, ACR for touching a frozen principle, nothing for routine extension).
- **Shared package usage:** extract to `shared/lib/` or `_shared/` only once a second real caller needs the logic — proven twice in this engagement, not a theoretical rule.
- **Migration strategy:** append-only, `YYYYMMDDHHMMSS_description.sql`, never edit a historical migration.
- **Database rules:** every domain table gets `organization_id NOT NULL` and RLS; soft deletes (`deleted_at`) over hard deletes.
- **Edge Function rules:** `buildEdgeContext()` → `requirePerm()` → Zod validation → mutation → `recordIdentityEvent()` where identity is touched; canonical error schema from the first commit for any new function (P-021).
- **Testing expectations:** `pnpm typecheck`/`pnpm lint` at 0 errors is a hard gate; live/manual verification for behavior changes; automated E2E remains a long-term investment, not yet a hard gate (Section 3 of the source roadmap).
- **Documentation requirements:** Handbook update only when Section 5's table says so; a Release Record at domain-completion granularity, not per-PR.
- **Definition of Done:** Planning → Implementation → Validation → (Testing) → PR → Merge → (Release) → (Documentation), per Section 6's 9-step Engineering Workflow — steps 2, 8, 9 conditional as that section specifies.
- **Code Review expectations:** standard PR review is sufficient for routine feature work; PR-2's 9-stage ceremony is reserved for cross-cutting/architecturally-sensitive work only.
- **Pilot acceptance rules:** the three-way classification (Pilot Blocker / Commercial Enhancement / V1.1 Backlog) from the Scope Freeze memory no longer gates *starting* Phase 2 work (the freeze's condition is satisfied, Phase 3 above), but remains the right discipline for anything that shows up unplanned during Phase 2 — classify before implementing, same as this entire engagement already practiced.

---

## Phase 7 — Executive Summary

**Current maturity:** Production-operational. The Platform Foundation — authentication, authorization, session management, tenant isolation, and now a complete password-recovery/invitation lifecycle — is built, reviewed twice, validated twice, and frozen. All 16 business domains named in this sprint's brief already exist as working modules, most with substantial Epic-level completion history predating this engagement.

**Remaining work:** No software gap blocks Phase 2. What remains is (a) an unreconciled repository/branch state that should close early in Phase 2, not before it, and (b) a set of operational dependencies — most urgently, database backups — that are entirely outside this engagement's tooling and require Dashboard/billing access.

**Pilot readiness:** The original 9-item Action Plan is complete (git-verified). This session's Authentication Recovery Module closed the one genuine pilot blocker discovered along the way. Pilot readiness today is gated by operations (SMTP, backups, DR documentation), not software.

**Commercial readiness:** Not yet — Wave 3 (Stripe/Klarna/Swish, BI reporting, multi-branch, tenant impersonation) is the commercial-readiness wave, not yet started, correctly sequenced after Wave 1–2 per the existing roadmap.

**Recommended next sprint:** *Branch Reconciliation* (Phase 5, first item) — small, mechanical, and the one item every subsequent Phase 2 epic would otherwise inherit as compounding risk.

**Overall confidence level:** High. This isn't an optimistic read — it's the same conclusion three independent sources converge on: the git history (Action Plan commits), this session's own validation work (Sprints 4A/4B/4C/4D), and the pre-existing roadmap document's own technical debt register, none of which had to be reinterpreted or stretched to reach it.

---

## Final Recommendation

**🟡 Phase 2 Ready with Operational Follow-up**

Not 🔴 — no software work remains that would justify reopening the Platform Foundation or delaying Business Domain work; every source consulted this sprint (git history, this engagement's own validations, the pre-existing roadmap's debt register) agrees on this independently. Not 🟢 — an unreconciled repository state and, more urgently, a live data-loss risk (no backups) are real enough that "clean and ready" would overstate where things actually are. Phase 2 development should begin now, following `VERSION_1.1_ROADMAP.md` Section 4's roadmap and Section 6's lightweight engineering workflow; the branch reconciliation should be the literal first Phase 2 sprint, and the backup gap should be raised with whoever holds Operations authority independent of and in parallel to any Phase 2 work, not queued behind it.
