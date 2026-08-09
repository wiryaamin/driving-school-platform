# TrafikskolaOS — Landing Page Strategy v2: Platform Positioning & Narrative Evolution

**Document type:** Strategy revision — becomes the implementation blueprint for all further landing page work, superseding the relevant narrative-framing sections of the original Creative Blueprint and Messaging Strategy where the two conflict. Nothing here changes visual design, typography, spacing, or the "Quiet Authority" system.
**Status:** Draft — awaiting approval. No code, no UI, no copy has been implemented from this document.
**Grounded in:** `docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` (the real, deployed capability inventory), the three approved prior strategy documents, and the three scenes currently implemented and reviewed in the browser.

---

## 1. Why This Revision Exists

The Executive Project Review (previous turn) surfaced a specific, correct concern: the page — as currently planned and partly built — risks reading as **a well-organized list of modules that happen to be connected**, rather than **one platform a driving school runs its entire business on**. Scene 3's module map, as built, shows six labeled boxes wired to a hub. That's structurally accurate, but it's a diagram of *architecture*, not yet a story about *what running the business feels like*. A visitor can look at that diagram and still think "so it's six tools in a trench coat" — which is close to the exact "instructor's diary with a payment button" critique Scene 2 raises about competitors.

This document does not add scenes, remove scenes, or touch the visual system. It re-examines *what each scene claims* and *how it's framed*, so that breadth reads as **one operating system**, not **six departments**.

---

## 2. What the Real Platform Actually Is (Grounding, Not Invention)

Everything below is drawn directly from the Enterprise Architecture Handbook — the deployed, production system — not aspirational. This matters because it means the repositioning below is a *framing* correction, not a *claims* correction: nothing here requires the product to do more than it already does. It requires the page to say more of what's already true.

The Handbook's own executive summary already states the platform vision the marketing site has been under-claiming:

> "TrafikskolaOS is a Sweden-first, multi-tenant SaaS platform for Swedish driving schools. It replaces fragmented legacy tools with a single, operationally excellent product purpose-built for Swedish accounting law, Swedish driving-school workflows, and the daily operational reality of trafikskola staff."

Three things in the real system are materially under-used in the current landing narrative:

1. **Six operational surfaces, not one dashboard.** Admin Workspace, Platform Admin, Student Portal, Instructor Portal, Instructor App, and **Guardian Portal** — plus two public-facing surfaces (catalog, lead capture/enrollment). The approved Roles scene currently plans for four personas (owner, ops, finance, instructor). It omits the **guardian** — a real, distinct user type for a driving school, since a large share of students are minors whose parents or guardians need visibility (progress, invoices, consent). This is a genuine differentiator competitors in this category are unlikely to have built, and it's currently invisible on the page.
2. **Depth of the finance/compliance stack far exceeds "BAS 2020 + VAT + SIE4 + AGI."** The real system includes reconciliation, financial period close, deferred revenue/accruals, fixed-asset depreciation, payroll, a Fortnox accounting-software integration, and — most distinctively — an **immutable, replayable, audit-traceable ledger with deterministic governance** (append-only, reversal-only, correlation-aware audit trail). That last point is a genuinely rare claim: most competitors' "accounting features" are a CSV export. TrafikskolaOS can demonstrate that every number is provably reconstructable and tamper-evident. This belongs in Scene 4 *and* strengthens Scene 6 (currently only tenant isolation is planned as the trust claim).
3. **A real B2B and self-service commercial layer.** Corporate customer accounts, corporate contracts, a public course catalog, and public enrollment/booking exist. This means TrafikskolaOS isn't just "software the school's staff use" — it already supports the school selling and onboarding students online, and serving corporate clients (e.g., a local employer buying driving lessons for staff). This is a growth-story element currently only implied in the Messaging Strategy's "Business Transformation Story," not surfaced anywhere in the actual scene plan.

None of this requires new product work. It requires the page to talk about what already exists.

---

## 3. Buyer Journey — Refined

The original four-stage emotional arc (Arrival → Problem Recognition → System Reveal → Proof → Roles → Security → Decision) remains structurally sound and is **not being replaced**. What changes is *who* the journey accounts for and *what "the system" is understood to mean* by the time the visitor reaches the Roles scene.

