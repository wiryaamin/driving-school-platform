# External Integration Architecture Audit — 2026-08-10

Read-only audit against the frozen baseline (`pilot-baseline-2026-08-10`,
commit `c8c23db5af85a0ab75309afd78ad6462c115685b`). No code, schema, or
config was modified as part of this audit. Findings verified directly
against code, the database schema/migrations, and live production state —
not assumed from other documentation.

Governing decision this audit was produced to support (final, recorded
2026-08-10): all external integrations are being converted to
**platform-owned, platform-managed** — tenants use the resulting business
functionality only and never configure, own, or manage an external
provider directly.

See `docs/INTEGRATION_VERSION_REGISTER.md` for the per-integration
rollback checkpoints this audit's findings were used to establish.

---

## 1. Complete Integration Inventory

| # | Integration | Category | Current Classification |
|---|---|---|---|
| 1 | SMS (46elks / Twilio / Vonage) | Communications | **TENANT-EXPOSED** |
| 2 | Email (Resend / SendGrid / Mailjet) | Communications | **TENANT-EXPOSED** |
| 3 | WhatsApp (Twilio / Meta Cloud API) | Communications | **TENANT-EXPOSED** |
| 4 | Push (Firebase FCM / OneSignal) | Communications | **TENANT-EXPOSED** |
| 5 | Voice (Twilio / 46elks) | Communications | **TENANT-EXPOSED** |
| 6 | Stripe (card payments) | Payments | **TENANT-EXPOSED** / TENANT-DATA |
| 7 | Nets (Swish/card checkout) | Payments | **TENANT-EXPOSED** / TENANT-DATA |
| 8 | Person Lookup — Roaring (population registry) | Identity | **TENANT-EXPOSED** |
| 9 | Vehicle Registry — Biluppgifter.se | Vehicles | **TENANT-EXPOSED** |
| 10 | Fortnox (accounting sync) | Accounting | **BUSINESS FUNCTION** *(nuanced — see §4)* |
| 11 | BankID (login) | Identity/Auth | **PLATFORM-MANAGED** (already correct) |
| 12 | Google Maps | Infra | **PLATFORM-MANAGED** (already correct, build-time only) |
| 13 | Myndighetsärenden (Transportstyrelsen/Trafikverket) | Regulatory | **PLATFORM-MANAGED** (already correct — no external API, manual tracking) |
| 14 | Visma (accounting) | Accounting | **UNUSED/LEGACY** — placeholder card only, "planned for V1.1," no code exists |
| 15 | Google Calendar sync | Scheduling | **UNUSED/LEGACY** — placeholder card only, not built |
| 16 | Microsoft 365 sync | Scheduling | **UNUSED/LEGACY** — placeholder card only, not built |

Items 14–16 are `ComingSoonCard` entries in `ExternalServicesPage.tsx` with
zero backing implementation — confirmed via grep, no Edge Function or
table exists for any of them.

## 2. Current Ownership / Configuration Location

**Communications (#1–5)** — table `channel_configs` (one row per
`organization_id` + `channel`). Tenant credentials, if set, live in
`metadata.credentials` (JSON, values encrypted via `credential-crypto.ts`).
Resolution order in `_shared/comm-providers.ts`'s `cred()`: tenant's own
stored credential first, falls back to a platform-wide Supabase Secret
(e.g. `TWILIO_ACCOUNT_SID`) if the tenant never configured their own. Live
verification (2026-08-10) found every real tenant currently riding the
platform-wide fallback already — zero tenants have their own SMS/email
credentials configured.

