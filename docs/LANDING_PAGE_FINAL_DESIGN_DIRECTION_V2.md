# TrafikskolaOS — Landing Page Design Direction, Version 2.0

**Document Type:** Design Governance Document (no wireframes, no mockups, no code)
**Status:** Approved — supersedes the *composition* provisions of `docs/LANDING_PAGE_FINAL_DESIGN_DIRECTION.md` ("V1"). Approved with two refinements to the Cards and Screenshots rows of Part 3 (screenshots established as the primary visual asset; cards explicitly secondary to screenshots/typography/composition) — both incorporated below.
**Date:** 2026-07-16
**Supersedes:** V1's Part 3 (layout-relevant rows only), Part 4 (screenshot-count/framing discipline), and the composition-governing principles within Part 6 — enumerated explicitly in Part 2 below, not by blanket repeal
**Does not supersede:** `docs/LANDING_PAGE_STRATEGY.md`, `docs/LANDING_PAGE_MESSAGING_STRATEGY.md`, `docs/LANDING_PAGE_CREATIVE_BLUEPRINT.md`, the approved Buyer Journey, the approved Information Architecture, or the Platform Taxonomy — all remain valid and unchanged
**Reason for this revision:** V1 conflated two distinct things under one name — "Quiet Authority" was defined as governing both *communication* (tone, messaging, credibility, honesty) and *composition* (fixed content widths, screenshot count, card usage, typography scale, section-transition mechanism). This document separates them. Quiet Authority remains the platform's communication philosophy. It no longer functions as a layout system.

---

## Part 0 — What Changed and Why

V1 was ratified as a single, undifferentiated design direction. In practice, its 18 "Immutable Principles" and its Part 3 composition table mixed two kinds of rule:

- **Rules about what the page says and how honestly it says it** — these describe the product's credibility and voice, and are independent of any particular grid, screenshot size, or card treatment. They hold regardless of how the page looks.
- **Rules about how the page is built** — fixed content widths, a five-screenshot cap, cards excluded by default, icons restricted to utility-only, whitespace as the *sole* section-transition device, a rigid five-size type scale. These are aesthetic and structural choices, not communication requirements.

Only the first category is "Quiet Authority." The second category is retired as a fixed system and replaced with the composition direction in Part 3 below, which follows the approved visual concept.

---

## Part 1 — Preserved Without Change

Nothing in this section is open for reinterpretation by this document or any future implementation work performed against it.

- **Buyer Journey** — the approved sequence of trust-before-persuasion, business-outcomes-before-features, and the scene/page ordering that enforces it.
- **Information Architecture** — the seven-page public site structure, its navigation, its URL slugs, its footer grouping.
- **Platform Taxonomy** and **Experience Architecture** — as established in the Architecture Landscape Audit and Platform Taxonomy Validation Review.
- **Messaging** — all approved copy, the Messaging Strategy's brand voice, the calm/specific/Swedish-professional register of every sentence on the page.
- **Platform positioning** and **Public Website objectives** — unchanged.
- **Quiet Authority, redefined and scoped**: the platform's communication philosophy. It governs:
  - **Tone** — calm, specific, unhurried Swedish professional voice, in copy only.
  - **Credibility** — claims are checkable and specific, never generic.
  - **Honesty** — no fabricated capability, no fabricated data, no fabricated social proof.
  - **Restraint** — of *claims*, not of *visual scale*. The page does not oversell what the product does. It is no longer required to undersell how confidently it looks doing it.

  Quiet Authority does **not** govern column count, screenshot size, card usage, icon usage, typography scale, or section-transition mechanism. Those are composition decisions, addressed in Part 3.

