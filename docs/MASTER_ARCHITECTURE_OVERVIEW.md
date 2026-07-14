# TrafikskolaOS — Master Architecture Overview

**Document type:** Executive architecture guide — the single entry point for understanding TrafikskolaOS before reading any detailed architecture document.
**Status:** Frozen. Final refinement complete, following an independent architectural peer review. Does not modify or supersede any existing document.
**Audience:** Developers, architects, product owners, investors, implementation partners, and future AI assistants encountering this project for the first time.

This document explains how the system fits together. It does not specify how anything is built. Where detail is needed, it points to the document that owns that detail rather than repeating it.

---

## 1. Executive Summary

TrafikskolaOS is a Sweden-first, multi-tenant SaaS platform that lets a driving school (a *trafikskola*) run its entire operation — scheduling, students, instructors, finance, communication, and Swedish regulatory compliance — from one system.

**Why it exists.** Swedish driving schools today typically run on a patchwork: a booking tool, a spreadsheet, a separate SMS service, and manual bookkeeping, stitched together by hand. Each of these tools solves one problem in isolation; none of them share data. TrafikskolaOS exists to replace that patchwork with a single, coherent system, built specifically around Swedish accounting rules (BAS 2020, VAT periods, SIE4 export, AGI payroll) rather than adapted to them after the fact.

**Who it serves.** Primarily, the owners and staff of Swedish driving schools — the business itself. Secondarily, the people around that business: students learning to drive, the guardians of those students (many are minors), instructors delivering lessons, and — for schools with training contracts — corporate customers buying instruction for their employees. TrafikskolaOS itself, as a company, is also a user of its own platform, through the tooling it uses to operate the SaaS business (onboarding schools, managing subscriptions, and supporting its customers).

**What it solves.** Three problems, specifically:
1. **Operational fragmentation** — one system instead of several disconnected tools, so a booking, a student record, and an invoice are always the same fact, not three copies that can drift apart.
2. **Compliance risk** — Swedish accounting and payroll rules (append-only ledgers, VAT periods, SIE4, AGI) built into the platform's foundation, not bolted on.
3. **Operational visibility** — an owner or manager can see the state of their business — schedule, finances, student progress — without manually reconciling multiple sources.

The remainder of this document explains how the platform is structured to deliver on that, and where to look for further detail on any specific part of it.

---

## 2. The Three-System Model

TrafikskolaOS is best understood as three systems working together, not one monolithic application.

```
                    ┌─────────────────────┐
                    │   Public Website     │   Earns attention, explains the
                    │   (marketing)        │   product, converts a visitor into
                    └──────────┬──────────┘   a conversation.
                               │
                               │  "Boka en personlig visning"
                               ▼
                    ┌─────────────────────┐
                    │   SaaS Platform      │   Runs TrafikskolaOS as a business:
                    │   (platform ops)     │   onboarding schools, subscriptions,
                    └──────────┬──────────┘   platform-wide support and audit.
                               │
                               │  provisions & governs
                               ▼
                    ┌─────────────────────┐
                    │  Customer Product    │   What a driving school actually
                    │  (tenant workspace   │   uses every day — scheduling,
                    │   + portals)         │   students, finance, communication.
                    └─────────────────────┘
```

### Public Website
- **Purpose.** Earn a prospective customer's attention and trust, explain what TrafikskolaOS is, and move a qualified visitor toward a real conversation. It is a marketing and information surface — it does not run any school's operations.
- **Primary users.** Public Visitors and Prospective Customers — people who do not yet have an account.
- **Business responsibility.** Generate qualified conversations (demo bookings) and, secondarily, serve existing customers looking for support or a login link.
- **Relationship to the other systems.** Feeds the SaaS Platform's sales/onboarding motion. Has no operational data of its own and does not read from or write to a school's live data.

### SaaS Platform
- **Purpose.** Run TrafikskolaOS as a business. This is where the company operating TrafikskolaOS onboards new schools, manages subscriptions and billing, monitors the platform, and supports its customers at the account level.
- **Primary users.** Platform Operators and Platform Administrators — TrafikskolaOS's own staff, not driving-school staff.
- **Business responsibility.** Tenant lifecycle (onboarding, subscription, offboarding), platform-wide oversight (audit, security, support), and the administrative boundary that keeps the company running TrafikskolaOS separate from any individual school's day-to-day operations.
- **Relationship to the other systems.** Provisions and governs every tenant that exists in the Customer Product. Deliberately does not operate inside a tenant's day-to-day business — a Platform Administrator manages the *existence* of a school's account, never its schedule, its students, or its books.

