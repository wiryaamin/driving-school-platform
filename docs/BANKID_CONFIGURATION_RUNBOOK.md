# BankID Configuration Runbook

Status: **WAITING FOR EXTERNAL DEPENDENCY**
Produced during the Configuration Environment Exercise, 2026-07-22.

This runbook is the complete, self-contained procedure for taking the BankID subsystem from its current state (fully implemented, unconfigured) through to Frozen/Operationally Validated. It requires no further code changes — implementation was inspected and confirmed complete and architecturally correct. Everything below is configuration and verification only.

---

## A. External Prerequisites

| Item | Status | Notes |
|---|---|---|
| BankID Relying Party Agreement | **Not held** | Arranged through the pilot school's business bank, or directly via BankID/Finansiell ID-Teknik BID AB's onboarding process ("Bli ansluten" / "Become a relying party"). This is the root blocker — every item below depends on it. |
| Test environment access | Not held | Typically faster to obtain than production; free. Recommended starting point. |
| Production environment access | Not held | Only needed once test validation is complete. |
| Required approvals | Business-side only | No internal engineering approval gate exists beyond this runbook itself. |
| Required certificates | Not held | Issued as part of the Relying Party Agreement — see Section B. |

## B. Required Configuration Items

| Parameter | Required? | Platform-wide / Tenant-specific |
|---|---|---|
| `BANKID_CLIENT_CERT` | Required | Platform-wide |
| `BANKID_CLIENT_KEY` | Required | Platform-wide |
| `BANKID_CA_CERT` | Required | Platform-wide |
| `BANKID_ENV` | Optional (defaults to `test`) | Platform-wide |
| `IDENTITY_ENCRYPTION_KEY` / `IDENTITY_HASH_KEY` | Required | **Already configured — no action needed.** Confirmed live via `supabase secrets list`. |
| `VITE_FEATURE_BANKID` | Optional, currently inert | Not consulted anywhere in the frontend yet — noted for awareness, not a blocker. |

No additional BankID-specific variables exist — confirmed via a full-repository scan of every `Deno.env.get()` call.

## C. Exact Expected Format

Source: `supabase/functions/_shared/bankid-client.ts:82-86` — `Deno.createHttpClient({ certChain, privateKey, caCerts })`. This is Deno's native TLS API, and the code passes each secret straight from `Deno.env.get()` with **no decoding step**.

- **`BANKID_CLIENT_CERT`**: Raw PEM text, including headers — `-----BEGIN CERTIFICATE-----` ... `-----END CERTIFICATE-----`. **Not base64-encoded** (unlike `IDENTITY_ENCRYPTION_KEY` elsewhere in this codebase — a natural but incorrect assumption to avoid).
- **`BANKID_CLIENT_KEY`**: Raw PEM text — `-----BEGIN PRIVATE KEY-----` ... `-----END PRIVATE KEY-----`.
- **`BANKID_CA_CERT`**: Raw PEM text. If BankID issues a multi-certificate chain (root + intermediate), **all certificates must be concatenated into one string** (multiple `BEGIN/END CERTIFICATE` blocks back to back) — the code wraps this in a single-element array (`caCerts: [BANKID_CA_CERT]`), not one array entry per certificate.
- **`BANKID_ENV`**: Literal string `test` or `prod`. Any other value (including unset) resolves to `test` — a safe default, not an error state.

## D. Configuration Procedure

1. **Obtain values**: from the bank/BID as part of the Relying Party Agreement (Section A). They will be issued as certificate/key files (often `.pem` directly, sometimes `.p12`/`.pfx` requiring conversion to PEM first — if so, conversion happens before this step, outside this platform).
2. **Store values**: because these are multi-line PEM strings, use an env file, not an inline command (inline `KEY=value` breaks on embedded newlines in most shells):
   ```bash
   # Create a temporary, gitignored env file (never commit this)
   cat > /tmp/bankid_secrets.env <<'EOF'
   BANKID_CLIENT_CERT=-----BEGIN CERTIFICATE-----
   ...(full PEM content)...
   -----END CERTIFICATE-----
   BANKID_CLIENT_KEY=-----BEGIN PRIVATE KEY-----
   ...(full PEM content)...
   -----END PRIVATE KEY-----
   BANKID_CA_CERT=-----BEGIN CERTIFICATE-----
   ...(full PEM content, concatenated if multi-cert)...
   -----END CERTIFICATE-----
   BANKID_ENV=test
   EOF

   supabase secrets set --env-file /tmp/bankid_secrets.env --project-ref ulgsndzfksphquqakelq

   # Delete immediately after — secrets must never persist on disk
   rm /tmp/bankid_secrets.env
   ```
