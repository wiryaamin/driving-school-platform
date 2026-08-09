# TrafikskolaOS — Design Sprint 02: High-Fidelity Hero Visual Design

**Document Type:** High-Fidelity Visual Design Specification (no wireframes, no mockups, no HTML/CSS, no React)
**Status:** Draft — awaiting approval before implementation
**Date:** 2026-07-09
**Implements, does not revisit**: `docs/LANDING_PAGE_HERO_DESIGN_SPRINT_01.md` + `docs/LANDING_PAGE_HERO_DESIGN_CHALLENGE.md` (the definitive, approved Hero specification), governed throughout by `docs/LANDING_PAGE_FINAL_DESIGN_DIRECTION.md` ("Quiet Authority")
**Grounded in real tokens/config**: `apps/web/src/globals.css`, `packages/config/tailwind.config.base.js` (verified before writing this document — every value below is either an existing token or explicitly flagged as new)
**Role**: Senior Product Designer, Visual Design Lead, SaaS UX Designer, Art Director, Design Systems Specialist, Accessibility Specialist

> **Precision note.** This document specifies exact values (px/rem, tokens, breakpoints) so a frontend engineer can implement without making a single undocumented visual decision. Where the existing design system already defines something usable (breakpoints, color tokens, the `fade-in` keyframe), it is reused and cited by its real name/value — nothing here invents a parallel system.

---

## Part 1 — Visual Composition (Desktop)

**Overall composition**: a single-column, centered composition on a fixed vertical sequence — Headline → Subheadline → CTA pair → Screenshot — with no secondary layout regions. This is a literal, precise expression of Option A ("Centered Calm") from Sprint 01.

**Grid**: 12-column grid. Text elements (headline, subheadline, CTA row) are constrained to an 8-column measure, centered within the 12; the screenshot is permitted the full 12-column width. This asymmetry (text narrower than image) is deliberate — it keeps body copy at a comfortable reading measure while letting the product image be as large as the content width allows.

**Maximum content width**: **1120px (70rem)**, centered. This is a **bespoke width, narrower than the shared app-level Tailwind `container` utility** (`packages/config/tailwind.config.base.js` caps the container at 1400px at the `2xl` breakpoint) — the Hero (and, per the Final Design Direction, the rest of the marketing page) must **not** use the shared `container` class as-is; it needs its own max-width wrapper at 1120px. This is flagged explicitly because reusing the app's container utility unmodified would silently widen the page beyond the approved Concept A grid spec.

**Container behaviour**: horizontally centered (`margin-inline: auto`), with side padding matching the existing container convention (`2rem` / 32px) at viewport widths below the 1120px content max, so the content never touches the viewport edge on any desktop/laptop size.

**Margins & whitespace**: top padding above the headline and bottom padding below the screenshot (before Scene 2 begins) are each **128px (8rem)** at desktop widths ≥1280px, per the Final Design Direction's inter-scene spacing scale. Space between headline and subheadline: **24px (1.5rem)**. Space between subheadline and the CTA row: **32px (2rem)**. Space between the CTA row and the screenshot: **64px (4rem)** — the single largest internal gap in the Hero, functioning as the deliberate pause before the image, per Sprint 01's "big reveal" framing.

**Typography, visual balance, eye movement**: all text is center-aligned on the vertical axis; eye movement is top-to-bottom, single-path, with no competing horizontal elements — a visitor's eye has exactly one route through the Hero, by design.

**Content hierarchy**: headline (largest, boldest) → subheadline (calmer, longer) → CTA pair (small, quiet, but the only colored element) → screenshot (largest single element on screen, but positioned last so it resolves the sequence rather than interrupting it).

**CTA placement**: horizontally centered row, primary button and secondary text link side-by-side, **16px (1rem)** gap between them, positioned per the spacing above (32px below subheadline, 64px above screenshot).

**Dashboard/screenshot placement & framing**: full 12-column width (up to the 1120px max), horizontally centered, hairline-framed (see Part 4), positioned as the final element in the vertical sequence.

**Vertical rhythm**: every spacing value above is a multiple of the 8px base unit (24, 32, 64, 128 all divide evenly by 8) — no arbitrary spacing values appear anywhere in this specification.

### Structural Diagram (desktop, for implementation reference only — not a wireframe deliverable)

