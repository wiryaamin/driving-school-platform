# TrafikskolaOS — Product Screenshot & Asset Strategy

**Document Type:** Product Presentation Strategy (no implementation, no screenshots captured, no application changes)
**Status:** Draft — awaiting approval before any screenshot is captured
**Date:** 2026-07-09
**Governed by, does not revisit**: `docs/LANDING_PAGE_CREATIVE_BLUEPRINT.md` (Phase 4, screenshot journey), `docs/LANDING_PAGE_HERO_HIGH_FIDELITY_DESIGN.md` (Part 4, dashboard presentation), `docs/LANDING_PAGE_MESSAGING_STRATEGY.md`
**Implements the documented gap in**: `docs/LANDING_PAGE_HERO_IMPLEMENTATION_REPORT.md`, §3
**Role**: Product Presentation Director, Senior Product Designer, UX Storytelling Lead, Creative Director, Enterprise SaaS Art Director, Information Design Specialist

> **Grounding check performed before writing this document.** The repository already contains demo seed data (`supabase/seed/demo_sprint_1_10.sql`, `demo_full_data.sql`, `bootstrap_org_admin.sql`) — a bootstrap organization ("Trafikskolan AB," slug `trafikskolan`) with real, already-realistic Swedish names (Sara Lindberg, Marcus Pettersson, Freya Håkansson, Emil Bergström, instructor Johan Bergström) and a seeded vehicle (Skoda Octavia, fictional plate "DEF 456"). This existing data is genuinely good quality (Part 5 audits it honestly) but is the internal engineering/QA bootstrap environment, not a purpose-built marketing-capture environment — this strategy recommends a **separate, dedicated demo organization** for screenshot capture, so marketing imagery is never entangled with data used for other testing purposes, and so the org's own display name can be marketing-appropriate rather than the generic placeholder "Trafikskolan AB."

---

## Part 1 — The Hero Screenshot

**Which page**: the main Admin Workspace dashboard (`/dashboard`), the same landing view every authenticated user sees first — chosen specifically because it is the one screen that best embodies "operating system," not "app": it aggregates scheduling, students, and business status in one place, which is the exact category claim the Hero headline makes.

**Which modules should be visible**: within the single dashboard capture — (1) today's schedule/calendar summary (operational depth), (2) a KPI/overview panel showing a revenue or booking-count figure (business visibility), (3) the persistent sidebar navigation, partially visible, showing enough labeled module names (Bokningsschema, Elever, Ekonomi, etc.) to imply the system's breadth without needing a second screenshot.

**Which information should appear**: 4–6 realistic bookings on today's date across 2–3 instructors; one clear, legible KPI figure (e.g., "Denna vecka: 42 bokade lektioner" or a revenue figure); the organization name in the top bar/header, using the dedicated marketing demo org's name (Part 2), not "Trafikskolan AB."

**Which information should be hidden**: no personnummer or any field that would look like real personal data even though fictional (address details, birth dates) should not be visible in the captured frame — not because the data is real, but because a marketing screenshot showing sensitive-looking fields invites exactly the wrong question from a prospective buyer ("wait, is that real data?"). Financial figures should be plausible but rounded/clean-looking (e.g., "184 300 kr" rather than an oddly specific "184 327,42 kr") so the number reads as a real business snapshot, not an obviously synthetic one.

**Which workflow should be implied**: "a normal Tuesday morning, mid-week, the school is operating" — not a special/empty/onboarding state, and not an artificially perfect all-green state either; one or two bookings in a "pending confirmation" or similar realistic status is more credible than a screen where everything is already perfectly resolved.

**Which notification (if any) should appear**: exactly one, per the Hero Design Challenge's Part 3 recommendation — a genuine, natively-rendered booking-confirmation toast (e.g., "Bokningsbekräftelse skickad till Sara L.") positioned exactly where the real application renders it, not repositioned or exaggerated for the capture.

