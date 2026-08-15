/**
 * Communication provider abstraction.
 *
 * SMS/WhatsApp/Push/Voice, and Email's default (Resend), are platform-managed
 * (ADR: platform-managed integrations) — every dispatch* call for those below
 * is invoked with an empty credentials object, so cred() always resolves
 * through the platform-wide Deno.env value (Supabase Secrets). Tenants can
 * no longer save their own provider credentials for those (enforced in
 * communications/index.ts's channel PUT handler and by a per-channel DB
 * trigger); see cred() below.
 *
 * Exception (Hybrid model, Tenant SMTP Email V1, 2026-08-15): a tenant may
 * opt an org's email channel into provider='smtp', supplying their own SMTP
 * relay credentials. This is the one genuinely per-organization credential
 * path left in this file — see getOrgSmtpCredentials()/dispatchSMTP() below.
 * Every other channel/provider combination is unaffected.
 *
 * Integrated providers:
 *   sms      → 46elks      ELKS_API_USERNAME + ELKS_API_PASSWORD
 *   email    → Resend       RESEND_API_KEY (platform-managed default)
 *   email    → SMTP         Tenant-owned relay — SMTP_HOST/PORT/SECURITY/USERNAME/PASSWORD,
 *                           stored per-org in channel_configs.metadata.credentials
 *   whatsapp → Twilio       TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_NUMBER
 *   whatsapp → Meta         META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID
 *   push     → Firebase     FIREBASE_SERVICE_ACCOUNT_JSON (FCM HTTP v1 — the
 *                           legacy server-key API was shut down by Google
 *                           2024-06-20 and is not supported)
 *   push     → OneSignal    ONESIGNAL_APP_ID + ONESIGNAL_API_KEY
 *   voice    → 46elks       ELKS_API_USERNAME + ELKS_API_PASSWORD (reused)
 *   voice    → Twilio       TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER
 *
 * Voice calls use TTS (not conversational AI). Push "to" field = device token.
 * WhatsApp "to" field = E.164 phone number without whatsapp: prefix.
 */

import { createServiceClient } from './supabase.ts';
import { decryptCredential }   from './credential-crypto.ts';

export type ProviderResult = {
  status:     'sent' | 'failed' | 'queued';
  providerId: string | null;
  error:      string | null;
  /** Set when the provider reported the recipient address/token itself is invalid
   *  (e.g. FCM UNREGISTERED/NOT_FOUND) — callers holding a persistent token store
   *  (see _shared/push-tokens.ts) should revoke it so future dispatch stops retrying. */
  invalidToken?: boolean;
};

// ─── Platform credentials ───────────────────────────────────────────────────
// Every channel is platform-managed — cred() only ever resolves the
// platform-wide Deno.env secret now (every caller passes {} as creds). The
// signature is unchanged so a future genuinely-org-scoped credential could
// still be threaded through without touching every dispatch* call site.

/** Org-configured value if present, else the platform-wide Supabase Secret. */
function cred(creds: Record<string, string>, key: string): string | undefined {
  return creds[key] || Deno.env.get(key) || undefined;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function missingCreds(...keys: string[]): ProviderResult {
  return { status: 'failed', providerId: null, error: `Missing secrets: ${keys.join(', ')}` };
}

function httpErr(provider: string, status: number, body: string): ProviderResult {
  return { status: 'failed', providerId: null, error: `${provider} ${status}: ${body}` };
}

function caught(e: unknown, provider?: string): ProviderResult {
  // No provider fetch() call in this file previously set an explicit
  // request timeout — a hung provider would only surface as the Deno Edge
  // Function platform's own generic timeout, with no attribution to which
  // provider caused it. AbortSignal.timeout() below turns that into a
  // specific, fast, attributable failure instead.
  const isTimeout = e instanceof DOMException && e.name === 'TimeoutError';
  const label = provider ? `${provider} ` : '';
  if (isTimeout) return { status: 'failed', providerId: null, error: `${label}request timed out` };
  return { status: 'failed', providerId: null, error: e instanceof Error ? e.message : String(e) };
}

const PROVIDER_TIMEOUT_MS = 15_000;

// Email bodies are plain text almost everywhere in this platform, but a
// growing number of callers pass HTML — some a full document
// (ContractSheet.tsx's generated enrollment contract), most an HTML
// *fragment* like demo-requests/index.ts's `<p>...</p>` welcome/notification
// emails. The original check only matched a full document's
// `<!doctype html>`/`<html>` wrapper, so any fragment (no wrapper tags) fell
// through to the plain-text branch and arrived in the inbox as a literal
// wall of visible `<p>`/`<strong>` markup — the exact same symptom this
// function was first written to fix, just for a different HTML shape,
// confirmed live 2026-08-03. Detecting any HTML tag anywhere in the body
// (not just a leading document wrapper) catches fragments and full
// documents alike. Detecting on the body itself (not a new caller-supplied
// flag) keeps every existing plain-text call site unchanged.
function isHtmlBody(body: string): boolean {
  return /<[a-z][^>]*>/i.test(body);
}

// GSM/SMS spec: a numeric sender ("+46701234567") can be up to 15 digits,
// but an alphanumeric sender name ("Din Trafikskola") is capped at 11
// characters by every SMS gateway (46elks confirmed live 2026-08-06: 403
// "Too long alphanumeric from number" on every send once a school's full
// name was saved as the sender). Kanalinställningar now blocks saving a
// too-long name, but this truncates defensively for any value already
// stored before that validation existed, so sends degrade rather than fail.
const SMS_ALPHA_SENDER_MAX = 11;
function normalizeSmsSender(from: string): string {
  const trimmed = from.trim();
  if (/^\+?\d+$/.test(trimmed)) return trimmed; // phone number — no alphanumeric limit applies
  return trimmed.slice(0, SMS_ALPHA_SENDER_MAX);
}

// Converts a Swedish local-format number ("0701234567") to E.164
// ("+46701234567") — every gateway (46elks/Twilio/Vonage) requires E.164
// and rejects the local format outright. Anything already starting with
// "+", or not matching the Swedish trunk-0 pattern, is left untouched
// (already E.164, or a non-Swedish/malformed number the provider itself
// should reject with its own specific error rather than being silently
// reinterpreted).
function normalizeSwedishPhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return trimmed;
  if (/^0\d{6,}$/.test(trimmed)) return `+46${trimmed.slice(1)}`;
  return trimmed;
}