```
┌──────────────────────────────────────────────────────────────┐
│                         [128px top padding]                   │
│                                                                │
│              Allt din trafikskola behöver,                    │
│                     i ett system.              ← headline     │
│                                                                │
│                        [24px]                                 │
│                                                                │
│     Schemaläggning, elever, ekonomi och kommunikation —        │
│      i en plattform byggd för svensk bokföring.  ← subhead    │
│                                                                │
│                        [32px]                                 │
│                                                                │
│         [ Boka en visning ]     Se plattformen  ← CTA row     │
│                                                                │
│                        [64px]                                 │
│                                                                │
│   ┌────────────────────────────────────────────────────┐     │
│   │                                                      │     │
│   │         [real, populated dashboard screenshot]       │     │
│   │              hairline frame · soft shadow            │     │
│   │                                                      │     │
│   └────────────────────────────────────────────────────┘     │
│                                                                │
│                        [128px bottom padding]                 │
└──────────────────────────────────────────────────────────────┘
                     max-width: 1120px, centered
```

---

## Part 2 — Typography

**Font**: Inter (existing `fontFamily.sans` token in `tailwind.config.base.js`) — no new typeface introduced.

**Five fixed sizes for the entire page** (per Final Design Direction, Part 3), with the Hero using three of them:

| Role | Size | Line-height | Letter-spacing | Weight |
|---|---|---|---|---|
| Hero headline | 44px / 2.75rem (desktop) → 32px / 2rem (mobile, see Part 6) | 1.15 | −0.02em | Medium (500) |
| Hero subheadline | 28px / 1.75rem (desktop) → 22px / 1.375rem (mobile) | 1.3 | −0.01em | Regular (400) |
| CTA label | 16px / 1rem | 1.5 | 0 | Medium (500) |

**Weight discipline**: exactly two weights appear anywhere in the Hero — Regular (400) for the subheadline, Medium (500) for the headline and both CTAs. No Semibold, no Bold, no italics — directly enforcing the Final Design Direction's "two weights maximum" rule.

**Paragraph width**: the subheadline is constrained to roughly 60–65 characters per line at desktop width (achieved by the 8-column/1120px measure, not by an explicit `max-width` on the text itself) — long enough to read the full approved sentence in two lines, short enough to stay comfortable.

**Headline hierarchy**: the headline is set at the single largest size used anywhere on the entire landing page — no other scene, including Scene 4's finance-proof headline, exceeds it. This is deliberate: the Hero's headline is the one moment the page's boldest type size is spent.

**Subheadline hierarchy**: exactly one step down on the five-size scale (28px) — matching the size used for section headlines elsewhere on the page (Scene 3, 4, 5, 6 headlines), which is intentional: the Hero's subheadline and every other scene's headline share one visual weight class, keeping the whole page's type system to genuinely five sizes, not six or seven.

**CTA typography**: both CTAs set at the body size (16px/1rem), Medium weight for the primary button, Medium weight for the secondary link as well (not Regular) — because the secondary link, though visually lighter in *color/weight-of-presence*, should read with the same typographic confidence as the primary action, differentiated by color and container (button vs. plain text) rather than by font weight.

**Why every choice reinforces Quiet Authority**: the entire Hero uses three sizes and two weights — a smaller typographic vocabulary than nearly any comparable SaaS hero. Restraint here is not a stylistic flourish; it is the literal, countable constraint the whole "Quiet Authority" direction is named for.

---

## Part 3 — Color System (Existing Tokens Only)

No new palette. Every color below is an existing token, verified in `apps/web/src/globals.css` and `packages/config/tailwind.config.base.js`.

| Element | Token | Value (light mode) |
|---|---|---|
| Page background | `background` | `hsl(0 0% 100%)` — pure white |
| Headline / body text | `foreground` | `hsl(222 47% 11%)` — near-black |
| Subheadline text | `foreground` at reduced opacity, **or** `muted-foreground` | `hsl(215 16% 47%)` if `muted-foreground` is used — a calmer, secondary read than the headline, still well above AA contrast on white |
| Primary CTA fill | `primary` | `hsl(207 100% 33%)` (≈ `#006AA7`, the existing Swedish-blue brand token) |
| Primary CTA label | `primary-foreground` | `hsl(210 40% 98%)` — near-white, for contrast against the blue fill |
| Secondary CTA (text link) | `foreground`, with `primary` on hover/focus only | Resting state matches body text color — deliberately unremarkable until interacted with |
| Screenshot frame border | `border` | `hsl(214 32% 91%)` — the existing hairline border token |
| Focus ring (both CTAs) | `ring` | `hsl(207 100% 33%)` — identical to `primary`, so focus and brand color are the same signal, not two different colors to track |
| Shadow (screenshot frame) | *(new, flagged)* | No `--shadow` token exists in the current design system. Recommend a single, restrained value: `0 1px 2px hsl(222 47% 11% / 0.04), 0 8px 24px hsl(222 47% 11% / 0.06)` — a soft, single-direction, low-opacity shadow derived from the existing `foreground` hue rather than an arbitrary gray, keeping the shadow tonally consistent with the rest of the palette even though it isn't a pre-existing token. |

