# TrafikskolaOS — Version 1.0 Domain Governance Portfolio

**Document type:** Governance tracking register for the domain-by-domain Architecture → Governance Classification → Implementation Compliance → Corrective Implementation → Validation → Commissioning → Closure lifecycle applied to external-integration and platform domains during Version 1.0. This is a separate, complementary track from the existing `ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md` Pilot Readiness Action Plan (Actions 0–8, already closed) — that Handbook section is not reopened, amended, or duplicated by this document.

**Status:** Live register, updated as each domain completes its lifecycle.

---

## 1. Domain Status Matrix

| Domain | Architecture | Governance Classification | Implementation Compliance | Corrective Implementation | Validation | Commissioning | Closure |
|---|---|---|---|---|---|---|---|
| Tenant Website Integration | Approved | — | Approved | Complete | Complete | Approved | Not formally run as a separate gate — governance-complete in substance (Commissioning Approved was its terminal decision) |
| Stripe Integration | Approved | Approved | Approved | Complete | Complete | Approved with Operational Prerequisites | **Approved (Closed)** |

**Completed domains (governance-closed or governance-complete-in-substance):** Tenant Website Integration, Stripe Integration.

**Domains currently in progress:** None.

**Domains not yet entered into this governance lifecycle:** Fortnox, BankID, Resend, and any other named platform integration not listed above.

---

## 2. Version 1.0 Scope Register

| Domain | Version 1.0 Status | Future Changes Permitted |
|---|---|---|
| Tenant Website Integration | Feature-complete, governance-complete in substance | Critical defect fixes, security patches, regulatory compliance fixes only |
| Stripe Integration | Feature-complete, frozen | Critical defect fixes, security patches, regulatory compliance fixes only |

Both domains are frozen under the same rule stated in the Stripe Domain Closure Report: any change beyond critical/security/compliance fixes requires a new governance cycle under Version 1.1, not an amendment to this closed scope.

---

## 3. Deferred Version 1.1 Backlog (this governance track's contribution)

Recorded here for portfolio visibility; the canonical backlog entries live in `VERSION_1.1_ROADMAP.md` Section 3, updated alongside this document.

| Item | Source Domain | Classification |
|---|---|---|
| Refund support | Stripe Integration | Version 1.1 Backlog |
| Outbound idempotency (Checkout Session creation) | Stripe Integration | Version 1.1 Backlog |
| Subscription billing | Stripe Integration | Version 1.1 Backlog |
| Additional payment capabilities | Stripe Integration | Version 1.1 Backlog |
| Full Integration Credential Management Framework (registry, health monitoring, automatic recovery, operational dashboards) | Cross-domain (identified during Stripe's Architecture Assessment) | Version 1.1 Backlog — core lifecycle only was implemented for Stripe; extended lifecycle explicitly deferred until a third tenant-owned-credential integration justifies it |

---

## 4. Operational Prerequisites Carried Into Pilot

| Prerequisite | Domain | Notes |
|---|---|---|
| Production tenant Stripe credentials | Stripe Integration | Replaces the currently-configured unauthorized third-party credential |
| Production Stripe account onboarding | Stripe Integration | Per real pilot organization choosing to use Stripe |
| Production webhook registration | Stripe Integration | Org-scoped endpoint, per real Stripe account |
| Verification of production webhook delivery | Stripe Integration | The one gap this environment could not close — no legitimate Stripe account was available to observe a real Stripe-initiated delivery |

Full detail and evidence for each: `docs/COMMISSIONING_REGISTER.md`, Stripe Integration entry.

---

## 5. Recommended Next Domain

Two reasonable candidates, for different reasons — named explicitly rather than picking one without stating the tradeoff:

- **Resend** — per `INTEGRATION_CONFIGURATION_GUIDE.md`, this is the one integration classified **Mandatory for Pilot**, and it has not been through this governance lifecycle at all. Highest-priority by pilot necessity.
- **Fortnox** — not required for pilot, but carries a concretely evidenced, already-identified risk: its OAuth tokens are stored in the same unencrypted `organizations.settings` pattern Stripe's credentials were found in during this governance cycle, discovered while designing ADR-022. Highest-priority by known-defect-parallel.

**Recommendation: Resend**, on the basis that pilot-mandatory status is the harder constraint — a domain required for every pilot organization should not remain ungoverned while an optional one has already been fully closed. Fortnox should be the domain immediately following it, specifically because the credential-storage parallel to Stripe is already documented and the ADR-022 pattern built for Stripe is directly reusable there without new design work.

---

## 6. Final Governance Summary

Two domains have completed this governance lifecycle for Version 1.0: Tenant Website Integration and Stripe Integration, the latter through a fully explicit Closure gate. Both are frozen under the same critical/security/compliance-only change rule. No domain is currently in progress. The portfolio's highest-priority next domain is Resend, on pilot-mandatory grounds, with Fortnox recommended immediately after on the strength of an already-identified, directly-analogous credential-storage finding.
