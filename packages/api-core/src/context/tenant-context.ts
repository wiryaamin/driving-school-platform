import type { JwtClaims, SystemRole } from '@platform/types';

/**
 * TenantContext — the core safety primitive propagated through every service
 * and repository call. Provides org boundary enforcement (defense-in-depth
 * on top of RLS) and permission checks without DB round-trips.
 *
 * organizationId is null for platform admins operating at the platform level.
 * All data operations must provide a non-null organizationId; platform admin
 * route handlers resolve the target org from the URL path before calling services.
 */
export interface TenantContext {
  readonly organizationId: string | null;
  readonly actorId: string | null;
  readonly actorRole: SystemRole | null;
  readonly permissions: ReadonlyArray<string>;
  readonly correlationId: string;
  readonly isPlatformAdmin: boolean;
  readonly isWorker: boolean;
}

export function buildTenantContext(
  claims: JwtClaims,
  correlationId: string
): TenantContext {
  return {
    organizationId: claims.organization_id,
    actorId: claims.sub,
    actorRole: claims.role,
    permissions: claims.permissions,
    correlationId,
    isPlatformAdmin: claims.is_platform_admin,
    isWorker: false,
  };
}

/**
 * Asserts that the context has a valid organizationId and narrows its type.
 * Throw this in service layer before any data access when org scope is required.
 */
export function requireOrgContext(
  ctx: TenantContext
): asserts ctx is TenantContext & { organizationId: string } {
  if (ctx.organizationId === null) {
    throw new Error(
      'Organization context is required for this operation. ' +
      'Platform admins must provide a target organizationId.'
    );
  }
}
