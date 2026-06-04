import type { TenantContext } from '../context/tenant-context.js';
import { ForbiddenError, UnauthorizedError } from '../errors/service-errors.js';

/**
 * Assert that the context carries all (or any) of the required permission codes.
 * Platform admins and background workers bypass all permission checks.
 * Throws ForbiddenError synchronously — call at the top of every service method.
 */
export function assertPermission(
  ctx: TenantContext,
  codes: string | string[],
  mode: 'all' | 'any' = 'all'
): void {
  if (ctx.isPlatformAdmin || ctx.isWorker) return;

  const required = Array.isArray(codes) ? codes : [codes];
  const granted =
    mode === 'all'
      ? required.every(c => ctx.permissions.includes(c))
      : required.some(c => ctx.permissions.includes(c));

  if (!granted) {
    throw new ForbiddenError(
      `Requires ${mode === 'all' ? 'all of' : 'one of'}: ${required.join(', ')}`
    );
  }
}

/**
 * Non-throwing permission check — returns a boolean.
 * Use for conditional feature gating inside handlers; use assertPermission for guards.
 */
export function hasPermission(ctx: TenantContext, code: string): boolean {
  if (ctx.isPlatformAdmin || ctx.isWorker) return true;
  return ctx.permissions.includes(code);
}

/**
 * Assert that the context has a valid actor (not a background worker).
 * Use when an operation must be attributable to a specific user.
 */
export function requireActor(
  ctx: TenantContext
): asserts ctx is TenantContext & { actorId: string } {
  if (ctx.actorId === null) {
    throw new UnauthorizedError(
      'This operation requires an authenticated user context.'
    );
  }
}
