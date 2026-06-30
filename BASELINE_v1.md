# TrafikskolaOS Baseline v1

**Document Type:** Official Technical Baseline Reference  
**Classification:** Engineering Documentation  
**Status:** Approved for Baseline Freeze

---

## 1. Vision

TrafikskolaOS is a Sweden-first, multi-tenant SaaS platform for Swedish driving schools (trafikskolor). Its purpose is to replace fragmented, legacy tools currently used by Swedish driving school operators with a single, modern, operationally excellent platform.

The platform is built to meet the specific operational, regulatory, and accounting requirements of the Swedish driving school market. It is not a generic ERP system, a global fleet platform, or a rebranded international SaaS product. Every design decision is grounded in Swedish accounting law, Swedish driving-school workflows, and the day-to-day operational reality of trafikskola staff — from reception and scheduling to instructors on mobile and finance administrators processing VAT.

The primary success metric is operational usability. A driving school should be able to onboard, schedule lessons, track students from lead to licence, and fulfil all Swedish accounting and regulatory obligations through a single product that is fast, intuitive, and mobile-friendly.

---

## 2. Product Scope

### What the Platform Supports Today

**Student Lifecycle**  
Full journey from lead capture through onboarding, active student management, training progress tracking, permit milestone recording, and archival.

**Booking & Scheduling**  
Instructor-aware weekly calendar, slot generation engine, booking creation, attendance management, cancellation, rescheduling, waitlist management, slot templates, and multi-instructor grid views.

**Finance & Accounting**  
Invoicing, payments, student wallet and credit management, lesson packages, campaigns and discounts, refunds, dunning, bank reconciliation, Swedish BAS 2020 chart of accounts, double-entry ledger, VAT period tracking, SIE4 exports, AGI payroll declarations, and Fortnox integration.

**Communication**  
Multi-channel messaging (email, SMS), template management, notification rules, delivery log, activity centre, queue monitoring, and communication analytics.

**Instructor Management**  
Instructor profiles, contract types (employed, consultant, external), licence and ADI certification tracking, scheduling availability, and performance statistics.

**Corporate Customers**  
Company accounts, B2B contracts, student-company linking, and corporate contact management.

**Reporting & Analytics**  
Booking statistics, financial reports, student progress reports, Transportstyrelsen-format exports, and KPI insights.

**Platform Administration**  
Super-admin workspace for driving school onboarding, subscription management, audit visibility, platform admin user management, and platform-level security oversight.

**Portals**
- Trafikskola Admin Workspace (main application)
- Platform Admin Workspace
- Student Self-Service Portal
- Instructor Portal (web-based)
- Instructor App (mobile-optimised, authenticated)
- Guardian Portal (token-based, unauthenticated)
- Public Course Catalog & Checkout
- Public Booking / Lead Capture

**Online Commerce**  
Public-facing course catalogue, package browsing, self-service checkout, enrollment request flow, order management, and package consumption tracking.

**Curriculum & Training Plans**  
Training plan templates with ordered steps, student-assigned plan instances, and step-completion tracking.

**Operations & Automation**  
Automation rules, notification rules, watchlist, tasks, data migration tooling, operational logs, and driving test location management.

---

## 3. SaaS Architecture

### Multi-Tenancy

Every driving school (trafikskola) is an isolated tenant, represented by an **organization** record in the database. All business data — students, instructors, bookings, invoices, ledger entries, communication messages, and configuration — is scoped to an organization.

Multi-tenancy is enforced at three layers:

1. **Database:** Every domain table contains a non-nullable `organization_id UUID` column. PostgreSQL Row-Level Security (RLS) policies prevent any query from accessing rows belonging to a different organization.
2. **JWT:** Every authenticated session carries `organization_id` as a custom JWT claim, injected at login by the `auth-hook` Edge Function. All Edge Functions read this claim to enforce tenant scope on every request.
3. **Application layer:** Edge Functions call `buildEdgeContext()` which extracts `organizationId` from the JWT and makes it available to all downstream operations. No Edge Function accepts a caller-supplied `organization_id` parameter; the claim from the verified JWT is authoritative.

### Organizations

Each organization record represents one driving school. Organizations have:
- `id` (UUID primary key)
- `name`, `slug`
- `subscription_status` (`trialing`, `active`, `past_due`, `cancelled`, `suspended`)
- `subscription_tier` (`starter`, `professional`, `enterprise`)
- `status` (`active`, `suspended`, `onboarding`)
- Associated `memberships`, `locations`, and configuration

### Platform Administration

The Platform Admin is the SaaS operator's super-admin role. Platform admins authenticate via the same Supabase Auth system but hold `is_platform_admin = true` in their JWT. This claim grants:
- Access to the `/platform` workspace (a completely separate UI shell)
- The ability to view and manage organizations across tenants
- The ability to review subscription lifecycle and audit events

Platform admins do **not** manage individual tenant operations (students, instructors, bookings, invoices). They manage the SaaS infrastructure layer: tenant onboarding, subscription state, and platform-level security. This boundary is enforced in code at the route level (`PlatformAdminRoute` guard) and at the database level via RLS exceptions that are explicitly limited to platform admin use cases.

### Driving School Workspaces

Each driving school operates in its own isolated workspace within the main application (`/dashboard`, `/students`, `/scheduling`, etc.). All data, configuration, and communication within a workspace is scoped to that organization. Staff members log in with Supabase Auth and receive an organization-scoped JWT.

### User Roles

Tenant user roles defined in the platform:

| Role | Description |
|------|-------------|
| `org_owner` | Organization owner — full access to all tenant operations |
| `org_admin` | Administrator — broad operational access |
| `org_manager` | Manager — scheduling, students, finance read |
| `instructor` | Instructor — own schedule, student progress |
| `receptionist` | Booking and student admin, no finance |
| `finance_manager` | Finance and accounting access |
| `student` | Limited self-service access |

Platform roles:

| Role | Description |
|------|-------------|
| `platform_admin` | SaaS super-admin — cross-tenant platform management |

### RBAC

Permission codes follow the format: `{domain}:{resource}:{action}`

Domains implemented: `students`, `instructors`, `scheduling`, `finance`, `documents`, `communications`, `reporting`, `administration`, `corporate`, `notifications`, `enrollment`, `packages`, `orders`

Permissions are stored in the database against roles, assembled by `get_user_jwt_claims()`, embedded in the JWT, and available client-side via `useSessionStore().hasPermission()`. Backend enforcement is done per route in every Edge Function via `requirePerm()`.

The permission catalogue contains over 100 distinct permission codes at this baseline. The complete catalogue is maintained in `apps/web/src/core/rbac/permissions.ts` and cross-referenced in `docs/CLAIMS.md`.

