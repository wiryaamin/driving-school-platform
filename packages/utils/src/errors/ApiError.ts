import { ApiErrorCode } from '@platform/types';

/**
 * Typed API error thrown by the service layer.
 * All Supabase errors are translated into ApiError instances before reaching components.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly traceId: string;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode = 500,
    details?: unknown,
    traceId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.traceId = traceId ?? crypto.randomUUID();
  }

  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  isForbidden(): boolean {
    return this.statusCode === 403;
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      traceId: this.traceId,
    };
  }
}

/**
 * Translate a Supabase PostgREST error code to an ApiErrorCode.
 */
export function translateSupabaseError(code: string): { errorCode: ApiErrorCode; statusCode: number } {
  switch (code) {
    case 'PGRST116': // 0 rows returned
      return { errorCode: ApiErrorCode.NOT_FOUND, statusCode: 404 };
    case '23505': // unique_violation
      return { errorCode: ApiErrorCode.CONFLICT, statusCode: 409 };
    case '42501': // insufficient_privilege
      return { errorCode: ApiErrorCode.FORBIDDEN, statusCode: 403 };
    default:
      return { errorCode: ApiErrorCode.INTERNAL_ERROR, statusCode: 500 };
  }
}
