import type { EdgeRequestContext } from './context.ts';

/**
 * Canonical error response schema — PR-2 Observability Architecture v1.0, §8 / ADR-003.
 *
 * Shape: { code, message, trace_id, request_id, details?, version }
 * Standardizes on the pattern already used by students/bookings/slots/etc.
 * (code/message/trace_id), extended with request_id (Package 1) and a
 * schema version field.
 *
 * Usage:
 *   return buildErrorResponse(ctx, 404, 'NOT_FOUND', 'Student not found');
 *   return buildErrorResponse(ctx, 422, 'VALIDATION_ERROR', 'Invalid input', { field: 'email' });
 */

const ERROR_SCHEMA_VERSION = 1;

export function buildErrorResponse(
  ctx: EdgeRequestContext,
  status: number,
  code: string,
  message: string,
  details?: unknown
): Response {
  const body: Record<string, unknown> = {
    code,
    message,
    trace_id: ctx.correlationId,
    request_id: ctx.requestId,
    version: ERROR_SCHEMA_VERSION,
  };
  if (details !== undefined) body['details'] = details;

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': ctx.correlationId,
      'X-Request-ID': ctx.requestId,
    },
  });
}

export function buildSuccessResponse<T>(
  ctx: EdgeRequestContext,
  data: T,
  status = 200
): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': ctx.correlationId,
      'X-Request-ID': ctx.requestId,
    },
  });
}
