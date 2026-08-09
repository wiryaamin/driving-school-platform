/**
 * BankID Relying Party REST API v6.0 client (Init/Collect/Cancel + QR data),
 * per Finansiell ID-Teknik BID AB's published specification.
 *
 * BankID requires mutual TLS (a client certificate issued to a registered
 * relying party). Deno — the runtime Supabase Edge Functions run on — has no
 * client-certificate support on outbound connections at all, at any level
 * (confirmed: neither Deno.createHttpClient nor Deno.connectTls expose a
 * cert/key option in the current stable API). This is a hard runtime wall,
 * not a missing-credential problem, so calls are routed through a small
 * external relay (a Vercel Node.js function — plain Node `https.Agent`
 * supports client certs natively) that performs the actual mTLS handshake to
 * BankID and forwards the response verbatim. See BANKID_RELAY_URL/
 * BANKID_RELAY_SECRET below; the relay itself holds the cert/key/CA.
 *
 * This client is written to the real, documented protocol and every call
 * site degrades gracefully — via bankidConfigured() — to a clear "not
 * configured" error rather than a confusing network failure when the relay
 * secrets are absent.
 */

import { logger } from './logger.ts';

export interface BankidAuthResponse {
  orderRef: string;
  autoStartToken: string;
  qrStartToken: string;
  qrStartSecret: string;
}

export interface BankidCollectResponse {
  orderRef: string;
  status: 'pending' | 'failed' | 'complete';
  hintCode?: string;
  completionData?: {
    user: { personalNumber: string; name: string; givenName: string; surname: string };
  };
}

export class BankidNotConfiguredError extends Error {
  constructor() {
    super('BankID is not configured in this environment (missing client certificate secrets)');
    this.name = 'BankidNotConfiguredError';
  }
}

export class BankidApiError extends Error {
  constructor(public status: number, public errorCode: string, message: string) {
    super(message);
    this.name = 'BankidApiError';
  }
}

/** True only when the relay URL and shared secret are present. Callers must check this before any protocol call. */
export function bankidConfigured(): boolean {
  return !!(
    Deno.env.get('BANKID_RELAY_URL') &&
    Deno.env.get('BANKID_RELAY_SECRET')
  );
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!bankidConfigured()) throw new BankidNotConfiguredError();

  const relayUrl = Deno.env.get('BANKID_RELAY_URL')!;
  const relaySecret = Deno.env.get('BANKID_RELAY_SECRET')!;

  const res = await fetch(`${relayUrl}?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Relay-Secret': relaySecret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errorCode = 'unknown';
    try {
      const errBody = await res.json();
      errorCode = errBody.errorCode ?? errorCode;
    } catch { /* non-JSON error body */ }
    throw new BankidApiError(res.status, errorCode, `BankID API error: ${errorCode}`);
  }

  return res.json() as Promise<T>;
}

/** Starts a BankID auth order. Omit personalNumber to allow any BankID app to scan/QR-authenticate. */
export async function bankidAuth(endUserIp: string, personalNumber?: string): Promise<BankidAuthResponse> {
  return post<BankidAuthResponse>('/auth', {
    endUserIp,
    ...(personalNumber ? { personalNumber } : {}),
  });
}

export async function bankidCollect(orderRef: string): Promise<BankidCollectResponse> {
  return post<BankidCollectResponse>('/collect', { orderRef });
}

export async function bankidCancel(orderRef: string): Promise<void> {
  await post<Record<string, never>>('/cancel', { orderRef });
}

/**
 * Computes the animated QR code payload per BankID's QR spec:
 * "bankid.<qrStartToken>.<elapsedSeconds>.<qrAuthCode>", where qrAuthCode is
 * HMAC-SHA256(qrStartSecret, elapsedSeconds) hex. Regenerate on every poll —
 * BankID's app validates the code is recent.
 */
export async function computeQrData(
  qrStartToken: string,
  qrStartSecret: string,
  orderCreatedAt: Date,
): Promise<string> {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - orderCreatedAt.getTime()) / 1000));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(qrStartSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(elapsedSeconds)));
  const qrAuthCode = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `bankid.${qrStartToken}.${elapsedSeconds}.${qrAuthCode}`;
}

/** Same-device deep link — opens the BankID app directly on the phone/computer the user is on. */
export function autoStartUrl(autoStartToken: string, redirect = 'null'): string {
  return `bankid:///?autostarttoken=${autoStartToken}&redirect=${redirect}`;
}