// ─── SMS: 46elks ──────────────────────────────────────────────────────────────
// Docs: https://46elks.se/docs/send-sms
// Secrets: ELKS_API_USERNAME, ELKS_API_PASSWORD

async function dispatch46elksSms(creds: Record<string, string>, to: string, from: string, body: string): Promise<ProviderResult> {
  const username = cred(creds, 'ELKS_API_USERNAME');
  const password = cred(creds, 'ELKS_API_PASSWORD');
  if (!username || !password) return missingCreds('ELKS_API_USERNAME', 'ELKS_API_PASSWORD');

  const form = new URLSearchParams();
  form.set('from',    normalizeSmsSender(from) || 'Trafikcloud');
  form.set('to',      to);
  form.set('message', body);

  try {
    const res = await fetch('https://api.46elks.com/a1/sms', {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${btoa(`${username}:${password}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) return httpErr('46elks-sms', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { id?: string };
    return { status: 'sent', providerId: data.id ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── Email: Resend ────────────────────────────────────────────────────────────
// Docs: https://resend.com/docs/api-reference/emails/send-email
// Secret: RESEND_API_KEY

async function dispatchResend(creds: Record<string, string>, to: string, from: string, subject: string | undefined, body: string): Promise<ProviderResult> {
  const apiKey = cred(creds, 'RESEND_API_KEY');
  if (!apiKey) return missingCreds('RESEND_API_KEY');

  const fromAddr = from.includes('@') ? from : `Trafikcloud <noreply@trafikcloud.se>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    fromAddr,
        to:      [to],
        subject: subject?.trim() || '(Inget ämne)',
        ...(isHtmlBody(body) ? { html: body } : { text: body }),
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return httpErr('resend', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { id?: string };
    return { status: 'sent', providerId: data.id ?? null, error: null };
  } catch (e) { return caught(e, 'resend'); }
}

// ─── WhatsApp: Twilio ─────────────────────────────────────────────────────────
// Docs: https://www.twilio.com/docs/whatsapp/api
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER

async function dispatchTwilioWhatsapp(creds: Record<string, string>, to: string, from: string, body: string): Promise<ProviderResult> {
  const sid    = cred(creds, 'TWILIO_ACCOUNT_SID');
  const token  = cred(creds, 'TWILIO_AUTH_TOKEN');
  const number = cred(creds, 'TWILIO_WHATSAPP_NUMBER') ?? from;
  if (!sid || !token || !number) return missingCreds('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER');

  const waTo   = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const waFrom = number.startsWith('whatsapp:') ? number : `whatsapp:${number}`;

  const form = new URLSearchParams();
  form.set('To',   waTo);
  form.set('From', waFrom);
  form.set('Body', body);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) return httpErr('twilio-whatsapp', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { sid?: string };
    return { status: 'sent', providerId: data.sid ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── WhatsApp: Meta Cloud API ─────────────────────────────────────────────────
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
// Secrets: META_WHATSAPP_TOKEN, META_PHONE_NUMBER_ID

async function dispatchMetaWhatsapp(creds: Record<string, string>, to: string, body: string): Promise<ProviderResult> {
  const token       = cred(creds, 'META_WHATSAPP_TOKEN');
  const phoneNumId  = cred(creds, 'META_PHONE_NUMBER_ID');
  if (!token || !phoneNumId) return missingCreds('META_WHATSAPP_TOKEN', 'META_PHONE_NUMBER_ID');

  // Strip whatsapp: prefix and + for Meta API (expects digits only)
  const toClean = to.replace(/^whatsapp:/, '').replace(/^\+/, '');

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumId}/messages`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   toClean,
        type: 'text',
        text: { body },
      }),
    });
    if (!res.ok) return httpErr('meta-whatsapp', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { messages?: Array<{ id: string }> };
    return { status: 'sent', providerId: data.messages?.[0]?.id ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── Push: Firebase (FCM HTTP v1) ──────────────────────────────────────────────
// Docs: https://firebase.google.com/docs/cloud-messaging/migrate-v1
// Secret: FIREBASE_SERVICE_ACCOUNT_JSON — the full service-account JSON key
//   file (Firebase Console → Project Settings → Service Accounts → Generate
//   new private key), stored as one secret containing the raw JSON string.
// Note: "to" field should be the FCM device registration token, obtained
//   client-side via getToken() and persisted through _shared/push-tokens.ts.
//
// The legacy server-key HTTP API (fcm.googleapis.com/fcm/send) was
// permanently shut down by Google on 2024-06-20 and cannot be used — FCM
// HTTP v1 requires an OAuth2 access token obtained via a service-account
// JWT-bearer exchange (RFC 7523), not a static key.

interface FirebaseServiceAccount {
  project_id:   string;
  client_email: string;
  private_key:  string;
}

let cachedFcmAccessToken: { token: string; expiresAt: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Exchanges the service-account JWT for a short-lived OAuth2 access token, cached in-memory across warm invocations. */
async function getFcmAccessToken(serviceAccount: FirebaseServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedFcmAccessToken && cachedFcmAccessToken.expiresAt > now + 60) {
    return cachedFcmAccessToken.token;
  }

  const header  = { alg: 'RS256', typ: 'JWT' };
  const claims  = {
    iss:   serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`FCM OAuth2 token exchange failed: ${res.status} ${await res.text().catch(() => res.statusText)}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedFcmAccessToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

async function dispatchFirebase(creds: Record<string, string>, to: string, subject: string | undefined, body: string): Promise<ProviderResult> {
  const serviceAccountJson = cred(creds, 'FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) return missingCreds('FIREBASE_SERVICE_ACCOUNT_JSON');

  let serviceAccount: FirebaseServiceAccount;
  try {
    const parsed = JSON.parse(serviceAccountJson) as Partial<FirebaseServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      return { status: 'failed', providerId: null, error: 'FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id/client_email/private_key' };
    }
    serviceAccount = parsed as FirebaseServiceAccount;
  } catch {
    return { status: 'failed', providerId: null, error: 'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON' };
  }

  const sendWithToken = (accessToken: string) =>
    fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      // webpush.data only — a top-level `notification` field was tried
      // as a defensive addition and found (via live commissioning) to be
      // an actual defect: when both are present, FCM nests the raw
      // webpush payload as {notification: {...}, data: {...}} instead of
      // the flat {title, body, url} shape our hand-written push handler
      // (apps/web/public/sw.js) parses — so `data.title`/`data.body` come
      // back undefined and showNotification() falls back to its generic
      // "Meddelande"/empty-body defaults. Chrome then also has enough
      // information from the bare `notification` field to synthesize its
      // OWN blank-content system notification independent of our SW logic,
      // which is what was actually appearing. webpush.data alone restores
      // the flat shape our SW expects. Explicit `headers.TTL`/`Urgency`
      // fixed a separate, real commissioning defect: without them, the Web
      // Push spec (RFC 8030) defaults TTL to 0 ("deliver now or drop"),
      // which silently discarded every message unless the browser happened
      // to be actively connected at the exact instant of send.
      body: JSON.stringify({
        message: {
          token: to,
          webpush: {
            headers: {
              TTL:     '2419200',
              Urgency: 'high',
            },
            data: {
              title: subject?.trim() || 'Meddelande',
              body,
              url: '/',
            },
          },
        },
      }),
    });

  try {
    let accessToken = await getFcmAccessToken(serviceAccount);
    let res = await sendWithToken(accessToken);

    // The in-memory cache's expiry is proactive (renews 60s early), but a
    // token can still be rejected before its natural expiry (isolate reuse
    // across a clock skew edge, external revocation). On a 401, drop the
    // cache and retry exactly once with a freshly minted token rather than
    // returning a failure that would otherwise repeat on every call until
    // the stale cache entry naturally expires (up to ~1h).
    if (res.status === 401) {
      cachedFcmAccessToken = null;
      accessToken = await getFcmAccessToken(serviceAccount);
      res = await sendWithToken(accessToken);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => res.statusText);
      // FCM v1 reports an unregistered/expired token as 404 UNREGISTERED, or
      // sometimes 400 INVALID_ARGUMENT with a registration-token message.
      const invalidToken = res.status === 404 || /UNREGISTERED|registration.?token/i.test(errBody);
      return { status: 'failed', providerId: null, error: `firebase ${res.status}: ${errBody}`, invalidToken };
    }

    const data = await res.json() as { name?: string };
    return { status: 'sent', providerId: data.name ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── Push: OneSignal ──────────────────────────────────────────────────────────
// Docs: https://documentation.onesignal.com/reference/create-notification
// Secrets: ONESIGNAL_APP_ID, ONESIGNAL_API_KEY
// Note: "to" field should be the OneSignal player_id.

async function dispatchOneSignal(creds: Record<string, string>, to: string, subject: string | undefined, body: string): Promise<ProviderResult> {
  const appId  = cred(creds, 'ONESIGNAL_APP_ID');
  const apiKey = cred(creds, 'ONESIGNAL_API_KEY');
  if (!appId || !apiKey) return missingCreds('ONESIGNAL_APP_ID', 'ONESIGNAL_API_KEY');

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id:             appId,
        include_player_ids: [to],
        headings:           { en: subject?.trim() || 'Meddelande' },
        contents:           { en: body },
      }),
    });
    if (!res.ok) return httpErr('onesignal', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { id?: string };
    return { status: 'sent', providerId: data.id ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── SMS: Twilio ─────────────────────────────────────────────────────────────
// Docs: https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

async function dispatchTwilioSms(creds: Record<string, string>, to: string, from: string, body: string): Promise<ProviderResult> {
  const sid    = cred(creds, 'TWILIO_ACCOUNT_SID');
  const token  = cred(creds, 'TWILIO_AUTH_TOKEN');
  const number = cred(creds, 'TWILIO_PHONE_NUMBER') ?? from;
  if (!sid || !token || !number) return missingCreds('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER');

  const form = new URLSearchParams();
  form.set('From', normalizeSmsSender(number));
  form.set('To',   to);
  form.set('Body', body);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) return httpErr('twilio-sms', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { sid?: string };
    return { status: 'sent', providerId: data.sid ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── SMS: Vonage ──────────────────────────────────────────────────────────────
// Docs: https://developer.vonage.com/en/messaging/sms/code-snippets/send-an-sms
// Secrets: VONAGE_API_KEY, VONAGE_API_SECRET

async function dispatchVonageSms(creds: Record<string, string>, to: string, from: string, body: string): Promise<ProviderResult> {
  const apiKey    = cred(creds, 'VONAGE_API_KEY');
  const apiSecret = cred(creds, 'VONAGE_API_SECRET');
  if (!apiKey || !apiSecret) return missingCreds('VONAGE_API_KEY', 'VONAGE_API_SECRET');

  try {
    const res = await fetch('https://rest.nexmo.com/sms/json', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:    apiKey,
        api_secret: apiSecret,
        from:       from.trim() || 'Trafikcloud',
        to,
        text:       body,
      }),
    });
    if (!res.ok) return httpErr('vonage-sms', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { messages?: Array<{ 'message-id'?: string; status?: string; 'error-text'?: string }> };
    const msg = data.messages?.[0];
    if (msg?.status !== '0') {
      return { status: 'failed', providerId: null, error: msg?.['error-text'] ?? `Vonage status ${msg?.status ?? 'unknown'}` };
    }
    return { status: 'sent', providerId: msg?.['message-id'] ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── Email: SendGrid ──────────────────────────────────────────────────────────
// Docs: https://docs.sendgrid.com/api-reference/mail-send/mail-send
// Secret: SENDGRID_API_KEY

async function dispatchSendGrid(creds: Record<string, string>, to: string, from: string, subject: string | undefined, body: string): Promise<ProviderResult> {
  const apiKey = cred(creds, 'SENDGRID_API_KEY');
  if (!apiKey) return missingCreds('SENDGRID_API_KEY');

  const fromEmail = from.includes('@') ? from : 'noreply@trafikcloud.se';

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from:    { email: fromEmail },
        subject: subject?.trim() || '(Inget ämne)',
        content: [{ type: isHtmlBody(body) ? 'text/html' : 'text/plain', value: body }],
      }),
    });
    // SendGrid returns 202 Accepted with no body on success
    if (res.status === 202) return { status: 'sent', providerId: res.headers.get('x-message-id'), error: null };
    return httpErr('sendgrid', res.status, await res.text().catch(() => res.statusText));
  } catch (e) { return caught(e); }
}

// ─── Email: Mailjet ───────────────────────────────────────────────────────────
// Docs: https://dev.mailjet.com/email/guides/send-api-v31/
// Secrets: MAILJET_API_KEY, MAILJET_SECRET_KEY

async function dispatchMailjet(creds: Record<string, string>, to: string, from: string, subject: string | undefined, body: string): Promise<ProviderResult> {
  const apiKey    = cred(creds, 'MAILJET_API_KEY');
  const secretKey = cred(creds, 'MAILJET_SECRET_KEY');
  if (!apiKey || !secretKey) return missingCreds('MAILJET_API_KEY', 'MAILJET_SECRET_KEY');

  const fromEmail = from.includes('@') ? from : 'noreply@trafikcloud.se';

  try {
    const res = await fetch('https://api.mailjet.com/v3.1/send', {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${btoa(`${apiKey}:${secretKey}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Messages: [{
          From:     { Email: fromEmail },
          To:       [{ Email: to }],
          Subject:  subject?.trim() || '(Inget ämne)',
          ...(isHtmlBody(body) ? { HTMLPart: body } : { TextPart: body }),
        }],
      }),
    });
    if (!res.ok) return httpErr('mailjet', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { Messages?: Array<{ Status: string; To?: Array<{ MessageID?: number }> }> };
    const sent = data.Messages?.[0];
    if (sent?.Status && sent.Status !== 'success') {
      return { status: 'failed', providerId: null, error: `Mailjet status: ${sent.Status}` };
    }
    const msgId = sent?.To?.[0]?.MessageID;
    return { status: 'sent', providerId: msgId != null ? String(msgId) : null, error: null };
  } catch (e) { return caught(e); }
}

// ─── Email: Tenant SMTP (Hybrid model, Tenant SMTP Email V1) ──────────────────
// The only per-organization credential path in this file — see the header
// comment above. STARTTLS (587) and implicit TLS (465) only; no plaintext
// SMTP is offered. Hand-rolled against raw Deno.connect()/connectTls()/
// startTls() (confirmed working against the Supabase Edge Runtime via a
// live feasibility check, 2026-08-15) rather than pulling in a client
// library, matching this file's existing no-SDK convention.

export interface SmtpCreds {
  host:     string;
  port:     number;
  security: 'starttls' | 'ssl';
  username: string;
  password: string;
}

const SMTP_TIMEOUT_MS = 20_000;

/** All five SMTP fields are stored (and were encrypted) uniformly via the
 *  same channel_configs.metadata.credentials mechanism every other
 *  multi-field provider (e.g. Twilio) already uses — decrypt all five. */
export async function getOrgSmtpCredentials(organizationId: string | null): Promise<SmtpCreds | null> {
  if (!organizationId) return null;
  try {
    const client = createServiceClient();
    const { data } = await client
      .from('channel_configs')
      .select('metadata')
      .eq('organization_id', organizationId)
      .eq('channel', 'email')
      .maybeSingle();
    const stored = (data?.metadata as { credentials?: Record<string, string> } | null)?.credentials ?? {};
    if (!stored.SMTP_HOST || !stored.SMTP_PORT || !stored.SMTP_SECURITY || !stored.SMTP_USERNAME || !stored.SMTP_PASSWORD) {
      return null;
    }
    const host     = await decryptCredential(stored.SMTP_HOST);
    const portStr  = await decryptCredential(stored.SMTP_PORT);
    const security = await decryptCredential(stored.SMTP_SECURITY);
    const username = await decryptCredential(stored.SMTP_USERNAME);
    const password = await decryptCredential(stored.SMTP_PASSWORD);
    const port = parseInt(portStr, 10);
    if (!Number.isFinite(port) || (security !== 'starttls' && security !== 'ssl')) return null;
    return { host, port, security, username, password };
  } catch {
    // A lookup/decrypt failure must never throw into dispatchMessage() —
    // surfaces as missingCreds() below instead, same graceful-degradation
    // contract as every other provider in this file.
    return null;
  }
}

// Structural (not nominal) type — accepts Deno.TcpConn and Deno.TlsConn
// alike without widening either away from the specific type Deno.startTls()
// requires (TcpConn, not the general Conn union) at the one call site that
// needs it.
interface SmtpSocket {
  read(p: Uint8Array): Promise<number | null>;
  write(p: Uint8Array): Promise<number>;
  close(): void;
}

async function readSmtpResponse(conn: SmtpSocket): Promise<{ code: number; text: string }> {
  const decoder = new TextDecoder();
  const chunk = new Uint8Array(4096);
  let buffer = '';
  for (;;) {
    const n = await conn.read(chunk);
    if (n === null) break;
    buffer += decoder.decode(chunk.subarray(0, n), { stream: true });
    const lines = buffer.split('\r\n').filter((l) => l.length > 0);
    const last = lines[lines.length - 1] ?? '';
    if (/^\d{3} /.test(last)) break;      // final line of a (possibly multi-line) reply
    if (!/^\d{3}-/.test(last)) break;      // malformed/unexpected — stop waiting rather than hang
  }
  return { code: parseInt(buffer.slice(0, 3), 10) || 0, text: buffer.trim() };
}

async function sendSmtpCommand(conn: SmtpSocket, command: string): Promise<{ code: number; text: string }> {
  await conn.write(new TextEncoder().encode(command + '\r\n'));
  return await readSmtpResponse(conn);
}

function closeSmtpSocket(conn: SmtpSocket | null): void {
  try { conn?.close(); } catch { /* already closed or never opened */ }
}

/** RFC 5321 transparency: a line starting with "." gets an extra "." so the
 *  lone-"." DATA terminator is never triggered by message content itself. */
function dotStuff(body: string): string {
  return body.replace(/\r\n/g, '\n').split('\n')
    .map((line) => (line.startsWith('.') ? '.' + line : line))
    .join('\r\n');
}

/** Connects to `host:port`, encrypting either immediately (implicit TLS, port
 *  465) or via STARTTLS upgrade (port 587) — kept as two separate branches,
 *  each returning its own connection type directly, so Deno.startTls() never
 *  needs a cast away from the specific Deno.TcpConn it requires. */
async function smtpConnect(creds: SmtpCreds): Promise<SmtpSocket> {
  if (creds.security === 'ssl') {
    const conn = await Deno.connectTls({ hostname: creds.host, port: creds.port });
    const resp = await readSmtpResponse(conn);
    if (resp.code !== 220) throw new Error(`Unexpected greeting: ${resp.text}`);
    return conn;
  }

  const tcpConn = await Deno.connect({ hostname: creds.host, port: creds.port });
  let resp = await readSmtpResponse(tcpConn);
  if (resp.code !== 220) throw new Error(`Unexpected greeting: ${resp.text}`);

  resp = await sendSmtpCommand(tcpConn, 'EHLO trafikcloud.se');
  if (resp.code !== 250) throw new Error(`EHLO rejected: ${resp.text}`);

  resp = await sendSmtpCommand(tcpConn, 'STARTTLS');
  if (resp.code !== 220) throw new Error(`STARTTLS rejected: ${resp.text}`);

  return await Deno.startTls(tcpConn, { hostname: creds.host });
}

async function smtpConnectAuth(creds: SmtpCreds): Promise<SmtpSocket> {
  const conn = await smtpConnect(creds);

  let resp = await sendSmtpCommand(conn, 'EHLO trafikcloud.se');
  if (resp.code !== 250) throw new Error(`EHLO rejected: ${resp.text}`);

  const authPayload = btoa(`\0${creds.username}\0${creds.password}`);
  resp = await sendSmtpCommand(conn, `AUTH PLAIN ${authPayload}`);
  if (resp.code !== 235) throw new Error(`Authentication failed: ${resp.text}`);

  return conn;
}

async function dispatchSMTP(
  creds: SmtpCreds | null,
  to: string,
  from: string,
  subject: string | undefined,
  body: string,
): Promise<ProviderResult> {
  if (!creds) return missingCreds('SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURITY', 'SMTP_USERNAME', 'SMTP_PASSWORD');

  let conn: SmtpSocket | null = null;
  try {
    conn = await Promise.race([
      smtpConnectAuth(creds),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DOMException('SMTP handshake timed out', 'TimeoutError')), SMTP_TIMEOUT_MS)),
    ]);

    const fromAddr = from.includes('@') ? from : creds.username;
    const fromEmailOnly = fromAddr.match(/<([^>]+)>/)?.[1] ?? fromAddr;

    let resp = await sendSmtpCommand(conn, `MAIL FROM:<${fromEmailOnly}>`);
    if (resp.code !== 250) return { status: 'failed', providerId: null, error: `smtp MAIL FROM rejected: ${resp.text}` };

    resp = await sendSmtpCommand(conn, `RCPT TO:<${to}>`);
    if (resp.code !== 250 && resp.code !== 251) return { status: 'failed', providerId: null, error: `smtp RCPT TO rejected: ${resp.text}` };

    resp = await sendSmtpCommand(conn, 'DATA');
    if (resp.code !== 354) return { status: 'failed', providerId: null, error: `smtp DATA rejected: ${resp.text}` };

    const contentType = isHtmlBody(body) ? 'text/html; charset=UTF-8' : 'text/plain; charset=UTF-8';
    const headers = [
      `From: ${fromAddr}`,
      `To: <${to}>`,
      `Subject: ${subject?.trim() || '(Inget ämne)'}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${contentType}`,
      `Content-Transfer-Encoding: 8bit`,
    ].join('\r\n');

    // RFC 5322 §2.1: the body is separated from the header section by a
    // truly EMPTY line — i.e. two CRLFs in sequence, not one. Confirmed
    // live (2026-08-15): joining headers with a trailing '' element only
    // terminates the last header line once, so the body ran straight into
    // it with no blank line; Resend's SMTP relay rejected every send with
    // "550 Missing `html` or `text` field" because its parser couldn't
    // locate the body. A generic/lenient MTA might have tolerated this,
    // but it was a real spec violation either way.
    await conn.write(new TextEncoder().encode(headers + '\r\n\r\n' + dotStuff(body) + '\r\n.\r\n'));
    resp = await readSmtpResponse(conn);
    if (resp.code !== 250) return { status: 'failed', providerId: null, error: `smtp send rejected: ${resp.text}` };

    await sendSmtpCommand(conn, 'QUIT').catch(() => {});
    const providerId = resp.text.match(/queued as (\S+)/i)?.[1] ?? null;
    return { status: 'sent', providerId, error: null };
  } catch (e) {
    return caught(e, 'smtp');
  } finally {
    closeSmtpSocket(conn);
  }
}

// ─── SMTP connection test (no message sent) ───────────────────────────────────
// Distinct from dispatchSMTP() — used only by communications/index.ts's
// "Testa anslutning" route. Stops after AUTH; never reaches MAIL FROM/DATA.

export type SmtpTestStatus = 'ok' | 'connection_failed' | 'tls_failed' | 'auth_failed';
export interface SmtpTestResult { status: SmtpTestStatus; error: string | null }

export async function testSmtpConnection(creds: SmtpCreds): Promise<SmtpTestResult> {
  let conn: SmtpSocket | null = null;
  const run = async (): Promise<SmtpTestResult> => {
    try {
      conn = await smtpConnect(creds);
    } catch (e) {
      // smtpConnect() covers connect + greeting + (for STARTTLS) the pre-
      // upgrade EHLO/STARTTLS/upgrade sequence as one unit — a thrown
      // message containing "STARTTLS"/"EHLO after" is the TLS stage,
      // anything else (unreachable host, bad greeting) is connection stage.
      const message = e instanceof Error ? e.message : String(e);
      const isTlsStage = /STARTTLS|EHLO rejected/i.test(message);
      return { status: isTlsStage ? 'tls_failed' : 'connection_failed', error: message };
    }

    try {
      let resp = await sendSmtpCommand(conn, 'EHLO trafikcloud.se');
      if (resp.code !== 250) return { status: 'tls_failed', error: resp.text };

      const authPayload = btoa(`\0${creds.username}\0${creds.password}`);
      resp = await sendSmtpCommand(conn, `AUTH PLAIN ${authPayload}`);
      if (resp.code !== 235) return { status: 'auth_failed', error: resp.text };

      await sendSmtpCommand(conn, 'QUIT').catch(() => {});
      return { status: 'ok', error: null };
    } catch (e) {
      return { status: 'auth_failed', error: e instanceof Error ? e.message : String(e) };
    }
  };

  try {
    return await Promise.race([
      run(),
      new Promise<SmtpTestResult>((resolve) =>
        setTimeout(() => resolve({ status: 'connection_failed', error: 'Anslutningen tog för lång tid.' }), SMTP_TIMEOUT_MS)),
    ]);
  } finally {
    closeSmtpSocket(conn);
  }
}

// ─── Voice: 46elks ────────────────────────────────────────────────────────────
// Docs: https://46elks.se/docs/voice-calls
// Secrets: ELKS_API_USERNAME, ELKS_API_PASSWORD (same as SMS)
// Note: Uses TTS — "body" becomes the spoken text.

async function dispatch46elksVoice(creds: Record<string, string>, to: string, from: string, body: string): Promise<ProviderResult> {
  const username = cred(creds, 'ELKS_API_USERNAME');
  const password = cred(creds, 'ELKS_API_PASSWORD');
  if (!username || !password) return missingCreds('ELKS_API_USERNAME', 'ELKS_API_PASSWORD');

  const form = new URLSearchParams();
  form.set('from',    from.trim() || '+46700000000');
  form.set('to',      to);
  form.set('voice1',  body);
  form.set('skiptts', 'no');

  try {
    const res = await fetch('https://api.46elks.com/a1/calls', {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${btoa(`${username}:${password}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) return httpErr('46elks-voice', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { id?: string };
    return { status: 'sent', providerId: data.id ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── Voice: Twilio ────────────────────────────────────────────────────────────
// Docs: https://www.twilio.com/docs/voice/api/call-resource
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
// Note: Uses TwiML <Say> with sv-SE language for TTS.

async function dispatchTwilioVoice(creds: Record<string, string>, to: string, from: string, body: string): Promise<ProviderResult> {
  const sid    = cred(creds, 'TWILIO_ACCOUNT_SID');
  const token  = cred(creds, 'TWILIO_AUTH_TOKEN');
  const number = cred(creds, 'TWILIO_PHONE_NUMBER') ?? from;
  if (!sid || !token || !number) return missingCreds('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER');

  // Inline TwiML — Swedish TTS
  const twiml = `<Response><Say language="sv-SE">${body.replace(/[<>&"]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c] ?? c))}</Say></Response>`;

  const form = new URLSearchParams();
  form.set('From',  number);
  form.set('To',    to);
  form.set('Twiml', twiml);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) return httpErr('twilio-voice', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { sid?: string };
    return { status: 'sent', providerId: data.sid ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── Dispatch router ──────────────────────────────────────────────────────────

export interface DispatchParams {
  channel:   string;
  provider:  string | null;
  to:        string;
  from:      string | null;
  subject?:  string;
  body:      string;
  /** Only read when channel==='email' && provider==='smtp' (Hybrid model,
   *  Tenant SMTP Email V1) to look up that org's SMTP credentials — every
   *  other channel/provider combination is platform-managed and ignores
   *  this field. Already threaded through by every existing caller. */
  organizationId?: string | null;
}

export async function dispatchMessage(params: DispatchParams): Promise<ProviderResult> {
  const { channel, provider, from, subject, body, organizationId } = params;
  const fromAddr = from ?? '';
  // Every SMS/voice/WhatsApp gateway requires E.164 ("+46701234567"), but
  // Swedish phone numbers are routinely typed/pasted in local format
  // ("0701234567") — confirmed live 2026-08-06: 46elks rejected every send
  // with "Invalid to number ... Expected '+'" until the leading trunk 0 was
  // converted to the +46 country code. Left untouched for push (device
  // token, not a phone number) and email (address, not a phone number).
  const to = ['sms', 'voice', 'whatsapp'].includes(channel) ? normalizeSwedishPhone(params.to) : params.to;

  switch (channel) {
    case 'sms':
      // SMS is platform-managed (ADR: platform-managed integrations) — a
      // tenant can no longer save their own SMS credentials (enforced in
      // communications/index.ts's channel PUT handler and by a DB trigger),
      // but this always resolves through the platform-wide Deno.env secret
      // regardless, rather than depending on the row staying empty.
      if (provider === '46elks') return await dispatch46elksSms({}, to, fromAddr, body);
      if (provider === 'twilio') return await dispatchTwilioSms({}, to, fromAddr, body);
      if (provider === 'vonage') return await dispatchVonageSms({}, to, fromAddr, body);
      break;
    case 'email':
      // Email is platform-managed (ADR: platform-managed integrations) — a
      // tenant can no longer save their own email credentials (enforced in
      // communications/index.ts's channel PUT handler and by a DB trigger),
      // but this always resolves through the platform-wide Deno.env secret
      // regardless, rather than depending on the row staying empty.
      if (provider === 'resend')    return await dispatchResend({}, to, fromAddr, subject, body);
      if (provider === 'sendgrid')  return await dispatchSendGrid({}, to, fromAddr, subject, body);
      if (provider === 'mailjet')   return await dispatchMailjet({}, to, fromAddr, subject, body);
      // Tenant SMTP (Hybrid model) — the one genuinely per-organization
      // credential path in this file; see getOrgSmtpCredentials() above.
      if (provider === 'smtp') {
        const creds = await getOrgSmtpCredentials(organizationId ?? null);
        return await dispatchSMTP(creds, to, fromAddr, subject, body);
      }
      break;
    case 'whatsapp':
      // WhatsApp is platform-managed (ADR: platform-managed integrations) — a
      // tenant can no longer save their own WhatsApp credentials (enforced in
      // communications/index.ts's channel PUT handler and by a DB trigger),
      // but this always resolves through the platform-wide Deno.env secret
      // regardless, rather than depending on the row staying empty.
      if (provider === 'twilio') return await dispatchTwilioWhatsapp({}, to, fromAddr, body);
      if (provider === 'meta')   return await dispatchMetaWhatsapp({}, to, body);
      break;
    case 'push':
      // Push is platform-managed (ADR: platform-managed integrations) — a
      // tenant can no longer save their own Push credentials (enforced in
      // communications/index.ts's channel PUT handler and by a DB trigger),
      // but this always resolves through the platform-wide Deno.env secret
      // regardless, rather than depending on the row staying empty. `to` is
      // a recipient device token/player_id, not a credential — unaffected.
      if (provider === 'firebase')  return await dispatchFirebase({}, to, subject, body);
      if (provider === 'onesignal') return await dispatchOneSignal({}, to, subject, body);
      break;
    case 'voice':
      // Voice is platform-managed (ADR: platform-managed integrations) — a
      // tenant can no longer save their own Voice credentials (enforced in
      // communications/index.ts's channel PUT handler and by a DB trigger),
      // but this always resolves through the platform-wide Deno.env secret
      // regardless, rather than depending on the row staying empty.
      if (provider === '46elks') return await dispatch46elksVoice({}, to, fromAddr, body);
      if (provider === 'twilio') return await dispatchTwilioVoice({}, to, fromAddr, body);
      break;
  }

  // No provider configured → keep queued (channel active but not yet wired)
  if (!provider) {
    return { status: 'queued', providerId: null, error: null };
  }

  // Provider name set but not matched above — unknown/unsupported
  return {
    status:     'failed',
    providerId: null,
    error:      `Provider '${provider}' is not integrated for channel '${channel}'`,
  };
}