### Customer Product
- **Purpose.** The actual product a driving school pays for and uses daily — scheduling, student and instructor management, finance and Swedish compliance, communication, and reporting — plus the self-service portals for students, guardians, and instructors.
- **Primary users.** Tenant Owners, Tenant Administrators, Branch Managers, Receptionists, Instructors (as staff), and — through their own portals — Students, Guardians, and Instructors again in a self-service capacity.
- **Business responsibility.** Deliver the operational value TrafikskolaOS is sold on: a school's entire business, run from one system, in real time.
- **Relationship to the other systems.** Exists only for tenants provisioned by the SaaS Platform. Is the system every other layer ultimately serves — the Public Website's job is to lead someone here; the SaaS Platform's job is to make sure this layer stays running, billed, and supportable.

---

## 3. System Boundaries

The Three-System Model above describes what each system *does*. Just as important is what each one explicitly does not do — the boundaries that keep the three systems from quietly blurring into one another over time.

- The Public Website never stores or exposes operational business data — no student records, no bookings, no financial data.
- The Public Website never operates a driving school — it explains the product; it does not run one.
- The SaaS Platform governs tenants but never operates their daily business — it manages the existence of an account, not a school's schedule, students, or books.
- Platform Administration never performs tenant operations — a Platform Administrator cannot book a lesson, edit a student record, or issue an invoice on a school's behalf.
- Tenant Workspaces never access another tenant's data — every school's operational data is isolated from every other school's, without exception.
- Student, Guardian, and Instructor portals only expose information belonging to their own identity — a portal session never surfaces another person's records.

These boundaries are what make the Three-System Model durable rather than aspirational. Detailed enforcement mechanisms belong to the Enterprise Architecture Handbook; the statements above are the plain-language commitments that mechanism exists to uphold.

---

## 4. Ownership Hierarchy

A concise view of who owns what, independent of how the system is structured technically.

```
Platform
    │   TrafikskolaOS itself — owns the SaaS Platform and the Public Website
    ▼
Tenant
    │   A driving school — owns its own operational data, users, and configuration
    ▼
Branch
    │   A location within a multi-location school — scopes staff and data within a tenant
    ▼
Users
    │   Staff, students, and guardians — each scoped to what their role and identity permit
    ▼
Business Objects
        Bookings, students, invoices, and every other fact the business produces
```

This is a high-level ownership view only. The detailed ownership model — specific roles, permissions, and data-scoping rules — is documented in the Architecture Audit; it is not repeated here.

---

## 5. User Ecosystem

Every user type TrafikskolaOS serves, and the one system each primarily lives in.

| User type | Business goal | Entry point | Primary system |
|---|---|---|---|
| **Public Visitor** | Understand what TrafikskolaOS is, decide whether to look further | Public Website (any page) | Public Website |
| **Prospective Customer** | Evaluate TrafikskolaOS as a real option for their school, book a demo | Public Website | Public Website |
| **Existing Customer** | Log in and get on with running their school | Customer Login | Customer Product |
| **Platform Operator** | Support, monitor, and maintain the platform on a day-to-day basis | Platform Login | SaaS Platform |
| **Platform Administrator** | Onboard schools, manage subscriptions, govern the platform at the account level | Platform Login | SaaS Platform |
| **Tenant Owner** | Run their driving school as a business — visibility and control over the whole operation | Customer Login | Customer Product |
| **Tenant Administrator** | Configure their school's settings, users, and structure | Customer Login | Customer Product |
| **Branch Manager** | Operate one location of a multi-location school | Customer Login | Customer Product |
| **Receptionist** | Handle day-to-day booking, student administration, and front-desk operations | Customer Login | Customer Product |
| **Instructor** | Deliver lessons, manage their own schedule and students | Customer Login or Instructor Workspace | Customer Product |
| **Student** | Book lessons, track progress, see what's expected of them | Student Portal | Customer Product |
| **Guardian** | Follow a student's progress, schedule, and account (relevant when the student is a minor) | Guardian Portal | Customer Product |
| **Corporate Customer** | Manage a training contract covering their own employees | Not yet self-service (see Section 6) | Customer Product |

---

## 6. System Entry Points

