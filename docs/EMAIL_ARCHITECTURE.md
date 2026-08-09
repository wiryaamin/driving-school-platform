# Email Architecture — TrafikskolaOS

**Document type:** Architecture and design reference (living document, revised at major version boundaries — not a sprint log). **Sprint produced under:** Sprint 3 (Email Architecture & Infrastructure Design) — architecture and documentation only. No external service was provisioned, no DNS was changed, no Dashboard setting was touched, no secret was generated, to produce this document.

**Relationship to other documents — read this first, this document does not repeat their content:**

| Document | Owns |
|---|---|
| `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.2 | The *operational* Resend chapter — account creation, configuration, and the step-by-step SMTP runbook. This document does not repeat those steps; it explains why they're the right steps. |
| `docs/ENVIRONMENT_VARIABLE_REFERENCE.md` | Every email-related variable, tabulated. |
| `docs/SECRETS_MANAGEMENT_GUIDE.md` | Secret storage/rotation policy, including the Sprint 3 log of what was (and wasn't) done. |
| `docs/operational-runbook.md` §13 | The live, confirmed SMTP blocker and its verification command. |
| `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` §5 | Auth redirect-URL verification status (referenced below, in Authentication Email Strategy). |
| `docs/AUTHENTICATION_ARCHITECTURE.md` | What happens *after* the email link is clicked — the session model, callback handling, and the full auth state diagram (Sprint 4A). This document owns the email; that one owns the click. |
| **This document** | *Why* the platform is shaped this way, what's frozen for Version 1.0, and what's deliberately deferred to later versions. |

**Review cadence:** this document reflects a point-in-time review (Sprint 3/3A). Revisit it at the next major version boundary, or immediately if `_shared/comm-providers.ts`'s interface changes, a new email provider is added, or the Version 1.0 Scope Freeze is lifted — whichever comes first. It is not meant to be re-derived from scratch each time; update it in place.

---

## Executive Summary

TrafikskolaOS already has a working, tested provider-abstraction pattern for outbound messaging (`_shared/comm-providers.ts`) — it just isn't fully exploited yet, and it doesn't cover Supabase Auth's own emails, which are architecturally a separate system entirely. This document's central finding is that **almost no new abstraction needs to be invented.** The right move is: keep two email systems clearly separated (Auth vs. application), extend the existing dispatch pattern with an explicit *category* concept (Version 1.1+, not required for pilot), and treat multi-tenant custom domains as a Version 2.x capability with a well-defined three-tier path (platform domain → verified sender address → verified tenant domain), not something to build prematurely.

**Recommendation, stated up front and repeated at the end:** the project is ready to proceed to environment provisioning. Nothing found in this review requires further architectural work first.

---

## Executive Architecture Diagram

**Deliberately not a single straight line.** A linear "User → Platform → Auth → Provider → Recipient" diagram would misrepresent the one fact this whole document is built on: Auth email and application email are two genuinely separate paths that never touch each other in code, and only converge at the recipient's inbox.

```
                              ┌──────────┐
                              │   User    │
                              └─────┬────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │  TrafikskolaOS Platform │
                        └──────────┬───────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                     │
                 ▼                                     ▼
      ┌───────────────────────┐           ┌─────────────────────────┐
      │   Supabase Auth          │           │   Application logic         │
      │   (GoTrue)                 │           │   (bookings, reminders,        │
      │   invite / reset / confirm   │           │   students, invoices...)         │
      └───────────┬───────────┘           └────────────┬────────────┘
                  │                                     │
                  ▼                                     ▼
      ┌───────────────────────┐           ┌─────────────────────────┐
      │   Dashboard SMTP setting │           │   comm-providers.ts          │
      │   (not yet configured —    │           │   provider abstraction         │
      │   see operational-           │           │   (per-org, per-channel)        │
      │   runbook.md §13)             │           └────────────┬────────────┘
      └───────────┬───────────┘                                │
                  │                                             ▼
                  │                                ┌─────────────────────────┐
                  │                                │   Email provider              │
                  │                                │   Resend / SendGrid / Mailjet   │
                  │                                │   (organization's own choice)     │
                  │                                └────────────┬────────────┘
                  │                                             │
                  └──────────────────┬──────────────────────────┘
                                      ▼
                              ┌──────────────┐
                              │   Recipient    │
                              │   (inbox)       │
                              └──────────────┘
```

Two paths, one convergence point. Nothing in this document proposes merging them — see Authentication Email Strategy and Provider Abstraction Design below for why that would be a mistake, not a simplification.

---

## As-Is Architecture Summary

*(Full detail: `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.2, §4.6–4.8. Summarized here only to the depth needed to justify the design decisions below.)*

