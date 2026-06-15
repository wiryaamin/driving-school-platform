/**
 * JWT utilities for Edge Functions that predate the buildEdgeContext() pattern.
 *
 * Custom claims added by the auth hook (organization_id, role, permissions,
 * is_platform_admin) are top-level JWT fields and must be decoded directly
 * from the bearer token — they are not available via client.auth.getUser().
 *
 * Helpers:
 *   getOrgIdFromBearer(req)     — organization_id claim
 *   getUserIdFromBearer(req)    — sub claim (user UUID)
 *   getRoleFromBearer(req)      — role claim
 *   enrichUserFromJwt(req,user) — back-fills app_metadata for legacy handlers
 */

function decodeJwtPayload(bearerToken: string): Record<string, unknown> {
  const token  = bearerToken.startsWith('Bearer ') ? bearerToken.slice(7) : bearerToken;
  const b64url = token.split('.')[1] ?? '';
  if (!b64url) return {};
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - b64.length % 4) % 4;
  try {
    return JSON.parse(atob(b64 + '='.repeat(pad))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function bearer(req: Request): string {
  return req.headers.get('Authorization') ?? '';
}

/** Returns organization_id from the JWT, or null if missing/invalid. */
export function getOrgIdFromBearer(req: Request): string | null {
  const payload = decodeJwtPayload(bearer(req));
  return (payload['organization_id'] as string | null) ?? null;
}

/** Returns the user UUID (sub claim) from the JWT, or null if missing/invalid. */
export function getUserIdFromBearer(req: Request): string | null {
  const payload = decodeJwtPayload(bearer(req));
  return (payload['sub'] as string | null) ?? null;
}

/** Returns the user's role claim from the JWT, or null if missing. */
export function getRoleFromBearer(req: Request): string | null {
  const payload = decodeJwtPayload(bearer(req));
  return (payload['role'] as string | null) ?? null;
}

/**
 * Back-fills app_metadata with real JWT claims so that legacy getOrgId() /
 * hasPermission() helpers work without further changes to handler signatures.
 * Keep for backward compatibility with handlers built before getUserIdFromBearer().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function enrichUserFromJwt(req: Request, user: any): any {
  const auth    = bearer(req);
  const payload = decodeJwtPayload(auth);

  return {
    ...user,
    app_metadata: {
      ...(user?.app_metadata ?? {}),
      organization_id:   (payload['organization_id'] as string | null) ?? null,
      permissions:       (payload['permissions'] as string[]) ?? [],
      is_platform_admin: payload['is_platform_admin'] === true,
    },
  };
}
