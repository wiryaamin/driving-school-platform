# Documentation Index

**This file exists because `docs/` has 49 files and no other way to tell a current document from a superseded one.** Start here, not with a directory listing. For the full classification of every file (status, purpose, recommendation), see `docs/DOCUMENTATION_AND_REPOSITORY_READINESS.md`'s Documentation Inventory — this index is the short, navigable version of that.

## Start here, in order

1. `docs/MASTER_ARCHITECTURE_OVERVIEW.md` — what this platform is, before anything else
2. `../README.md` (repository root) — quick start, build commands
3. `docs/DEPLOY.md` — full setup, local + hosted + production
4. `docs/AUTHENTICATION_ARCHITECTURE.md` — session model, every auth flow
5. `docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` — governance, ADRs, what's frozen

## Architecture references (current, authoritative)

| Document | Covers |
|---|---|
| `MASTER_ARCHITECTURE_OVERVIEW.md` | System-level entry point |
| `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` | Governance, ADR catalogue, Version 1.0 Scope Freeze |
| `ARCHITECTURE_GOVERNANCE_AND_IMPLEMENTATION_RULES.md` | Rules for building against the frozen architecture |
| `AUTHENTICATION_ARCHITECTURE.md` | Session model, login/recovery/invitation/BankID |
| `CLAIMS.md` | JWT claim schema — the precise field-by-field contract |
| `EMAIL_ARCHITECTURE.md` | Auth email vs. application email, provider strategy |
| `CUSTOMER_PROVISIONING_ONBOARDING_ARCHITECTURE.md` | Commercial customer lifecycle, tenant onboarding |
| `IDENTITY_EVENT_TAXONOMY.md`, `IDENTITY_EVENT_WRITER_CONTRACT.md`, `IDENTITY_RETENTION_STRATEGY.md`, `IDENTITY_SECURITY_ROLLBACK_STRATEGY.md` | ADR-007's Identity & Security Event Store — naming, write contract, retention, rollback |
| `DEVELOPMENT_IMPLEMENTATION_PLAYBOOK.md` | How work gets done against the frozen architecture |
| `DESIGN_LANGUAGE_SPECIFICATION.md`, `UI_LAYOUT_CONTRACTS.md`, `USER_JOURNEY_SPECIFICATION.md` | Frontend design system, layout, navigation contracts |

## Operational references (current)

| Document | Covers |
|---|---|
| `DEPLOY.md` | Setup and deployment runbook |
| `local-development.md` | Optional offline local Docker stack |
| `operational-runbook.md` | Live operational state, troubleshooting |
| `ENVIRONMENT_VARIABLE_REFERENCE.md` | Every env var |
| `SECRETS_MANAGEMENT_GUIDE.md` | Secret storage/rotation |
| `INTEGRATION_CONFIGURATION_GUIDE.md` | Third-party integration setup |
| `INTEGRATION_STATUS_REGISTER.md` | Live status of every integration (kept current, check its own "last updated" line) |

## Current release status & roadmap

| Document | Covers |
|---|---|
| `PLATFORM_FOUNDATION_CLOSURE.md` | Foundation freeze record (point-in-time, Sprint 4C) |
| `PHASE_2_HANDOVER.md` | Repository/release/operational readiness (living reference) |
| `PHASE_2_KICKOFF.md` | Business domain roadmap and sprint plan |
| `VERSION_1.1_ROADMAP.md` | The underlying product roadmap `PHASE_2_KICKOFF.md` reactivated |
| `NEW_DEVELOPER_ONBOARDING_VALIDATION.md` | Onboarding audit that produced this index |
| `DOCUMENTATION_AND_REPOSITORY_READINESS.md` | This sprint's full report — inventory, hygiene, pilot readiness |

## Known superseded / historical — read the current version instead

| Superseded document | Current version |
|---|---|
| `PILOT.md` | Stale in places (e.g. Student Portal listed as not built — it is). Treat as historical, cross-check against `PHASE_2_KICKOFF.md`'s Business Domain Inventory for current status |
| `PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` | Self-marked superseded at the top of the file — read the banner |
| `VERSION_1.1_ROADMAP.md` §9 | Superseded by the Pilot Readiness Assessment, reactivated by `PHASE_2_KICKOFF.md` — Sections 1–8 are still the live content |
| `LANDING_PAGE_STRATEGY.md` → `_V2_PLATFORM_POSITIONING.md` → `_V3_BUSINESS_OPERATING_PLATFORM.md` | `LANDING_PAGE_STRATEGY_V4_FINAL_BLUEPRINT.md` |
| `LANDING_PAGE_FINAL_DESIGN_DIRECTION.md` (composition sections) | `LANDING_PAGE_FINAL_DESIGN_DIRECTION_V2.md` |
| `LANDING_PAGE_HERO_DESIGN_SPRINT_01.md`, `LANDING_PAGE_HERO_DESIGN_CHALLENGE.md`, `LANDING_PAGE_HERO_HIGH_FIDELITY_DESIGN.md` | `LANDING_PAGE_HERO_IMPLEMENTATION_REPORT.md` (what actually shipped) |
| `LANDING_PAGE_CREATIVE_BLUEPRINT.md` | Early-stage draft, largely absorbed into the Strategy chain above |

## Historical / point-in-time records (not living documents — don't edit, don't treat as current state)

`phase1b4-review.md`, `LANDING_PAGE_SCREENSHOT_ASSET_STRATEGY.md`, `LANDING_PAGE_SCREENSHOT_PRODUCTION_GUIDE.md`, `LANDING_PAGE_MESSAGING_STRATEGY.md`, `LANDING_PAGE_VISUAL_DESIGN_EXPLORATION.md`, `GAP_IMPLEMENTATION_PLAN.md` (a large future-feature backlog — 51 unstarted items, none of them pilot blockers; see `DOCUMENTATION_AND_REPOSITORY_READINESS.md` Phase 6 for why this is explicitly *not* treated as missing implementation), `PRODUCTION_ENVIRONMENT_PREPARATION.md`, `UI_MODERNIZATION_ROADMAP.md`.

## Frozen governance specs

`MARKETING_DEMO_ORGANIZATION_SPECIFICATION.md`, `MARKETING_DEMO_IMPLEMENTATION_ARCHITECTURE.md`, `PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md` — approved, changes require the formal revision process each document names, not incremental editing.

## Website integration documentation (two documents, deliberately not merged)

| Document | Covers |
|---|---|
| `WEBSITE_INTEGRATION_SERVICES_PRODUCT_SPECIFICATION.md` | Approved Version 1.0 product scope for tenant-website integration services — target, not build status |
| `WEBSITE_FEATURE_INTEGRATION_CATALOGUE.md` | Current implementation status of tenant-website integration, verified feature by feature against the codebase |

`WEBSITE_INTEGRATION_SERVICES_SPECIFICATION.md` no longer exists — superseded by `WEBSITE_INTEGRATION_SERVICES_PRODUCT_SPECIFICATION.md` above (same content, corrected filename).
