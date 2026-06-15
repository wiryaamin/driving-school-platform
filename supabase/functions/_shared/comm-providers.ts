/**
 * Communication provider abstraction.
 *
 * Each provider reads credentials exclusively from Deno.env (Supabase Secrets).
 * No API keys are stored in the database.
 *
 * Integrated providers:
 *   sms      → 46elks      ELKS_API_USERNAME + ELKS_API_PASSWORD
 *   email    → Resend       RESEND_API_KEY
 *   whatsapp → Twilio       TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_NUMBER
 *   whatsapp → Meta         META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID
 *   push     → Firebase     FIREBASE_SERVER_KEY
 *   push     → OneSignal    ONESIGNAL_APP_ID + ONESIGNAL_API_KEY
 *   voice    → 46elks       ELKS_API_USERNAME + ELKS_API_PASSWORD (reused)
 *   voice    → Twilio       TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER
 *
 * Voice calls use TTS (not conversational AI). Push "to" field = device token.
 * WhatsApp "to" field = E.164 phone number without whatsapp: prefix.
 */

export type ProviderResult = {
  status:     'sent' | 'failed' | 'queued';
  providerId: string | null;
  error:      string | null;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function missingCreds(...keys: string[]): ProviderResult {
  return { status: 'failed', providerId: null, error: `Missing secrets: ${keys.join(', ')}` };
}

function httpErr(provider: string, status: number, body: string): ProviderResult {
  return { status: 'failed', providerId: null, error: `${provider} ${status}: ${body}` };
}

function caught(e: unknown): ProviderResult {
  return { status: 'failed', providerId: null, error: e instanceof Error ? e.message : String(e) };
}

// ─── SMS: 46elks ──────────────────────────────────────────────────────────────
// Docs: https://46elks.se/docs/send-sms
// Secrets: ELKS_API_USERNAME, ELKS_API_PASSWORD

async function dispatch46elksSms(to: string, from: string, body: string): Promise<ProviderResult> {
  const username = Deno.env.get('ELKS_API_USERNAME');
  const password = Deno.env.get('ELKS_API_PASSWORD');
  if (!username || !password) return missingCreds('ELKS_API_USERNAME', 'ELKS_API_PASSWORD');

  const form = new URLSearchParams();
  form.set('from',    from.trim() || 'Korskolan');
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

async function dispatchResend(to: string, from: string, subject: string | undefined, body: string): Promise<ProviderResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return missingCreds('RESEND_API_KEY');

  const fromAddr = from.includes('@') ? from : `Körskolan <noreply@korskolan.se>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    fromAddr,
        to:      [to],
        subject: subject?.trim() || '(Inget ämne)',
        text:    body,
      }),
    });
    if (!res.ok) return httpErr('resend', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { id?: string };
    return { status: 'sent', providerId: data.id ?? null, error: null };
  } catch (e) { return caught(e); }
}

// ─── WhatsApp: Twilio ─────────────────────────────────────────────────────────
// Docs: https://www.twilio.com/docs/whatsapp/api
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER

async function dispatchTwilioWhatsapp(to: string, from: string, body: string): Promise<ProviderResult> {
  const sid    = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const number = Deno.env.get('TWILIO_WHATSAPP_NUMBER') ?? from;
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

async function dispatchMetaWhatsapp(to: string, body: string): Promise<ProviderResult> {
  const token       = Deno.env.get('META_WHATSAPP_TOKEN');
  const phoneNumId  = Deno.env.get('META_PHONE_NUMBER_ID');
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

// ─── Push: Firebase (FCM) ─────────────────────────────────────────────────────
// Docs: https://firebase.google.com/docs/cloud-messaging/http-server-ref (Legacy HTTP API)
// Secret: FIREBASE_SERVER_KEY
// Note: "to" field should be the device registration token.

async function dispatchFirebase(to: string, subject: string | undefined, body: string): Promise<ProviderResult> {
  const serverKey = Deno.env.get('FIREBASE_SERVER_KEY');
  if (!serverKey) return missingCreds('FIREBASE_SERVER_KEY');

  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method:  'POST',
      headers: {
        Authorization:  `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        notification: {
          title: subject?.trim() || 'Meddelande',
          body,
        },
      }),
    });
    if (!res.ok) return httpErr('firebase', res.status, await res.text().catch(() => res.statusText));
    const data = await res.json() as { message_id?: string; results?: Array<{ message_id?: string }> };
    const msgId = data.message_id ?? data.results?.[0]?.message_id ?? null;
    return { status: 'sent', providerId: msgId, error: null };
  } catch (e) { return caught(e); }
}

// ─── Push: OneSignal ──────────────────────────────────────────────────────────
// Docs: https://documentation.onesignal.com/reference/create-notification
// Secrets: ONESIGNAL_APP_ID, ONESIGNAL_API_KEY
// Note: "to" field should be the OneSignal player_id.

async function dispatchOneSignal(to: string, subject: string | undefined, body: string): Promise<ProviderResult> {
  const appId  = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_API_KEY');
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

// ─── Voice: 46elks ────────────────────────────────────────────────────────────
// Docs: https://46elks.se/docs/voice-calls
// Secrets: ELKS_API_USERNAME, ELKS_API_PASSWORD (same as SMS)
// Note: Uses TTS — "body" becomes the spoken text.

async function dispatch46elksVoice(to: string, from: string, body: string): Promise<ProviderResult> {
  const username = Deno.env.get('ELKS_API_USERNAME');
  const password = Deno.env.get('ELKS_API_PASSWORD');
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

async function dispatchTwilioVoice(to: string, from: string, body: string): Promise<ProviderResult> {
  const sid    = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const number = Deno.env.get('TWILIO_PHONE_NUMBER') ?? from;
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
}

export async function dispatchMessage(params: DispatchParams): Promise<ProviderResult> {
  const { channel, provider, to, from, subject, body } = params;
  const fromAddr = from ?? '';

  switch (channel) {
    case 'sms':
      if (provider === '46elks') return dispatch46elksSms(to, fromAddr, body);
      break;
    case 'email':
      if (provider === 'resend') return dispatchResend(to, fromAddr, subject, body);
      break;
    case 'whatsapp':
      if (provider === 'twilio') return dispatchTwilioWhatsapp(to, fromAddr, body);
      if (provider === 'meta')   return dispatchMetaWhatsapp(to, body);
      break;
    case 'push':
      if (provider === 'firebase')  return dispatchFirebase(to, subject, body);
      if (provider === 'onesignal') return dispatchOneSignal(to, subject, body);
      break;
    case 'voice':
      if (provider === '46elks') return dispatch46elksVoice(to, fromAddr, body);
      if (provider === 'twilio') return dispatchTwilioVoice(to, fromAddr, body);
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