**Revised persona set** (adds one, does not remove any): Owner/Decision-maker, Operations/Admin staff, Finance/Bookkeeping-minded reader, Instructor, **and Guardian** (parent/guardian of a minor student — relevant specifically because Swedish driving education serves a large under-18 population, and this persona currently has no representation anywhere on the page despite having a real, dedicated portal).

**Revised journey emphasis:** the System Reveal scene (Scene 3) is the moment most in need of re-emphasis. Today it answers "how much does this cover?" The revision asks it to also answer, implicitly, "is this one thing, or six things?" — the visitor should leave Scene 3 believing the connectedness itself is the product, not a feature of it. This is a framing change to that scene's supporting copy and caption, not a new scene and not a new diagram shape.

---

## 4. Value Proposition — Reframed Around Outcomes

The current value proposition, as built, is accurate but still lists domains: "scheduling, students, finance, communication." The revision asks every scene to translate its domain claim into a **business outcome** — something the owner actually experiences, not a category of software.

| Domain (as currently framed) | Reframed as business outcome |
|---|---|
| "Scheduling" | A cancellation doesn't cost you five phone calls — it reopens itself to the waitlist automatically. |
| "Elever" (student management) | You know exactly where every student is in their journey — from first lesson to licence — without checking three tools. |
| "Ekonomi" (finance) | Your books are correct on the first of every month, not reconstructed under pressure the week before a VAT deadline. |
| "Kommunikation" | Instructors, students, and guardians are never out of sync, because there's only one schedule, not a copy of one. |
| "Instruktörer" | Your staff check one schedule that's always current — not a paper printout or a personal app that drifts out of date. |
| "Fordon" | Vehicle compliance (besiktning, insurance, service) is tracked automatically, not remembered by one person. |

This table is a **translation principle to apply when writing each scene's copy**, not new copy itself — actual sentences remain a copywriting decision for implementation, grounded in the already-approved Messaging Strategy's tone (calm, precise, no hype, Phase 10).

---

## 5. Platform Positioning — The Core Directive

**One rule governs every scene from here forward:** describe what the *business* can now do, not what *software module* exists. Concretely:

