import type { EdgeRequestContext } from './context.ts';

// Mirrors packages/types/src/api.types.ts ApiErrorCode — keep in sync
type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'SLOT_UNAVAILABLE'
  | 'BOOKING_WINDOW_EXCEEDED'
  | 'INSUFFICIENT_CREDITS'
  | 'DUPLICATE_PERSONAL_NUMBER'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMIT_EXCEEDED';

const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED:              401,
  FORBIDDEN:                 403,
  NOT_FOUND:                 404,
  CONFLICT:                  409,
  VALIDATION_ERROR:          422,
  SLOT_UNAVAILABLE:          422,
  BOOKING_WINDOW_EXCEEDED:   422,
  INSUFFICIENT_CREDITS:      422,
  DUPLICATE_PERSONAL_NUMBER: 409,
  INTERNAL_ERROR:            500,
  RATE_LIMIT_EXCEEDED:       429,
};

export interface ServiceResult<T> {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  message: string;
  details?: unknown;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

/**
 * Convert a ServiceResult from packages/api-core into an HTTP Response.
 * Attaches X-Correlation-ID from context to all responses.
 */
export function toHttpResponse<T>(
  result: { success: true; data: T } | { success: false; error: string; message: string; details?: unknown },
  ctx: EdgeRequestContext,
  successStatus = 200
): Response {
  const headers = {
    ...JSON_HEADERS,
    'X-Correlation-ID': ctx.correlationId,
  };

  if (result.success) {
    return new Response(
      JSON.stringify({ data: result.data }),
      { status: successStatus, headers }
    );
  }

  const code = result.error as ErrorCode;
  const status = ERROR_STATUS[code] ?? 500;

  return new Response(
    JSON.stringify({
      code: result.error,
      message: result.message,
      ...(result.details !== undefined && { details: result.details }),
      trace_id: ctx.correlationId,
    }),
    { status, headers }
  );
}

/**
 * Shorthand for a JSON success response without a ServiceResult wrapper.
 * Use when the service layer is bypassed (e.g. health checks, metadata endpoints).
 */
export function jsonResponse<T>(
  data: T,
  ctx: EdgeRequestContext,
  status = 200
): Response {
  return new Response(
    JSON.stringify({ data }),
    {
      status,
      headers: {
        ...JSON_HEADERS,
        'X-Correlation-ID': ctx.correlationId,
      },
    }
  );
}

/**
 * Paginated list response — wraps data + PaginationMeta in the standard envelope.
 */
export function pagedResponse<T>(
  result: { success: true; data: { data: T[]; meta: unknown } } | { success: false; error: string; message: string; details?: unknown },
  ctx: EdgeRequestContext
): Response {
  if (!result.success) {
    return toHttpResponse(result, ctx);
  }
  const headers = {
    ...JSON_HEADERS,
    'X-Correlation-ID': ctx.correlationId,
  };
  return new Response(
    JSON.stringify({
      data: result.data.data,
      meta: result.data.meta,
    }),
    { status: 200, headers }
  );
}
