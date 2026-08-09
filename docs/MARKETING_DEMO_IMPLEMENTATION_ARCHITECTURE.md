# TrafikskolaOS — Marketing Demo Implementation Architecture

## Document Control

| Field | Value |
|---|---|
| Document Title | Marketing Demo Implementation Architecture |
| Document Type | Controlled Implementation Architecture Specification |
| Status | Approved |
| Version | 1.0 |
| Document Owner | Product Governance Board |
| Approval Authority | Product Governance Board |
| Classification | Controlled Document |
| Effective Date | 2026-07-16 |
| Next Review | Prior to Version 2.0, or earlier if triggered by a change to any document it references |
| Supersedes | None — this is a new document |

**References (authoritative, not revisited here):** `docs/MARKETING_DEMO_ORGANIZATION_SPECIFICATION.md` (Controlled Document V1.0), `docs/LANDING_PAGE_SCREENSHOT_ASSET_STRATEGY.md`, `docs/LANDING_PAGE_SCREENSHOT_PRODUCTION_GUIDE.md`, `docs/LANDING_PAGE_FINAL_DESIGN_DIRECTION_V2.md`, and the Phase 0 Seed Architecture Review (delivered this program, not yet a standalone file). This document translates those into an executable architecture; it does not restate, question, or revise their content.

---

## 1. Purpose

This document is the implementation blueprint for building the official TrafikskolaOS Marketing Demo Organization. It exists to answer one question the governance documents above deliberately don't: *how, mechanically, does the approved specification become a running system?* Everything here is translation, not decision-making — every architectural choice recorded below was already made in a prior, approved document; this document's job is to sequence and structure that work so it can actually be executed.

## 2. Scope

**Included**: the technical architecture for provisioning the Marketing Demo Organization, the seed script strategy, the phased implementation roadmap, and the risk register governing that work.

**Excluded**: the content of what gets seeded (governed by the Specification, not restated here), screenshot composition rules (governed by Design Direction V2 and the Production Guide), infrastructure/hosting/credential decisions (explicitly outside the Specification's authority, and outside this document's authority for the same reason), and Pilot Environment readiness beyond the demo organization itself (a separate body of work with its own governance, referenced but not defined here).

---

## 3. Architectural Principles

- **Deterministic seed architecture** — every seed script targets its organization by an explicit, unambiguous identifier (slug or fixed UUID), never by "whichever organization is most recently active" or "any organization that exists." This principle exists directly because Phase 0 found three existing scripts that violate it, and traced a live data-integrity defect to that violation.
- **Idempotent seed scripts** — every script safe to re-run without duplicating or corrupting state (`ON CONFLICT DO NOTHING` or equivalent), matching the one pattern Phase 0 found consistently well-executed in the existing engineering seed chain.
- **Explicit organization targeting** — no script may seed data without first confirming, by name, which organization it is writing to.
- **Separation of Engineering Demo Data and Marketing Demo Data** — the two must never share an organization, a UUID namespace, or a seed script. This is the single most consequential principle in this document, given Phase 0's finding that blending them (even unintentionally, across independently-written scripts) is the most plausible explanation for the live-observed data inconsistency.
- **Governance-first implementation** — every implementation decision traces back to an already-approved governing document; this architecture introduces no new content decisions.
- **Temporal consistency** — every phase of implementation must preserve the Specification's Part 5 cross-module synchronization requirement, verified explicitly, not assumed.
- **Screenshot-first data quality** — data is seeded to the standard the Screenshot Design Standard (Specification Part 6) requires, not to a lower "good enough for testing" bar.

---

## 4. Target Architecture