Every way a user enters TrafikskolaOS, and what each entry point is for.

- **Public Website** — the front door for anyone without an account. Explains the product, builds trust, and leads toward a demo booking. No login required.
- **Customer Login** — the entry point for a driving school's own staff (Tenant Owner down to Receptionist) into the Customer Product's operational workspace.
- **Platform Login** — a separate, deliberately low-visibility entry point for TrafikskolaOS's own staff into the SaaS Platform. Kept apart from Customer Login so the company running TrafikskolaOS and the schools using it never share a front door.
- **Student Portal** — a self-service entry point for students, scoped to their own bookings, progress, and materials. Does not require the same account system a staff member uses.
- **Guardian Portal** — a self-service entry point for a student's guardian, scoped to visibility into that student's progress, schedule, and account.
- **Instructor Workspace** — the entry point for instructors to manage their own schedule and students. (Today this exists in more than one form; see Section 14, Current Implementation Status, for status rather than design detail.)
- **Future Corporate Portal** — not yet an entry point. Today, a corporate customer's training contract is managed on their behalf by the school's own staff, inside the Customer Product, rather than through a self-service login of their own.

Each entry point exists because its user has a genuinely different relationship to the system — a student should never need to understand "organizations" or "subscriptions" just to check their next lesson, and a Platform Administrator should never be one click away from a school's live student records.

---

## 7. Business Flow Overview

One conceptual view of how a visitor becomes an operational, growing customer. This is a business lifecycle, not an implementation flow.

```
Visitor
    │
    ▼
Prospective Customer
    │
    ▼
Book Demo
    │
    ▼
Customer Onboarding
    │
    ▼
Active Tenant
    │
    ▼
Operational Business
    │
    ▼
Business Growth
```

Each step passes through one of the System Entry Points described above — a Visitor and Prospective Customer both live on the Public Website; Book Demo is the site's one conversion action; everything from Customer Onboarding onward happens inside the Customer Product. This diagram is deliberately conceptual — it shows *that* this journey exists and roughly where it passes between systems, not how any step is implemented.

---

## 8. High-Level System Hierarchy

A different hierarchy from Section 4's Ownership Hierarchy: this one shows architectural layering — what is built on top of what — rather than who owns what.

```
TrafikskolaOS
    │
    ▼
Public Website             — earns attention, explains the product
    │
    ▼
SaaS Platform               — runs TrafikskolaOS as a business
    │
    ▼
Customer Product             — what a driving school actually uses
    │
    ▼
Operational Modules          — scheduling, students, finance, communication,
    │                          instructors, reporting
    ▼
Portals                      — Student, Guardian, Instructor
    │
    ▼
Shared Services               — authentication, permissions, tenant isolation,
                                 event processing, Swedish compliance engine
```

Each layer exists to serve the one above it. Shared Services underpin every layer above them but are never a destination on their own — no user "goes to" the permission system or the event pipeline; they simply make every other layer work correctly and safely. This diagram deliberately stops at the conceptual layer — it does not enumerate routes, modules, or file paths. For that level of detail, see the Architecture Audit (referenced in Section 11, Relationship Between Architecture Documents).

---

## 9. Business Domain Overview

TrafikskolaOS's Customer Product is organized around a small number of business domains that work together, not in isolation:

- **Students & Customers** — the people and organizations a school serves, from an individual learner to a corporate training contract.
- **Scheduling** — the operational core: bookings, instructor and vehicle availability, waitlists, and the calendar a school runs its day around.
- **Instructors & Staff** — the people delivering the service, their schedules, qualifications, and permissions.
- **Finance & Compliance** — invoicing, payments, and Swedish accounting (double-entry ledger, VAT, SIE4, payroll), kept append-only and auditable rather than freely editable.
- **Communication** — the channel through which a school reaches students, guardians, and staff, and through which the platform delivers automated reminders and notifications.
- **Reporting** — visibility into how the business is actually performing, built from the same data every other domain writes.

These domains are not six separate products glued together — a booking, a student, and an invoice are the same underlying facts viewed from different domains, not six different copies of the truth. That coherence is the specific problem TrafikskolaOS was built to solve (Section 1). The domains themselves, their data model, and their detailed responsibilities are owned by the Enterprise Architecture Handbook — this section exists only to show how they relate to one another, not to redefine them.

---

## 10. Architecture Principles

