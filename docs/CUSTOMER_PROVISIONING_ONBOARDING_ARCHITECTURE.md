# Customer Provisioning & Tenant Onboarding Architecture

**Document type:** Detailed business-lifecycle architecture — defines the missing orchestration that connects Customer Acquisition, Platform Provisioning, Tenant Onboarding, and ongoing tenant operation into one complete commercial customer lifecycle.
**Status:** Frozen. Final governance and scope refinement complete, following an independent architectural review. Defines the target design; no implementation has begun.
**Refinement note:** This revision strengthens four previously under-defined areas — the Commercial business process, the Platform Billing/Provisioning boundary, the Platform Customer Lifecycle, and the architectural meaning of Go Live — plus a Responsibility Handover diagram and a consistency check against the three documents below. No existing section was redesigned, rewritten, or restructured; all additions are new sections layered onto the original approved structure.
**Second refinement note (post-implementation architecture review):** Implementation of Section 8 surfaced that two of the original eight completion criteria — Staff Invitations and Data Migration — required an explicit "skipped" decision with no derivable signal, which in turn required introducing persisted orchestration state purely to record that decision. A follow-up review challenged the premise: both capabilities are already described in this document (Data Migration explicitly, Staff Invitations implicitly) as optional rather than mandatory. Re-scoping them as **Recommended Configuration** — surfaced, always derived, never gating — removes the need for that decision to be recorded at all. Section 8 now distinguishes **Go Live Readiness Requirements** (six steps, all fully derived from existing module data, gating) from **Recommended Configuration** (two steps, fully derived, informational only). Section 17's Ready for Go Live condition is updated accordingly. Tenant Onboarding now persists exactly one piece of state in the entire capability: the Go Live event itself (Section 17) — no onboarding-progress table exists or is required.
**Basis:** The approved Business Capability Audit (2026-07-10). Every "existing capability" claim in this document traces back to a finding in that audit, not to assumption.
**Relationship to other documents:** This is the "more detailed, dedicated onboarding-journey document" that `MASTER_ARCHITECTURE_OVERVIEW.md` (Section 15, Future Evolution) named as a future documentation opportunity, and it is the "Business Lifecycles / Business Capabilities" document that Section 11 of that same document noted did not yet exist as a standalone file. It supersedes neither document — it fills the gap both of them named, and this refinement introduces nothing that contradicts either it or the Enterprise Architecture Handbook.
**Audience:** Developers, architects, and future AI assistants who will implement this lifecycle, and anyone deciding what to build next.

This document defines missing business capabilities and how they orchestrate existing ones. It does not redesign any existing module, and it does not specify code-level implementation — that is the job of a subsequent implementation plan, written against this document once it is approved.

---

## 1. Executive Summary

The Business Capability Audit found that TrafikskolaOS already contains almost everything a complete commercial customer lifecycle needs: a working Demo Request pipeline, a mature Platform Administration console, a deep Tenant Workspace (scheduling, students, finance, communication, reporting), and a proven manual provisioning procedure. What it does not contain is the connective tissue between these pieces — specifically three gaps, all confirmed by direct code review, not inference:

1. **No bridge from Acquisition to Provisioning.** A won demo request has no code path that turns it into an organization.
2. **Provisioning is incomplete even where automated.** The one UI path that creates an organization writes a single database row; the only path that produces a *functional* tenant (organization, location, administrator, membership, role) is a manual SQL script.
3. **Tenant Onboarding does not exist.** A freshly provisioned organization's first user lands on the ordinary, empty dashboard, with no guided setup of any kind.

This document's job is to close exactly those three gaps — and only those three — by defining an **orchestration layer**: a thin coordinating capability that sequences, tracks, and gates existing modules, without owning the business logic any of those modules already own. Finance stays the single source of truth for finance. Communication stays the single source of truth for communication. Student Onboarding remains its own, already-mature, independent process, untouched by anything in this document. Provisioning and Tenant Onboarding orchestrate; they do not duplicate.

Where this document proposes something genuinely new — a small number of items, enumerated explicitly in the Reuse Matrix (Section 18) — it is because the audit found no existing equivalent, not because an existing capability was judged insufficient.

This refinement pass adds no fourth gap. It clarifies the business process leading into gap 1 (Commercial Lifecycle, Section 5), the boundary condition between Commercial and Provisioning (Section 6), a Platform-Administration-perspective view of an organization's state across its whole life (Section 11), an explicit ownership-handover diagram (Section 13), and the precise business meaning of two states already named in the original Lifecycle State Machine (Go Live Definition, Section 17).

---

## 2. Architecture Principles

These are the principles this document is built against, restated with the specific reasoning that grounds each one in the audit's findings.

| Principle | Why (grounded in the audit) |
|---|---|
| **Reuse before creating.** | The audit found working capability in every domain except the three gaps above. Building anything new before confirming reuse is impossible would contradict the audit's own findings. |
| **Existing modules remain the single source of truth.** | Finance owns financial data. Communication owns messages. Scheduling owns bookings. Tenant Onboarding orchestrates calls into these modules; it never stores a second copy of their data. |
| **Onboarding orchestrates existing capabilities.** | Every Tenant Onboarding step in Section 8 names the existing module that performs the actual work. The orchestration layer's only state is *progress through the sequence*, never the underlying business data. |
| **No duplicate imports.** | `modules/data-migration` already exists, already handles multi-entity CSV import with session state and templates. Tenant Onboarding's Data Migration step calls it directly, for the tenant's own operational data — never for student import, which is Student Onboarding's responsibility (Section 3). |
| **No duplicate finance.** | The Finance module's existing configuration surfaces (chart of accounts, VAT periods) are reused as-is for the Finance Configuration Tenant Onboarding step. |
| **No duplicate communication.** | Communication's existing Channel Settings and Template Management routes are reused as-is for the Communication Configuration Tenant Onboarding step. |
| **No duplicate student onboarding.** | Student Onboarding (the `public-enrollment` → `enrollment_requests` → checklist pipeline) is a mature, independent process that onboards *one student at a time* into an *already-operating* school. Tenant Onboarding onboards *one school*, once. These never merge, and nothing in this document changes the student pipeline. |
| **Platform Administration remains responsible for platform operations.** | Acquisition, Commercial approval, Provisioning, Tenant Onboarding Monitoring, and Go Live Approval are Platform Administration responsibilities (Section 10) — the same boundary the audit and Master Architecture Overview already establish. |
| **Tenant Workspace remains responsible for driving school operations.** | Every Tenant Onboarding step's actual work happens inside Tenant Workspace modules the school will keep using every day after onboarding ends (Section 12). |
| **Student Onboarding remains an independent business process.** | Reaffirmed throughout this document. No Tenant Onboarding step consumes or reuses `enrollment_requests`, `student_leads`, or any part of the student pipeline. |

---

## 3. Terminology Reconciliation

**This document's scope, stated precisely, once, so nothing later needs re-litigating it.** Five business processes appear throughout this document. Each has an exact start boundary, an exact end boundary, and an owner. No sentence elsewhere in this document should be read as moving a capability from the process it is listed under here.

1. **Customer Acquisition.** Starts when a visitor books a demo. Ends when the customer is commercially approved. Owned by Platform Administration.
2. **Commercial.** The commercial agreement between TrafikskolaOS and the driving school — subscription/plan selection, commercial approval, Platform Billing, and the trigger for Provisioning. Owned by Platform Administration.
3. **Platform Provisioning.** Creation of the SaaS environment itself: organization, tenant, subscription, Tenant Administrator, membership, feature entitlements, invitations. Owned by Platform Administration.
4. **Tenant Onboarding — this document's primary and only onboarding scope.** Begins ONLY after Platform Provisioning has completed. Its objective is to help a newly created driving school configure TrafikskolaOS for the first time, by orchestrating existing Tenant Workspace capabilities. It does not replace them, duplicate them, or redesign them. Examples: Organization Profile, Branch Offices, Business Settings, Data Migration (of the *tenant's own* operational and business configuration data — see Section 8), Staff Invitations, Booking Configuration, Finance Configuration, Communication Configuration, Verification, Go Live.
5. **Student Onboarding — an existing operational workflow, entirely outside this document.** Belongs entirely to the Tenant Workspace: student registration, student enrollment, student import, student qualification, student documents, lesson packages, payments, booking lessons. Student Onboarding is never a Tenant Onboarding step, is not designed, redesigned, or referenced as a step anywhere in this document, and begins only after the driving school is already operational (i.e., after Live Customer — Section 17).

