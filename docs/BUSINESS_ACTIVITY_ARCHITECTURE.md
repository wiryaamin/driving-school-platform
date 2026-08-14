# Business Activity Architecture

**Document type:** Architecture definition — formally establishes `activity_logs` as the canonical business-activity mechanism, closing the governance gap identified by the platform-wide logging architecture audit (2026-08-14/15): the table existed since the platform's foundational migration with exactly this stated intent, but — unlike `identity_security_events` under `ADR-007` — was never given its own ADR, taxonomy, or retention decision.
**Status:** Foundation approved and implemented (this revision). Portal-facing reads (Student/Instructor/Guardian Activity) and broad cross-domain writer adoption are explicitly **not** part of this phase — see Section 9.
**Basis:** `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` `ADR-010`; the platform-wide logging architecture audit and the `activity_logs` reuse audit that preceded it (both 2026-08-14/15).
**Scope:** `activity_logs` only. Does not modify `audit_logs`, `identity_security_events`, or `event_outbox` — see Section 2 for why they remain permanently separate.

---

## 1. Principle

`activity_logs` is the platform's canonical **business-level activity stream** — "student enrolled," "booking cancelled," "guardian viewed balance." It exists to answer *"what happened, in terms a user would recognize"*, for user-facing history, timelines, and operational views. It is explicitly **not**:

- **Compliance/data-mutation audit** — that is `audit_logs`: full row-level before/after diffs, `INSERT`/`UPDATE`/`DELETE`/`RESTORE` only, admin-only, "accounting-grade traceability."
- **Identity/security history** — that is `identity_security_events`: login/logout/BankID/identity-linking, governed independently under `ADR-007`/`P-027`.
- **Async event delivery** — that is `event_outbox`: a work queue for dispatching side effects, not a queryable log, even though its rows happen to never be deleted.
- **A financial ledger, a document-history table, or the system of record for any domain's own data** — `journal_entries`, `student_documents`, `quiz_sessions`, and `notifications` each remain the authoritative source for their own domain. `activity_logs` may reference these (via `entity_type`/`entity_id`), never duplicate their detail.

