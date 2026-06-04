import { z } from 'zod';
import { ListQuerySchema } from '../common/list-query.schema.js';

const EMPLOYMENT_TYPES = ['employed', 'contractor', 'external', 'on_leave', 'inactive'] as const;
const IDENTITY_TYPES   = ['personnummer', 'samordningsnummer', 'passport', 'national_id', 'none'] as const;
const PERSONNUMMER_HASH_REGEX = /^[a-f0-9]{64}$/i;

export const CreateInstructorSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name:  z.string().trim().min(1).max(100),
  email:      z.string().email(),

  phone:         z.string().max(30).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),

  identity_type:          z.enum(IDENTITY_TYPES).optional(),
  personnummer_encrypted:  z.string().optional(),
  personnummer_hash:       z.string().regex(PERSONNUMMER_HASH_REGEX, 'Must be SHA-256 hex (64 chars)').optional(),
  personnummer_last4:      z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits').optional(),

  employment_type:       z.enum(EMPLOYMENT_TYPES).optional(),
  employment_started_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  employment_ended_at:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  employee_number:       z.string().max(50).optional(),

  teaching_categories: z.array(z.string().min(1).max(10)).min(1).optional(),
  adi_number:          z.string().max(50).optional(),
  adi_valid_until:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),

  primary_location_id: z.string().uuid().optional(),
  languages_spoken:    z.array(z.enum(['sv', 'en'])).min(1).optional(),
  max_lessons_per_day: z.number().int().positive().max(20).optional(),
});

export type CreateInstructorDto = z.infer<typeof CreateInstructorSchema>;
export const UpdateInstructorSchema = CreateInstructorSchema.partial().extend({
  // email required on create but fully optional on update
  email: z.string().email().optional(),
});
export type UpdateInstructorDto = z.infer<typeof UpdateInstructorSchema>;

export const InstructorListQuerySchema = ListQuerySchema.extend({
  employment_type:   z.enum(EMPLOYMENT_TYPES).optional(),
  teaching_category: z.string().max(10).optional(),
  location_id:       z.string().uuid().optional(),
});
export type InstructorListQueryDto = z.infer<typeof InstructorListQuerySchema>;
