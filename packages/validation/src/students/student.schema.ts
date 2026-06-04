import { z } from 'zod';
import { ListQuerySchema } from '../common/list-query.schema.js';

const STUDENT_STATUSES = [
  'lead', 'onboarding', 'active', 'paused', 'completed', 'withdrawn', 'archived',
] as const;

const PERMIT_STAGES = [
  'not_started',
  'theory_study',
  'risk1_booked', 'risk1_completed',
  'risk2_booked', 'risk2_completed',
  'theory_exam_booked', 'theory_passed',
  'practical_exam_booked', 'practical_passed',
  'licence_issued',
] as const;

const IDENTITY_TYPES = [
  'personnummer', 'samordningsnummer', 'passport', 'national_id', 'none',
] as const;

// HMAC-SHA256 hex digest (64 hex chars) — the expected format for personnummer_hash
const PERSONNUMMER_HASH_REGEX = /^[a-f0-9]{64}$/i;

export const CreateStudentSchema = z.object({
  first_name:  z.string().trim().min(1).max(100),
  last_name:   z.string().trim().min(1).max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),

  identity_type:           z.enum(IDENTITY_TYPES).optional(),
  personnummer_encrypted:  z.string().optional(),
  personnummer_hash:       z.string().regex(PERSONNUMMER_HASH_REGEX, 'Must be SHA-256 hex (64 chars)').optional(),
  personnummer_last4:      z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits').optional(),

  email:         z.string().email().optional(),
  phone:         z.string().max(30).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  postal_code:   z.string().max(20).optional(),
  city:          z.string().max(100).optional(),

  preferred_language:         z.enum(['sv', 'en']).optional(),
  communication_opt_in_email: z.boolean().optional(),
  communication_opt_in_sms:   z.boolean().optional(),

  data_processing_consent: z.boolean().optional(),
  marketing_consent:       z.boolean().optional(),
  gdpr_consent_given_at:   z.string().datetime({ offset: true }).optional(),
  gdpr_consent_version:    z.string().max(50).optional(),

  status:                  z.enum(STUDENT_STATUSES).optional(),
  enrolled_at:             z.string().datetime({ offset: true }).optional(),
  enrollment_location_id:  z.string().uuid().optional(),
  assigned_instructor_id:  z.string().uuid().optional(),
  target_licence_category: z.string().max(10).optional(),
  permit_stage:            z.enum(PERMIT_STAGES).optional(),
});

export type CreateStudentDto = z.infer<typeof CreateStudentSchema>;

export const UpdateStudentSchema = CreateStudentSchema.partial();

export type UpdateStudentDto = z.infer<typeof UpdateStudentSchema>;

export const StudentListQuerySchema = ListQuerySchema.extend({
  status:           z.enum(STUDENT_STATUSES).optional(),
  instructor_id:    z.string().uuid().optional(),
  permit_stage:     z.enum(PERMIT_STAGES).optional(),
  licence_category: z.string().max(10).optional(),
});

export type StudentListQueryDto = z.infer<typeof StudentListQuerySchema>;