```
Engineering Seeds
  (bootstrap_org_admin.sql → demo_data.sql → demo_full_data.sql → demo_sprint_1_10.sql
   — retained for engineering QA against the existing bootstrap org only)
        │
        │  (no data crosses this line — new, purpose-built scripts only, below)
        ▼
Marketing Demo Seeds
  (new scripts, deterministic org-targeting, built to the
   Marketing Demo Organization Specification)
        ▼
Approved Demo Organization
  (Lindholms Trafikskola — identity, people, business structure,
   demo data, per Specification Parts 1–4)
        ▼
Screenshot Library
  (16 entries, captured per the Production Guide, approved per the
   Specification's Lifecycle/Quality Checklist/Approval Rule)
        ▼
Public Website
  (approved screenshots wired into the already-built ScreenshotFrame
   components, per Design Direction V2's composition)
        ▼
Sales Assets  /  Training Assets
  (the same approved Screenshot Library, reused by reference —
   never a second, parallel dataset)
```

The load-bearing property of this diagram is the gap between the first two layers: Engineering Seeds and Marketing Demo Seeds do not merge, do not share identifiers, and do not share an organization. Everything below Marketing Demo Seeds draws from one single, traceable source.

---

## 5. Seed Architecture

| Script | Classification | Purpose | Status | Future Role |
|---|---|---|---|---|
| `bootstrap_org_admin.sql` | Bootstrap | Creates the first organization + owner in any environment | Active, canonical | Retained — template for the new Marketing Demo Seeds org-creation script |
| `bootstrap_platform_admin.sql` | Bootstrap | Creates the first platform superadmin | Active, canonical | Retained, unrelated to demo data |
| `demo_data.sql` | Engineering | Lesson types, 2 instructors, near-week slots for `trafikskolan` | Active | Retained for engineering QA only |
| `demo_full_data.sql` | Engineering | 12 students, 4 corporate customers, bookings, invoices | Active | Retained for engineering QA only |
| `demo_sprint_1_10.sql` | Engineering | Extends the above: +13 students, vehicles, materials, history, automation rules | Active | Retained for engineering QA only |
| `demo_continuity.sql` | Legacy | A second, disconnected student/instructor dataset for `trafikskolan` | Active but non-integrated with the Engineering chain above | Archive — do not use as a basis for Marketing Demo Seeds |
| `demo_schedule.sql` | Legacy | 4 instructors + slots, targets "most recently active org" | Active, non-deterministic targeting | Deprecate |
| `demo_schedule_slots.sql` | Legacy | Dense slot generation for `trafikskolan` | Active, deterministic org but layers on whichever instructors already exist | Deprecate |
| `seed_demo_slots_now.sql` | Legacy | Quick slot seed, targets "any active org" | Active, non-deterministic targeting | Deprecate |
| `seed_lesson_types.sql` | Legacy | Full lesson-type catalogue, targets "any org, `LIMIT 1`" | Active, most fragile targeting in the set | Deprecate |
| `quiz_questions.sql` | Shared Reference Data | Org-agnostic theory quiz bank | Active, safe | Retained — usable by any organization, including the new Marketing Demo Organization, without modification |

No script is deleted by this document. "Deprecate" and "Archive" are classification states, not actions — any change to a script's on-disk status is implementation work requiring its own authorization.

---

## 6. Implementation Strategy

Three options were evaluated in the Phase 0 Seed Architecture Review:

- **Option A** — transform the existing engineering bootstrap organization into the Marketing Demo Organization. **Rejected.** Disqualified on governance grounds (the Specification and its precursor documents explicitly rule this out) and, independently, on technical grounds — the organization's current data is the unreconciled product of at least two non-overlapping seed pools and several non-deterministically-targeted scripts, making its true contents neither fully known nor reliably reproducible.
- **Option B** — provision a new organization from scratch, with entirely new seed scripts. **Sound, but not optimal.** Fully governance-compliant and technically clean, but discards the genuinely good engineering discipline (idempotency, UUID namespacing, explicit prerequisites) already proven in the Engineering seed chain.
- **Option C** — provision a new organization while selectively reusing validated *patterns* (not data) from the Engineering chain. **Approved.**

**Option C is the approved implementation strategy.** It is the only option that satisfies governance compliance, data integrity, and long-term maintainability simultaneously: a clean, deterministic new organization, built with new scripts that follow the one proven structural template (`bootstrap_org_admin.sql`'s and `demo_data.sql`'s explicit-org-targeting, idempotent-insert pattern) while containing entirely new content matching the Specification. It rejects only what should be rejected — Tier 2's non-deterministic targeting and the Engineering chain's data — and keeps only what has already been shown to work.

