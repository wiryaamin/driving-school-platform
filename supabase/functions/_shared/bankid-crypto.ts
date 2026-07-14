/**
 * Encryption/hashing for BankID personal numbers (auth_identity_links.
 * external_subject_encrypted/_hash, ADR-007 Phase 3).
 *
 * Note on provenance: ADR-007 stated this would "reuse the existing
 * personnummer encryption pattern verbatim" (students.personnummer_encrypted/
 * _hash). Live verification during Phase 3's Existing Implementation Review
 * found that pattern is schema-only — students never actually populates those
 * two columns anywhere in the current frontend or Edge Function code (only
 * personnummer_last4 + date_of_birth are ever written). There was no working
 * implementation to reuse. This module is a new, from-scratch implementation
 * following the same AES-256-GCM + HMAC-SHA256 shape the schema comments
 * already describe, not a copy of pre-existing working code.
 *
 * Two independent keys, standard practice: an encryption key can decrypt,
 * a hash key can only ever produce the same deterministic digest — a hash-key
 * compromise alone cannot recover plaintext.
 */

import { logger } from './logger.ts';

function getKeyBytes(envVar: string): Uint8Array | null {
  const b64 = Deno.env.get(envVar);
  if (!b64) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (bytes.length !== 32) {
      logger.error('bankid-crypto: key has wrong length', { env_var: envVar, bytes: bytes.length });
      return null;
    }
    return bytes;
  } catch {
    logger.error('bankid-crypto: key is not valid base64', { env_var: envVar });
    return null;
  }
}

/** True only when both IDENTITY_ENCRYPTION_KEY and IDENTITY_HASH_KEY are present and well-formed. */
export function identityCryptoConfigured(): boolean {
  return getKeyBytes('IDENTITY_ENCRYPTION_KEY') !== null && getKeyBytes('IDENTITY_HASH_KEY') !== null;
}

/**
 * AES-256-GCM encrypt. Output = base64(12-byte IV || ciphertext || 16-byte tag),
 * a single self-contained string safe to store in one text column.
 */
export async function encryptPersonalNumber(plaintext: string): Promise<string> {
  const keyBytes = getKeyBytes('IDENTITY_ENCRYPTION_KEY');
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
  return btoa(String.fromCharCode(...combined));
}

/** HMAC-SHA256 hex digest — deterministic, used for O(1) equality lookup only. */
export async function hashPersonalNumber(plaintext: string): Promise<string> {
  const keyBytes = getKeyBytes('IDENTITY_HASH_KEY');
  if (!keyBytes) throw new Error('IDENTITY_HASH_KEY not configured');

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(plaintext));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
