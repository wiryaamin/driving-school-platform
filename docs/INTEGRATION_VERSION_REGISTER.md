# Integration Version Register

Permanent, append-only record of every external-integration change, kept so
any single integration can be restored to a prior working version **without
reverting any other integration or the platform as a whole**.

Governing decision (final, recorded 2026-08-10): all external integrations
are being converted to **platform-owned, platform-managed** — tenants use
the resulting business functionality only and never configure, own, or
manage an external provider directly. This register exists to make that
migration safely reversible on a per-integration basis. See
`docs/INTEGRATION_ARCHITECTURE_AUDIT_2026-08-10.md` for the audit this
register is built from — full current-state findings live there, not
duplicated here.

---

## How this register works

**One integration = one rollback unit.** Every row below is versioned and
restored independently. A change to Stripe must never be mixed into the
same commit as a change to SMS — if it is, they can no longer be reverted
separately.

**Tag naming convention:**

```
integration/<integration-key>/v<N>-<short-state>-<YYYY-MM-DD>
```

Example: `integration/payments-stripe/v1-tenant-owned-2026-08-10` →
`integration/payments-stripe/v2-platform-managed-2026-08-19`

Every tag is annotated (`git tag -a`) and points at the exact commit where
that integration's code, that specific version, is complete and verified.
Tags are never moved, deleted, or reused.

**Workflow for every future integration change:**

1. Before touching the integration: confirm the current version's tag
   exists and matches `HEAD` for the files that integration owns (see
   "Files owned" per entry below). If a v1 tag is missing for something
   about to change, create it first — never modify unversioned code.
2. Make the change as its own commit (or tight commit series) touching
   **only** that integration's files. No unrelated changes riding along.
3. Verify (typecheck/lint/build + live check — same bar as every other
   change this project makes).
4. Tag the new commit `integration/<key>/v<N+1>-...`.
5. Fill in that integration's entry below: new version row, files changed,
   migrations, RLS changes, config/secrets touched (names only), deploy
   steps taken, verification results, and — critically — the exact
   rollback procedure to get back to v<N> if v<N+1> needs to be undone.
6. Commit the register update itself, ideally in the same commit as step 2
   so the register and the code it describes never drift apart.

**Restoring an integration to a prior version** (generic procedure — each
entry's "Rollback procedure" field gives the exact commands for that
integration specifically):

- *Frontend-only files* (a settings page, a hook): 
  `git checkout <target-tag> -- <file paths>`, commit, rebuild `apps/web`,
  redeploy via the established FTP pipeline. Nothing else on the branch is
  touched.
- *Edge Function files*: 
  `git checkout <target-tag> -- supabase/functions/<name> supabase/functions/_shared/<shared file>`,
  commit, `supabase functions deploy <name> --project-ref ulgsndzfksphquqakelq`
  (add `--no-verify-jwt` only if that function is meant to be public — check
  before deploying, per the standing verify_jwt-reset gotcha).
- *Database migrations*: **migrations in this repo are append-only and are
  never edited or deleted once applied to the hosted project.** A DB-level
  rollback is never "delete the migration file" — it is always a **new
  forward migration** that reverses the effect of the one being rolled
  back (e.g. re-grant a revoked RLS policy, restore a dropped column). The
  register entry for any integration with a migration must specify exactly
  what that reverse migration needs to do, so it can be written on demand
  without re-deriving it from scratch.
- *Full integration revert spanning several commits*: 
  `git revert <newest-sha>..<oldest-sha-exclusive>` on the integration's own
  commit range (never `git reset`/force-push shared branches), or a targeted
  multi-path `git checkout <target-tag> -- <all files listed under "Files
  owned">` — either way, the "Files owned" list per entry below is what
  scopes the blast radius to that integration alone.

**What this register does NOT do:** it does not replace normal git history,
and it never rewrites, squashes, or deletes a prior checkpoint tag — those
are the actual recovery points and must survive indefinitely.

---

## Integration units tracked

Ten independently-rollbackable units, matching the audit's inventory. Three
integrations from the audit (BankID, Google Maps, Myndighetsärenden) are
**not** tracked here — they are already platform-managed with no tenant
configuration path to remove, so there is nothing to version for this
migration.

| Key | Integration | Current version | Status |
|---|---|---|---|
| `communications-sms` | SMS (46elks/Twilio/Vonage) | v2 | platform-managed |
| `communications-email` | Email (Resend/SendGrid/Mailjet) | v2 | platform-managed |
| `communications-whatsapp` | WhatsApp (Twilio/Meta) | v2 | platform-managed |
| `communications-push` | Push (Firebase/OneSignal) | v2 | platform-managed |
| `communications-voice` | Voice (Twilio/46elks) | v2 | platform-managed |
| `payments-stripe` | Stripe | v2 | dual-level (tenant-owned + identified pilot) |
| `payments-nets` | Nets | v2 | dual-level (tenant-owned + identified pilot) |
| `person-lookup` | Person Lookup (Roaring/Mock) | v1 | frozen baseline |
| `vehicle-registry` | Vehicle Registry (Biluppgifter.se/Mock) | v1 | frozen baseline |
| `accounting-fortnox` | Fortnox | v1 | frozen baseline — audit recommends excluding from this migration; tracked anyway for completeness |

All ten `v1` tags remain pointing at the frozen baseline commit
(`c8c23db`) — none were retargeted. The five `communications-*` units have
each been migrated to platform-managed `v2` (SMS, Email, WhatsApp, Push,
Voice, in that order, 2026-08-10/11). `payments-stripe`/`payments-nets`
were explicitly confirmed (2026-08-11) to be **dual-level** integrations,
architecturally distinct from the platform-managed communications
pattern — each tenant owns its own account, with an explicitly-identified
shared pilot/test default rather than a platform-owned credential; no
tag/checkpoint was created for their `v2` (not requested for that task).
`person-lookup`/`vehicle-registry`/`accounting-fortnox` remain at `v1`
pending separate decisions.

---

## `communications-sms`

### v1 — tenant-configurable (frozen baseline)

