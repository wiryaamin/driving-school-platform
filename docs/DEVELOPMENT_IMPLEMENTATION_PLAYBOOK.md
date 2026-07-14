# Development & Implementation Playbook

**Document type:** Development methodology — the mandatory process for implementing anything against the frozen TrafikskolaOS architecture. This is not an architecture document: it defines *how* work gets done, never *what* the architecture is.
**Status:** Frozen. Final refinement complete — "Understand before changing" incorporated as a mandatory implementation principle (Sections 1, 2, 6, 10, 11) — following a final alignment review against all six architecture-baseline documents.
**Governs:** Every future implementation — bug fix, enhancement, or new capability — regardless of who or what performs it.
**Does not govern:** The architecture itself. Where this playbook and an architecture document could be read as conflicting, the architecture document wins, and the conflict is an error in this playbook to be corrected, not a license to reinterpret the architecture.
**Basis:** `MASTER_ARCHITECTURE_OVERVIEW.md`, `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md`, the Public Website Information Architecture, the Business Capability Audit, `CUSTOMER_PROVISIONING_ONBOARDING_ARCHITECTURE.md`, and `ARCHITECTURE_GOVERNANCE_AND_IMPLEMENTATION_RULES.md` — the six frozen documents this playbook implements against, not replaces.
**Audience:** Developers and AI assistants, before writing any code.

---

## 1. Development Philosophy

- **Understand before changing.** Before proposing new functionality, a new workflow, a new module, an architectural change, or an implementation change, the existing implementation must be reviewed and genuinely understood — not skimmed, not assumed. The objective is always to extend what already exists rather than to assume something is missing. This principle governs every other one below it: none of "reuse before create," "every capability has one owner," or "no duplicate functionality" is achievable by someone who has not first understood what is already there. Section 10 (Existing Implementation First) and Section 11 (Lessons Learned) state this principle in full as standing governance, not just as philosophy.
- **Architecture drives implementation, not the reverse.** A feature is scoped by what the governing document already says, not by what would be convenient to build.
- **Reuse before create.** The Architecture Governance document's Single Source of Truth (Section 3) is checked before any new code is written — not after.
- **Every capability has one owner.** If two places in the codebase could plausibly own a piece of logic, that is a defect to fix, not a pattern to extend.
- **No duplicate functionality.** The Business Capability Audit already found and disclosed two UI-level duplications (Orders, Subscription editing). New work does not add a third anywhere.
- **Business capabilities before UI.** A screen is built once its underlying capability and data model are understood to already exist (or to be explicitly, architecturally new) — not the other way around.
- **Automation before manual work.** Where an existing mechanism (an Edge Function, a SECURITY DEFINER function, an orchestration layer) can do something, it does it — a human clicking through steps a system could perform is a signal the implementation isn't finished, not an acceptable steady state.
- **Configuration before customization.** A tenant-specific need is met by configuring an existing capability (Settings, Finance configuration, Communication templates) before it is met by writing tenant-specific code.

---

## 2. Mandatory Pre-Implementation Review

Before implementing any feature, every developer or AI assistant must answer all six questions below. **Implementation must not begin until every answer is written down**, not merely considered.

1. **What business problem is being solved?** Stated in business terms, not technical ones.
2. **Which architecture document governs this feature?** Use the Architecture Hierarchy (Architecture Governance document, Section 2) to find it. If no document governs it, that is itself the answer: this is a New Business Capability (Section 4, below), not an ordinary feature.
3. **Which existing capability already solves part of the problem?** Check the Single Source of Truth table (Architecture Governance document, Section 3) and the Business Capability Audit's full inventory before assuming nothing exists.
4. **Is this implementation extending an existing capability?** If yes, the extension happens inside that capability's owning module — it does not spawn a second, parallel implementation beside it.
5. **Does this introduce duplication?** Specifically check against the two duplications the Business Capability Audit already disclosed (Orders, Subscription editing) — a third instance of the same pattern is a specific, named risk, not a hypothetical one.
6. **Does this cross bounded contexts?** Platform Administration and Tenant Workspace stay separate (Architecture Governance document, Section 5). Tenant Onboarding orchestrates Tenant Workspace modules but never becomes one (Customer Provisioning document, Section 26). Student Onboarding stays independent of Tenant Onboarding (Customer Provisioning document, Sections 3, 23).

