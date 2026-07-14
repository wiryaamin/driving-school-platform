/**
 * BankID Relying Party REST API v6.0 client (Init/Collect/Cancel + QR data),
 * per Finansiell ID-Teknik BID AB's published specification.
 *
 * Requires mutual TLS: BankID's servers only accept requests presenting a
 * client certificate issued to a registered relying party. That certificate
 * does not exist in this environment (confirmed during Phase 3's Existing
 * Implementation Review — no cert material anywhere in this repository or
 * its secrets documentation) and cannot be fabricated; it must be supplied by
 * the user via BANKID_CLIENT_CERT/BANKID_CLIENT_KEY/BANKID_CA_CERT once they
 * hold a real BankID test or production relying-party agreement.
 *
 * This client is written to the real, documented protocol and every call
 * site degrades gracefully — via bankidConfigured() — to a clear "not
 * configured" error rather than a confusing network failure when the
 * certificate secrets are absent.
 */

import { logger } from './logger.ts';

const BANKID_TEST_BASE = 'https://appapi2.test.bankid.com/rp/v6.0';
const BANKID_PROD_BASE = 'https://appapi2.bankid.com/rp/v6.0';

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

/** True only when all three certificate secrets are present. Callers must check this before any protocol call. */
export function bankidConfigured(): boolean {
  return !!(
    Deno.env.get('BANKID_CLIENT_CERT') &&
    Deno.env.get('BANKID_CLIENT_KEY') &&
    Deno.env.get('BANKID_CA_CERT')
  );
}

function baseUrl(): string {
  return Deno.env.get('BANKID_ENV') === 'prod' ? BANKID_PROD_BASE : BANKID_TEST_BASE;
}

let cachedHttpClient: Deno.HttpClient | null = null;
let httpClientUnsupported = false;

/**
 * Builds the mTLS-capable fetch client once per isolate. Some Deno-based edge
 * runtimes restrict Deno.createHttpClient's client-certificate options — if
 * so, this throws once, is logged distinctly from "not configured," and every
 * subsequent call reuses that same negative result rather than retrying a
 * call known to fail.
 */
function getHttpClient(): Deno.HttpClient {
  if (cachedHttpClient) return cachedHttpClient;
  if (httpClientUnsupported) throw new Error('mTLS client unsupported in this runtime');

  try {
    cachedHttpClient = Deno.createHttpClient({
      certChain: Deno.env.get('BANKID_CLIENT_CERT')!,
      privateKey: Deno.env.get('BANKID_CLIENT_KEY')!,
      caCerts: [Deno.env.get('BANKID_CA_CERT')!],
    });
    return cachedHttpClient;
  } catch (err) {
    httpClientUnsupported = true;
    logger.error('bankid-client: Deno.createHttpClient failed — mTLS unsupported in this runtime', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error('mTLS client unsupported in this runtime');
  }
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!bankidConfigured()) throw new BankidNotConfiguredError();

  const client = getHttpClient();
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    client,
  } as RequestInit & { client: Deno.HttpClient });

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
