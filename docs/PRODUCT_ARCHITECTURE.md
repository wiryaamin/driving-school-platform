# TrafikskolaOS — Product Architecture

**Document type:** Master product architecture. Business-capability-first; technology appears only in Part 4 as an implementation detail of capabilities defined earlier, not as the organizing structure.

**Version:** 2. Version 1 is `PUBLIC_EXPERIENCE_LAYER_ARCHITECTURE.md` — a technology-organized architecture decision record for one slice of this document (how a tenant's website integrates with TrafikskolaOS). V1's decisions are preserved unchanged and now sit inside Part 4 as the delivery-layer detail for the capabilities this document defines. Where this document and V1 overlap, V1 remains the authoritative ADR for *that* decision; this document is authoritative for how it fits into the whole.

**Status:** Architecture reference, no code changed to produce it. Written against the codebase as it exists on `release/pr-2-error-schema-standardization`, cross-checked against actual modules and Edge Functions rather than assumed — every capability and touchpoint below is marked **Built**, **Partial**, or **Future** based on direct inspection, not aspiration.

**Relationship to existing governance:** This document does not modify or supersede `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md`'s Version 1.0 Scope Freeze. Nothing in Parts 1–3 or 6 below should be read as new near-term work — Part 4 and the "Built/Partial/Future" tags throughout exist specifically to prevent that misreading.

---

## Table of Contents

1. Executive Summary
2. Part 1 — Customer Journey Architecture
3. Part 2 — Business Capability Architecture
4. Part 3 — Customer Touchpoint Architecture
5. Part 4 — Delivery Architecture
6. Part 5 — Product Architecture Principles
7. Part 6 — Future Platform Evolution
8. Part 7 — Architecture Validation
9. Part 8 — Governance Alignment & Implementation Sequencing

---

## Executive Summary

TrafikskolaOS's technology decisions to date (Edge Functions, RLS, Supabase, an emerging Public Experience Layer) are sound and are not being revisited here. What this document adds is the layer above them: a description of the business organized around *what the platform does for whom*, so that every future technical decision — a new Edge Function, a new portal screen, a new integration — can be traced back to a customer journey stage and a named business capability, instead of being justified only by its own technical merit.

The organizing order is deliberate and matches the brief:

**Business → Customer Journey → Business Capabilities → Customer Touchpoints → Technology.**

Read top-down, this document answers, in order: *what is the business trying to do* (the journey), *what capability does that require* (Part 2), *where does the customer or staff member actually encounter that capability* (Part 3), and only then *how is it technically delivered* (Part 4, where V1 lives).

---

## Part 1 — Customer Journey Architecture

The journey below is written for the **individual student** — the platform's highest-volume, highest-complexity customer type, and the one every other journey (guardian, corporate, instructor) is a variant or an adjunct of. Guardian and corporate variants are called out inline where they diverge materially; a full journey rewrite for each would duplicate most of this table for little benefit.

| Stage | Business objective | Customer objective | Platform responsibility | Public interaction | Internal operational interaction |
|---|---|---|---|---|---|
| **1. Prospect** | Be found by someone who hasn't decided on a school yet | "Which driving school should I choose?" | None directly today — this stage happens on the tenant's own website, social media, or word of mouth, outside TrafikskolaOS | None (Future: marketplace/directory, Part 6) | None |
| **2. Interest** | Convert a visitor into a named lead | "Tell me about your courses and prices" | Show live packages/pricing; capture a lightweight "contact me" signal | `public-catalog` (**Built**), `public-booking` interest capture (**Built**) | Lead appears on staff's Leads/Enrollments screen (**Built** — `modules/leads`) |
| **3. Evaluation** | Answer pricing/scheduling questions before commitment | "Does this fit my budget and schedule?" | Present accurate, current pricing and campaign discounts; no stale data | `public-catalog` reads live `packages` table directly (**Built**) | Staff follow-up on open leads (**Built**) |
| **4. Booking** | Convert evaluation into a committed action | "I want to book a slot / buy a package" | Real-time availability, real payment | `public-catalog` checkout + Stripe (**Built**); dedicated public booking-availability widget (**Future**, Part 4) | Order lands on staff Orders screen (**Built** — `modules/orders`) |
| **5. Registration** | Formalize the relationship; collect required data | "Sign me up" | Structured enrollment, coupon validation, minors' guardian-consent capture | `public-enrollment` (**Built**; guardian-consent capture is **Future** — see V1 Phase 2/8) | Enrollment record created; student record provisioned (**Built** — `modules/enrollments`, `modules/students`) |
| **6. Payment** | Collect revenue correctly under Swedish accounting rules | "Pay conveniently, get a receipt" | Gap-free invoicing, immutable ledger posting, VAT correctness | Stripe checkout (**Built**) | Invoice/ledger/BAS posting (**Built** — `modules/finance`) |
| **7. Student** | Deliver the core service | "Track my progress, book lessons, message my instructor" | Self-service portal: bookings, package balance, documents, messaging | Student Portal, token-link access (**Built** — `modules/student-portal`) | Scheduling, package-credit consumption (**Built** — `modules/scheduling`) |
| **8. Training** | Operationally run lessons efficiently | "Get to my test-ready state" | Instructor scheduling, attendance, progress tracking | Instructor Portal/App (**Built** — `modules/instructor-portal`, `modules/instructor-app`) | Slot generation, attendance, curriculum tracking (**Built** — `modules/curriculum`) |
| **9. Completion** | Recognize course/license completion; free capacity | "I passed — what's next?" | Mark completion, release recurring bookings, trigger any completion communication | None dedicated today (**Future** — see Part 2, Completion capability) | Status transitions on student record (**Partial**) |
| **10. Relationship** | Retain the student as a platform-aware contact post-completion | "Stay in touch for future needs (A2→A, moped→car)" | Ongoing, low-frequency communication; document archive access | Student Portal remains reachable (**Built**); proactive retention messaging (**Future**) | Communication module (**Built** — `modules/communication`) |
| **11. Referral** | Turn a satisfied student into an acquisition channel | "Recommend a friend" | Referral capture, discount attribution | Referral/"tell a friend" mechanic (**Future** — flagged as missing in V1 §2) | Campaign discount application exists for the redeemed side (**Built** — `modules/campaigns`) |
| **12. Returning Customer** | Re-engage for a second product (motorcycle after car, A2→A upgrade) | "I need another license/service" | Re-enter at Interest/Evaluation with prior history intact | Same public surfaces as stage 2, but the platform already knows this person | Existing student record, not a new one (**Partial** — depends on identity-matching at re-entry, not yet a defined capability) |

**Guardian variant:** enters at Registration (a guardian typically initiates enrollment for a minor) and runs a parallel track from stage 5 onward via the Guardian Portal (**Built** — `modules/guardian-portal`), converging with the student's own track at Training. The guardian-consent gap flagged in V1 sits precisely at the seam between stages 5 and 6.

**Corporate variant:** the *company* enters at Interest/Evaluation as a B2B buyer, but the actual trainee (an employee) enters the individual journey from stage 7 onward. Corporate capability already exists (`modules/corporate`, `corporate-contracts`, `corporate-customers` — **Built**) but its journey mapping has not previously been documented; it belongs here rather than being treated as a variant of the individual journey bolted on afterward.

---

## Part 2 — Business Capability Architecture

Each capability is independent of *how* it's delivered — that question is deferred to Part 4. "Owner" names the module/function cluster that currently owns the capability, not a person.

| Capability | Purpose | Owner (code) | Dependencies | Internal users | External users | Operational value | Status |
|---|---|---|---|---|---|---|---|
| **Customer Acquisition** | Turn an anonymous visitor into a named lead | `public-catalog`, `public-booking`, `modules/leads` | Course Discovery | Reception/sales staff | Prospects | Top-of-funnel volume | Built |
| **Course/Package Discovery** | Present accurate offerings and pricing publicly | `public-catalog`, `modules/packages` | Package Management (internal) | Finance/admin staff (define packages) | Prospects, students | Conversion | Built |
| **Package Management** | Define and price what the school sells | `modules/packages`, `modules/campaigns` | none | Admin/finance staff | none directly | Revenue configuration | Built |
| **Enrollment** | Formalize a prospect into a student record | `public-enrollment`, `modules/enrollments`, `modules/students` | Customer Acquisition | Reception staff | Prospects, guardians | Conversion, data capture | Built (guardian consent: Partial) |
| **Payments & Finance** | Collect revenue, maintain compliant books | `modules/finance` (invoices, ledger, VAT, SIE4) | Enrollment, Booking | Finance/admin staff | Students, guardians, corporate payers | Regulatory compliance, cash flow | Built |
| **Booking & Scheduling** | Match student demand to instructor/vehicle capacity | `modules/scheduling` | Enrollment (for credit-gated booking) | Reception, instructors | Students, guardians | Core operational throughput | Built |
| **Communication & Messaging** | Two-way contact between school, student, guardian, instructor | `modules/communication` | none | All staff | Students, guardians | Reduces no-shows, improves satisfaction | Built |
| **Notifications** | System-initiated, one-way alerts (reminders, receipts, status changes) | `notifications` Edge Function, automation rules | Booking, Payments | All staff (configure rules) | Students, guardians, instructors | Reduces manual follow-up load | Built |
| **Learning Journey / Curriculum Tracking** | Track a student's progress toward license readiness | `modules/curriculum` | Booking (lesson history) | Instructors | Students | Core product differentiation vs. a generic booking tool | Built |
| **Document Management** | Store/retrieve contracts, certificates, ID documents | `modules/documents` | Enrollment | Admin staff | Students, guardians | Compliance, dispute resolution | Built |
| **Customer Self-Service (Student)** | Let a student manage their own relationship without calling the school | `modules/student-portal` | Booking, Finance, Documents, Communication | none (self-service by design) | Students | Reduces reception workload | Built |
| **Guardian Services** | Give a legal guardian visibility/control over a minor's enrollment | `modules/guardian-portal` | Student Self-Service | Reception (provisioning) | Guardians | Legal necessity for minors, trust | Built |
| **Instructor Operations** | Give instructors their own schedule, attendance, and student-progress tools | `modules/instructor-portal`, `modules/instructor-app` | Booking, Curriculum | Instructors | none | Operational efficiency, mobile-first | Built |
| **Corporate Customer Services** | Serve a company paying for multiple employees' training | `modules/corporate`, `corporate-contracts`, `corporate-customers` | Enrollment, Finance | Finance/admin staff | Corporate buyers | B2B2C revenue stream | Built |
| **Fleet & Vehicle Compliance** | Track vehicle registration/insurance/inspection status; auto-populate it from Transportstyrelsen's vehicle register via a licensed reseller instead of manual entry | `modules/resources` (fleet CRUD, Epic 3.5), `vehicle-registry`/`vehicle-registry-config` Edge Functions | none | Admin/reception staff | none directly | Avoids operating an uninsured/unregistered/overdue-inspection vehicle | Built (lookup: Mock verified, Biluppgifter.se pending a live sandbox key) |
| **Regulatory Workflow Tracking** | Track manual Transportstyrelsen/Trafikverket processes that have no API (risk-education reporting, permit renewal, instructor reporting, förarprov booking) so they're never silently lost | `modules/regulatory` | none | Admin/reception staff | none directly | Compliance risk reduction; due-date reminders | Built |
| **Completion & Certification** | Recognize and record course/license completion | Partially `modules/students` status field | Curriculum | Instructors, admin | Students | Frees capacity, enables Retention | Partial — no dedicated workflow yet |
| **Retention & Relationship** | Keep a completed student as a warm contact | Communication (generic, not purpose-built) | Completion | Admin/marketing staff | Former students | Lower acquisition cost for repeat business | Future |
| **Referral** | Convert a satisfied customer into an acquisition channel | none | Retention, Campaigns | Marketing staff | Students, prospects | Lower CAC | Future — flagged missing in V1 |
| **Future Marketplace / Discovery** | Let a prospect discover *any* participating school, not just one they already know | none | Course Discovery (platform-wide) | Platform admin | Prospects | New acquisition channel, demand-gated | Future — Part 6 |

**Reading this table against Part 1:** most of the built capabilities cluster around journey stages 2–8 (Interest through Training) — consistent with the project's own stated current priority (frontend operational maturity for existing workflows). The two Future/Partial capabilities — Completion and Retention/Referral — sit at stages 9–11, the *end* of the journey, which is a reasonable and defensible sequencing gap, not an oversight: a platform correctly matures its acquisition-through-delivery capabilities before its post-completion ones.

---

## Part 3 — Customer Touchpoint Architecture

| Touchpoint | Purpose | Target audience | Authentication model | Capabilities consumed | Future extensibility | Status |
|---|---|---|---|---|---|---|
| **Driving school's own website** | The tenant's independent marketing presence | Prospects | None (public) | Customer Acquisition, Course Discovery (via link/API today) | Widget embed (Part 4) | Built (as a link-out target) |
| **TrafikskolaOS's own public site** (`/landing` and siblings) | Sell TrafikskolaOS *to* driving schools — a different audience from the row above | Prospective tenants | None (public) | N/A to this document — see `PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md` | Out of scope here | Built |
| **Hosted public catalog/checkout** (`/catalog/:orgId`) | Purchasable, TrafikskolaOS-hosted fallback experience | Prospects | None (public) | Course Discovery, Enrollment, Payments | Becomes the widget's server-side backing page | Built |
| **Student Portal** | Self-service for an active/former student | Students | Token/magic-link | Self-Service, Booking, Finance, Documents, Communication | Unify with Guardian/Instructor entry (Part 4/6) | Built |
| **Guardian Portal** | Self-service for a minor's legal guardian | Guardians | Token/magic-link | Guardian Services | Same as above | Built |
| **Corporate Portal** | Self-service for a B2B buyer | Corporate contacts | Not yet confirmed as distinct from staff auth — **needs verification before further build-out** | Corporate Customer Services | Stronger auth (Part 5, Security by Default) as this grows | Built, auth model unverified |
| **Instructor Portal / App** | Operational tool for staff instructors, mobile-first | Instructors | Staff auth (internal, not public) | Instructor Operations, Booking, Curriculum | none needed — this is internal, not a public touchpoint | Built |
| **Mobile App (native)** | Same capabilities as the portals, native mobile experience | Students, guardians, instructors | Same tokens/credentials as web, via the versioned public/internal APIs | Any capability already API-exposed | The strongest argument for API versioning now (V1 Phase 7) | Future |
| **Email** | Transactional and relationship communication | Students, guardians, leads | N/A (outbound) | Notifications, Communication, Retention | Templating already exists; expand triggers as Retention matures | Built |
| **SMS** | Time-sensitive reminders (booking, payment) | Students, guardians | N/A (outbound) | Notifications | Provider swap (46elks → Twilio/Vonage) once configured | Built, ⏸ deferred on external provider configuration — per `COMMISSIONING_REGISTER.md`, code path is clean and commissioned; only third-party account setup is outstanding |
| **Push Notifications** | Real-time mobile alerts | Students, guardians, instructors | N/A (outbound) | Notifications | Native Mobile App can reuse the same device-token infrastructure | ✅ Built and fully commissioned (`COMMISSIONING_REGISTER.md`, 2026-07-23/24) — corrected from an earlier draft of this document, which mislabeled this Future based on a code search that missed the commissioning record; see Part 8 |
| **QR Codes** | Fast, low-friction entry point (e.g., printed on a car, a poster) | Prospects, students | Context-dependent (could deep-link to catalog or portal) | Course Discovery, Booking | Cheap, worth piloting once the widget/hosted catalog is stable | Future — currently the platform's only QR code is BankID login, a security feature, not marketing (V1 §3) |
| **Google Business Profile** | Local search visibility | Prospects | None | Course Discovery (indirectly, via link-out) | No platform dependency — tenant-managed | Out of platform scope, noted for completeness |
| **Social Media** | Awareness, community | Prospects, students | None | Referral (once it exists) | No platform dependency — tenant-managed | Out of platform scope |
| **Marketplace / Directory** | Cross-tenant discovery | Prospects | None | Course Discovery (platform-wide) | Demand-gated, Part 6 | Future |
| **Partner Systems** (a school's CRM, mailing tool) | Let a tenant's *other* software react to TrafikskolaOS events | Tenant's own back office | API key / webhook signature | Any capability with an outbound event | Depends entirely on the Webhook Dispatcher (V1 Phase 4) | Future |
| **Public APIs** (direct integration, no widget) | Serve technically capable tenants/partners who want full control | Developers acting for a tenant | Public, rate-limited, org-scoped | Course Discovery, Enrollment, Booking | Needs versioning before this becomes a supported contract (V1 Phase 2) | Built, unversioned |
| **Future AI Assistants** | Conversational booking/discovery | Prospects, students | Whatever the underlying touchpoint requires (public API, portal token) | Course Discovery, Booking, Self-Service | A clean versioned API is a prerequisite, not a blocker — see V1 Phase 7 | Future |

---

## Part 4 — Delivery Architecture

This is where technology enters — as the mechanism for delivering capabilities already justified in Parts 1–3, not as an independent set of decisions. **The full technical decision record for this layer is `PUBLIC_EXPERIENCE_LAYER_ARCHITECTURE.md` (V1) and is not repeated here in full.** What follows is the mapping from delivery mechanism to the capabilities/touchpoints it serves.

| Delivery mechanism | Serves capabilities | Serves touchpoints | Decision status |
|---|---|---|---|
| **Hosted Experience** (TrafikskolaOS-hosted pages, reached by link) | Course Discovery, Enrollment, Self-Service (all portals) | Hosted catalog, Student/Guardian/Corporate Portals | Built — the current default for everything |
| **Embeddable Widget** | Course Discovery, Customer Acquisition, Enrollment | Driving school's own website | V1 decision: approved, sequenced, not yet built |
| **Public API (versioned)** | Course Discovery, Enrollment, Booking | Public APIs touchpoint, and the foundation under the Widget | V1 decision: versioning approved as highest-priority, not yet implemented |
| **Deep Link** (token-authenticated URL, e.g. from an email) | Self-Service, Guardian Services | Student/Guardian Portal | Built — this is how portal access already works |
| **Native Mobile** | Any API-exposed capability | Mobile App touchpoint | Future, explicitly deferred — depends on API versioning being in place first |
| **Partner Integration** | Any capability with an outbound event | Partner Systems touchpoint | Future, depends on Webhook Dispatcher |
| **Webhook** | Notifications (outbound), Booking, Enrollment | Partner Systems | V1 decision: approved, deferred, demand-gated |
| **Future Delivery Models** (AI assistant surfaces, QR-code deep links) | Course Discovery, Booking | Future AI Assistants, QR Codes | Not yet decided — correctly deferred until the Public API is versioned and stable, since every future delivery model in this row is a *client* of that API, not a parallel build |

**The single load-bearing dependency in this table:** nearly every "Future" row depends on the Public API being versioned first. This was V1's highest-priority, lowest-cost recommendation, and this document's capability/touchpoint mapping only reinforces that — it's not just a technical nicety, it's the one piece of technology work that sits underneath the largest number of future capabilities and touchpoints in this document.

---

## Part 5 — Product Architecture Principles

Included only where a genuine, durable reason exists — not copied wholesale from the prompt's example list.

1. **Business Capability First.** Every technical decision should trace to a named capability in Part 2, which traces to a journey stage in Part 1. *Why:* prevents technology-first drift, where a feature gets built because it's technically interesting rather than because a customer journey stage needs it — the exact failure mode this document was commissioned to correct.

2. **Single Source of Truth.** Operational data (students, bookings, packages, ledger entries) exists in exactly one place: TrafikskolaOS's own database. *Why:* already the platform's practice (`public-catalog` reads live tables, not a cache); stated explicitly here so it survives as new touchpoints are added rather than being reinvented per-feature.

3. **Operational Data Ownership.** TrafikskolaOS, not any touchpoint or delivery mechanism, owns and is accountable for the correctness of business data — a widget or a partner integration is a *view*, never a second copy. *Why:* the platform is system-of-record for BAS accounting and personnummer-linked records; this isn't a preference, it's a regulatory necessity already stated in `CLAUDE.md`.

4. **API First.** Every capability exposed to more than one touchpoint is built as an API first, with the touchpoint (widget, portal, mobile app) as a thin client over it. *Why:* directly validated by every comparable platform researched in V1 (Calendly, Cal.com) and by Part 3/4's own dependency structure above — nearly every future touchpoint is an API client.

5. **Customer Journey Driven.** New capabilities are justified by which journey stage (Part 1) they serve, and journey gaps (Completion, Retention, Referral) are treated as backlog, not as afterthoughts discovered late. *Why:* this document's own Part 1/2 cross-reference shows the platform has, correctly, built stages 2–8 first; this principle keeps that sequencing intentional rather than accidental going forward.

6. **Multi-Tenant First.** Every capability, touchpoint, and delivery mechanism enforces organization isolation by default. *Why:* already a hard requirement in `CLAUDE.md`; restated here because new touchpoints (widget, mobile app, marketplace) are exactly where isolation bugs get introduced if it isn't re-asserted at each layer.

7. **Security by Default, Not by Addition.** Authenticated self-service (any portal) is never embedded in a third-party page; new touchpoints default to the more conservative auth model until a specific reason justifies loosening it. *Why:* directly informed by the Corporate Portal auth-model gap surfaced in Part 3 — the risk of *not* stating this principle explicitly is that a future contributor embeds a portal because nothing on paper forbids it.

8. **Sweden First, International Ready.** Core compliance (BAS, SIE4, AGI, personnummer, BankID) is deliberately Sweden-specific; the Public Experience Layer and its touchpoints are deliberately not, wherever no compliance reason forces them to be. *Why:* V1 Phase 7 already found the Public Experience Layer to be reasonably expansion-ready; stating it as a principle prevents that property from being accidentally lost as new capabilities are added without checking.

9. **Configuration Over Customization.** Tenant-specific needs (a school's branding on a widget, a corporate customer's contract terms) are handled as configuration on shared infrastructure, not as one-off code paths per tenant. *Why:* the alternative doesn't scale past a handful of tenants and directly contradicts `CLAUDE.md`'s anti-overengineering guardrails.

10. **Long-Term Maintainability Over Short-Term Velocity, at the Architecture Layer Only.** This principle applies to *this document's* recommendations (versioning, unified portal entry, capability boundaries) — it does not override `CLAUDE.md`'s incremental-delivery discipline at the implementation layer. *Why:* stated explicitly to resolve the one real tension in this document — see Part 7.

**Deliberately excluded:** "Composable Services" was considered and left out as its own principle — it's already fully covered by API First (4) and Configuration Over Customization (9), and adding it separately would be the kind of decorative, unenforced principle Part 7 warns against.

---

## Part 6 — Future Platform Evolution

Each item below is evaluated against one question: *does the architecture in Parts 1–5 require redesign to support this, or does it already have a slot for it?*

- **Marketplace / Directory.** Already has a slot: Course Discovery (Part 2) is capability-defined, not touchpoint-defined, so a marketplace is simply a new touchpoint (Part 3) consuming the same capability and the same versioned Public API (Part 4). No redesign required — only demand-gating, per V1.

- **Partner Ecosystem.** Already has a slot: Partner Systems (Part 3) and Webhook (Part 4) are named and positioned; building this is sequencing, not architecture.

- **Insurance Companies.** Genuinely speculative, included for honesty rather than because evidence supports it: Swedish driving schools have real insurance touchpoints (practice-vehicle coverage, liability), but nothing in this codebase or in V1's research establishes demand. If it materializes, it looks like a new external party consuming Document Management and Corporate-style B2B access — an extension of an existing pattern, not a new one.

- **Corporate Customers.** Already built (Part 2); future evolution is depth (self-service reporting, multi-employee dashboards), not new architecture.

- **Government Integrations.** Not speculative — `CLAUDE.md`'s own roadmap names "Swedish Transport Agency Integration" explicitly. This would most plausibly extend Completion & Certification (Part 2, currently Partial) and Document Management — a real, foreseeable extension of already-defined capabilities, and one more reason Completion shouldn't stay Partial indefinitely.

- **AI Assistants.** Already has a slot (Part 3, Future AI Assistants), explicitly gated on API versioning rather than on any new architectural concept — this document adds nothing beyond confirming V1's framing.

- **Learning Recommendations.** Would extend Learning Journey/Curriculum Tracking (Part 2) with a new internal capability (pattern analysis over existing lesson/progress data) rather than a new touchpoint — genuinely the least-defined item on this list, since no data pipeline for this exists today. Flagged as needing its own discovery pass if pursued, not scoped here.

- **International Expansion.** Already assessed in V1 Phase 7: the Public Experience Layer itself carries no Sweden-specific structure. This document adds one refinement — Part 1's journey stages are themselves market-agnostic (every driving school in every country runs Prospect→...→Returning Customer); only the compliance content *inside* Payment and Registration is Sweden-specific. That's a favorable, already-existing separation, not one that needs to be built.

- **White-Label Solutions.** Already has a slot (Part 4, an extension of Hosted Experience/Widget with tenant branding) — no new capability required, purely a delivery-layer variant, consistent with V1's "paid, later tier" finding.

- **Developer Ecosystem** (third parties building on TrafikskolaOS, not just consuming a widget). This is the one item that *would* require new architecture beyond what Parts 1–5 define: it implies a public developer-facing surface (docs, API keys with scoped permissions, possibly a rate-limit/billing tier per API consumer) that goes beyond "a tenant embeds a widget." Named explicitly as the one genuine gap in this section rather than glossed over.

**Overall finding:** the architecture in Parts 1–5 accommodates eight of the ten items above as sequencing decisions on existing structure. Two — Insurance Companies and Developer Ecosystem — are the honest exceptions: one for lack of evidence, one for a real, named architectural gap (a developer-facing API-consumer model, distinct from a tenant-facing widget model).

---

## Part 7 — Architecture Validation

Self-review, not a defense of the document.

**Weaknesses**

- **The journey table (Part 1) is written from the individual student's perspective and states, rather than fully develops, the guardian and corporate variants.** A reader trying to use this document to scope guardian- or corporate-specific work will need more than the two paragraphs given here. This was a deliberate scope choice to avoid tripling the table's length, but it's a real gap for anyone using this as an implementation reference for those two variants specifically.

- **Several "Built" capabilities in Part 2 (Notifications, Communication) are asserted from module/function existence, not from a fresh functional audit.** This document confirms the *code exists*; it does not re-verify feature completeness within each module the way V1 re-verified CORS headers and versioning directly in source. A capability marked Built could still have real gaps at the feature level.

- **Corporate Portal's authentication model is flagged as "unverified" in Part 3 rather than resolved.** That's the honest state of current knowledge, but it means Part 5's Principle 7 (Security by Default) cannot yet be confirmed as actually applied there — a gap this document surfaces but does not close.

**Trade-offs**

- Organizing by business capability instead of technology (as instructed) makes this document more durable against technology changes, but less directly actionable for an engineer picking up a ticket — Part 4 exists specifically to bridge that gap, and its brevity (deferring to V1) is a trade-off between completeness and duplication. If V1 is ever revised, this document's Part 4 table needs a corresponding pass or it will silently drift out of sync — a maintenance cost this structure introduces that a single flat document wouldn't have.

- Principle 10 (Long-Term Maintainability at the architecture layer only) is a hedge, introduced specifically to avoid contradicting `CLAUDE.md`'s repeated "avoid speculative architecture, avoid giant mega-prompts" instruction. It's honest, but it also means this document's authority is deliberately narrower than "master architecture" might imply to a reader who hasn't read this section — worth restating: this document governs *shape*, not *sequencing or timing*, which remains `CLAUDE.md`'s and the Pilot Readiness process's to decide.

**Risks**

- **The largest risk is this document itself becoming shelf-ware** — a common failure mode for enterprise architecture documents generally, not specific to this one. Nothing in the repository's existing tooling (typecheck, lint, CI) enforces that a new capability actually gets mapped back to Part 1/2 before being built. Without a lightweight process hook (even something as simple as "new Edge Function PRs reference a Part 2 capability row"), this document's main value — preventing technology-first drift — is not self-enforcing.

- **Part 6's breadth is itself a risk if misread.** Ten future-evolution items, even correctly labeled Future/demand-gated, can read as a roadmap to a reader skimming rather than reading closely. The repeated Built/Partial/Future tagging throughout this document exists specifically to guard against that misreading, but tagging discipline only holds if it's maintained on every future edit.

**Complexity**

- This document adds a second document that any future architecture decision must be cross-checked against (this one, plus V1, plus `MASTER_ARCHITECTURE_OVERVIEW.md`, plus `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md`). Four architecture documents is a real cross-referencing cost for a small team, and it is fair to ask whether a single, consolidated document would have served better than a layered set. The layering was chosen because it matches the instruction to preserve V1 rather than rewrite it — but if this document and V1 are read independently rather than together, a reader could reasonably reach different conclusions about the same decision (e.g., widget prioritization) depending on which one they opened.

**Where future change is still likely, not just possible**

- Completion & Certification and Retention & Referral (Part 2, both Partial/Future) are the two capabilities most likely to reveal that this document's clean journey-stage boundaries don't hold up in practice — completion in particular touches Government Integration (Part 6), Documents, and Communication simultaneously, and may not decompose as cleanly as Part 2's single-row treatment implies once actually scoped.
- The Corporate journey variant (Part 1) is the least-validated part of this document — it was reconstructed from the existence of `corporate-contracts`/`corporate-customers` rather than from a full audit of that module the way the individual student journey was cross-checked against `modules/student-portal` and `modules/scheduling`. Treat it as a reasonable hypothesis, not a verified journey, until it gets the same scrutiny.

---

## Part 8 — Governance Alignment & Implementation Sequencing

This document is written against, and constrained by, two governance frameworks already in force on this project rather than as a competing set of rules:

- **`COMMISSIONING_REGISTER.md`'s discipline** — Configure → Commission → Validate → Correct → Complete, one subsystem at a time; runtime evidence governs classification, not prior discussion or planning documents; a subsystem stays in active commissioning until it reaches ✅ COMMISSIONED or is explicitly deferred for a genuine external dependency.
- **Configuration Before Expansion** — a new business capability, infrastructure component, or architectural layer is not recommended for near-term work unless it is required to complete a current subsystem, necessary to remove an architectural deficiency, required for operational readiness, or a foundational capability that prevents future rework. Everything else is long-term roadmap: named, so it isn't rediscovered later, but explicitly not being pushed as active work.

**A correction made by applying Rule 2 (Runtime Evidence Governs) to this document itself.** The first draft of Part 3 labeled SMS and Push Notifications "Future," reasoning from a code search that found no dedicated frontend module. That was the wrong evidence source: `COMMISSIONING_REGISTER.md` shows Push Notifications is **✅ FULLY COMMISSIONED** (2026-07-23/24, including a live Firebase project, real device-token registration, and real delivery validation) and the Unified Notification Center is already implemented and commissioned as a Version 1.1 baseline item. SMS is **built and code-clean**, deferred only on third-party provider configuration (Twilio account setup), not on missing platform code. Both rows have been corrected above. This is left visible rather than silently fixed, because it's a direct demonstration of why Rule 2 exists — a plausible-sounding inference from an incomplete search produced a materially wrong status, and only the commissioning record caught it.

### Sequencing test applied to every open recommendation in this document

Every capability or delivery mechanism marked **Partial** or **Future** in Parts 2, 4, and 6 is re-tested here against the four Configuration-Before-Expansion gates. Passing at least one gate is necessary to be classified as **V1.x — recommended next**; passing none means **Long-term roadmap**, not recommended as active work. Nothing in this document is classified as **V1.0 — required now**: that classification belongs solely to the existing 9-item Pilot Readiness Action Plan (`ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` §5), which this document has no authority to add to. Where an item's urgency is genuinely comparable to that list, it is flagged below as **needs an explicit operational-readiness decision**, not silently promoted.

| Item | Gate passed | Reasoning | Classification |
|---|---|---|---|
| API versioning (`/v1/` on the three public Edge Functions) | (b) removes an existing deficiency; (d) foundational, prevents future rework | Unversioned and already live; every future client (widget, mobile app, partner integration) in Part 4 depends on this one thing existing first | **V1.x — recommended next**, highest priority in this bucket |
| Origin/rate-limit hardening on `public-catalog`/`public-enrollment` | (b) removes an existing deficiency; (c) operational readiness | `Access-Control-Allow-Origin: *` with no origin-awareness is a live, already-shipped exposure (cross-tenant scraping), not a future risk | **Needs an explicit operational-readiness decision** — closest item in this document to warranting V1.0 treatment, but that call belongs to whoever owns the Pilot Readiness list, not to this document |
| Guardian-consent capture in `public-enrollment` | (b) removes an existing deficiency (compliance gap); (c) operational readiness | GDPR Article 8 exposure exists for every day the endpoint is live and reachable by minors | **Needs an explicit operational-readiness decision**, same reasoning as above |
| Unified portal entry point (student/guardian/instructor) | (d) foundational, prevents future rework | Real precedent already exists in this codebase (guardian-portal duplication defect) for the cost of *not* doing this, but the three portals work independently today — nothing is currently broken | **V1.x — recommended next**, lower priority than the three items above |
| Completion & Certification workflow (Part 2) | (a) arguably completes the current Student/Scheduling subsystem's lifecycle | Genuinely borderline: the student lifecycle is incomplete without it, but it was not raised as a defect during any commissioning pass | **V1.x — recommended next**; explicitly not asserted as V1.0 without the same commissioning scrutiny given to Push/SMS above |
| Embeddable Widget SDK | None | Pure new capability — valuable, but nothing today is broken or blocked without it, and it doesn't itself prevent rework (the API versioning above is what does that) | **Long-term roadmap** — not recommended as active work; revisit once real tenant demand exists and the versioning foundation is in place |
| Webhook Dispatcher | None | Same reasoning — a new integration surface, not a fix | **Long-term roadmap** |
| Retention & Referral capabilities | None | New capabilities at the tail of the customer journey; nothing currently depends on them | **Long-term roadmap** |
| Native Mobile App | None | Depends entirely on the versioning work above having already happened; not itself removing any deficiency | **Long-term roadmap** |
| All ten Part 6 items (Marketplace, Partner Ecosystem, Insurance, Government Integration, AI Assistants, Learning Recommendations, International Expansion, White-Label, Developer Ecosystem, Corporate depth) | None, as a category | Confirmed by re-applying the same test used in Part 6 itself — every item there was already found to be a "slot already exists" sequencing question, not a current deficiency or readiness gap | **Long-term roadmap**, consistent with how Part 6 already framed them — this table doesn't change that finding, it confirms it under a stricter test |

**Net effect on this document's own recommendations:** of everything raised across Parts 2, 4, and 6, only two items (CORS/rate-limit hardening, guardian-consent capture) are flagged as urgent enough to need an explicit readiness decision now; three more (API versioning, unified portal entry, Completion & Certification) are legitimately V1.x under the gate test; everything else — including the Widget SDK and Webhook Dispatcher, which Part 4 and the V1 ADR both treat as the natural next build — is correctly long-term roadmap once measured against Configuration Before Expansion rather than against "would this be valuable." That reclassification doesn't reverse the earlier ADR's decision to *approve* the Public Experience Layer direction; it constrains *when* any of it should move from documented direction to active work.