**Beyond the six questions, the review must explicitly document four things in writing before implementation begins:**

- **What currently exists.** The actual capability, module, or code path — named specifically, not gestured at.
- **How the current implementation works.** Read closely enough to describe it accurately, not just to confirm it's present.
- **Which existing capabilities already solve part of the problem.** Not just whether something exists, but how much of the actual requirement it already covers.
- **Which capabilities are genuinely missing.** Stated only after the first three are answered — a gap claimed before the existing implementation is understood is not a genuine gap, it is an assumption.

**Implementation must never begin based on assumptions.** If any of the four items above cannot be written down with confidence, the review is not finished — more of the existing implementation needs to be read, not less.

---

## 3. Implementation Workflow

```
Business Requirement
        │
        ▼
Architecture Review           — Section 2's six questions, answered
        │
        ▼
Capability Audit               — confirm against the Single Source of
        │                         Truth (Architecture Governance, §3)
        ▼
Implementation Plan            — what will be built, what will be reused,
        │                         explicitly distinguishing the two
        ▼
Implementation
        │
        ▼
Verification                   — TypeScript, lint, and (Section 5) the
        │                         rest of the Definition of Done
        ▼
Architecture Compliance Review — the checklist in Section 7 of the
        │                         Architecture Governance document
        ▼
Merge
```

No step is skipped because a change looks small. Section 4 (Feature Classification) determines how *much* rigor each step needs, not whether the step happens at all — a one-line bug fix still passes through Verification; it simply doesn't require a new Implementation Plan document to do so.

---

## 4. Feature Classification

Every future request is classified as exactly one of the following before work begins. The required approval process for each reuses the Architecture Change Process already defined in the Architecture Governance document (Section 4) rather than inventing a second one.

| Classification | Definition | Required approval process |
|---|---|---|
| **Bug Fix** | Existing behavior doesn't match its own governing document or its own evident intent | Implementation only (Architecture Governance §4, "Minor implementation decision") — Section 2's questions are still answered, but briefly |
| **Enhancement** | A small improvement fully inside an existing capability's already-defined scope | Implementation only, unless it touches a business workflow (next row) |
| **Existing Capability Extension** | A new step, field, or behavior added to a capability, extending its scope | Architecture review first (Architecture Governance §4, "Business workflow change") — read the governing document, confirm the extension fits within it |
| **New Business Capability** | Something no existing document owns (Section 3, Architecture Governance document) | New architecture document first (Architecture Governance §4) — this playbook does not authorize skipping that step; it only governs what happens once such a document exists |
| **Technical Refactoring** | No business behavior changes; internal structure does | Governed by the Enterprise Architecture Handbook's own process (Handbook §4, §5, §14) — an ACR if it touches a frozen technical principle, routine extension otherwise |
| **Architecture Change** | Alters a responsibility boundary, a lifecycle stage, or a principle stated in any of the six frozen documents | Full architecture review and explicit approval before implementation (Architecture Governance §4, "Major architectural change") — never performed as a side effect of an unrelated implementation task |

If a request doesn't obviously fit one row, it is treated as the *more rigorous* of the two closest rows until someone with architecture authority says otherwise — never the less rigorous one, by default.

---

## 5. Definition of Done

Every completed feature must satisfy all of the following before merge:

- **Architecture compliant** — passes the Architecture Compliance Checklist (Architecture Governance document, Section 7).
- **TypeScript clean** — `pnpm typecheck` shows 0 errors across all packages (Enterprise Architecture Handbook, Section 8).
- **Lint clean** — 0 ESLint errors; warnings at the already-established baseline only, never a new warning introduced (Enterprise Architecture Handbook, Section 8).
- **Tests passing** — where automated tests exist. The Enterprise Architecture Handbook already discloses that no automated E2E suite exists yet (Handbook, Section 8) — this is a known, disclosed limitation, not something this playbook papers over. Until one exists, "tests passing" means: manual, in-browser verification of the actual feature (per `CLAUDE.md`'s own standing instruction for UI changes), documented as part of Verification (Section 3, above).
- **Security reviewed** — tenant isolation preserved via RLS as the authoritative control, not a frontend-only check (Enterprise Architecture Handbook).
- **Accessibility reviewed** — checked against the existing design/interaction standards (`DESIGN_LANGUAGE_SPECIFICATION.md`, `UI_LAYOUT_CONTRACTS.md`) rather than an ad hoc judgment call.
- **Documentation updated** — only where the Enterprise Architecture Handbook's own trigger table (Section 14) says an update is required; not every change needs one, but every change that meets one of those triggers gets one.
- **No duplicated functionality** — re-confirmed at completion, not only at the start (Section 2, question 5).
- **Existing capabilities reused** — the Implementation Plan's own "what was reused" list (Section 3) matches what actually shipped.

A feature that fails any item above is not done, regardless of how much of it works.

---

## 6. AI Development Rules

Before proposing any implementation, an AI assistant must, in order:

1. **Review the governing architecture.** Identify it via the Architecture Hierarchy (Architecture Governance document, Section 2) before reading any code.
2. **Review the existing implementation.** Read the actual current code of the capability being touched or extended — not just the architecture document's description of it.
3. **Explain its understanding of the existing implementation.** In writing, before proposing anything — what it found, and how it currently works. An understanding that is never stated cannot be checked, and an unchecked understanding is indistinguishable from an assumption.
4. **Identify existing reusable capabilities.** Components, shared UI primitives, hooks, Edge Functions, shared libraries (`_shared/*`, `packages/*`), and database structures (tables, columns, enums, RLS policies) that already do part of the job.
5. **Identify genuine capability gaps.** Named specifically, and only after step 4 — a gap identified before the existing implementation is reviewed is not a genuine gap.
6. **Explain why existing functionality cannot simply be extended**, for every gap claimed in step 5. "It doesn't currently do X" is not sufficient on its own — the explanation must address why extending the existing capability is not the answer.
7. **Avoid creating parallel implementations.** If steps 4–6 turn up something close but not exact, the default action is to extend it, not to build beside it.
8. **Only then propose implementation.** State which document governs the work, what is being reused, and what (if anything) is genuinely new — before the first line of code, not in a retrospective summary after the fact.

**The AI must never redesign existing functionality simply because it has not yet been discovered.** A capability that was missed during review is a review failure to correct, not a license to design a replacement. This is the same rule Section 10 (Existing Implementation First) states as standing governance — these rules are how it is actually carried out during implementation.

These rules are not a suggestion of good practice — they are the same discipline the Business Capability Audit, the Customer Provisioning & Tenant Onboarding Architecture, and the Architecture Governance document were themselves built with, applied now to implementation instead of architecture.

---

## 7. Code Review Rules

Every implementation review — whether performed by a human or an AI assistant — must verify:

- **Architecture compliance** — the Architecture Compliance Checklist (Architecture Governance document, Section 7) was actually completed, not assumed.
- **Business capability ownership** — the change respects the Single Source of Truth (Architecture Governance document, Section 3); nothing was written into a capability it doesn't own.
- **Naming consistency** — terminology matches the governing document's own vocabulary (the Customer Provisioning & Tenant Onboarding Architecture's Section 3 remains the reference standard for what precise terminology looks like).
- **Tenant isolation** — RLS policies exist and are correct for any new table or query path.
- **Security** — no new capability weakens an existing isolation, authentication, or authorization guarantee without an ACR (Enterprise Architecture Handbook, Section 5).
- **Performance** — no N+1 query pattern, no unnecessary sequential async chain, consistent with the Operational-First UX principle already established for this platform.
- **Reuse of existing modules** — the Implementation Plan's reuse claims (Section 3, above) are verified against the actual diff, not taken on faith.
- **Documentation** — updated exactly where the Enterprise Architecture Handbook's trigger table (Section 14) requires it, no more and no less.

A review that skips any item above is incomplete, regardless of how much of the code itself was read.

---

## 8. Future Development Principles

