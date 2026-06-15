# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# What This Is

A Sweden-first multi-tenant SaaS platform for driving schools (trafikskolor).

Frontend:

* React 19 + Vite SPA

Backend:

* Supabase
* PostgreSQL
* RLS
* Deno Edge Functions

The platform supports:

* driving school operations
* scheduling
* students
* instructors
* finance
* accounting
* communication
* reporting
* onboarding
* organization management
* automation

Swedish is the primary operational UI language.

The platform implements Swedish accounting and compliance requirements:

* BAS 2020 chart of accounts
* VAT period tracking
* SIE4 export
* AGI payroll declarations
* immutable append-only double-entry ledger

The platform is NOT intended to become:

* a generic ERP
* a global compliance framework
* a forensic replay platform
* a cryptographic archival research system

Operational usability and responsiveness are primary product goals.

---

# Current Strategic Project Phase

The backend infrastructure is already highly advanced and stable.

The project is now in:

PRODUCTIZATION & FRONTEND OPERATIONAL MATURITY PHASE

Current priorities:

* frontend usability
* operational responsiveness
* scheduling UX
* mobile responsiveness
* dashboard quality
* onboarding UX
* SaaS usability
* workflow efficiency

NOT:

* additional replay infrastructure
* speculative scalability systems
* excessive architectural abstraction
* unnecessary backend sophistication

---

# Core Product Philosophy

## Sweden-First Architecture

This platform is focused specifically on Swedish driving schools.

Requirements align with:

* Swedish accounting
* BAS chart of accounts
* Swedish VAT rules
* SIE4 exports
* AGI payroll reporting
* Swedish operational workflows

Avoid unnecessary international ERP abstractions unless explicitly required.

---

## Multi-Tenant SaaS First

Every trafikskola operates in an isolated workspace.

All business entities must support:

* organization isolation
* tenant-aware RBAC
* organization-specific reporting
* organization-specific finance
* organization-specific scheduling
* organization-specific workflows

Every domain table must enforce tenant isolation.

---

## Operational-First UX

The platform must optimize for:

* fast scheduling workflows
* low-click operations
* responsive dashboards
* mobile-friendly usage
* instructor workflows
* receptionist/admin workflows
* finance workflows
* operational visibility

Prioritize:

* operational clarity
* fast perceived responsiveness
* predictable UX
* touch-friendly interactions
* incremental refinement

over architectural novelty.

---

# Commands

```bash
# Install
pnpm install

# Web app (dev server at http://localhost:5173)
pnpm --filter @platform/web dev

# Type check all packages (run this before every commit)
pnpm typecheck

# Lint
pnpm lint

# Build all
pnpm build

# Apply new migrations to the hosted Supabase project
# (requires: supabase link --project-ref <project-ref> first)
supabase db push --linked

# Deploy Edge Functions to hosted Supabase
supabase functions deploy --project-ref <project-ref>

# Bootstrap first org + admin (run in Dashboard → SQL Editor, or via psql with the
# production connection string from Dashboard → Settings → Database)
# Edit v_user_id and v_user_email in the file first.
# supabase/seed/bootstrap_org_admin.sql
```

---

# Hosted Supabase Setup

This project uses **hosted Supabase** (not a local Docker stack).
The project ref is: `ulgsndzfksphquqakelq`

## apps/web/.env.local

```env
VITE_SUPABASE_URL=https://ulgsndzfksphquqakelq.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key from Dashboard → Settings → API>
VITE_APP_ENV=development
```

## supabase/functions/.env

Secrets for local Edge Function development (gitignored):

```env
AUTH_HOOK_SECRET=v1,whsec_<base64 from openssl rand -base64 32>
WORKER_SECRET=<any-random-string>
```

For the hosted project, secrets are set via:
```bash
supabase secrets set AUTH_HOOK_SECRET="v1,whsec_<key>" WORKER_SECRET="<key>" \
  --project-ref ulgsndzfksphquqakelq
```

## Auth Hook (hosted)

The custom access token hook must be configured in:
Dashboard → Authentication → Hooks → Custom Access Token Hook

- **URI:** `https://ulgsndzfksphquqakelq.supabase.co/functions/v1/auth-hook`
- **Secret:** same `v1,whsec_<key>` as `AUTH_HOOK_SECRET`

