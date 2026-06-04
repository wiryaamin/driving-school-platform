import type { TenantContext } from './tenant-context.js';

/**
 * RequestContext — extends TenantContext with HTTP-layer metadata.
 * Created once per inbound request; passed to service methods that need
 * HTTP-level attribution (user agent, IP for audit logs, duration tracking).
 */
export interface RequestContext extends TenantContext {
  readonly requestId: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly startedAt: number;
}

export function buildRequestContext(
  tenant: TenantContext,
  opts: {
    requestId?: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  } = {}
): RequestContext {
  return {
    ...tenant,
    requestId: opts.requestId ?? tenant.correlationId,
    userAgent: opts.userAgent ?? null,
    ipAddress: opts.ipAddress ?? null,
    startedAt: Date.now(),
  };
}

export function getElapsedMs(ctx: RequestContext): number {
  return Date.now() - ctx.startedAt;
}