**Highlight colors**: none. There is no secondary accent color anywhere in the Hero — `primary` is the only color that appears outside the near-white/near-black base pair, and it appears in exactly two places (the CTA button fill, and the focus ring).

**Hover colors**: primary CTA hover darkens toward `hsl(207 100% 28%)` (a ~5% lightness reduction of the existing `primary` value — not a new token, a computed darkening of the existing one); secondary CTA link transitions from `foreground` to `primary` on hover.

**Focus states**: both CTAs receive a visible `ring`-colored outline on keyboard focus, offset 2px from the element — the same token used for hover on the secondary link and for the primary button's fill, so the page's entire interactive-state vocabulary reduces to one color, used consistently.

**Dark mode**: background/foreground/primary all have existing dark-mode token values already defined in `globals.css` (`--background: 222 47% 6%`, `--primary: 207 100% 50%`, etc.) — the Hero's color logic (one accent, near-black/near-white base, hairline border, computed hover-darken) applies identically in dark mode using those existing values; no separate dark-mode design decision is required.

---

## Part 4 — Dashboard Presentation

**The dashboard is the hero — literally the largest and final element in the composition (Part 1).**

**Exact scale**: full 12-column width up to the 1120px content max — at that width, the screenshot renders at approximately **1120 × 630px** (16:9-adjacent, matching a realistic captured admin-dashboard aspect ratio rather than a forced crop).

**Cropping**: tight crop to the actual interface content — no browser chrome, no OS window frame, no visible URL bar. The capture should begin at the app's own top edge (e.g., the top bar) and end at a natural content boundary, not an arbitrary cutoff mid-element.

**Frame treatment**: 1px solid border using the `border` token; **8px corner radius** (the existing `radius: lg` token, derived from `--radius: 0.5rem`) — matching the radius already used elsewhere in the product's own UI, so the screenshot's frame doesn't introduce a new geometry language.

**Shadow**: the two-layer soft shadow specified in Part 3 — tight, low-opacity near shadow plus a softer, larger-spread far shadow, producing a "resting just above the page" effect without a hard drop-shadow edge.

**Corner radius**: 8px (`radius: lg`), applied to the frame only — the screenshot's own internal content (the real product UI) is not modified or re-rendered with a different radius; only the outer frame carries it.

**Internal screenshot composition**: the captured screen should be the admin dashboard's default landing view — today's schedule/calendar summary, a KPI or overview panel, and navigation chrome, populated with realistic, non-empty data (real-looking student names, real-looking times, real-looking figures — never Lorem Ipsum, never a visibly empty state).

**Visible modules**: scheduling (a populated calendar/today view) and at least one finance or KPI element (e.g., a small revenue or booking-count figure) should both be visible in the single hero capture — giving the 3-second objective (Sprint 01, Part 1) two distinct signals of depth (operations + business visibility) in one image, without needing a second screenshot.

**Visible data**: names, times, and figures must look like a real, active driving school's data — this is a content/asset-preparation requirement, not a layout one, but it is a hard requirement per the Final Design Direction's honesty discipline (no fabricated statistics, and by extension no fabricated-looking placeholder data either).

