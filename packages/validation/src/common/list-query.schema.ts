import { z } from 'zod';
import { PaginationSchema } from './pagination.schema.js';

/**
 * Base schema for all list-query endpoints.
 * Extend per-domain with additional filter fields:
 *
 *   export const StudentListQuerySchema = ListQuerySchema.extend({
 *     status: z.enum(['active', 'graduated']).optional(),
 *   });
 */
export const ListQuerySchema = PaginationSchema.extend({
  sort_by:  z.string().optional(),
  sort_dir: z.enum(['asc', 'desc']).optional(),
  search:   z.string().min(1).max(200).optional(),
});

export type ListQueryDto = z.infer<typeof ListQuerySchema>;