These four systems (plus each domain's own tables) remain **permanently separate**. No future work should collapse any of them into another — see the ADR-007 precedent this document deliberately follows.

## 2. Why the systems stay separate

Confirmed by direct investigation, not assumption:

- `audit_logs.operation` is a closed enum (`INSERT`/`UPDATE`/`DELETE`/`RESTORE`) — it structurally cannot represent a *read* or any non-CRUD business verb. Guardian Portal's own existing writer discovered this independently and chose `activity_logs` specifically because of it.
- `identity_security_events` is scoped by `ADR-007`/`P-027` to authentication/identity only; a vehicle-registry lookup or a guardian viewing a balance is explicitly out of that scope (Vehicle Registry's own writer comment states this reasoning directly).
- `event_outbox` is a transactional outbox (claim/lock/complete/fail, retry/backoff, dead-letter) — built for reliable delivery, not for being queried as history. Its rows persisting forever is incidental, not by design.

## 3. Schema

```sql
activity_logs (
  id               uuid          PK, default gen_random_uuid()
  organization_id  uuid          NOT NULL   -- no FK, survives org deletion (matches audit_logs/identity_security_events)
  user_id          uuid                     -- nullable, no FK — see Section 4, not sufficient alone
  user_email       text
  action           text          NOT NULL   -- 'domain.verb', CHECK (action ~ '^[a-z_]+\.[a-z_]+$')
  description      text
  entity_type      text                     -- generic, free text — see Section 5
  entity_id        uuid                     -- nullable, no FK
  metadata         jsonb         NOT NULL DEFAULT '{}'
  ip_address       inet
  user_agent       text
  session_id       uuid
  occurred_at      timestamptz   NOT NULL DEFAULT now()
  actor_type       activity_actor_type      -- NEW, nullable — see Section 4
  visibility       activity_visibility      -- NEW, NOT NULL DEFAULT 'admin_only' — see Section 6
  correlation_id   uuid                     -- NEW, nullable — see Section 8
)
```

Indexes: `organization_id`; `user_id` (partial, non-null); `action`; `occurred_at DESC`; `(organization_id, occurred_at DESC)`; `(entity_type, entity_id)`; `visibility` (new); `actor_type` (new, partial, non-null). No schema change beyond the three new columns and their two supporting indexes — the pre-existing index set already matched the query patterns a timeline needs.

## 4. Actor model

`user_id` alone was never sufficient to identify who performed an action. Guardian Portal's existing writer intentionally passes `NULL` (a guardian session has no resolvable `auth.users` id the same way staff do), while Vehicle Registry always passes a real one — meaning a reader could not previously distinguish "a guardian did this" from "an unattributed system action" without inspecting each writer's own conventions in `metadata`.

`actor_type` (`student` | `instructor` | `guardian` | `staff` | `system` | `integration`) makes this explicit. It is **nullable with no default** — every historical row, and any future write that doesn't specify one, is `NULL` (unknown), never guessed. `NULL` is a legitimate, permanent value for rows where the actor genuinely cannot be reliably classified, not a temporary placeholder awaiting backfill.

## 5. Entity model

`entity_type` (free text) + `entity_id` (uuid, no FK) is already sufficiently generic — proven by holding two unrelated shapes (`student`, `vehicle`) today with zero schema change. Extending to `instructor`, `guardian`, `booking`, `lesson`, `document`, `quiz`, `payment`, etc. requires only a new writer using a new `entity_type` string — no migration.

## 6. Visibility model

`visibility` (`admin_only` | `instructor` | `student` | `guardian` | `system`) states which **additional** audience — beyond admin/staff, who can always see everything — may see a given row. **Defaults to `admin_only`** (the most restrictive value): no existing or future row is ever automatically exposed to a Student, Instructor, or Guardian view until a writer deliberately classifies it otherwise. This directly satisfies the requirement that existing activity (all 32 current rows) must remain exactly as restricted as it already was.

Visibility does **not** encode *whose* instance of a portal may see a row — that scoping (a student may only ever see rows about *themselves*) is an application-layer filter (`entity_id = requesting_student_id`) applied on top of visibility, not a second dimension of this column. Keeping these concerns separate avoids over-modeling a filter that natural row-scoping already provides.

**Open limitation, deliberately not solved here:** a row currently names at most one additional visible audience. A single business event that should be visible to *both* the student and their guardian (e.g. a booking cancellation) cannot be expressed today without either two rows or a future set-valued column. This is flagged as an open question for whichever future phase implements Student/Guardian Activity reads — see Section 9.

## 7. Security model — where reads are authorized

**RLS** continues to guarantee the tenant-isolation floor only (`organization_id` match, unchanged — confirmed live, not modified by this change). It is not, and structurally cannot become, the enforcement point for portal-differentiated visibility: Student/Guardian/Instructor portal sessions do not carry the `organization_id`-bearing staff JWT this policy depends on (they authenticate via separate token-based Edge Functions, exactly like Guardian Portal's own existing pattern). Any future portal-facing read must therefore go through a service-role-mediated Edge Function applying explicit `visibility` + `entity_id` + `actor_type` filtering in application code — the same pattern Guardian Portal already uses for its *writes*. This is **Option C (RLS + application-layer combination)** from the audit, and it is the only option structurally compatible with how portal auth already works on this platform. Not implemented in this phase — no portal read exists yet.

The existing admin-facing reader (Loggar → Aktivitetsloggar) is unaffected: it already authenticates as a staff JWT session subject to unchanged RLS, and its own Edge-Function-level permission check (`scheduling:booking:read` — a pre-existing, separately-flagged domain mismatch, not addressed by this change) is untouched.

## 8. Write mechanism

Unchanged pattern: `insert_activity_log()`, `SECURITY DEFINER`, callable only by trusted server-side code. Its signature gained three new **optional, trailing** parameters (`p_actor_type`, `p_visibility` default `'admin_only'`, `p_correlation_id`) — fully backward compatible, since both existing callers invoke it with named arguments.

**A real gap found and closed during this review, not merely a planned addition:** the function had never had its `EXECUTE` grant restricted — PostgreSQL grants `EXECUTE` to `PUBLIC` by default, and nothing had revoked it. Any client, including an unauthenticated `anon`-key request, could previously call `insert_activity_log()` directly and write an arbitrary row (any `organization_id`, any actor/visibility) to any tenant, entirely bypassing RLS. `EXECUTE` is now restricted to `service_role` only; both existing writers (Guardian Portal, Vehicle Registry) already called it exclusively via `createServiceClient()`, so nothing broke. **`insert_audit_log()` has the identical unrevoked grant and was not touched** — out of scope for this change, flagged as a follow-up item for whoever next reviews `audit_logs`.

## 9. Correlation ID

`event_outbox`, `audit_logs`, and `identity_security_events` all already carry `correlation_id` (`ADR-001`/`P-022` — every Edge Function request has one via `EdgeRequestContext`). `activity_logs` was the one exception. Since the mechanism already exists platform-wide and costs nothing new to reuse, `correlation_id` was added and is now populated by both existing writers from their request's `EdgeRequestContext`/local correlation id. **`causation_id` was deliberately not added** — nothing in the current writer set has a genuine causation chain to record (both are direct, synchronous writes at the point of action, not triggered by a prior event), so adding it now would be speculative. Add it when a real caller needs it, not preemptively.

## 10. Event taxonomy

The existing `action` format (`domain.verb`, enforced by `CHECK (action ~ '^[a-z_]+\.[a-z_]+$')`) **remains appropriate and is unchanged** — it already matches the platform's one other free-text-taxonomy precedent (`identity_security_events.event_type`, governed by `IDENTITY_EVENT_TAXONOMY.md`), and both existing writers already follow it consistently (`guardian_portal.viewed_*`, `vehicle_registry.performed`/`cache_hit`). No new event types are introduced by this change. As adoption widens in future phases, new `action` values should follow the same canonical-plus-context principle `IDENTITY_EVENT_TAXONOMY.md` establishes: name the business verb, carry the specific provider/mechanism in `metadata`, not in the action name itself.

**No separate `category` field was added.** The `action` domain prefix (`booking.*`, `student.*`, `guardian_portal.*`) already conveys category; a redundant column would be derived data with nothing new to say. Revisit only if a real query pattern emerges that the prefix genuinely can't serve.

## 11. Retention and data lifecycle — an open decision, not a policy

**No retention period is approved or documented for `activity_logs`, and none is invented by this change.** Unlike `identity_security_events` (governed by `IDENTITY_RETENTION_STRATEGY.md`, with per-category periods and GDPR legal bases already approved), no equivalent business/legal decision has been made for business activity. This is an explicit architecture-decision gap, not an oversight to paper over:

- Business activity retention should very plausibly differ from `audit_logs`' compliance-grade retention and from `identity_security_events`' security-grade retention — but *how* it should differ (shorter? longer for certain event types? tied to the entity's own lifecycle?) has not been decided.
- No student-deletion or tenant-deletion workflow currently touches `activity_logs` (confirmed: the existing `soft_delete('students', ...)` path does not reference this table). A soft-deleted student's activity rows persist indefinitely today, exactly as they already do in `audit_logs`.
- **No cleanup/anonymization job exists, and none should be created until the above is decided.** Creating one with an invented period would be worse than the current gap — it would look like an approved policy when none exists.

**Action required before this table carries meaningful volumes of student-facing data:** a retention decision, following the same format as `IDENTITY_RETENTION_STRATEGY.md` (category → period → legal basis → rationale), needs business/legal sign-off. Tracked here as an open item, not resolved.

## 12. Immutability

Unchanged convention: no `INSERT`/`UPDATE`/`DELETE` RLS policy exists for any client role — writes only happen through `insert_activity_log()` (now `service_role`-only) or a direct service-role connection. This is **deliberately not** hardened to the finance ledger's level (no `BEFORE UPDATE OR DELETE`-raising trigger) — business activity does not carry the same legal/accounting weight as `audit_logs` or the ledger, and over-hardening it would misrepresent its actual sensitivity tier.

## 13. Historical data

The 32 pre-existing rows (Guardian Portal + Vehicle Registry, 2026-07-14 through 2026-08-09) were not rewritten. They received the new columns' natural values from the migration itself: `actor_type = NULL` (unknown — never reconstructed or guessed), `visibility = 'admin_only'` (the column default — the same restriction they already had, made explicit rather than changed), `correlation_id = NULL` (not recoverable). All 32 rows remain queryable and unchanged in every other respect.

## 14. Current writers (unchanged in number)

Exactly two, both updated in this same change to populate the new fields correctly — no new domain was instrumented:

- **Guardian Portal** (`supabase/functions/guardian-portal/index.ts`) — `actor_type: 'guardian'`, `visibility: 'admin_only'` (explicit), `correlation_id` from the request's correlation id.
- **Vehicle Registry** (`supabase/functions/_shared/vehicle-registry-service.ts`) — `actor_type: 'staff'` when a real actor id is present, `'system'` when it isn't (mirroring the distinction the caller already made), `visibility: 'admin_only'`, `correlation_id` threaded from `EdgeRequestContext`.

## 15. Explicitly not done in this phase

No UI (Student/Instructor/Guardian/Admin Activity pages), no new writers for Students, Bookings, Documents, Education, Instructors, or Finance, no RLS/permission changes, no retention job, no `causation_id`, no multi-audience visibility. Each is either an open item (Section 9, 11, 6) or deferred to a dedicated future phase reviewed independently, per the same discipline `ADR-007` applied to identity events (Phase 1 foundation, Phases 2+ scheduled separately).
