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

/**
 * Where a user lands immediately after authenticating (login, invite
 * acceptance, or the "/" index redirect) — one shared decision so all three
 * call sites agree. Platform admins go to the platform console; instructors
 * get their own daily operational workspace (today's schedule, assigned
 * lessons) rather than the School Administrator dashboard, since that
 * dashboard's finance/org-wide widgets aren't relevant to their role;
 * everyone else lands on the general dashboard.
 *
 * A user with no organization_id and no platform-admin flag (a disabled
 * profile, an offboarded member, or an invite never activated —
 * get_user_jwt_claims returns this same empty shape for all three, and the
 * JWT alone can't tell them apart) used to still fall through to
 * '/dashboard' — rendering the full tenant shell with nothing to scope its
 * data to, so every widget's query 403'd. Routed to /403 instead, found via
 * a real account stuck in exactly this state during live testing,
 * 2026-08-30.
 */
export function getPostLoginRoute(
  claims: { is_platform_admin?: boolean; role?: string | null; organization_id?: string | null } | null,
): string {
  if (claims?.is_platform_admin) return '/platform/dashboard';
  if (claims?.role === 'instructor' || claims?.role === 'instructor_senior') return '/instructor-app';
  if (!claims?.organization_id) return '/403?reason=no_organization';
  return '/dashboard';
}

/** Returns true if the JWT clock has passed the exp claim. */
export function isJwtExpired(claims: Pick<JwtClaims, 'exp'>): boolean {
  return Math.floor(Date.now() / 1000) >= claims.exp;
}

/** Returns seconds until the token expires (negative if already expired). */
export function jwtTtlSeconds(claims: Pick<JwtClaims, 'exp'>): number {
  return claims.exp - Math.floor(Date.now() / 1000);
}