Wherever this document uses the bare word "onboarding" without a qualifier, it means **Tenant Onboarding** (process 4 above). It never means Student Onboarding (process 5). Every remaining occurrence of an unqualified "onboarding" in this document refers to the tenant, not to a student — reviewed and confirmed sentence-by-sentence as part of this document's final terminology review.

Two further naming issues, resolved in language only, without touching code:

- **`onboarding-page` is not Tenant Onboarding.** The existing `apps/web/src/modules/onboarding-page/` module is public marketing content on the `/onboarding` route, describing the sales-to-launch story to a prospect. Everywhere this document says **Tenant Onboarding**, it means the in-product orchestration defined in Section 8 — a capability that does not exist yet and, if built, should live under a name that cannot be confused with the marketing page (see Section 19, Future Integration Points).
- **"Customer Onboarding" (Master Architecture Overview) means Tenant Onboarding (this document).** The Master Architecture Overview's Business Flow Overview uses "Customer Onboarding" loosely, for the whole visitor-to-active-tenant journey. This document uses the audit's more precise five-process vocabulary throughout: **Customer Acquisition**, **Commercial**, **Platform Provisioning**, **Tenant Onboarding**, **Student Onboarding**. Where this document says "Tenant Onboarding," it is the same conceptual step the Master Architecture Overview calls "Customer Onboarding."
- **"Platform Customer Lifecycle" (Section 11, new in this refinement) is a state view, not a sixth process.** It describes the same five processes above from Platform Administration's own record-keeping perspective (what state is this organization in, right now) — it does not introduce a sixth business process alongside Acquisition/Commercial/Provisioning/Tenant Onboarding/Student Onboarding.

---

## 4. Customer Lifecycle

The complete lifecycle, stage by stage. "Existing capabilities" lists only what the audit confirmed is built and operational; "Missing capabilities" lists only what the audit confirmed does not exist.

### 4.1 Visitor
- **Business objective:** Earn attention; explain the product; move a qualified visitor toward a real conversation.
- **Platform owner:** Public Website (no account, no owner-side system).
- **Existing capabilities:** Public marketing pages (Home, Business Challenges, Resources, About), all built with real content.
- **Missing capabilities:** None — this stage is complete.
- **Required integrations:** None.

### 4.2 Demo Request
- **Business objective:** Capture a qualified lead's intent, without requiring them to have any account or organization.
- **Platform owner:** Public Website (capture) → Platform Administration (working the lead).
- **Existing capabilities:** `demo-page` form → `demo-requests` Edge Function → `demo_requests` table (no `organization_id`, by design) → Platform Administration's Demo Request console (list, filter, status workflow, assignment, notes) — all built and verified operational.
- **Missing capabilities:** Outbound notification on submission (an `event_outbox` row is enqueued; no handler processes it yet).
- **Required integrations:** An email provider, once a notification handler is built (Section 19).

