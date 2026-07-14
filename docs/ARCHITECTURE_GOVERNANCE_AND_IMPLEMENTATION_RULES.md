# Architecture Governance & Implementation Rules

**Document type:** Implementation contract — governs how future development relates to the five now-frozen architecture documents. Does not describe TrafikskolaOS's architecture itself; describes the rules for building against it.
**Status:** Approved and frozen, following a final Architecture Governance Review of all five baseline documents.
**Basis:** `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md`, `MASTER_ARCHITECTURE_OVERVIEW.md`, the Public Website Information Architecture, the Business Capability Audit, and `CUSTOMER_PROVISIONING_ONBOARDING_ARCHITECTURE.md` — reviewed together, not individually, for this document.
**Audience:** Developers, architects, and future AI assistants, before starting any implementation work.

This document does not modify, redesign, or reinterpret any of the five documents it governs. It establishes how they relate to each other and to future work.

---

## 1. Governance Review Findings

The five documents were reviewed together against the criteria requested for this review. Results below — including the items that needed a correction of interpretation, disclosed rather than silently resolved, consistent with this project's own governance standard (Enterprise Architecture Handbook, Section 4: "every governance report must disclose defects and deviations found along the way... silence is not an acceptable outcome of a governance review").

| Check | Result |
|---|---|
| Responsibilities clearly separated | **Confirmed.** Platform Administration and Tenant Workspace's boundary is stated identically across the Master Architecture Overview (Section 3, System Boundaries), the Business Capability Audit, and the Customer Provisioning & Tenant Onboarding Architecture (Sections 10, 12, 13). |
| Business ownership consistent | **Confirmed.** No document assigns a capability's ownership differently from another. |
| No conflicting architectural principles | **Confirmed.** The Enterprise Architecture Handbook's "canonical ownership" principle (surfaced in Master Architecture Overview, Section 10) and the Customer Provisioning document's "Single Source of Truth" governance (Section 25) state the same rule in different words, not two different rules. |
| No duplicated business capabilities | **Partially confirmed, with disclosure.** The Business Capability Audit itself already identified and documented two UI-level duplications (Orders surfaced at both `/orders` and `/finance/orders`; Subscription fields editable from both the Organizations and Subscriptions pages). These are known, disclosed, low-severity findings from the Audit — not new discoveries, and not contradictions between documents. See Section 3 of this document for how such findings should be handled going forward. |
| No contradictory terminology definitions | **Confirmed, after the terminology refinement already completed on the Customer Provisioning document.** One naming pattern was checked specifically: the Master Architecture Overview's system names ("SaaS Platform," "Customer Product") versus the Business Capability Audit's and Customer Provisioning document's names ("Platform Administration," "Tenant Workspace"). These are not competing definitions — Master Architecture Overview's own Section 14 (Current Implementation Status) already uses "Tenant Workspace" as a status-table label, and its Section 4 role table already uses "Platform Administrator." The two vocabularies operate at different altitudes (system name vs. the console/workspace within it), and the Master Architecture Overview already establishes both. |
| Platform Administration responsibilities clearly defined | **Confirmed.** Customer Provisioning document, Section 10. |
| Tenant Workspace responsibilities clearly defined | **Confirmed.** Customer Provisioning document, Section 12. |
| Customer Provisioning & Tenant Onboarding begins after Commercial Approval | **Confirmed.** Stated explicitly in the Customer Provisioning document, Section 22 (Scope). |
| Student Onboarding remains an independent Tenant Workspace capability | **Confirmed.** Stated explicitly and repeatedly across the Customer Provisioning document (Sections 3, 8, 12, 17, 23, 25, 26) following its own terminology refinement pass. |

**One correction of interpretation, disclosed here rather than silently applied.** The document hierarchy example provided for this governance review listed the Enterprise Architecture Handbook above the Master Architecture Overview. The Master Architecture Overview's own Section 11 ("Relationship Between Architecture Documents"), already approved and frozen, states the opposite order — Master Architecture Overview is explicitly "the single entry point," with the Enterprise Architecture Handbook beneath it as the technical backend/platform architecture. Section 2 of this document uses the Master Architecture Overview's own, already-frozen order. Reversing it would have created a genuine contradiction between two frozen documents; using it as given in the example would have been "introducing a new architectural concept" (a hierarchy not stated anywhere in the frozen baseline) — both outweighed by simply using what the baseline already, correctly, establishes.