- **Two entirely separate systems already exist**, and this separation is correct, not accidental:
  1. **Supabase Auth's own email** (password reset, invitation, confirmation) — Dashboard-configured SMTP, currently Supabase's default sender, currently rate-limited (confirmed live, `429 over_email_send_rate_limit`, Sprint 2B).
  2. **The application's own notification email** — `_shared/comm-providers.ts`, a real, working, pluggable dispatcher.
- **`comm-providers.ts`'s existing shape** (verified against current code, not assumed):
  ```ts
  export interface DispatchParams {
    channel:  string;        // 'email' | 'sms' | 'whatsapp' | 'push' | 'voice'
    provider: string | null; // e.g. 'resend', per-organization choice
    to, from, subject?, body: string;
  }
  export async function dispatchMessage(params: DispatchParams): Promise<ProviderResult>
  ```
  Provider selection is **per-organization, per-channel**, already. No provider configured → the message is marked `queued`, never a hard failure. This graceful-degradation behavior is the single most important existing property this architecture builds on.
- **Email providers already implemented** (code exists and works; none currently credentialed): Resend, SendGrid, Mailjet. **SendGrid is not a "future provider"** — it's built today, just unused. This corrects an assumption in this sprint's own background material.
- **No email "category" concept exists.** `dispatchMessage()` has no notion of transactional vs. marketing vs. billing — every call is just "send this to this channel via this provider." Category-based routing (e.g., "billing emails always go through the verified billing sender") does not exist yet.
- **No template system exists** beyond inline string bodies constructed by callers. No branding/localization layer for application email. Supabase Auth's default templates are unmodified (`config.toml` has no `[auth.email.template]` section).
- **No multi-tenant sending domain concept exists.** Every organization currently shares whatever single sender identity the platform configures.
- **A directly relevant, very recent architectural precedent exists in this exact codebase**: the Person Lookup Framework's v2.0 refactor (`_shared/person-lookup.ts`) — a canonical data model + provider factory + capability model + graceful "not implemented" fallback, applied to a completely different integration (personnummer lookup, not email) but structurally the same problem shape. Where this document recommends new abstraction, it deliberately mirrors that already-proven pattern rather than inventing a third one.

---

## Industry Research Summary

Targeted research (not exhaustive vendor-by-vendor comparison — the instruction was to focus on patterns, and these three patterns are the ones that actually generalize):

