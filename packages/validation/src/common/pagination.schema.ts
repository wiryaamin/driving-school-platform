import { z } from 'zod';

export const PaginationSchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(25),
});

export type PaginationDto = z.infer<typeof PaginationSchema>;