**A second disclosure: the Public Website Information Architecture is not a standalone file.** The Master Architecture Overview's own Section 11 states this plainly — it is "currently maintained as sections within the Landing Page Strategy document... not yet a separate standalone file" (`LANDING_PAGE_STRATEGY_V4_FINAL_BLUEPRINT.md`). This governance review treats it as approved and frozen as a *body of content*, exactly as the Master Architecture Overview already does, not as a literal separate file. Section 3 of this document records the governing document accordingly. This is a documentation-organization fact, not an architectural inconsistency, and this review makes no recommendation to change it — extracting it into its own file, if ever done, would be a documentation-hygiene action, not an architecture change, and is noted here only so a future reader does not go looking for a file that does not exist.

**No other inconsistencies were found.** No recommendation is made to alter any of the five documents — this review found them internally consistent as a set.

---

## 2. Architecture Hierarchy

The governing order, as already established by the Master Architecture Overview's own Section 11 and preserved here without change:

```
Master Architecture Overview
        │   the single entry point — how everything fits together
        ▼
Enterprise Architecture Handbook          Architecture Governance &
        │   technical backend/platform    Implementation Rules (this
        │   architecture: database, RLS,  document) — process, not
        │   Edge Functions, RBAC,          architecture; sits beside
        │   observability, governance      the Handbook, governing
        ▼                                  business-domain change
Domain Architecture Documents             instead of technical change
        │   Public Website Information
        │   Architecture, Business
        │   Capability Audit, Customer
        │   Provisioning & Tenant
        │   Onboarding Architecture
        ▼
Implementation
```

**How to resolve a question when multiple documents are relevant:**

1. **Start with the Master Architecture Overview.** It answers "how does this fit into the whole system," and points to whichever document below it owns the specific detail.
2. **For a technical/backend question** (database, RLS, Edge Functions, RBAC, observability, release process) — the **Enterprise Architecture Handbook** is authoritative. Its own governance process (Handbook Section 4, the 9-stage Production Readiness process; Section 14, the ADR/ACR/Release Record trigger table) is unchanged by this document and continues to govern all technical/code-level change.
3. **For a business-domain question** (what does a capability do, who owns it, what is the customer lifecycle) — the relevant **Domain Architecture Document** is authoritative: the Public Website Information Architecture for the public site, the Business Capability Audit for platform-wide capability inventory, the Customer Provisioning & Tenant Onboarding Architecture for the provisioning/onboarding lifecycle.
4. **If two documents genuinely conflict** (not merely address different altitudes, as in the terminology check above) — do not resolve it by picking one. Stop and raise it, the same way this review discloses the hierarchy-example correction above rather than silently choosing a side.
5. **This document governs the *process* of changing the domain documents** (Section 4, below) — it does not supersede the Handbook's existing technical governance process, which continues to operate exactly as Handbook Sections 4 and 14 already define.

---

## 3. Single Source of Truth

Every business capability has exactly one architectural owner. No capability may be defined, redefined, or duplicated outside the document that owns it.

