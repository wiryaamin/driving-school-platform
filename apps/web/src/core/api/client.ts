/**
 * API client foundation — the service layer base.
 * All feature services import from here, never directly from supabase.ts.
 *
 * Architecture: Component → Hook → Service → API Client → Supabase
 */

import { supabase } from './supabase.js';
import { ApiError } from '@platform/utils';
import { ApiErrorCode } from '@platform/types';
import type { PostgrestError } from '@supabase/supabase-js';

export { supabase };

/**
 * Translate a Supabase/PostgREST error into a typed ApiError.
 */
export function handleSupabaseError(error: PostgrestError): never {
  const code = error.code;

  if (code === 'PGRST116') {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Resource not found', 404);
  }
  if (code === '23505') {
    throw new ApiError(ApiErrorCode.CONFLICT, 'Resource already exists', 409);
  }
  if (code === '42501') {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Permission denied', 403);
  }
  if (code === 'PGRST301') {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'JWT expired', 401);
  }

  throw new ApiError(ApiErrorCode.INTERNAL_ERROR, error.message, 500, error);
}

/**
 * Unwrap a Supabase query result, throwing ApiError on failure.
 */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) handleSupabaseError(result.error);
  if (result.data === null) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Resource not found', 404);
  }
  return result.data;
}

/**
 * Unwrap a Supabase query result that may return null (for optional resources).
 */
export function unwrapNullable<T>(
  result: { data: T | null; error: PostgrestError | null }
): T | null {
  if (result.error) handleSupabaseError(result.error);
  return result.data;
}
