# Identity Event Taxonomy

**Document type:** Naming standard — the canonical, frozen list of `identity_security_events.event_type` values and the rule for adding new ones. Prevents event-name drift as new providers and event categories are added.
**Status:** Frozen. Governs every writer from Phase 2 onward.
**Basis:** `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` ADR-007, the Phase 1 Implementation Audit.
**Scope:** naming convention only. Does not modify the `identity_security_events` schema, which remains exactly as deployed in Phase 1 — `event_type` is free text under a format CHECK, not an enum, so this taxonomy is documentation-enforced (and code-review-enforced), not migration-enforced.

---

## 1. Principle

Every event name is `domain.verb`. The `provider` column — never the event name — says *how* an event happened. An event name is only allowed to name a provider when the behavior it describes has no equivalent under any other provider. This is the single rule that prevents taxonomy drift: **when in doubt, the event is canonical + `provider`, not provider-prefixed.**

## 2. Canonical Domains

### Authentication
- `login.success`
- `login.failed`
- `password.reset_requested`
- `password.reset_completed`
- `invitation.accepted`

### Identity
- `identity.linked`
- `identity.unlinked`
- `identity.verified`

### Session
- `session.created`
- `session.logout` *(corrected from bare `logout` — the unprefixed form fails the deployed `event_type` format constraint, which requires a `domain.verb` shape)*
- `session.expired`
- `session.revoked`

**Session Lifecycle Clarification — why `session.logout` belongs here, not under Authentication.** Authentication establishes identity: it is the act of proving who a user is, and its events (`login.success`, `login.failed`) describe the outcome of that proof. A session is the authenticated runtime state that results from a successful authentication — something that exists *after* identity has been established, and that has its own lifecycle independent of any single authentication event (`session.created`, `session.expired`, `session.revoked`). Logout terminates an authenticated session; it does not re-evaluate or unmake the identity proof that created it. **Therefore logout is a session lifecycle event, not an authentication event** — it belongs with `session.created`/`session.expired`/`session.revoked`, which together describe the full lifecycle of the same thing a session is, not with `login.success`/`login.failed`, which describe how identity was established in the first place. This also keeps the taxonomy internally consistent: every other session-lifecycle transition already lives under `session.*`; carving out logout as an exception under Authentication would have been the same kind of drift this taxonomy exists to prevent.

### MFA
- `mfa.enabled`
- `mfa.disabled`
- `mfa.challenge`

### Provider-specific

Only permitted when the event describes behavior genuinely unique to that provider — a process state or mechanism no other provider has an equivalent of. Currently:

- `bankid.authentication_started` — BankID's async, multi-second app-switch/polling flow has no synchronous-password equivalent.
- `bankid.authentication_cancelled` — a user cancelling an in-flight BankID challenge is a BankID-shaped concept.
- `bankid.signature_started` — BankID e-signature is also an async app-switch/polling flow.
- `bankid.signature_completed` — kept provider-prefixed by deliberate choice, not oversight: unlike login/identity-linking (which already have multiple real providers — password, BankID, and future Entra/Google/SAML — making a canonical `signature.*` + `provider` split immediately useful), e-signature has exactly one provider on this platform's roadmap today. Governed permanently by Section 3 (Digital Signature Governance) — that section, not this bullet, is authoritative on when and how this may change.
- `bankid.signature_failed` — same reasoning as `bankid.signature_completed`, governed by Section 3.

**Provider-specific terminal outcomes that are provider-neutral in meaning must reuse the canonical taxonomy together with the `provider` column — this is the rule that keeps "show me every failed login regardless of provider" a single, simple query.**

✓ `login.success` + `provider=bankid`
✓ `login.failed` + `provider=bankid`
✓ `identity.linked` + `provider=bankid`

✗ `bankid.authentication_completed`
✗ `bankid.authentication_failed`
✗ `bankid.identity_linked`

The same rule applies identically to every future provider — Entra ID, Google Workspace, SAML, and any provider added later reuse `login.success`/`login.failed`/`identity.linked`/`identity.unlinked` with the corresponding `provider` value. None of them get their own login/link event names. A future provider only earns a provider-specific event name if it introduces a process state genuinely unique to it — the same bar BankID's `authentication_started`/`authentication_cancelled`/`signature_started` clear and a plain OAuth redirect login would not.

## 3. Digital Signature Governance (permanent rule)

BankID's signature events (`bankid.signature_started`, `bankid.signature_completed`, `bankid.signature_failed`) are provider-specific **only because TrafikskolaOS currently supports exactly one digital-signature provider.** This is a statement of present fact, not a permanent architectural judgment that signature events are inherently provider-bound — Section 2 already notes this naming can be revisited.

**If a future digital-signature provider is ever introduced, an Architecture Review is mandatory before any additional provider-specific signature event is added.** That review must determine whether:

- provider-specific signature events remain appropriate for the new provider (i.e. it introduces genuinely unique process states, the same bar BankID's own `_started` events clear), **or**
- the canonical taxonomy — `signature.started`, `signature.completed`, `signature.failed` — together with the `provider` column becomes the authoritative model, and BankID's existing provider-prefixed events are migrated to match.

**Until such an Architecture Review has been approved, the existing BankID signature taxonomy remains frozen exactly as documented in Section 2.** No second signature provider may be added by simply extending the `provider` CHECK constraint and reusing the BankID-prefixed event names — that would silently duplicate provider-specific logging (ADR-007's Future Architecture Rule) without the governance review this rule requires.

## 4. Adding a New Event

Before adding any new `event_type`:
1. Does an existing canonical name already describe this, with `provider` distinguishing the mechanism? If yes, use it — do not create a new name.
2. If genuinely new, does it belong in an existing domain (Authentication/Identity/Session/MFA) or does it need a new domain (as Signature did)? Prefer an existing domain.
3. Only name it provider-specifically if the behavior has no equivalent under any other current or planned provider.

**Code review must reject any new event name that duplicates an existing canonical event under a provider prefix.**