---

## 7. Implementation Phases

### Phase 1 — Environment Validation
- **Objective**: determine whether the Students/Instructors data-integrity issue found in the live audit is a genuine platform defect or an artifact of the Engineering seed chain's Tier 2 scripts, before building anything new.
- **Inputs**: read access to the current hosted environment; the Phase 0 seed script inventory.
- **Outputs**: a documented root-cause finding.
- **Dependencies**: none.
- **Acceptance criteria**: root cause identified with enough confidence to proceed; if a genuine platform defect is found, it's documented and flagged for separate engineering resolution before Phase 3 begins.

### Phase 2 — Organization Provisioning
- **Objective**: create Lindholms Trafikskola per Specification Part 1.
- **Inputs**: Specification Part 1 (identity, branches, org/VAT number format); Phase 1's outcome.
- **Outputs**: a running, isolated organization with two locations and correct branding.
- **Dependencies**: Phase 1 complete.
- **Acceptance criteria**: org exists under its own deterministic slug; login works; "LT" badge and both locations render correctly.

### Phase 3 — Business Data Seeding
- **Objective**: seed the full Specification Part 3 people roster and Part 2 business structure.
- **Inputs**: Specification Parts 2–3; new, purpose-built seed scripts following the Section 6 template.
- **Outputs**: every named person and business-structure entity present and correctly linked.
- **Dependencies**: Phase 2 complete.
- **Acceptance criteria**: every person in Specification Part 3 visible in their module's list view; no data drawn from or entangled with the Engineering organization.

### Phase 4 — Transactional Data
- **Objective**: seed bookings, invoices/payments, report history, notifications, tasks, messages, certificates, and the one deliberate compliance alert, per Specification Part 4's volumes.
- **Inputs**: Specification Part 4 (volumes) and Part 5 (temporal consistency rule).
- **Outputs**: a fully populated, temporally consistent organization.
- **Dependencies**: Phase 3 complete.
- **Acceptance criteria**: the Specification's Part 5 worked example (Elin Karlsson traced across Dashboard, Scheduling, Finance, Student Portal, Guardian Portal, Reports, Communication, Audit Trail) verified manually and passes; the Screenshot Quality Checklist's date-consistency and no-duplication items pass.

### Phase 5 — Screenshot Production
- **Objective**: capture all 16 Screenshot Library entries per the Production Guide's crops, and move each through the Specification's Screenshot Lifecycle to Approved.
- **Inputs**: Production Guide's per-screen specs; Specification's Lightweight Approval Rule and Quality Checklist.
- **Outputs**: 16 approved, versioned, source-workspace-labeled screenshot assets.
- **Dependencies**: Phase 4 complete; platform-admin credentials and portal-token generation confirmed available for Library entries 12–16.
- **Acceptance criteria**: every in-scope entry reaches "Approved" with complete Screenshot ID / Platform Version / Specification Version / Source Workspace / Capture Date metadata.

### Phase 6 — Website Integration
- **Objective**: wire approved screenshots into the already-built `ScreenshotFrame` components per their assigned landing-page sections (Specification Part 8, Design Direction V2 composition).
- **Inputs**: Phase 5's approved assets.
- **Outputs**: a live public landing page with zero placeholder screenshots.
- **Dependencies**: Phase 5 complete.
- **Acceptance criteria**: every `ScreenshotFrame` on the public landing page renders a real, approved image; no change made to Design Direction V2's composition in the process.

