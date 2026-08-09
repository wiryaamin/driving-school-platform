# TrafikskolaOS — Design Sprint 01: The Hero Experience

**Document Type:** Hero Design Specification (no wireframes, no mockups, no HTML/CSS, no React)
**Status:** Draft — awaiting approval before Design Sprint 02 or any implementation
**Date:** 2026-07-09
**Governed by, does not revisit**: `docs/LANDING_PAGE_FINAL_DESIGN_DIRECTION.md` ("Quiet Authority" — the 18 immutable principles, Part 3's visual identity, Part 2's one-exception discipline), `docs/LANDING_PAGE_CREATIVE_BLUEPRINT.md` (Scene 1 spec), `docs/LANDING_PAGE_MESSAGING_STRATEGY.md` (approved Swedish copy)
**Role**: Chief Product Designer, Senior Visual Designer, Creative Director, Enterprise UX Architect, SaaS Art Director, Design System Lead

> **Amended by challenge review.** `docs/LANDING_PAGE_HERO_DESIGN_CHALLENGE.md` (Executive Design Review Board challenge, same date) revised two decisions below: the Hero now includes a restrained CTA pair, and hover/focus states (user-triggered only) are now specified. Every mention of "no CTA in the Hero" and "completely passive" below is superseded by that document; the rest of this specification — composition, typography, screenshot treatment, and the selection of Option A over B/C — stands unchanged. Where this file and the Challenge document could be read differently, the Challenge document's Part 8 is authoritative.

---

## Part 1 — Hero Objectives

| Timeframe | What the visitor should think |
|---|---|
| **Within 3 seconds** | "This is real software, not a template." The visitor should register — before reading a single word — that they're looking at an actual product screenshot, calmly presented, not a stock photo or a phone mockup. This is a pre-verbal judgment, carried entirely by composition and the presence of a real interface. |
| **Within 10 seconds** | "This is built specifically for driving schools, and it looks more serious than what I've seen before." The headline has now been read; the visitor connects the specific Swedish claim to the calm visual register and starts to sense category difference, not just aesthetic difference. |
| **Within 30 seconds** | "I want to see how deep this actually goes." The visitor has begun scrolling into Scene 2, carrying forward a specific expectation set by the Hero: that the rest of the page will keep showing, not telling — the Hero's restraint has to function as a promise the following scenes then keep. |

**What they should remember after leaving the page** (even without converting immediately): not a slogan, not a color — a single mental image of a real, calm, confident dashboard, associated with the words "built for Swedish driving schools." If a visitor can later describe the page as "the one that actually showed me the real software," the Hero has done its job.

---

## Part 2 — Three Hero Explorations

*(Different executions of the same restrained system established in "Quiet Authority" — none of the three introduce a second accent color, ambient motion, or full-bleed imagery, since Part 2 of the Final Design Direction reserved full-bleed treatment exclusively for Scene 4. Each stays inside that boundary; they differ only in composition.)*

### Option A — Centered Calm

