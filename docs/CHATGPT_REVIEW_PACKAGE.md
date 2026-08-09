# Independent Architectural Review Package

**Purpose of this document:** everything an independent reviewer needs to critically assess TrafikskolaOS's pilot readiness, without needing to trust my (the preceding AI session's) conclusions. This is not a sales document. It is not a defense of prior decisions. Where something is weak, incomplete, or genuinely uncertain, it is stated as such directly. **If you disagree with a conclusion below, that is the intended outcome of reading this, not a failure of the document.**

Companion document `docs/VERSION1_OPERATIONAL_VALIDATION_MASTER_REPORT.md` contains the full evidence trail (screenshots, HTTP responses, database queries) behind every operational claim made here. This document does not repeat that evidence — it gives you the context to interpret it and the specific places to push back.

---

## 1. Executive Overview

TrafikskolaOS is a Sweden-first, multi-tenant SaaS platform for driving schools. One codebase, one Supabase backend, serving many independent organizations (tenants) with row-level data isolation. It handles the full operational surface of running a driving school: scheduling, student/guardian/instructor management, Swedish-compliant accounting (BAS 2020, VAT, SIE4, AGI), invoicing/payments, communication, and a public marketing site with self-service demo requests. It also has token-based self-service portals for students and session-based portals for instructors.

The platform is currently pre-pilot. This review package exists because a structured operational validation effort (browser-driven, evidence-based, not code review) found the platform substantially working but with real, specific gaps — two of which were confirmed Critical defects (now fixed), one of which is a genuinely missing capability with no engineering fix yet decided upon.

## 2. Current Implementation Status

Per the platform's own module inventory, essentially the entire Version 1 feature surface has code written for it — the honest caveat is that "has code written" and "has been operationally proven to work" are different claims, and this review package's whole purpose is to keep those claims separate. Section 10 of the Master Report gives the precise validated/pending breakdown. In short: authentication, platform administration, user/role management, and student creation are proven. The commercial transaction chain (booking, invoicing, payment, documents) is **not** — it has code, it has not been operationally exercised.

## 3. Pilot Architecture

