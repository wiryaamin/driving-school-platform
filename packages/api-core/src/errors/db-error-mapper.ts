import type { PostgrestError } from '@supabase/supabase-js';
import {
  ServiceError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  UnauthorizedError,
  ValidationError,
  InternalError,
} from './service-errors.js';

/**
 * Maps PostgreSQL / PostgREST error codes to typed ServiceErrors.
 * This is the ONLY place in the codebase that reads raw pg error codes.
 * Service layer callers receive typed ServiceErrors only.
 */
export function mapDbError(error: PostgrestError | Error): ServiceError {
  if ('code' in error) {
    const pg = error as PostgrestError;
    switch (pg.code) {
      case 'PGRST116':
        return new NotFoundError('Resource');
      case '23505':
        return new ConflictError('Resource already exists', pg.details);
      case '23503':
        return new ConflictError('Referenced resource does not exist', pg.details);
      case '42501':
        return new ForbiddenError('Database-level permission denied');
      case 'PGRST301':
        return new UnauthorizedError('JWT expired or invalid');
      // Our custom ERRCODE from soft_delete / soft_restore whitelist guards
      case '42P01':
        return new ValidationError(pg.message);
      // PostgREST request body schema validation failures
      case 'PGRST100':
      case 'PGRST102':
        return new ValidationError(pg.details ?? pg.message);
      // PostgREST: no rows matched for singular query
      case 'PGRST103':
        return new NotFoundError('Resource');
    }
  }
  return new InternalError(error instanceof Error ? error.message : 'Unknown database error');
}
