import { z } from 'zod';

export const UuidSchema = z.string().uuid('Must be a valid UUID');

export const UuidParamsSchema = z.object({
  id: UuidSchema,
});

export type UuidParamsDto = z.infer<typeof UuidParamsSchema>;

export const OptionalUuidSchema = z.string().uuid().optional();
