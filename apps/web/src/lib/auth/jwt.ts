import type { JwtClaims } from '@platform/types';

/**
 * Decode a Supabase JWT and extract the custom claims added by the auth hook.
 *
 * Custom claims (organization_id, permissions, role, …) sit at the top level
 * of the JWT payload — they are NOT nested inside app_metadata or user_metadata.
 * This function decodes the token without verifying the signature; signature
 * verification is handled by Supabase before the token reaches the client.
 */
export function parseJwtClaims(accessToken: string): JwtClaims | null {
  try {
    const segments = accessToken.split('.');
    if (segments.length !== 3) return null;

    // Base64url → base64 → JSON
    // segments[1] is guaranteed defined: we checked segments.length !== 3 above
    const segment1 = segments[1]!;
    const base64 = segment1.replace(/-/g, '+').replace(/_/g, '/');
    const padded  = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const decoded: Record<string, unknown> = JSON.parse(atob(padded));

    // Build claims; use conditional spreads for optional fields so that
    // exactOptionalPropertyTypes is satisfied (absent ≠ undefined).
    return {
      sub:                  String(decoded['sub']                  ?? ''),
      email:                String(decoded['email']                ?? ''),
      organization_id:      (decoded['organization_id']  as string) ?? null,
      active_membership_id: (decoded['active_membership_id'] as string) ?? null,
      location_ids:         Array.isArray(decoded['location_ids'])
                              ? (decoded['location_ids'] as string[])
                              : [],
      role:                 (decoded['role'] as JwtClaims['role']) ?? null,
      permissions:          Array.isArray(decoded['permissions'])
                              ? (decoded['permissions'] as string[])
                              : [],
      subscription_tier:    String(decoded['subscription_tier']    ?? 'trial'),
      is_platform_admin:    decoded['is_platform_admin'] === true,
      iat:                  Number(decoded['iat'] ?? 0),
      exp:                  Number(decoded['exp'] ?? 0),
      ...(decoded['impersonator_id']
        ? { impersonator_id: decoded['impersonator_id'] as string }
        : {}),
      ...(decoded['auth_degraded'] === true
        ? { auth_degraded: true as const }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Returns true if the JWT clock has passed the exp claim. */
export function isJwtExpired(claims: Pick<JwtClaims, 'exp'>): boolean {
  return Math.floor(Date.now() / 1000) >= claims.exp;
}

/** Returns seconds until the token expires (negative if already expired). */
export function jwtTtlSeconds(claims: Pick<JwtClaims, 'exp'>): number {
  return claims.exp - Math.floor(Date.now() / 1000);
}