- **Prefer extending over replacing.** A capability that almost fits is a candidate for extension (Section 4, "Existing Capability Extension"), not a reason to write a fresh alternative.
- **Never redesign approved architecture during implementation.** A request to build a feature is not, by itself, permission to change the architecture that feature lives inside — if the two seem to conflict, that is an Architecture Change (Section 4), handled as its own, separate process.
- **Preserve bounded contexts.** The boundaries this playbook inherits from the architecture — Platform Administration / Tenant Workspace, Tenant Onboarding / Student Onboarding, Platform Commercial / Tenant Commercial, Platform Billing / Tenant Billing — are load-bearing, not incidental.
- **Keep Platform Administration independent from Tenant Workspace.** Per the Master Architecture Overview's own System Boundaries (Section 3) and every subsequent document built on top of it.
- **Keep Customer Provisioning independent from Student Onboarding.** These remain two of the five distinct business processes the Customer Provisioning & Tenant Onboarding Architecture (Section 3) defines precisely, for exactly this reason.
- **Keep business workflows separate from operational workflows.** A lifecycle stage (Commercial, Provisioning, Onboarding) is not the same kind of thing as a day-to-day operational action (booking a lesson, sending an invoice) — the former is orchestrated once; the latter runs forever. Conflating the two is how an orchestration layer starts absorbing an operational module, which Section 26 of the Customer Provisioning document already forbids.

---

## 9. Final Certification

This playbook was reviewed against all six frozen architecture documents together. Every rule above cites the specific document and section it derives from — none was invented independently of the baseline.

**One item identified during this review that must not be resolved by modifying architecture:** the Definition of Done's "Tests passing" requirement (Section 5) sits against a real, already-disclosed gap — no automated E2E suite exists yet (Enterprise Architecture Handbook, Section 8). This playbook does not soften the requirement or invent a testing architecture to satisfy it; it defines the current, honest interim standard (manual verification) and leaves the actual gap exactly where the Handbook already disclosed it. **Building an automated E2E testing capability, if it happens, is a technical-architecture decision belonging to the Enterprise Architecture Handbook's own governance process (Handbook Sections 4, 14) — not something this playbook is authorized to decide, and not something it attempts to decide here.**

No other recommendation in this playbook requires modifying an approved architecture document. Everything above operationalizes what the six frozen documents already established.

**The TrafikskolaOS Architecture Baseline is now complete. Future work should focus on implementation governed by the approved architecture rather than further architectural design.**

---

## 10. Existing Implementation First

**The approved architecture defines what should exist. The implementation defines what already exists.** These are two different questions, and this playbook's entire discipline (Sections 1, 2, 6) depends on never confusing them — an architecture document can describe a capability precisely and correctly while the actual code either fully delivers it, partially delivers it, or hasn't caught up to it yet. Only reading the implementation itself answers which of the three is true.

**Before proposing any new implementation, the existing implementation must always be reviewed.** Not the architecture document's summary of it — the actual code, the actual migration, the actual module. Section 2's four required documentation items (what exists, how it works, what's already solved, what's genuinely missing) are how this review is carried out and verified, not an alternative to it.

**If existing functionality already satisfies the business requirement, it must be reused or extended.** This is not a preference — it is the same rule Section 1's "Reuse before create" and Section 6's AI Development Rules already state, restated here as a standing governance section so it cannot be read as one philosophy bullet point among several, easily deprioritized under time pressure.

**Parallel implementations are prohibited unless an Architecture Review explicitly approves them.** "I didn't find the existing implementation" is not the same thing as "an Architecture Review approved building a second one" — the first is a review failure (Section 2), the second is the only route by which a parallel implementation is ever legitimate, and it requires the same process Section 4 already defines for an Architecture Change or New Business Capability, not a unilateral decision made mid-implementation.

---

## 11. Lessons Learned

This principle was not written speculatively. Across the architectural reviews that produced TrafikskolaOS's frozen baseline, several already-mature capabilities were discovered only when the existing platform was actually reviewed in detail — not assumed, inferred from a module's name, or guessed at from a feature request's framing. In more than one case, what first looked like a missing capability turned out, on closer reading, to already exist, fully or substantially, inside a module that simply hadn't been checked yet.

These discoveries were not failures of the architecture — they were exactly what a genuine review is supposed to find, and finding them before implementation began is what kept the baseline free of duplicated, competing, or redundant capabilities.

They reinforce one implementation principle worth stating plainly, as the closing word of this playbook: **understanding the existing platform is always the first step in designing its future.** Every section of this playbook — the Mandatory Pre-Implementation Review, the AI Development Rules, Existing Implementation First — exists to make that first step mandatory rather than optional, for every future piece of work, regardless of how confident anyone is that they already know what's there.
