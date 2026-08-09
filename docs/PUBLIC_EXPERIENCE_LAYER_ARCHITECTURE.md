# Public Experience Layer — Architecture Decision Record

**Scope:** How a driving school's *own* customer-facing website (not TrafikskolaOS's own marketing site — see `PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md` for that, a separate concern) integrates with TrafikskolaOS's operational capabilities: package catalog, enrollment, booking, and the student/guardian/instructor portals.

**Status:** Decision record. No code changed to produce this document. Builds on the discovery findings in the Website Integration Architecture Report (scratchpad) — this document is the independent architectural judgment built on top of that discovery, cross-checked against industry practice rather than derived from it in isolation.

**Note (V2):** This document is referenced as "V1" from `PRODUCT_ARCHITECTURE.md`, which reorganizes this same technology decision around business capability and customer journey and folds it in as Part 4 (Delivery Architecture). The decisions below are unchanged and remain the authoritative ADR for this layer — read `PRODUCT_ARCHITECTURE.md` first for how it fits into the whole product.

---

## Phase 1 — Industry Research

Reviewed against the closest comparable SaaS categories: appointment/booking platforms (Calendly, Acuity, Cal.com), fitness/salon/wellness booking (Mindbody, Vagaro, Fresha), and — for the portal-authentication question specifically — patient-portal precedent from healthcare (MyChart-style, well-established industry norm rather than something requiring a fresh citation).

