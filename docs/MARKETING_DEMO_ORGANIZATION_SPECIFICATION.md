# TrafikskolaOS — Marketing Demo Organization Specification

**Document Type:** Permanent Governance Specification (no implementation, no data seeding, no application changes)
**Status:** Approved — Version 1.0, frozen. Future changes follow the formal governance and document revision process (Part 9), not iterative enhancement.
**Specification Version:** 1.0
**Date:** 2026-07-16
**Supersedes and formalizes:** the organization/dataset profile sketched in `docs/LANDING_PAGE_SCREENSHOT_ASSET_STRATEGY.md` Part 2 (Lindholms Trafikskola) — that profile is adopted here as the canonical, permanent identity, not replaced.
**Extends:** `docs/LANDING_PAGE_SCREENSHOT_PRODUCTION_GUIDE.md` — that document's per-screen production specs remain valid and now formally reference this specification as their data source.
**Governed by, does not revisit:** `docs/LANDING_PAGE_FINAL_DESIGN_DIRECTION_V2.md` (composition), the approved Buyer Journey, the approved Information Architecture.

---

## Document Control

| Field | Value |
|---|---|
| Document Title | TrafikskolaOS — Marketing Demo Organization Specification |
| Document Type | Controlled Governance Specification |
| Status | Approved |
| Version | 1.0 |
| Document Owner | Product Governance Board |
| Approval Authority | Product Governance Board |
| Classification | Controlled Document |
| Effective Date | 2026-07-16 |
| Next Review | Prior to Version 2.0, or earlier if triggered by Part 9's review cadence |
| Supersedes | The draft (pre-approval) state of this same specification |

## Related Governance Documents

| Document | Relationship |
|---|---|
| `docs/LANDING_PAGE_SCREENSHOT_ASSET_STRATEGY.md` | This specification formalizes and supersedes that document's Part 2 (the Lindholms Trafikskola organization/dataset profile) as the canonical, permanent identity. Its Part 1, Part 4, and Part 7 composition and post-processing rules remain independently valid and are carried forward by reference throughout this specification. |
| `docs/LANDING_PAGE_SCREENSHOT_PRODUCTION_GUIDE.md` | This specification is that document's canonical data source. Its per-screen production specs remain valid and reference this specification for identity, people, and data. |
| `docs/LANDING_PAGE_FINAL_DESIGN_DIRECTION_V2.md` | Governs landing-page composition; this specification does not revisit it. |

**Note on scope of this list**: earlier reviews in this program referenced an "Experience Architecture," a "Platform Taxonomy," and a "Visual Design Language" as related governance. Those were produced as analysis during this program but were not saved as standalone documents in `docs/` — they exist only as prior conversation output, not as files this specification can correctly cite as related documents. They are not listed above for that reason, consistent with the instruction to reference only documents that already exist. If any of the three is formally written and saved as its own governance document in the future, this list should be revised to include it.

---

## Part 0 — Purpose and Authority

Every prior document in this program specified *what one screenshot should show*. None specified *the one business every screenshot, video, demo, and document should be showing*. This document is that specification. From this point forward:

- No screenshot, video, sales demo, or documentation image is produced against any organization other than the one defined here, unless a future, explicit governance decision creates a second sanctioned demo organization for a stated, different purpose.
- No name, figure, date, or status appearing in any public-facing asset may contradict this document without this document being formally revised first.
- Future features, modules, and screens integrate into this specification by extending it, not by inventing parallel, disconnected demo data.

**Standard**: credibility, not perfection. Every design principle below exists to prevent the two opposite failure modes this program has already identified in practice — data so sparse it looks unfinished (the live-audited engineering bootstrap org), and data so uniformly perfect it looks staged (a hypothetical all-green, all-round-numbers demo). The target is a business that looks real because it looks *lived-in*.

### Scope of Authority

**This specification governs:**
- The Marketing Demo Organization (Lindholms Trafikskola) — its identity, people, and business structure
- Demonstration data — volumes, temporal consistency, and the design standard governing how it should look
- The Screenshot Library — content, lifecycle, versioning, and quality
- Marketing assets derived from the demo organization
- Public product representation across the landing page, documentation, sales, and training materials

**This specification does not govern:**
- Infrastructure and hosting environment topology — governed by the platform's architecture documentation
- Deployment and CI/CD processes — governed by engineering release process
- Authentication, credential management, and access provisioning — governed by security/access governance
- Platform security and operations — governed by operational runbooks and security governance
- Engineering processes (Definition of Done, feature development workflow) — governed by engineering process documentation
- Real customer tenants and their data — entirely out of scope; this specification concerns only the fictional demo organization

Where this specification's content depends on one of the areas above — the demo organization's hosting environment or credential handling, for example — that dependency is real but is not defined here. It is governed by whichever document owns that responsibility, and this specification defers to it rather than absorbing it.

### Governance Authority

