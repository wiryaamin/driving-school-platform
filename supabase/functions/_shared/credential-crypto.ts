/**
 * Encryption for tenant-owned third-party integration credentials
 * (ADR-022, Integration Credential Management Architecture).
 *
 * Reuses the existing IDENTITY_ENCRYPTION_KEY primitive (AES-256-GCM,
 * `bankid-crypto.ts`) rather than introducing a second encryption scheme —
 * this module is independent of bankid-crypto.ts's own exports so that
 * personnummer/BankID call sites are never touched by this change.
 *
 * Backward compatibility: encrypted values are tagged with a version
 * prefix ("enc:v1:"). A value with no such prefix is a pre-existing
 * plaintext credential (stored before this module existed) and is
 * returned as-is by decryptCredential() — no destructive migration of
 * already-stored values is performed by this module.
 */

import { logger } from './logger.ts';

const ENC_PREFIX = 'enc:v1:';

function getKeyBytes(): Uint8Array | null {
  const b64 = Deno.env.get('IDENTITY_ENCRYPTION_KEY');
  if (!b64) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (bytes.length !== 32) {
      logger.error('credential-crypto: key has wrong length', { bytes: bytes.length });
      return null;
    }
    return bytes;
  } catch {
    logger.error('credential-crypto: key is not valid base64');
    return null;
  }
}

export function credentialCryptoConfigured(): boolean {
  return getKeyBytes() !== null;
}

/** AES-256-GCM encrypt. Output = "enc:v1:" + base64(12-byte IV || ciphertext || 16-byte tag). */
export async function encryptCredential(plaintext: string): Promise<string> {
  const keyBytes = getKeyBytes();
  if (!keyBytes) throw new Error('IDENTITY_ENCRYPTION_KEY not configured');

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return ENC_PREFIX + btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a value produced by encryptCredential(). A value without the
 * "enc:v1:" prefix is treated as a pre-existing plaintext credential and
 * returned unchanged (backward compatibility with values stored before
 * this module existed).
 */
export async function decryptCredential(stored: string): Promise<string> {
  if (!stored.startsWith(ENC_PREFIX)) return stored;

  const keyBytes = getKeyBytes();
  if (!keyBytes) throw new Error('IDENTITY_ENCRYPTION_KEY not configured');

  const combined = Uint8Array.from(atob(stored.slice(ENC_PREFIX.length)), (c) => c.charCodeAt(0));
  const iv         = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/** Non-reversible display fragment for the UI — never the real value. */
export function maskCredential(plaintext: string): string {
  if (plaintext.length <= 8) return '••••';
  return `${plaintext.slice(0, 8)}…${plaintext.slice(-4)}`;
}