### Phase 7 — Pilot Preparation
- **Objective**: not defined by this document. Named here only for completeness of the roadmap; its actual scope belongs to whichever document governs Pilot Readiness (referenced in project memory as a separate, already-tracked 9-item Action Plan), not the Marketing Demo Organization Specification.
- **Inputs / Outputs / Dependencies / Acceptance criteria**: out of scope — to be defined by that separate governance track when it's engaged.

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Phase 1 finds a genuine platform defect, not just a seed-script artifact | Medium | High — could block Phase 3 pending an engineering fix outside this program's scope | Phase 1 is sequenced first, specifically to surface this before any new data is built on top of an unverified assumption |
| Temporal/cross-module consistency (Phase 4) implemented incorrectly | Medium | High — silently violates the Specification's core requirement without being visually obvious | Mandatory manual verification of the Elin Karlsson trace before Phase 4 is considered complete, not left implicit |
| A deprecated Tier 2 script is accidentally re-run against the new organization | Low | High — non-deterministic targeting means this would seed silently, without error | Deprecated scripts should be clearly marked (a documentation change, not a code change) before Phase 2 begins |
| Platform-admin credentials or portal-token generation unavailable when Phase 5 reaches entries 12–16 | Medium | Medium — blocks a subset of the Screenshot Library, not the whole program | Confirm access before Phase 5 begins, not discovered mid-phase |
| Screenshot capture drifts from Design Direction V2's composition during Phase 6 | Low | Medium — would reopen an already-frozen decision | Phase 6 is scoped explicitly as substitution only, not recomposition |
| Engineering and Marketing seed data cross-contaminate in the future (e.g., a QA action run against the wrong org) | Low, if Section 3's separation principle holds | High — would reproduce exactly the defect this whole review chain exists to prevent | Deterministic, explicit org-targeting in every new script (Section 3) is the structural mitigation, not a process reminder alone |

---

## 9. Success Criteria

Implementation is complete when: Lindholms Trafikskola exists as a fully isolated organization, seeded entirely by new, deterministic, idempotent scripts with no data drawn from the Engineering organization; every person and data point in Specification Parts 2–4 is present and verified cross-module consistent per Part 5; all 16 Screenshot Library entries are captured, approved, and versioned; the public landing page shows zero placeholder screenshots; and no deprecated or non-deterministic seed script has been run against the new organization at any point in the process.

---

## 10. Implementation Governance

All future implementation work under this architecture shall reference, not duplicate:

- **Marketing Demo Organization Specification** — for what to seed (identity, people, data volumes, temporal rules, screenshot standard, library contents).
- **Landing Page Screenshot Production Guide** — for exact per-screen capture specs (crops, filters, layout) once data is seeded.
- **Landing Page Screenshot Asset Strategy** — for the original Hero screenshot spec and the composition/post-processing rules it established, still valid and carried forward.
- **Landing Page Final Design Direction V2** — for how captured screenshots are composed into the public landing page.

This document defines *sequence and structure only*. Any question about *what* to seed, *how* a screenshot should be composed, or *where* an asset appears on the page is answered by one of the four documents above, never by this one independently.

---

## Deliverable Summary

### 1. Executive Summary

This architecture translates four already-approved governance documents and the Phase 0 Seed Architecture Review into one executable blueprint. It resolves the one open architectural question (Option A vs. B vs. C) as Option C — a new, isolated Marketing Demo Organization built with disciplined, deterministic seed scripts that reuse the Engineering chain's proven patterns without touching its data — and sequences the resulting work into seven phases, six of which are fully defined and one (Pilot Preparation) explicitly deferred to its own governance track.

### 2. Architectural Overview

Engineering and Marketing demo data are permanently separated at the seed-script level, not just by convention. A new organization, seeded deterministically, feeds a Screenshot Library governed entirely by the existing Specification's lifecycle and quality rules, which in turn feeds the public website, sales, and training assets by reference — one source of truth, propagated outward, never duplicated.

### 3. Implementation Readiness Assessment

Architecturally ready. The strategy is decided, the phases are sequenced with explicit dependencies and acceptance criteria, and the risk register captures every material risk raised across this program's prior reviews. The one remaining unknown — whether Phase 1 surfaces a genuine platform defect — is deliberately sequenced first, precisely so it's known before any other work depends on the answer.

### 4. Confirmation

This document is ready to govern implementation activities.

**No implementation work has begun.** Waiting for explicit approval before Phase 1 begins.