**1. Authentication email is architecturally separate from application email, universally.** Every major identity platform (Clerk, Auth0, Supabase, Firebase Auth, Cognito) owns its own transactional email path, distinct from whatever the application itself sends. This isn't a TrafikskolaOS-specific quirk to fix — it's the industry-standard shape, and the current architecture already matches it correctly by accident of how Supabase works. [Auth0 vs Clerk comparison](https://contracollective.com/blog/auth0-vs-clerk-authentication-ecommerce-saas-2026), [Clerk platform comparison](https://clerk.com/articles/user-management-platform-comparison-react-clerk-auth0-firebase).

**2. Subdomain isolation, not a single shared sending identity, is the mature pattern for multi-category sending.** Each functional category (transactional, notifications, billing) gets its own subdomain with independent SPF/DKIM/DMARC — so a deliverability or reputation problem in one category (e.g., bulk reminder emails) can't affect another (e.g., password resets). DKIM must be signed per-sending-service for DMARC alignment; SPF records silently break past 10 DNS lookups, a real operational gotcha worth designing around from the start rather than discovering it later. [Email deliverability for SaaS: SPF/DKIM/DMARC](https://dev.to/whoffagents/email-deliverability-for-saas-spf-dkim-dmarc-setup-and-resend-integration-1hpd), [Resend DMARC docs](https://resend.com/docs/dashboard/domains/dmarc), [SPF/DKIM/DMARC for multiple domains](https://fluentsmtp.com/articles/spf-dkim-dmarc-for-multiple-domains/).

**3. "Sending on behalf of a customer" has exactly three maturity tiers, and skipping straight to the top tier is a common, avoidable mistake.** From least to most tenant-branded: (a) send from the platform's own authenticated domain — zero tenant setup, the current state; (b) verify a single sender *address* the tenant supplies (a one-click email confirmation, no DNS work) — a real middle tier many platforms skip past unnecessarily; (c) verify the tenant's entire domain (DKIM delegation, full DNS work) — maximum branding, maximum implementation and support cost. [Sending email on behalf of customers, Postmark](https://postmarkapp.com/support/article/846-how-can-i-send-on-behalf-of-my-users), [SaaS custom domain sender signatures](https://help.saascustomdomains.com/en/articles/9100646-email-sender-signatures).

---

## Target Architecture

### Email Categories

| Category | Owner system | Example |
|---|---|---|
| Authentication | Supabase Auth (Dashboard SMTP) | Password reset, invitation, email confirmation |
| Transactional | `comm-providers.ts` | Booking confirmation, lesson reminder |
| Operational | `comm-providers.ts` | Staff-facing internal alert |
| System Notifications | `comm-providers.ts` | Platform-level announcement |
| Student Notifications | `comm-providers.ts` | Progress update, schedule change |
| Instructor Notifications | `comm-providers.ts` | Assignment change |
| Scheduled Reminders | `comm-providers.ts` (via `event-worker`) | Upcoming lesson reminder |
| Certificates | `comm-providers.ts` (attachment-capable path — **not yet built**, see Gap Analysis) | Completion certificate |
| Reports | `comm-providers.ts` (attachment-capable path — **not yet built**) | Periodic summary |
| Invoices / Receipts | `comm-providers.ts` (attachment-capable path — **not yet built**) | Payment confirmation |
| Billing | `comm-providers.ts`, **recommended separate sender identity** (see Sender Strategy) | Subscription/dunning notices |
| Marketing | **Not recommended in-app at all for Version 1.0 or 1.x** — see below |

**Marketing email is explicitly out of scope for this architecture**, not merely deferred. TrafikskolaOS is a B2B operational tool for driving schools, not a consumer product with its own marketing list; if platform-level marketing email is ever needed (product announcements to driving school customers), that's a decision for a dedicated marketing tool (e.g., a newsletter platform) with proper list/consent management — folding it into the transactional dispatch path would be a compliance risk (marketing and transactional email have different legal consent requirements under GDPR and Swedish marketing law), not an architecture gap to close.

### Email Responsibility Matrix

More granular than the Email Categories table above — concrete, named email types, each traced to exactly one owner and delivery path. This is the table to check when adding a new email type: find the closest existing row, match its owner/path, don't invent a third pattern.

| Email Type | Owner | Delivery Path | Version |
|---|---|---|---|
| Invitation | Supabase Auth | Dashboard SMTP | V1 (blocked — see Gap Analysis) |
| Password Reset | Supabase Auth | Dashboard SMTP | V1 (blocked) |
| Email Verification | Supabase Auth | Dashboard SMTP | V1 (blocked) |
| Booking Confirmation | `comm-providers.ts` | Resend (org's choice) | V1 |
| Lesson Reminder | `comm-providers.ts` via `event-worker` | Resend (org's choice) | V1 |
| Schedule Change | `comm-providers.ts` | Resend (org's choice) | V1 |
| Student Progress Update | `comm-providers.ts` | Resend (org's choice) | V1 |
| Instructor Assignment Change | `comm-providers.ts` | Resend (org's choice) | V1 |
| Internal Staff Alert | `comm-providers.ts` | Resend (org's choice) | V1 |
| Platform Announcement | `comm-providers.ts` | Resend (org's choice) | V1 |
| Subscription / Dunning Notice | `comm-providers.ts` | Resend, recommended `billing@` sender (unbuilt — see Gap Analysis) | V1, sender identity Future |
| Invoice / Receipt | `comm-providers.ts` | Resend, requires attachment support | **Future** — not built |
| Certificate | `comm-providers.ts` | Resend, requires attachment support | **Future** — not built |
| Report | `comm-providers.ts` | Resend, requires attachment support | **Future** — not built |
| Marketing | *(none — out of scope, see above)* | *(none)* | Out of scope |

"V1 (blocked)" and "V1" both mean *architecturally in scope for Version 1.0* — "blocked" flags the three Auth rows as currently non-functional pending the SMTP fix, not architecturally deferred. Every application-email row already works end-to-end in code today; only the credential (`RESEND_API_KEY`) is missing.

### Sender Strategy

Standard identities, domain-agnostic (the actual domain is a deployment-time configuration value, never hardcoded — already true of `APP_URL`/`STUDENT_APP_URL` today, and this extends the same principle to sender addresses):

| Identity | Purpose | Category |
|---|---|---|
| `noreply@<domain>` | Default sender for automated transactional/operational mail where no reply is expected | Transactional, Operational, Notifications |
| `support@<domain>` | Anything a recipient might reasonably reply to | Reserved for future use — no current flow sends from this identity |
| `billing@<domain>` | Payment/subscription-related communication | Billing |
| `notifications@<domain>` | Reminders, schedule changes | Scheduled Reminders, Student/Instructor Notifications |
| `security@<domain>` | Reserved for security-relevant communication (e.g., a future "new device sign-in" alert) | Reserved — no current flow |

Not every identity needs to exist on day one — only `noreply@` and `notifications@` have an active sender in Version 1.0 (Roadmap Stage 1–2); `support@` and `security@` are reserved naming only, with no current flow and no scheduled stage. What matters architecturally is that the *pattern* (role-based local part, one shared domain in V1) is fixed now so nothing needs renaming later.

### Multi-Tenant Strategy

**Version 1.0 (frozen, this document's authoritative answer to "should every school initially send from the platform domain"): yes, unconditionally.** Every organization's application email sends from the platform's own sender identities above. No tenant-specific branding of the *sending address* in Version 1.0. This is not a limitation to apologize for — it's the correct, lowest-risk starting tier per the industry research above, and it's exactly the tier the platform is already at today by default.

**Version 2.x (future, not started, sequenced by increasing cost/complexity):**

| Tier | What it means | Implementation cost | When it's worth it |
|---|---|---|---|
| 2.0 — Verified reply-to address | A driving school supplies their own contact email; replies to automated mail route there. No DNS work, one-click confirmation. | Low | As soon as a school asks for it |
| 2.1 — Verified sender *address* | A school's own address appears in "From," platform domain remains in DKIM/SPF alignment underneath (via a provider's "on behalf of" pattern). No DNS work required from the school. | Medium | Once several schools independently ask for branded "From" |
| 2.2 — Verified tenant *domain* | A school's own domain is fully DKIM-delegated; mail is indistinguishable from the school sending it themselves. Requires the school to edit their own DNS. | High (implementation + ongoing support burden — every school's DNS competence varies) | Only for schools large/sophisticated enough to justify the support cost, likely a paid-tier feature |

Branding should evolve in this exact order — do not skip to 2.2 to save a design cycle; the research above is explicit that this is a common, costly mistake.

### Provider Abstraction Design

**No new abstraction is being designed.** `_shared/comm-providers.ts`'s existing `dispatchMessage()` pattern already is the provider abstraction layer, and it already supports Resend, SendGrid, and Mailjet for the `email` channel — the exact "current + future providers" list this sprint's brief asked for is mostly already built:

| Provider | Status |
|---|---|
| Resend | Implemented, not credentialed |
| SendGrid | **Implemented**, not credentialed (corrects this sprint's own background assumption that it's a future provider) |
| Mailjet | Implemented, not credentialed |
| Amazon SES | Not implemented — would follow the identical pattern: one new `dispatchSES()` function, one new `case 'ses':` in `dispatchMessage()`'s switch |
| Postmark | Not implemented — same pattern |
| Mailgun | Not implemented — same pattern |
| Azure Communication Services | Not implemented — same pattern |

**How a provider is replaced without touching business logic** (already true today, not a future design goal): every caller of `dispatchMessage()` passes `channel` and lets the organization's own stored `provider` preference decide which function actually runs. Swapping Resend for Postmark for one organization is a data change (that organization's stored provider preference), never a code change. This is the same reuse-before-build principle already applied once this session (Person Lookup's v2.0 refactor) and it holds here without modification.

**One genuine gap, not a redesign**: `dispatchMessage()` has no `category` parameter, so there's no way today to say "billing email must use the `billing@` sender identity regardless of what the caller passes." Closing this is a small, additive change (an optional `category` field, defaulted per the table above) — see Gap Analysis and Roadmap. It does not require restructuring the existing dispatch function, only extending it.

### Platform Integration Pattern

This isn't an email-specific pattern — it's how every external-provider integration on this platform is already built, independently arrived at at least three times before anyone wrote it down as a rule. Naming it here makes it explicit for whoever builds the next one.

| Integration | Where the pattern lives | What varies per call/tenant |
|---|---|---|
| Communication providers (email, SMS, WhatsApp, push, voice) | `_shared/comm-providers.ts` | Channel + organization's own provider choice |
| Person Lookup (personnummer) | `_shared/person-lookup.ts` (v2.0 refactor) | Provider name, resolved through a factory; canonical data model shields callers from provider-specific shapes |
| Payments | `student-portal`/`stripe-webhook`, org's own stored `stripe_secret_key` | Each organization's own credential, read from that organization's settings, not a platform-wide constant |
| BankID (future, Development Complete per the Enterprise Architecture Handbook, not yet operationally accepted) | `bankid-auth`, `_shared/bankid-client.ts` | Not yet a multi-provider case — but identity-provider integrations generally follow the same `auth_identity_links` pattern per the Handbook's P-027/ADR-007 |

**Four principles, each with a concrete example already living in this codebase — not proposed here for the first time, only named:**

1. **Provider abstraction.** Business logic calls a stable interface (`dispatchMessage()`, `getPersonLookupProvider()`); it never imports a specific vendor's SDK or calls a vendor's API directly. `students/index.ts` doesn't know Resend exists — it calls `dispatchMessage({ channel: 'email', ... })` and the org's stored preference decides the rest.
2. **Replace configuration, not business logic.** Switching a driving school from Resend to Postmark, or from Mock to a real personnummer provider, is a data change (a stored preference, a secret) — never a code change, never a redeploy of the caller. If adding a provider ever requires touching the calling code, the abstraction has leaked and should be fixed before the new provider ships.
3. **Graceful degradation.** No provider configured is a valid, handled state (`status: 'queued'` for messaging, Mock's deterministic fixtures for person lookup) — never a crash, never a 500. A caller that gets `queued` back knows exactly what happened and why; it never receives an unexplained failure.
4. **Reuse before redesign.** When a new integration is needed, the first question is "does an existing pattern already fit," not "what's the ideal design for this specific case." This document's own Provider Abstraction Design section above answered that question for email by finding the existing pattern already fit — the same question should be asked, and answered the same way by default, for the next integration too.

### Authentication Email Strategy

Supabase Auth's email is **not** part of the `comm-providers.ts` abstraction and should never be folded into it — GoTrue (Supabase's own name for its built-in authentication server, the component that issues sessions and sends Auth's emails) sends these emails itself via whatever SMTP relay is configured in the Dashboard; there is no application code in the request path to abstract. What this platform controls:

| Concern | Where it's controlled | Version 1.0 answer |
|---|---|---|
| Invitation | Dashboard → Auth → Email, template content | Default Supabase template, unmodified. Manual Swedish localization is Roadmap Stage 2; a branded/HTML redesign is unstaged — see Future Enhancements |
| Password Reset | Same | Same |
| Email Verification | Same | Same |
| Magic Links | Not currently used anywhere in this codebase (email/password is the only Auth method live; BankID is Development Complete but not activated) | Not applicable to Version 1.0 |
| Account Recovery | Same as Password Reset | Same |
| Redirect URLs | Dashboard → Auth → URL Configuration | Since the Sprint 4 Authentication Recovery Module, the frontend has real routes waiting at `/auth/reset-password` and `/auth/accept-invite` — both must be on the allowlist for both `https://advertentia.com` and `http://localhost:5173`, or GoTrue silently falls back to the default Site URL instead. **Allowlist membership itself still not independently verified as of this document** (Dashboard-only, unreadable from this environment), see `docs/PILOT_ENVIRONMENT_ARCHITECTURE_BLUEPRINT.md` Phase 5 |
| Templates | Dashboard → Auth → Email Templates | Default, unmodified — see Template Strategy below |
| Localization | Not supported by Supabase's built-in template system beyond manual per-template editing | Version 1.0 templates should be edited to Swedish directly in the Dashboard (manual, one-time, not automated) — tracked as a Roadmap item, not done as part of this architecture sprint |

### Application Email Strategy

Everything routed through `comm-providers.ts`. Version 1.0 keeps this exactly as it works today (plain string body, no attachments, no category enforcement). The attachment-capable path needed for certificates/reports/invoices/receipts **does not exist yet** — `dispatchResend()` and its siblings currently send `text` bodies only, no MIME attachment support. This is a real, identified gap (see Gap Analysis), not a design flaw — nothing in Version 1.0's actual feature set currently needs to email a PDF.

### Template Strategy

- **Branding:** none exists today beyond the plain-text bodies callers construct inline. A shared template layer (subject/body construction with the platform's visual identity) is Version 1.1+ scope — not yet assigned to a Roadmap stage, tracked under Future Enhancements until a stage is scheduled for it.
- **Localization:** Swedish is and remains the only supported language for application email in Version 1.0, consistent with the whole platform's Sweden-first posture (`CLAUDE.md`). English/future languages are explicitly not a Version 1.0 concern.
- **Accessibility / mobile responsiveness / plain-text fallback:** not applicable today (plain-text-only bodies are inherently accessible and mobile-safe — there's no HTML template to get wrong yet). Becomes relevant only once the HTML/branded template layer (Future Enhancements, unstaged) is built, at which point plain-text fallback must be part of that build, not retrofitted.

### Security Strategy

- **SPF / DKIM / DMARC:** per the research above, scoped per sending subdomain from the start (e.g., `mail.advertentia.com` for Auth+transactional in V1; category-specific subdomains only if/when Sender Strategy's reserved identities actually activate). Exact records: `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.2's runbook. **Watch the 10-DNS-lookup SPF limit** as more providers/subdomains are added over time — this is a real, silent-failure risk the research surfaced, not a theoretical one.
- **Bounce / complaint handling:** not implemented anywhere in this codebase today. Resend (and every alternative provider) exposes webhook events for bounces/complaints; wiring these back into the platform (e.g., marking a student's email as undeliverable) is Version 1.1+ scope, not required for pilot — no current workflow depends on knowing a bounce happened in real time.
- **Rate limiting / abuse prevention:** the platform's own rate limiter (`_shared/rate-limit.ts`, `docs/operational-runbook.md` §3) already covers the Edge Function layer generally; it was not designed with an email-specific abuse scenario in mind (e.g., a compromised account spamming invitations) and doing so is a Roadmap item, not a Version 1.0 gap — no evidence of abuse has ever occurred on this platform.
- **Sender reputation:** inherently protected by the subdomain-isolation strategy above — a reputation problem in one category can't cross-contaminate another, by design, once subdomains are actually split (Version 1.0 can launch on one subdomain and split later without re-architecting, since DNS additions are additive).
- **Audit logging:** `communication-worker`/`communications` already log dispatch attempts (status, provider, outcome) per the existing `dispatchMessage()` contract; Supabase Auth's own email sends are logged only within Supabase's own infrastructure, outside this platform's log aggregation — a real, accepted visibility gap, not something this platform's code can close.

### Operational Strategy

- **Monitoring:** Resend's own delivery dashboard (or the equivalent for any future provider) remains the source of truth until/unless a webhook-based ingestion layer is built (Version 1.1+, ties to bounce handling above).
- **Retry policies:** none exist today for failed sends — a `failed` status is logged, not automatically retried. Given `event-worker`'s existing tick-based architecture (`docs/operational-runbook.md` §9), a retry sweep would be a natural, small addition, not a new subsystem — Roadmap item, not required for pilot.
- **Failure handling / logging / alerting:** failure is logged (`status: 'failed'`, `error` message) but nothing currently alerts a human. Acceptable for pilot scale (a small number of organizations, closely watched); revisit before wider rollout.
- **Health checks:** the platform's own `/health` endpoint (recently fixed, `docs/DEPLOY.md`) does not currently check email provider connectivity — reasonable, since Version 1.0 has no credentialed provider to check yet. Once Resend is configured, a lightweight `validateConnection()`-style check (the same method name already used by the Person Lookup provider interface, for consistency) could be added to the health report — small, optional, Roadmap item.
- **Disaster recovery:** email providers are stateless from this platform's perspective (no data is stored there this platform depends on for recovery) — the only DR-relevant asset is the DNS records themselves, which should be documented (they will be, once created — see Roadmap Stage 1/2) so they can be reconstructed if a domain/provider ever needs to change.

---

## Gap Analysis

| Gap | Category | Priority |
|---|---|---|
| Supabase Auth has no working SMTP provider | Missing component | **Critical — this is the active pilot blocker** |
| No `category` parameter on `dispatchMessage()` | Technical debt | Medium — small, additive fix, not urgent |
| No attachment-capable send path (certificates/reports/invoices) | Missing component | Low for Version 1.0 (no current feature needs it); revisit once a feature does |
| No HTML/branded template layer for application email | Missing component | Low — plain text is functionally sufficient today |
| No bounce/complaint webhook ingestion | Missing component | Low — no current operational need |
| No retry policy for failed sends | Missing component | Low — acceptable at pilot scale |
| No multi-tenant sending identity | Future risk (not a current gap) | N/A for Version 1.0 by design |
| SPF 10-lookup ceiling not yet a constraint, but will become one | Future risk | Low now, worth remembering before adding a 4th+ email-sending integration |
| Auth email localization is manual, one-time Dashboard editing, not automated | Quick win | Low effort, do during Stage 2 |
| `docs/operational-runbook.md`'s alerting has no email-specific hook | Recommended improvement | Low |

**No gap found rises to "requires further architectural work before provisioning."** Every Critical/High item is operational (configure the SMTP provider), not architectural (design something first).

---

## Implementation Roadmap

| Stage | Scope | Effort | Depends on |
|---|---|---|---|
| **1 — Environment Provisioning** | Resend account, sending domain (`mail.advertentia.com` recommended per the subdomain-isolation research), SPF/DKIM/DMARC records | Small (human time) + DNS propagation wait | Human with Resend + DNS access — see `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.2 |
| **2 — SMTP Configuration** | Point Supabase Auth's Dashboard SMTP settings at the verified domain from Stage 1; manually localize the default Auth email templates to Swedish | Small | Stage 1 complete |
| **3 — Authentication Validation** | Resume Sprint 2B's authentication lifecycle tests (invitation, reset, confirmation, login, session, tokens) against a dedicated validation tenant | Small–Medium | Stage 2 complete; re-run the exact `curl` verification already documented in `operational-runbook.md` §13 first |
| **4 — Application Email Integration** | Add `category` parameter to `dispatchMessage()`; set `RESEND_API_KEY`; build the attachment-capable path only once a real feature (e.g., invoicing) needs it, not preemptively | Medium | Stage 1 complete (shares the same Resend account) |
| **5 — Advanced Multi-Tenant Branding** | Version 2.0/2.1 tiers from the Multi-Tenant Strategy table above | Large | Business demand from at least one real customer — do not build ahead of demand |
| **6 — Provider Abstraction (beyond email)** | Not a new abstraction to build — this is `_shared/comm-providers.ts` itself, already built, already covering SMS/WhatsApp/push on the identical pattern. "Completing" this stage means crediting real providers per `docs/INTEGRATION_CONFIGURATION_GUIDE.md`'s existing chapters as business need arises, not writing new code | Small per provider, as needed | None — already architecturally complete |

Stages 1–3 are the only ones with a genuine dependency chain. Stages 4–6 can proceed independently and opportunistically.

---

## Design Decisions & Alternatives Considered

- **Considered:** building a unified email abstraction covering both Auth and application email. **Rejected:** Supabase Auth's email path has no application-code integration point to abstract — it's entirely a Dashboard/GoTrue concern. Treating them as one system would misrepresent the actual architecture and create false expectations that "fixing comm-providers.ts" would fix Auth email.
- **Considered:** designing tenant-custom-domain support now, ahead of any customer request. **Rejected**, per the research's explicit warning against skipping tiers — Version 1.0 ships the platform-domain-only tier; the three-tier upgrade path is documented so it's not a redesign later, but nothing is built until real demand exists.
- **Considered:** a new, from-scratch provider-abstraction interface (mirroring the sprint brief's literal "design an abstraction layer" instruction). **Rejected in favor of extending `comm-providers.ts`** — a from-scratch design would duplicate a pattern that already works, already has three real provider implementations, and was explicitly validated as the right shape for exactly this kind of problem during this session's Person Lookup v2.0 refactor. Reuse-before-build.
- **Considered:** including marketing email as a first-class category. **Rejected** — legal/consent reasons (see Email Categories), and no product requirement exists for it.

## Version 1.0 Decisions

Re-reviewed for this revision (Sprint 3A): all confirmed still valid, nothing removed. Split into two groups that were previously listed together as if equally revisable — they aren't, and conflating them worked against this document's own goal of clearly separating V1 from V1.1/V2.x.

**Structural (true at every version — not "decisions" so much as facts about how Supabase and this codebase work; listed here so nobody mistakes them for a V1-only constraint that later versions might lift):**

1. Auth email and application email are two separate systems. This doesn't change at any future version — Supabase's architecture makes it permanent, not a current-version limitation.
2. `comm-providers.ts`'s existing `dispatchMessage()` pattern is the provider abstraction layer for application email — extended as new providers/categories are added, never replaced with a competing pattern.
3. Marketing email is out of scope for this platform's own send path. A future dedicated marketing tool is a separate product decision, not a evolution of this architecture.

**Version 1.0 policy choices (deliberately revisited at version boundaries — each has a named successor state in Multi-Tenant Strategy, Template Strategy, or Future Enhancements above):**

4. Every organization sends application email from the platform's own sender identities; no tenant branding of the sending address. **Successor:** Multi-Tenant Strategy's Version 2.0 → 2.2 tiers.
5. Swedish is the only supported application-email language. **Successor:** not yet designed — would need its own scoping when a real second-language requirement exists, not preemptively.
6. Plain-text application email bodies remain acceptable. **Successor:** Future Enhancements' HTML/branded template layer.

## Future Enhancements (Version 1.1+/2.x, not authorized by this document)

Every row traces back to a named Gap Analysis finding above — none of these are new ideas introduced here for the first time; this is that same list, reframed as forward-looking work instead of backward-looking gaps, with priority carried over unchanged so the two lists can't drift apart.

| Enhancement | Justification | Priority (from Gap Analysis) | Clearly outside V1 because |
|---|---|---|---|
| `category` parameter on `dispatchMessage()`, with per-category sender-identity enforcement | Closes the one real technical-debt item found in this review | Medium | No current caller needs enforced sender routing; billing has exactly one sender today by convention, not by code |
| Attachment-capable send path (certificates, reports, invoices, receipts) | No current V1 feature emails a file | Low | Blocked on a real feature requiring it existing first — building it speculatively would be exactly the scope creep this review was asked to guard against |
| HTML/branded template layer with plain-text fallback | Plain text is functionally complete today | Low | Would add a UI/design surface with no current product requirement driving it |
| Bounce/complaint webhook ingestion | No current workflow reacts to delivery failure | Low | No operational process exists yet to consume this data even if it were built |
| Retry policy for failed sends | `event-worker` already ticks on a schedule — natural extension point | Low | Acceptable failure mode at pilot scale; revisit at higher volume |
| Email-aware alerting | Nothing currently pages a human on send failure | Low | Same reasoning as retry policy — pilot scale doesn't yet need it |
| Multi-tenant Sender Strategy tiers 2.0 → 2.2 | Documented three-tier path exists so this isn't designed twice | N/A — explicitly demand-driven, not scheduled | No tenant has asked for branded sending yet; building ahead of a single real request is the exact mistake the industry research warned against |

Per the Version 1.0 Scope Freeze's classification rule, none of the above may begin implementation without first being classified as Pilot Blocker / Commercial Release Enhancement / Version 1.1 Backlog through the existing governance process — this document proposes them as a coherent future direction, it does not authorize building them.

---

## Recommendation

**Proceed to "Environment Provisioning – Email Infrastructure."** No further architectural work is required first. This document found the platform's existing shape (two separate email systems, an already-working provider-abstraction pattern for application email) to already match industry-standard practice; the only real gap is operational (Supabase Auth has no working SMTP provider configured), which Stage 1–3 of the Roadmap above resolves using the runbook already written in `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.2.
