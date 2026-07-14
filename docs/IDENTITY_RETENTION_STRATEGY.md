# Identity Retention Strategy

**Document type:** Operational policy — closes the "Identity retention strategy documented" item on the Identity & Security Implementation Blueprint's Readiness Checklist.
**Status:** Approved, governs `identity_security_events` (Identity History) and `auth_identity_links` (Identity State) from Phase 1 onward.
**Basis:** `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` ADR-007 (Identity & Security Architecture), the Identity & Security Implementation Blueprint.
**Scope:** retention periods only. Does not modify the frozen architecture, the event taxonomy, or any ownership boundary established by ADR-007.

---

## 1. Principle

`identity_security_events` is Identity History, not Identity State (ADR-007) — it exists for security, audit, compliance, forensics, and operational visibility, never as a live source of truth. Its retention policy follows directly from that purpose: **routine events are minimized aggressively (GDPR Article 5(1)(c), data minimization, and Article 5(1)(e), storage limitation); security-relevant and evidentiary events are retained longer, on an explicit legal basis, never indefinitely by default.**

`auth_identity_links` (Identity State) is not addressed here beyond its existing, already-frozen rule: it cascades on `auth.users` deletion (`ON DELETE CASCADE`), with no separate erasure procedure needed.

## 2. Retention Table

| Event category | Recommended retention | GDPR legal basis | Rationale |
|---|---|---|---|
| **Successful Login** | 90 days | Legitimate interest (Art. 6(1)(f)) — bounded, operational | Routine, high-volume, low individual forensic value; useful only in short-window aggregate (e.g. "did this user log in this week") |
| **Logout** | 90 days | Legitimate interest (Art. 6(1)(f)) | Pairs with Successful Login; same operational-only value |
| **Session Expired / Session Revoked (routine)** | 90 days | Legitimate interest (Art. 6(1)(f)) | Lifecycle noise; short-term troubleshooting value only |
| **Failed Login** | 12 months | Legitimate interest — security (Art. 6(1)(f)) | Primary forensic signal for brute-force/account-compromise investigation; longer window needed to detect low-and-slow attack patterns |
| **Password Reset Requested / Completed** | 12 months | Legitimate interest — security (Art. 6(1)(f)) | Common account-takeover vector; investigation window must exceed the routine-event window |
| **Session Revoked (admin-initiated / security-triggered)** | 12 months | Legitimate interest — security (Art. 6(1)(f)) | Distinct from routine expiry — an admin or the system deciding to end a session is itself a security-relevant fact |
| **Account Locked / Unlocked / Disabled** | 12 months | Legitimate interest — security (Art. 6(1)(f)) | Security-critical; needed for incident postmortems and to demonstrate the platform responded correctly to abuse |
| **Identity Linking (Linked / Unlinked)** | 24 months, or until account deletion (whichever is sooner), subject to the fraud/legal-claims exception below | Legitimate interest — fraud prevention and dispute resolution (Art. 6(1)(f)); Art. 17(3)(e) for active claims | Rare, high-stakes events with evidentiary value in identity disputes ("who linked this BankID identity, and when") — longer window than routine security events, but still bounded |
| **Identity Verification** | 24 months | Legitimate interest (Art. 6(1)(f)); legal obligation where verification supports a regulatory record | Evidentiary — proves a personnummer or other identity attribute was verified at a point in time |
| **BankID Authentication (Started / Successful / Failed / Cancelled)** | Same as the password-equivalent event: 90 days routine, 12 months for Failed | Same as above | Deliberately identical to the password-provider retention regime — the architecture is provider-agnostic (ADR-007), and retention must not silently diverge by provider for the same conceptual event |
| **BankID Signatures** | Matches the retention period of the signed document/contract itself (Documents module policy; Bokföringslagen's 7-year minimum where the signed artifact is an accounting-relevant record) | Legal obligation (Art. 6(1)(c)) — Swedish accounting law; contract evidentiary requirements | A signature event is the proof underpinning the validity of its associated document — deleting the event while retaining the document would defeat the document's own evidentiary value. Not built in this implementation phase (E-signature remains Future Roadmap); this row documents the policy for when it is |
| **Security-Critical Events generally** (repeated Failed Login clusters, Account Locked, admin-forced Session Revoked) | 12–24 months, event-type-dependent per rows above | Legitimate interest — security (Art. 6(1)(f)) | Grouped here as a cross-cutting category — no event type in this class should default to the 90-day routine window |

## 3. Enforcement Mechanism

Retention is enforced by a scheduled pruning job (implementation detail for the Phase 1/2 rollout, not an architectural decision — the job itself is ordinary operational tooling, not a new architectural layer). The job deletes rows past their category's retention window, computed from `identity_security_events.event_type` and `occurred_at`. Deletion, not anonymization — these events do not need to survive in anonymized form for any purpose already identified; if a future reporting need requires aggregate historical trends beyond the retention window, that need must be scoped and approved separately, not solved by silently extending retention.

## 4. Exceptions

An event otherwise due for deletion must be retained past its normal window only when it is the subject of an active fraud, security-incident, or legal-claims investigation (Art. 17(3)(e)) — this exception must be applied per-event, not as a blanket extension, and the investigation's closure should trigger normal-schedule deletion resuming for that event.

## 5. Non-Goals

This document does not define retention for `audit_logs` (governed separately, unaffected by this policy) or `event_outbox` (a work queue, not a retained log — processed/dead-lettered rows are an operational cleanup concern, not a GDPR retention concern in the same sense). It does not change any table's schema, ownership boundary, or the frozen Identity & Security Architecture.
