# Identity Event Writer Contract

**Document type:** Implementation standard — the authoritative contract every component writing to the Identity & Security Event Store must follow.
**Status:** Frozen. Applies equally to Password Authentication (implemented), BankID (Phase 4), Microsoft Entra ID, Google Workspace, SAML, OAuth providers, and any future provider.
**Basis:** `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` ADR-007, `IDENTITY_EVENT_TAXONOMY.md`, the Phase 1/2 Existing Implementation Review.
**Scope:** implementation contract only. Does not modify the `identity_security_events` schema or the frozen taxonomy.

---

## 1. Single Writer Principle

**A shared writer already exists: `recordIdentityEvent()` (`supabase/functions/_shared/identity-events.ts`).** It is, today, the only function in this codebase that inserts into `identity_security_events` — verified directly, not assumed. Password Authentication's two writers (`auth-hook`, `identity-events/index.ts`) already call it exclusively.

**Every current and future identity provider must call this exact function.** No provider may write to `identity_security_events` directly, define a second writer, or introduce a provider-specific insert path. Phase 3 does not need to extract anything — the shared writer was already built correctly, in Phase 1, ahead of any caller.

## 2. Mandatory Event Contract

| Requirement | Field | Current status |
|---|---|---|
| Mandatory | `event_type` | Enforced — required parameter, `NOT NULL` + format `CHECK` at the schema level |
| Mandatory | `provider` | Enforced — required parameter, `NOT NULL` + enum `CHECK` at the schema level |
| Mandatory | `occurred_at` | Guaranteed by schema default (`DEFAULT now()`) — not a caller obligation, always present in the resulting row |
| Mandatory | `correlation_id` | **Supplied by every current call site in practice, but optional in the type signature today** — a contract-tightening item for a future small pass, not a blocker |
| When available | `user_id` | Present in the writer; `null` handled correctly (e.g. an unresolved failed-login email) |
| When available | `organization_id` | Present in the writer |
| When available | `actor_id` | **Not currently a distinct field** — only `user_id` (the event's subject) exists. Every event type built so far is self-initiated, so subject and actor are always the same person. A future admin-initiated event type (e.g. an admin revoking another user's session) will need this distinction added — not required for BankID, since BankID authentication is self-initiated exactly like password authentication. |
| Optional | `metadata` | Present, governed by Section 3 |

**No provider may extend this contract without an approved Architecture Review** — this includes adding new top-level fields to `recordIdentityEvent()`'s input shape, not only new `event_type`/`provider` values (which the taxonomy already governs separately).

## 3. Metadata Rules

Metadata is contextual information only, describing *this specific event* — never a second source of business or identity state. This restates, and does not modify, the rule already established in `IDENTITY_EVENT_TAXONOMY.md` and ADR-007.

**Must never contain**: permissions, roles, JWT claims, subscription state, mutable identity state, duplicated business entities, or any business state generally.

**May contain**: provider response codes, failure reasons, device information, client version, request identifiers, correlation context, diagnostic information.

**The test, restated from the taxonomy**: if this value could become wrong tomorrow without the historical event row itself being wrong, it does not belong in `metadata` — it belongs in the domain table that actually owns it.

## 4. Failure Handling

Identity event recording is **best effort, isolated, and non-blocking** — already true of `recordIdentityEvent()`'s implementation (wrapped in try/catch, logs and returns on any failure, never throws). **Authentication must never fail because event recording fails** — this is not a target to reach, it is the current, verified behavior (Phase 2's completion report live-confirmed a failed write cannot affect JWT issuance or sign-in). Every future provider inherits this guarantee automatically by using the same writer — it is not something each provider must reimplement.

## 5. Correlation Rules

`recordIdentityEvent()` accepts `correlationId` as a pass-through parameter — it does not generate its own. **Identity events must participate in the existing correlation chain**, using the same `X-Correlation-ID`/GUC-capture convention already established by `audit_trigger_fn()` and used throughout this codebase's Edge Functions — never a second, identity-specific correlation mechanism. **Correlation IDs must never be regenerated mid-flow**: a single logical authentication attempt (e.g. BankID's Started → Successful/Failed sequence) must carry one `correlation_id` across every event it produces, exactly as a multi-request business operation already does elsewhere in this platform. The existing correlation infrastructure remains the Single Source of Truth — this contract does not introduce a parallel one.

## 6. Provider Rules

The `provider` column identifies **how** an event occurred. The `event_type` identifies **what** happened. These are independent axes, and every provider populates both:

```
login.success + provider=password
login.success + provider=bankid
```

represent the *same* identity event — a successful authentication — differing only in mechanism. This is the rule `IDENTITY_EVENT_TAXONOMY.md` already established (Section 2's canonical-vs-provider-specific split); this contract restates it as a hard requirement on every writer, not only a naming convention.

## 7. Future Provider Rule

BankID, Microsoft Entra ID, Google Workspace, SAML, OAuth providers, and any provider added later **must integrate by extending the existing Identity domain** — calling the same `recordIdentityEvent()`, writing to the same `identity_security_events` table, using the same `auth_identity_links` table for identity state (per the Identity & Security Architecture). They must never introduce:

- a provider-specific event writer
- a duplicate event store
- a provider-specific audit system
- a duplicate correlation mechanism
- an alternative event taxonomy

This is not new policy — it is ADR-007's Future Architecture Rule and P-027, restated here as the concrete engineering contract that rule implies.

## 8. Architectural Principle — Shared Identity Event Writer

**Every Identity & Security Event must be written through the approved shared Identity Event Writer (`recordIdentityEvent()`). No authentication provider may bypass or replace the shared writer.**

This guarantees, by construction rather than by per-provider discipline: consistent event taxonomy, consistent metadata rules, consistent correlation, consistent provider handling, consistent failure handling. A provider that bypassed the shared writer would silently lose all five guarantees at once — this is why the principle is a hard requirement, not a recommendation.

**Code review must reject any new identity-provider integration that writes to `identity_security_events` other than through `recordIdentityEvent()`.**