| Capability | Owner (system) | Governing document |
|---|---|---|
| Public Website | Public Website | Public Website Information Architecture (currently embedded within `LANDING_PAGE_STRATEGY_V4_FINAL_BLUEPRINT.md`, per Master Architecture Overview Section 11 — see disclosure in Section 1) |
| Platform Administration | SaaS Platform | Business Capability Audit; Customer Provisioning & Tenant Onboarding Architecture (Section 10) |
| Tenant Workspace | Customer Product | Business Capability Audit; Customer Provisioning & Tenant Onboarding Architecture (Section 12) |
| Student Onboarding | Tenant Workspace | Business Capability Audit; Customer Provisioning & Tenant Onboarding Architecture (Section 3, Section 23 — explicitly out of scope there, owned entirely by the Tenant Workspace's own existing enrollment pipeline) |
| Customer Provisioning | SaaS Platform (shared infrastructure executes it) | Customer Provisioning & Tenant Onboarding Architecture (Section 7) |
| Finance | Tenant Workspace | Enterprise Architecture Handbook (technical), Business Capability Audit (capability inventory) |
| Scheduling | Tenant Workspace | Enterprise Architecture Handbook (technical), Business Capability Audit (capability inventory) |
| Communication | Tenant Workspace | Enterprise Architecture Handbook (technical), Business Capability Audit (capability inventory) |
| Reporting | Tenant Workspace | Business Capability Audit (capability inventory) |
| Authentication | Shared infrastructure | Enterprise Architecture Handbook |
| Data Migration | Tenant Workspace | Business Capability Audit; Customer Provisioning & Tenant Onboarding Architecture (Section 25, "Data Migration owns imports") |

No capability listed above may be re-implemented, re-defined, or given a second home by any future work. Where a future feature appears to need something already listed here, it reuses the existing owner (Section 5, Implementation Rules) — it does not create a parallel version.

---

## 4. Architecture Change Process

Not every change requires the same process. Scale the review to the size of the decision.

| Change type | Required process |
|---|---|
| **Minor implementation decision** (a UI detail, a query shape, a variable name, a bug fix within an existing capability's existing design) | Implementation only. No document is updated. |
| **Business workflow change** (a step is added to an existing lifecycle, a responsibility shifts within an already-defined boundary) | Architecture review first — read the governing domain document (Section 3), confirm the change fits within it, get sign-off before implementing. |
| **New business capability** (something no existing document owns) | New architecture document first, modeled on the existing set's own discipline: a Business Capability Audit-style review of what already exists before proposing anything new, then a dedicated architecture document, then implementation. |
| **Major architectural change** (anything that would alter a responsibility boundary, a lifecycle stage, or a principle stated in one of the five frozen documents) | Full architecture review and explicit approval before implementation — the same standard this session's own three-pass review (audit → architecture → two refinement passes) already modeled. |

**Relationship to the Enterprise Architecture Handbook's own change process.** This table governs changes to the *business/domain* architecture (the five documents this file governs). It does not replace the Handbook's own, separate, already-established process for *technical* architecture change (Handbook Section 4's 9-stage Production Readiness process; Handbook Section 14's ADR/ACR/Release Record trigger table). A change that is both — a new business capability that also requires a new technical pattern — needs both processes, run together, not one substituting for the other.

---

## 5. Implementation Rules

Mandatory for all future development against this baseline:

- **Reuse existing capabilities before creating new ones.** Confirm the capability doesn't already exist (Section 3) before writing anything.
- **Never duplicate business functionality.** If two implementations would do the same job, one of them is wrong.
- **Respect bounded contexts.** Platform Administration and Tenant Workspace stay separate; Tenant Onboarding orchestrates, it does not absorb; Student Onboarding stays independent of Tenant Onboarding.
- **Follow approved terminology.** Use the vocabulary the governing document already uses (Customer Provisioning & Tenant Onboarding Architecture, Section 3, is the canonical example of what a precise terminology definition looks like).
- **Maintain tenant isolation.** Per the Enterprise Architecture Handbook — RLS is the authoritative isolation control, not a frontend check.
- **Maintain single source of truth.** Per Section 3 of this document.
- **Architecture before implementation.** For anything beyond a minor implementation decision (Section 4), the governing document is read and the change is confirmed to fit it before code is written.

---

## 6. Future AI Development Rules

Before implementing any feature:

1. **Identify the governing architecture document.** Use Section 2 (Architecture Hierarchy) to find it.
2. **Review existing capabilities.** Use Section 3 (Single Source of Truth) to confirm what already exists and who owns it.
3. **Reuse existing modules.** Do not write a new implementation of something Section 3 already assigns an owner.
4. **Avoid parallel implementations.** If the feature resembles something disclosed in Section 1's duplication finding, stop and ask whether it should extend the existing entry point instead of adding a third one.
5. **Never redesign approved architecture unless explicitly instructed.** The five documents this file governs are frozen. A request to build a feature is not, by itself, a request to change the architecture those documents define — treat them as fixed unless a future instruction says otherwise as explicitly as this session's own instructions did.

---

## 7. Architecture Compliance Checklist

Complete before every significant implementation:

- [ ] Does the feature already exist? (Section 3)
- [ ] Which architecture document governs it? (Section 2)
- [ ] Does it duplicate an existing capability? (Section 3, Section 1's disclosed duplications)
- [ ] Does it cross bounded contexts? (Platform Administration ↔ Tenant Workspace; Tenant Onboarding ↔ Student Onboarding)
- [ ] Does it introduce conflicting terminology? (Customer Provisioning & Tenant Onboarding Architecture, Section 3, is the reference standard for precise terminology)
- [ ] Does it preserve tenant isolation? (Enterprise Architecture Handbook)
- [ ] Does it respect the approved lifecycle? (Customer Provisioning & Tenant Onboarding Architecture, Section 16)

A feature that fails any checked item is not ready for implementation — it goes back to Section 4's Architecture Change Process at the level the failure indicates.

---

## 8. Closing Certification

This review examined the Enterprise Architecture Handbook, the Master Architecture Overview, the Public Website Information Architecture, the Business Capability Audit, and the Customer Provisioning & Tenant Onboarding Architecture together, as one baseline. One interpretation correction was disclosed (Section 1) and resolved using the baseline's own already-established hierarchy, not a new one. No architecture was changed. No new capability was introduced. No responsibility was redefined.

**The TrafikskolaOS Architecture Baseline is complete, internally consistent, and ready to govern implementation.**