Single active environment — one hosted Supabase project (`ulgsndzfksphquqakelq`) serves everything: existing real customers (42 organizations at last count) and this validation's own test tenant, side by side, isolated by row-level security, not by separate infrastructure. There is no separate staging/pilot backend. This was a decision made earlier in this platform's history (before this review's session), reportedly to avoid environment-duplication overhead — **you should form your own view on whether that's the right call for a platform about to onboard its first real external pilot customer onto the same infrastructure serving pre-existing accounts.**

## 4. Technology Stack

- **Frontend:** React 19, Vite, TypeScript (strict mode — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` enabled), Tailwind CSS, TanStack Query, Zustand (for narrowly-scoped shared state only).
- **Backend:** Supabase — PostgreSQL with Row-Level Security as the primary tenant-isolation mechanism, Deno Edge Functions (~55+ deployed) for business logic, Supabase Auth (GoTrue) for authentication.
- **Monorepo:** pnpm workspaces + Turborepo, shared packages for types/validation/UI components/utilities.

## 5. Multi-Tenant Architecture

Every domain table carries `organization_id`; RLS policies are the authoritative isolation control (not an application-layer filter alone). JWT claims (issued by a custom auth hook) carry `organization_id`, `role`, `permissions`, and `is_platform_admin` — authorization decisions are made from the JWT, not from a follow-up database query, which keeps the model fast but also means the JWT-issuing hook is a genuine single point of correctness for the entire authorization system. **I have not independently re-audited every RLS policy in this review** — I'm relying on this platform's own earlier architecture-review work for that claim, which is exactly the kind of secondhand confidence this review package should flag, not launder into a first-person assertion.

Notably: `profiles` (user profile data) is explicitly **not** tenant-scoped by `organization_id` — a deliberate architectural choice (a user profile is global; tenant membership is a separate `memberships` table). **This exact design point is what caused both Critical defects found in this validation** (two different frontend pages queried `profiles` as if it still had that column, which it hasn't since an earlier migration). This is worth your explicit attention: a correct, deliberate architectural decision that nonetheless produced two real defects because two pieces of frontend code didn't keep up with it. That's a maintainability signal worth weighing, not just a "found and fixed, move on" data point.

## 6. Authentication and Authorization Model

Email/password login (Supabase Auth), BankID (fully built, deliberately not activated for Version 1 — no relying-party certificate in this environment), password recovery, and invitation-based account creation, all converging on one session model (a single `AuthProvider` component syncing Supabase's auth state to a Zustand store). Authorization is RBAC via role-permission grants, enforced both at the Edge Function layer (`requirePerm()`) and at the database layer (RLS).

**Two real, confirmed gaps exist in the default role-permission grants** (not in the mechanism — the mechanism works correctly; the specific grants are incomplete): `receptionist` and `instructor` roles both lack `notifications:notification:read` and `instructors:instructor:read`. Neither was previously known before this validation found them. **A reviewer should ask: how were the default role-permission grants originally decided, and is there a process to catch omissions like this systematically, or were these two found only because a validation effort happened to exercise exactly the right pages?** I don't have a confident answer to that question.

## 7. Database Architecture

PostgreSQL via Supabase, RLS-first tenant isolation, soft deletes (`deleted_at`) over hard deletes for operational records, append-only/immutable design for finance and compliance tables (journal entries, invoices, SIE4 exports — corrections are reversals, not edits). Migrations are append-only SQL files, never edited after the fact.

**I have not operationally validated the finance/compliance tables' immutability guarantees in this review round** — that's asserted architecture, not something this validation effort tested by, for example, attempting to mutate a posted journal entry and confirming it's rejected. If that guarantee matters to your assessment (and for a system claiming Swedish regulatory compliance, it should), **that's a real, unverified claim, not a confirmed one, as far as this specific review package is concerned.**

## 8. Edge Functions Overview

~55+ Deno Edge Functions, one per domain area (students, instructors, invoices, ledger, scheduling, etc.), following a consistent pattern: build a request context from the JWT → enforce a required permission → validate input with Zod → perform the database operation (often via a `SECURITY DEFINER` Postgres function for business-critical mutations) → return a canonical `{code, message, trace_id, request_id}` error shape or a `{data: ...}` success shape. Rate limiting is applied per-function, tiered (public/authenticated/write/platform-admin).

**A known, previously-documented platform characteristic, not something this review discovered:** newly-deployed Edge Functions on this specific hosted project intermittently 404 at the gateway level (~50–60% single-attempt failure rate observed on freshly deployed functions in earlier phases of this engagement) — not a code defect, a gateway-routing characteristic of this project. A shared client-side retry utility exists to compensate. **Worth your scrutiny: is this actually resolved/mitigated, or is it a standing operational risk that happens not to have bitten a pilot customer yet purely by chance?**

## 9. Frontend Architecture

Module-based structure (`apps/web/src/modules/<domain>/{routes,components,hooks,lib}`), path aliases, lazy-loaded routes, shared UI component library (`@platform/ui`, Radix + Tailwind). Server state via TanStack Query with hierarchical query-key factories; local UI state via `useState`; shared state via Zustand only where actually justified (session, not general-purpose global state).

**Two frontend files (both now fixed) queried a table using a column that had been removed from the schema, and this was not caught until a live browser test found it.** TypeScript's static checking does not catch this class of error — Supabase queries are effectively stringly-typed at the column-filter level in the code style this platform uses, and the generated database types (`database.types.ts`) were not being leveraged strictly enough to prevent it. **This is a real, structural gap in this platform's defect-prevention story, not a one-off.** A reviewer should ask whether there's a systematic way to prevent "query references a column that doesn't exist" other than "hope a browser test finds it," because right now, that's what actually caught it, twice.

## 10. Operational Validation Completed

Real browser automation (Playwright/Chromium) against the real running application and real hosted backend. Validated: Platform Administrator (login, dashboard), Organization Owner (login, dashboard, org settings, Users, Roles — full regression pass), Receptionist (student creation, portal-access generation), Student (portal login and dashboard), Public Visitor (site browsing, demo form rendering/validation). Full detail and evidence: Master Report §5.

## 11. Remaining Operational Validation

Not yet done, explicitly not claimed as working: the entire commercial transaction chain (package sale, booking creation/reschedule/cancel, invoice issuance, payment registration, document upload), Instructor's substantive workflows (lesson completion, assigned students — blocked behind a missing setup step), Student Portal's booking/package/history sub-views, Branch Manager's own login, and any cross-role data-consistency check. Full detail: Master Report §10.

**This is, in my assessment, the single most important thing for a reviewer to weigh:** the parts of the platform proven to work are largely administrative/setup functions. The parts that are a driving school's actual day-to-day business — booking a lesson, invoicing a customer, taking a payment — are unproven. I don't think this means they're broken. I think it means nobody should currently claim confidence about them either way, and I'm flagging that explicitly rather than letting the parts that *are* proven create a halo effect over the parts that aren't.

## 12. All Open Defects

Full register with evidence: Master Report §7. Summary:

- **DEF-001, DEF-006** (Critical, both **Fixed**): two independent instances of the same defect class — a frontend query referencing a database column that doesn't exist. Both found via live testing, both fixed, both regression-verified.
- **DEF-002** (unclassified severity, **Open**): Guardian creation is not implemented anywhere in the UI. Three consistent "Coming Soon" labels suggest this was a deliberate prior decision, not an oversight — but I did not find any documentation of that decision anywhere in this engagement's tracked backlog before this validation surfaced it directly, which itself is worth noting.
- **DEF-003, DEF-005** (Low-Medium, **Open, flagged not fixed**): two role-permission grant gaps.
- **DEF-004** (High business impact, **not code-fixable**): inviting new staff fails due to unconfigured production email.

## 13. All Open Risks

Full assessment with ratings and reasoning: Master Report §8. The two I'd want an independent reviewer to weigh most heavily, because they're **not** primarily about this validation's own findings:

- **Critical: no database backups, point-in-time recovery disabled**, confirmed live, on a production database holding 42 real organizations' data. This is not a validation finding — it predates this review — but it's the largest single risk touching this platform, and it would be dishonest for a "risk assessment" section to soft-pedal it just because it isn't this validation effort's own discovery.
- **High: the repository itself has diverged from its main branch and has substantial uncommitted work.** The codebase's actual current state exists, as far as I can determine, only in a local working tree.

## 14. Known Technical Debt

- No automated end-to-end test suite. Every defect in this engagement's validation work was found through deliberate, manual, ad hoc scripted investigation — effective, but not repeatable as a regression gate without a human (or an AI session) choosing to re-run it.
- The `database.types.ts` generated types are described elsewhere in this platform's own documentation as stale, with a number of `as unknown as any` casts as a workaround — plausibly related to why a query against a removed column wasn't caught statically.
- A documented, standing observability-coverage gap: roughly 21 Edge Functions have "commingled" correlation/logging plumbing not yet cleanly separated, and a further set have no canonical error-schema coverage yet. Not discovered by this review; carried forward from this engagement's own prior tracking.

## 15. Version 1 Scope Freeze

This platform operates under a documented Scope Freeze: new work must be classified as Pilot Blocker / Commercial Release Enhancement / Version 1.1 Backlog before it's actioned. I've followed that process for this review's own findings (DEF-002 is explicitly presented unclassified, for exactly this reason) rather than either quietly building the missing feature or quietly declaring it out of scope myself. **A reviewer should decide independently whether that restraint was the right call, or whether a missing core capability found during pilot validation should simply have been fixed regardless of process.**

## 16. Deferred Version 1.1 Items

Explicitly out of scope for this entire review effort, not evaluated in any way: Stripe/Klarna/Swish checkout, BI reporting, tenant impersonation, multi-branch aggregate reporting, Transport Agency API integration, deeper Fortnox/Visma/Google Calendar/Microsoft 365 integrations, AI-based scheduling. If any of these matter to your assessment of pilot readiness, they have not been considered at all here.

## 17. Current Pilot Blockers

- **Guardian creation (DEF-002)** — pending a classification decision that has not yet been made.
- **Production email / SMTP (DEF-004 and prior)** — a known, unresolved operational dependency, now confirmed to affect three distinct workflows.
- **Database backups** — arguably the most severe item on this entire list, and not primarily a "pilot" blocker at all — it's a standing production risk independent of whether a pilot happens.

## 18. Questions That Should Be Challenged By The Reviewer

1. Is it actually acceptable to run a pilot customer on the *same* production Supabase project as 42 existing real organizations, with no backups, before backups are enabled? I would push back hard on this myself if I were reviewing it.
2. The "single active environment" architectural decision predates this review. Was it re-examined with pilot-onboarding risk specifically in mind, or is it being carried forward on inertia?
3. Two instances of the identical defect class were found by luck of which pages a validation session happened to exercise. **Is there reason to believe there isn't a third, still-undiscovered instance?** I have no basis to say there isn't.
4. The role-permission gaps (DEF-003, DEF-005) were found the same way — incidentally, not systematically. Same question applies to the permission-grant surface generally.
5. Guardian creation's absence was apparently never previously flagged in this engagement's tracked backlog, despite three consistent UI-level "Coming Soon" labels that suggest someone, at some point, made that call deliberately. **Where did that decision actually get made, and does it hold up under a second look, or was it simply never revisited?**
6. Given the unproven commercial chain (Section 11), is there any basis at all — beyond "the rest of the platform worked" — for optimism about booking/invoicing/payments specifically? I'd want a reviewer to resist the halo effect here as much as I've tried to in writing this.

## 19. Areas Where I Am Least Confident

- **The entire commercial transaction chain.** Zero operational evidence either way. My genuine internal confidence here is close to neutral, not "probably fine" — I want to be explicit that I don't have a informed opinion to offer, only an absence of data.
- **Whether the two RBAC permission gaps found are the only ones.** I checked two specific permissions because two specific defects surfaced them. I did not audit the full permission grant matrix.
- **The real severity of DEF-002 (Guardian creation) for an actual pilot customer.** I don't know how central guardian portal access is to any specific pilot school's actual day-one needs — that's a business fact I don't have access to, and my Medium-High risk rating is a reasonable-sounding number, not a measured one.
- **Whether the Edge Function gateway-flakiness issue (Section 8) is actually mitigated in practice at pilot scale**, versus just not having caused a visible problem yet in this session's own testing.

## 20. Honest Self-Critique of the Platform

The platform's actual, demonstrated behavior in every fully-tested case was good: clean error handling, honest UI disclosure of incomplete features, a working end-to-end cross-role handoff, and — when defects were found — small, well-contained root causes rather than deep architectural problems. That's a genuinely positive signal, and I don't want this section to read as manufactured pessimism to satisfy the brief.

But the honest critique is this: **the confidence this platform can currently claim is narrower than "pilot ready" would require, and it's narrower specifically in the areas that matter most for a driving school's actual business.** A login page that works and a booking calendar that renders are necessary, not sufficient. Two Critical defects existing undetected in core settings pages — pages an Organization Owner would hit on day one — until a deliberately adversarial validation effort went looking for them, is not a reassuring track record for the areas that *haven't* been looked at with the same rigor yet. If I had to state my own honest, first-person view rather than a hedge: **I would not recommend a pilot launch today.** Not because anything found is unfixable, but because too much of the platform's actual value proposition — the day-to-day running of a driving school — remains unproven, and "unproven" and "probably fine" are not the same claim, no matter how good the proven parts look.