Frontend gating uses `<PermissionGate permission="..." />` for UI element visibility and `usePermissions().can()` for imperative checks.

### Authentication

Authentication is handled by Supabase Auth (GoTrue). The authentication flow:

1. User submits credentials at `/auth/login`
2. Supabase GoTrue validates and issues a JWT
3. GoTrue calls the `auth-hook` Edge Function (Custom Access Token Hook)
4. `auth-hook` verifies the request via HMAC-SHA256 standard-webhook signature
5. `auth-hook` calls `get_user_jwt_claims()` PostgreSQL function to retrieve `organization_id`, `role`, `permissions[]`, `location_ids[]`, `subscription_tier`, and `is_platform_admin`
6. The enriched claims are embedded in the access token
7. `AuthProvider` in the React app subscribes to Supabase auth state changes, decodes the JWT, and populates the Zustand session store without blocking on database fetches

If `auth-hook` fails to build claims (e.g. cold-start DB failure), it returns `auth_degraded: true`. `AuthProvider` detects this flag, attempts one token refresh, and clears the session if the refresh also yields degraded claims — preventing users from operating with an incomplete JWT.

Tenant switching is handled by the `switch-tenant` Edge Function, which validates membership, updates `preferred_org_id` in `app_metadata`, and triggers a token refresh.

Portal authentication (Student Portal, Instructor Portal, Guardian Portal) uses token-based access without a Supabase Auth session, enabling access for users without login credentials.

---

## 4. Business Architecture

### Commercial Lifecycle

The platform implements a complete B2C and B2B commercial lifecycle:

1. **Lead Capture:** Public booking page captures prospective student interest. Leads are stored in `student_leads` and managed via the Leads module.
2. **Enrollment:** Students self-enroll via the public catalog, selecting packages with optional campaigns/discounts. Enrollment requests are reviewed and converted by staff.
3. **Order Management:** Each enrollment generates an order with full lifecycle states: `pending_review`, `approved`, `invoiced`, `cancelled`. Orders link to enrollments, packages, invoices, and payments.
4. **Packages & Pricing:** Driving school operators define lesson packages (lesson category, hours, price, VAT rate). Campaign codes and discount rules can be applied at checkout or by staff.
5. **Invoicing:** Gap-free, append-only invoice numbering. Invoices are generated from orders. Voiding creates reversal entries — no destructive deletion.
6. **Payments:** Payments recorded against invoices. FIFO credit allocation to outstanding invoices. Overpayment creates wallet credits.
7. **Wallet:** Student credit wallet tracks balance. Credits are consumed against future invoices. Full transaction history.
8. **Package Consumption:** Lesson package hours are consumed as bookings are completed. Consumption is tracked with full reversibility.
9. **Dunning:** Configurable dunning schedule with automated reminder escalation for overdue invoices.

### Scheduling

The scheduling system is one of the platform's highest-priority operational areas:

- **Slot Engine:** Lesson slots define when an instructor is available. Slots have a lifecycle: `available` → `booked` → `completed`/`cancelled`. Concurrency-safe booking via database-level EXCLUDE constraints.
- **Generation Engine:** Automated slot generation based on per-instructor templates and schedule configurations. Runs are tracked in `scheduling_generation_runs` with observability and retry support.
- **Booking Workflow:** Students are assigned to slots. Booking states: `confirmed`, `cancelled`, `completed`, `no_show`. Attendance is recorded per booking.
- **Waitlist:** Cancelled slots automatically notify waitlisted students.
- **Calendar UI:** FullCalendar v6, Swedish locale, day/week views, instructor filter pills, touch-optimised interaction. Standard slot intervals: 07:00–08:30, 08:30–10:00, 10:00–11:30, 12:00–13:30, 13:30–15:00, 15:00–16:30.
- **Multi-instructor Grid:** Side-by-side view of all instructors' availability.
- **Slot Templates:** Reusable templates for recurring slot patterns.
- **iCal Export:** Instructors can subscribe to their schedule via iCal feed.

### Finance

The finance layer is designed for full Swedish accounting compliance and is intentionally conservative — all financial records are immutable:

- **Double-Entry Ledger:** Every financial event posts to an immutable, append-only journal ledger with BAS 2020 accounts. Corrections are made via reversal entries only.
- **BAS 2020:** Swedish chart of accounts implemented in full. Account mapping is configurable per organization.
- **VAT:** Swedish VAT periods (monthly/quarterly). VAT period tracking, clearing accounts, and period locking.
- **SIE4 Export:** Deterministic SIE4 file generation with SHA-256 integrity verification. Replay-safe: the same input data always produces the same export file.
- **Bank Reconciliation:** Bank statement import and transaction matching.
- **Financial Period Close:** Soft close and hard close workflow. Fiscal year end close with immutable audit snapshots.
- **Payroll:** Payroll journal, Swedish employer contribution calculations, AGI (Arbetsgivardeklaration) export with SHA-256 signing.
- **Fixed Assets:** Asset register, straight-line and declining-balance depreciation, disposal workflow.
- **Accruals & Deferred Revenue:** Accrual schedules and deferred revenue release engine.
- **Fortnox Integration:** Synchronisation tables for Fortnox accounting system export.

### Communications

The communication layer supports multi-channel outreach:

- **Channels:** Email and SMS. Channel settings and credentials configured per organization.
- **Templates:** Reusable message templates with variable substitution.
- **Notification Rules:** Trigger-based dispatch rules (e.g. booking confirmation, payment reminder, lesson cancellation).
- **Communication Worker:** Background Deno Edge Function that processes the outbound message queue, handles delivery retries, and writes delivery outcomes to the log.
- **Delivery Log:** Full record of every message sent, delivery status, and channel used.
- **Activity Centre:** Unified view of inbound and outbound communication activity.
- **Queue Monitor:** Operational view of the message queue state.

### Reporting

Available report areas:
- Booking statistics (by instructor, by vehicle, by lesson type)
- Financial reports (revenue, invoices, payments, dunning status)
- Student reports (active, inactive, progress)
- Transportstyrelsen format exports
- BAS accounting reports
- SIE4 ledger exports
- AGI regulatory exports

### Corporate Customers

B2B workflow for organizations that send employees for driving training:

- Corporate customer (företagskund) records with org number, contact persons, billing address
- B2B contracts with agreed pricing terms
- Student-to-company linking (a student can be sponsored by a company)
- Separate corporate customer list and detail views
- RLS-enforced tenant isolation of all corporate data

### Guardians