The principles below govern how TrafikskolaOS is built. Each is documented in full elsewhere; they are summarized here only so a reader knows they exist before encountering them in detail.

- **Multi-tenant first.** Every school is an isolated tenant by default — isolation is not a feature added for larger customers, it is the baseline for all of them.
- **Business domains, not technical layers.** The system is organized around what the business does (scheduling, finance, students), not around technical concerns — a reader should be able to find "how invoicing works" without first understanding the framework it's built in.
- **Canonical ownership.** Each fact in the system has exactly one owning domain. A student's status is not independently tracked in three modules — every other module reads it from the one place that owns it.
- **Event-driven business architecture.** Domains communicate through events rather than reaching directly into each other's data, so a change in one domain (a booking cancellation, an invoice payment) can trigger consequences elsewhere (a waitlist promotion, a reminder) without tightly coupling the two.
- **Tenant isolation.** Enforced at the database level, not only in the application — the authoritative control is row-level security, not a check the frontend happens to perform.
- **Platform governance.** The SaaS Platform (Section 2) manages tenants without operating inside them — a structural boundary, not a policy one (see Section 3, System Boundaries).
- **Sweden-first design.** Swedish accounting, VAT, and payroll rules are the foundation the platform was designed around, not an extension added afterward.
- **Operational simplicity.** The platform favors what makes a driving school's daily operation faster and clearer over architectural sophistication for its own sake — complexity is added only where a measurable operational need justifies it.

The full technical detail behind every principle above — schemas, enforcement mechanisms, and the reasoning behind each — lives in the **Enterprise Architecture Handbook**, not here.

---

## 11. Relationship Between Architecture Documents

How the architecture documentation is actually organized today, and the purpose of each document.

```
Master Architecture Overview          ← you are here
    │   the single entry point; explains how everything fits together
    ▼
Enterprise Architecture Handbook
    │   the technical backend/platform architecture: database, RLS,
    │   Edge Functions, RBAC, observability, governance process
    ▼
Website Information Architecture
    │   the public website's sitemap, page purposes, and navigation model
    │   (currently maintained as sections within the Landing Page Strategy
    │   document below, not yet a separate standalone file)
    ▼
Landing Page Strategy (v4)
    │   the approved messaging, positioning, and page-by-page content
    │   strategy for the public marketing site
    ▼
Public Website Foundation (+ Final Refinement)
    │   the implemented shared shell (header, footer, navigation, SEO,
    │   accessibility) every public page is built on, plus the deferred
    │   URL-strategy recommendation
    ▼
Architecture Audit
    │   a point-in-time, as-built map of the actual implementation —
    │   routes, modules, navigation, and alignment against the Enterprise
    │   Architecture Handbook
    ▼
Implementation
        the code itself
```

**Two honest gaps, stated plainly rather than glossed over:** a standalone "SaaS Architecture" document and dedicated "Business Lifecycles" / "Business Capabilities" documents do not exist as separate files today. The SaaS platform's technical architecture is currently documented as part of the Enterprise Architecture Handbook (its own Section 2, "Enterprise Architecture," covers exactly this ground). Business lifecycles and capabilities are described only implicitly, through the Handbook's domain and Edge Function inventory, and — at a conceptual level — through this document's own Business Flow Overview (Section 7). This is recorded here as a fact about the current documentation landscape, not as a recommendation to create them.

Each document above answers a different question, at a different altitude:
- *Master Architecture Overview* — "how does the whole thing fit together?"
- *Enterprise Architecture Handbook* — "how is the backend actually built, and what governs changing it?"
- *Website Information Architecture / Landing Page Strategy* — "what does the public website say, to whom, and why?"
- *Public Website Foundation* — "what shared building blocks does every public page stand on?"
- *Architecture Audit* — "what does the system actually look like today, verified against the source?"

The relationships above describe how these documents depend on one another. The next section gives a practical, recommended order for reading them, which is not always the same thing.

---

## 12. How to Read the Architecture

For a new reader — developer, architect, product owner, investor, implementation partner, or AI assistant — the recommended order is:

```
1. Master Architecture Overview       — start here, for the big picture
2. Enterprise Architecture Handbook   — how the backend and platform are actually built
3. Architecture Audit                 — what the system looks like today, verified against the source
4. Website Information Architecture   — the public website's structure and purpose
5. Landing Page Strategy              — the public website's messaging and content
6. Implementation                     — the code itself
```

