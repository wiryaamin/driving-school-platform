import { ApiErrorCode } from '@platform/types';

export class ServiceError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends ServiceError {
  constructor(message = 'Authentication required') {
    super(ApiErrorCode.UNAUTHORIZED, message, 401);
  }
}

export class ForbiddenError extends ServiceError {
  constructor(detail?: string) {
    super(
      ApiErrorCode.FORBIDDEN,
      detail !== undefined ? `Permission denied: ${detail}` : 'Permission denied',
      403,
      detail
    );
  }
}

export class NotFoundError extends ServiceError {
  constructor(resource: string, id?: string) {
    super(
      ApiErrorCode.NOT_FOUND,
      id !== undefined ? `${resource} '${id}' not found` : `${resource} not found`,
      404
    );
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(ApiErrorCode.CONFLICT, message, 409, details);
  }
}

export class ValidationError extends ServiceError {
  constructor(details: unknown) {
    super(ApiErrorCode.VALIDATION_ERROR, 'Validation failed', 422, details);
  }
}

/**
 * BusinessRuleError — domain invariant violated (e.g. slot already booked,
 * booking window exceeded). Use a specific ApiErrorCode from the domain.
 */
export class BusinessRuleError extends ServiceError {
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(code, message, 422, details);
  }
}

export class InternalError extends ServiceError {
  constructor(message = 'An unexpected error occurred') {
    super(ApiErrorCode.INTERNAL_ERROR, message, 500);
  }
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof ServiceError;
}
