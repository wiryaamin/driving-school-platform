import type { TenantContext } from './tenant-context.js';

/**
 * WorkerContext — used by background workers (Edge Function crons, slot generators,
 * event dispatch workers). No JWT context; service_role key bypasses RLS.
 *
 * actorId is null — DB functions that call auth.uid() will receive null, which
 * is expected and handled in all SECURITY DEFINER functions (Phase 2C–2E).
 */
export interface WorkerContext extends TenantContext {
  readonly actorId: null;
  readonly isWorker: true;
  readonly isPlatformAdmin: false;
  readonly organizationId: string;
}

export function buildWorkerContext(
  organizationId: string,
  correlationId?: string
): WorkerContext {
  return {
    organizationId,
    actorId: null,
    actorRole: 'org_owner',
    permissions: [],
    correlationId: correlationId ?? crypto.randomUUID(),
    isPlatformAdmin: false,
    isWorker: true,
  };
}

export function buildPlatformWorkerContext(correlationId?: string): WorkerContext {
  return {
    organizationId: 'platform',
    actorId: null,
    actorRole: 'platform_superadmin',
    permissions: [],
    correlationId: correlationId ?? crypto.randomUUID(),
    isPlatformAdmin: false,
    isWorker: true,
  };
}
