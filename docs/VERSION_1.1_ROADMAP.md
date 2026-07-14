# TrafikskolaOS — Version 1.0 → 1.1 Project Transition & Product Roadmap

**Document Type:** Strategic Roadmap (supersedes the Production-Readiness governance cadence as the primary planning reference going forward)
**Status:** Proposed for approval (2026-07-09) for its architecture summary and Section 4 backlog content. **Section 9's "Final Recommendation" (READY TO BEGIN VERSION 1.1) is superseded as of 2026-07-14** by the Version 1.0 Pilot Readiness Assessment, which found the platform not yet ready for a pilot — see `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` Section 5, "Version 1.0 Scope Freeze — Pilot Governance." Version 1.1 feature work has not begun; this document's Section 4 remains the valid backlog for after the pilot concludes.
**Date:** 2026-07-09
**Companion documents:** `docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` (architecture/governance reference, unchanged by this document), `BASELINE_v1.md` (product/technical baseline), `CLAUDE.md` (day-to-day conventions)

---

## 1. Executive Summary

**Version 1.0 accomplishments.** The platform now has a complete, deployed, multi-tenant SaaS architecture: 6 operational portals, 2 public surfaces, 55 Edge Functions, 210+ migrations, full Swedish accounting compliance (BAS 2020, VAT, SIE4, AGI, double-entry ledger), and — as of Production Readiness PR-2 — a standardized observability layer (correlation IDs, canonical error schema) across the entire commercial and finance Edge Function surface.