Guardians of minor students have access to a dedicated, token-based portal (`/guardian`). The guardian relationship is stored in the database and used to generate a secure access token. Guardians can view:
- Their student's schedule
- Training progress and permit milestones
- Financial summary (economy view)
- Risk training information
- Licence journey overview
- Messages and documents

Guardian access is read-only and scoped strictly to the linked student's data. No Supabase Auth account is required.

### Instructors

Instructors are managed within the tenant workspace:

- Employment type: `employed`, `contractor`, `external`, `on_leave`, `inactive`
- ADI certification tracking with expiry dates
- Driving licence category authorisations
- Schedule availability management
- Individual statistics (completed lessons, no-show rate, utilisation)
- Instructor-specific calendar views (My Schedule)
- Instructor Portal: dedicated web portal for instructors to view their own schedule, students, and statistics without accessing the full admin workspace
- Instructor App: mobile-optimised authenticated app for instructors to manage their day

### Students

Students are the central entity of the platform:

- Lifecycle states: `lead` → `onboarding` → `active` → `paused` → `completed`/`withdrawn` → `archived`
- Personal data including personnummer (encrypted at rest)
- Permit stage tracking (B, A, BE, motorcycle, etc.)
- Training plan assignment and step-by-step progress tracking
- Booking history and attendance records
- Document storage
- Financial records (invoices, payments, wallet balance, package assignments)
- Contract management
- Student self-service portal (separate, token-based)
- Inactive student tracking and alerts

---

## 5. Technical Architecture

### Frontend

