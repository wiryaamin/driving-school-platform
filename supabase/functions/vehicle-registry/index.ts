import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { performVehicleLookup, getVehicleRegistryStatus, isValidRegistrationNumberFormat } from '../_shared/vehicle-registry-service.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

// Vehicle CRUD itself lives directly on PostgREST+RLS (no existing `vehicles`
// Edge Function to attach to — see docs/INTEGRATION_CONFIGURATION_GUIDE.md
// §4.11). This function is scoped narrowly to what genuinely needs a
// server-side secret: the external registry lookup and its tenant status
// check — mirroring students/index.ts's lookup-person routes exactly.
// The returned data is never written to `vehicles` by this function; the
// frontend pre-fills the existing vehicle create/edit form with it, and the
// existing useCreateVehicle/useUpdateVehicle hooks (unchanged) perform the
// actual write, same as Person Lookup never writes to `students` directly.

const JSON_CT = { 'Content-Type': 'application/json' } as const;

function errorResp(ctx: EdgeRequestContext, status: number, code: string, message: string, details?: unknown): Response {
  const body: Record<string, unknown> = { code, message, trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 };
  if (details !== undefined) body['details'] = details;
  return new Response(JSON.stringify(body), {
    status, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function successResp<T>(ctx: EdgeRequestContext, data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.organizationId === null) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(code)) return errorResp(ctx, 403, 'FORBIDDEN', `Requires permission: ${code}`);
  return null;
}

const VehicleLookupSchema = z.object({
  registration_number: z.string().trim().min(6).max(10),
  vehicle_id:           z.string().uuid().optional(),
  force_refresh:        z.boolean().optional(),
});

async function handleVehicleLookup(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const lookupRateGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'vehicle_registry_lookup', ctx.correlationId);
  if (lookupRateGuard) return lookupRateGuard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  const parsed = VehicleLookupSchema.safeParse(body);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);

  // A lookup for an existing vehicle (vehicle_id present, e.g. from
  // BesiktningTab) only needs edit rights on that vehicle; a lookup while
  // registering a brand-new one needs create rights — checked after parsing
  // specifically so this distinction can be made, unlike the earlier
  // create-only check this replaced.
  const guard = requirePerm(ctx, parsed.data.vehicle_id ? 'vehicles:vehicle:update' : 'vehicles:vehicle:create');
  if (guard) return guard;

  const { registration_number, vehicle_id, force_refresh } = parsed.data;

  if (!isValidRegistrationNumberFormat(registration_number)) {
    return errorResp(ctx, 422, 'INVALID_REGISTRATION_NUMBER', 'Registration number format is invalid');
  }
  if (!ctx.organizationId) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');

  let result: Awaited<ReturnType<typeof performVehicleLookup>>;
  try {
    result = await performVehicleLookup({
      organizationId: ctx.organizationId,
      actorId:        ctx.actorId,
      registrationNumber: registration_number,
      vehicleId:      vehicle_id ?? null,
      forceRefresh:   force_refresh,
      correlationId:  ctx.correlationId,
    });
  } catch (err) {
    logger.error('vehicle_registry.lookup_failed', {
      correlation_id: ctx.correlationId, error: err instanceof Error ? err.message : String(err),
    });
    return errorResp(ctx, 502, 'VEHICLE_REGISTRY_LOOKUP_FAILED', 'Vehicle registry lookup service is temporarily unavailable');
  }

  logger.info('Vehicle.RegistryLookup', {
    request_id: ctx.requestId, correlation_id: ctx.correlationId, org_id: ctx.organizationId,
    actor_id: ctx.actorId, provider: result.provider, outcome: result.status, from_cache: result.fromCache,
  });

  return successResp(ctx, {
    status: result.status, data: result.data, error: result.error ?? null, error_type: result.errorType ?? null,
    provider: result.provider, capabilities: result.capabilities,
    from_cache: result.fromCache, looked_up_at: result.lookedUpAt, cached_at: result.cachedAt ?? null,
  });
}

async function handleVehicleRegistryStatus(_req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'vehicles:vehicle:read');
  if (guard) return guard;
  if (!ctx.organizationId) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');

  const status = await getVehicleRegistryStatus(ctx.organizationId);
  return successResp(ctx, {
    provider: status.provider, connected: status.connected,
    capabilities: status.capabilities, auto_lookup_enabled: status.autoLookupEnabled,
  });
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const startedAt = Date.now();
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;

  const pathname = new URL(req.url).pathname;
  let response: Response;

  try {
    if (pathname.endsWith('/status')) {
      response = req.method === 'GET'
        ? await handleVehicleRegistryStatus(req, ctx)
        : errorResp(ctx, 404, 'NOT_FOUND', 'Route not found');
    } else if (pathname.endsWith('/lookup')) {
      response = req.method === 'POST'
        ? await handleVehicleLookup(req, ctx)
        : errorResp(ctx, 404, 'NOT_FOUND', 'Route not found');
    } else {
      response = errorResp(ctx, 404, 'NOT_FOUND', 'Route not found');
    }
  } catch (err) {
    logger.error('vehicle_registry.unhandled_error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    response = errorResp(ctx, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  logger.info('request.completed', {
    method: req.method, path: pathname, status: response.status,
    request_id: ctx.requestId, correlation_id: ctx.correlationId, duration_ms: Date.now() - startedAt,
  });

  return response;
}));