This specification is the authoritative reference for the demo organization's identity, demonstration data, screenshot content, the screenshot library, and public marketing representation. Where a marketing asset — a screenshot, a piece of copy describing product capability, a sales demonstration — appears to conflict with the current implementation, this specification governs the *intended* marketing representation until it is formally revised. An implementation gap is a reason to revise this specification or fix the implementation, not a reason for an asset to silently drift from what's documented here.

---

## Part 1 — Organization Profile

| Attribute | Specification | Why |
|---|---|---|
| **Name** | **Lindholms Trafikskola** | Carried forward from the Draft Strategy. Follows the real, observed Swedish driving-school naming convention (surname/place + "Trafikskola") rather than an invented startup-style brand — reads as an established business, not a demo placeholder. |
| **City / Region** | Uppsala, Uppsala län | Deliberately not Stockholm — avoids the default assumption of nearly every competitor screenshot researched during the Product Design Strategy. Uppsala is a real, specific, mid-size Swedish city large enough to plausibly support a multi-location school (Part 2). |
| **Organization number (organisationsnummer)** | Format `556XXX-XXXX` (the standard prefix for a Swedish aktiebolag), Luhn-valid, generated and checksum-verified at implementation time — not hardcoded in this document. | A specific fabricated number is deliberately not published in a governance document; the *format and generation rule* is specified here, the actual digits are generated once, verified against the Luhn check the platform's own validator already enforces, and confirmed not to collide with a real registered entity before first use. |
| **VAT number (momsregistreringsnummer)** | `SE` + the organization number (no hyphen) + `01`, per the standard Swedish derivation rule | Not a separate fabrication — it's mechanically derived from the org number above, so it can never drift out of sync with it. |
| **Address** | A street address in central Uppsala, in the business/commercial district (illustrative pattern: a numbered address on a common, non-identifying street name), specific postal code to be selected and verified at implementation time | Specifies the *area and pattern*, not a real, verified street address — avoids ever depicting a real, currently-occupied building as this fictional business's premises. Finalize with a real, valid Uppsala postal code before first public use. |
| **Branding** | Uses the platform's own default org-badge treatment — an initials-based colored badge (**"LT"**), matching what the live audit observed for the existing bootstrap org ("TA" for Trafikskolan AB) | No custom-logo-upload capability was confirmed as implemented during this program's audits. Specifying a custom logo here would imply a feature that may not exist — the badge-based default is the honest, grounded choice. If org-logo upload is confirmed as a real capability in a future audit, this section should be revised to specify an actual demo logo. |
| **Business description** | "Lindholms Trafikskola erbjuder körkortsutbildning för personbil (B), motorcykel (A) och risktvåutbildning i Uppsala med omnejd, med fokus på personlig handledning och moderna arbetssätt." | Plain, factual, matches the calm/specific register already established across every approved landing-page document — not a slogan. |
| **Opening hours** | Mon–Fri 08:00–18:00, Sat 09:00–14:00, closed Sun | A real, typical Swedish driving-school operating pattern — supports realistic booking-time distributions in Scheduling captures (Part 6). |
| **Contact details** | A fictional but correctly-formatted Swedish phone number and email domain matching the school's own name (e.g., `info@lindholmstrafikskola.se`), never the real TrafikskolaOS company's own contact details | Keeps this fictional demo business's identity fully separate from TrafikskolaOS's own real corporate identity — no risk of a visitor mistaking one for the other. |
| **Website** | Not a live, resolvable domain — referenced only within captured screenshots as on-screen text, never linked or registered | Registering an actual domain for a fictional demo company is out of scope for a documentation-only specification and introduces real-world risk this document has no authority to accept. |
| **Support information** | Uses TrafikskolaOS's own real support channels when the *platform's* support is shown (e.g., a Help Center screenshot); uses Lindholms Trafikskola's own fictional contact details when the *demo school's* own customer-facing pages are shown | Prevents the two identities (the platform vendor and the fictional customer) from blurring into one in any single asset. |

---

## Part 2 — Business Structure

**Branches (locations)**:
1. **Huvudkontor — Uppsala** (primary location, opened first, largest instructor/vehicle allocation)
2. **Filial — Enköping** (smaller satellite location, opened more recently, 1 instructor + 1 vehicle) — included specifically so multi-location screenshots (Organization Management, Branch Management) show a real second location rather than an empty "add your first location" state, and so the "Ni växer från en ort till flera" business-challenge narrative has authentic supporting data.

