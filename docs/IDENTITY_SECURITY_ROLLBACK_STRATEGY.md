# Identity & Security Implementation — Rollback Strategy

**Document type:** Operational procedure — closes the "Rollback strategy documented" item on the Identity & Security Implementation Blueprint's Readiness Checklist.
**Status:** Approved, governs Phases 1–5 of the Identity & Security Implementation Blueprint. Phase 6 (Future Identity Providers) has no implementation and is out of scope for this document.
**Scope:** rollback procedure only. Does not modify the frozen architecture, the implementation phases, or the implementation roadmap.

---

Each phase below is independently rollback-able without requiring the rollback of any other phase, per the Blueprint's additive-by-construction design. Every rollback preserves already-recorded Identity History — rollback removes a capability going forward, never the historical record of what already happened.

## Phase 1 — Identity & Security Event Store

- **Rollback trigger**: the migration causes performance degradation, an RLS misconfiguration is found that could expose cross-tenant data, or an unexpected schema conflict with a concurrent migration.
- **Rollback procedure**: this phase is explicitly inert — no application code writes to or reads from `identity_security_events` yet (that begins in Phase 2/3). Rollback is a new, forward-only migration (per this platform's append-only migration convention — historical migrations are never edited) that drops the table and its RLS policies. Zero application code needs to change, since none references the table yet.
- **Rollback validation**: confirm via a full-repository search that no Edge Function, frontend module, or shared library references `identity_security_events` before executing the drop. Confirm the drop migration applies cleanly against the hosted project.
- **Recovery procedure**: fix the root cause (index design, RLS policy, naming conflict), re-apply a corrected migration. No data loss risk — the table held no application-written data at the time of rollback.

## Phase 2 — Password Authentication Event Integration

- **Rollback trigger**: a regression in `auth-hook` causes login failures, JWT claim corruption, or degraded auth-hook latency for any user — this is the highest-regression-risk phase in the entire blueprint, since it modifies the function every existing session already depends on.
- **Rollback procedure**: two-tier response. **Immediate mitigation**: because every `recordIdentityEvent()` call is fail-open by design (a write failure must never block the action that triggered it, per the frozen architecture), the fastest safe response is to disable the event-recording call within `auth-hook` while leaving the rest of the function untouched — this isolates Phase 2's addition without touching Phase 1's baseline. **Full rollback**: redeploy `auth-hook` from its last known-good pre-Phase-2 source if the immediate mitigation doesn't resolve the issue.
- **Rollback validation**: live-verify login, logout, and JWT claim shape against the exact test used to confirm zero regression when Phase 2 originally shipped — claims must be byte-identical in structure to pre-Phase-2 output.
- **Recovery procedure**: diagnose against a non-production JWT-issuance path first (this platform's session model supports this — `auth-hook` behavior can be verified via direct claims decoding without requiring a full user-facing login cycle, as already practiced during this engagement's verification work). Re-deploy once confirmed. Events already recorded in Phase 1's table before the regression are untouched and remain valid history.

## Phase 3 — Platform Security UI

- **Rollback trigger**: a UI defect or crash in the new Identity History tab/filter on `PlatformSecurityPage`.
- **Rollback procedure**: revert the frontend deployment for this component only. This phase is purely additive UI reading from Phase 1/2's data — the pre-existing `audit_logs`-backed Security Events view on the same page is architecturally untouched and requires no rollback of its own.
- **Rollback validation**: confirm `PlatformSecurityPage`'s original audit view renders and functions exactly as it did before Phase 3.
- **Recovery procedure**: fix and redeploy the frontend independently of any backend phase — zero data or backend impact either direction.

## Phase 4 — BankID Authentication

- **Rollback trigger**: a BankID assertion-verification defect, a security concern in the callback flow, or an external BankID-side issue (certificate expiry, API outage) — the most externally-dependent phase in the blueprint.
- **Rollback procedure**: disable via the feature flag / pilot gate established in the Blueprint's Rollout Strategy (Phase 4 ships flagged/piloted, not general-release, by design). Flipping the flag off immediately removes "Logga in med BankID" from the login screen. The existing, unmodified email/password flow is unaffected throughout, since Phase 4 only adds a parallel option and touches no shared login-path code beyond the callback function itself.
- **Rollback validation**: confirm email/password login is unaffected for all users (it never depended on Phase 4's code). Confirm no orphaned or partially-created sessions remain from in-flight BankID attempts at the moment of rollback.
- **Recovery procedure**: resolve the BankID-side or verification-side issue, re-enable the flag for the original pilot group first (per the Blueprint's "pilot on Tenant Administrators only" recommendation) before returning to general availability.

## Phase 5 — Identity Linking

- **Rollback trigger**: any defect that could produce a duplicate-user or incorrect cross-account link — the single highest-consequence failure mode in the entire blueprint, since it touches which real person a `user_id` represents.
- **Rollback procedure**: the database is the first line of defense, not the rollback procedure itself — `auth_identity_links`' `UNIQUE (provider, external_subject_hash)` and `UNIQUE (user_id, provider)` constraints (frozen in the architecture, not a rollback-time addition) prevent the worst-case outcome even if the application-layer flow has a bug. The rollback action itself is disabling the "Link BankID identity" UI action (flag or deploy revert), stopping new link attempts immediately.
- **Rollback validation**: audit `auth_identity_links` for any row that does not correspond to a link created from within a genuinely authenticated session (the frozen architecture's required precondition for every link) — this is a data-integrity check, not merely a feature check. Confirm affected users' RBAC and session behavior is unaffected (identity linking never touches `memberships`/`membership_roles`, per ADR-007's ownership boundary, so this should always pass by construction).
- **Recovery procedure**: fix the linking flow. If any bad link data is found, correct it with the affected user's involvement and consent, consistent with GDPR's data-accuracy principle (Art. 5(1)(d)) — never silently mutate a user's linked-identity state without their knowledge.

## Cross-Phase Notes

- No phase's rollback requires rolling back an earlier phase — Phase 1's table, once past its own rollback window, is a stable foundation every later phase only adds to.
- No rollback in this document deletes already-recorded Identity History as a side effect of removing a capability — rollback always means "stop recording/offering this going forward," never "erase what was already recorded" (erasure is governed separately, by `IDENTITY_RETENTION_STRATEGY.md`).
- Every rollback procedure above reuses existing operational mechanisms already used elsewhere in this platform (forward-only migrations, feature-flag gating, live JWT-claims verification) — this document introduces no new rollback tooling or architecture.