- **Visual composition**: headline and subheadline centered, single column, directly above a large, centered, hairline-framed dashboard screenshot — the most symmetrical and quiet of the three.
- **Layout philosophy**: one visual axis, no competing focal points; the screenshot is simply the largest thing on the screen, placed exactly where the eye already goes after reading two lines of centered text.
- **Typography hierarchy**: headline at the largest of the five fixed sizes (Final Design Direction, Part 3), subheadline one size down, both centered, generous line-height, no supporting body paragraph in the hero itself.
- **Dashboard placement**: directly below the subheadline, full width within the 1120px content column, floating with a hairline border and a soft, single-direction shadow.
- **CTA placement**: *(superseded — see amendment note above)* originally none; per the Challenge review, a restrained primary/secondary CTA pair now sits between the subheadline and the screenshot.
- **Screenshot treatment**: flat, no tilt, no perspective — a straight-on capture, hairline frame, no browser chrome.
- **Whitespace**: maximal — roughly equal margin above the headline and below the screenshot, reinforcing the symmetry.
- **Trust indicators**: none explicit — the screenshot itself is the trust indicator (Part 1's 3-second objective).
- **Animation philosophy**: a single, gentle fade/rise on load (matching the Creative Blueprint's Scene 1 spec exactly), nothing else.
- **Mobile adaptation**: headline and subheadline stack normally; the dashboard screenshot crops to its most legible region (per the Final Design Direction's "cropped/zoomed, not shrunk" mobile policy) rather than shrinking the full desktop capture.
- **Advantages**: the purest expression of "Quiet Authority"; lowest implementation complexity of the three; most timeless (least likely to look dated in two years); easiest to keep accessible (single axis, no overlapping elements to manage contrast against).
- **Disadvantages**: the least visually daring of the three — on a very large desktop viewport, pure centered symmetry can read as slightly static if not executed with real precision in the screenshot's own composition.
- **Implementation complexity**: **Low.**
- **Long-term scalability**: **High** — a single-axis layout with one image slot is trivial to keep consistent as the screenshot itself is updated over time (new product surface, new UI versions).

### Option B — Offset Dynamic

- **Visual composition**: headline and subheadline left-aligned in a narrower column, dashboard screenshot offset to the right and slightly larger than the text column, with small supporting workflow cards layered near the screenshot's edge showing secondary product moments (e.g., a small calendar snippet, a small notification snippet).
- **Layout philosophy**: two visual centers of gravity (text block, image block) in tension, intended to feel more "product-forward" and less symmetrical than Option A.
- **Typography hierarchy**: same five-size scale, but left-aligned, narrower measure, allowing a slightly longer subheadline than Option A's centered version comfortably permits.
- **Dashboard placement**: offset right, larger than the text column, breaking the strict content-width boundary slightly on its outer edge.
- **CTA placement**: *(at time of original drafting, none — see amendment note above; the same restrained CTA pair adopted for Option A would apply equally here)*.
- **Screenshot treatment**: primary dashboard flat and hairline-framed like Option A, but the small supporting workflow cards are a **new pattern not present in Option A**.
- **Whitespace**: asymmetric — generous around the text column, tighter around the layered card cluster.
- **Trust indicators**: the supporting workflow cards implicitly signal "there's more here" — a breadth cue.
- **Animation philosophy**: primary screenshot fades/rises as in Option A; supporting cards could stagger in slightly after — the first point in this document where motion starts to require more than one simple rule.
- **Mobile adaptation**: the offset two-center composition collapses to a stacked layout on mobile, and the supporting workflow cards would need to be dropped or radically simplified, since there's no room for a layered cluster at mobile width.
- **Advantages**: more visually dynamic; the supporting cards could preview breadth (system depth) earlier than Scene 3 currently does.
- **Disadvantages**: **introduces a card-based pattern that Part 3 of the Final Design Direction explicitly restricts** ("Cards are not the page's default building block... requires its own justification each time") — this is flagged directly, not glossed over, in Part 5 below. The asymmetric composition is also measurably harder to keep calm — two competing focal points is inherently a step away from Option A's single-axis restraint.
- **Implementation complexity**: **Medium** — two image treatments (primary + card cluster) instead of one, plus a mobile-specific simplification decision.
- **Long-term scalability**: **Medium** — supporting cards would need ongoing curation (which secondary moments to show) in a way Option A's single screenshot never requires.

### Option C — Progressive Reveal

- **Visual composition**: headline appears first, alone; as the visitor's cursor or scroll begins, the dashboard screenshot "emerges" from a smaller, more abstract representation (e.g., a simplified line-drawing of the module map, per Scene 3's own illustration style) into the full, real screenshot — a literal visualization of "from a diagram to a real product."
- **Layout philosophy**: sequential reveal rather than a single static composition — the Hero becomes a very short, self-contained version of the whole page's own story arc (structure → proof) compressed into one scene.
- **Typography hierarchy**: headline appears first and alone, subheadline appears as the screenshot resolves — hierarchy is expressed through *time*, not just size.
- **Dashboard placement**: centered, but arriving progressively rather than present on load.
- **CTA placement**: *(at time of original drafting, none — see amendment note above)*.
- **Screenshot treatment**: the same flat, hairline-framed final state as Option A — the difference from A is entirely in *how it arrives*, not in its final resting composition.
- **Whitespace**: similar to Option A once the reveal completes, but the page is not "finished" on load, which is itself a departure from the other two options' immediacy.
- **Trust indicators**: the reveal itself, if well executed, doubles as a trust/craft signal — but this is the riskiest of the three claims in this document, and is treated with appropriate skepticism in Part 5.
- **Animation philosophy**: the most animation-dependent of the three options by a wide margin — this Hero *is* its animation, not a static composition with a simple entrance.
- **Mobile adaptation**: scroll-linked or load-triggered reveal sequences are historically the hardest pattern to make feel good on mobile (variable scroll speed, no cursor, smaller viewport for a multi-stage reveal) — this option carries the highest mobile risk of the three by a clear margin.
- **Advantages**: the most memorable and "premium product launch" feeling of the three, if executed flawlessly; most directly demonstrates Framer's "the medium demonstrates the product" principle (Product Design Strategy, Phase 2).
- **Disadvantages**: directly in tension with the Final Design Direction's explicit prohibition against motion that isn't strictly meaning-carrying and minimal — a multi-stage reveal sequence is a materially larger motion commitment than the "single gentle fade/rise" the Creative Blueprint specifies for Scene 1. It also delays the 3-second objective (Part 1) — if the real screenshot hasn't fully resolved within three seconds, the single most important early trust signal is late.
- **Implementation complexity**: **High** — a multi-stage, likely scroll- or timer-linked animation sequence, with its own mobile-specific fallback needed.
- **Long-term scalability**: **Low-Medium** — a bespoke reveal sequence is the hardest of the three to update later (a new dashboard screenshot means re-choreographing the reveal, not just swapping an image).

---

## Part 3 — Product Showcase: How the Dashboard Should Appear

**Decision: floating and framed (hairline border, soft single-direction shadow), flat (no perspective/tilt), not full-bleed, not layered, minimally animated (single load fade/rise only), not interactive.**

Why, dimension by dimension:
- **Flat vs. perspective/tilt**: flat. A tilted or perspective-skewed screenshot is a well-worn SaaS-template device that the Visual Design Exploration already identified and rejected even within the more energetic Concept B ("retire the tilt entirely... the risk isn't worth the marginal visual gain"). The Hero inherits that rejection directly.
- **Floating vs. flat-on-page**: floating, with a hairline frame and soft shadow — this is Concept A's established screenshot treatment (Visual Design Exploration), carried forward unmodified, and it is what makes the screenshot read as "a real product, presented with care" rather than "an image dropped into a page."
- **Framed vs. full-bleed**: framed. Full-bleed treatment was deliberately reserved, in the Final Design Direction (Part 2), for exactly one scene — the finance-proof moment (Scene 4) — as the page's single visual exception. Giving the Hero full-bleed treatment as well would spend that exception twice, which directly contradicts the stated discipline ("three or four scattered exceptions... is a system with no rule at all"). The Hero does not need to be the page's dramatic peak — Scene 4 is designed to be that; the Hero's job (Part 1) is calmer: earn the next ten seconds, not deliver the climax.
- **Layered vs. single image**: single image. Layering (as explored and ultimately flagged in Option B) introduces a card-like compositional pattern the Final Design Direction restricts by default.
- **Animated vs. static**: essentially static — one simple load-in fade/rise, nothing scroll-linked, nothing looping, nothing ambient (Final Design Direction, explicit prohibition).
- **Interactive vs. passive**: passive. The two moments of real interactivity established for this page (Creative Blueprint, Part 5 discussion in the Final Design Direction) are the system map and the role-switch — both later in the page. The Hero is not a third interactive moment; introducing one here would dilute the meaning of the two that already exist.

**"The product is always the hero" is honored literally here**: nothing in this Hero — not a headline treatment, not a supporting graphic — is permitted to visually outweigh the screenshot itself.

---

## Part 4 — Visual Rhythm: Hero → Scene 2

The Hero is deliberately the **largest, calmest, most resolved** moment on first load; Scene 2 (Problem Naming) is deliberately the **quietest, most minimal** scene on the entire page (per the Creative Blueprint, sharpened in the Final Design Direction's Part 5 to a single sentence). The transition from Hero to Scene 2 should feel like a held breath, not a scene change — the large image gives way to a large amount of empty space around one small, precise line of text.

**How scrolling should feel**: the Hero's generous whitespace (Part 2 of this document, all three options) means the visitor is already primed for a slow, spacious page before they've scrolled at all — Scene 2's even greater minimalism doesn't feel like a drop in production value, it feels like a continuation of a pace already set.

**What the visitor should anticipate**: after seeing a real, confident screenshot in the Hero, the one-line critique in Scene 2 should read as *earned* — "they showed me something real, and now they're telling me what's wrong with everything else I've seen" — rather than as an unsupported opinion from a vendor who hasn't proven anything yet.

**How curiosity is created**: entirely through withholding, not through teasing. The Hero deliberately does *not* show the finance-proof screenshot, the module map, or any role-specific view — it shows exactly one thing, once, calmly. The absence of "more" in the Hero is what makes the System Reveal (Scene 3) land as genuine escalation rather than more-of-the-same.

---

## Part 5 — Critical Self-Review

| Concern | Option A | Option B | Option C |
|---|---|---|---|
| **Weaknesses** | Slightly static on very large viewports if screenshot composition isn't excellent | Introduces a card pattern outside the approved default; asymmetric balance is harder to keep calm | Delays the 3-second trust objective; the riskiest tonal bet of the three |
| **Risks** | Low — the main risk is under-execution (a mediocre screenshot has nowhere to hide in this composition) | Medium — ongoing curation burden for supporting cards; risk of visually contradicting "cards are not the default" the very first time a visitor scrolls | High — a multi-stage animated reveal is the single largest departure from the ratified motion-restraint principle in this entire program |
| **Potential clichés** | Lowest risk of the three — centered-hero-with-screenshot is common, but common because it's correct here, not because it's lazy | The offset-hero-with-floating-cards is itself a very common mid-tier SaaS template pattern — a real risk of reading as generic despite the intent to feel "more dynamic" | The "product assembles itself" reveal is a recognizable startup-launch trope; without exceptional execution it risks feeling like imitation rather than genuine craft |
| **Accessibility issues** | Minimal — single axis, straightforward focus order, easiest to guarantee strong contrast throughout | The layered card cluster introduces more elements needing independent contrast/focus-order verification | The staged reveal must fully respect `prefers-reduced-motion` by skipping straight to final state — a meaningfully larger accessibility surface to get right than a single fade |
| **Scalability issues** | None material | Card cluster content needs periodic curation as the product evolves | Reveal sequence needs re-choreography whenever the screenshot itself changes |
| **Maintenance concerns** | Lowest — one image, one simple animation rule | Medium — two image treatments to keep visually consistent over time | Highest — a bespoke animation sequence is the most fragile asset in this entire sprint to hand off and maintain |

**Board's own challenge to itself**: is Option A too safe? The Board considered this directly. The answer, per Part 3's own reasoning: the Hero was never supposed to be the page's most daring moment — that role belongs to Scene 4 by design. Judging the Hero by "is it exciting enough" applies the wrong success criterion; the correct criterion, established in Part 1, is whether it earns the next ten seconds calmly and credibly. Option A does that most reliably of the three.

---

## Part 6 — Design Board Decision

# Selected: **Option A — Centered Calm**

**Why this best represents "Quiet Authority"**: it is the only one of the three options that introduces zero new patterns beyond what the Final Design Direction already ratified — no card pattern (Option B's conflict), no motion budget beyond a single fade (Option C's conflict). Quiet Authority's core claim is that restraint itself is the competitive advantage; Option A is the most literal, uncompromised expression of that claim available.

**Why this best represents Swedish enterprise software**: Part 3 of the Product Design Strategy established that Swedish B2B buyers respond to demonstrated legitimacy over persuasion tactics — a single, calm, symmetrical presentation of a real product asks nothing of the visitor's trust in advance; it simply shows them something and lets them judge it. Option B's "more dynamic" composition and Option C's "premium launch" reveal both, in different ways, ask the visitor to be a little impressed before they've seen anything real — a subtly worse fit for this specific market than Option A's total lack of persuasion effort.

**Why this best represents TrafikskolaOS specifically**: the product's real differentiator (Product Design Strategy, Phase 4) is architectural depth, not visual flair — a Hero that lets the screenshot do all the work, with the page's craft expressed through restraint rather than spectacle, is the most honest visual analogue to that actual differentiator.

**Why this best represents the approved Messaging Strategy**: the hero headline and subheadline (Messaging Strategy, Phase 5) are short, plain, declarative Swedish sentences — Option A's centered, minimal-copy composition is the layout that gives those specific sentences the most room to be read exactly as written, without competing for attention against an offset image or a multi-stage reveal.

**Why this best represents the approved Creative Blueprint**: Scene 1's own specification ("gentle fade/rise on load, no looping motion... no competing elements") describes Option A almost exactly; Option A required no reinterpretation of that scene's brief, while Options B and C both required stretching or reconsidering the brief's stated motion budget.

**Why this best represents the Final Design Direction**: it correctly reserves the page's one visual exception (full-bleed, elevated treatment) for Scene 4 as ratified, rather than spending an equivalent visual "loudness budget" in the Hero — a discipline Option B (via its card layering) and Option C (via its animation commitment) both would have broken, each in a different way.

**No compromise was made.** Elements of Option B and Option C are not being partially folded in — unlike the prior Design Board synthesis (which combined ideas from three concepts into "Quiet Authority" at the whole-page level), this sprint concludes that the Hero specifically should remain the *cleanest, least-modified* expression of that system, precisely because the whole-page synthesis already spent its exceptions elsewhere.

---

## Part 7 — Implementation Brief: Option A, "Centered Calm"

*(For a future UI design/engineering team — still a specification, not code.)*

**Grid**: 12-column grid, max content width 1120px (per the Visual Design Exploration's Concept A grid, ratified in the Final Design Direction), hero content constrained to a centered ~8-column measure for the headline/subheadline text specifically, full 12-column width available to the screenshot.

**Spacing**: 8px base unit. Hero top padding and bottom padding (before Scene 2 begins) should each be at or above the 128–192px desktop / 64–96px mobile scale established for inter-scene spacing (Final Design Direction, Part 3, "Spacing philosophy"). Space between headline and subheadline: one fixed step in the type-scale's own vertical rhythm (not an arbitrary value). Space between subheadline and screenshot: the largest single gap in the Hero, functioning as the pause before the "big reveal" of the image.

**Typography**: Inter, two weights only (Regular for subheadline, Medium for headline). Headline at the largest of the five fixed sizes defined in the design system; subheadline one step down. Both center-aligned, generous line-height, no more than roughly 8–10 words per line at desktop width (matching the Messaging Strategy's short, declarative Swedish copy).

**Exact approved copy** (Messaging Strategy, Phase 5 — not to be altered by implementation): headline "Allt din trafikskola behöver, i ett system."; subheadline "Schemaläggning, elever, ekonomi och kommunikation — i en plattform byggd för svensk bokföring."

**Components**:
- **Dashboard composition**: one real, populated admin-dashboard screenshot (per Creative Blueprint, Phase 4, Screenshot #1) — must show realistic, non-empty data (a populated schedule, real-looking figures), never an empty state. Straight-on capture, no browser chrome, no OS window frame, cropped tightly to the relevant interface content.
- **Screenshot requirements**: minimum resolution sufficient for crisp display at full 1120px content width on standard and high-DPI displays; must be re-cropped (not simply scaled) for the mobile breakpoint to preserve legibility, per the Final Design Direction's mobile policy.
- **Frame treatment**: 1px hairline border (using the existing `--border` token), soft single-direction drop shadow — no browser chrome, no device bezel.
- **CTA hierarchy**: *(amended by `LANDING_PAGE_HERO_DESIGN_CHALLENGE.md`, Part 4/8)* a primary CTA — "Boka en visning" (approved Messaging Strategy copy), solid `--primary` fill, small and restrained — and a secondary CTA — "Se plattformen" (new micro-copy, flagged as not pre-approved in the Messaging Strategy), plain text link — placed between the subheadline and the screenshot. The primary CTA links to the same demo-request destination as the identical CTA at Scene 7; the secondary CTA is a same-page scroll-anchor to Scene 3.

**Responsive behavior**: headline/subheadline stack normally at narrower widths, retaining center alignment down to mobile; the CTA pair stacks to a single column on narrow viewports (primary button first, secondary link beneath); screenshot switches from a full, straight-on capture to a cropped/zoomed excerpt at the mobile breakpoint (do not simply scale the full desktop image down — it becomes illegible, per the Final Design Direction's explicit mobile screenshot policy).

**Accessibility requirements**: text contrast must meet WCAG AAA against the background (the existing `--background`/`--foreground` token pair already achieves this); the primary CTA button's fill-to-background contrast must meet at least WCAG AA (verify the specific `--primary` blue value against `--background`); both CTAs must be keyboard-reachable in logical tab order with a visible focus ring using the existing `--ring` token; the load-in fade/rise animation and the two hover states (below) must fully respect `prefers-reduced-motion` (render in final/resting state immediately, no motion, if the user has that preference set); touch devices must render both CTAs in their fully legible resting state without requiring a hover trigger; the screenshot requires descriptive alt text conveying that it depicts the TrafikskolaOS admin dashboard, not a literal transcription of every visible number.

**Animation guidance**: a single fade + slight upward position shift on initial load, 300–400ms, ease-out — matching Concept A's animation philosophy exactly (Visual Design Exploration). No scroll-linked behavior in the Hero itself. No looping or ambient motion, ever (Final Design Direction, explicit prohibition). *Amended*: two additional, strictly user-triggered (hover/focus only, never automatic) states are now specified — a fill-darken/underline-reveal on the CTA pair, and a barely-perceptible shadow-lift on the screenshot frame on hover — both near-instant (under ~150ms), both inert until the visitor interacts.

**Design tokens to use** (existing, verified in `apps/web/src/globals.css` — no new tokens required for the Hero):
- `--background` / `--foreground` for base page and text color
- `--primary` (the existing Swedish-blue token, `hsl(207 100% 33%)`) — now used in the Hero for the primary CTA fill, its first appearance on the page
- `--ring` for the CTA pair's keyboard focus indicator
- `--border` for the screenshot's hairline frame
- `--radius` (existing `0.5rem`) if any rounding is applied to the frame corners or CTA button, for consistency with the rest of the design system

**Existing components to reuse**: *(amended)* the existing `button.tsx` primitive from `packages/ui` is now reused directly for the Hero's primary CTA — the same instance styling used at Scene 7, not a new button variant. No `card.tsx` or other primitive applies, per the "cards are not the default" principle, which still holds unchanged.

**New components (only if absolutely necessary)**: a landing-page-specific `Hero` layout component and a `ScreenshotFrame` presentational component (hairline border + shadow treatment) — both marketing-site-specific, since nothing in the current app-shell component library represents a full-bleed marketing hero or a framed product-screenshot presentation. These are the only two new components this sprint identifies as necessary, and both are simple, presentational, and reusable later for Scene 4 and Scene 5's screenshots as well (with Scene 4's `ScreenshotFrame` instance overridden to full-bleed, per the one ratified exception).

**Success criteria**:
- A visitor can identify, without reading any text, that they are looking at real software (not a mockup or illustration) within roughly 3 seconds.
- The Hero introduces zero visual patterns not already present in the ratified "Quiet Authority" system, extended only by the narrow, user-triggered amendments in `LANDING_PAGE_HERO_DESIGN_CHALLENGE.md` (one CTA pair using the existing single accent color; no card layering; no motion beyond the load fade and the two hover states).
- The exact approved Swedish copy appears unaltered (with the one flagged exception: "Se plattformen" is new, not-yet-formally-approved micro-copy).
- A visitor who already intends to act can do so without scrolling past the Hero.

**Acceptance criteria**:
- [ ] Headline and subheadline match the Messaging Strategy's approved copy exactly, centered, at the specified type scale.
- [ ] Exactly one screenshot appears, hairline-framed, no tilt/perspective, no browser chrome, and its populated content includes one real, native in-product moment (e.g. a genuine notification/toast as the app itself renders it).
- [ ] A primary CTA ("Boka en visning") and secondary CTA ("Se plattformen") appear between the subheadline and the screenshot, styled per the CTA hierarchy above.
- [ ] No card, badge, or icon-grid element appears in the Hero.
- [ ] Only token colors already defined in `apps/web/src/globals.css` are used — no new colors introduced; `--primary` is used exactly once (the CTA fill).
- [ ] Load animation is a single fade/rise, respects `prefers-reduced-motion`, and does not loop or persist after load.
- [ ] The CTA pair and screenshot frame each have a user-triggered hover/focus state only — no automatic or looping motion anywhere in the Hero.
- [ ] Both CTAs are keyboard-operable with a visible focus ring, and render fully legibly on touch devices without requiring hover.
- [ ] Mobile presentation re-crops the screenshot rather than scaling the desktop capture down, and stacks the CTA pair to a single column.
- [ ] Contrast between text and background meets WCAG AAA; primary CTA fill-to-background contrast meets at least WCAG AA.

---

No wireframes, mockups, HTML, CSS, or React were produced in this document. Waiting for approval before Design Sprint 02 or any implementation work begins.
