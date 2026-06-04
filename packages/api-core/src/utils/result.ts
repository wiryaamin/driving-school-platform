import { ApiErrorCode } from '@platform/types';
import type { ServiceResult } from '@platform/types';
import { ServiceError, InternalError } from '../errors/service-errors.js';

export function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

export function fail<T = never>(
  code: ApiErrorCode,
  message: string,
  details?: unknown
): ServiceResult<T> {
  return { success: false, error: code, message, details };
}

/**
 * Converts any caught error into a ServiceResult.
 * ServiceErrors map directly; unknown errors become INTERNAL_ERROR.
 * Use in the catch block of every service method.
 */
export function fromError<T = never>(err: unknown): ServiceResult<T> {
  if (err instanceof ServiceError) {
    return {
      success: false,
      error: err.code as ApiErrorCode,
      message: err.message,
      details: err.details,
    };
  }
  const message =
    err instanceof Error ? err.message : 'An unexpected error occurred';
  return fail<T>(ApiErrorCode.INTERNAL_ERROR, message);
}

/**
 * Unwrap a ServiceResult, throwing an InternalError when success is false.
 * Use only in test helpers or when the caller already guarantees success.
 */
export function assertOk<T>(result: ServiceResult<T>): T {
  if (!result.success) {
    throw new InternalError(
      `Expected success but got error: ${result.error} — ${result.message}`
    );
  }
  return result.data;
}