**Stripe / Nets (#6–7)** — `organizations.settings` JSONB, per-org,
encrypted, written only through dedicated `stripe-credentials` /
`nets-credentials` Edge Functions (ADR-022 pattern — replaced a legacy
plaintext direct-write path). Each tenant enters and owns their own
Stripe/Nets account's live secret key — this is explicitly a tenant-owned
merchant account today, not a platform-pooled one. `organizations.settings`
also carries `*_pilot_configuration` flags — confirmed live on at least one
real tenant — meaning some tenants are currently running on a shared
pilot/test key as a stopgap, not their own.

**Person Lookup (#8)** — table `person_lookup_provider_configs`, per-org,
`active_provider` ('mock'/'roaring') + encrypted `client_id`/`client_secret`.
No config row → falls back to platform-wide `PERSON_LOOKUP_PROVIDER` secret
+ Mock default.

**Vehicle Registry (#9)** — table `vehicle_registry_provider_configs`,
identical structural pattern to Person Lookup (`active_provider`
'mock'/'biluppgifter' + encrypted `api_key`).

**Fortnox (#10)** — `organizations.settings.fortnox_oauth`
(`access_token`/`refresh_token`, encrypted), populated via a real OAuth
"Connect" flow. The OAuth app itself (`FORTNOX_CLIENT_ID`/
`FORTNOX_CLIENT_SECRET`) is platform-wide already — only the per-tenant
authorization (their own Fortnox account) is tenant-owned.

**BankID (#11)** — fully platform-wide: one relay (`BANKID_RELAY_URL`/
`BANKID_RELAY_SECRET`), no `organization_id` scoping anywhere in
`bankid-client.ts`. Already matches the target model.

**Google Maps (#12)** — `VITE_GOOGLE_MAPS_API_KEY`, a frontend build-time
env var baked into the bundle. Structurally cannot be tenant-configured;
already platform-controlled.

## 3. Tenant-Facing Exposure

Two settings pages carry essentially all of the exposure:

- **`ExternalServicesPage.tsx`** (Settings → Externa tjänster) — a full
  "integrations hub." Directly names providers ("Roaring",
  "Biluppgifter.se", "Fortnox", "Visma") and links out to each provider's
  configuration screen. The BankID and Myndighetsärenden cards are already
  correctly presented as platform-managed/status-only — a useful existing
  pattern to reuse for everything else.
- **`ChannelSettingsPage.tsx`** (Settings → Kommunikation → Kanaler) — the
  most exposed surface in the app. A provider dropdown per channel
  (`46elks (Sverige)`, `Twilio`, `Vonage`, `Resend`, `SendGrid`, `Mailjet`,
  `Twilio WhatsApp`, `Meta Cloud API`, `Firebase (FCM)`, `OneSignal`), plus
  raw credential input fields labeled with the literal env-var-style names
  (`Account SID (Twilio)`, `API-nyckel (Resend)`, etc.) and a live
  "send test message" action.
- **`CompanySettingsPage.tsx`** (Settings → Företagsuppgifter →
  Betalningar) — "Stripe (kortbetalning)" section with literal fields
  "Stripe Secret Key" and "Stripe Webhook Signing Secret"; equivalent Nets
  section.
- **`FortnoxPage.tsx`** (Finance → Fortnox) — OAuth connect/disconnect UI,
  appropriate to keep as-is (Fortnox is inherently the tenant's own
  external account — see §4).
- **`PersonLookupConfigDialog`/`VehicleRegistryConfigDialog`** (inside
  `ExternalServicesPage.tsx`) — provider dropdown + Client ID/Secret or
  API key fields, with copy like *"Roaring kräver ett Client ID + Client
  Secret från er Roaring-sandlåda (developer.roaring.io)"* and
  *"Biluppgifter.se kräver en API-nyckel — kontakta deras säljteam"* —
  tenants are explicitly told to go get their own third-party credentials.
- **Trial onboarding wizard, step 8 (Ekonomi)** — one sentence of body
  copy: *"Väljer ni kortbetalning fungerar det direkt med Trafikclouds
  pilot-/testkonfiguration (Nets och Stripe) — koppla ert eget konto under
  Inställningar → Företagsuppgifter → Betalningar när ni är redo för skarp
  drift."* This is the only onboarding-time mention of providers by name;
  no onboarding question asks about provider choice — the wizard's
  `channels` field is just booleans (email/sms/whatsapp/invoice_notifications
  enabled), no provider selection at signup.
- No other onboarding step, no "Kom igång" dashboard page, and no Business
  Discovery flow reference any provider by name (verified by grep — clean).

## 4. Required Changes to Reach the Platform-Managed Model

- **Communications**: remove the provider dropdown + credential fields
  from `ChannelSettingsPage.tsx`; keep only the enable/disable toggle and
  (if wanted) a business-facing display name/sender identity. Stop reading
  `metadata.credentials` per-tenant in `comm-providers.ts` — collapse to
  platform-secret-only resolution (`cred()` already supports this as a
  fallback; the change is to stop offering the tenant override, not the
  underlying mechanism).
- **Stripe/Nets**: the most consequential one. Today each tenant's
  checkout genuinely runs against their own Stripe/Nets merchant account.
  Moving to platform-owned payments doesn't just hide a settings field —
  it means every tenant's payment processing account changes to a
  platform-pooled one, which has real implications for settlement, payout
  destination, and Swedish accounting (whose bank account receives the
  money, VAT/invoicing implications, PCI/agreement terms with
  Stripe/Nets). This needs an explicit business decision on the
  payment/settlement model before any UI change.
- **Person Lookup / Vehicle Registry**: remove provider dropdown +
  credential fields from their config dialogs; convert both cards to the
  same read-only "platform_managed" presentation already used for
  BankID/Myndighetsärenden. Backend already supports a platform-secret
  fallback, so functionally this mostly means removing tenant write-access
  to the config tables and always resolving to the platform provider.
- **Fortnox**: recommend explicitly excluding this from the
  platform-managed conversion. Fortnox is each trafikskola's own separate
  accounting-software subscription (their own Swedish org-number-tied
  bookkeeping system) — the platform cannot legally/practically "own" a
  tenant's individual Fortnox relationship the way it can pool SMS or
  lookup API usage. This should stay classified as BUSINESS FUNCTION
  (tenant connects their own account), unless the intended scope is
  broader than "external integrations" and actually means replacing
  Fortnox with a platform-native accounting export instead.
- **Onboarding copy**: the one sentence in step 8 needs rewriting to drop
  "Nets och Stripe" / "koppla ert eget konto" once the payment model
  decision above is made.
- **`ExternalServicesPage.tsx`**: convert every card except Fortnox to the
  platform_managed presentation pattern already established by
  BankID/Myndighetsärenden — this page's own existing design already
  shows what the target state should look like.

## 5. Security/RLS Implications

- `channel_configs`, `person_lookup_provider_configs`,
  `vehicle_registry_provider_configs` all currently grant
  `org_owner`/`org_admin`/`org_manager` INSERT+UPDATE on their own org's
  row (confirmed identical pattern across all three RLS migrations).
  Removing tenant configurability means revoking these write policies (or
  narrowing them to just the `enabled` toggle) — a real RLS change, not
  just a frontend hide.
- `organizations_select_own` lets any org member (any role) read the full
  `organizations` row, including the encrypted `settings` blob holding
  Stripe/Nets/Fortnox credentials. Values are encrypted, so this isn't
  plaintext exposure, but it's broader read access than the dedicated
  `stripe-credentials`/`nets-credentials` GET endpoints intentionally
  provide (masked-only). Worth tightening if/when these fields move off
  `organizations.settings` entirely.
- None of this touches authentication or the lifecycle-column trigger
  added 2026-08-09 (`protect_organization_lifecycle_columns`) — that
  trigger doesn't cover `settings`.

## 6. Data Migration Implications

- **Stripe/Nets**: any tenant currently on a real connected account
  (verified their own key, live-tested) has real transaction history tied
  to that account. Migrating them to a platform-pooled account is not a
  data migration in the DB sense — it's a live payment-processing cutover
  requiring a transition plan per tenant, not a schema change.
- **Comms/Person Lookup/Vehicle Registry**: low risk. Live-checked
  2026-08-10 — zero tenants have their own credentials configured for
  comms or person-lookup providers on real orgs (all riding the platform
  fallback already); Vehicle Registry has no active tenant configs
  either. Removing the tenant-credential path here is close to a no-op
  for existing data — mostly a UI/RLS change, minimal migration.
- **Fortnox**: if kept tenant-owned (recommended), no migration needed at
  all.

## 7. Risks and Dependencies

- The Stripe/Nets pilot-configuration flags (`stripe_pilot_configuration`/
  `nets_pilot_configuration`) already seen on at least one real tenant
  suggest some tenants are already running on a shared/pilot key as a
  stopgap — worth confirming this doesn't conflict with or duplicate
  whatever platform-pooled model gets designed.
- `comm-providers.ts`'s `cred()` fallback-to-platform-secret behavior
  already exists and is exercised in production today (confirmed live),
  which is good — it means the "platform-managed" mechanism for comms is
  largely already built; the remaining work is almost entirely UI/RLS
  removal, not new backend plumbing.
- No usage/cost tracking exists today for any of these integrations beyond
  `channel_configs.daily_limit` (a send-rate cap, not cost accounting) and
  provider-health/cache tables (uptime, not spend). If the platform is now
  absorbing shared cost across all tenants, per-tenant usage visibility
  doesn't exist yet and would need to be designed.
- Fortnox's category mismatch (genuinely tenant-owned by nature vs. the
  other tenant-configurable integrations, which are pooled-cost-service by
  nature) is the one place this audit recommends not applying the blanket
  platform-managed conversion without an explicit decision first.
