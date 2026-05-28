import type { PaginationMeta } from './common.types.js';

// ─── API Response Envelopes ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
  trace_id: string;
}

// ─── Error Codes ──────────────────────────────────────────────────────────────

export enum ApiErrorCode {
  // Auth
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  GONE = 'GONE',

  // Business rule violations
  SLOT_UNAVAILABLE = 'SLOT_UNAVAILABLE',
  BOOKING_WINDOW_EXCEEDED = 'BOOKING_WINDOW_EXCEEDED',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  DUPLICATE_PERSONAL_NUMBER = 'DUPLICATE_PERSONAL_NUMBER',
  INVOICE_ALREADY_PAID = 'INVOICE_ALREADY_PAID',
  SUBSCRIPTION_LIMIT_EXCEEDED = 'SUBSCRIPTION_LIMIT_EXCEEDED',

  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

// ─── Service Response Wrapper ─────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiErrorCode; message: string; details?: unknown };

// ─── Query / Filter Standards ─────────────────────────────────────────────────

export interface ListQueryParams {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  search?: string;
}