**Framework:** React 19 with Vite 6  
**Language:** TypeScript 5.7 (strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`)  
**Routing:** React Router DOM v7 with lazy-loaded modules  
**State — server:** TanStack Query v5 with hierarchical query key factories  
**State — auth/session:** Zustand v5 (no localStorage persistence — rebuilt on each load from JWT)  
**State — UI:** `useState` for local state; Zustand only where justified  
**Forms:** React Hook Form v7 + Zod validation  
**UI components:** Radix UI primitives (via `@platform/ui` package) + shadcn/ui patterns + Tailwind CSS 3  
**Calendar:** FullCalendar v6 (`@fullcalendar/react`, `timegrid`, `daygrid`, `resource-timegrid`, `interaction`)  
**Localisation:** i18next + react-i18next — Swedish primary language, synchronous admin init  
**Date handling:** date-fns v4 + date-fns-tz (DST-safe UTC handling)  
**Icons:** Lucide React  
**Service Worker:** Registered at startup for PWA / push notification support  

**Provider stack (outermost → innermost):**
```
ThemeProvider → I18nProvider → QueryProvider → AuthProvider → <Router>
```

**Authentication flow in the browser:**  
`AuthProvider` subscribes to `supabase.auth.onAuthStateChange`. On `SIGNED_IN` or `INITIAL_SESSION`, it decodes the JWT (no network call), establishes the session in Zustand immediately, then loads profile and organization from the database in the background. This ensures authentication never blocks on a cold-start database.

**Route authorization:**  
- Public routes: `/auth/*`, `/book`, `/catalog/:orgId/*`, `/portal/*`, `/instructor-portal/*`, `/guardian/*`
- Protected routes: wrapped in `<ProtectedRoute>` which redirects unauthenticated visitors to `/auth/login` (preserving `state.from` for post-login redirect)
- Platform admin routes: wrapped in `<PlatformAdminRoute>` which additionally checks `is_platform_admin`
- Unknown authenticated routes: render `<ComingSoonPage>` inside AppShell (no 404 ejection)

### Backend

**Platform:** Supabase (hosted, project ref `ulgsndzfksphquqakelq`)  
**Database:** PostgreSQL (managed by Supabase)  
**Auth:** Supabase Auth (GoTrue) with Custom Access Token Hook  
**Security:** Row-Level Security (RLS) on all domain tables  
**Edge runtime:** Deno (Supabase Edge Functions)  
**Background jobs:** `pg_cron` triggers the `event-worker` and `communication-worker` on schedule  

### Edge Functions

55 Edge Functions are deployed to Supabase. They cover:

**Auth & Session**
- `auth-hook` — Custom Access Token Hook (HMAC-SHA256 standard-webhook signed). Injects `organization_id`, `role`, `permissions`, `location_ids`, `subscription_tier`, `is_platform_admin` into every JWT
- `switch-tenant` — Tenant switching for users with multiple memberships

**Core Operations**
- `students` — Student CRUD (5 routes)
- `instructors` — Instructor CRUD (5 routes)
- `slots` — Lesson slot management
- `bookings` — Lesson booking management
- `waitlist` — Waitlist operations
- `dashboard` — Aggregated dashboard metrics RPC

**Finance**
- `invoices` — Invoice operations
- `payments` — Payment recording
- `wallet` — Student credit wallet
- `packages` — Lesson package management
- `student-packages` — Package assignments to students
- `package-consumption` — Package hour consumption tracking
- `refunds` — Refund processing
- `discounts` — Discount and coupon management
- `dunning` — Dunning schedule management
- `ledger` — Double-entry ledger operations
- `ledger-governance` — Ledger governance and integrity
- `ledger-replay` — Deterministic ledger replay
- `reconciliation` — Bank and period reconciliation
- `financial-close` — Period soft/hard close and fiscal year end
- `reports` — Financial reporting aggregations
- `accruals` — Accrual schedule management
- `fixed-assets` — Fixed asset and depreciation management
- `payroll` — Payroll journal and AGI exports
- `swedish-vat` — Swedish VAT period management
- `swedish-settings` — Swedish accounting configuration
- `sie4` — SIE4 export generation
- `regulatory-exports` — AGI, SAF-T and other regulatory exports
- `compliance` — Compliance certification and filing
- `fortnox` — Fortnox integration
- `replay-architecture` — Ledger replay governance

**Commercial**
- `campaigns` — Campaign and coupon management
- `orders` — Order lifecycle management
- `enrollments` — Enrollment request processing
- `corporate-customers` — Corporate customer management
- `corporate-contracts` — Corporate contract management
- `public-booking` — Public lead capture
- `public-catalog` — Public package catalog
- `public-enrollment` — Self-service enrollment checkout
- `stripe-webhook` — Stripe payment webhook handler

**Communication**
- `communications` — Message composition and delivery
- `communication-worker` — Background message queue processor
- `notifications` — Notification management

**Portals**
- `student-portal` — Student portal data API
- `instructor-portal` — Instructor portal data API
- `guardian-portal` — Guardian portal data API
- `instructor-ical` — Instructor iCal feed generation

**Platform**
- `platform-admin` — Platform admin operations and tenant management
- `platform-bootstrap` — First-time platform admin bootstrapping
- `health` — Platform health check endpoint

**Infrastructure**
- `event-worker` — Domain event outbox processor (handler registry, retry, dead-letter)
- `data-migration` — Data import and migration management
- `logs` — Operational log aggregation

### Database

**Schema management:** Append-only SQL migrations (`supabase/migrations/`). 210+ migration files. Migrations are never edited after deployment.  
**Naming convention:** `YYYYMMDDHHMMSS_description.sql`  
**Tenant isolation:** All domain tables include `organization_id UUID NOT NULL`. RLS policies on every table use `auth_organization_id()` to enforce tenant boundaries.  
**Soft deletes:** `deleted_at TIMESTAMPTZ` on operational records. Hard deletes are not used for student, instructor, invoice, or booking records.  
**Immutable records:** Finance and compliance records (journal entries, invoice postings, SIE4 exports, AGI exports, compliance certifications) are append-only. Corrections use reversal entries.  
**SECURITY DEFINER functions:** All business-critical mutations (invoice posting, journal posting, period close, payroll posting, fiscal year close) are wrapped in `SECURITY DEFINER` PostgreSQL functions that enforce invariants atomically.  
**Event Outbox:** Domain events are written to `event_outbox` and processed by `event-worker` for reliable async handling.  
**Views:** Extensive use of `security_invoker` views for read models and reporting aggregations.  
**Indexes:** BRIN indexes on timestamped tables; B-tree composite indexes on all foreign key + filter combinations used in common queries.

Key RLS helper functions available in all queries and Edge Functions:

| Function | Returns |
|----------|---------|
| `auth_organization_id()` | `UUID \| null` — current tenant |
| `auth_membership_id()` | `UUID \| null` — active membership |
| `auth_location_ids()` | `UUID[]` — location assignments |
| `is_platform_admin()` | `boolean` — cross-tenant bypass |
| `is_impersonating()` | `boolean` — impersonation guard |
| `has_permission(code)` | `boolean` — single permission check |
| `has_any_permission(codes)` | `boolean` — any-of permission check |

### Packages (Shared Libraries)

The repository is a pnpm + Turborepo monorepo. Eight shared packages are consumed by the web application:

| Package | Purpose |
|---------|---------|
| `@platform/config` | Shared `tsconfig.base.json` with strict TypeScript settings |
| `@platform/types` | Domain types, database-generated types, RBAC types |
| `@platform/utils` | Utilities, validators, structured logger, error hierarchy |
| `@platform/validation` | Zod schemas for all domain entities |
| `@platform/i18n` | i18next configuration and Swedish translation strings |
| `@platform/ui` | Radix UI + Tailwind component library (shadcn/ui patterns) |
| `@platform/api-core` | Repository/service base classes, TenantContext, error hierarchy |
| `@platform/database` | Database schema utilities and type helpers |

All packages must pass `pnpm typecheck` before any commit.

### Localization

Swedish is the exclusive operational UI language for the admin workspace and all portals. The platform is intentionally not internationalized — there is no language switcher, and all UI strings are Swedish.

- i18next with synchronous initialization (no suspense wrapper needed)
- Swedish locale for date formatting throughout (`sv-SE`)
- FullCalendar configured with Swedish locale (`svLocale`)
- Swedish accounting and compliance terminology used throughout the finance module
- All user-facing text follows Swedish UX writing conventions (compound words, correct grammatical agreement, lowercase sentence capitalization)

### UI Architecture

**Application Shell:**  
- Desktop: fixed 280px sidebar + fixed top bar + scrollable main content area  
- Mobile: full-screen layout with slide-out drawer sidebar + bottom-accessible hamburger  
- AppShell mounts a `CommandPalette` (⌘K / Ctrl+K) for keyboard-accessible navigation and student search  

**Design system:** Tailwind CSS 3 utility classes + CSS variables for semantic colour tokens (light/dark mode capable). Component primitives from `@platform/ui`. Icon set: Lucide React.

**Sidebar navigation sections:**
- GENERELLT: Kunder, Leads, Utbildningsplaner, Företagskunder, Kommunikation, Rapporter, Insikter, Klasslista, Bevakningar, Uppgifter, Loggar
- BOKNINGSSYSTEM: Bokningsschema, Mitt schema, Bokningsflöde, Passöversikt, Väntelista, Kursöversikt, Statistik, Passläggning, Slotmallar
- RESURSER: Fordon & Platser, Trafikövningsplatser
- EKONOMI: Fakturor, Betalningar, Kassa, Paket, Kampanjer, Ordrar, Fortnox
- SYSTEMINSTÄLLNINGAR: Personal, LärarApp, Inställningar, Dataimport

**Path aliases** (`apps/web/vite.config.ts`):

| Alias | Resolves to |
|-------|-------------|
| `@/` | `apps/web/src/` |
| `@app/` | `apps/web/src/app/` |
| `@core/` | `apps/web/src/core/` |
| `@modules/` | `apps/web/src/modules/` |
| `@shared/` | `apps/web/src/shared/` |
| `@platform/ui` | `packages/ui/src/index.ts` |
| `@platform/types` | `packages/types/src/index.ts` |
| `@platform/i18n` | `packages/i18n/src/index.ts` |
| `@platform/utils` | `packages/utils/src/index.ts` |
| `@platform/validation` | `packages/validation/src/index.ts` |

---

## 6. Current Portals

### 6.1 Trafikskola Admin Workspace

**Purpose:** The primary operational interface for driving school staff (owners, administrators, managers, receptionists, finance staff).

**Route prefix:** `/` (authenticated, `AppShellLayout`)

**Current status:** Implemented and operational. Passes build, TypeScript, and lint.

**Supported features:**
- Översikt dashboard with KPI cards, operational alerts, instructor status, today's schedule, student distribution chart, quick actions, notices, and messages
- Student management (list, detail, create, edit, status management, inactive student view)
- Scheduling calendar (weekly + daily, instructor filter, slot detail, booking creation/cancellation/rescheduling/attendance)
- Instructor management (list, detail, create, edit, certification tracking)
- Finance workspace (invoices, payments, kassa, packages, campaigns, orders)
- Corporate customer management (list, detail, create, edit, contracts)
- Leads pipeline management
- Curriculum and training plan templates
- Communication hub (compose, delivery log, templates, notification rules, activity centre, queue monitor, analytics)
- Reports and analytics
- Insights (trends, demographics, KPIs)
- Enrollment request management
- Resources (vehicles and locations)
- Watchlist and tasks
- Operational logs
- Data migration tooling
- Settings workspace (company, scheduling, students, communication, kassa, legal, staff, system, and more)
- User profile management
- ⌘K command palette

**Future enhancements:**
- Lead conversion funnel analytics
- Instructor performance analytics and leaderboard
- Exam readiness panels and driving test result recording
- Multi-branch location filtering across all modules
- Cohort learning and quiz statistics views
- Business intelligence reporting (retention, instructor ROI, revenue by lesson type)

---

### 6.2 Platform Admin Workspace

**Purpose:** SaaS operator super-admin interface for managing tenant organisations, subscriptions, and platform-level configuration.

**Route prefix:** `/platform` (requires `is_platform_admin = true`)

**Current status:** Implemented and operational.

**Supported features:**
- Platform dashboard with aggregate KPIs across all tenants
- Organisation list and detail views (tenant lifecycle management)
- Subscription management and detail
- Platform admin user management
- Role catalogue management
- Support case overview
- Platform security and audit log

**Future enhancements:**
- Billing and payment integration
- Tenant impersonation UI
- Feature flag management per subscription tier
- Global announcement broadcasting

---

### 6.3 Student Self-Service Portal

**Purpose:** A simplified, mobile-friendly portal for enrolled students to book lessons, track progress, and manage their account without full admin access.

**Route prefix:** `/portal` (token-based access, no Supabase Auth required)

**Current status:** Implemented and operational.

**Supported features:**
- Dashboard with progress summary
- Booking (`/portal/boka`) — browse available slots and book
- Bookings list (`/portal/bokningar`) — view and manage own bookings
- Progress tracking (`/portal/framsteg`) — permit milestones, training plan steps
- Learning materials (`/portal/material`) — access uploaded materials
- Theory preparation (`/portal/teori`) — theory study materials
- Övningskörning log (`/portal/ovningskörning`) — private practice log
- Min lärare (`/portal/min-larare`) — assigned instructor info
- Körkortsresa (`/portal/korkortsresa`) — full licence journey overview
- Utbildningskort (`/portal/utbildningskort`) — training card
- Documents (`/portal/dokument`) — personal documents
- Messages (`/portal/meddelanden`) — communication inbox
- Account (`/portal/konto`) — billing and payment summary
- Settings (`/portal/installningar`) — portal preferences

**Future enhancements:**
- Theory quiz / knowledge test integration
- Push notifications
- Stripe / Swish self-service payments
- E-signature for contracts

---

### 6.4 Instructor Portal

**Purpose:** A web-based portal for instructors to view their own schedule, manage their students, and review statistics without accessing the full admin workspace.

**Route prefix:** `/instructor-portal` (token-based access, no Supabase Auth required)

**Current status:** Implemented and operational.

**Supported features:**
- Dashboard with today's bookings and schedule summary
- Schema — personal weekly calendar
- Bokningar — booking list and attendance management
- Elever — assigned student list
- Statistik — personal performance statistics
- Utbildningskort — student training card view
- Inställningar — portal preferences

**Future enhancements:**
- Student assessment recording directly in the portal
- Direct messaging to students
- Absence and time-off request submission

---

### 6.5 Instructor App

**Purpose:** A mobile-optimised, Supabase-authenticated app layout for instructors to manage their day from a smartphone or tablet.

**Route prefix:** `/instructor-app` (protected route, requires authentication)

**Current status:** Implemented and operational.

**Supported features:**
- Idag (Today) — summary of current day bookings
- Schema — weekly schedule view
- Elever — student list and detail view
- Statistik — utilisation and completion statistics
- Profil — profile and settings

**Future enhancements:**
- Push notifications for booking changes
- Quick attendance marking with swipe gestures
- Offline capability via service worker caching

---

### 6.6 Guardian Portal

**Purpose:** Read-only access for parents and guardians of minor students to monitor training progress and communicate with the school.

**Route prefix:** `/guardian` (token-based access, no Supabase Auth required)

**Current status:** Implemented and operational.

**Supported features:**
- Dashboard with student summary
- Schema — student's upcoming schedule
- Framsteg — permit milestones and training plan progress
- Ekonomi — billing summary and payment status
- Körkortsresa — full licence journey overview
- Riskutbildning — risk training (Risk1, Risk2) information
- Meddelanden — school-to-guardian message inbox
- Dokument — shared documents
- Bokningar — booked lessons list
- Konto — account settings

**Future enhancements:**
- Guardian payment initiation for invoices
- Push notifications for lesson confirmations and changes

---

### 6.7 Public Course Catalog

**Purpose:** Publicly accessible course and package browser for prospective students, enabling self-service enrollment without a login.

**Route prefix:** `/catalog/:orgId` (unauthenticated)

**Current status:** Implemented and operational.

**Supported features:**
- Package listing by organization
- Package detail with pricing, contents, and applicable campaigns
- Self-service checkout flow
- Enrollment confirmation page

**Future enhancements:**
- Stripe and Klarna payment integration at checkout
- Course availability display (next available slot dates)

---

### 6.8 Public Booking / Lead Capture

**Purpose:** A public-facing page where prospective students can register their interest and be captured as leads in the system.

**Route prefix:** `/book` (unauthenticated)

**Current status:** Implemented and operational.

**Supported features:**
- Lead capture form (name, contact, licence category interest)
- Submission creates a `student_leads` record

**Future enhancements:**
- Lead scoring
- Automatic welcome email on submission
- Direct calendar integration for booking an intro lesson

---

## 7. Module Inventory

### Admin Workspace Modules

| Module | Path | Key Features |
|--------|------|-------------|
| `dashboard` | `/dashboard` | KPI cards, operational alerts, instructor status, today's schedule, student distribution, quick actions |
| `students` | `/students/*` | List, detail, create, edit, status management, inactive view |
| `scheduling` | `/scheduling/*` | Calendar, booking management, slot operations, waitlist, generation, slot templates, statistics, planner |
| `instructors` | `/instructors/*` | List, detail, create, edit, certification tracking |
| `finance` | `/finance/*` | Invoices, payments, kassa, packages, campaigns, orders, Fortnox |
| `corporate` | `/corporate/*` | Corporate customer list, detail, create, edit, contracts |
| `leads` | `/leads` | Lead pipeline list and management |
| `curriculum` | `/curriculum/*` | Training plan template list and builder |
| `communication` | `/communication/*` | Hub, compose, delivery log, templates, notification rules, activity, queue, analytics, notification log |
| `reports` | `/reports/*` | Booking reports, financial reports, student reports, Transportstyrelsen export |
| `insights` | `/insights` | Trends, demographics, KPIs, reports tabs |
| `classlist` | `/class-list` | Class list view grouped by instructor or date |
| `watchlist` | `/watchlist` | Student and booking watchlist |
| `tasks` | `/tasks` | Task management for staff |
| `logs` | `/logs` | Operational audit log viewer |
| `resources` | `/resources` | Vehicle management, location management |
| `data-migration` | `/settings/data-migration` | Data import management and status |
| `enrollments` | `/enrollments/*` | Enrollment request list and detail |
| `orders` | `/orders/*` | Order list and detail |
| `packages` | `/packages/*` | Package catalogue management |
| `campaigns` | `/campaigns/*` | Campaign and coupon management |
| `settings` | `/settings/*` | Company settings, scheduling config, student booking config, communication config, kassa, legal, staff settings, BAS accounts, system settings, holidays, locations, resources, digital contracts, survey config, common phrases, service providers, brand |
| `profile` | `/profile` | User profile and account settings |

### Platform Admin Modules

| Module | Path | Key Features |
|--------|------|-------------|
| `platform` (dashboard) | `/platform/dashboard` | Cross-tenant KPIs and platform health |
| `platform` (organizations) | `/platform/organizations` | Tenant list and detail |
| `platform` (subscriptions) | `/platform/subscriptions` | Subscription lifecycle management |
| `platform` (admins) | `/platform/admins` | Platform admin user management |
| `platform` (roles) | `/platform/roles` | Global role catalogue |
| `platform` (support) | `/platform/support` | Support case overview |
| `platform` (security) | `/platform/security` | Platform security and audit events |
| `platform` (audit) | `/platform/audit` | Platform-wide audit log |

### Portal Modules

| Module | Prefix | Portal |
|--------|--------|--------|
| `student-portal` | `/portal` | Student self-service |
| `instructor-portal` | `/instructor-portal` | Instructor web portal |
| `instructor-app` | `/instructor-app` | Instructor mobile app |
| `guardian-portal` | `/guardian` | Guardian read-only view |
| `public-catalog` | `/catalog/:orgId` | Public package browser |
| `leads` (public) | `/book` | Public lead capture |

### Shared Components

| Component Group | Location |
|----------------|----------|
| AppShell, Sidebar, TopBar, MobileSidebar | `@shared/components/layout/` |
| ProtectedRoute, PlatformAdminRoute | `@shared/components/guards/` |
| CommandPalette | `@shared/components/CommandPalette/` |
| PageLayout, PageHeader | `@shared/components/layout/PageLayout/` |
| DataTable | `@shared/components/` |
| NotificationBell | `@shared/components/` |

---

## 8. Repository Structure

```
TrafikskolaOS/
├── CLAUDE.md                    # Engineering instructions for AI-assisted development
├── BASELINE_v1.md               # This document
├── pnpm-workspace.yaml          # Monorepo workspace definition
├── turbo.json                   # Turborepo pipeline configuration
├── package.json                 # Root package.json (workspace scripts)
├── pnpm-lock.yaml               # Deterministic lockfile
│
├── apps/
│   └── web/                     # React 19 + Vite SPA (main application)
│       ├── src/
│       │   ├── app/             # Application bootstrap (providers, router, layouts)
│       │   ├── core/            # RBAC, Supabase client, session store, JWT
│       │   ├── modules/         # Feature modules (one directory per domain)
│       │   └── shared/          # Cross-cutting components, hooks, utilities
│       ├── public/              # Static assets, service worker
│       └── package.json
│
├── packages/
│   ├── config/                  # Shared TypeScript configuration
│   ├── types/                   # Domain types, database types, RBAC types
│   ├── utils/                   # Utilities, logger, error hierarchy
│   ├── validation/              # Zod schemas
│   ├── i18n/                    # i18next Swedish translation config
│   ├── ui/                      # Radix UI + Tailwind component library
│   ├── api-core/                # Repository/service base classes, TenantContext
│   └── database/                # DB schema utilities
│
├── supabase/
│   ├── functions/               # 55 Deno Edge Functions
│   │   ├── _shared/             # Shared Edge Function utilities
│   │   │   ├── context.ts       # buildEdgeContext, EdgeRequestContext
│   │   │   ├── cors.ts          # CORS handling
│   │   │   ├── logger.ts        # Structured logger
│   │   │   ├── supabase.ts      # Supabase client factories
│   │   │   ├── rate-limit.ts    # Rate limiting utilities
│   │   │   ├── subscription.ts  # Subscription tier utilities
│   │   │   └── types.ts         # Shared Edge Function types
│   │   └── <function-name>/index.ts
│   ├── migrations/              # 210+ append-only SQL migration files
│   └── seed/                    # Bootstrap and demo seed scripts
│       ├── bootstrap_org_admin.sql
│       ├── bootstrap_platform_admin.sql
│       └── demo_sprint_1_10.sql
│
└── docs/
    ├── CLAIMS.md                # JWT claims contract and governance
    ├── DEPLOY.md                # Deployment procedures
    ├── PILOT.md                 # Pilot checklist
    ├── operational-runbook.md   # Operational runbook
    ├── local-development.md     # Local development guide
    ├── phase1b4-review.md       # Historical Phase 1B.4 review
    └── GAP_IMPLEMENTATION_PLAN.md  # Feature gap analysis for future sprints
```

**Module structure convention** (`apps/web/src/modules/<name>/`):
```
routes/       Route-level page components
components/   Module-scoped reusable components
hooks/        TanStack Query data hooks
lib/          Pure utilities and helpers
index.ts      Public exports
```

---

## 9. Current Quality Status

### Architecture

**Strengths:**
- Clean multi-tenant isolation enforced at database, JWT, and application layers simultaneously
- Immutable finance and compliance records with reversal-based correction model
- JWT-first authorization: no per-request profile DB lookups; session established from token claims in ~0ms
- Non-blocking auth initialization: users are never held at a loading screen due to database latency
- Event-driven architecture via `event_outbox` + `event-worker` for reliable async domain event processing
- Deterministic exports: SIE4 and AGI exports produce identical output for identical input, enabling replay validation

**Limitations:**
- `database.types.ts` (generated Supabase types) is not regenerated on every schema change; approximately 38 files use `as unknown as any` to work around stale generated types. This is a known operational compromise and does not affect runtime correctness.
- JWT permissions array will trigger a size warning above 4KB (currently logged; not rejected). Needs monitoring as more granular permissions are added.

### Security

- Supabase Auth with standard-webhook HMAC-SHA256 signed auth hook
- 5-minute replay attack window on webhook signatures
- RLS policies on all domain tables (verified against PGRST116 test patterns)
- `auth_degraded` fallback prevents operation with a broken JWT
- RESTRICTIVE write policies active on memberships when `is_impersonating` is set (impersonation UI not yet built, but guard is pre-activated)
- `SECURITY DEFINER` functions used for all critical mutations
- Portal tokens grant scoped, read-only access with no admin privileges
- CORS handling on all Edge Functions via shared `cors.ts` utility

### Build

- **Vite build:** PASSES — no errors
- **Bundle size advisory:** One chunk at ~537KB (gzip: 154KB) exceeds the Vite 500KB advisory. This is a pre-existing condition related to the FullCalendar dependency bundle. No user-visible performance issue has been identified.
- All modules are lazy-loaded via `React.lazy()` + `Suspense`; the over-size chunk is amortized by this split

### TypeScript

- **Result:** 9/9 packages PASS — zero errors
- Strict mode enabled globally: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`
- Turbo cache: full cache hit in subsequent runs (~49ms for 9 packages)

### ESLint

- **Result:** 0 errors, 68 warnings
- All warnings are pre-existing `react-hooks/exhaustive-deps` or `react-refresh/only-export-components` categories
- No errors introduced by any sprint in this session

### Known Limitations

| Item | Severity | Notes |
|------|----------|-------|
| Stale `database.types.ts` | Low | ~38 uses of `as unknown as any`. Runtime-safe; regeneration is a maintenance task |
| FullCalendar bundle size | Low | Advisory only; gzip size is acceptable for initial load |
| 68 ESLint warnings | Low | All pre-existing; none are correctness issues |
| `impersonator_id` guard active but UI not built | Low | Guard is pre-activated at DB level; no impersonation is possible until the UI is built |
| No automated E2E test suite | Medium | TypeScript and unit-level validation exists; E2E is a future investment |
| SMS delivery depends on external provider configuration | Low | Communication worker handles retries; provider credentials required per tenant |

---

## 10. Baseline Decisions

### BD-001: Sweden-First, Not International

**Decision:** The platform is built exclusively for the Swedish market and Swedish driving-school workflows.  
**Rationale:** Swedish accounting law (BAS 2020, SIE4, AGI), Swedish VAT rules, Swedish personnummer handling, and Swedish-language UX are tightly integrated. Introducing internationalisation abstractions would add complexity with no current operational need.  
**Consequence:** No internationalisation framework for the primary UI; no multi-currency support; no multi-tax jurisdiction support.

### BD-002: JWT-First Authorization — No Per-Request Profile Fetches

**Decision:** All authorization data (`organization_id`, `role`, `permissions`, `is_platform_admin`) is embedded in the JWT via the `auth-hook`. The application trusts these claims for all access control decisions without re-querying the database.  
**Rationale:** Profile database fetches on every API request would add latency to every operation and would break during database cold starts. JWT claims are set once at login and refreshed on token renewal.  
**Consequence:** Permission changes take effect at the next token refresh (not immediately). This is an acceptable trade-off for the operational responsiveness requirement.

### BD-003: Immutable Finance Records with Reversal-Only Corrections

**Decision:** Journal entries, invoice postings, payment records, SIE4 exports, AGI exports, and compliance certifications are append-only. Corrections create reversal entries; data is never deleted or updated in-place.  
**Rationale:** Swedish accounting law requires an immutable audit trail. Destructive edits to financial records create legal and audit risk.  
**Consequence:** The finance module is more complex to implement corrections in, but the integrity model is legally sound and auditable.

### BD-004: RLS as the Primary Tenant Isolation Mechanism

**Decision:** PostgreSQL Row-Level Security is the authoritative tenant isolation layer. Application-layer organization_id filtering is defence-in-depth, not the primary control.  
**Rationale:** RLS cannot be bypassed by application bugs, misconfigured Edge Functions, or accidental query construction errors. It is enforced by the database engine for every query.  
**Consequence:** All domain tables must have `organization_id` and a corresponding RLS policy. New tables that omit RLS create an isolation violation.

### BD-005: SECURITY DEFINER for Critical Business Mutations

**Decision:** Business-critical state transitions (invoice posting, period close, payroll journaling, fiscal year close) are wrapped in PostgreSQL `SECURITY DEFINER` functions that enforce all invariants atomically.  
**Rationale:** Prevents partial state (e.g. an invoice posted without a corresponding journal entry) from being possible at the application layer. The database enforces complete, valid transitions.  
**Consequence:** Business logic for critical operations lives in the database tier, not the Edge Function tier. This creates a tighter coupling between database migrations and Edge Function behaviour.

### BD-006: Token-Based Portal Access (No Auth Credentials Required)

**Decision:** Student Portal, Instructor Portal, and Guardian Portal use scoped access tokens, not Supabase Auth credentials.  
**Rationale:** Requiring driving-school students and guardians to create accounts creates friction and increases support burden. Secure tokens sent by the driving school give appropriate scoped access without onboarding overhead.  
**Consequence:** Portal sessions cannot be revoked mid-flight (only via token expiry). Token generation and delivery is the responsibility of the driving school.

### BD-007: Operational Responsiveness Over Architectural Purity

**Decision:** Where there is tension between architectural elegance and user-perceived performance, performance wins.  
**Rationale:** Driving school staff are operational users on tight time windows. Slow dashboards and multi-second load times are not acceptable.  
**Consequence:** Some patterns (aggregated dashboard RPC calls instead of normalised per-resource queries, non-blocking auth, TanStack Query aggressive stale-while-revalidate) are chosen for performance rather than purity.

### BD-008: Event Outbox for Reliable Async Processing

**Decision:** Domain events (slot generated, booking confirmed, invoice posted, etc.) are written to `event_outbox` within the same transaction as the triggering operation. A separate `event-worker` processes them asynchronously.  
**Rationale:** Ensures that events are never lost even if the downstream handler fails. Retries and dead-lettering are handled at the worker level, not at the business logic level.  
**Consequence:** Event processing is eventually consistent, not synchronous. Event handlers must be idempotent.

### BD-009: ComingSoonPage Instead of 404 for Unknown Authenticated Routes

**Decision:** Any authenticated route that does not match a known module renders `<ComingSoonPage>` within the AppShell, rather than a 404 or redirect to login.  
**Rationale:** During active development, new routes are added frequently. Redirecting to login on an unknown route would cause session loss for users visiting a route that has been added to the navigation but not yet deployed, or visiting a preview URL.  
**Consequence:** Authentication errors are never masked by this pattern (ProtectedRoute handles auth before the catch-all renders).

### BD-010: Claude Code as Primary Development Tool

**Decision:** All code generation, architecture decisions, and implementation work is performed through Claude Code (AI-assisted development). No raw SQL migrations are written manually; all changes go through structured prompts.  
**Rationale:** Ensures consistent code style, documentation, and adherence to architectural patterns. Enables rapid iteration while maintaining quality gates.  
**Consequence:** All future development must continue through Claude Code. Direct manual edits to the codebase should be minimised to maintain coherence.

---

## 11. Future Development Principles

The following rules govern all future development of this platform. They are binding on all contributors and all AI-assisted development sessions.

### Principles Inherited from the Foundation

**P-001: No architectural regressions.**  
Do not reduce the isolation model, weaken the auth model, or remove immutability guarantees from the finance layer. All changes must preserve or improve the existing architecture.

**P-002: Preserve multi-tenancy unconditionally.**  
Every new domain table must include `organization_id UUID NOT NULL` with a corresponding RLS policy. Every new Edge Function must call `buildEdgeContext()` and enforce `organizationId` on all queries. No exceptions.

**P-003: Preserve tenant isolation.**  
Data from one organization must never be readable or writable by another organization's session. RLS is the enforcer; the application layer is defence-in-depth only.

**P-004: Platform Admin never manages tenant operations directly.**  
The Platform Admin workspace manages the SaaS layer (subscriptions, tenant onboarding, audit). It does not create students, manage bookings, or interact with tenant-specific business data.

**P-005: Students, instructors, guardians, and companies are managed by driving schools — not by the Platform Admin.**  
These entities belong to the tenant layer. Platform admin visibility (if ever needed for support) must go through explicit, audited impersonation mechanisms.

**P-006: Finance records are immutable.**  
No migration, no Edge Function, and no admin operation may UPDATE or DELETE a posted journal entry, invoice, payment, SIE4 export, or compliance certification. Corrections always create reversals.

**P-007: Migrations are append-only.**  
Never edit a migration file after it has been applied to the hosted database. Create a new migration for every schema change. Migration names must follow `YYYYMMDDHHMMSS_description.sql`.

### Implementation Discipline

**P-008: Everything through Claude prompts.**  
No raw SQL written directly in a migration editor. No manual React component written without using Claude Code. Consistency and audit trail depend on AI-assisted generation going through structured prompts.

**P-009: No speculative features.**  
Do not implement features that are not operationally required or explicitly planned. Three similar lines is better than a premature abstraction. Do not design for hypothetical future requirements.

**P-010: No additional architecture layers beyond what exists.**  
The platform already contains advanced infrastructure. Do not introduce replay systems, PKI layers, distributed event buses, or additional caching layers unless there is a measured operational need.

**P-011: UI modernisation must never change business logic.**  
Visual improvements, layout changes, and UX refinements must not alter business workflows, data models, or permission requirements. A UI sprint is a UI sprint.

**P-012: TypeScript must pass at 0 errors before any commit.**  
Run `pnpm typecheck` before every commit. Zero tolerance for TypeScript errors in any package.

**P-013: Lint must pass at 0 errors before any commit.**  
Warnings are acceptable if pre-existing. New errors introduced by a change are not.

### Operational Reality

**P-014: Mobile-first for operational interfaces.**  
Instructors use phones. Reception staff use tablets. Finance admins use desktops. Design for all three simultaneously. Responsive breakpoints are not optional.

**P-015: Operational responsiveness over architectural purity.**  
When in doubt, choose the faster-feeling option. Aggregated queries, denormalized read models, and aggressive caching are acceptable when they serve operational speed.

**P-016: Swedish is permanent.**  
The platform is Swedish. All user-facing text is Swedish. All UI labels, error messages, and notifications are Swedish. No internationalisation framework. No language switcher.

**P-017: No console.log in source files.**  
All diagnostic output must go through the structured `logger` utility. Raw `console.log` is not permitted in `apps/web/src/` or `packages/`. Edge Functions use the structured logger in `supabase/functions/_shared/logger.ts`.

**P-018: No temporary files or debug artifacts in the repository.**  
No `*.json` response captures, no `0` binary files, no `test_*.sql` files. The working tree must be clean of non-code artifacts before any commit.

**P-019: Portal authentication boundaries are inviolable.**  
Student Portal, Instructor Portal, and Guardian Portal use token-based access. They must never be granted access to admin-scoped data. New portal routes must be designed with the principle of least privilege.

**P-020: SECURITY DEFINER for critical mutations.**  
Any new business mutation that must be atomic and enforce invariants (e.g. a new "void and re-invoice" operation, a new "close and roll-forward" operation) must be implemented as a PostgreSQL `SECURITY DEFINER` function, not as multi-step application code.

---

## 12. Release Information

| Field | Value |
|-------|-------|
| **Baseline Version** | v1.0 |
| **Release Date** | 2026-06-30 |
| **Git Branch** | `development/platform-maturity-v2` |
| **Git Tag** | `v1.0-baseline` *(pending approval — not yet created)* |
| **Supabase Project** | `ulgsndzfksphquqakelq` |
| **TypeScript Status** | CLEAN — 0 errors, 9/9 packages |
| **ESLint Status** | CLEAN — 0 errors, 68 pre-existing warnings |
| **Build Status** | PASSING |
| **Repository Hygiene** | CLEAN — no temp files, no debug artifacts |
| **Approval Status** | **Approved for baseline freeze — awaiting git tag creation** |

### Baseline Scope

This baseline (`v1`) represents:
- A complete multi-tenant SaaS architecture
- 6 implemented portals (Admin Workspace, Platform Admin, Student Portal, Instructor Portal, Instructor App, Guardian Portal)
- 2 public-facing surfaces (Public Catalog, Public Booking)
- 55 deployed Edge Functions
- 210+ database migrations
- Full Swedish accounting compliance layer (BAS 2020, VAT, SIE4, AGI, double-entry ledger)
- Complete scheduling engine with generation, booking, attendance, and waitlist
- Full commercial lifecycle (leads → enrollment → order → invoice → payment → reconciliation)
- Multi-channel communication (email, SMS) with template and rule management

### What This Baseline Is Not

This baseline does not include (planned for future sprints):
- Automated E2E test suite
- Stripe / Klarna / Swish payment integration at checkout
- Transportstyrelsen API integration
- AI-assisted schedule optimisation
- SMS provider live delivery (framework implemented, provider credentials and delivery testing pending)
- Lead conversion funnel analytics and instructor performance leaderboards
- Cohort / class learning analytics
- Multi-branch location-filtered reporting

---

*Prepared by: Chief Software Architect, TrafikskolaOS*  
*Reviewed by: Release Approval Board*  
*Status: Approved for baseline freeze*