This order favors grounding a new reader in verified reality (the Handbook, then the Audit) before moving into the public-facing website documents, which are more strategic and less load-bearing for understanding the core system. It is a suggested path, not a dependency requirement — a reader with a specific question is always better served jumping directly to the document that owns it.

---

## 13. Terminology Note

Several terms used throughout this document, and across TrafikskolaOS's architecture more broadly, carry more than one meaning depending on context. **Platform**, **Product**, **Workspace**, **Resources**, **Admin**, and **Support** are each used, correctly, to mean different things in different parts of the system.

This document introduces these concepts at the level a reader needs to understand the architecture; it does not attempt to reconcile or redefine them here. The Architecture Audit documents each term's specific, implementation-level meanings and where they diverge — consult it before assuming a term means the same thing in every context.

---

## 14. Current Implementation Status

High-level status only — no route lists, no file paths. For implementation-level detail, see the Architecture Audit. Status is expressed consistently as one of: **Established**, **Implemented**, **In Progress**, or **Planned**.

| Area | Status |
|---|---|
| **Enterprise Architecture** | **Established** — Version 1.0 baseline formally recorded and certified; no unresolved architectural contradictions |
| **SaaS Architecture** (backend/platform layer) | **Implemented** — operational; documented within the Enterprise Architecture Handbook rather than as a separate document (see Section 11) |
| **Public Website** | **In Progress** — shared foundation (header, footer, navigation, SEO groundwork) is complete; of nine informational pages, two carry real content (Home, Platform) and the remainder are honest, labeled placeholders |
| **Landing Page** | **Implemented** — approved and frozen |
| **Platform Page** | **Implemented** — approved |
| **Tenant Workspace** | **Implemented** — the operational core (scheduling, students, finance, instructors, communication, reporting) is built and in active use |
| **Platform Administration** | **Implemented** — tenant lifecycle, subscriptions, audit, and platform-level support are built and structurally separated from tenant operations |
| **Student Portal** | **Implemented** — self-service student experience is built |
| **Guardian Portal** | **Implemented** — self-service guardian experience is built |
| **Instructor Workspace** | **Implemented** — exists in two parallel forms whose relationship to each other has not yet been architecturally resolved |
| **Corporate Customer Portal** | **Planned** — recognized as a future gap (see Section 15, Future Evolution); corporate customer relationships are currently managed by school staff, not through a self-service portal |

---

## 15. Future Evolution

The expected direction of the platform's architecture — not a specification of new functionality.

- **Public Website completion.** The remaining informational pages (Business Challenges, Onboarding, Resources, Support, About, Contact) move from placeholder to real content, following the already-approved Website Information Architecture.
- **Customer onboarding.** The high-level path from a booked demo to an active, fully onboarded tenant is now shown conceptually in the Business Flow Overview (Section 7). A more detailed, dedicated onboarding-journey document remains a future documentation opportunity, not yet written.
- **Customer Product expansion.** The operational core continues to deepen within its existing business domains (Section 9), rather than growing new, disconnected domains.
- **Corporate Portal.** A self-service entry point for corporate customers is a plausible future addition to the User Ecosystem and System Entry Points described above — not yet designed, only recognized as a gap between what the business domain (Section 9) already supports and what today's entry points (Section 6) offer.
- **Future integrations.** Continued extension of the platform's existing external-integration pattern (accounting, payment, and communication providers) rather than a new integration architecture.

None of the above changes the Three-System Model in Section 2. Future evolution is expected to deepen each system, not add a fourth.

---

## 16. Executive Conclusion

TrafikskolaOS is organized into distinct architectural layers — a Public Website, a SaaS Platform, and a Customer Product, each built on Shared Services — because the people using each layer have genuinely different relationships to the system. A prospective customer, a platform operator, and a driving school's receptionist should never share an entry point, a permission model, or a data boundary, even though all three are, ultimately, using the same product.

That separation is what makes the platform scalable as a multi-tenant SaaS business: every school is isolated from every other school by construction, the company running TrafikskolaOS is structurally kept out of any single school's day-to-day operations, and the public-facing marketing surface carries no operational data at all. Each layer can change, grow, or be rebuilt largely on its own terms, without destabilizing the others.

This document is the map of that structure. Every other architecture document referenced above fills in one region of it in detail. Read this one first; read the others when the question in front of you belongs to the layer they own.