**Which date/time should be used**: **a relative, non-decaying reference wherever the UI itself supports it** (e.g., "Idag," "Denna vecka") rather than a hardcoded absolute calendar date baked into visible text. Where the interface unavoidably shows an absolute date (e.g., a calendar grid's date headers), this is treated as a **planned recapture dependency**, not a one-time asset — see Part 8, "Future maintenance." A screenshot with a visible date from months ago is a credibility risk the whole "Quiet Authority" trust argument cannot afford.

**Which demo data should populate the screen**: the dedicated marketing demo organization defined in Part 2, not the engineering bootstrap org.

**Why this is the strongest first impression**: it is the one screen that lets a visitor's own eyes do the work Part 1 of the Hero Design Sprint 01 objectives require (recognize "real software" within 3 seconds, "built for driving schools" within 10) — a scheduling-only screen would underclaim the product's breadth, and a finance-only screen would overclaim before the visitor has any context; the general dashboard is the one screen honestly positioned to be shown first.

---

## Part 2 — Demo Data Strategy: A Realistic Fictional Driving School

**School**: **Lindholms Trafikskola**
**City**: **Uppsala** — chosen deliberately over Stockholm (already the default assumption in nearly every Swedish driving-school example found during the Product Design Strategy's competitive research) to read as a real, specific, mid-size Swedish city rather than a generic capital-city placeholder.
**Naming rationale**: "Lindholms" follows the real, observed Swedish driving-school naming convention (surname/place + "Trafikskola" — matching real examples found during competitive research: Kullens Trafikskola, Svedala Trafikskola, Ardins Trafikskola) rather than an invented, overly branded startup-style name — the demo org should look like a real, established Swedish business, not a fictional SaaS logo.

**Students** (Swedish names, realistic age spread 16–45, mixed permit stages — extending the pattern already present in the real seed data rather than contradicting it):
- Elin Karlsson (17, permit stage: körlektioner pågår)
- Oskar Nilsson (23, permit stage: uppkörning bokad)
- Amanda Svensson (35, permit stage: teori pågår — adult learner, common and realistic)
- Noah Andersson (18, permit stage: riskutbildning genomförd)
- Wilma Gustafsson (16, permit stage: introduktionsutbildning)

**Instructors** (mixed employment types, matching the real `employed`/`contractor` distinction already in the platform):
- Mikael Holm (anställd, ADI-certifierad, kategori B + BE)
- Sofia Bergqvist (anställd, ADI-certifierad, kategori B)
- Anders Ekström (konsult, kategori B + A)

**Vehicles** (realistic Swedish driving-school fleet — small hatchback/sedan models genuinely common in Swedish driving instruction, matching the real seed's own Skoda choice):
- Volkswagen Golf (2023) — fiktiv skylt "LTS 112"
- Skoda Octavia (2022) — fiktiv skylt "LTS 118"
- Volkswagen Golf (2024) — fiktiv skylt "LTS 121"

**Lessons/bookings**: a realistic weekly rhythm — roughly 35–50 lessons/week across three instructors, standard slot intervals (matching the platform's own documented standard: 07:00–08:30 through 15:00–16:30), a small number of theory-group sessions, one or two waitlisted students for a popular time slot (a small, credible imperfection is more believable than a fully saturated or fully empty calendar).

**Revenue**: a plausible small-to-mid Swedish trafikskola monthly figure — roughly **180 000–220 000 kr/month**, clean round-ish numbers on screen (Part 1) rather than an artificially precise figure.

**Invoices**: a mix of paid, sent, and one slightly-overdue invoice (again, a small realistic imperfection, not a uniformly "perfect" state) — supports the finance-proof screenshot (Scene 4, future sprint) more than the Hero itself, but should be seeded consistently now so later sprints don't need a second data-population pass.

**Calendar**: populated for the current week at capture time, with the relative-date framing from Part 1.

**Notifications**: 2–3 realistic recent items in the activity/notification log (a booking confirmation, a payment received, an instructor availability update) — enough to make the communication module credible if it appears in a later scene, without needing to be invented separately then.

**Reports**: a modest, realistic booking-statistics and revenue trend — gently positive (a growing, healthy small business), never a dramatic hockey-stick chart, which would read as fabricated rather than authentic.

**No Lorem Ipsum, no unrealistic statistics — explicit compliance check**: every name, figure, and status above is deliberately unremarkable and specific rather than round/generic ("184 300 kr," not "100 000 kr" or "999 999 kr") — matching the same honesty discipline enforced throughout every prior document in this program.

---

## Part 3 — Screenshot Story (Complete Landing Page Requirement)

*(Covers the full eight-scene Creative Blueprint for planning completeness, even though only the Hero screenshot is in scope to capture in this sprint — later sprints will consume this same plan rather than re-deriving it.)*

| # | Purpose | Module | Workflow | Business value | Message | Audience | Scene | Crop | Device | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Establish immediate product legitimacy | Dashboard (overview) | Daily landing view | Operational + business visibility in one place | "This is real software" | All personas | Hero (Scene 1) | Straight-on, full dashboard, tight to interface edges | Desktop | **P0 — required for current sprint** |
| 2 | Deliver the hardest-to-copy differentiator | Ledger / SIE4 export | Year-end close / VAT reconciliation | Swedish accounting depth | "Built for Swedish bookkeeping" | Owner, Finance Manager | Finance Proof (Scene 4) | Full-bleed, elevated (the one approved exception) | Desktop | P1 — future sprint |
| 3a | Role relevance — owner | Dashboard KPI view | Business health check-in | "What do I see?" | Owner | Roles (Scene 5) | Framed inset | Desktop | P1 — future sprint |
| 3b | Role relevance — operations | Scheduling / multi-instructor grid | Daily coordination | Fewer double-bookings | "Will this reduce friction?" | Operations Manager | Roles (Scene 5) | Framed inset | Desktop | P1 — future sprint |
| 3c | Role relevance — finance | Ledger day-to-day view | Ongoing bookkeeping, not just year-end | "Useful monthly, not just annually" | Finance Manager | Roles (Scene 5) | Framed inset | Desktop | P1 — future sprint |
| 3d | Role relevance — instructor | Instructor Portal / Instructor App schedule | Checking today's lessons between sessions | "Will my instructors use this?" | Instructor | Roles (Scene 5) | Framed inset, cropped/zoomed | **Mobile** (deliberately, per Creative Blueprint Phase 4) | P1 — future sprint |

**Screenshots deliberately not planned**: a feature-icon-grid montage, a "trusted by" logo composite, or any generic marketing collage — consistent with the Final Design Direction's explicit rejection of these patterns (Part 3, "Card design"). Every entry above ties to one specific scene and one specific claim; nothing exists "because it looks attractive."

---

## Part 4 — Screenshot Composition

*(Full specification for Screenshot #1, the current sprint's actual deliverable; the same composition discipline applies to #2–3d when their sprints begin.)*

| Attribute | Specification | Why |
|---|---|---|
| Aspect ratio | 16:9 (matches `ScreenshotFrame`'s existing implementation) | Already implemented and approved (High-Fidelity spec, Part 4) |
| Crop | Tight to the application's own top bar through the visible content boundary — no OS chrome, no browser chrome | Keeps the product, not its container, as the subject (High-Fidelity spec, Part 1) |
| Padding | None added in post — the app's own internal layout padding is the only padding present | A screenshot with artificial marketing padding around real UI reads as staged |
| Frame treatment | Handled entirely by `ScreenshotFrame` (hairline border, two-layer shadow, 8px radius) — the raw capture itself should have zero frame/border baked in | Keeps the frame a presentation-layer concern, reusable and adjustable without re-capturing |
| Visible navigation | Sidebar partially visible (enough to read 4–5 module labels), top bar fully visible | Implies system breadth (Part 1) without a second screenshot |
| Scroll position | Top of page, default landing scroll position — never mid-scroll | A mid-scroll capture looks accidental, not composed |
| Open dialogs | None | A dialog mid-capture implies an interrupted, unfinished moment, not a calm "this is the product at rest" statement |
| Expanded menus | None | Same reasoning — no dropdown/menu should be open in the capture |
| Notifications | Exactly one, natively positioned (Part 1) | Matches the Hero Design Challenge's specific, approved recommendation — evidence, not decoration |
| Mouse cursor visibility | **Not visible** | An arbitrary cursor position in a static marketing image reads as an accidental capture, not a deliberate one; Figma's own marketing (Product Design Strategy, Phase 2) shows cursors only when demonstrating live *collaboration*, which doesn't apply to a solo dashboard view here |
| Focus state | None active (no visibly focused input/button) | A stray focus ring in a marketing screenshot looks like an artifact, not a feature |
| Selection state | None (no selected table row, no highlighted text) | Same reasoning — the screen should read as "at rest," not mid-interaction |

---

## Part 5 — Data Quality Audit (of the Existing Seed Data)

**What looks unrealistic**: nothing found in the sampled seed content is Lorem-Ipsum-like or obviously fake — the existing student/instructor names (Sara Lindberg, Marcus Pettersson, Freya Håkansson, Emil Bergström, Johan Bergström) and the vehicle record (Skoda Octavia, fictional plate "DEF 456") are already realistic and usable as a *pattern* to extend.

**What should be removed**: nothing in the sampled data needs removal — the concern is not data quality but **data provenance**: this dataset lives in the engineering bootstrap organization (`trafikskolan` / "Trafikskolan AB"), used for QA and development. Capturing marketing screenshots from the same org that other engineering/testing work touches risks a future test action (a seed re-run, a manual QA edit) silently altering what a live marketing screenshot depicts, or a screenshot accidentally including test-only artifacts.

**What should be anonymized**: nothing — all sampled data is already fictional, not real personal data, so no anonymization is required, only a fresh, dedicated data set (Part 2) to avoid cross-contamination with QA activity.

**What should be renamed**: the organization's own display name. **"Trafikskolan AB" is too generic for public marketing use** — it reads as a literal placeholder ("The Driving School Inc.") rather than a specific, credible business, which undermines exactly the authenticity this whole strategy is trying to establish. This is the single clearest, most actionable finding of this audit.

**What should be simplified**: financial figures in any future finance-proof capture (Screenshot #2) should avoid unnecessarily precise decimal figures on screen (Part 2) — a minor future-sprint note, not applicable to the current dashboard-only capture.

**What should be highlighted**: the existing data's realistic Swedish naming convention should be treated as a **pattern to follow**, not a one-off — Part 2's new demo school deliberately extends the same naming register (real Swedish first/last name combinations, plausible phone/email formats) rather than inventing a stylistically different fictional universe.

**Conclusion**: the existing seed data's *quality* is a genuine asset, not a liability — the actionable finding is entirely about **separation** (a dedicated marketing demo org) and **naming** (a specific, credible school name instead of a generic placeholder), not about rebuilding data quality from scratch.

---

## Part 6 — Capture Plan (Screenshot #1 Only — Current Sprint Scope)

| Field | Specification |
|---|---|
| Exact route | `/dashboard` |
| Required user role | `org_owner` or `org_admin` (full dashboard visibility, no permission-gated blank panels) |
| Window size | 1440 × 900px (captures comfortably above the Hero's 1120px content width with natural browser chrome margin, avoiding any forced upscaling) |
| Browser zoom | 100% (no OS/browser-level zoom adjustment) |
| Theme | Light mode (matches the Hero's approved light-mode-first color system, High-Fidelity spec Part 3) |
| Resolution | Capture at 2x device pixel ratio (retina) for crisp display at the Hero's rendered size on high-DPI screens, per the High-Fidelity spec's stated resolution requirement |
| Responsive breakpoint | Desktop only for this sprint (Screenshot #1 is desktop-only per Part 3's table; the mobile-specific capture, #3d, belongs to a future sprint) |
| Data prerequisites | Dedicated "Lindholms Trafikskola" demo organization seeded per Part 2, populated for the current capture week, with the one notification toast (Part 1) triggered naturally (not manually inserted as a static UI element) |
| Interactions required before capture | Navigate to `/dashboard`, allow all async data to finish loading (no skeleton/loading states visible), trigger the one real booking-confirmation action so its toast is genuinely on-screen at capture time, then capture immediately before the toast's natural dismissal timeout |
| Expected filename | `hero-dashboard-desktop@2x.png` (or `.webp`/`.avif` per Part 7/8's optimization pipeline) |

---

## Part 7 — Post-Processing Rules

**Allowed**:
- Minor cropping (tightening the frame to the exact required aspect ratio/composition)
- Brightness/exposure adjustment (correcting for capture-environment lighting inconsistency only — not stylizing)
- Compression (for file-size/performance, per Part 8)
- Retina/resolution optimization (generating the correctly-sized derivative files for each responsive breakpoint)
- Lossless cleanup (removing capture-tool artifacts such as a stray OS cursor or a browser extension badge that leaked into frame)

**Not allowed** (all directly re-affirming this program's honesty discipline, carried through from every prior document):
- Fake UI elements added in post
- Fabricated charts or figures not actually rendered by the real application
- Invented notifications composited in after the fact
- Photoshop manipulation of functionality (e.g., editing a status badge's text or color to look more impressive than what the product actually renders)
- Marketing embellishments (glow effects, added gradients, artificial "premium" filters)

**Standing rule**: every published screenshot must be traceable back to a specific, real, reproducible application state — route, data, and interaction — exactly as documented in the Capture Plan (Part 6). If a future stakeholder asks "is this real," the honest answer must always be yes.

---

## Part 8 — Implementation Plan (Integration Path, for the Follow-Up Implementation Sprint)

**File structure**: `apps/web/public/marketing/hero-dashboard-desktop@2x.{avif,webp,png}` — a dedicated `marketing/` subdirectory within the existing `public/` folder, separate from the app icons already there, so marketing assets are easy to locate and don't get confused with application/PWA assets.

**Asset naming**: `{scene}-{content}-{breakpoint}[@2x].{format}` — e.g. `hero-dashboard-desktop@2x.avif`, `hero-dashboard-mobile.avif` (once a mobile-specific crop exists per the Hero Implementation Report's disclosed gap) — descriptive, sortable, and self-documenting without needing a lookup table.

**Optimization**: modern format first (`avif`, with `webp` fallback, `png` as a final fallback for maximum compatibility) via a `<picture>` element or equivalent responsive-image handling — directly resolving the performance gap flagged in the Hero Implementation Report §6/§7.

**Lazy loading**: `loading="lazy"` and `decoding="async"` are already wired on `ScreenshotFrame`'s `<img>` element (Hero Implementation Report) — no change needed, only a real `src` (or `srcset`) to populate.

**Responsive image handling**: once the mobile-specific crop (Part 3, Screenshot #3d's pattern, applied here too if a future mobile Hero treatment is ever needed) exists, wire it via `srcset`/`sizes` or a `<picture>` breakpoint switch — the desktop-only scope of this sprint means only a single desktop asset needs wiring immediately.

**Accessibility**: the existing `alt` text already specified in the Hero component ("TrafikskolaOS adminpanel som visar dagens schema och ekonomisk översikt") remains accurate and requires no change once the real asset replaces the placeholder.

**Future maintenance**: because Part 1 recommends relative-date framing wherever possible, most captures should remain valid for an extended period without recapture. Where an absolute date is unavoidably visible, establish a lightweight recurring reminder (e.g., a quarterly calendar note, not a new engineering system) to recapture — this is an operational process decision, not a new piece of infrastructure to build.

---

## Part 9 — Executive Review

**Would these screenshots look at home on Stripe, Linear, Figma, Notion, or Vercel?** Yes, on the composition discipline (Part 4) — no cursor artifacts, no mid-interaction states, tight and deliberate framing, real populated data. The one meaningful difference, by design, is subject matter: none of those benchmark products show an accounting ledger or a driving-school schedule, because none operate in this domain — the *craft* of the capture matches theirs; the *content* is authentically TrafikskolaOS's own.

**Would they create confidence?** Yes — per Part 2's data quality discipline (clean but not suspiciously round figures, one small realistic imperfection like an overdue invoice or a waitlisted slot) and Part 1's "normal Tuesday" workflow framing, the screenshot should read as a real, functioning business snapshot rather than a staged demo.

**Would they accurately represent TrafikskolaOS?** Yes — every element specified (modules visible, notification, data) maps to a real, shipped capability (Enterprise Architecture Handbook, Section 11) — nothing in this plan requires or implies a feature that doesn't exist.

**Would they make a driving school owner curious to learn more?** This is the one place the Board pressure-tested itself hardest: a single dashboard screenshot alone is a modest ask of a visitor's curiosity compared to, say, an interactive product demo. The answer is yes, *conditional on* the surrounding Hero copy and the promise of what follows (Scene 3's system map, Scene 4's finance proof) — the Hero screenshot's job (Part 1) was never to close the sale by itself, only to earn the credibility to keep scrolling, which this plan is scoped correctly to achieve.

**Refinement made as a result of this review**: the explicit recommendation (Part 5) to move off the generic "Trafikskolan AB" placeholder name and onto a specific, credible school identity (Part 2) — this was the one finding that materially changes the plan versus simply reusing what already exists, and it's the change most directly motivated by this Part 9 self-challenge.

---

## Summary of Decisions Requiring Your Approval

1. A new, dedicated "Lindholms Trafikskola" (Uppsala) marketing demo organization should be seeded, separate from the existing engineering bootstrap org.
2. Screenshot #1 (Hero, desktop, `/dashboard`) is the only capture in scope for the next implementation step — Screenshots #2–3d remain planned but deferred to their respective future scenes/sprints.
3. Relative-date framing should be used wherever the UI supports it, to avoid the Hero screenshot visibly aging.
4. No screenshot will ever be altered beyond the Part 7 allowed list — fabrication of any kind is categorically excluded.

Do NOT implement. Do NOT capture screenshots. Do NOT modify the application. Do NOT proceed to Scene 2. Waiting for approval before any screenshot is captured.