**Real product evidence / notification placement**: per the Hero Design Challenge (Part 3), the capture should include exactly one real, native in-product moment — e.g., a genuine booking-confirmation toast/notification, positioned exactly where the real application renders it (its actual top-right or contextual position within the app's own UI), **not** repositioned or exaggerated for the marketing capture. The point is authenticity: this is what the product actually looks like at a real, active moment, not a staged addition.

**Relationship to surrounding whitespace**: the screenshot sits within the same 1120px content column as the text above it, with no additional side margin beyond the column edge — it is the one element in the Hero permitted to use the full available width, which is precisely what makes it read as the composition's climax after three narrower text elements above it.

---

## Part 5 — Calls to Action

**Primary button** ("Boka en visning"):
- Height: 48px (comfortable touch target, exceeds the 44×44px minimum recommended touch-target size)
- Horizontal padding: 24px (1.5rem)
- Fill: `primary` token, `primary-foreground` label text, 16px/Medium
- Corner radius: `radius: lg` (8px) — matching the screenshot frame's radius, keeping one consistent geometry across the whole Hero
- No icon, no arrow glyph — text only, consistent with the "typography over decoration" principle

**Secondary action** ("Se plattformen"):
- Plain text link, same 16px/Medium typography as the primary button's label, `foreground` color at rest
- No visible border, no background fill, no underline at rest (underline appears only on hover/focus, see below)
- Vertically centered against the primary button so both read as one coherent row, not a button plus a stray line of text

**Spacing**: 16px (1rem) horizontal gap between the two; both centered as a unit within the 8-column text column (Part 1).

**Sizing**: the primary button is visibly the larger, more present element (defined height, fill, padding); the secondary link has no container at all — the size *difference itself* is the hierarchy signal, with no need for a smaller font size on the secondary action.

**Visual weight**: primary carries color + shape + fill; secondary carries neither — this is the entire hierarchy mechanism, deliberately simple.

**Hover behaviour**: primary button fill darkens (`primary` → the computed ~5%-darker value, Part 3), 150ms ease-out transition; secondary link's text color shifts from `foreground` to `primary` and gains an underline, same 150ms transition.

**Focus behaviour**: both elements receive a 2px `ring`-colored outline, 2px offset, on keyboard focus — visible regardless of whether the pointer is hovering, and not dependent on hover state at all (a keyboard user tabbing through must see the same clarity a mouse user gets from hover).

**Keyboard accessibility**: both elements are reachable via Tab in document order (primary before secondary, matching their visual left-to-right order); both are activatable via Enter/Space (primary as a real `<button>`/link semantics, secondary as a real anchor for the scroll-anchor behavior — no `div`-with-click-handler pattern for either).

**Relationship to the screenshot**: positioned 64px above it (Part 1) — close enough to read as part of the same "invitation" as the visual proof below, far enough that neither competes with the screenshot for visual weight. **The buttons support the dashboard; they never compete with it** — this is enforced structurally by size alone: the largest button dimension (48px height) is roughly 1/13th the height of the screenshot (~630px) — there is no scenario, at any viewport, where the CTA row visually outweighs the product image beneath it.

---

## Part 6 — Responsive Design

*(Re-paced per breakpoint, per the Final Design Direction's explicit "re-paced, not shrunk" mobile policy — using the project's real, existing Tailwind breakpoints: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px.)*

### Desktop (≥1280px / `xl` and above)
As specified in Parts 1–5 in full: 1120px max content width, 44px headline, 128px section padding, full-width straight-on screenshot.

### Laptop (1024–1279px / `lg`)
Content max-width scales to the viewport with the existing container side-padding (32px) rather than the full 1120px (since 1120px + padding can approach the available viewport width at this range) — headline remains 44px (no reduction needed yet, since line-wrapping at this width still holds the approved two-line subheadline comfortably); section padding reduces slightly to 96px (6rem) top/bottom, still well within the Final Design Direction's 64–96px mobile floor being reserved specifically for true mobile, not laptop.

### Tablet (768–1023px / `md`)
Headline reduces to 36px (2.25rem), subheadline to 24px (1.5rem); section padding reduces to 80px (5rem); the screenshot remains a full, straight-on capture (not yet cropped/zoomed — that transformation is reserved for true mobile, since a tablet viewport is still wide enough to render the full dashboard capture legibly); CTA row remains side-by-side (still comfortably wide enough at 768px+).

### Mobile (<768px / below `md`)
- **How the story changes**: nothing is removed, but pacing tightens — section padding drops to 64px (4rem), the floor established in the Final Design Direction, never lower.
- **How the screenshot changes**: per the Final Design Direction's explicit mobile screenshot policy, the full desktop capture is **not simply scaled down** — it is re-cropped to its most legible region (most likely the today-view/calendar portion plus the KPI figure, dropping outer chrome that would become illegible at mobile width). This is a distinct asset, prepared specifically for mobile, not a responsive `object-fit` transform of the desktop image.
- **How typography scales**: headline reduces to 32px (2rem), subheadline to 22px (1.375rem) — both still comfortably above the smallest of the five fixed sizes, preserving the Hero's status as the boldest text on the page even at mobile width.
- **How whitespace changes**: internal Hero spacing (headline→subheadline, subheadline→CTA, CTA→screenshot) compresses proportionally — 24px→16px, 32px→24px, 64px→32px — while the *inter-scene* 64px floor (top/bottom of the whole Hero) holds exactly at the Final Design Direction's specified minimum, never compressing further regardless of how narrow the viewport gets.
- **CTA row on mobile**: stacks to a single column — primary button first (full-width or near-full-width within the content padding), secondary link centered beneath it with 12px gap — rather than attempting to preserve a side-by-side row that would otherwise force uncomfortably small tap targets.

---

## Part 7 — Accessibility Review

- **WCAG AA/AAA**: headline/subheadline/body text against `background`/`foreground` exceeds WCAG AAA (near-black on pure white). Primary CTA label (`primary-foreground` on `primary` fill) must be independently verified at implementation time but is expected to clear WCAG AA for large/bold UI text given the token pairing was designed together (`--primary-foreground: 210 40% 98%` against `--primary: 207 100% 33%` is a high-contrast pairing by construction).
- **Keyboard navigation**: full Tab-order coverage of both CTAs (Part 5); no keyboard trap; the screenshot itself is non-interactive and correctly receives no tab stop.
- **Reduced motion**: the load-in fade/rise (reusing the project's existing `fade-in` keyframe/animation utility already defined in `tailwind.config.base.js` — `opacity 0→1`, `translateY(4px)→0`) and both hover transitions must be fully suppressed under `prefers-reduced-motion: reduce` — content renders immediately in its final resting position and color state, with no transition applied.
- **Screen readers**: the screenshot requires descriptive `alt` text (e.g., "TrafikskolaOS adminpanel som visar dagens schema och ekonomisk översikt") rather than a decorative empty `alt=""` — it is meaningful content, not decoration, per Part 4. Heading semantics: the headline should be the page's `<h1>`; the subheadline is not a heading (it's supporting body copy) and should not be marked up as `<h2>` merely because it looks like one visually.
- **Contrast**: verified above; the one item requiring implementation-time confirmation is the computed hover-darken value for the primary button (Part 3) — must be checked to ensure it doesn't inadvertently reduce label contrast below AA as the fill darkens.
- **Touch targets**: primary button at 48px height clears the 44×44px minimum; the secondary text link, having no defined container, must have its clickable/tappable area padded (even though not visually boxed) to at least 44×44px via invisible padding — a real accessibility requirement, not just a visual one, and one that's easy to miss precisely because the link has no visible container to remind an implementer of its hit-area.
- **Reading order**: DOM order matches visual order exactly (headline, subheadline, primary CTA, secondary CTA, screenshot) — no CSS-only reordering (e.g., flexbox `order`) that would desync visual sequence from assistive-technology reading sequence.

---

## Part 8 — Design Critique

**Weaknesses**: the Hero's restraint means its success depends almost entirely on the quality of a single asset — the screenshot. A mediocre or poorly-composed dashboard capture has no other design element in this Hero to compensate for it; Options B/C (Sprint 01) at least distributed visual interest across more elements. This is a real, accepted trade-off, not an oversight.

**Potential improvements**: the internal screenshot composition (Part 4) currently specifies *what* should be visible (schedule + KPI + one notification) at a level of confidence that assumes a well-populated demo/production environment exists to capture from — if no sufficiently realistic environment exists yet, this becomes a content-production dependency, not a design one, and should be flagged to whoever prepares the asset before implementation begins.

**Implementation risks**: the bespoke 1120px max-width (Part 1) diverging from the shared Tailwind `container` utility is the single highest-risk item for implementation drift — a future engineer reaching for the familiar `container` class instead of this Hero's specific wrapper would silently violate the approved composition. This should be called out explicitly in code review, not just in this document.

**Performance concerns**: a single, large, high-fidelity screenshot as the Hero's dominant asset means image optimization (responsive `srcset`/`sizes`, modern format such as `avif`/`webp` with fallback, and a properly sized mobile-specific crop rather than one oversized image scaled down by the browser) is not optional polish here — it is load-performance-critical, since this image is both the largest asset on the page and the first thing rendered.

**Long-term maintainability**: **high**, consistent with Sprint 01's own assessment — the entire specification reduces to a short, explicit list of values (three type sizes, one accent color, one shadow, one radius, fixed spacing multiples) that a future designer can audit a live implementation against directly, line by line, without ambiguity.

**Why this design is still recommended despite the above**: every identified risk is a *specific, named, checkable* implementation risk (asset quality, a wrapper-width mistake, image optimization diligence) rather than a *design* risk — nothing above suggests the composition itself is wrong, only that its execution has a small number of specific places where care is required. That is the expected profile for a genuinely restrained design: there is very little surface area for error, but the small surface area that exists matters more than it would in a more visually redundant design.

---

No wireframes, mockups, HTML, CSS, or React were produced in this document. Waiting for approval before implementation begins.
