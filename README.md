# TrafikskolaOS

A Sweden-first, multi-tenant SaaS platform for driving schools (*trafikskolor*) — scheduling, students, instructors, finance, communication, and Swedish regulatory compliance (BAS 2020, VAT periods, SIE4, AGI) in one system.

**New to this repository?** Read `docs/MASTER_ARCHITECTURE_OVERVIEW.md` first — it's the actual entry point for understanding what this platform is and how it's structured. This README only gets you to a running app; it doesn't re-explain the product (see `docs/README.md` for the full documentation index).

---

## Technology Stack

- **Frontend:** React 19 + Vite, TypeScript (strict), Tailwind CSS, TanStack Query
- **Backend:** Supabase — PostgreSQL + Row-Level Security + Deno Edge Functions
- **Monorepo:** pnpm workspaces + Turborepo

## Repository Layout

```text
apps/web/          React 19 + Vite SPA (the admin/tenant platform)

packages/
  config/          Shared tsconfig.base.json
  types/           Domain types + DB-generated types
  ui/              Radix UI + Tailwind component library
  i18n/             i18next configuration (sv/en)
  utils/           Utilities, validators, loggers, errors
  validation/      Zod schemas
  api-core/        Repository/service infrastructure
  database/        DB schema utilities

supabase/
  functions/       Deno Edge Functions
  functions/_shared/  Shared Edge Function utilities
  migrations/      Append-only SQL migrations
  seed/            Bootstrap/demo data scripts
```

## Quick Start

This project uses **hosted Supabase** (project ref `ulgsndzfksphquqakelq`) — no local Docker stack is required for normal development.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in the real values, see below
pnpm --filter @platform/web dev                # → http://localhost:5173
```

Full setup, including the auth hook secret and hosted-project connection details: **`docs/DEPLOY.md`**.
Want a fully offline local Docker stack instead? See `docs/local-development.md` — optional, not needed for day-to-day work.

## Development Prerequisites

| Tool | Version |
|---|---|
| Node.js | `>=20.0.0` |
| pnpm | `>=9.0.0` (9.15.0 recommended) |
| Supabase CLI | latest (`npm install -g supabase`) |
| Docker Desktop | only if using the optional local stack |

## Build Commands

```bash
pnpm install      # install all workspace dependencies
pnpm typecheck    # typecheck every package — must be 0 errors before any commit
pnpm lint         # lint every package
pnpm build        # production build
pnpm dev          # start dev servers (turbo run dev)
```

## Documentation Index

Full index, categorized with a recommended reading order: **[`docs/README.md`](docs/README.md)**.

The essentials:

| Document | Purpose |
|---|---|
| `docs/MASTER_ARCHITECTURE_OVERVIEW.md` | What this platform is and how it's structured — start here |
| `docs/DEPLOY.md` | Setup, deployment, and pilot go-live runbook |
| `docs/AUTHENTICATION_ARCHITECTURE.md` | Session model, login/recovery/invitation/BankID flows |
| `docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` | Governance, ADRs, architecture freeze rules |
| `docs/operational-runbook.md` | Live operational state and troubleshooting |
| `CLAUDE.md` | Conventions for AI coding agents working in this repository |

## Support Documents

- `docs/ENVIRONMENT_VARIABLE_REFERENCE.md` — every environment variable, tabulated
- `docs/SECRETS_MANAGEMENT_GUIDE.md` — secret storage and rotation policy
- `docs/INTEGRATION_CONFIGURATION_GUIDE.md` — third-party integration setup (Resend, Stripe, BankID, ...)
- `docs/PLATFORM_FOUNDATION_CLOSURE.md` / `docs/PHASE_2_HANDOVER.md` / `docs/PHASE_2_KICKOFF.md` — current release status and roadmap