**Production Readiness outcomes.** PR-1 (implicit in the `BASELINE_v1.md` baseline-freeze effort) and PR-2 (this session's full scope: correlation infrastructure, canonical error helper, 28-function rollout) are both complete. A 9-stage governance process was designed, validated, and documented (Handbook Section 4). The PR-2 release branch is published to `origin`, live-verified against the hosted deployment, and pending only a merge decision.

**Current platform maturity.** Production-operational, not pre-production. The platform is usable end-to-end for a real driving school today. What remains is incremental: closing known technical debt, extending observability coverage, and building the next layer of product capability — not foundational architecture work.

**Remaining technical debt.** Nine items, none rated above Medium risk, all already disclosed and owned (Handbook Section 12; restated with effort/priority in Section 3 below). None block feature development from starting.

**Readiness for feature development.** The architecture is stable, documented, and governed. The heavyweight, multi-stage governance process built for PR-2 was correct for that kind of cross-cutting, high-sensitivity (finance/observability) change — but it is disproportionate for routine feature work. Section 5 of this document defines a lighter governance model sized to ordinary product development, so Version 1.1 does not inherit PR-2's ceremony by default.

---

## 2. Version 1.0 Baseline

| Dimension | State at Version 1.0 |
|---|---|
| **Architecture** | React 19 + Vite frontend; Supabase (PostgreSQL + RLS + Deno Edge Functions) backend; JWT-first authorization; RLS as the authoritative tenant-isolation control. Frozen per Handbook Section 5 — extensions permitted, changes require an ACR. |
| **Infrastructure** | Hosted Supabase project (`ulgsndzfksphquqakelq`), no local Docker stack; pnpm + Turborepo monorepo; `pg_cron`-triggered background workers. |
| **Repository** | `main` at `675c857`; PR-2's release branch (`release/pr-2-error-schema-standardization`) published to `origin`, unmerged; a documented ancestry finding (Handbook Section 10) means `main` itself is *behind* the actually-deployed backend by one large baseline-freeze commit — this should be resolved (Section 3, Immediate) before Version 1.1 work accumulates further on top of the same gap. |
| **Deployment** | All 55 Edge Functions live on the hosted project; 210+ migrations applied; PR-2's 28 functions + 1 migration confirmed byte-identical between committed source and deployed source. |
| **Governance** | 9-stage Production Readiness process (Handbook Section 4) validated end-to-end across PR-2. Proportionate for cross-cutting/high-sensitivity work; too heavy for routine feature work (addressed in Section 5 below). |
| **Documentation** | `BASELINE_v1.md` (product/technical snapshot), the Enterprise Architecture & Governance Handbook (living reference, ADR catalogue, constraints), `CLAUDE.md` (day-to-day conventions) — all cross-referenced and internally consistent as of this document. |
| **Release Management** | Branch/commit/tag/PR/rollback standards defined and validated (Handbook Section 6). |
| **Observability** | Correlation IDs (ADR-001) and canonical error schema (ADR-003) live across all 28 Category D (commercial + finance) functions; 10 functions intentionally outside this coverage by scope, 21 functions ("Category C") carrying partial, commingled correlation plumbing pending cleanup. |
| **Error Schema** | `{code, message, trace_id, request_id, details?, version}`, single canonical constructor (`_shared/errors.ts`), mandatory for all new Category D functions going forward (P-021). |
| **Shared Libraries** | 5 Deno shared modules (`context.ts`, `supabase.ts`, `errors.ts`, `logger.ts`, `cors.ts`) + 8 pnpm packages, fully inventoried (Handbook Section 11). |

---

## 3. Remaining Technical Debt

### Immediate (before or alongside the start of Version 1.1 work)

| Item | Priority | Risk | Est. Effort | Dependencies |
|---|---|---|---|---|
| **Undefined `ok()` helper** — 31 call sites in `compliance/index.ts` throw `ReferenceError` if hit | High | Medium (live defect, not yet triggered in production traffic as far as verified) | Small (< 1 day) — define `ok()` as an alias for the existing `json()`/`buildSuccessResponse()` pattern | None |
| **`main` branch ancestry gap** — `main` predates the `3ab1ff6` baseline-freeze commit that introduced part of the currently-deployed backend; PR-2 had to branch from `ui/modernization-v2` instead | High | Medium (repository traceability risk compounds with every subsequent epic that repeats the same workaround) | Small–Medium (fast-forward or merge `main` up to the actual deployed baseline) | Should happen before or immediately alongside merging the PR-2 release branch |
| **Merge PR-2's release branch** — currently published but unmerged | High | Low (functionally already live; risk is organizational/traceability, not runtime) | Small — merge decision + execution | Resolving the `main` ancestry gap first is strongly recommended so the merge target is correct |

### Medium-term (early in the Version 1.1 cycle)

| Item | Priority | Risk | Est. Effort | Dependencies |
|---|---|---|---|---|
| **Category C — 21 functions with commingled correlation plumbing** | Medium | Medium (no functional risk; git-history attribution risk) | Medium (hunk-level `git add -p` separation across 21 files, per-file review) | Handbook Section 6/12; best done as its own small governed effort, not folded into unrelated feature work |
| **Extend canonical error schema to the 10 remaining functions** (`auth-hook`, `event-worker`, `guardian-portal`, `health`, `instructor-portal`, `invoices`, `public-booking`, `public-catalog`, `public-enrollment`, `switch-tenant`) | Low–Medium | Low | Medium | None blocking; natural to bundle with Category C cleanup |
| **Documentation improvements** — resolve the unlocated ADR-002 content; keep the Handbook's Section 10 (Production Readiness History) and Section 12 (Technical Debt) current as Version 1.1 epics close | Medium | Low (governance-record quality, not functional) | Small, ongoing | None |
| **Operational improvements** — regenerate stale `database.types.ts` (~38 `as unknown as any` casts); document frontend hosting/deployment (currently a Handbook gap) | Low–Medium | Low | Small | None |
| **Per-tenant Person Lookup Framework provider configuration** — `ADR-008`'s `getPersonLookupProvider()` registry is env-driven (one provider for the whole deployment); a tenant selecting/crediting its own SPAR account requires per-tenant credential storage that does not exist yet | Low (not blocking — Version 1.0 ships Mock-only by design) | Low | Small–Medium (config storage + admin UI) | The first live provider integration (see Section 4, Integrations) |

### Pilot Readiness Assessment reclassifications (2026-07-14)

The Version 1.0 Pilot Readiness Assessment surfaced additional findings beyond this register's PR-2-era scope. Critical/High items are tracked as the Pilot Readiness Action Plan (`ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` Section 5, Scope Freeze subsection) and are **not** repeated here. The following Medium/Low findings were classified as out of Version 1.0 scope, per that same section's classification rule:

| Item | Classification | Risk | Est. Effort | Notes |
|---|---|---|---|---|
| Frontend `PermissionGate` absent in Corporate (0/4 pages), Reports (0/11), Data Migration (0/2), and several Settings pages | Commercial Release Enhancement | Medium | Medium | RLS/Edge Function backstop verified present in the sampled `organizations` case; not audited platform-wide. Not pilot-blocking at small scale, but should close before wider rollout |
| Communication automation triggers stubbed (`reservation.expired`, `credit.expired` notification dispatch — log-only) | Commercial Release Enhancement | Medium | Small–Medium | Manual send works today; automated triggers are a commercial-scale expectation |
| Error-schema/logging coverage undercounted — 6 more non-compliant functions found (including `stripe-webhook`) beyond the 10-function list above; ~46 raw `console.*` calls remain outside the shared structured logger | Version 1.1 Backlog | Medium | Medium | Extends the already-tracked Category C / 10-function cleanup above rather than replacing it |
| 2 production build chunks exceed 500kB uncompressed | Commercial Release Enhancement | Medium | Small–Medium | Mobile/slow-connection first-load latency risk |
| Success-response envelope (`buildSuccessResponse()`) never standardized even in ADR-003-compliant functions — some return an unwrapped payload instead of `{data: ...}` | Version 1.1 Backlog | Low–Medium | Medium | API-contract consistency issue, no confirmed user-facing defect |
| 4 Edge Functions (`bankid-auth`, `identity-events`, `demo-requests`, `tenant-onboarding`) and ~9 frontend modules (public marketing site, `staff`, `guardians`, `documents`) have no corresponding ADR or Handbook inventory entry | Commercial Release Enhancement | Medium | Medium | Most significant for `bankid-auth` given its security sensitivity; substantially resolves once Action 1 (Repository Baseline Stabilization) lands these in reviewed commits |
| No frontend-visible mobile-responsive coverage audit — 131 of 227 route files use responsive Tailwind prefixes | Version 1.1 Backlog | Low | Medium | Desktop-first B2B tool; likely weak spot is dense finance/admin tables |

### Long-term (as capacity allows, not blocking)

| Item | Priority | Risk | Est. Effort | Dependencies |
|---|---|---|---|---|
| **Automated E2E test suite** | Medium | Medium (currently relying on TypeScript + lint + manual/live verification only) | Large | None blocking, but increasingly valuable as Version 1.1 feature surface grows |
| **SMS provider live delivery** — framework implemented, provider credentials/testing pending per tenant | Low | Low | Small per tenant | Customer/business decision on provider, not an engineering blocker |

---

## 4. Product Roadmap — Version 1.1

Grounded in the future-enhancement items already identified across `CLAUDE.md`'s long-term roadmap and `BASELINE_v1.md`'s per-portal "Future enhancements" sections — this is a consolidation and prioritization of already-scoped ideas, not a new speculative list (consistent with the platform's anti-overengineering guardrails: no giant mega-prompts, no uncontrolled scope expansion).

| Domain | Candidate items (source) | Notes |
|---|---|---|
| **Core Platform** | Multi-branch location-filtered reporting across all modules; regenerate `database.types.ts` | Foundational for schools with >1 location; several other roadmap items (staff, resources) already assume single-location today |
| **Driving School Operations** | Exam readiness panels, driving test result recording; digital attendance tracking; vehicle & fleet management | Natural extension of the existing scheduling/instructor domains |
| **Student Experience** | Theory quiz / knowledge test integration (Student Portal); push notifications (Student Portal, Instructor App, Guardian Portal); e-signature for contracts | High visible-value, moderate effort; push notifications share infrastructure across three portals — worth sequencing together |
| **Instructor Experience** | Student assessment recording directly in Instructor Portal; direct messaging to students; absence/time-off request submission; instructor performance analytics/leaderboard; swipe-based attendance marking; offline capability (Instructor App) | Assessment recording and direct messaging are the highest-leverage items — they close a loop the portals currently only read from |
| **Finance & Accounting** | Stripe / Klarna / Swish integration at checkout (Public Catalog, Student Portal); guardian payment initiation | The finance/accounting *core* (ledger, VAT, SIE4, AGI) is complete and stable per Version 1.0 — this domain's Version 1.1 work is payment-method breadth, not accounting-model change, and must respect the immutability/ACR constraints in Handbook Section 5 |
| **Reporting & Analytics** | Lead conversion funnel analytics; cohort/class learning analytics; business intelligence reporting (retention, instructor ROI, revenue by lesson type) | Reporting infrastructure exists (BAS accounting reports, SIE4 exports, booking statistics) — this is additive dashboard/aggregation work, low architectural risk |
| **Integrations** | Swedish Transport Agency (Transportstyrelsen) API integration; Fortnox sync deepening (sync tables already exist); vehicle & fleet management; first live Person Lookup Framework provider (SPAR), including per-tenant credential configuration; Visma bookkeeping export (Accounting category); Google Calendar and Microsoft 365 sync (Scheduling category) | Transport Agency integration is the most externally-dependent item — should be scoped early to surface any API-access blockers. The Person Lookup Framework (`ADR-008`) is architecturally ready for a live provider — Version 1.0 ships Mock-only by explicit design; a live integration needs its own HTTP client, per-tenant credentials, and a regulatory review of the provider's terms of use before implementation. Visma, Google Calendar, and Microsoft 365 already have a defined landing zone in the External Services Hub (`ADR-009`, `/settings/external-services`) as `coming_soon` cards — each needs its own backend (OAuth/API client, sync tables, Edge Function routes) and per-tenant credential storage before its card can show a real `connected`/`not_connected` status |
| **Administration** | Feature flag management per subscription tier (Platform Admin); tenant impersonation UI (with audit); global announcement broadcasting; multi-branch management | Tenant impersonation must be designed against the existing `is_impersonating()` guard already present at the DB level (Handbook Section 11) — the guard is pre-activated, the UI is not yet built |
| **Communication** | SMS & WhatsApp notification channels (framework exists, provider credentials pending); automated reminders & billing | Extends the existing multi-channel communication layer rather than replacing it |
| **AI Capabilities** | AI-based schedule optimization; mobile app integration (broader than the existing Instructor App) | Highest uncertainty/effort items — treat as exploratory spikes, not committed roadmap items, until scoped |

**Recommended implementation order** (sequenced for compounding value and increasing risk):
1. **Immediate technical debt** (Section 3) — `ok()` fix, `main` ancestry resolution, PR-2 merge. Not product work, but blocks a clean Version 1.1 starting line.
2. **Category C cleanup + remaining observability coverage** — closes out the PR-2 program properly before new feature surface makes it harder to isolate.
3. **Instructor Experience: assessment recording + direct messaging** — highest leverage, contained blast radius, builds on existing portal infrastructure.
4. **Student Experience: push notifications across the three token-based portals** — shared infrastructure, high visible value.
5. **Finance: Stripe/Klarna/Swish at checkout** — respects the frozen accounting core, extends payment collection only.
6. **Reporting & Analytics: lead funnel + BI reporting** — additive, low architectural risk, high operational value (matches the platform's stated success metric of operational usability).
7. **Core Platform: multi-branch reporting** — do this before Administration's multi-branch management UI, since reporting needs the underlying filtering plumbing first.
8. **Administration: tenant impersonation UI + feature flags** — deliberately sequenced after the above so the impersonation audit model has more of the platform's activity surface to be tested against.
9. **Integrations: Transport Agency API** — externally dependent, scope early but implement once the team has bandwidth to handle an external-API relationship.
10. **AI Capabilities** — exploratory, no fixed sequencing; revisit after the above land and real usage data exists to justify AI-based scheduling optimization specifically (avoids speculative architecture per the platform's own guardrails).

---

## 5. Architecture Governance Going Forward

| Trigger | Required Artifact |
|---|---|
| A new architectural decision, pattern, or shared component | **ADR** — add to Handbook Section 3. Applies to genuinely new decisions only (e.g. "how do we do push notifications platform-wide"), not routine use of existing patterns. |
| A change to a frozen principle (Handbook Section 5 constraint, an existing ADR's decision, the isolation/auth/immutability model) | **Architecture Change Request (ACR)** — required before implementation, not after. |
| Any feature or fix within existing architectural principles (a new Edge Function, a new table with proper RLS, a new module, a new migration) | **No ACR, no ADR** — this is routine extension. Ordinary PR review is sufficient. |
| A epic-scale body of work completes (e.g. a full roadmap domain from Section 4) | **Release Record** — a structured summary (scope, validation, deployment, outcome), lighter-weight than PR-2's per-package closure reports. |
| A completed epic materially changes the function/library inventory or introduces new technical debt | **Handbook update** (Sections 10–12) — routine, low-ceremony edit, not a new Version History row unless the change is significant enough to warrant one. |
| Routine bug fixes, small UI changes, dependency bumps | **Nothing beyond normal commit/PR practice** — no Release Record, no Handbook update. |

**Simplifying governance for normal feature work.** PR-2's 9-stage process (Readiness Review → Implementation → Closure → Epic Closure → Repository Certification → Release Execution Plan → Local RC Certification → Pre-Publish Review → Publication) was built for a cross-cutting change touching 28 functions including the entire finance/compliance surface — proportionate rigor for that risk profile. For a normal Version 1.1 feature (e.g. "add push notifications to the Student Portal"), the equivalent process is the 5-step Engineering Workflow in Section 6 below: Planning → Implementation → Validation → PR → Merge, with a Release Record only at domain-completion granularity, not per feature.

**When a full governance review is still required**: any change touching Handbook Section 5's constraint list (tenant isolation, auth model, finance immutability, canonical error schema, RLS-as-primary-control) — regardless of how small it looks. Size of code change is not the trigger; proximity to a frozen principle is.

---

## 6. Engineering Workflow

Standard workflow for Version 1.1 feature development:

1. **Planning** *(mandatory)* — state the objective, exact scope, and explicit non-goals, per Handbook Section 9's guidance. For anything from Section 4's roadmap, this can be a short paragraph, not a formal readiness review.
2. **Architecture Review** *(conditional — only if the change touches Section 5's constraints or introduces a new pattern)* — otherwise skip; routine feature work does not need one.
3. **Implementation** *(mandatory)* — follow existing module/Edge-Function structure (Handbook Section 9); new Category D functions use the canonical error schema and correlation propagation from their first commit (P-021, P-022).
4. **Validation** *(mandatory)* — `pnpm typecheck` and `pnpm lint` at 0 errors, per Handbook Section 8. For finance-adjacent work, verify RPC parameter-identity explicitly per Handbook Section 9's guidance.
5. **Testing** *(mandatory for behavior changes; encouraged proportional to risk otherwise)* — live/manual verification for backend changes touching real workflows; browser verification for UI changes per this platform's standing UI-testing practice. Automated E2E remains a long-term investment (Section 3), not yet a hard gate.
6. **Pull Request** *(mandatory)* — standard PR description (what changed, why, how it was validated); does not need PR-2's full 8-section structure unless the change is epic-scale.
7. **Merge** *(mandatory, explicit)* — never automatic; a human (or explicitly authorized AI action) approves the merge.
8. **Release** *(mandatory at domain-completion granularity, optional per-PR)* — see Section 7 for cadence.
9. **Documentation** *(conditional)* — Handbook update only if Section 5's decision table (above) says so; otherwise no documentation step is required beyond the PR description itself.

---

## 7. Versioning Strategy

- **Version numbering**: semver-style (`v1.1.0`, `v1.2.0`, ...). Increment the **minor** version when a roadmap domain (Section 4) substantially completes; increment the **patch** version for hotfixes; reserve **major** version increments for changes that would require an ACR against Handbook Section 5 (there is no currently planned reason to increment past 1.x).
- **Release cadence**: no fixed calendar cadence is recommended — release when a roadmap domain (or a meaningful slice of one) is validated and ready, consistent with the platform's "incremental, measurable, operationally validated" implementation discipline (`CLAUDE.md`).
- **Hotfix process**: branch from the current production tag, fix, validate (Section 6 steps 3–4 only), merge directly, tag a patch release (`v1.1.x`) — skip the full roadmap-domain Release Record for a hotfix; a one-line changelog entry is sufficient.
- **Patch releases** (`v1.1.1`, ...): bug fixes and small corrections, no new functionality.
- **Minor releases** (`v1.1.0`, `v1.2.0`, ...): a completed roadmap domain or meaningful slice of one, each with its own Release Record.
- **Major releases**: not anticipated within the current roadmap horizon; would require an ACR-driven architectural shift to justify.
- **Branch strategy**: continue `release/<description>` branches for anything domain-scale (mirroring Section 6 of the Handbook); ordinary feature PRs may branch directly from `main` and merge back without an intermediate release branch **once** `main`'s ancestry gap (Section 3) is resolved. **Correction (2026-07-14): this gap is confirmed still unresolved** (re-verified directly via `git merge-base --is-ancestor` against the live repository) — Section 3's own table is correct; branching ordinary feature work from `main` today would silently reintroduce the same ancestry problem PR-2 had to work around. Continue branching from a file-by-file-verified base (Section 6, P-023) until Section 3's Immediate item is actually closed.
- **Tag strategy**: continue the observed convention (`v1.1.0` version tags, `<domain>-complete` completion tags) — no need for PR-2's four-tier tag ceremony (baseline/production-readiness/release/version) for routine minor releases; a single version tag per release is sufficient once `main` is the accurate trunk.

---

## 8. Success Criteria for Version 1.1

| Dimension | Measurable Goal |
|---|---|
| **Platform completeness** | At least 3 of the 10 Section 4 domains show a shipped, validated Release Record within the Version 1.1 cycle |
| **User workflows** | Every shipped feature is manually verified end-to-end against the hosted environment before release (continuing the practice established in PR-2's live-verification steps) |
| **Performance** | No regression in dashboard/scheduling responsiveness (the platform's own stated success metric) — spot-check via the existing operational-responsiveness principles (P-014, P-015) |
| **Reliability** | Zero new undefined-function-class defects (i.e., the `ok()` class of bug) shipped — enforced by requiring `pnpm typecheck`/`pnpm lint` clean plus a live-verification pass before any merge touching Edge Functions |
| **Test coverage** | Automated E2E suite scoped and at least one critical path (e.g. booking creation) covered by end of the Version 1.1 cycle (Section 3, long-term item, revisited as a concrete goal here) |
| **Documentation** | Handbook Sections 10–12 stay current within one Release Record of actual repository state (no drift accumulating the way `main`'s ancestry gap did) |
| **Operational maturity** | The `main` branch ancestry gap and PR-2 merge (Section 3, Immediate) are resolved before Version 1.1's second roadmap domain begins — a concrete, checkable gate rather than an aspirational goal |

---

## 9. Final Recommendation

**Superseded (2026-07-14):** the recommendation below reflected PR-2's closure as of 2026-07-09. It does not account for the Version 1.0 Pilot Readiness Assessment (2026-07-14), which found the platform not yet ready for a pilot and established a **Version 1.0 Scope Freeze** (`ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` Section 5) limiting remaining Version 1.0 work exclusively to the 9-item Pilot Readiness Action Plan. Do **not** act on "READY TO BEGIN VERSION 1.1" below until that freeze is formally lifted. The historical recommendation is preserved as-written for the record.

# READY TO BEGIN VERSION 1.1

- **Production Readiness is complete.** PR-1 (baseline) and PR-2 (observability/error-schema standardization) are both closed, deployed, and governed to the standard set by the Handbook.
- **Version 1.0 is officially established**, per the Enterprise Architecture & Governance Handbook.
- **The project should transition from governance-focused work to product development**, following the roadmap in Section 4 and the lightweight workflow in Section 6.
- **Future governance should be lightweight and proportional to the scope of changes** — full PR-2-style, 9-stage ceremony is reserved for cross-cutting or architecturally sensitive work (Section 5's decision table), not routine features.

**One explicit condition attached to this recommendation, not a blocker to starting but a near-term gate**: the two Immediate technical-debt items in Section 3 (the `ok()` defect and the `main` branch ancestry gap) should be resolved at the very start of the Version 1.1 cycle — ideally before the second roadmap domain begins — so that Version 1.1 doesn't inherit an unresolved traceability gap from Version 1.0.

This concludes the Production Readiness program and establishes the roadmap for Version 1.1.