3. **Deployment**: no redeploy of `bankid-auth` is required — Supabase Edge Function secrets are injected at request time, not baked in at deploy time. (If any *code* change were ever made to `bankid-auth` or `_shared/bankid-client.ts`, redeploy with `--no-verify-jwt` — this function is intentionally public per its own routing needs, and a bare deploy can silently reset that flag.)
4. **Verification after installation**: confirm via `supabase secrets list --project-ref ulgsndzfksphquqakelq` that all four names appear (values are never retrievable, only presence/hash) — then proceed to the Runtime Verification Checklist below.

## E. Runtime Verification Checklist

Run in this order; each step depends on the previous succeeding.

1. **Secret availability** — `supabase secrets list` shows all three certificate secrets present.
2. **mTLS client creation** — call `POST /bankid-auth/init` with `{"purpose":"login"}` and no Authorization header; a response other than `503 not_configured` confirms `bankidConfigured()` passed and `Deno.createHttpClient()` did not throw. (If it throws, `bankid-client.ts`'s own defensive handling logs a distinct "mTLS unsupported in this runtime" error — check Edge Function logs specifically for that string, since it indicates a Supabase-platform-level constraint, not a certificate problem.)
3. **Connection to BankID Test** — a successful `init` response contains `orderRef`, `autoStartUrl`, `qrData` — this proves the mTLS handshake to `appapi2.test.bankid.com` succeeded.
4. **Authentication request** — use a real BankID test-environment app/credentials (BankID provides test identities for this) to scan the QR code or trigger the `autoStartUrl` deep link.
5. **Polling** — call `POST /bankid-auth/collect` with the `orderRef`; expect `status: pending` with a `hintCode` while the test app hasn't completed the flow yet.
6. **Completion** — once the test identity completes authentication in the BankID app, `collect` should return `status: complete`.
7. **Identity linkage** — for a first-time login with no existing `auth_identity_links` row, expect `linked: false` with the "no account linked" message (correct, not a bug — an admin must link an account first via `purpose: 'link'` on an authenticated session). For a pre-linked identity, expect `linked: true` with a `tokenHash`.
8. **Session creation** — exchange the returned `tokenHash` via `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` (already implemented in `useBankidLogin.ts`) and confirm a real session/JWT results.
9. **Audit logging** — query `identity_events` (or wherever `recordIdentityEvent()` writes) and confirm `bankid.authentication_started`, `login.success`, and `session.created` rows exist for the test run, each with the correct `correlation_id` tying them together.

## F. Production Migration Checklist

Only after every step in Section E has passed against the **test** environment:

1. Obtain production certificates through the same Relying Party Agreement process (production issuance typically requires the test integration to already be working).
2. Replace `BANKID_CLIENT_CERT` / `BANKID_CLIENT_KEY` / `BANKID_CA_CERT` with the production values, using the same `--env-file` procedure in Section D.
3. Switch `BANKID_ENV=prod`.
4. Re-run the entire Runtime Verification Checklist (Section E) against production — do not assume test success carries over; production is a distinct BankID environment with its own certificate trust chain.
5. **Rollback procedure**: if production verification fails at any step, revert by re-running `supabase secrets set --env-file` with the test values and `BANKID_ENV=test`. Since Edge Function secrets take effect immediately with no redeploy, rollback is effectively instantaneous — there is no partial/mixed state to clean up beyond re-setting the four values.

---

## Configuration Status Report

| Stage | Status |
|---|---|
| Inspection | ✅ Complete |
| Configuration Analysis | ✅ Complete |
| Configuration Execution | ⏸ Not started — blocked |
| Validation | ⏸ Not started |
| Implementation | N/A — no defects found, no code changes required |
| Operational Validation | ⏸ Not started |
| Freeze | ⏸ Not reached |

**Blocking Item:** BankID Relying Party Agreement and certificate package (`BANKID_CLIENT_CERT`, `BANKID_CLIENT_KEY`, `BANKID_CA_CERT`) — not yet obtained.

**Next Required Action:** Initiate the BankID Relying Party Agreement process (via the pilot school's business bank, or directly with BankID/Finansiell ID-Teknik BID AB), requesting **test environment** access first.

**Responsible Party:** Product Owner / business stakeholder — this action cannot be performed by engineering; it requires a formal business relationship BankID grants only to a real, verified relying party.

---

## Classification

**WAITING FOR EXTERNAL DEPENDENCY.**

This is explicitly not a software defect, not an implementation issue, and not a configuration failure. Inspection and Configuration Analysis both confirm the implementation is complete, correct, and architecturally consistent with the rest of the platform (existing identity domain, existing session issuance, existing audit taxonomy — no bespoke systems). The subsystem is fully ready to resume from **Configuration Execution** the moment the certificate package becomes available, using this runbook's Section D onward with no re-inspection needed.

---

## Handover

The BankID subsystem is paused here. When the certificate package arrives, resume directly at **Section D (Configuration Procedure)** of this runbook — Sections A–C remain valid reference material and do not need to be re-derived.

The Configuration Environment Exercise pauses awaiting Product Owner approval before beginning the next subsystem.