### 4.3 Commercial
- **Business objective:** Turn a qualified lead into an agreed deal — pricing tier, trial terms, and an explicit decision to provision.
- **Platform owner:** Platform Administration.
- **Existing capabilities:** The Demo Request status workflow already includes `qualified` as a state. Organizations/Subscriptions pages already record `subscription_tier`, `subscription_status`, and `trial_ends_at` — the fields a commercial decision ultimately produces.
- **Missing capabilities:** A recorded decision point between "qualified lead" and "provision this organization." Today, `demo_requests.status = 'converted'` conflates the commercial decision with the act of provisioning itself — the two are different business moments and should be distinguishable (see Section 16's state machine, and Section 5, which expands this stage into its full business process).
- **Required integrations:** None beyond the orchestration layer itself.

### 4.4 Provisioning
- **Business objective:** Turn a commercial decision into a real, functional tenant — not just a database row.
- **Platform owner:** Platform Administration (triggers and monitors it); the provisioning function itself is shared infrastructure.
- **Existing capabilities:** `organizations` table and insert shape (`CreateOrgDialog` / `useCreateOrg`); the complete *manual* sequence already proven correct in `bootstrap_org_admin.sql` (organization, location, profile, membership, `org_owner` role); `event_outbox` as the existing notification-enqueue mechanism; `audit_logs` (applicable here, unlike `demo_requests`, because a provisioned organization has an `organization_id`).
- **Missing capabilities:** Automation. Every one of the above steps beyond the bare organization row is manual today. Full design in Section 7; the business condition that permits this stage to start at all is defined in Section 6.
- **Required integrations:** An identity/email provider for the Tenant Administrator invitation (same underlying gap as 4.2's notification handler).

### 4.5 Tenant Onboarding
- **Business objective:** Get a freshly provisioned organization's first real data and staff in place, so it is ready to operate for real.
- **Platform owner:** Tenant Workspace performs the work; Platform Administration monitors progress (Section 10).
- **Existing capabilities:** Every module a step needs already exists and is operational — Settings, Locations, Data Migration, Scheduling configuration, Vehicles, Instructors, Finance configuration, Communication configuration. None of this is missing at the module level.
- **Missing capabilities:** The orchestration layer itself — sequencing, trigger conditions, completion criteria, and progress tracking across those modules. Full design in Section 8.
- **Required integrations:** None beyond what each underlying module already integrates with.

### 4.6 Go Live
- **Business objective:** A clear, recorded moment where a tenant stops being "in Tenant Onboarding" and becomes a fully operational, billable customer.
- **Platform owner:** Platform Administration (approval); Tenant Workspace (the tenant experiences no functional change — it simply stops seeing Tenant Onboarding prompts).
- **Existing capabilities:** The "Convert to Customer" placeholder pattern already built for Demo Requests is the closest analog — a clearly labeled action, gated, auditable.
- **Missing capabilities:** The gate itself, and the state it flips. The precise business meaning of "ready" and "live" is defined in Section 17.
- **Required integrations:** None.

### 4.7 Customer Success
- **Business objective:** Keep a live tenant active, healthy, and growing; surface risk before it becomes churn.
- **Platform owner:** Platform Administration.
- **Existing capabilities:** The operational telemetry Customer Success reads already exists and is built — Scheduling activity, Finance/invoice health, Communication's Queue Monitor and Analytics, Platform Administration's existing Support console (org search, health panel).
- **Missing capabilities:** A place that aggregates this telemetry per tenant for Platform Administration. Full design in Section 15.
- **Required integrations:** None — this stage is entirely internal aggregation of already-built data.

### 4.8 Renewal
- **Business objective:** Confirm a tenant continues into its next commercial period.
- **Platform owner:** Platform Administration.
- **Existing capabilities:** `subscription_status`/`trial_ends_at` fields already exist and are editable through the Subscriptions pages.
- **Missing capabilities:** Real payment processing to actually charge a renewal (see Section 14, Commercial: Platform vs. Tenant, and Section 6, Platform Billing & Provisioning Boundary — a confirmed, pre-existing gap, not something this document is scoped to solve).
- **Required integrations:** A payment provider, for real billing (Section 19) — explicitly out of scope to design in detail here.

### 4.9 Expansion
- **Business objective:** Grow an existing tenant's usage — more locations, more seats, a higher tier.
- **Platform owner:** Platform Administration (tier changes) and Tenant Workspace (the tenant's own operational growth).
- **Existing capabilities:** Organizations/Subscriptions pages already support editing `subscription_tier`; `organization_locations` already supports multiple locations.
- **Missing capabilities:** Nothing structural — this stage largely reuses Provisioning's and Commercial's existing fields for a tenant that already exists.
- **Required integrations:** None beyond Renewal's billing gap.

### 4.10 Offboarding
- **Business objective:** Cleanly end a tenant relationship without destroying data that compliance or the business still needs.
- **Platform owner:** Platform Administration.
- **Existing capabilities:** `organizations.status` already supports `suspended`/`terminated`; the platform's append-only, soft-delete-by-default conventions (CLAUDE.md) already govern how records survive an org's end.
- **Missing capabilities:** A defined offboarding procedure (what gets exported, what gets retained, for how long) — genuinely undesigned today, and explicitly out of this document's detailed scope; noted for future work (Section 19).
- **Required integrations:** None identified.

---

## 5. Commercial Lifecycle

This section expands Stage 4.3 into the business process leading up to a Commercial Approved decision. It describes a sequence of business moments, not a sales system — nothing below introduces leads, opportunities, a sales pipeline, or any CRM object model. Every moment described maps onto a `demo_requests` row already in the `qualified` state, and onto `organizations` fields that already exist; none of it requires a new business capability, only a new decision recorded against existing ones.

| Stage | Business meaning | Where it lives today |
|---|---|---|
| **Plan selection** | The prospect and Platform Administration agree which subscription tier fits — the same tiers (trial, starter, professional, enterprise) already defined on `organizations.subscription_tier`. This is a conversation outcome recorded as a value, not a new object. | `organizations.subscription_tier` (exists) |
| **Trial vs. Paid subscription** | A binary business choice made at the same moment: does this tenant start in a trial period, or go straight to a paid tier? Both outcomes already exist as data states. | `organizations.subscription_status` (`trialing` or `active`), `trial_ends_at` (exists) |
| **Commercial approval** | The explicit decision, by a Platform Administrator, that this specific qualified demo request is ready to become a tenant. This is the "Commercial Approved" state in Section 16's state machine — a decision distinct from, and prior to, `demo_requests.status = 'converted'`. | Missing today — `converted` currently conflates this decision with Provisioning itself |
| **Contract acceptance** | Confirmation that the prospect has agreed to commercial terms. This document does not design a contract-management capability; it names contract acceptance as a business precondition to approval, satisfied today by whatever off-platform process (signed document, email confirmation) the business already uses — left undesigned deliberately, the same way Offboarding's data policy (Section 19) is left undesigned rather than guessed at. | Off-platform (unchanged by this document) |
| **Subscription activation** | Writing the agreed tier and trial/paid state onto the organization. This is Provisioning Architecture's step 2, Subscription Assignment (Section 7) — Commercial produces the decision; Provisioning executes it. | `organizations.subscription_tier`/`subscription_status` (exists); the *write* happens in Provisioning |
| **Billing trigger** | The point at which Platform Billing would, if it existed, start charging the tenant. Defined precisely as a boundary condition in Section 6 — not designed here. | Missing (Section 6, Section 14) |
| **Provisioning trigger** | The moment Commercial Approval, with Contract Acceptance already satisfied, causes Provisioning to start. This is the exact handoff Section 16 names as Commercial Approved → Provisioning Started. | Missing today — the bridge Section 1 names as gap #1 |

**What this section deliberately does not introduce:** a lead object distinct from `demo_requests`, an opportunity or deal-stage concept, a sales pipeline view, or any new CRM-style entity. The only new thing this business process requires is a single explicit decision point (Commercial Approval) recorded against a row that already exists.

---

## 6. Platform Billing & Provisioning Boundary

This section strengthens the relationship between three things that must never be conflated: **Platform Commercial** (the tier/trial decision, Section 5), **Platform Billing** (actually charging the tenant — confirmed missing by the audit, detailed in Section 14), and **Platform Provisioning** (Section 7). No payment provider, invoice, or billing implementation is designed here — this is lifecycle architecture only.

**When Platform Billing becomes responsible.** Platform Billing's responsibility begins at the Billing Trigger defined in Section 5 — for a trial subscription, that trigger fires at trial end (the moment a trial must convert to paid or lapse, adjacent to Renewal, Section 4.8); for a subscription that is paid from day one, it fires at Subscription Activation. Before that trigger, no money has changed hands, so Platform Billing has nothing to be responsible for yet.

**When Provisioning is allowed to begin.** Provisioning begins at Commercial Approval with Contract Acceptance satisfied (Section 5) — regardless of whether the tenant is trial or paid, and regardless of whether Platform Billing exists at all. This is a deliberate, load-bearing decision: **Provisioning must never be gated on Platform Billing.** A trial tenant is provisioned before any billing event occurs by definition. A paid tenant's provisioning should not stall on payment infrastructure the platform does not yet have — Contract Acceptance (an off-platform business fact) is sufficient. This is precisely why the confirmed, current absence of Platform Billing (Section 14) does not block the rest of this lifecycle architecture from being implemented today.

**How Trial customers differ from Paying customers.** Only in two fields, written during Subscription Activation (Section 5): `subscription_status` (`trialing` vs. `active`) and `trial_ends_at`. Provisioning (Section 7), Tenant Onboarding (Section 8), Go Live (Section 17), and Customer Success (Section 15) all run identically for both. Feature entitlement (Section 7, step 4) is keyed off `subscription_tier`, never off trial-vs-paid status — a trial tenant gets the full product experience for its tier, exactly as today's `FEATURE_GATES` already work. The only place trial-vs-paid matters architecturally is the Billing Trigger itself.

**Consequence, stated plainly.** Because Platform Billing does not exist today, every tenant provisioned under this architecture is necessarily either a trial tenant or one whose paid status is set manually — exactly what Organizations/Subscriptions already allow. This is consistent with the rest of this document, not a contradiction of it: Provisioning was never designed to wait for Platform Billing in the first place.

---

## 7. Provisioning Architecture

**Design constraint, stated plainly:** this section automates `bootstrap_org_admin.sql`. It does not invent a second provisioning model. Every step below names the existing manual step it replaces. This stage begins only once the boundary condition in Section 6 is met — Commercial Approval with Contract Acceptance satisfied.

The whole sequence should run as **one SECURITY DEFINER function**, matching the project's own established pattern for business-critical, multi-step mutations (invoice posting, journal posting, period close). A bare client-side multi-step insert — which is what `CreateOrgDialog` does today — is exactly how an organization ends up with no owner, as the audit found.

| # | Step | Reuses | Notes |
|---|---|---|---|
| 1 | **Organization creation** | `organizations` table, `CreateOrgDialog`'s insert shape | Same fields (name, legal_name, org_number, subscription_tier, trial_days) — now written server-side, inside the transaction, not as an isolated client call. |
| 2 | **Subscription assignment** | `subscription_tier`, `subscription_status`, `trial_ends_at` columns already on `organizations` | Writes the exact decision made in Section 5's Plan Selection / Trial vs. Paid steps. No new fields. |
| 3 | **Tenant creation (primary location)** | `organization_locations` insert pattern from `bootstrap_org_admin.sql` | A tenant without a location is not functional — confirmed by the audit as the exact gap in today's UI path. |
| 4 | **Feature entitlement** | `_shared/subscription.ts`'s existing `FEATURE_GATES`, keyed off `subscription_tier` | Not a new mechanism — entitlement is already computed at request time from the tier set in step 2, identically for trial and paid tenants (Section 6). |
| 5 | **Tenant Administrator creation** | Supabase Admin API user creation + `profiles` row, per `bootstrap_org_admin.sql` | The same Admin API pattern already used operationally in this project for account provisioning. |
| 6 | **Membership** | `memberships` + `membership_roles` (`org_owner`) insert pattern from `bootstrap_org_admin.sql` | Establishes the JWT-visible link between the new admin user and the new organization. |
| 7 | **Invitation** | `event_outbox` / `insert_outbox_event()` — the same mechanism already used for `demo_request.created` | Enqueues a `tenant.provisioned` event. Still requires an `event-worker` handler and a real email provider — the same infrastructure gap already flagged for Demo Request notifications (Section 19), not a second gap. |
| 8 | **Audit** | `audit_logs` / `audit_trigger_fn()` | Unlike `demo_requests`, a provisioned organization *has* an `organization_id` from step 1 onward, so the platform's standard audit trail genuinely applies here — no new audit mechanism needed. |
| 9 | **Failure recovery** | The SECURITY DEFINER + advisory-lock pattern already used by Scheduling's generation functions; run-log observability modeled on `scheduling_generation_runs` | If steps 1–8 run as one transaction, a failure at step 5 (say, the Admin API call) rolls back steps 1–4 automatically. A `provisioning_runs` table, mirroring `scheduling_generation_runs`, gives Platform Administration visibility into failed attempts without inventing a new observability pattern. |

**What this deliberately does not include:** any new database concept beyond a `provisioning_runs` log. Every other piece of state already exists on `organizations`, `organization_locations`, `profiles`, `memberships`, and `membership_roles`.

---

## 8. Tenant Onboarding Architecture

Tenant Onboarding is a **pure orchestration layer**: it owns no business data of its own, and — after the second refinement (see revision note above) — it persists no progress state of any kind. Every capability below is read live from the module that already owns it. The only state this entire capability writes anywhere is the Go Live event (Section 17).

Its ten steps split into two categories, distinguished by whether they block Go Live:

- **Go Live Readiness Requirements** — capabilities every operating driving school genuinely needs. All six are fully derived; none require a human decision beyond the ordinary act of using the module (creating a location, adding a vehicle) that already produces the row Tenant Onboarding reads.
- **Recommended Configuration** — capabilities that are genuinely optional for some schools (a single-owner-operator school may never need to invite staff or migrate legacy data). Surfaced with the same live-derived status as any other step, but never gate Verification or Go Live. Because nothing here can ever require a value beyond what the underlying module already records, there is no "skip" action to build or store.

### 8.1 Go Live Readiness Requirements

| Step | Existing module | Purpose | Trigger | Completion criteria (fully derived) |
|---|---|---|---|---|
| **Organization Profile** | Settings (`SettingsHubPage`, Company card) | Confirm/complete legal, contact, and branding details captured at provisioning | First login by the Tenant Administrator | Required organization fields (legal name, org number) are non-null — read from `organizations` directly |
| **Branch Offices / Locations** | Resources / Locations (`organization_locations`) | Get the school's real location(s) into the system | After Organization Profile step | ≥1 active location exists. Provisioning deliberately never creates one (Section 7), so any row here is already a deliberate tenant action — no separate confirmation adds information |
| **Booking Configuration** | Scheduling (slot templates, lesson types) | Define standard lesson slots/types before the school can take real bookings | Independent of Staff Invitations (no longer a precondition — see 8.2) | ≥1 slot template or lesson type configured |
| **Vehicles & Instructors Setup** | Resources (vehicles) + Instructors modules | Register the fleet and teaching staff | Parallel with Booking Configuration | ≥1 vehicle and ≥1 instructor registered |
| **Finance Configuration** | Finance (chart of accounts, VAT period setup) | Get invoicing and VAT ready before real financial activity | After core operational steps | Chart of accounts has ≥1 entry and a current-dated VAT period exists |
| **Communication Configuration** | Communication (Channel Settings) | Get at least one notification channel ready before going live | After Finance Configuration | ≥1 channel enabled in `channel_configs` — replaces the earlier, undeliverable "reviewed at least once" criterion, which had no existing column to read |

### 8.2 Recommended Configuration (optional — never gates Go Live)

| Step | Existing module | Purpose | Completion signal (fully derived) |
|---|---|---|---|
| **Staff Invitations** | Membership/invite mechanism (extended from Provisioning step 7) + Instructors module | Get the school's real staff (and instructors specifically) into the system, where the school has more than one operator | ≥1 additional staff member beyond the Tenant Administrator, read from `memberships` |
| **Data Migration** | `modules/data-migration`, unmodified | Import the tenant's existing operational and business configuration data (e.g. fleet, staff, prior financial records) from its previous system — not individual student enrollment, which is Student Onboarding's responsibility (Section 3) and happens later, inside an already-operating school | ≥1 completed migration session, read from the module's own session status |

Both rows are shown in the same checklist UI as the Go Live Readiness Requirements, with the same live-derived status — the only difference is that neither ever contributes to the Ready for Go Live condition (Section 17).

### 8.3 Verification and Go Live

| Step | Existing module | Purpose | Trigger | Completion criteria | Progress tracking |
|---|---|---|---|---|---|
| **Verification** | *New — orchestration-owned* | Confirm every Go Live Readiness Requirement (8.1) is genuinely complete | All six requirements report complete | All six Section 8.1 criteria simultaneously true — this is the "Ready for Go Live" condition defined formally in Section 17 | This is the one step with no existing-module equivalent — it is the orchestration layer checking its own sequence. It reads 8.1's live state on every check; it stores nothing |
| **Go Live** | Platform Administration (approval action) | Flip the tenant from "Tenant Onboarding" to fully operational | Verification step complete | A recorded approval, mirroring the "Convert to Customer" pattern already built for Demo Requests — the "Live Customer" condition defined formally in Section 17 | Section 10. The only persisted state in this entire capability: `organizations.go_live_at` / `go_live_approved_by`, written once |

### What stays outside Tenant Onboarding, and why

- **Courses.** The audit confirmed no course-catalog module exists yet. It cannot be an Tenant Onboarding step until it exists as a first-class capability — pulling it into this scope would be exactly the kind of scope creep this document's principles forbid.
- **Ongoing day-2 CRUD** (routine vehicle/instructor/student management after the first item). Tenant Onboarding orchestrates only the *first* pass through a module; the module remains the permanent home for that data forever after, unchanged.
- **Campaigns, Discounts, Corporate Customers.** These are commercial-growth capabilities. A brand-new tenant with zero students has no use for a marketing campaign before Go Live.
- **Reporting.** Reports only become meaningful once real operational data exists. There is nothing to "onboard" in an empty reporting module.
- **Student Onboarding (`enrollment_requests` pipeline).** Reaffirmed a third time in this document, deliberately: this is a separate, independent, already-mature process. It begins only after Go Live, when the school has real students to enroll.

---

## 9. Business Capability Mapping

| Tenant Onboarding step | Category | Existing module | Current status | Reuse existing | Extension required | New capability required |
|---|---|---|---|---|---|---|
| Organization Profile | Go Live Requirement | Settings | Built | Yes — as-is | None (read-only) | No |
| Branch Offices | Go Live Requirement | Resources / Locations | Built | Yes — as-is | None (read-only) | No |
| Booking Configuration | Go Live Requirement | Scheduling | Built | Yes — as-is | None (read-only) | No |
| Vehicles & Instructors Setup | Go Live Requirement | Resources + Instructors | Built | Yes — as-is | None (read-only) | No |
| Finance Configuration | Go Live Requirement | Finance | Built | Yes — as-is | None (read-only) | No |
| Communication Configuration | Go Live Requirement | Communication | Built | Yes — as-is | None (read-only) | No |
| Staff Invitations | Recommended Configuration | Memberships + Instructors | Built | Yes — as-is | None (read-only) | No |
| Data Migration | Recommended Configuration | `modules/data-migration` | Built | Yes — as-is | None (read-only) | No |
| Verification | System | — | Missing | No | No | Yes — orchestration-owned check, computed live, stores nothing |
| Go Live | System | Platform Administration | Pattern exists (Demo Request "Convert" placeholder) | Partially — reuse the UI/approval pattern | Yes — a real gate, not a placeholder | No new module, but new logic; the one persisted write in the whole capability |

The table's own shape is the point: **every one of the eight business-capability steps is a pure, read-only derivation from an existing module — zero extension, zero new state.** The only genuinely new engineering in the entire capability is the Verification check (computed, never stored) and the Go Live gate (the capability's sole persisted artifact).

---

## 10. Platform Administration Responsibilities

Reusing existing modules throughout — no redesign of Platform Administration itself.

- **Customer Acquisition** — the Demo Request console, already built (Section 4.2). Unchanged.
- **Commercial** — Organizations and Subscriptions pages, extended to record an explicit commercial-approval decision distinct from `demo_requests.status = 'converted'` (Section 4.3, Section 5, Section 16).
- **Provisioning** — the "Create Organization" entry point, extended to call the atomic provisioning function in Section 7 instead of a bare insert, once the Section 6 boundary condition is met. Platform Administration remains the trigger; the function itself is shared infrastructure.
- **Tenant Onboarding Monitoring** — new, but reuses the exact visual and data pattern already proven by the Demo Requests and Organizations list pages (search, filter, sort, status badges). Shows each tenant's progress through Section 8's steps.
- **Go Live Approval** — new, but reuses the "Convert to Customer" placeholder pattern already built for Demo Requests (clearly labeled action, confirmation dialog, auditable outcome). See Section 17 for the precise conditions this approval certifies.

Nothing here changes what Platform Administration already does for an operating tenant — suspend/reactivate, trial management, audit, security, support all continue exactly as built. Section 11 shows how these responsibilities map onto a single organization's state over its whole life; Section 13 shows how responsibility for a tenant physically hands from this section to Section 12 (Tenant Workspace) at Go Live.

---

## 11. Platform Customer Lifecycle

A high-level view of one organization's state, from Platform Administration's own record-keeping perspective. This is not a sixth business process (Section 3) — it is the same five processes, seen as a single state an organization occupies at any given moment, reusing the exact fields the audit confirmed already exist on `organizations`. It does not redesign Platform Administration; every state below already has a home in Organizations/Subscriptions pages and their existing mutations (`useSuspendOrg`, `useReactivateOrg`, and the tier/status fields already editable there).

| State | Business purpose | Entry criteria | Exit criteria | Platform ownership |
|---|---|---|---|---|
| **Prospective Customer** | A lead is being worked, with no organization yet | A Demo Request exists (Section 4.2) | Commercial Approval is recorded (Section 5) | Platform Administration, via the Demo Request console |
| **Commercial** | A deal is being agreed | Demo Request reaches `qualified` | Commercial Approval + Contract Acceptance (Section 5) | Platform Administration |
| **Trial** | The organization exists and is using the product under a trial | Provisioning completes with `subscription_status = 'trialing'` | Trial ends — converts to Active or lapses toward Cancelled (Section 6) | Platform Administration, via Organizations/Subscriptions (already built) |
| **Active** | The organization is a paying customer in good standing | Trial converts, or the org was provisioned paid-from-day-one | Suspension, cancellation, or offboarding begins | Platform Administration, via Organizations/Subscriptions (already built) |
| **Suspended** | Access is paused without ending the relationship (e.g. a payment or compliance issue) | A Platform Administrator suspends the org — reuses the existing `useSuspendOrg` mutation and `organizations.status = 'suspended'` value, already built | Reactivation (`useReactivateOrg`, back to Active) or progression to Cancelled | Platform Administration |
| **Cancelled** | The paying relationship has ended | `subscription_status = 'cancelled'` — an existing, already-built value | Reactivation (treated as a new Commercial cycle) or progression to Archived | Platform Administration |
| **Archived** | The relationship is over and the record is retained, not actively managed | Progression from Cancelled or Suspended with no reactivation | Offboarding completes | Platform Administration. Note: this maps onto the existing `organizations.status = 'terminated'` value plus the platform's already-established soft-delete convention on `organizations` — no new status value is required. |
| **Offboarded** | The final state; data retained per policy | Offboarding procedure (Section 4.10) completes | None — terminal state | Platform Administration. The retention policy itself remains undesigned (Section 19), consistent with this document's own scope discipline. |

---

## 12. Tenant Workspace Responsibilities

Tenant Workspace performs every actual Tenant Onboarding step through the same modules a school uses for the rest of its life:

- Settings owns Organization Profile, permanently.
- Resources owns Locations and Vehicles, permanently.
- Instructors owns instructor records, permanently.
- Data Migration owns import, whether it runs on day one or day two hundred.
- Scheduling owns booking configuration, permanently.
- Finance owns chart-of-accounts and VAT configuration, permanently.
- Communication owns channel and template configuration, permanently.

The orchestration layer's relationship to each of these is strictly observational and sequencing — it reads their state to know what's complete, and it decides *when* to surface each step to the tenant admin. It never becomes a second place these settings live. After Go Live, a tenant administrator's experience of these modules is completely unchanged from before Tenant Onboarding existed.

---

## 13. Responsibility Handover

One diagram, showing ownership transitions across the full lifecycle — not a new process, a picture of who holds the ball at each point already defined in Sections 4, 10, and 12.

```
Public Website                 Owner: Public Website
    │
    ▼
Customer Acquisition           Owner: Public Website (capture) → Platform Administration (working the lead)
    │
    ▼
Platform Administration        Owner: Platform Administration
    │
    ▼
Commercial                     Owner: Platform Administration            (Section 5)
    │
    ▼
Provisioning                   Owner: Shared Infrastructure,             (Section 6, Section 7)
    │                                 triggered and monitored by
    │                                 Platform Administration
    ▼
Go Live Approval                Owner: Platform Administration           (Section 17)
    │
    ▼
Tenant Workspace                Owner: Tenant Workspace
    │
    ▼
Tenant Onboarding                Owner: Tenant Workspace performs;        (Section 8)
    │                                   Platform Administration monitors
    ▼
Operational Driving School      Owner: Tenant Workspace
    │
    ▼
Student Onboarding               Owner: Tenant Workspace — a separate,    (Section 3, Section 8)
                                        independent process
```

Two handovers matter more than the rest, and are worth stating explicitly:

1. **Platform Administration → Shared Infrastructure → Platform Administration, around Provisioning.** Platform Administration triggers Provisioning and resumes direct oversight at Go Live Approval, but does not itself perform the provisioning steps — those run as shared, transactional infrastructure (Section 7), not as manual Platform Administration action.
2. **Platform Administration → Tenant Workspace, at Go Live.** This handover is permanent and one-directional. Once a tenant is live, Tenant Workspace owns its daily operation completely; Platform Administration's role becomes Customer Success monitoring (Section 15) from the outside, never day-to-day operation from within.

---

## 14. Commercial: Platform vs. Tenant

The audit found real capability in two of these four quadrants and confirmed the other two are genuinely missing. This document does not merge them, and none of the below should ever be merged in implementation. (Section 5 details the business process that produces the Platform Commercial decision; Section 6 defines exactly when Platform Billing's responsibility begins.)

| | **Commercial** (pricing/deal terms) | **Billing** (actually charging money) |
|---|---|---|
| **Platform** (TrafikskolaOS ↔ the driving school) | **Partial.** Organizations/Subscriptions pages record tier and trial terms, but there is no negotiated-deal-terms concept beyond those fields. Owner: Platform Administration. | **Missing.** `PlatformSubscriptionsPage` is a read-only dashboard over a manually-set database field, with a hardcoded plan catalog in the frontend. No payment processing exists. `_shared/subscription.ts` explicitly states billing integration is not part of that module. Owner: Platform Administration. |
| **Tenant** (the driving school ↔ its own students) | **Built.** Packages, orders, campaigns, discounts, gift cards — a mature commercial suite. Owner: Tenant Workspace. | **Built.** Real, signature-verified Stripe integration via `stripe-webhook` and `payment_requests`, settling student payments to the tenant. Owner: Tenant Workspace. |

**The explicit non-merge rule:** if Platform Billing is ever built, it reuses the *pattern* already proven by Tenant Billing's Stripe integration — signature verification, webhook handling, settlement RPC — but never its tables, its Stripe account/keys, or its code path. Two different parties are paying two different parties; conflating them would put a driving school's payment infrastructure in the same trust boundary as the platform's own revenue collection.

---

## 15. Customer Success

An operational lifecycle definition only — no features are designed here.

- **Objectives.** Keep a live tenant active and healthy; catch risk of disengagement or churn before it becomes a support escalation or a lost renewal.
- **Success measurements.** Time from Go Live to first real booking; percentage of Tenant Onboarding steps completed without Platform Administration intervention; time-to-Go-Live itself, as a measure of onboarding friction.
- **Health indicators.** Reused, not reinvented — booking activity from Scheduling, invoice and payment health from Finance, message delivery health from Communication's already-built Queue Monitor and Analytics routes.
- **Adoption indicators.** Which built modules a tenant is actually using (is Data Migration — for the tenant's own operational data, not student import — ever touched again after Tenant Onboarding ends, is Communication configured beyond the defaults) — derived from the same Tenant Onboarding Monitoring data model (Section 10), extended forward past Go Live rather than replaced by something new.
- **Operational ownership.** Platform Administration, specifically an extension of the Support console's existing org-search-and-health-panel pattern (already partially built per the audit) rather than a new console.

---

## 16. Lifecycle State Machine

The canonical state machine for one customer's journey. Several early states map directly onto the `demo_requests.status` enum already shipped — this is deliberate reuse, not a coincidence.

| State | Owner | Entry criteria | Exit criteria | Automation opportunity |
|---|---|---|---|---|
| **Visitor** | Public Website | Any site visit | Submits a Demo Request | None needed |
| **Demo Requested** | Platform Administration | Demo Request form submitted (`demo_requests.status = 'new'`) | A platform admin makes contact | Already automated — form → table insert |
| **Qualified** | Platform Administration | `demo_requests.status = 'qualified'` | A commercial decision is made | Reuses the existing status workflow directly |
| **Commercial Approved** | Platform Administration | Explicit approval recorded (Section 5 — new, distinct from `converted`) | Provisioning is triggered, per Section 6's boundary | Could auto-trigger Provisioning on approval |
| **Provisioning Started** | Shared infrastructure | Commercial Approved | The Section 7 function completes or fails | Fully automatable once built |
| **Provisioned** | Shared infrastructure | Section 7's function succeeds | Invitation is sent | Automatic on success |
| **Invitation Sent** | Shared infrastructure | `event_outbox` event enqueued and processed | Tenant Administrator opens the invite | Automatic once an email provider exists |
| **First Login** | Tenant Workspace | Tenant Administrator authenticates for the first time | Tenant Onboarding begins | Already automatic (standard login flow) |
| **Tenant Onboarding** | Tenant Workspace (does the work) / Platform Administration (monitors) | First Login | All Section 8 steps report complete | Progress is automatic; individual steps remain human-driven by design |
| **Ready for Go Live** | Platform Administration | Verification step passes (Section 17 defines the precise condition) | Go Live approval is recorded | Could auto-flag; approval stays a human action |
| **Live Customer** | Tenant Workspace | Go Live approved (Section 17 defines the precise condition) | Enters Customer Success monitoring | Automatic on approval |
| **Customer Success** | Platform Administration | Live Customer | Renewal date approaches, or a churn risk is flagged | Health indicators (Section 15) can be computed automatically; action remains human |
| **Renewal** | Platform Administration | Subscription period ending | Renewed or not | Blocked on Platform Billing (Section 14, Section 6) — cannot be automated until real payment processing exists |
| **Expansion** | Platform Administration + Tenant Workspace | Tenant requests more tier/capacity | Change applied | Reuses existing tier-edit capability directly |
| **Offboarding** | Platform Administration | Tenant relationship ends | Data retained/exported per policy | Explicitly undesigned — see Section 19 |

This state machine and the Platform Customer Lifecycle (Section 11) describe the same journey at two different resolutions: this table tracks the fine-grained sequence of a single provisioning-and-Tenant-Onboarding pass; Section 11 tracks the coarser state an organization occupies across its entire multi-year relationship with the platform (a tenant that is "Live Customer" here is "Active" there, and stays there through many Renewal/Expansion cycles).

---

## 17. Go Live Definition

The architectural meaning of the two states this document uses most loosely elsewhere — made precise here, once, so every other section can refer back to it rather than redefine it. No validation logic is specified; these are business conditions, not code.

**Ready for Go Live.** A tenant is Ready for Go Live when the Verification step (Section 8.3) confirms that every **Go Live Readiness Requirement** (Section 8.1) — and only those — is simultaneously true:

- Organization Profile — required fields non-null.
- Locations — at least one active location exists.
- Booking Configuration — at least one slot template or lesson type.
- Vehicles & Instructors — at least one of each registered.
- Finance Configuration — chart of accounts has at least one entry and a current VAT period exists.
- Communication Configuration — at least one channel enabled.

This is not a new checklist — it is the same six completion criteria Section 8.1 already defines, restated here as a single aggregate condition because "Ready for Go Live" is the name this document (and the state machine in Section 16) gives to that aggregate.

**Recommended Configuration is deliberately excluded from this condition.** Staff Invitations and Data Migration (Section 8.2) are optional business capabilities, not gated workflow steps — a single-owner-operator school may never need either. Both are still shown, with the same live-derived status, in the same checklist a tenant administrator sees; neither can ever block Verification or Go Live. This was a deliberate correction: an earlier implementation pass required an explicit "skipped" decision for both, which in turn required a small persisted table purely to record that decision. A subsequent architecture review determined the decision itself was unnecessary — since neither capability is actually mandatory, there is nothing to skip past, and the underlying module's own data (a membership count, a migration session count) is a complete and sufficient signal on its own. Tenant Onboarding accordingly persists nothing beyond the Go Live event below.

**Live Customer.** A tenant becomes a Live Customer at the moment a Platform Administrator performs the Go Live Approval action (Section 10, reusing the Demo Request "Convert to Customer" UI pattern). The minimum business condition is two-fold: Ready for Go Live has been reached, **and** an explicit, audited approval has been recorded. Reaching Ready for Go Live does not, by itself, make a tenant live — this is a deliberate human checkpoint, consistent with Section 16 noting that this approval "stays a human action" even where the check itself could be automated.

**What Live Customer explicitly does not require.** No Student Onboarding activity of any kind. A school can reach Live Customer with zero students enrolled — Student Onboarding is an independent process (Section 3, Section 8, Section 12) that begins whenever the school chooses, at its own pace, after Go Live, never as a precondition to it.

---

## 18. Reuse Matrix

Every recommendation in this document, stated once more with no ambiguity about what is reused, what is extended, and what is genuinely new.

| Recommendation | Existing capability reused | Extended? | New capability required |
|---|---|---|---|
| Commercial Lifecycle stages (plan selection, trial/paid, activation) | `demo_requests.status`, `organizations.subscription_tier`/`subscription_status`/`trial_ends_at` | No | No |
| Commercial Approval decision point | `demo_requests` `qualified` status as the precondition | Yes — one new decision recorded, distinct from `converted` | No — a value, not a new object |
| Billing Trigger boundary | Section 7's Subscription Assignment step; Section 14's confirmed Platform Billing gap | No | No — a boundary is defined, no new mechanism |
| Organization creation | `organizations` table, `CreateOrgDialog` insert shape | Yes — moved server-side, transactional | No |
| Subscription assignment | `subscription_tier`/`subscription_status`/`trial_ends_at` columns | No | No |
| Tenant location creation | `organization_locations`, `bootstrap_org_admin.sql` pattern | No | No |
| Feature entitlement | `_shared/subscription.ts` `FEATURE_GATES` | No | No |
| Tenant Administrator creation | Supabase Admin API pattern, `profiles` | No | No |
| Membership assignment | `memberships` + `membership_roles`, `bootstrap_org_admin.sql` pattern | No | No |
| Invitation delivery | `event_outbox` / `insert_outbox_event()` | Yes — new event type, needs a handler | Yes — the handler + email provider (shared with Demo Request notification gap) |
| Provisioning audit trail | `audit_logs` / `audit_trigger_fn()` | No | No |
| Provisioning failure recovery | SECURITY DEFINER pattern, `scheduling_generation_runs`-style run log | Yes — new `provisioning_runs` table, same shape as existing precedent | No — modeled directly on an existing pattern |
| Organization Profile (Go Live Requirement) | Settings module | No | No |
| Locations (Go Live Requirement) | Resources / Locations | No | No |
| Staff Invitations (Recommended Configuration) | Membership/invite mechanism, Instructors | Yes — invite mechanism generalized for reuse | No |
| Data Migration (Recommended Configuration) | `modules/data-migration` | No | No |
| Booking Configuration (Go Live Requirement) | Scheduling | No | No |
| Vehicles & Instructors (Go Live Requirement) | Resources, Instructors | No | No |
| Finance Configuration (Go Live Requirement) | Finance | No | No |
| Communication Configuration (Go Live Requirement) | Communication | No | No |
| Verification step | — | — | Yes — orchestration-owned, no existing equivalent, computed live and never stored |
| Go Live gate | Demo Request "Convert to Customer" UI pattern | Yes — from placeholder to a real, functioning gate | No — pattern reused, logic is new |
| Tenant Onboarding Monitoring (Platform Admin) | Demo Requests / Organizations list UI pattern | Yes — same table/filter/status pattern, new data source | No |
| Platform Customer Lifecycle states | `organizations.status`, `organizations.subscription_status`, existing `useSuspendOrg`/`useReactivateOrg` mutations | No | No — "Archived" reuses `terminated` + existing soft-delete convention, not a new value |
| Responsibility Handover diagram | Ownership boundaries already stated in Sections 10 and 12 | Documentation only | No |
| Go Live minimum conditions | Aggregates Section 8's existing, per-step completion criteria | No | No — the same Verification step already scoped in Section 9 |
| Customer Success health indicators | Scheduling activity, Finance health, Communication Analytics | No — pure aggregation of existing data | Yes — the aggregation view itself is new, the data it reads is not |
| Platform Billing (future) | Tenant Billing's Stripe pattern (signature verification, webhook, settlement) | Yes — pattern reused, implementation kept fully separate | Yes — separate tables, separate credentials, never shared with Tenant Billing |

---

## 19. Future Integration Points

Named here, not designed here — each is either explicitly out of this document's scope or blocked on a shared piece of missing infrastructure.

- **Email/notification provider.** Blocks two things at once with one fix: Demo Request submission notifications (already flagged in the Business Capability Audit) and the Tenant Administrator invitation in Provisioning step 7. One piece of infrastructure, two consumers — build it once.
- **Payment provider for Platform Billing.** Required before Renewal (Section 16) or any real Platform Billing (Section 14) can be automated. Must remain architecturally separate from Tenant Billing's existing Stripe integration, per Section 14's non-merge rule.
- **CAPTCHA / stronger spam protection.** Carried over from the Demo Request implementation as a still-open recommendation; relevant again if Provisioning is ever triggered by anything less trusted than a Platform Administrator's own approval.
- **A first-class Courses module.** An independent, pre-existing gap the audit identified. Not part of Tenant Onboarding until it exists on its own terms.
- **Corporate Customer Portal.** Already named as a future gap in the Master Architecture Overview (Section 15 of that document); unrelated to this lifecycle except that Corporate customers would eventually pass through the same Provisioning and Tenant Onboarding architecture defined here.
- **Offboarding data policy.** What is exported, what is retained, and for how long, when a tenant relationship ends. Explicitly undesigned; flagged rather than guessed at.
- **Renaming `onboarding-page`.** A documentation/naming cleanup, not an architecture change — resolving the collision named in Section 3 before any real Tenant Onboarding UI is built under a confusingly similar name.

---

## 20. Consistency Review

A direct check of this refinement against the three documents it must not contradict.

- **No duplicated architecture.** Every new section (5, 6, 11, 13, 17) reuses fields and enums already named either in the original version of this document or in the Business Capability Audit (`subscription_tier`, `subscription_status`, `trial_ends_at`, `organizations.status`, `demo_requests.status`). No new parallel state model was introduced.
- **No contradictory terminology.** The five-process vocabulary (Customer Acquisition, Commercial, Platform Provisioning, Tenant Onboarding, Student Onboarding) is used identically throughout the refinement. The new Platform Customer Lifecycle (Section 11) is explicitly scoped, in Section 3, as a state view layered on these five processes — not a sixth process competing with them.
- **No overlap with Student Onboarding.** Reaffirmed in Sections 5, 8, 12, 13, and 17 — five separate places in this document now state explicitly that Student Onboarding is independent and untouched.
- **No overlap with existing Tenant Workspace modules.** Sections 5, 6, 7, and 11 name only fields and states that already exist on `organizations` and `demo_requests`; no new Tenant Workspace module content was introduced anywhere in this refinement.
- **No overlap with Platform Administration responsibilities.** Sections 6 and 11 extend Section 10's and Section 14's existing content rather than defining a competing ownership model; Section 13's diagram illustrates existing boundaries, it does not move any.
- **Consistent with the Master Architecture Overview.** The Platform Customer Lifecycle (Section 11) and Responsibility Handover diagram (Section 13) both stay inside the Three-System Model that document already defines — nothing in this refinement proposes a fourth system, and the ASCII-diagram style in Section 13 deliberately matches the Business Flow Overview's own convention.
- **Consistent with the Enterprise Architecture Handbook.** No new SECURITY DEFINER pattern, RLS pattern, or backend mechanism was introduced beyond what Section 7 (Provisioning Architecture) already specified before this refinement — Sections 5, 6, 11, 13, and 17 are business-lifecycle clarifications, not new backend architecture.
- **Consistent with the Business Capability Audit.** Every "existing" claim in the new sections — `subscription_tier`, `subscription_status`, `organizations.status`, the `useSuspendOrg`/`useReactivateOrg` mutations, `trial_ends_at` — traces to the audit's Platform Administration findings, not to assumption.

---

## 21. Closing Statement

Every gap this document closes was found, not assumed — each traces to a specific, cited finding in the Business Capability Audit. The lifecycle defined here adds one orchestration layer and a small number of genuinely new pieces (a provisioning function, a run log, a progress tracker, a verification check, a real Go Live gate) around a platform that, on the evidence, already does almost everything else it needs to do. This refinement pass adds business-process clarity — the Commercial Lifecycle, the Platform Billing boundary, the Platform Customer Lifecycle, the Responsibility Handover, and the Go Live Definition — without adding a single new business capability beyond what was already scoped. Implementation, when it begins, should be measured against this document's Reuse Matrix (Section 18) — a plan that reuses less than what is listed there needs to explain why.

---

## 22. Scope

This document defines **only**:

1. **Platform Provisioning** — the automated creation of the SaaS environment for a commercially approved customer (Section 7).
2. **Tenant Onboarding** — the orchestration layer that helps a newly provisioned driving school configure TrafikskolaOS for the first time (Section 8).
3. **The transition itself** — the handoff from a commercially approved customer to an operational, live tenant, including the Provisioning-to-Onboarding boundary (Section 6), the Business Capability Mapping showing how Tenant Onboarding orchestrates existing modules (Section 9), and the precise meaning of Go Live (Section 17).

This document **begins immediately after Commercial Approval** — the decision point defined in Section 5, and named as a distinct state in Section 16's Lifecycle State Machine — and **ends when the tenant reaches Go Live / Live Customer**, as defined in Section 17. Everything before Commercial Approval and everything after Go Live is described elsewhere in this document only to the extent needed for continuity (Section 4's full Customer Lifecycle, Section 11's Platform Customer Lifecycle, Section 13's Responsibility Handover) — it is not this document's design authority for those stages. Section 23 states this exclusion explicitly, capability by capability.

---

## 23. Out of Scope

Every capability listed below already exists, is already operational, or is already governed by another architecture document. None of them is redesigned, extended, or modified by this document. Where this document's body mentions one of these capabilities, it is solely to name it as a reuse target (per Section 25, Single Source of Truth) — never to specify or change how it works.

**Before this document's scope begins (Commercial Approval):**
- **Public Website** — governed by the Master Architecture Overview and the Landing Page Strategy documents; not part of this document.
- **Customer Acquisition** — the Demo Request pipeline (Section 4.2); already built, already operational, described here only as context for what precedes Commercial Approval.
- **Demo Requests** — the `demo_requests` table, Edge Function, and Platform Administration console; already built; referenced here only as the source of a `qualified` lead, never redesigned.
- **CRM, Sales Pipeline, Leads, Opportunities, Marketing Automation** — none of these exist in TrafikskolaOS today, and none are introduced by this document. Section 5 (Commercial Lifecycle) was written explicitly to describe a business process without any of these concepts; this section reaffirms that exclusion at the document level.

**Architecture owned by other documents:**
- **Platform Administration architecture** — governed by the Business Capability Audit and the Enterprise Architecture Handbook. This document only describes how Platform Administration *participates* in the lifecycle (Sections 10, 11); it does not redesign Platform Administration itself.
- **Tenant Workspace architecture** — governed by the Enterprise Architecture Handbook and the modules' own implementations. This document only describes how Tenant Workspace modules *participate* in Tenant Onboarding (Section 8, Section 12); it does not redesign any of them.

**After this document's scope ends (Go Live), entirely owned by the Tenant Workspace:**
- **Student Onboarding, Student Registration, Student Enrollment, Student Import** — an existing, independent, already-mature operational workflow (`public-enrollment` → `enrollment_requests` → checklist). Never a Tenant Onboarding step (Section 3, Section 8). Begins only after Go Live.
- **Instructor daily operations, Vehicle daily operations** — the Instructors and Resources modules' ongoing, day-2 use. Tenant Onboarding touches these modules only once, for first setup (Section 8's "Vehicles & Instructors Setup" step); everything after that first pass is out of scope here.
- **Scheduling, Lesson Management** — the Scheduling module's day-to-day operation. Tenant Onboarding touches it only for initial Booking Configuration (Section 8); ongoing scheduling is not part of this document.
- **Finance module, Tenant Billing** — the Finance module's full operation (invoicing, ledger, VAT, payroll) and the driving school's own billing of its students. Tenant Onboarding touches Finance only for initial configuration (Section 8); Tenant Billing itself is fully out of scope, and is kept explicitly distinct from Platform Billing in Section 14.
- **Reporting** — the Reports module's day-to-day use once real operational data exists (Section 8 already excludes it from onboarding for this reason).
- **Customer Support** — Platform Administration's Support console and its own, separate operational scope; unrelated to this document beyond the Customer Success telemetry it may eventually consume (Section 15).
- **Platform Monitoring, Security** — Platform Administration's Audit and Security capabilities; unrelated to this document's provisioning-and-onboarding scope.

---

## 24. Architectural Boundary

```
Customer Acquisition
        │
        ▼
Commercial                          (Section 5)
        │
        ▼
═══════════════════════════════════════════════
              THIS DOCUMENT STARTS HERE
═══════════════════════════════════════════════
        │
        ▼
Platform Provisioning               (Section 7)
        │
        ▼
Tenant Onboarding                   (Section 8)
        │
        ▼
Go Live                             (Section 17)
        │
        ▼
═══════════════════════════════════════════════
               THIS DOCUMENT ENDS HERE
═══════════════════════════════════════════════
        │
        ▼
Operational Tenant
        │
        ▼
Student Onboarding
        │
        ▼
Daily Operations
```

Everything above the first line and below the second line is real, already described elsewhere (the Business Capability Audit, the Master Architecture Overview, or the modules' own implementations), and is named in this document only where continuity requires it (Section 4, Section 11, Section 13, Section 23). This document's design authority — the sections that actually specify how something should work — applies only to what falls between the two lines.

---

## 25. Single Source of Truth

**Tenant Onboarding is an orchestration layer.** It coordinates existing capabilities during a tenant's initial setup; it does not own, replace, or duplicate any of them. This has been true throughout this document (Section 2's Architecture Principles, Section 8's step-by-step reuse table, Section 9's Business Capability Mapping); this section restates it once, plainly, as a standing governance rule for anyone extending this architecture later.

Existing modules remain the single source of truth for their own domain, permanently — not just during onboarding:

- **Data Migration owns imports.** `modules/data-migration` is the only place bulk data enters a tenant, whether during Tenant Onboarding's first pass or years later.
- **Finance owns finance.** Chart of accounts, VAT, invoicing, payroll — all of it, always, including the fields Tenant Onboarding's Finance Configuration step merely confirms.
- **Communication owns messaging.** Channels, templates, delivery — all of it, always, including the settings Tenant Onboarding's Communication Configuration step merely confirms.
- **Scheduling owns scheduling.** Slot templates, lesson types, bookings — all of it, always, including the configuration Tenant Onboarding's Booking Configuration step merely confirms.
- **Student Onboarding owns student enrollment.** Registration, enrollment, import, qualification, documents — all of it, always. Tenant Onboarding never performs, triggers, or substitutes for any part of this process (Section 3, Section 23).

**Tenant Onboarding only coordinates these capabilities during initial tenant setup.** It persists nothing of its own beyond the Go Live event (Section 17) — every step's status, including whether a Recommended Configuration item (Section 8.2) has been acted on, is computed live from the module that already owns that data, on every read, never cached or duplicated. Once a tenant reaches Go Live, Tenant Onboarding has nothing further to coordinate; the tenant simply uses these modules the same way every other operating tenant does.

---

## 26. Future Architecture Rule

Any future enhancement to Tenant Onboarding — anything added after this document is frozen — must satisfy all of the following before it can be considered consistent with this architecture:

1. **Reuse existing capabilities first.** A new onboarding step must name the existing module it orchestrates, exactly as every step in Section 8 does. If no existing module can be named, the proposal is not an onboarding enhancement — it is a new capability, and belongs in its own architecture document, not appended here.
2. **Never duplicate existing functionality.** No enhancement may create a second place where data already owned by an existing module (Section 25) is stored, edited, or decided.
3. **Never absorb operational modules.** Tenant Onboarding may sequence and gate a module's first use; it may never become that module's replacement, alternate interface, or permanent home.
4. **Never replace Student Onboarding.** Reaffirmed a final time: Student Onboarding is independent, belongs entirely to the Tenant Workspace, and begins only after Go Live. No future enhancement may fold any part of it into Tenant Onboarding.
5. **Never replace Tenant Workspace modules.** Settings, Resources, Instructors, Scheduling, Finance, Communication, and Data Migration remain exactly what they are today — this architecture orchestrates them, permanently, and never grows into a competing implementation of any of them.
5a. **Never persist progress state without an Architecture Review.** A step's completion must be derivable from an existing module's own data (Section 8.1, 8.2) before it can be added. If a proposed step genuinely cannot be derived, that is itself a signal the step may not belong in this architecture as currently scoped — reclassifying it as Recommended Configuration (non-gating) should be considered before introducing new persisted state, per the reasoning in Section 17. Any new persisted state beyond the Go Live event requires the same Architecture Review this section already requires for new capabilities.
6. **Platform Administration remains responsible for platform operations.** Acquisition, Commercial, Provisioning, Onboarding Monitoring, and Go Live Approval stay where Section 10 puts them.
7. **Tenant Workspace remains responsible for driving school operations.** Every onboarding step's actual work stays inside the module that already owns it, exactly as Section 12 states.

A proposal that fails any one of these seven tests is not a Tenant Onboarding enhancement, regardless of how it is framed, and should be redirected to the architecture document that actually owns the capability it touches.