- Never introduce a scene by naming a product area first ("Here's our finance module"). Introduce it by naming a business moment first ("Every month-end used to be a fire drill. Now it isn't.") — the product area is the *proof*, not the *headline*.
- The word "system" (already central to Scene 3's approved headline, "Ett system, hela din verksamhet") should be reinforced as a throughline across *every* scene's supporting copy where natural — not repeated mechanically, but the underlying claim ("this is one thing, not six things stitched together") should be legible in Scenes 3, 4, 5, and 6 specifically, since those are the scenes most at risk of reading as a module tour.
- Scene 3's module map is architecturally correct and should **not be redrawn** — but its supporting sentence and caption should shift from *describing structure* ("kopplade till varandra" / "connected to each other") toward *describing consequence* (what connectedness actually changes for the person running the school). This is a copy-level recommendation, not a visual one.

---

## 6. Swedish Differentiation — Deepened

The current plan's Swedish differentiation claim (Scene 4) rests on naming compliance standards: BAS 2020, VAT periods, SIE4, AGI. This is correct but table-stakes — any competitor claiming "Swedish support" can list the same four acronyms, whether or not they've actually built the depth behind them.

**What actually differentiates, and should be added to Scene 4's claim set:**
- The ledger is not just "correct" — it is **append-only and reversal-based**, meaning nothing is ever silently edited, and every figure can be traced back to exactly how it was produced. This is a materially stronger claim than "we support BAS 2020" — it's closer to "your books are audit-proof by construction," which is a claim a Swedish accountant (the Messaging Strategy's own named skeptical reader) would recognize as unusually serious.
- **Fortnox integration** is a concrete, checkable claim ("we connect to the accounting software you probably already use") that removes a real, specific fear: *migration risk*. This belongs alongside the compliance-standard list, not as a separate feature.
- These two additions strengthen Scene 4 without changing its visual concept (still one real, populated finance screen, still no new claims that require new proof beyond what's already planned).

---

## 7. Business Outcomes Over Features — Applied Scene by Scene

This section is the actual deliverable: how each scene's *narrative intent* evolves. Visual system, spacing, typography, motion, and copy tone are unchanged throughout — this is a story-emphasis revision, not a redesign.

### Scene 1 — Hero *(built, approved — no change recommended)*
No revision needed. The Hero's job is to earn ten seconds with a checkable claim, and "Allt din trafikskola behöver, i ett system" already states the one-platform positioning directly. Leave as-is.

### Scene 2 — Problem Recognition *(built, approved — no change recommended)*
No revision needed. Naming the market's shallowness ("an instructor's diary with a payment button") already sets up the one-platform argument implicitly. Leave as-is.

### Scene 3 — System Reveal *(built, pending approval — revise before final sign-off)*
**Current framing:** a structural diagram naming six connected areas.
**Recommended evolution:** keep the diagram exactly as built. Shift the supporting sentence and the "Kopplat. Inte separat." caption to imply *consequence*, not just *structure* — the visitor should finish this scene believing "if I change one thing, everything else already knows," not just "these six things are drawn with lines between them." This is the single highest-priority revision in this document, because Scene 3 is the scene the original audit flagged as most at risk of reading as "a collection of modules."

### Scene 4 — Proof: Swedish Accounting Depth *(not started)*
**Recommended evolution before implementation:** broaden the claim set per Section 6 above — append-only/audit-traceable ledger and Fortnox interoperability, alongside the already-planned BAS/VAT/SIE4/AGI claims. Visual concept unchanged (one real, populated finance screen).

### Scene 5 — Roles *(not started)*
**Recommended evolution before implementation:** add the **Guardian** persona to the role set (Section 3). This is the clearest concrete way to demonstrate "complete platform" rather than "staff tool" — a guardian portal is not something a school expects from booking software, and showing it costs nothing structurally (the scene already plans a role-switch interaction; this adds one more real, existing role to a mechanism already being built).

### Scene 6 — Security & Architecture *(not started)*
**Recommended evolution before implementation:** the currently-planned claim (tenant isolation at the database level) remains correct and should stay. Add the **replay-safe, correlation-aware audit trail** as a second, equally concrete trust claim — this was already flagged as a candidate addition in the Final Design Direction's own Board review (Part 5, point 3) and is now further justified by the Handbook's confirmation that this capability is real and deployed, not aspirational.

### Scene 7 — Call to Action *(not started)*
No positioning change recommended. This scene's job (a calm, low-pressure ask) is unaffected by the platform-vs-modules question — by the time a visitor reaches this scene, the repositioning work in Scenes 3–6 has already done its job.

### Scene 8 — Quiet Close / Footer *(not started)*
No positioning change recommended, with one small addition worth considering at implementation time: the closing statement ("TrafikskolaOS byggs för den svenska trafikskolebranschen") could optionally be read alongside the platform-completeness claim established earlier, but this is a minor copy nuance, not a structural recommendation.

---

## 8. What Does Not Change

To be explicit, since this document could otherwise be read as inviting scope growth:

- **No new scenes.** Still eight, in the same order.
- **No new visual language.** Same type scale, same single accent color, same spacing system, same hairline-frame treatment, same animation restraint.
- **No feature grid, no icon wall, no testimonials, no pricing table.** All four remain explicitly excluded, for the same reasons recorded in the original Creative Blueprint.
- **No fabricated proof.** The "audit-traceable ledger" and "Fortnox integration" claims recommended above are only being proposed *because* they are real, deployed capabilities confirmed in the Enterprise Architecture Handbook — not because they sound impressive. If either claim cannot be demonstrated with a real screen or a real, checkable fact at implementation time, it should be dropped rather than asserted.
- **No screenshot problem solved here.** Scenes 4 and 5 still depend on real product screenshots that do not yet exist (Executive Review, Section 5/8). This document changes what those scenes should *say* once built; it does not resolve *when* they can be built.

---

## 9. Approval Gate

This document is a strategy revision only. Before any further implementation:

1. Confirm the Guardian persona addition to Scene 5 is desired (it is a real product capability, but adding a persona does expand that scene's eventual scope slightly).
2. Confirm the two additional Scene 4/6 trust claims (audit-traceable ledger, Fortnox integration) are approved to use in copy.
3. Confirm Scene 3's existing diagram should be kept as-is, with only its supporting sentence and caption revised.

Once confirmed, implementation resumes exactly where it left off — Scene 3's copy-only revision first (since it's already built and only needs its two lines of text reconsidered), then Scene 4 onward in order.

No code, UI, or copy has been changed to produce this document.