The auth hook adds `organization_id`, `role`, `permissions`, and `is_platform_admin`
to every JWT. If it is not configured or the secret is wrong, users will be
redirected to the login page in a loop (JWT has no custom claims).

---

# Dashboard Architecture

The platform contains TWO major dashboard layers.

## 1. Platform Owner Dashboard (Super Admin)

Used by the SaaS platform owner.

Responsibilities include:

* trafikskola onboarding
* subscription management
* tenant lifecycle management
* platform-wide analytics
* support operations
* billing oversight
* feature management
* integration management
* system monitoring
* announcements
* audit visibility

Platform admins bypass tenant isolation where explicitly permitted.

---

## 2. Trafikskola Dashboard (Tenant Workspace)

Each trafikskola operates inside its own isolated workspace.

Each trafikskola has:

* isolated users
* isolated scheduling
* isolated students
* isolated finance
* isolated instructors
* isolated reports
* isolated communication
* isolated documents

All functionality must respect:

* organization isolation
* tenant RBAC
* organization-specific workflows
* organization-specific reporting

---

# Unified Trafikskola Functional Structure

## Top Navigation & Header

* Dashboard Home
* Mitt schema (My Schedule)
* User Profile
* Notifications
* Messages
* Search
* Calendar / Week View
* Quick Menu
* Greeting Banner

---

# Core Operational Modules

## 1. Customer & Student Management

* Kunder
* Elever
* Företagskunder
* Klasslista
* Elevlistor
* Kundekonomi
* Avtal
* Fakturauppgifter
* Dokumentarkiv

---

## 2. Booking & Scheduling System

One of the highest-priority operational areas.

Includes:

* Mitt schema
* Bokningsschema
* Bokningar
* Bokningslista
* Väntelista
* Kursöversikt
* Trafikövningsplats
* Övningskörning

Calendar requirements:

* weekly calendar view
* instructor-aware scheduling
* touch-friendly interaction
* mobile responsiveness
* fast slot rendering
* low-latency interactions

Standard slot intervals:

* 07:00 – 08:30
* 08:30 – 10:00
* 10:00 – 11:30
* 12:00 – 13:30
* 13:30 – 15:00
* 15:00 – 16:30

---

## 3. Communication & Collaboration

* Kommunikation
* Chatta
* Feedback Portal
* Notifications
* Internal Messaging
* Bevakningar
* Loggar

---

## 4. Finance & Accounting

* Fakturering
* Kundekonomi
* Payments
* Transactions
* Financial Reports
* Receipt Management
* Economic Overview Dashboard

Swedish accounting compliance is mandatory.

---

## 5. Reports & Analytics

* Rapporter
* KPI Dashboard
* Booking Statistics
* Student Progress Tracking
* Revenue Analysis

---

## 6. Educational & Learning Tools

* Körkortsfrågor
* Material
* Evenemang & Kurser
* Course Management
* Student Assignments

---

## 7. Staff & Instructor Management

* Personal
* LärarApp
* Instructor Scheduling
* Attendance Tracking
* Staff Permissions & Roles

---

## 8. System Administration

* Inställningar
* Systeminställningar
* User & Role Management
* Nyheter / TABSnytt
* Favorites
* Notification Preferences

---

## 9. External Services & Integrations

* TABSwebb
* TABSnytt
* TeamViewer
* TC Shoppen
* Facebook-gruppen
* Third-party integrations

---

## 10. Support & Customer Service

* Hjälpcenter
* Ändringslogg
* Support Chat
* Contact Support
* Phone Support

---

# Recommended SaaS Navigation Structure

Primary sidebar navigation:

* Dashboard
* Students & Customers
* Bookings & Calendar
* Courses & Training
* Finance
* Reports & Analytics
* Communication
* Staff & Instructors
* Documents
* Settings
* Support

---

# Productization & Implementation Discipline

Implementation must remain:

* incremental
* measurable
* operationally validated
* performance-aware

Avoid:

* giant mega-prompts
* uncontrolled scope expansion
* speculative architecture
* unnecessary abstraction layers
* unnecessary infrastructure expansion

Preferred workflow:

1. analyze
2. identify measurable bottleneck or UX gap
3. implement focused improvement
4. validate operationally
5. measure impact
6. iterate

Do NOT implement massive multi-domain rewrites in one phase.

---

# Performance & Responsiveness Principles

Performance is a first-class product requirement.

The application should feel:

* fast
* responsive
* operationally lightweight

Avoid:

* N+1 query patterns
* excessive dashboard overfetching
* provider over-rendering
* oversized route bundles
* sequential async chains
* excessive realtime subscriptions
* unnecessary query invalidation

Prefer:

* batched requests
* aggregated dashboard endpoints
* parallel async execution
* lazy loading
* responsive loading states
* mobile-friendly rendering behavior

User-perceived responsiveness is more important than theoretical architectural purity.

---

# Anti-Overengineering Guardrails

The platform already contains advanced infrastructure for:

* RBAC
* finance
* auditability
* scheduling
* immutable accounting
* event processing

Do NOT introduce additional complexity unless there is a measurable operational need.

Avoid unnecessary expansion of:

* replay systems
* PKI infrastructure
* deterministic reconstruction systems
* speculative scalability layers
* excessive infrastructure abstraction chains

Stable backend systems should remain stable unless a measurable operational issue exists.

---

# Monorepo Layout

```text
apps/web/          React 19 + Vite SPA (admin platform)

packages/
  config/          Shared tsconfig.base.json
  types/           Domain types + DB-generated types
  ui/              Radix UI + Tailwind component library
  i18n/            i18next configuration
  utils/           Utilities, validators, loggers, errors
  validation/      Zod schemas
  api-core/        Repository/service infrastructure
  database/        DB schema utilities

supabase/
  functions/       Deno Edge Functions
  functions/_shared/ Shared Edge Function utilities
  migrations/      Append-only SQL migrations
  seed/            Bootstrap/demo scripts
```

---

# Frontend Architecture

## Path Aliases

Defined in:

apps/web/vite.config.ts

| Alias                  | Resolves to                        |
| ---------------------- | ---------------------------------- |
| `@/`                   | `apps/web/src/`                    |
| `@app/`                | `apps/web/src/app/`                |
| `@core/`               | `apps/web/src/core/`               |
| `@modules/`            | `apps/web/src/modules/`            |
| `@shared/`             | `apps/web/src/shared/`             |
| `@platform/ui`         | `packages/ui/src/index.ts`         |
| `@platform/types`      | `packages/types/src/index.ts`      |
| `@platform/i18n`       | `packages/i18n/src/index.ts`       |
| `@platform/utils`      | `packages/utils/src/index.ts`      |
| `@platform/validation` | `packages/validation/src/index.ts` |

---

## Provider Stack

ThemeProvider → I18nProvider → QueryProvider → AuthProvider

AuthProvider:

* subscribes to Supabase auth state
* decodes JWT
* populates session context
* handles organization-aware session state

JWT contains:

* organization_id
* role
* permissions[]
* is_platform_admin

---

## Routing

All authenticated routes are wrapped in:

<ProtectedRoute>

Unauthenticated users redirect to:

/auth/login

Modules are lazy-loaded where operationally appropriate.

Unknown authenticated routes render:

<ComingSoonPage>

inside AppShell instead of 404.

---

## Module Structure

Each module under:

apps/web/src/modules/<name>/

follows:

```text
routes/      Route-level components
components/ Reusable UI components
hooks/      React Query hooks
lib/        Pure utilities
index.ts    Public exports
```

---

## Frontend Priorities

Current frontend priorities:

1. application shell stability
2. scheduling UX
3. responsive/mobile layouts
4. dashboard responsiveness
5. student workflows
6. instructor workflows
7. finance usability
8. onboarding experience
9. organization management UX

Avoid:

* speculative frontend frameworks
* unnecessary state-management complexity
* over-abstracted component hierarchies
* premature micro-frontend architecture

---

# State Management

## Server State

TanStack Query v5.

Query keys follow hierarchical factory patterns.

Examples:

```ts
studentKeys.list(params)
studentKeys.detail(id)
```

Default list query pagination:

```ts
per_page = 25
```

NOT 100.

---

## Auth & Session State

* AuthProvider is the single source of truth
* useSession() should not trigger extra profile fetches

---

## UI State

* useState for local UI state
* Zustand only for justified shared state

Avoid unnecessary global state systems.

---

# Permission Gating

Frontend:

```tsx
<PermissionGate permission="domain:resource:action">
```

Backend:

```ts
requirePerm(ctx, 'domain:resource:action')
```

Platform admins bypass permission checks where explicitly intended.

Permission definitions live in:

packages/types/src/rbac.types.ts

---

# Edge Function Architecture

