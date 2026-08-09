# TrafikskolaOS — Screenshot Production Guide

**Document Type:** Product Presentation Planning Document (no implementation, no screenshots captured, no application changes)
**Status:** Draft — awaiting approval before any code change, data seed, or screenshot capture
**Date:** 2026-07-16
**Extends:** `docs/LANDING_PAGE_SCREENSHOT_ASSET_STRATEGY.md` ("the Draft Strategy") — that document's Part 1 (Hero screenshot spec), Part 2 (demo organization and dataset), Part 4 (composition rules), and Part 7 (post-processing rules) are adopted here unchanged and extended to five additional screens identified by the Product Presentation & Marketing Asset Audit. Nothing in that document is contradicted.
**Grounded in:** a live, logged-in audit of the actual rendered Tenant Workspace (this session's Product Presentation & Marketing Asset Audit), not documentation alone.

---

## Part 0 — What This Adds to the Draft Strategy

The Draft Strategy planned one screenshot (Dashboard/Hero) in detail and sketched three future scenes. The live audit that followed identified which *already-implemented* screens are actually strong enough to use, and — critically — found real functional and data problems standing in the way of some of them. This guide turns those findings into a production-ready spec, screen by screen.

---

## Part 1 — Blocking Issues (Must Be Resolved Before Capture)

These were discovered live, not inferred from code, and block specific screens below:

1. **Instructors list fetch error** — `/instructors` returns "Det gick inte att hämta lärarlistan" (failed to fetch) rather than a list or a genuine empty state. Blocks: Dashboard (instructor status panel), Scheduling (calendar has no instructors to render against), and the Instructors screen itself.
2. **Students/Kunder list shows zero despite other screens showing real customer activity** — the Students list reads "Inga kunder registrerade" (0 total) while Insights, in the same session, shows named customers with real birthdays and a "17 new customers" stat. This is inconsistent enough to be a real bug, not sparse data, and should be traced before relying on either screen. Blocks: Dashboard (elevstatus panel), Scheduling, Students itself.
3. **Corporate Customers and Communication are gated behind a Starter-tier subscription** — the audit account is on "Testperiod," which shows a lock screen instead of the module. This is correct product behavior, not a bug, but means capturing either module requires a Starter-or-higher `subscription_tier` on whichever org is used for capture — a data/config decision, not a code fix.
4. **Data provenance, reaffirmed** — the Draft Strategy already recommended a dedicated marketing demo org, specifically to avoid engineering/QA activity silently altering what a screenshot depicts. Issues #1 and #2 above may well be exactly that kind of contamination (an unrelated QA action against the bootstrap org). This guide treats moving to the dedicated org as the correct fix path for #1 and #2, to be confirmed rather than assumed — if the same errors reproduce in a fresh org, they're real product bugs and need an engineering fix instead.

**Recommendation:** use the dedicated **Lindholms Trafikskola** organization (Draft Strategy Part 2) for every screen in this guide, not only the Hero. Capturing from the engineering bootstrap org (`Trafikskolan AB`) is the same risk the Draft Strategy already flagged, now with live evidence of what that risk looks like in practice.

---

## Part 2 — Master Dataset (Extends Draft Strategy Part 2)

The Draft Strategy's Lindholms Trafikskola profile (Uppsala; students Elin Karlsson, Oskar Nilsson, Amanda Svensson, Noah Andersson, Wilma Gustafsson; instructors Mikael Holm, Sofia Bergqvist, Anders Ekström; vehicles LTS 112/118/121; 35–50 lessons/week; 180–220k kr/month revenue) is adopted wholesale as the single dataset behind every screen in this guide, so every screenshot on the eventual landing page depicts *one consistent business*, not five unrelated snapshots. Extensions needed for the screens this guide adds:

- **Booking fill rate**: near-term lesson slots should be **50–70% booked**, not empty. The live-captured Insights screen showed six identical "0 av 1, 0% bokat" rows — a real credibility problem distinct from any code bug. This is a seeding parameter, not a defect.
- **Small, deliberate imperfections, kept small**: 1–2 customers with a modest outstanding balance (not 3+, which starts to read as a business in trouble), one vehicle with a besiktning slightly overdue (this exact detail, live-captured, was the single most credible element found in the whole audit — preserve it deliberately, don't accidentally seed it away).
- **Finance widgets need populating**: the live Finance Overview capture had two empty panels ("Inga betalningar registrerade," "Inga fakturor skapade") beneath an otherwise strong screen — needs 3–5 recent payments and 3–5 recent invoices, matching the Draft Strategy's already-specified paid/sent/one-overdue mix.
- **Report history depth**: date-range reports (Försäljningsrevision, Intäktsanalys) need 8–12 weeks of prior activity seeded, not just the current week, so a "trend" report shows an actual trend rather than one data point.
- **Corporate customer** (only if that module is included in a future capture pass): one named company account with a handful of enrolled employees, consistent with the same Lindholms identity.

---

## Part 3 — Per-Screen Production Spec

### 3.1 Dashboard (Tenant Workspace home)

1. **Functional issues**: blocked by Part 1, issues #1 and #2 — cannot be meaningfully captured until instructor and student data render correctly.
2. **Missing/inconsistent data**: today's-schedule panel, instructor-status panel, and weekly-bookings count all need real values (live capture showed "0" and empty states throughout).
3. **Ideal dataset**: Part 2's master dataset, viewed mid-week ("a normal Tuesday," per the Draft Strategy) — not a Monday-morning-empty or Friday-afternoon-wrapping-up state.
4. **Ideal filters/layout**: default landing view, "Kommande lektioner" tab active (not "Pågående lektioner").
5. **Exact crop**: full 1440×900 viewport, top of page, no scroll, no open menus or dialogs — matches Draft Strategy Part 6 exactly.
6. **Annotations**: none — this is the Hero shot; per Design Direction V2's standing constraints, no device chrome and no added callouts on the primary product image.
7. **Desktop/mobile**: desktop only for this screen. The Hero's existing dual-screenshot composition already covers the "responsive" story elsewhere; don't duplicate it here.
8. **Why this over alternatives**: it's the only screen that shows scheduling, student status, and business KPIs together in one frame — the literal "operating system, not app" claim the Hero headline makes. No other single screen aggregates this much.

### 3.2 Ekonomiöversikt (Finance Overview)

1. **Functional issues**: none — this screen rendered correctly and completely in the live audit.
2. **Missing data**: the two bottom panels ("Senaste betalningar," "Senaste fakturor") were empty; needs populating per Part 2.
3. **Ideal dataset**: Draft Strategy's invoice mix (mostly paid, one sent, one slightly overdue); revenue figures at the Draft Strategy's 180–220k kr/month scale — the live-captured figures (23 337 kr fakturerat) read as too small for a scaled business and should be replaced, not reused as-is.
4. **Ideal filters/layout**: default "denna månad" view, no custom date range.
5. **Exact crop**: from the top KPI row through the "Betalningar & Kundhantering" tool grid — include the bottom "senaste" panels only once populated per point 2.
6. **Annotations**: none for the landing page context (V2's screenshots-stand-alone rule); a Resources-page use of this same asset could reasonably add a callout on specific tool names, but that's a separate decision outside this guide's scope.
7. **Desktop only** — the information density here doesn't have a mobile equivalent in the product.
8. **Why this over alternatives**: it's the single screen that proves "Byggt för svensk bokföring" with real, specific tool names (BAS, SIE4, AGI, Momsperioder) all visible at once — no other screen demonstrates this much compliance depth in one frame, and it maps almost line-for-line to copy already shipped in Proof/Compliance.

### 3.3 Resurser — Fordon (Vehicle Management)

1. **Functional issues**: none — the strongest screen captured in the audit, no fixes required.
2. **Missing data**: none.
3. **Ideal dataset**: preserve the live-captured configuration almost exactly — three vehicles, one with an overdue besiktning generating the alert banner. This specific "2 compliant, 1 flagged" ratio is deliberate and should not be accidentally seeded away to an all-green state, which would remove the single most credible detail found in this entire audit.
4. **Ideal filters/layout**: "Fordon" tab active (not Underhåll/Besiktning/Platser/Utnyttjande).
5. **Exact crop**: from the "Besiktning förfallen" alert banner through the bottom of the vehicle table.
6. **Annotations**: none — the alert banner and compliance badges are already self-explanatory.
7. **Desktop only.**
8. **Why this over alternatives**: the only screen in the audit that pairs an already-shipped, specific claim ("besiktning, försäkring och service följs automatiskt") with live visual proof of exactly that claim in the same frame — show-don't-tell in its purest form on this platform.

### 3.4 Rapporter — Grundrapporter (Reports)

1. **Functional issues**: none.
2. **Missing data**: not applicable — this screen shows report *tools*, not report *results*; no underlying business data needs to be visible in the capture itself.
3. **Ideal dataset**: general Lindholms org population is sufficient background context; nothing screen-specific required.
4. **Ideal filters/layout**: "Grundrapporter" category selected, default date ranges as shown.
5. **Exact crop**: top ~1200px — the first three rows (12 cards), prioritizing the most recognizable names (Försäljning, Betalningsöversikt, Momsberäkning, Transportstyrelsen) without needing the full 24-card scroll.
6. **Annotations**: none.
7. **Desktop only** — inherently a dense utility screen.
8. **Why this over alternatives**: communicates platform *breadth* more credibly than any amount of copy could — 24 distinct, named, real reporting tools visible at once is concrete evidence of depth.

### 3.5 Insikter — Översikt (Insights)

1. **Functional issues**: the "Kommande lediga kurser" list showing six identical 0%-booked rows is a data-population gap, not a code bug — fix via Part 2's booking-fill-rate parameter. Separately, this screen's real customer activity, set against the Students list's "zero," is worth tracing back to Part 1 issue #2 before trusting either screen fully.
2. **Missing/inconsistent data**: see above.
3. **Ideal dataset**: Part 2's dataset with near-term slots at 50–70% booked; 1–2 (not 3+) customers with a small outstanding balance.
4. **Ideal filters/layout**: "Översikt" tab active (not Demografi/Elevtrender/KPI/Kohorter/Rapporter).
5. **Exact crop**: top through "Kommande lediga kurser," trimmed to 2–3 rows regardless of booking percentage, to avoid the repetitive-row problem outright.
6. **Annotations**: none.
7. **Desktop only.**
8. **Why this over alternatives**: the only screen that communicates business *momentum* (growth percentage, new-customer count) rather than a static snapshot — pairs naturally with Business Transformation's "från kaos till kontroll" narrative because it shows forward motion, not just a state.

### 3.6 Bokningsschema (Scheduling Calendar)

1. **Functional issues**: blocked by Part 1 issue #1 — the calendar cannot render events without instructor data resolving correctly.
2. **Missing data**: needs real bookings across the current week, multiple instructors, mixed lesson types.
3. **Ideal dataset**: Part 2/Draft Strategy's 35–50 lessons/week across three instructors, including one waitlisted student.
4. **Ideal filters/layout**: "Vecka" view (not Dag/5 veckor), no instructor filter applied (show all three).
5. **Exact crop**: full calendar grid, Monday–Friday minimum, full viewport width.
6. **Annotations**: none.
7. **Desktop primary.** A mobile capture is worth considering separately using the Instructor App's own "Schema" view (genuinely mobile-first) rather than this admin calendar scaled down.
8. **Why this over alternatives**: the most direct visual proof of "instruktörsmedveten bokning" (already-shipped copy) — a color-coded, multi-instructor week view makes the scheduling claim tangible in a way text can't.

---

## Part 4 — Capture Sequence

1. Fix or confirm-does-not-reproduce: Part 1 issues #1 (instructor fetch) and #2 (student data mismatch) — ideally by testing fresh in the new dedicated org before assuming either is a code bug.
2. Seed the dedicated Lindholms Trafikskola organization per Part 2 (extends Draft Strategy Part 2).
3. Capture in this order, ready-to-least-ready: **Vehicles** (no blockers) → **Reports** (no blockers) → **Finance** (needs two panels populated) → **Insights** (needs booking-fill data) → **Dashboard** (needs both Part 1 fixes) → **Scheduling** (needs the instructor fix).

---

## Part 5 — Carried Forward Unchanged from the Draft Strategy

Composition rules (Draft Strategy Part 4 — no cursor, no open menus, no mid-interaction state, tight crop to interface edges), post-processing rules (Part 7 — no fabricated UI, no invented figures, every published image traceable to a real, reproducible application state), and file/naming structure (Part 8) apply identically to every screen in this guide, not only the Hero. Nothing here loosens that discipline.

---

## Summary of Decisions Requiring Approval

1. Move all screenshot production — not just the Hero — to the dedicated Lindholms Trafikskola organization, per Part 1's recommendation.
2. Investigate Part 1 issues #1 and #2 as the first step, before any data seeding, to determine whether they're bugs or bootstrap-org-specific noise.
3. Seed the extended dataset in Part 2 (booking fill rate, populated finance widgets, report history depth) alongside the Draft Strategy's existing plan.
4. Capture in the sequence given in Part 4, starting with the two screens that need zero fixes (Vehicles, Reports) so production isn't blocked waiting on engineering.

**Do NOT implement. Do NOT seed data. Do NOT capture screenshots. Do NOT modify any screen.** This document is planning only, per this sprint's explicit instruction. Waiting for approval before any of the above proceeds.