- **Standing implementation constraints** — instructed directly and independently of V1 or V2, not derived from either document's reasoning, and therefore not affected by this revision:
  1. No stock photography anywhere on the page.
  2. No claim of unimplemented functionality (no AI capability, no feature that hasn't shipped in Version 1.0).
  3. No fabricated data in any screenshot — populated screens must represent real, plausible product state, never invented statistics dressed as a dashboard.
  4. No fabricated social proof — no placeholder testimonials, no implied customer logos, no invented statistics.
  5. No device or browser chrome around screenshots (no laptop bezel, no phone frame, no browser window dressing) — screenshots are shown directly, unstaged.
  6. One accent color (the existing Swedish-blue token) — a second permanent brand color is a decision this document does not make and has not been asked to make.

  These six hold regardless of composition. If a future instruction wants to change any of them, that is its own decision, separate from this one.

---

## Part 2 — What Is Retired From V1

Retired specifically, not by blanket repeal of V1:

| V1 provision | Status |
|---|---|
| Part 3: "Typography hierarchy — five fixed sizes... two weights maximum" | Retired. See Part 3 below. |
| Part 3: "Spacing philosophy — large multiples as **the primary transition device**" | Retired as an exclusivity rule. Generous spacing remains good practice; it is no longer the *only* permitted transition device. |
| Part 3: "Dashboard treatment — full-bleed/elevated **specifically and only** in Scene 4" | Retired. Screenshot scale and elevation may vary by section based on that section's own narrative weight, not a single page-wide exception budget. |
| Part 3: "Card design — cards are not the page's default building block" | Retired as a prohibition. Cards are a legitimate structural option; their use is a per-section judgment call, not a default-off rule. |
| Part 3: "Iconography — never a decorative feature bullet" | Retired as a blanket prohibition. Icons may support composition and hierarchy, not only navigation/utility. |
| Part 3: "Section transitions — whitespace only, no background-color blocks" | Retired. Tonal/background treatment between sections is permitted. |
| Part 4: "Five screenshots total across the whole page" | Retired. Screenshot count and placement follow each section's own narrative need. |
| Part 4: "Passive except for two interactive moments" | Retired as a fixed cap — not a change made yet in practice, but no longer a ceiling. |
| Part 6, Principle 5: "Never decorate. If an element doesn't carry information... remove it." | Retired as stated. Decoration in service of visual hierarchy and craftsmanship is permitted, distinct from decoration that misrepresents the product (still prohibited — see Part 1's standing constraints). |
| Part 6, Principle 12: "Decoration never substitutes for a real information-hierarchy decision" | Superseded by Part 3 below — hierarchy may now be carried by scale, contrast, and composition simultaneously, not typography/whitespace alone. |
| Part 6, Principle 15: "Scandinavian simplicity governs every default; complexity requires justification" | Retired. See Part 3's replacement principle. |
| Part 6, Principle 16 (visual half only): "...all visual register — visual and verbal tone must never require reconciliation" | Retired. Copy stays calm and restrained (Part 1). Visual register is no longer required to match it 1:1 — the page may look more confident and visually assertive than it reads. |

Everything in Part 6 not listed above (Principles 1–4, 6–11, 13–14, 17–18) stands unchanged, because each of those is a communication, honesty, accessibility, or buyer-journey rule, not a composition rule.

---

## Part 3 — Composition Direction (Replaces V1 Part 3's Layout Rows)

| Dimension | Direction |
|---|---|
| **Typography** | No fixed size ceiling. Headline scale is set per section based on that section's narrative weight — a section carrying the page's primary claim may run significantly larger than a supporting section. Responsive scaling is mandatory wherever a heading appears; a heading that doesn't scale across breakpoints is incomplete, not restrained. |
| **Spacing & rhythm** | Generous vertical rhythm remains the baseline, but is no longer the sole mechanism separating sections. Tonal background treatment (a tint, a band, a contrast step) is a legitimate second transition device, used deliberately, not applied uniformly to every section. |
| **Content width** | No single fixed content wrapper. Each section may declare its own width based on what it's showing — a screenshot-led section may run wider than a text-led one. |
| **Screenshots** | Count, size, and placement follow each section's own story, not a page-wide budget. A section's most important claim may get the page's largest single visual element. Multiple screenshots in one composition (e.g., a primary view with a smaller supporting view) are permitted where they communicate something real (e.g., the product's responsive range). Screenshots remain hairline-framed, unstaged, and without device chrome (Part 1, standing constraint 5) — that specific presentation choice stands independent of this composition reset. |
| **Cards** | Cards may be used selectively where they improve understanding of grouped information. They are not the default visual language of the landing page. Product screenshots, typography and composition remain the primary storytelling mechanisms. |
| **Screenshots (primary asset)** | Real TrafikskolaOS screenshots are the primary visual asset of the public website. Use screenshots wherever possible. Diagrams and illustrations should only support concepts that cannot be effectively communicated through the product itself. |
| **Iconography** | May support wayfinding, utility, and composition. Still single-stroke, still restrained in color (Part 1's one-accent rule), not a wholesale shift to filled/multi-color icon packs. |
| **Illustration** | Used only where a screenshot cannot do the job — abstract system relationships, process flow, or a concept with no single corresponding product screen. Thin-line, single-accent diagrams remain the preferred register when illustration is genuinely warranted. This is a craft-quality preference carried forward from V1, not a license for 3D, gradient-filled, or stock-illustration treatments, which remain outside the standing constraints (Part 1) regardless of this section. |
| **Visual hierarchy** | Carried by scale, contrast, composition, and typography together — not typography and whitespace alone. A section is allowed to be visually loud if its content warrants it, and quiet if it doesn't; the page's rhythm comes from real variation in visual weight, not uniform restraint. |
| **Section transitions** | Whitespace, tonal contrast, or both — a per-section decision, not a fixed rule. |
| **Guiding replacement principle for former Principle 15** | Premium enterprise craftsmanship governs every default. Visual confidence is not automatically complexity — a section is well-composed when its hierarchy is clear and its claims are honest, not when it is minimal. Restraint is available as a tool, not required as a default. |

---

## Part 4 — What This Means for Implementation Going Forward

- Continue against **this document**, not V1, for every composition question: typography scale, spacing, content width, screenshot count/size/framing, card usage, icon usage, section-to-section contrast.
- Continue against **V1's surviving principles** (Part 2 above lists exactly which ones) and this document's Part 1 for every communication, honesty, accessibility, and buyer-journey question.
- Continue against the **standing implementation constraints** (Part 1) for photography, fabricated claims, fabricated data, fabricated social proof, device chrome, and color count — regardless of which document's reasoning is otherwise in play.
- If a future decision needs to touch one of the six standing constraints, that requires its own explicit instruction — it is not unlocked by further composition revisions to this document.

---

**This document becomes the governing composition reference for the TrafikskolaOS public website, alongside V1's surviving communication principles. Implementation proceeds against Version 2 from this point forward.**