All Edge Functions live in:

supabase/functions/<name>/index.ts

Shared utilities exist in:

supabase/functions/_shared/

Edge Functions must:

* enforce RBAC
* enforce organization isolation
* preserve operational responsiveness
* avoid unnecessary query chains

---

## Key Shared Utilities

* buildEdgeContext(req)
* createSupabaseClient(req)
* successResp()
* errorResp()
* requirePerm()
* handleCors()
* logger

---

## Standard Edge Function Shape

```ts
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  const result = await buildEdgeContext(req);

  if (!result.ok) return result.response;

  const { ctx } = result;

  // route by method/path
});
```

---

## Zod in Edge Functions

Import directly from:

```ts
npm:zod@3
```

Do NOT import workspace packages into Deno functions.

---

# Database Conventions

## Multi-Tenancy

Every domain table must include:

```sql
organization_id UUID NOT NULL
```

All queries must respect tenant isolation.

---

## Soft Deletes

Use:

```sql
deleted_at TIMESTAMPTZ
```

Avoid hard deletes for operational records.

Always add:

```sql
deleted_at IS NULL
```

filters where appropriate.

---

## Immutable Records

Finance and compliance records are append-only.

Do NOT update:

* journal entries
* invoice entries
* SIE4 exports
* compliance snapshots

---

## Event Outbox

Domain events are written to:

event_outbox

Processed by:

event-worker Edge Function.

---

## SECURITY DEFINER Functions

Business-critical mutations use SECURITY DEFINER SQL functions.

Examples:

* invoice posting
* journal posting
* financial period close
* payroll operations

---

## Migrations

Migrations are append-only.

Never edit historical migrations after stabilization.

Always create new migrations.

Naming convention:

```text
YYYYMMDDHHMMSS_description.sql
```

---

# TypeScript Conventions

Shared TS config:

packages/config/tsconfig.base.json

Enabled strictness includes:

* noUncheckedIndexedAccess
* exactOptionalPropertyTypes
* noImplicitOverride

All packages must pass:

```bash
pnpm typecheck
```

before completion.

---

# Finance & Compliance Layer

The finance layer enforces:

* double-entry accounting
* BAS account structure
* VAT integrity
* immutable journal posting
* SIE4 deterministic exports
* Swedish accounting rules

These systems are highly sensitive.

Do NOT casually refactor accounting chains.

---

## Ledger

* immutable journal entries
* BAS 2020 accounts
* append-only posting
* reversal-based correction model

---

## Invoices

* gap-free numbering
* append-only
* voiding creates reversals
* no destructive deletion

---

## VAT

* Swedish VAT periods
* monthly/quarterly support
* VAT clearing accounts

---

## SIE4

* deterministic exports
* SHA-256 validation
* replay-safe generation

---

## Payroll / AGI

* employer contribution calculations
* AGI exports
* Swedish payroll compliance

---

# Auth & JWT

Auth hook:

supabase/functions/auth-hook/

JWT claims include:

* organization_id
* role
* permissions
* subscription_tier
* is_platform_admin

JWT is the primary authorization context.

Avoid redundant profile fetches.

---

## Tenant Switching

Handled via:

supabase/functions/switch-tenant/

Must:

* validate membership
* refresh claims
* preserve organization isolation

---

# Mobile & Operational Usage Reality

Many workflows are mobile-first.

The platform must work effectively for:

* instructors on mobile/tablet
* reception staff scheduling rapidly
* finance/admin users
* organization owners reviewing dashboards

Frontend implementations should consider:

* responsive layouts
* touch ergonomics
* network efficiency
* calendar responsiveness
* mobile navigation
* operational speed

---

# Future Roadmap (Long-Term)

Potential future modules:

* Mobile App Integration
* AI-based Schedule Optimization
* SMS & WhatsApp Notifications
* Online Student Portal
* E-signature for Contracts
* Vehicle & Fleet Management
* Digital Attendance Tracking
* Multi-branch Management
* Stripe / Klarna / Swish Integration
* Automated Reminders & Billing
* Swedish Transport Agency Integration

These are roadmap items, not immediate implementation requirements.

---

# Current Strategic Success Metric

The platform is evaluated primarily on:

* operational usability
* scheduling efficiency
* responsiveness
* onboarding quality
* dashboard quality
* SaaS readiness
* workflow efficiency

NOT infrastructure sophistication depth.