- **Tag:** `integration/communications-sms/v1-tenant-configurable-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:**
  - `supabase/functions/_shared/comm-providers.ts` (shared with every other channel — touch with care, see note below)
  - `apps/web/src/modules/communication/routes/ChannelSettingsPage.tsx` (shared UI, same caveat)
  - `apps/web/src/modules/communication/hooks/useCommunication.ts` (shared)
- **Shared-file note:** `comm-providers.ts` and `ChannelSettingsPage.tsx` are shared across all five `communications-*` units. A change scoped to SMS only must not alter the WhatsApp/Email/Push/Voice branches in these files in the same commit — if SMS's migration requires touching shared code, isolate the SMS-specific branch/case and leave the others byte-identical, or the rollback unit boundary breaks.
- **DB migrations:** none for v1 (pre-existing: `20260615153500_communication_engine.sql` created `channel_configs`; `20260725000004_channel_configs_rls_hardening.sql` set current RLS — both already applied, not part of this changeset).
- **RLS:** `channel_configs_insert`/`channel_configs_update` permit `org_owner`/`org_admin`/`org_manager` to write their org's row (all channels, not SMS-specific).
- **Config/secrets (names only):** `ELKS_API_USERNAME`, `ELKS_API_PASSWORD`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `VONAGE_API_KEY`, `VONAGE_API_SECRET` — platform-wide Supabase Secrets already set; tenant-level override via `channel_configs.metadata.credentials` (encrypted) currently unused by any real tenant (verified live 2026-08-10: zero real orgs have their own SMS credentials configured).
- **Deployment requirements:** N/A (no change from this checkpoint).
- **Verification:** live-confirmed 2026-08-10 — `dispatchMessage` successfully sent a real SMS via the platform-wide 46elks fallback for a real tenant (Horizon TS).
- **Rollback procedure:** N/A — this is the baseline, nothing to roll back to yet.

### v2 — platform-managed

- **Tag:** `integration/communications-sms/v2-platform-managed-2026-08-10`
- **Commit:** `b14fb4e2ab045e404fbb686fd23851eaa7699777`
- **Files changed:**
  - `apps/web/src/modules/communication/routes/ChannelSettingsPage.tsx` — SMS branch only: provider dropdown and credential fields replaced with a platform-managed note; enabled/from_address/display_name/daily_limit unchanged. Email/WhatsApp/Push/Voice branches byte-identical to v1.
  - `apps/web/src/modules/settings/routes/ExternalServicesPage.tsx` — `ChannelCard`'s `channel === 'sms'` branch hides the provider readout and adds a platform-managed note. `email` instantiation unchanged.
  - `supabase/functions/communications/index.ts` — channel PUT handler: for `channel === 'sms'`, ignores `body.provider`/`body.credentials` outright (never encrypted, never stored) and always preserves the existing/platform-default provider (`PLATFORM_SMS_PROVIDER`, defaults to `46elks`). Other channels' PUT logic unchanged.
  - `supabase/functions/_shared/comm-providers.ts` — `dispatchMessage`'s `case 'sms':` now calls the three SMS provider functions with an empty `creds` object instead of the org's stored credentials, forcing `cred()` to always resolve through the platform-wide `Deno.env` secret. Every other case (`email`/`whatsapp`/`push`/`voice`) unchanged.
- **DB migrations:** `20260810120000_platform_managed_sms_provider.sql` — adds `protect_channel_configs_sms_provider_fields()` + `channel_configs_protect_sms_provider` BEFORE INSERT/UPDATE trigger. Blocks any non-service-role, non-platform-admin INSERT/UPDATE from setting/changing `channel_configs.provider` or `.metadata` on the `sms` row. Defense-in-depth against a direct PostgREST write bypassing the Edge Function (which already ignores those fields for SMS); `enabled`/`from_address`/`display_name`/`daily_limit` and all non-sms rows are unaffected. Append-only — does not edit `20260725000004_channel_configs_rls_hardening.sql`.
- **RLS:** unchanged (`channel_configs_insert`/`_update` policies still exist and still nominally permit org_owner/org_admin/org_manager row-level writes to any channel — the new trigger is what actually blocks the SMS-specific columns now).
- **Config/secrets (names only):** unchanged from v1: `ELKS_API_USERNAME`, `ELKS_API_PASSWORD`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `VONAGE_API_KEY`, `VONAGE_API_SECRET` — all platform-wide Supabase Secrets. `PLATFORM_SMS_PROVIDER` (new, optional) lets the platform override the default provider (`46elks`) without a code deploy; unset in production, so both real tenants continue on `46elks` exactly as before.
- **Deployment requirements:** `supabase db push --linked` (migration applied), `supabase functions deploy communications --project-ref ulgsndzfksphquqakelq` (bare deploy — `verify_jwt` confirmed still `true` post-deploy), frontend rebuilt and synced to Hostinger (bundle `index-CXfY8C-i.js`, live-confirmed).
- **Verification (2026-08-10):** both real tenants (Sara Trafikskola, Horizon TS) still have `channel_configs.sms = {enabled: true, provider: '46elks', has_credentials: false}` unchanged after migration — dispatch continues to resolve through the platform secret with no functional regression. `pnpm typecheck` clean. `deno check` on the two touched Edge Functions shows only a pre-existing, unrelated `credential-crypto.ts` lib-version error (confirmed present on the pre-change commit via `git stash`, not introduced by this change).
- **Rollback procedure:** `git revert b14fb4e2ab045e404fbb686fd23851eaa7699777` (or check out `integration/communications-sms/v1-tenant-configurable-2026-08-10` for the 4 application files) restores tenant-configurable SMS UI/backend behavior. The DB trigger is additive and non-destructive — to remove it independently without touching application code: `DROP TRIGGER channel_configs_protect_sms_provider ON public.channel_configs; DROP FUNCTION public.protect_channel_configs_sms_provider_fields();` in a new forward migration (never edit `20260810120000` after it's applied). No tenant data was altered by v2, so rollback is purely a code/trigger reversal.

---

## `communications-email`

### v1 — tenant-configurable (frozen baseline)

- **Tag:** `integration/communications-email/v1-tenant-configurable-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:** same shared files as `communications-sms` (see that entry's shared-file note).
- **DB migrations:** none for v1 (see `communications-sms`).
- **RLS:** same `channel_configs` policies as `communications-sms`.
- **Config/secrets (names only):** `RESEND_API_KEY`, `SENDGRID_API_KEY`, `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`.
- **Deployment requirements:** N/A.
- **Verification:** N/A for this checkpoint (no dedicated live test run this session; email sends were exercised indirectly via password-reset/welcome emails throughout this session on the Resend platform fallback).
- **Rollback procedure:** N/A — baseline.

### v2 — platform-managed

- **Tag:** `integration/communications-email/v2-platform-managed-2026-08-10`
- **Commit:** `695dc4aa927af22faa0b9b9c363642146163fb68`
- **Files changed:**
  - `apps/web/src/modules/communication/routes/ChannelSettingsPage.tsx` — generalized SMS's `isSms` gate to `isPlatformManagedProvider = isSms || isEmail`; provider dropdown/credential fields replaced with a platform-managed note for both SMS and Email. enabled/from_address/display_name/daily_limit and the existing sender-domain validation (`UNVERIFIABLE_EMAIL_DOMAINS`, `EMAIL_PRIMARY_KEY_FIELD`/`senderDomainInvalid`) untouched — the "own API key + trafikcloud.se" branch is now structurally unreachable (credential input no longer exists) but was left in place rather than removed, per "preserve existing validation behavior." WhatsApp/Push/Voice branches unchanged.
  - `apps/web/src/modules/settings/routes/ExternalServicesPage.tsx` — `ChannelCard`'s `isPlatformManagedProvider` now covers `sms || email`; provider readout hidden and a platform-managed note shown for both.
  - `supabase/functions/communications/index.ts` — `PLATFORM_MANAGED_CHANNELS` now `{sms, email}`; `PLATFORM_MANAGED_DEFAULT_PROVIDER` map added (`sms: '46elks'`, `email: 'resend'`, both env-overridable via `PLATFORM_SMS_PROVIDER`/`PLATFORM_EMAIL_PROVIDER`) generalizing the single `PLATFORM_SMS_PROVIDER` constant from v1. The credential-ignoring and provider-preserving logic was already channel-generic (`isPlatformManaged`-gated) from the SMS migration, so no duplicate branch was needed.
  - `supabase/functions/_shared/comm-providers.ts` — `dispatchMessage`'s `case 'email':` now calls `dispatchResend`/`dispatchSendGrid`/`dispatchMailjet` with an empty `creds` object instead of the org's stored credentials, forcing `cred()` to always resolve through the platform-wide `Deno.env` secret. `whatsapp`/`push`/`voice` unchanged.
- **DB migrations:** `20260810130000_platform_managed_email_provider.sql` — adds `protect_channel_configs_email_provider_fields()` + `channel_configs_protect_email_provider` BEFORE INSERT/UPDATE trigger, structurally identical to but **independent from** the SMS trigger (`protect_channel_configs_sms_provider_fields`, 20260810120000) so either integration's DB protection can be rolled back without affecting the other. Blocks any non-service-role, non-platform-admin INSERT/UPDATE from setting/changing `channel_configs.provider` or `.metadata` on the `email` row only. Append-only — does not edit `20260725000004_channel_configs_rls_hardening.sql` or the SMS migration.
- **RLS:** unchanged (same as SMS v2 — `channel_configs_insert`/`_update` still nominally permit org_owner/org_admin/org_manager row-level writes; the new trigger is what blocks the email-specific columns).
- **Config/secrets (names only):** unchanged from v1: `RESEND_API_KEY`, `SENDGRID_API_KEY`, `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` — all platform-wide Supabase Secrets. `PLATFORM_EMAIL_PROVIDER` (new, optional) lets the platform override the default provider (`resend`) without a code deploy; unset in production, so both real tenants continue on `resend` exactly as before.
- **Deployment requirements:** `supabase db push --linked` (migration applied), `supabase functions deploy communications --project-ref ulgsndzfksphquqakelq` (bare deploy — `verify_jwt` confirmed still `true` post-deploy, version 87), frontend rebuilt and synced to Hostinger (bundle `index-Dh1rYF5s.js`, live-confirmed byte-identical for the two chunks containing the new platform-managed strings).
- **Verification (2026-08-10):** both real tenants (Sara Trafikskola, Horizon TS) still have `channel_configs.email = {enabled: true, provider: 'resend', has_credentials: false}` unchanged after migration — dispatch continues to resolve through the platform secret with no functional regression; `sms`/`whatsapp`/`push`/`voice` rows also confirmed unchanged for both tenants in the same read. `pnpm typecheck` clean. `deno check` on the two touched Edge Functions shows only the same pre-existing, unrelated `credential-crypto.ts` lib-version error already documented for SMS v2 (not introduced by this change). Live E2E send test: **BLOCKED** — no authenticated real-tenant or platform-admin session was available in this environment and creating one was explicitly out of scope; not manufactured. Strongest available alternative (byte-for-byte comparison of the live-served JS chunks against the built source) was performed instead.
- **Rollback procedure:** `git revert 695dc4aa927af22faa0b9b9c363642146163fb68` (or check out `integration/communications-email/v1-tenant-configurable-2026-08-10` for the 4 application files) restores tenant-configurable email UI/backend behavior. The DB trigger is additive and non-destructive, independent of the SMS trigger — to remove it independently: `DROP TRIGGER channel_configs_protect_email_provider ON public.channel_configs; DROP FUNCTION public.protect_channel_configs_email_provider_fields();` in a new forward migration (never edit `20260810130000` after it's applied). No tenant data was altered by v2, so rollback is purely a code/trigger reversal.

---

## `communications-whatsapp`

### v1 — tenant-configurable (frozen baseline)

- **Tag:** `integration/communications-whatsapp/v1-tenant-configurable-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:** same shared files as `communications-sms`, plus the newly-added `WhatsAppTab` in `apps/web/src/modules/students/routes/StudentDetailPage.tsx` (this session's own addition — self-contained, does not touch SMS/Email tabs).
- **DB migrations:** none for v1.
- **RLS:** same `channel_configs` policies.
- **Config/secrets (names only):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID`.
- **Known live issue at freeze time:** the platform-wide `META_WHATSAPP_TOKEN` was confirmed expired (Meta OAuth error code 190) as of 2026-08-09 — a temporary developer-console token, not a permanent System User token. Not fixed as part of the freeze (external credential rotation, requires Meta Business Manager access) — carried forward as a known gap, not a defect in this checkpoint's code.
- **Deployment requirements:** N/A.
- **Verification:** WhatsApp tab UI live-verified 2026-08-09; underlying Meta token send path confirmed broken (expired token) at the same time — see known issue above.
- **Rollback procedure:** N/A — baseline.

### v2 — platform-managed

- **Tag:** `integration/communications-whatsapp/v2-platform-managed-2026-08-10`
- **Commit:** `c9279e408c4fb175e3daaaa4e4ee2e1aea3e8693`
- **Pre-implementation audit findings:** no WhatsApp-specific tables exist (`channel_configs` uses the exact same generic columns as sms/email); `notification_templates` has zero rows for `channel='whatsapp'` (tenant-owned or system-default) — WhatsApp messages are sent as free-form text via the Meta Cloud API's plain `text` message type, not Meta's approved-template mechanism, so there was no template-ownership question to resolve; no dedicated WhatsApp webhook Edge Function exists in this codebase. `ExternalServicesPage.tsx` was confirmed to never render a WhatsApp card (only SMS/Email appear in the "Kommunikation" section), so it needed no change.
- **Files changed:**
  - `apps/web/src/modules/communication/routes/ChannelSettingsPage.tsx` — generalized `isPlatformManagedProvider` to `isSms || isEmail || isWhatsapp`; provider dropdown/credential fields replaced with a platform-managed note for WhatsApp too. enabled/from_address/display_name/daily_limit unchanged. Push/Voice branches byte-identical to before.
  - `supabase/functions/communications/index.ts` — `PLATFORM_MANAGED_CHANNELS` now `{sms, email, whatsapp}`; `PLATFORM_MANAGED_DEFAULT_PROVIDER` gained `whatsapp: 'meta'` (env-overridable via `PLATFORM_WHATSAPP_PROVIDER`). No new branch needed — the credential-ignoring/provider-preserving logic was already channel-generic from the SMS/Email migrations.
  - `supabase/functions/_shared/comm-providers.ts` — `dispatchMessage`'s `case 'whatsapp':` now calls `dispatchTwilioWhatsapp`/`dispatchMetaWhatsapp` with an empty `creds` object instead of the org's stored credentials, forcing `cred()` to always resolve through the platform-wide `Deno.env` secret. `push`/`voice` unchanged.
- **DB migrations:** `20260810140000_platform_managed_whatsapp_provider.sql` — adds `protect_channel_configs_whatsapp_provider_fields()` + `channel_configs_protect_whatsapp_provider` BEFORE INSERT/UPDATE trigger, structurally identical to but independent from the SMS and Email triggers (20260810120000, 20260810130000) so any one integration's DB protection can be rolled back without affecting the others. Blocks non-service-role, non-platform-admin writes to `provider`/`metadata` on the `whatsapp` row only.
- **RLS:** unchanged — same as SMS/Email v2, the new trigger is what actually blocks the whatsapp-specific columns.
- **Config/secrets (names only):** unchanged from v1: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID` — all platform-wide Supabase Secrets. `PLATFORM_WHATSAPP_PROVIDER` (new, optional) lets the platform override the default provider (`meta`) without a code deploy; unset in production, both real tenants continue on `meta`.
- **Known carried-forward issue (unrelated to this migration, not fixed):** the v1 entry above already documents that the platform-wide `META_WHATSAPP_TOKEN` was confirmed expired (Meta OAuth error 190) as of 2026-08-09 — an external credential-rotation issue requiring Meta Business Manager access, out of scope for this code migration. This means a live send would fail on the expired token regardless of this migration's changes; it is not a regression introduced here.
- **Deployment requirements:** `supabase db push --linked` (migration applied), `supabase functions deploy communications --project-ref ulgsndzfksphquqakelq` (bare deploy — `verify_jwt` confirmed still `true` post-deploy, version 88), frontend rebuilt and synced to Hostinger (bundle `index-CSQWXi4n.js`, live-confirmed byte-identical for the chunk containing the new platform-managed string).
- **Verification (2026-08-10):** both real tenants (Sara Trafikskola, Horizon TS) still have `channel_configs.whatsapp = {enabled: true, provider: 'meta', has_credentials: false}` unchanged after migration; `sms`/`email`/`push`/`voice` rows also confirmed unchanged for both tenants in the same read. `pnpm typecheck` clean. `deno check` shows only the same pre-existing, unrelated `credential-crypto.ts` error already documented for SMS/Email v2. Live E2E send test: **BLOCKED** — no authenticated real-tenant or platform-admin session was available and creating one was explicitly out of scope; not manufactured (also would have failed regardless on the known-expired `META_WHATSAPP_TOKEN` above). Strongest available alternative (byte-for-byte comparison of the live-served JS chunk against the built source) was performed instead.
- **Rollback procedure:** `git revert c9279e408c4fb175e3daaaa4e4ee2e1aea3e8693` (or check out `integration/communications-whatsapp/v1-tenant-configurable-2026-08-10` for the application files) restores tenant-configurable WhatsApp UI/backend behavior. The DB trigger is additive and non-destructive, independent of the SMS/Email triggers — to remove it independently: `DROP TRIGGER channel_configs_protect_whatsapp_provider ON public.channel_configs; DROP FUNCTION public.protect_channel_configs_whatsapp_provider_fields();` in a new forward migration. No tenant data was altered by v2.

---

## `communications-push`

### v1 — tenant-configurable (frozen baseline)

- **Tag:** `integration/communications-push/v1-tenant-configurable-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:** same shared files as `communications-sms`, plus `apps/web/src/shared/hooks/usePushSubscription.ts`.
- **DB migrations:** none for v1.
- **RLS:** same `channel_configs` policies.
- **Config/secrets (names only):** `FIREBASE_SERVICE_ACCOUNT_JSON`, `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY`.
- **Deployment requirements:** N/A.
- **Verification:** not exercised this session — carried from prior baseline unchanged.
- **Rollback procedure:** N/A — baseline.

### v2 — platform-managed

- **Tag:** `integration/communications-push/v2-platform-managed-2026-08-10`
- **Commit:** `f2951faeea9439944936a6f61549c22d66bc8b39`
- **Pre-implementation audit findings:** `channel_configs.push` uses the exact same generic columns as sms/email/whatsapp — no push-specific config table. `push_device_tokens` (FCM/OneSignal device registration tokens, `apps/web/src/shared/hooks/usePushSubscription.ts` + `_shared/push-tokens.ts`) is a *separate* table, unrelated to `channel_configs` — already RLS-enabled with **zero** policies for `authenticated`/`anon` (only `service_role` has `GRANT SELECT/INSERT/UPDATE`), so direct tenant/user PostgREST access was already fully blocked before this migration; device tokens are recipient-addressing data (like a phone number), not provider credentials, and were not touched. Client-side Firebase Web config (`VITE_FIREBASE_API_KEY`/`PROJECT_ID`/`MESSAGING_SENDER_ID`/`APP_ID`/`VAPID_KEY`, `apps/web/src/core/push/index.ts`) is build-time, platform-only configuration — never tenant-configurable or stored per-org, so nothing to remove there. `notification_templates` has 11 system-default (`organization_id IS NULL`) rows for `channel='push'` and zero tenant-owned rows for either real tenant — untouched. No dedicated push webhook/callback function exists.
- **Files changed:**
  - `apps/web/src/modules/communication/routes/ChannelSettingsPage.tsx` — generalized `isPlatformManagedProvider` to `isSms || isEmail || isWhatsapp || isPush`; provider dropdown/credential fields replaced with a platform-managed note for Push too. enabled/from_address/display_name/daily_limit unchanged. Voice branch byte-identical to before.
  - `supabase/functions/communications/index.ts` — `PLATFORM_MANAGED_CHANNELS` now `{sms, email, whatsapp, push}`; `PLATFORM_MANAGED_DEFAULT_PROVIDER` gained `push: 'firebase'` (env-overridable via `PLATFORM_PUSH_PROVIDER`, matching the documented "approved production push architecture"). No new branch needed — logic was already channel-generic from the SMS/Email/WhatsApp migrations. The separate `POST/DELETE /communications/push/register` device-token routes (`registerPushToken`/`revokePushToken`) were not touched.
  - `supabase/functions/_shared/comm-providers.ts` — `dispatchMessage`'s `case 'push':` now calls `dispatchFirebase`/`dispatchOneSignal` with an empty `creds` object instead of the org's stored credentials, forcing `cred()` to always resolve through the platform-wide `Deno.env` secret. `voice` unchanged.
- **DB migrations:** `20260810150000_platform_managed_push_provider.sql` — adds `protect_channel_configs_push_provider_fields()` + `channel_configs_protect_push_provider` BEFORE INSERT/UPDATE trigger, structurally identical to but independent from the SMS/Email/WhatsApp triggers (20260810120000/130000/140000) so any one integration's DB protection can be rolled back without affecting the others. Blocks non-service-role, non-platform-admin writes to `provider`/`metadata` on the `push` row only. `push_device_tokens` was not touched (already service-role-only).
- **RLS:** unchanged — same as SMS/Email/WhatsApp v2, the new trigger is what actually blocks the push-specific columns.
- **Config/secrets (names only):** unchanged from v1: `FIREBASE_SERVICE_ACCOUNT_JSON`, `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY` — all platform-wide Supabase Secrets. `PLATFORM_PUSH_PROVIDER` (new, optional) lets the platform override the default provider (`firebase`) without a code deploy; unset in production.
- **Deployment requirements:** `supabase db push --linked` (migration applied), `supabase functions deploy communications --project-ref ulgsndzfksphquqakelq` (bare deploy — `verify_jwt` confirmed still `true` post-deploy, version 89), frontend rebuilt and synced to Hostinger (bundle `index-DWUYsKOX.js`, live-confirmed byte-identical for the chunk containing the new platform-managed string).
- **Verification (2026-08-10):** both real tenants (Sara Trafikskola, Horizon TS) still have `channel_configs.push = {enabled: false, provider: null, has_credentials: false}` unchanged after migration (push has never been activated by either); `sms`/`email`/`whatsapp`/`voice` rows also confirmed unchanged for both tenants in the same read; zero active `push_device_tokens` rows for either tenant (push was never activated, consistent). `pnpm typecheck` clean. `deno check` shows only the same pre-existing, unrelated `credential-crypto.ts` error already documented for SMS/Email/WhatsApp v2. Live E2E send test: **BLOCKED** — no authenticated real-tenant/platform-admin session and no registered device token for either real tenant (push disabled, zero device registrations); not manufactured. Strongest available alternative (byte-for-byte comparison of the live-served JS chunk against the built source) was performed instead.
- **Provider credential status:** platform-wide `FIREBASE_SERVICE_ACCOUNT_JSON`/`ONESIGNAL_*` secrets are presumed configured (Edge Function has no live-test evidence either way this session, since push is disabled for both real tenants) — not verified as valid/expired in this migration, unlike WhatsApp's known-expired-token finding. Flagged as unverified, not broken.
- **Rollback procedure:** `git revert f2951faeea9439944936a6f61549c22d66bc8b39` (or check out `integration/communications-push/v1-tenant-configurable-2026-08-10` for the application files) restores tenant-configurable Push UI/backend behavior. The DB trigger is additive and non-destructive, independent of the SMS/Email/WhatsApp triggers — to remove it independently: `DROP TRIGGER channel_configs_protect_push_provider ON public.channel_configs; DROP FUNCTION public.protect_channel_configs_push_provider_fields();` in a new forward migration. No tenant data was altered by v2.

---

## `communications-voice`

### v1 — tenant-configurable (frozen baseline)

- **Tag:** `integration/communications-voice/v1-tenant-configurable-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:** same shared files as `communications-sms`.
- **DB migrations:** none for v1.
- **RLS:** same `channel_configs` policies.
- **Config/secrets (names only):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ELKS_API_USERNAME`, `ELKS_API_PASSWORD`.
- **Deployment requirements:** N/A.
- **Verification:** not exercised this session — carried from prior baseline unchanged. Lowest-usage channel per the audit (no evidence of active tenant use).
- **Rollback procedure:** N/A — baseline.

### v2 — platform-managed

- **Tag:** `integration/communications-voice/v2-platform-managed-2026-08-10`
- **Commit:** `dbe8d5bb23d8f3226e8f8b9936b421d87f4cdb16`
- **Pre-implementation audit findings:** Voice in this codebase is outbound-only text-to-speech (TTS) via 46elks (reusing the same `ELKS_API_USERNAME`/`PASSWORD` platform secret as SMS) or Twilio (reusing the same `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`PHONE_NUMBER` platform secret as SMS/WhatsApp), delivered via an inline TwiML `<Say>`. No telephone-number provisioning/ownership table exists anywhere in the schema; for the Twilio path, caller ID was already hard-coded to prefer the platform's own `TWILIO_PHONE_NUMBER` secret over any tenant `from_address` (`dispatchTwilioVoice`: `cred(creds,'TWILIO_PHONE_NUMBER') ?? from`) — already effectively platform-controlled before this migration. No call recording, no inbound calling, no call routing, no voicemail, and no dedicated webhook/callback function exist for voice anywhere in this codebase (confirmed by exhaustive search). Both real tenants: `enabled=false, provider=null, from_address=null, has_credentials=false` — voice has never been activated by either. Zero call history (`outbound_messages`) and zero `notification_templates` rows (tenant-owned or system-default) exist for `channel='voice'`. No STOP condition from the audit checklist (tenant credentials, telephone-number ownership, caller-ID conflict, recording ownership, inbound-call architecture, webhook ownership) applied — none of those features exist to conflict with platform-managed Voice.
- **Files changed:**
  - `apps/web/src/modules/communication/routes/ChannelSettingsPage.tsx` — generalized `isPlatformManagedProvider` to include `isVoice` (now all five channels). Provider dropdown/credential fields replaced with a platform-managed note for Voice too. The top-of-page banner (previously accurate for whichever channels were still tenant-configurable) was rewritten now that it would otherwise describe a capability — "select a provider, enter your own credentials" — that no longer exists for any of the five cards on the page.
  - `supabase/functions/communications/index.ts` — `PLATFORM_MANAGED_CHANNELS` now `{sms, email, whatsapp, push, voice}` (all channels); `PLATFORM_MANAGED_DEFAULT_PROVIDER` gained `voice: '46elks'` (env-overridable via `PLATFORM_VOICE_PROVIDER`), chosen to match SMS's already-proven-live 46elks credentials since voice has never been activated by a real tenant and so has no existing value to preserve. No new branch needed — logic was already channel-generic.
  - `supabase/functions/_shared/comm-providers.ts` — `dispatchMessage`'s `case 'voice':` now calls `dispatch46elksVoice`/`dispatchTwilioVoice` with an empty `creds` object. With all five channels now hardcoding `{}`, the per-org credential lookup (`getOrgChannelCredentials`, and its `createServiceClient`/`decryptCredential` imports) had zero remaining callers and was removed rather than left as a dead DB round-trip + decrypt attempt on every single dispatch call. This left `dispatchMessage` with no direct `await` in its own body (deno-lint `require-await`) — fixed honestly by awaiting each `return dispatch*(...)` tail call rather than suppressing the rule.
  - `supabase/functions/communication-worker/index.ts` — **not modified** (zero diff), but **redeployed** alongside `communications` so the `comm-providers.ts` shared-file change is live on both dispatch paths that matter. Audited all six `dispatchMessage` callers across the codebase: `communication-worker` is the only one besides `communications` that passes `organizationId` (the queue/rule-triggered dispatch path); `demo-requests`, `platform-admin`, `public-booking`, `public-enrollment`, and `trial-signup` all omit it (platform-owned sends), so their behavior is provably identical whether their bundled `comm-providers.ts` is stale or fresh — left un-redeployed as genuinely unaffected, not as an oversight.
  - `apps/web/src/modules/settings/routes/ExternalServicesPage.tsx` — **not touched**, confirmed it never rendered a Voice card.
- **DB migrations:** `20260811100000_platform_managed_voice_provider.sql` — adds `protect_channel_configs_voice_provider_fields()` + `channel_configs_protect_voice_provider` BEFORE INSERT/UPDATE trigger, structurally identical to but independent from the SMS/Email/WhatsApp/Push triggers (20260810120000/130000/140000/150000) so any one integration's DB protection can be rolled back without affecting the others. Blocks non-service-role, non-platform-admin writes to `provider`/`metadata` on the `voice` row only.
- **RLS:** unchanged — same as the other four v2 migrations, the new trigger is what actually blocks the voice-specific columns.
- **Config/secrets (names only):** unchanged from v1: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ELKS_API_USERNAME`, `ELKS_API_PASSWORD` — all platform-wide Supabase Secrets, all already shared with SMS/WhatsApp. `PLATFORM_VOICE_PROVIDER` (new, optional) lets the platform override the default provider (`46elks`) without a code deploy; unset in production.
- **Deployment requirements:** `supabase db push --linked` (migration applied), `supabase functions deploy communications --project-ref ulgsndzfksphquqakelq` (bare deploy — `verify_jwt` confirmed still `true`, version 90) and `supabase functions deploy communication-worker --no-verify-jwt --project-ref ulgsndzfksphquqakelq` (`--no-verify-jwt` preserved its correct `false` setting, version 86), frontend rebuilt and synced to Hostinger (bundle `index-CiNQOS0u.js`, live-confirmed byte-identical for the chunk containing the new platform-managed voice string and the updated banner text).
- **Verification (2026-08-10/11):** both real tenants (Sara Trafikskola, Horizon TS) still have `channel_configs.voice = {enabled: false, provider: null, has_credentials: false}` unchanged after migration (voice has never been activated by either); `sms`/`email`/`whatsapp`/`push` rows also confirmed unchanged for both tenants in the same read. `pnpm typecheck` clean. `deno check` shows only the same pre-existing, unrelated `credential-crypto.ts` error already documented for the other four v2 migrations. `deno lint` on both touched files: clean (the `require-await` issue introduced by removing the dead credential lookup was fixed, not suppressed). Live E2E call test: **BLOCKED** — no authenticated real-tenant/platform-admin session and no valid test scenario exists (voice disabled, no telephone number configured, for either real tenant); not manufactured. Strongest available alternative (byte-for-byte comparison of the live-served JS chunk against the built source) was performed instead.
- **Provider credential status:** platform-wide `ELKS_API_USERNAME`/`PASSWORD` are presumed valid (SMS live-tested successfully this session on the same credentials); `TWILIO_*` credentials were not independently verified — neither was exercised by a real voice call this migration.
- **Telephone-number status:** no telephone numbers were purchased, released, transferred, or otherwise modified — none exist as a provisioned resource in this codebase to begin with.
- **Recording status:** not applicable — no recording feature exists in this codebase.
- **Rollback procedure:** `git revert dbe8d5bb23d8f3226e8f8b9936b421d87f4cdb16` (or check out `integration/communications-voice/v1-tenant-configurable-2026-08-10` for the application files) restores tenant-configurable Voice UI/backend behavior — note this would also revert the `getOrgChannelCredentials` removal, restoring the per-org credential-lookup code path for all five channels (harmless either way, since no tenant has ever stored one). The DB trigger is additive and non-destructive, independent of the other four triggers — to remove it independently: `DROP TRIGGER channel_configs_protect_voice_provider ON public.channel_configs; DROP FUNCTION public.protect_channel_configs_voice_provider_fields();` in a new forward migration. No tenant data was altered by v2.

---

## `payments-stripe`

### v1 — tenant-owned (frozen baseline)

- **Tag:** `integration/payments-stripe/v1-tenant-owned-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:**
  - `supabase/functions/stripe-credentials/index.ts`
  - `supabase/functions/stripe-webhook/index.ts`
  - `supabase/functions/payments/index.ts` (Stripe-specific branches only — shared with Nets, isolate on future change)
  - `apps/web/src/modules/settings/routes/CompanySettingsPage.tsx` (Stripe section only — shared file with Nets section, isolate on future change)
- **DB migrations:** none new for v1 (existing `organizations.settings` JSONB fields `stripe_secret_key`, `stripe_secret_key_masked`, `stripe_webhook_secret`, `stripe_webhook_secret_masked`, `stripe_pilot_configuration`, `stripe_publishable_key`).
- **RLS:** `organizations_update_own_admin` (requires `administration:organization:update`) governs the underlying `settings` write; `organizations_select_own` permits any org member to read the (encrypted) `settings` blob.
- **Config/secrets (names only):** `STRIPE_SECRET_KEY` (platform-wide fallback secret, currently unused as fallback — every configured tenant uses their own key per ADR-022), per-org encrypted `stripe_secret_key`/`stripe_webhook_secret` in `organizations.settings`.
- **Architectural note carried from audit:** this is the one integration where "platform-managed" is a payment-processing/settlement decision, not just a credential-hiding one. Any tenant with a real connected Stripe account has real transaction history tied to it — migrating requires a settlement/cutover plan, not a schema change.
- **Deployment requirements:** N/A.
- **Verification:** N/A for this checkpoint.
- **Rollback procedure:** N/A — baseline.

### v2 — dual-level (tenant-owned + explicitly-identified pilot default)

**Approved architectural decision (2026-08-11), superseding the "fully platform-managed" direction considered earlier:** Stripe and Nets are **dual-level** payment integrations, not platform-managed like SMS/Email/WhatsApp/Push/Voice.

- **PLATFORM:** TrafikCloud may have its own Stripe/Nets account, reserved for future TrafikCloud-owned/platform transactions. **Not implemented** — no such flow exists in this codebase (confirmed by audit; `_shared/subscription.ts` explicitly does not handle billing, and `subscription_tier` is only ever changed by manual Platform Admin action).
- **TENANT:** each tenant may independently configure its own Stripe/Nets account, established under its own commercial agreement, using its own credentials.
- **PILOT:** TrafikCloud may continue to provide a shared test/sandbox default for pilot/demo purposes, but it must be explicitly identified as TrafikCloud's own pilot/test configuration — never presented as the tenant's account.
- **Business model:** tenant payment transactions belong to the tenant's own provider account and settlement. TrafikCloud does not currently take a platform transaction fee and does not act as merchant of record for tenant payments. No Stripe Connect, marketplace payments, or revenue-share functionality exists or was implemented.
- **No tag/checkpoint created for this change** (not requested for this task, unlike the platform-managed migrations above) — see commit below.
- **Commit:** `d1f0d054741c70771a1d187288069e8f9630479d`
- **Files changed:**
  - `supabase/functions/stripe-credentials/index.ts` — GET/POST now compute and return `stripe_state: 'not_connected' | 'pilot' | 'tenant_owned'` from the existing `settings.stripe_pilot_configuration` flag (already written by `trial-provisioning.ts`, previously never read anywhere). Saving a non-empty tenant key now explicitly sets `stripe_pilot_configuration = false`; clearing a key deletes the flag entirely (reverts to `not_connected`).
  - `supabase/functions/nets-credentials/index.ts` — identical pattern for `nets_pilot_configuration`/`nets_state`. Saving either the secret key or the checkout key with a non-empty value un-pilots the whole Nets configuration (the two fields are a functional pair, not independently pilot-tracked).
  - `apps/web/src/modules/settings/routes/CompanySettingsPage.tsx` (Stripe/Nets sections only) — new `PaymentProviderStateBanner` renders one of three states above each provider's credential fields: "Stripe/Nets är inte anslutet" (not connected), an amber "TrafikClouds pilot-/testkonfiguration är aktiv... inte er skolas eget [X]-konto" banner (pilot), or a green "Er skolas [X]-konto är anslutet" banner (tenant-owned).
- **`_shared/trial-provisioning.ts`: inspected, not modified.** The sandbox-copy step already set `stripe_pilot_configuration`/`nets_pilot_configuration = true` correctly at copy time — the gap was entirely that nothing downstream read the flag, not that the copy itself was silent/unmarked at the data level. No change was needed there once the credential-management layer and UI were fixed to read it.
- **DB migrations:** none — reused the existing `organizations.settings` JSONB fields exactly as the task required ("prefer reusing existing fields... do not create unnecessary database structures").
- **RLS:** unchanged.
- **Runtime payment resolution:** unchanged. `payments/index.ts`, `student-portal/index.ts`, `stripe-webhook`, `nets-webhook` still resolve `org's own settings value ?? platform Deno.env fallback` exactly as before — this already satisfied "tenant-owned → if present, else pilot/platform fallback" per the approved model, so it was intentionally left untouched.
- **Verification (2026-08-11):** both real tenants confirmed unchanged (`stripe_pilot_configuration`/`nets_pilot_configuration` still `true`, credentials still the shared sandbox copy); the new state-computation logic was replicated read-only against live data and correctly resolves both to `'pilot'` for both providers. `pnpm typecheck` clean; `deno check` shows only the same pre-existing, unrelated `credential-crypto.ts` error documented throughout this session; `deno lint` found one pre-existing, unrelated unused-import warning in `stripe-credentials/index.ts` (`decryptCredential`, present before this change, confirmed via `git stash`) — not touched, out of scope. Live bundle byte-identical to the built source for the chunk containing the new banner strings. Live authenticated write test (actually saving a tenant credential): **not attempted** — no authenticated tenant session available, and doing so would require either a real Stripe/Nets key or bypassing the existing live-validation check, both out of scope/unsafe per this task's explicit production-safety constraints.
- **Rollback procedure:** `git revert d1f0d054741c70771a1d187288069e8f9630479d` — restores the previous (pilot/owned-indistinguishable) behavior; no data was altered, so rollback is a pure code reversal.

---

## `payments-nets`

### v1 — tenant-owned (frozen baseline)

- **Tag:** `integration/payments-nets/v1-tenant-owned-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:**
  - `supabase/functions/nets-credentials/index.ts`
  - `supabase/functions/payments/index.ts` (Nets-specific branches only — shared with Stripe, isolate on future change)
  - `apps/web/src/modules/settings/routes/CompanySettingsPage.tsx` (Nets section only — shared file, isolate on future change)
- **DB migrations:** none new for v1 (existing `organizations.settings` fields `nets_secret_key`, `nets_secret_key_masked`, `nets_checkout_key`, `nets_checkout_key_masked`, `nets_pilot_configuration`).
- **RLS:** same as `payments-stripe`.
- **Config/secrets (names only):** `NETS_ENV`, `NETS_SECRET_KEY` (platform-wide fallback), per-org encrypted `nets_secret_key`/`nets_checkout_key`.
- **Same settlement-decision note as `payments-stripe`.**
- **Deployment requirements:** N/A.
- **Verification:** N/A for this checkpoint.
- **Rollback procedure:** N/A — baseline.

### v2 — dual-level (tenant-owned + explicitly-identified pilot default)

Same approved architectural decision, same commit, same verification as `payments-stripe` v2 above — see that entry for the full PLATFORM/TENANT/PILOT/business-model documentation, which applies identically to Nets. Nets-specific detail: `supabase/functions/nets-credentials/index.ts` now computes `nets_state` from `settings.nets_pilot_configuration`; saving either `nets_secret_key` or `nets_checkout_key` with a real value un-pilots the pair (they are tracked as one unit, not independently). No platform Nets webhook was implemented (out of scope — no platform Nets transaction flow exists to require one); the existing tenant-only `POST /nets-webhook/{organization_id}` route is unchanged.

- **Commit:** `d1f0d054741c70771a1d187288069e8f9630479d`
- **No tag/checkpoint created** — see `payments-stripe` v2 entry.

---

## `person-lookup`

### v1 — tenant-configurable (frozen baseline)

- **Tag:** `integration/person-lookup/v1-tenant-configurable-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:**
  - `supabase/functions/person-lookup-config/index.ts`
  - `supabase/functions/_shared/person-lookup.ts`
  - `supabase/functions/_shared/person-lookup-service.ts`
  - `supabase/functions/_shared/person-lookup-cache.ts`
  - `apps/web/src/modules/students/hooks/usePersonLookup.ts`
  - `apps/web/src/modules/settings/routes/ExternalServicesPage.tsx` (`PersonLookupCard`/`PersonLookupConfigDialog` only — shared file with Vehicle Registry/Fortnox cards, isolate on future change)
- **DB migrations:** none new for v1 (existing: `20260727000001_person_lookup_framework.sql` created `person_lookup_provider_configs`, `person_lookup_cache`, `person_lookup_provider_health`).
- **RLS:** `person_lookup_provider_configs_insert`/`_update` permit `org_owner`/`org_admin`/`org_manager` to write their org's row.
- **Config/secrets (names only):** `PERSON_LOOKUP_PROVIDER` (platform-wide fallback selector), per-org encrypted `client_id`/`client_secret` for the Roaring provider.
- **Known live issue at freeze time:** Roaring integration confirmed live 2026-08-09 to be running on the free developer **sandbox** tier (dummy fixture data only) — real personnummer lookups correctly return "not found" via a working, correctly-authenticated call. Not a code defect; requires activating Roaring's paid production tier (external/commercial action) to return real data. Relevant to the platform-managed migration since production Roaring credentials, once obtained, would be the one platform-wide secret feeding every tenant.
- **Deployment requirements:** N/A.
- **Verification:** live-confirmed 2026-08-09 (OAuth2 token exchange + API call both succeed against Roaring sandbox).
- **Rollback procedure:** N/A — baseline.

### v2 — *(pending)*

---

## `vehicle-registry`

### v1 — tenant-configurable (frozen baseline)

- **Tag:** `integration/vehicle-registry/v1-tenant-configurable-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:**
  - `supabase/functions/vehicle-registry-config/index.ts`
  - `supabase/functions/_shared/vehicle-registry.ts`
  - `supabase/functions/_shared/vehicle-registry-service.ts`
  - `apps/web/src/modules/resources/hooks/useVehicleRegistryLookup.ts`
  - `apps/web/src/modules/settings/routes/ExternalServicesPage.tsx` (`VehicleRegistryCard`/`VehicleRegistryConfigDialog` only — shared file, isolate on future change)
- **DB migrations:** none new for v1 (existing: `20260727000002_vehicle_registry_framework.sql` created `vehicle_registry_provider_configs`, `vehicle_registry_cache`, `vehicle_registry_provider_health`).
- **RLS:** `vehicle_registry_provider_configs_insert`/`_update` permit `org_owner`/`org_admin`/`org_manager` to write their org's row.
- **Config/secrets (names only):** `VEHICLE_REGISTRY_PROVIDER` (platform-wide fallback selector), per-org encrypted `api_key` for the Biluppgifter.se provider.
- **Deployment requirements:** N/A.
- **Verification:** not exercised this session — no active tenant configs found live (verified 2026-08-10 during the audit).
- **Rollback procedure:** N/A — baseline.

### v2 — *(pending)*

---

## `accounting-fortnox`

### v1 — tenant-owned (frozen baseline)

- **Tag:** `integration/accounting-fortnox/v1-tenant-owned-2026-08-10`
- **Commit:** `c8c23db5af85a0ab75309afd78ad6462c115685b`
- **Files owned:**
  - `supabase/functions/fortnox/index.ts`
  - `apps/web/src/modules/finance/routes/FortnoxPage.tsx`
  - `apps/web/src/modules/finance/hooks/useFortnoxStatus` (and related Fortnox hooks)
  - `apps/web/src/modules/settings/routes/ExternalServicesPage.tsx` (`FortnoxCard` only — shared file, isolate on future change)
- **DB migrations:** none new for v1 (existing `organizations.settings.fortnox_oauth`, plus `fortnox_customer_sync`/`fortnox_invoice_sync`/`fortnox_payment_sync` tables).
- **RLS:** same `organizations_update_own_admin`/`_select_own` as the payments entries, plus whatever RLS governs the `fortnox_*_sync` tables (not separately re-verified this pass — carry forward from the original audit if this unit is ever touched).
- **Config/secrets (names only):** `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET` (platform-wide OAuth app registration — already platform-owned), per-org encrypted OAuth `access_token`/`refresh_token` in `organizations.settings.fortnox_oauth` (genuinely tenant-owned — each trafikskola's own separate Fortnox subscription).
- **Recommendation carried from audit:** exclude this integration from the platform-managed conversion. A trafikskola's Fortnox account is their own accounting-software subscription tied to their own Swedish org number — the platform cannot legally/practically own that relationship the way it can pool an SMS or lookup API. Tracked here for completeness only; treat as BUSINESS FUNCTION, not a conversion candidate, unless a later decision explicitly overrides this.
- **Deployment requirements:** N/A.
- **Verification:** N/A for this checkpoint.
- **Rollback procedure:** N/A — baseline.

### v2 — *(pending)*