**Calendly** ships three integration tiers that all sit on the *same* backend: an Embed JS API (inline, popup, and popup-text embeds — the "paste this on your site" product), a versioned REST API (v2, OAuth 2.1) for custom builds, and webhooks for outbound events (booking created, canceled). ([Calendly embed API](https://calendly.com/blog/api-dev-portal), [webhooks](https://calendly.com/help/webhooks-overview))

**Cal.com** is the sharpest modern example of the pattern this document recommends: it is explicitly built as *"booking infrastructure inside your product, not just a link you share."* It exposes the full scheduling lifecycle through a public API (100+ endpoints), ships a component library ("Cal Atoms") specifically so a host site can embed a fully-branded scheduler without an iframe, and treats webhooks as a first-class, documented primitive, not an afterthought. Cal.com's own framing is instructive: they treat scheduling as *a developer platform*, not a closed app bolted onto a website. ([Cal.com API](https://cal.com/blog/best-appointment-scheduling-api), [Cal Atoms](https://cal.com/integrate))

**Mindbody / Vagaro / Fresha** (fitness, salon, wellness — the closest analog to a driving school in transaction shape: book a slot, pay, come back for the next one) confirm a second, distinct pattern worth separating from the embed question: several of these platforms *also* operate their own consumer-facing marketplace/directory app, independent of any single business's own website — a discovery channel, not a website-integration mechanism. Fresha in particular monetizes primarily through marketplace commission rather than the widget itself. White-labeling and custom domains appear consistently as a **higher, later pricing tier** feature (Vagaro's higher plans, Mindbody Elevate), never a v1/launch requirement.

**Convergent pattern across all three, stated precisely:**

| Layer | Universal? | Notes |
|---|---|---|
| Versioned public API as the foundation | Yes — Calendly v2, Cal.com's entire product | Everything else is a client of this |
| Embeddable widget/component as the primary non-developer integration path | Yes | The actual "paste this on your site" deliverable |
| Hosted fallback page (no embed needed) | Yes | Calendly's own scheduling page, Cal.com's booking page, TrafikskolaOS's existing `/catalog/:orgId` |
| Webhooks for outbound events | Yes, at maturity | Missing entirely from TrafikskolaOS today, including for its own Stripe-adjacent flows outward |
| White-label / custom domain | Yes, but always a **paid, later tier** | Never a launch requirement anywhere observed |
| Consumer marketplace/directory (separate from any one tenant's site) | Present in wellness-vertical platforms, absent in Calendly/Cal.com | A distinct strategic layer, not a website-integration mechanism — relevant to TrafikskolaOS's 10-year horizon, not its next release |
| Authenticated customer portal embedded in a third-party site | **Never observed** | Every comparable platform keeps this hosted and linked — see Phase 2 |

**Honest weaknesses in the pattern, worth designing around rather than discovering later:** cross-site CSS bleed on iframe-based embeds (Cal.com solves this with a real component library, not an iframe — the more expensive but more correct answer); third-party cookie restrictions increasingly break session continuity inside frames; and once a widget is live on external sites, the API underneath becomes a de facto permanent contract whether or not it was ever formally versioned.

---

## Phase 2 — Challenging the Assumptions

**"Integrate with existing websites instead of replacing them."** Agree without reservation — this is universal across every platform reviewed. No comparable SaaS has ever tried to become its customers' website.

**"Separate public-facing capabilities from internal operational capabilities."** Agree, and this is precisely what TrafikskolaOS already did, probably without naming it: `public-catalog`, `public-enrollment`, and `public-booking` are separate Edge Functions from the internal RBAC'd equivalents, not the same endpoints with a public flag. That's the correct shape. What's missing isn't the separation — it's formalizing it as a named, versioned, deliberately-scoped layer instead of three independently-grown functions that happen to share a naming prefix.

**"Website content should remain outside TrafikskolaOS."** Mostly agree, with one refinement: general brand content (blog, news, testimonials) should stay on the tenant's own site/CMS — no platform in the comparison set tries to own this, and it would directly contradict this project's own "not a generic CMS" boundary. But content that *describes* an operational entity the platform already owns (a package's marketing description) correctly lives with that entity, not as a separate content system.

**"Operational business data should be owned by TrafikskolaOS."** Agree without reservation — not really optional given the platform is system-of-record for BAS accounting, SIE4, and personnummer-linked records.

**"Authentication should have a unified customer entry point."** This needs disambiguating before it can be agreed or disagreed with — *whose* customer? If it means the driving school's own staff, unified login already exists. If it means the student/guardian/instructor, there are today three separate portal implementations with three separate entry points and three separate token-link mechanisms. That's a real, addressable gap — see Phase 6.

**"Public functionality should be reusable across multiple channels."** Agree — this is the strongest argument in the entire review for treating the public API as the foundation, with the widget (and any future mobile app or partner integration) as equal clients of it rather than each being built bespoke.

**Genuinely overlooked, worth naming explicitly:**

1. **Minors and guardian consent.** Driving students are frequently minors — AM/moped from 15, A1 motorcycle from 16 in Sweden. A public enrollment API reachable from `Access-Control-Allow-Origin: *` on any website has no visible parental-consent capture today. This is GDPR Article 8 territory, and it sits oddly next to a platform whose own conventions elsewhere (BankID, encrypted personnummer, BAS/SIE4) treat Swedish compliance as non-negotiable. This is a present gap, not a hypothetical one.

2. **The open CORS surface is a live risk today, not a future one.** `Access-Control-Allow-Origin: *` on `public-catalog` and `public-enrollment` (confirmed directly in both files) means any website — not only the legitimate tenant's own — can call these APIs right now. Nothing currently stops enumeration of `org_id` values to scrape every tenant's pricing, or calling another school's enrollment endpoint under its identity. This deserves an explicit mitigation decision, not silence.

3. **No API versioning exists.** Confirmed directly: the routes are `public-catalog`, `public-enrollment`, `public-booking` — no `/v1/` anywhere. The moment any of these is embedded on an external site (via widget, iframe, or direct call), the response shape becomes a de facto permanent contract, and TrafikskolaOS has no reliable way to know which tenants are affected by a breaking change, because there's no registration step between "API exists" and "someone is calling it from outside."

4. **Duplicated portal implementations have already caused a real, already-fixed defect in this exact codebase** — `student-portal/index.ts` documents having removed a second, fully duplicated, already-drifted copy of guardian functionality. That's not a hypothetical architectural concern; it's precedent for exactly the cost the Phase 6 consolidation recommendation is meant to prevent from recurring.

5. **Corporate customers already exist as a real, separate capability** (`corporate-contracts`, `corporate-customers` Edge Functions, confirmed present) and were absent from the original discovery report entirely. A company paying for its employees' lessons is a genuine B2B2C shape, distinct from an individual student/guardian — worth carrying into any future portal-consolidation or public-catalog work rather than being rediscovered later.

---

## Phase 3 — Alternatives, Evaluated Honestly

**A. Redirect/link only (status quo).** Zero further investment, works today. Every redirect measurably loses some fraction of visitors to abandonment, and it's the weakest form of brand continuity. A floor, not a destination.

**B. Embeddable JS widget / component.** Matches the dominant pattern directly (Calendly's embed API, Cal.com's Atoms). Installable by a non-developer, which matters — TrafikskolaOS's actual customers are largely small Swedish driving schools without engineering staff, per this project's own framing. Real cost is higher than "just wrap the API in an iframe": genuine cross-site isolation (Shadow DOM, or a real component approach like Cal.com's) costs more than a naive iframe and should be budgeted honestly, not discovered as scope creep later.

**C. Plain iframe embed, no SDK.** Could ship in days — the existing hosted catalog page could be iframed today with zero platform changes. Legitimate as a low-effort *interim* step; not a destination. Iframes are invisible to the host page's SEO, behave poorly on mobile unless carefully sized, and are increasingly fragile as browsers restrict third-party cookies in framed contexts — which would specifically threaten anything session-based inside the frame.

**D. White-label / custom domain per tenant.** Best brand continuity and SEO outcome. Real infrastructure cost (per-tenant SSL/DNS/CNAME) disproportionate to a customer base of mostly small, single-location schools — and, per Phase 1, never observed as a launch feature anywhere in the comparison set, always a paid later tier. This is squarely the kind of "unnecessary infrastructure expansion" this project's own conventions warn against building prematurely.

**E. API-first, no official widget — docs and a reference implementation only.** Works for Stripe and Twilio because their customers are developers. Would fail here because it quietly excludes the majority of TrafikskolaOS's actual, largely non-technical customer base. Valuable as a *complement* (good docs matter regardless of the primary path) — wrong as the primary strategy for this platform specifically.

**F. A formal Public Experience Layer** — not a single widget, but a named architectural layer: versioned public API + widget/embed SDK + hosted fallback experience + webhook dispatcher, with deliberate sequencing, replacing a handful of individually-grown Edge Functions that happen to be public.

**Conclusion:** F is the correct frame; B is its first concrete, shippable deliverable — not a competing option. This is reached by elimination above, and lines up with where every mature comparable platform (Calendly, Cal.com specifically) has actually converged, not merely with prior framing in this project.

---

## Phase 4 — Recommended Architecture

Formalize a **Public Experience Layer** as a named architectural concern, not an incidental grouping of public-prefixed functions.

**1. Versioned Public API (foundation).** Bring the existing `public-catalog`, `public-enrollment`, `public-booking` under an explicit `/v1/` contract. This is the single highest-leverage, lowest-cost change recommended in this document — it costs little today and becomes expensive to retrofit the moment external sites are actually calling these endpoints.

**2. Embeddable Widget/Component SDK.** Thin client over layer 1, isolated (Shadow DOM or equivalent — not a naive iframe). First capability: package catalog + enrollment, matching what's already closest to production-ready per the discovery report.

**3. Hosted Experience.** The existing catalog/checkout pages and the three portals stay hosted, unchanged in that respect — but consolidated at the entry point (Phase 6).

**4. Webhook Dispatcher.** Outbound events (new booking, new lead) so a tenant's own CRM or mailing tool can react — the layer that's completely absent today, apart from Stripe talking *inward*.

**Data ownership:** unambiguous, no exceptions — TrafikskolaOS owns all operational data at every layer. No layer gets its own copy; the existing pattern of `public-catalog` reading the live `packages` table directly (not a cached duplicate) is correct and should stay the model.

**Authentication model — two genuinely different risk profiles, not one:**
- *Anonymous/public* (browsing, enrolling): no auth, rate-limited, origin-aware.
- *Authenticated self-service* (the three portals): token/magic-link as today, but **never embedded in a third-party page.** This is a hard boundary, not a phase-1-only limitation — embedding an authenticated session inside an iframe on a site TrafikskolaOS doesn't control is a real clickjacking/session-integrity risk, and it's why no comparable platform (Calendly, Cal.com, or the patient-portal precedent from healthcare) embeds its authenticated area either. Portals stay linked.

**Integration boundary:** the versioned public API is the *only* thing external code (widget, future mobile app, future partner integration) may depend on. Internal RBAC'd APIs stay fully separate, matching what already exists today.

---

## Phase 5 — Business Capability Analysis

| Capability | Purpose | Data owner | Delivery model | Why |
|---|---|---|---|---|
| Package/Course Catalog | Show offerings/pricing | TrafikskolaOS | Public API + Widget | Needs live pricing; best conversion staying on the host site |
| Booking / Availability | Core conversion action | TrafikskolaOS | Public API + Widget | Time-sensitive — never a stale copy on the host site |
| Enrollment | Lead/customer creation | TrafikskolaOS | Public API + Widget form | Needs real-time coupon/availability validation |
| Lead Capture (interest form) | Trust/marketing signal | TrafikskolaOS | Public API + Widget | Lower-stakes than full enrollment; a reasonable early widget candidate |
| Campaigns/Discounts | Conversion | TrafikskolaOS | Public API + Widget | Already correctly implemented this way |
| Student/Guardian/Instructor auth | Access to personal data | TrafikskolaOS | Hosted, deep-linked — **not embeddable** | Session-security boundary must not live inside a third-party DOM |
| Student/Guardian/Instructor portal | Ongoing self-service | TrafikskolaOS | Hosted + deep link | Same reasoning; already deep-linkable from notifications |
| Corporate customer self-service | B2B billing/reporting | TrafikskolaOS | Hosted, likely full accounts | Already exists (`corporate-contracts`, `corporate-customers`); invoicing/B2B implications warrant stronger auth than a magic link, not weaker |

**Should stay entirely on the tenant's own site/CMS:** blog, news, reviews/testimonials, SEO landing pages, company presentation. No operational coupling exists for any of these — building them into TrafikskolaOS would be scope creep against the platform's own stated boundary ("not a generic ERP," implicitly "not a CMS").

---

## Phase 6 — Customer Portal Strategy

**Recommendation: consolidate to a single entry point** ("Logga in") that determines role from the session/token and routes internally to the student, guardian, or instructor experience, rather than three separately-marketed front doors.

This matches where multi-stakeholder platforms converge (a single sign-in that branches by detected role, rather than three separate login URLs a tenant's website has to correctly maintain), and it's backed by direct precedent *in this codebase*: the guardian-portal duplication-and-drift defect referenced in Phase 2 is a concrete, already-occurred instance of the cost three separate implementations create.

**Important nuance — this is a frontend/routing consolidation, not a backend merge.** The underlying session mechanisms and data shapes for student/guardian/instructor can and should stay distinct: a guardian viewing multiple children's records is a genuinely different problem shape than an instructor viewing their own schedule. Don't collapse this into one data model just because the entry point is unified.

**Practical benefit:** a driving school's own website currently needs three correctly-maintained links ("Elevportal" / "Föräldraportal" / "Lärarportal"). One link that TrafikskolaOS disambiguates internally is simpler to maintain and harder to get wrong — for the school, not just for TrafikskolaOS.

---

## Phase 7 — Future Vision (10-Year Horizon)

- **Mobile apps.** If the API is versioned now, a future app is just another client of the same contract. The change needed *now* is committing to versioning before external widget adoption locks in an unversioned surface — this is the single most time-sensitive recommendation in this document.
- **BankID.** Already exists for staff auth. Extending it to student-facing authentication (18+ students) is a natural, low-risk extension of infrastructure that already exists, and it would meaningfully strengthen the guardian-consent gap from Phase 2 — a BankID-verified consent flow is materially stronger than an email-link one.
- **Consumer marketplace/directory.** A distinct strategic layer observed in the wellness-vertical platforms (Fresha, Mindbody), not a website-integration mechanism — a "hitta en trafikskola" discovery surface independent of any one tenant's site. Genuinely worth having on a 10-year roadmap; not a Phase 1 decision, and it would sit on top of the same public API rather than requiring a separate one.
- **White-label / custom domains.** 10-year-horizon, demand-gated. Consistent with Phase 1 evidence: every comparable platform treats this as a paid, later tier, never a launch requirement.
- **International expansion.** The Public Experience Layer itself has no inherent Sweden-specific structure — license-category labels are a data/i18n concern, not an architectural one. This layer is already reasonably expansion-ready; the deep Sweden-specific coupling (BankID, BAS, SIE4) lives in the core platform, not here.
- **AI-assisted booking.** Nothing here blocks it — a clean versioned API makes a future booking assistant easier to build, not harder.

---

## Phase 8 — Risks

| Risk | Type | Mitigation |
|---|---|---|
| Unversioned public API becomes a permanent, breaking-change-fragile contract once externally embedded | Architectural | Version from day one (`/v1/`) — highest priority, lowest cost, gets more expensive every week it's deferred |
| Wide-open CORS with no origin awareness allows cross-tenant scraping/abuse today | Security | Per-org rate limiting + anomaly monitoring, even short of full origin-locking |
| No parental-consent capture in public enrollment despite Sweden's minor-licensing reality (AM from 15, A1 from 16) | Compliance | Add explicit guardian-consent capture to the enrollment flow — GDPR Article 8 |
| White-label/marketplace investment before real demand exists | Business | Sequence strictly demand-gated, not roadmap-gated |
| Non-technical schools can't install even a simple widget snippet | Adoption | Fold installation into the existing onboarding flow; consider white-glove install for early tenants |
| Over-building for scale this platform doesn't need | Scalability (inverse) | Resist explicitly — current Edge Function + Supabase shape is adequate for the stated business scope |
| Embedding authenticated portal sessions in third-party iframes | Security | Hard architectural rule: portals are linked, never embedded — no exception observed anywhere in the comparison set |

---

## Phase 9 — Final Recommendation

**Approve:** formalizing a Public Experience Layer — versioned public API as the foundation, a properly-isolated embeddable widget as the first customer-facing deliverable, unified portal entry-point consolidation, and outbound webhooks once the API is stable.

**Reject, for now:** white-label/custom domains, marketplace/directory investment, and an API-only/no-widget strategy that would exclude this platform's actual, largely non-technical customer base.

**In scope for this layer's v1.0:**
- API versioning formalized on the three existing public endpoints
- Origin/rate-limit hardening per tenant
- Guardian-consent capture added to the enrollment flow
- Unified portal entry point (student/guardian/instructor)

**Deferred, demand-gated:**
- Widget/embed SDK build-out
- Webhook dispatcher
- White-label/custom domains
- Consumer marketplace/directory

None of the above is a Version 1.0 pilot blocker in the sense of the project's existing Pilot Readiness scope freeze — this is architectural direction for what comes after, not a claim on the current release's remaining work.

---

## Architecture Decision Record

**Context.** TrafikskolaOS tenants (Swedish driving schools) operate their own marketing websites independently of the platform. Three public, unauthenticated Edge Functions already exist (`public-catalog`, `public-enrollment`, `public-booking`) but are reachable today only via direct link or custom developer integration against raw, unversioned APIs — no packaged, non-developer-installable integration path exists.

**Problem Statement.** Define the long-term architecture for how a tenant's existing website integrates with TrafikskolaOS's operational capabilities, in a way that matches proven SaaS practice, serves a largely non-technical customer base, and doesn't foreclose a 10-year roadmap (mobile, marketplace, international expansion).

**Options Considered.** Redirect-only; embeddable JS widget/component; plain iframe; white-label/custom domain; API-first with no widget; formal Public Experience Layer (versioned API + widget + hosted fallback + webhooks).

**Decision.** Adopt a formal Public Experience Layer, with a versioned public API as its foundation and a properly-isolated embeddable widget as the first delivered capability. Authenticated self-service (the three portals) remains hosted and deep-linked, never embedded. Consolidate the three separate portal front doors into a single, role-disambiguating entry point.

**Rationale.** Matches the converged pattern across the closest comparable SaaS categories (Calendly, Cal.com, and the wellness-booking vertical), verified directly rather than assumed; serves the platform's actual non-technical customer base, unlike an API-only strategy; closes a real, already-evidenced maintenance cost (the guardian-portal duplication defect); and establishes API-versioning discipline before external embedding makes it expensive to retrofit.

**Trade-offs.** Higher near-term engineering investment than adding more redirects. Explicitly defers white-labeling and marketplace ambitions some stakeholders may want sooner. Requires committing to real isolation (Shadow DOM or equivalent) and real versioning discipline rather than shipping the fastest possible iframe.

**Consequences.** Establishes a stable, extensible integration surface a future mobile app, partner integrations, and webhooks can build on without rework. Requires near-term, currently unscoped work on origin/rate-limit hardening and guardian-consent capture.

**Future Considerations.** Revisit white-labeling and marketplace investment once real tenant demand signals appear. Revisit portal-consolidation's backend implications if guardian/instructor data models diverge further. Extend BankID to student-facing authentication once the guardian-consent gap is prioritized.

**Sources consulted:** [Calendly Embed API](https://calendly.com/blog/api-dev-portal), [Calendly Webhooks](https://calendly.com/help/webhooks-overview), [Cal.com API](https://cal.com/blog/best-appointment-scheduling-api), [Cal.com Atoms](https://cal.com/integrate).