**Departments** (mapped to the product's own real navigation groupings, not invented corporate hierarchy — a small driving school doesn't have HR-style departments, so this section reuses the platform's actual functional areas):
- Kundhantering (reception/customer-facing)
- Planering (scheduling/instruction)
- Ekonomi (finance/bookkeeping)
- Ledning (management/administration)

**Cost centers** (kostnadsställen, for BAS-based accounting reports): one per branch (Uppsala, Enköping) plus one for the shared vehicle fleet — a realistic, minimal structure a school this size would actually use, not an over-engineered chart of cost centers.

**Vehicles** (Draft Strategy, unchanged):
| Plate | Model | Year | Category | Home branch |
|---|---|---|---|---|
| LTS 112 | Volkswagen Golf | 2023 | B | Uppsala |
| LTS 118 | Skoda Octavia | 2022 | B | Uppsala |
| LTS 121 | Volkswagen Golf | 2024 | B | Enköping |
| *(one motorcycle, added under this specification)* | Honda CB500F | 2023 | A | Uppsala |

**Vehicle categories**: B (personbil), A (motorcykel) — matching the instructor roster's real certifications (Part 3), not categories with no corresponding instructor.

**Lesson packages** (realistic Swedish driving-school offerings, matching `package_type` enum values already confirmed implemented — driving, theory, risk1, risk2, intensive, mixed, custom):
- **Bas-paket B** (10 körlektioner) — most common individual purchase
- **Introduktionspaket B** (5 körlektioner + teorimaterial) — first-time buyers
- **Intensivkurs B** (2 veckor, samlad utbildning) — for the "Prenumeration"/quick-turnaround persona
- **Risk 1 + Risk 2** (separate bookable packages, matching real Swedish licensing requirements)
- **MC-paket A** (motorcycle package, tied to the one motorcycle vehicle)
- **Företagspaket** (corporate package, tied to the corporate customer, Part 2 below)

**Pricing**: realistic 2026 Swedish market rates — individual lessons priced in the 550–650 kr range, packages priced with a modest bundle discount (never a dramatic "50% off" figure, which would read as a marketing gimmick rather than real pricing).

**Corporate customers**: one named company, **Uppsala Bygg AB**, sending 4–5 employees through B-behörighet under a company agreement — enough to populate the Corporate Customers module (Part 1's Draft Strategy blocking-issue note: this module requires a Starter-tier-or-higher subscription on the demo org to even render) without inventing an implausibly large B2B book for a school this size.

**Individual customers**: the five students originally specified in the Draft Strategy's own demo-data profile, carried forward and listed in full in Part 3 below, extended with two additional adult learners so the roster plausibly supports the booking volumes in Part 4.

---

## Part 3 — People

Every person below has a defined name, role, status, typical activity, and explicit relationship to other entities — nothing is a free-floating record.

### Management
| Name | Role | Status | Typical activity | Relationship |
|---|---|---|---|---|
| Karin Lindholm | VD / Ägare (org_owner) | Active | Reviews Ekonomiöversikt weekly, approves discounts, handles corporate agreements | Founder — the school's own namesake; owns the org_owner role and the one BankID-authenticated login in the demo set (BankID Users, below) |

### Reception
| Name | Role | Status | Typical activity | Relationship |
|---|---|---|---|---|
| Jonna Ahl | Receptionist (kundhantering permissions) | Active | Books lessons, registers new students, handles the "Ny kund" flow daily | Reports to Karin Lindholm; primary user of Bokningsschema and Kunder |

### Finance
| Name | Role | Status | Typical activity | Relationship |
|---|---|---|---|---|
| Petter Holmqvist | Ekonomiansvarig (finance permissions) | Active | Reconciles payments weekly, generates SIE4 exports monthly, manages Momsperioder | Reports to Karin Lindholm; primary user of Ekonomiöversikt and Rapporter |

### Driving Instructors
| Name | Role | Status | Typical activity | Relationship |
|---|---|---|---|---|
| Mikael Holm | Instruktör (anställd, ADI, B + BE) | Active | 6–8 lessons/day, Uppsala | Teaches Elin Karlsson, Oskar Nilsson (Students, below) |
| Sofia Bergqvist | Instruktör (anställd, ADI, B) | Active | 5–7 lessons/day, Uppsala; primary Instructor App mobile user (Mobile Users, below) | Teaches Amanda Svensson, Wilma Gustafsson |
| Erik Malmberg | Instruktör (anställd, ADI, B), Enköping | Active | 3–5 lessons/day, sole instructor at the Enköping branch | Teaches the Enköping-registered students; the demonstrator for branch-scoped scheduling |

### Motorcycle Instructor
| Name | Role | Status | Typical activity | Relationship |
|---|---|---|---|---|
| Anders Ekström | Instruktör (konsult, B + A) | Active | 2–3 MC lessons/week alongside B lessons | Teaches MC-paket A students; consultant status (not anställd) demonstrates the platform's employment-type distinction |

### Administrators
| Name | Role | Status | Typical activity | Relationship |
|---|---|---|---|---|
| *(Karin Lindholm and Petter Holmqvist jointly cover this — no separate dedicated "administrator" role is invented where none would realistically exist at this school's size)* | — | — | — | — |

### Students (Individual Customers)
| Name | Age | Permit stage | Branch | Guardian (if minor) |
|---|---|---|---|---|
| Elin Karlsson | 17 | Körlektioner pågår | Uppsala | Maria Karlsson |
| Oskar Nilsson | 23 | Uppkörning bokad | Uppsala | — |
| Amanda Svensson | 35 | Teori pågår | Uppsala | — |
| Noah Andersson | 18 | Riskutbildning genomförd | Uppsala | — |
| Wilma Gustafsson | 16 | Introduktionsutbildning | Uppsala | Peter Gustafsson |
| Filip Åström | 28 | Körlektioner pågår, Enköping | Enköping | — |
| Linnea Dahl | 19 | MC-paket A, körlektioner pågår | Uppsala | — |

### Guardians
| Name | Relationship | Typical activity |
|---|---|---|
| Maria Karlsson | Guardian of Elin Karlsson | Views progress and pays invoices via Guardian Portal |
| Peter Gustafsson | Guardian of Wilma Gustafsson | Views schedule and risk-education status via Guardian Portal |

### Corporate Contact
| Name | Company | Role | Typical activity |
|---|---|---|---|
| Sandra Wik | Uppsala Bygg AB | HR-ansvarig | Reviews employee progress, receives consolidated invoicing |

### Platform Administrators
Explicitly **not part of Lindholms Trafikskola** — platform administrators belong to TrafikskolaOS itself, not to any customer organization, per the Platform Taxonomy's boundary model. No platform-admin persona is defined within this demo organization's identity; if a Platform Administration screenshot is needed (Part 7), it is captured from a real platform-admin account reviewing Lindholms Trafikskola *as one of several customer organizations* — the demo org is the subject being administered, never the administrator.

### Portal Users
Every portal user is one of the people already defined above, accessing their own token-based portal — not a separate invented identity:
- **Student Portal**: Elin Karlsson, Oskar Nilsson, Amanda Svensson, Noah Andersson, Wilma Gustafsson, Filip Åström, Linnea Dahl.
- **Guardian Portal**: Maria Karlsson, Peter Gustafsson.
- **Instructor Portal**: Mikael Holm, Sofia Bergqvist, Erik Malmberg, Anders Ekström (all four also hold this access, distinct from the Instructor App below).

### Mobile Users
**Sofia Bergqvist** is designated the primary Instructor App (mobile-first) demonstrator — chosen specifically because she's the busiest Uppsala instructor with the most consistent daily schedule, making her "Idag" view the most credible mobile capture.

### BankID Users
**Karin Lindholm** is the designated BankID login demonstrator, consistent with BankID being wired only into the main-app login (not the portals, per the Architecture Landscape Audit) — an owner-level login is the correct persona for demonstrating this specific authentication path.

---

## Part 4 — Demo Data Volumes

| Category | Volume | Rationale |
|---|---|---|
| Students | 7 (Part 3) | Enough for realistic list/detail screenshots without needing to invent a roster no small school would actually have this early. |
| Bookings/lessons per week | 35–50 across all instructors (Draft Strategy, unchanged) | Matches a real, busy-but-sustainable small driving school. |
| Invoices | Mixed status: mostly paid, 1 sent (awaiting payment), 1 slightly overdue | The Draft Strategy's "one small realistic imperfection" principle — never zero problems, never many. |
| Payments | 3–5 recorded in the current month | Populates the Finance Overview's "senaste betalningar" panel (a real gap the live audit found empty). |
| Vehicles | 4 (3×B, 1×A) | Part 2. |
| Lesson packages sold | 8–10 active across the student roster | Enough for Package/Product Catalog screenshots to show real utilization, not an empty catalogue. |
| Waiting lists | 1–2 students waitlisted for one popular time slot | A small, credible imperfection — never a fully saturated calendar, never a fully empty one. |
| Corporate agreements | 1 (Uppsala Bygg AB, Part 2) | Enough to populate the module without an implausible B2B book. |
| Reports | 8–12 weeks of prior activity seeded (Production Guide, Part 2) | Trend reports need an actual trend, not a single data point. |
| Revenue | 180 000–220 000 kr/month (Draft Strategy, unchanged) | Plausible small-to-mid Swedish trafikskola scale. |
| Expenses | Not separately itemized in this pass — deferred | No expense-tracking screen was identified as a marketing candidate in the audit; specifying volumes here without a target screen would be speculative. Revisit if a future audit identifies one. |
| Audit logs | Continuous, generated naturally by the seeded activity above — never manually inserted | Per the Draft Strategy's Part 7 post-processing rule: every visible record must be traceable to a real, reproducible action, including audit entries. |
| Notifications | 2–3 realistic recent items (booking confirmation, payment received, instructor availability update) | Draft Strategy, unchanged. |
| Tasks | 2–3 open operational tasks (e.g., a pending vehicle service reminder) | Enough to populate the Tasks module without implying a backlog. |
| Messages | 2–3 recent internal/customer messages, no unread backlog exceeding 1–2 | An empty inbox looks unused; a large backlog looks neglected — neither is the target. |
| Certificates | Noah Andersson's completed Risk 1/Risk 2 certification is the one populated certificate record | Directly supports a Compliance screenshot showing real certification tracking. |
| Compliance records | The one overdue-besiktning vehicle (Production Guide, Part 2) is the single populated compliance flag | Deliberately preserved, not resolved — Part 6 explains why. |

---

## Part 5 — Temporal Consistency

**Governing rule**: every screenshot, across every module, represents **the same fictional business week** — never a mix of "today" in one capture and a different date in another.

- **Current day**: a mid-week weekday (Tuesday or Wednesday), matching the Draft Strategy's "a normal Tuesday morning" framing — never a Monday-opening or Friday-wind-down state, which under-represents typical daily activity.
- **Current week**: whichever real calendar week captures are taken in — **relative date framing is mandatory** wherever the UI supports it (a live "Idag," "Denna vecka" label), exactly as the Draft Strategy already established. A captured screenshot should not need recapturing just because a fixed date printed on it has passed.
- **Current month**: the same real calendar month as the capture date, so Finance/Reports figures ("denna månad," "juli 2026" in the live audit) always match the day/week reference above — a mismatched month label is one of the fastest ways a screenshot reads as stale or staged.
- **Current time**: mid-morning to early afternoon (approximately 10:00–14:00) — late enough that "today's lessons" plausibly shows both completed and upcoming items (a more credible, lived-in state than capturing at 08:00 before anything has happened, or at 18:00 after everything has).

**Cross-module synchronization is mandatory, not aspirational.** Concretely, using **Elin Karlsson** as the worked example the prompt asked for:

| Module | What should be visible |
|---|---|
| Dashboard | Elin's lesson appears in "Dagens schema" if scheduled that day |
| Scheduling | Elin's booking appears on Mikael Holm's calendar, at the correct time slot |
| Finance | Elin's guardian (Maria Karlsson) has a consistent invoice/payment history reflecting the packages Elin has purchased |
| Student Portal | Elin sees the same lesson, the same progress stage ("körlektioner pågår"), and the same instructor (Mikael Holm) |
| Guardian Portal | Maria Karlsson sees the identical lesson and the identical invoice status Finance shows |
| Reports | Elin is counted in whichever revenue/booking report includes the current period |
| Communication | Any booking-confirmation notification references Elin by name, matching the lesson actually on her record |
| Audit Trail | Any change to Elin's record (e.g., a reschedule) produces a real, timestamped audit entry — never a synthetic one added to "fill" the log |

If any future screenshot shows Elin (or any named person) in a state that contradicts another module's screenshot of the same person, that is a data-consistency defect against this specification, not an acceptable variation.

---

## Part 6 — Screenshot Design Standard

A permanent, reusable standard — not a per-screen rule, though the Production Guide's per-screen specs are its first application.

| Dimension | Standard | Why |
|---|---|---|
| **Information density** | Every panel shows real content, never more than one empty-state panel per screen | One empty panel reads as an honest, minor gap; two or more reads as an unfinished product (the exact failure mode the live audit found in the bootstrap org). |
| **Visual balance** | No single panel dominates through emptiness (an oversized blank area) or through repetition (identical rows, the live-audited Insights failure) | Both are density problems with different causes; both are excluded by the same standard. |
| **Data freshness** | Governed entirely by Part 5 — no screenshot may show a date, "denna vecka" figure, or "denna månad" figure inconsistent with the capture's own reference day. | |
| **Status colors** | Use the product's own real status palette only (already-implemented green/amber/red conventions, e.g. the Vehicles compliance badges) — never a status invented for a screenshot that the live product wouldn't actually render | Keeps every captured color meaningful and reproducible, per the Draft Strategy's honesty discipline. |
| **Notification counts** | 1–3 unread, never 0 (looks unused) and never a large badge number (looks neglected or alarming) | |
| **Calendar occupancy** | 50–70% of near-term slots booked (Production Guide, Part 2) — the specific number that corrects the live-audited "0% booked" failure without tipping into an implausibly fully-booked calendar | |
| **Table lengths** | Long enough to demonstrate real scrolling/pagination behavior exists (8+ rows minimum for list views) without needing to scroll past the fold for the primary capture | |
| **Chart complexity** | Simple, legible trend lines only — a modest, believable upward trend (Draft Strategy, unchanged: "gently positive... never a dramatic hockey-stick") | |
| **Acceptable empty states** | At most one genuinely empty panel per screen, and only where an empty state is itself realistic (e.g., "inga aktiva rabattkoder" for a school not currently running a promotion) — never an empty state on a panel central to that screen's own purpose | |
| **Acceptable warning states** | 1, occasionally 2 — never zero (reads as suspiciously perfect) and never enough to dominate the screen's tone | |
| **Acceptable overdue items** | 1 overdue invoice, 1 overdue vehicle compliance item — matching Part 4's specified volumes exactly, never more | |
| **Acceptable unpaid invoices** | 1, consistent with the invoice mix in Part 4 | |
| **Acceptable compliance alerts** | Exactly 1 (the besiktning alert, Part 4) — deliberately preserved across every future data refresh, not something a future reseed should "fix" | |

**How this produces "active and healthy, not artificially perfect"**: every number above sits deliberately away from both extremes — never zero (which the live audit proved reads as unfinished) and never uniformly resolved (which reads as staged). A visitor's honest, unconscious read should be "this business has a couple of things to deal with today, like every real business does" — not "this business has no data" and not "this business has no problems, ever."

### Screenshot Quality Checklist

Every screenshot must be confirmed against this checklist before approval (Part 8). This consolidates, rather than replaces, the standards already defined above in this Part and in Part 5.

- [ ] No placeholder content (no "platshållare," no unpopulated panel central to the screen's own purpose)
- [ ] No Lorem Ipsum or other non-Swedish, non-realistic filler text
- [ ] No duplicated records (no repeated identical rows — the specific failure this program identified live in an early Insights capture)
- [ ] No empty critical widgets (the panel(s) central to the screen's purpose must be populated; the "at most one genuinely empty panel" rule above still governs secondary panels)
- [ ] Consistent dates (per Part 5 — no date, week, or month reference contradicts another visible in the same capture or capture set)
- [ ] Realistic financial values (per Part 2 and Part 4's specified pricing and revenue figures)
- [ ] Correct branding (the "LT" org badge and Lindholms Trafikskola's own identity, per Part 1 — never TrafikskolaOS's own real corporate identity)
- [ ] Correct workspace (originates from the Source Workspace recorded for it in Part 8 — no cross-surface mixing)
- [ ] Complete workflows (no mid-interaction state, no open dialog or menu, no partially submitted form)

---

## Part 7 — Marketing Storytelling

The narrative every screenshot collectively supports, matching the approved Buyer Journey's own sequencing (trust before persuasion):

```
Visitor arrives
  → Discovers operational challenges          (Business Challenge — no screenshot; text only, per V2)
  → Sees one unified platform                  (Platform Overview — Dashboard or a system screenshot)
  → Sees scheduling                            (Scheduling — Bokningsschema, multi-instructor week view)
  → Sees finance                               (Compliance — Ekonomiöversikt's accounting depth)
  → Sees compliance                            (Compliance, continued — Vehicle Management's besiktning alert)
  → Sees reporting                             (a Reports/Rapporter capture, breadth of tooling)
  → Sees operational insight                   (Insights — momentum, growth, activity)
  → Understands business transformation        (Business Transformation — the Dashboard again, or a second Overview capture, reinforcing "one place")
  → Books a demonstration                      (CTA — no screenshot, per V2's preserved buyer-journey pacing decision)
```

**How each selected screenshot contributes**:
- **Dashboard**: proves "one operating system," the load-bearing claim of the entire page.
- **Scheduling**: proves the specific, named claim "instruktörsmedveten bokning" already shipped in copy.
- **Finance/Compliance**: proves "byggt för svensk bokföring" with real tool names, not a generic claim.
- **Vehicle Management**: the single strongest piece of *unplanned* evidence found in the whole audit — a real compliance alert that a competitor's static marketing page cannot fake.
- **Reports**: proves depth without needing the visitor to understand any single report — the *volume* of named, real tools is the message.
- **Insights**: the one screenshot that shows the business moving forward, not just existing — pairs with Business Transformation's own "från kaos till kontroll" framing.

**Screenshots that do not belong in this narrative**: Platform Administration (a different audience — the SaaS operator, not a prospective customer, per the Platform Taxonomy's own boundary model, so it belongs in investor/internal materials, not the public landing page), and anything from the Portals unless a future page specifically targets guardians or students as an audience (neither currently exists in the approved Information Architecture).

---

## Part 8 — Screenshot Library

### Screenshot Lifecycle

Every screenshot in the library below moves through one lifecycle, tracked per asset:

```
Draft → Approved → Published → Deprecated → Retired
```

- **Draft**: captured, not yet reviewed against the Screenshot Quality Checklist (Part 6).
- **Approved**: reviewed and confirmed compliant (see Lightweight Approval Rule, below) — not yet in public use.
- **Published**: in active use on the public website, in documentation, in sales, or in training material.
- **Deprecated**: superseded by a newer capture, or no longer accurate, but not yet removed from every location it was published to.
- **Retired**: removed from all active use.

### Screenshot Versioning & Traceability

Every published screenshot carries the following metadata, so it can always be traced back to a specific, real, reproducible state:

| Field | Purpose |
|---|---|
| Screenshot ID | A stable identifier for the asset, independent of any single filename |
| Platform Version | The TrafikskolaOS version the screenshot was captured against |
| Specification Version | The version of this document the capture complied with |
| Source Workspace | Which surface it was captured from (table below) |
| Capture Date | When the capture was taken |

This specification defines the metadata fields only — the mechanism used to store or attach them (a filename convention, a manifest file, an asset-management system) is an implementation decision outside this document's authority.

### Lightweight Approval Rule

Before a screenshot moves from Draft to Approved, it must be reviewed for:
- **Technical correctness** — the screen renders as the real product actually behaves, with no fabricated or altered UI.
- **Business realism** — the visible data is consistent with Parts 2–4 of this specification.
- **Compliance with this specification** — the Screenshot Quality Checklist (Part 6) passes.
- **Alignment with its intended marketing purpose** — the asset still serves the business objective and marketing message recorded for it below, and its narrative role from Part 7.

This defines what must be true before approval, not who performs the review or what organizational process surrounds it — that remains outside this specification's authority.

### Library

For every entry: source workspace, business objective, marketing message, required demo data, recommended crop, desktop/tablet/mobile suitability, and where it's used (landing page / documentation / sales).

| # | Screen | Source Workspace | Business objective | Marketing message | Required demo data | Recommended crop | Desktop | Tablet | Mobile | Landing page | Docs | Sales |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Hero (Dashboard)** | Tenant Workspace | Prove "operating system, not app" instantly | "This is real software, built for us" | Part 4, full current-week population | Full viewport, top of page, no scroll (Production Guide 3.1) | Yes | Not planned | Not planned | Hero | Onboarding docs | Primary sales-deck opener |
| 2 | **Scheduling** | Tenant Workspace | Prove instructor-aware, multi-branch booking | "It knows who's free, where" | 35–50 lessons/week, 4 instructors incl. Enköping | Full week grid, Mon–Fri minimum | Yes | Optional | Instructor App preferred over this screen scaled down | Business Challenge (if a screenshot is ever added there) | Scheduling how-to guides | Live-demo screen |
| 3 | **Dashboard** *(secondary capture, different day/state)* | Tenant Workspace | Reinforce "one place" after other proof points | "Still one place, every day" | Same dataset, different reference day | Same as #1 | Yes | No | No | Business Transformation | — | — |
| 4 | **Finance (Ekonomiöversikt)** | Tenant Workspace | Prove Swedish accounting depth | "Byggt för svensk bokföring" | Part 4 invoice/payment mix, populated widgets | Top KPI row through tool grid (Production Guide 3.2) | Yes | No | No | Compliance | Finance module docs, Help Center | Finance-persona sales calls |
| 5 | **Vehicle Management** | Tenant Workspace | Prove automated compliance tracking | "Besiktning, försäkring och service följs automatiskt" | 4 vehicles, 1 deliberately overdue (Part 6) | Alert banner through table (Production Guide 3.3) | Yes | No | No | Compliance, or a future Operational Excellence moment | Vehicle module docs | Owner-persona sales calls |
| 6 | **Compliance (accounting detail)** | Tenant Workspace | Deepen the Finance claim with named standards | "BAS 2020, SIE4, AGI — by name" | Same as #4, possibly a Momsperioder or SIE4-export sub-view | A specific tool card or sub-page, not the whole overview | Yes | No | No | Resources (deeper than the landing page needs) | Compliance/accounting docs | Finance-persona sales calls |
| 7 | **Reporting (Rapporter)** | Tenant Workspace | Prove platform breadth | "24 real tools, not a feature list" | None screen-specific (Production Guide 3.4) | First 3 rows of report cards | Yes | No | No | Platform Overview (flanking) | Reports module docs | — |
| 8 | **Insights** | Tenant Workspace | Prove business momentum | "Growing, not just running" | 50–70% booking fill, 1–2 small imperfections | Top through "Kommande lediga kurser," trimmed to 2–3 rows | Yes | No | No | Business Transformation | Insights module docs | Owner-persona sales calls |
| 9 | **Student Management** | Tenant Workspace | Prove the full student lifecycle is tracked | "Every student's journey, in one record" | Full roster (Part 3), mixed permit stages | List view with status badges, or one detail page | Yes | Optional | No | Not currently planned (no student-specific landing scene) | Student module docs | Reception-persona sales calls |
| 10 | **Instructor Management** | Tenant Workspace | Prove staff/certification tracking | "ADI status, categories, availability — tracked" | Full instructor roster incl. motorcycle instructor | List view with certification status | Yes | No | No | Not currently planned | Staff module docs | Owner-persona sales calls |
| 11 | **Organization Management** | Tenant Workspace (Settings) | Prove multi-location is real, not theoretical | "One system, every location" | Uppsala + Enköping branches (Part 2) | Locations settings view | Yes | No | No | Not currently planned (would require reopening the "multi-location" claim visually — a strategy decision outside this document's scope) | Settings/admin docs | Multi-location prospect sales calls |
| 12 | **Platform Administration** | Platform Administration | Demonstrate operator-side oversight — a different audience | "The platform itself is professionally run" | Lindholms Trafikskola as one of several visible customer orgs in a platform-admin view | Org list or org-detail view, platform-admin account | Yes | No | No | Not applicable — wrong audience for the public landing page | Internal/investor documentation only | Investor presentations |
| 13 | **Mobile Applications (Instructor App)** | Tenant Workspace — Mobile (Instructor App) | Prove genuine mobile-first design exists | "Built for the person standing next to the car, not just the office" | Sofia Bergqvist's daily schedule (Part 3) | "Idag" view, portrait | No | No | Yes | Hero (secondary/overlapping screenshot, already implemented) | Instructor onboarding docs | Instructor-persona sales calls |
| 14 | **Student Portal** | Student Portal | Prove students get real self-service, not just staff tools | "Elever bokar, betalar och följer sina framsteg själva" | Elin Karlsson's own view (Part 5's worked example) | Dashboard or Boka view | Yes | Optional | Yes (this portal is genuinely used on mobile in practice) | Not currently planned (no student-facing landing scene exists) | Student-facing help articles | — |
| 15 | **Guardian Portal** | Guardian Portal | Prove guardians of minors get real visibility | "Föräldrar ser schema, ekonomi och framsteg" | Maria Karlsson's view of Elin's record | Dashboard or Ekonomi view | Yes | Optional | Yes | Not currently planned | Guardian-facing help articles | — |
| 16 | **Instructor Portal** | Instructor Portal | Prove instructors without full staff accounts still get real tools | "Även konsultinstruktörer får ett riktigt verktyg" | Anders Ekström's token-based view (consultant, not employed) | Schema or Elever view | Yes | Optional | Optional | Not currently planned | Instructor-facing help articles | — |

**Screenshots not planned as a montage, grid, or composite of the above**: every prior document in this program has rejected the feature-icon-grid and screenshot-collage patterns; this specification does not reopen that decision. Each entry above is a standalone, individually composed capture.

---

## Part 9 — Long-Term Governance

- **Future features** integrate into this specification by extension: a new module gets a new row in Part 8 and, if it needs one, a new person or dataset entry in Parts 3–4 — never a disconnected, separately-invented demo dataset.
- **Future screenshots** must be captured against Lindholms Trafikskola, at the volumes and states specified in Parts 4 and 6, or this document must be formally revised first. A screenshot that technically shows real product functionality but violates this specification's design standard (an all-green state, an empty panel, a stale date) is not compliant, even if it's "real."
- **Future demo data changes** (a reseed, a data migration test, a QA action against this same organization) must preserve every named person, every deliberate imperfection (the one overdue invoice, the one overdue besiktning), and every volume in Part 4 — this is precisely the "data provenance" risk the Production Guide's Part 1 already flagged as a live, observed problem, not a theoretical one.
- **Future videos** should draw their subject matter from the same organization and the same Part 7 narrative sequence, so video and static screenshots never contradict each other.
- **Future documentation** should reference this specification by name rather than re-describing the demo organization inline, so a future change here propagates by reference instead of requiring edits across many documents.
- **Revision process**: any change to Part 1 (identity), Part 3 (people), or Part 6 (design standard) is a governance-level decision — equivalent in weight to a Design Review Board action — not an implementation detail a future sprint can quietly adjust.
- **Review cadence**: this specification must be reviewed before every major platform release, and whenever significant marketing assets change (a new landing-page scene, a substantially revised buyer journey, or a new module added to the Screenshot Library). This is a review trigger, not a fixed calendar schedule — a quiet period with no major release or asset change does not require a review on its own.

---

## Summary of Ratified Decisions

1. Lindholms Trafikskola (Uppsala + Enköping, two branches) is the single, permanent demo organization for all marketing, sales, documentation, and training use — superseding ad hoc use of the engineering bootstrap org for any of those purposes.
2. The organization number and VAT number are generated and checksum-verified at implementation time, per Part 1's format specification — not fabricated as literal digits in this document.
3. The full people roster (Part 3), demo data volumes (Part 4), and design standard (Part 6) — including the Screenshot Quality Checklist — are adopted as permanent, revisable-only-through-governance specifications.
4. Platform Administration and Portal screenshots are scoped to internal/sales/documentation use, not the public landing page, per Part 7 and Part 8's stated audience distinctions — a separate decision if that's ever reconsidered.
5. The Screenshot Lifecycle, Versioning & Traceability metadata, Source Workspace labeling, and Lightweight Approval Rule (Part 8) govern every asset in the Screenshot Library from this version forward.
6. This specification's Scope of Authority (Part 0) is definitive: it governs the demo organization, demonstration data, the Screenshot Library, marketing assets, and public product representation — and explicitly does not govern infrastructure, deployment, authentication, platform security, operations, engineering process, or real customer tenants, all of which remain governed elsewhere.

**This specification is now frozen as Version 1.0.** It is the approved reference for all future screenshot capture, data seeding, and marketing-asset work — but this document itself remains a governance artifact: it does not authorize implementation. Data seeding, screenshot capture, and any application change still require their own separate, explicitly authorized sprint, exactly as every prior sprint in this program has.
