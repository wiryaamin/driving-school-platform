import { z } from 'zod';
import { ListQuerySchema } from '../common/index.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LESSON_SLOT_STATUSES = [
  'open', 'full', 'in_progress', 'completed', 'cancelled', 'blocked',
] as const;

const BOOKING_STATUSES = [
  'draft', 'reserved', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled',
] as const;

const CANCELLATION_CATEGORIES = [
  'student_request', 'school_cancelled', 'weather', 'vehicle_fault', 'instructor_sick', 'other',
] as const;

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// ─── Lesson Slot Schemas ──────────────────────────────────────────────────────

export const CreateLessonSlotSchema = z.object({
  instructor_id:   z.string().uuid(),
  vehicle_id:      z.string().uuid().nullable().optional(),
  location_id:     z.string().uuid().nullable().optional(),
  lesson_type_id:  z.string().uuid(),
  starts_at:       z.string().regex(DATETIME_RE, 'Must be ISO datetime'),
  ends_at:         z.string().regex(DATETIME_RE, 'Must be ISO datetime'),
  timezone:        z.string().min(1).max(50).optional(),
  max_bookings:    z.number().int().min(1).max(50).optional(),
  notes:           z.string().max(2000).nullable().optional(),
}).refine(
  data => new Date(data.ends_at) > new Date(data.starts_at),
  { message: 'ends_at must be after starts_at', path: ['ends_at'] }
);

export const UpdateLessonSlotSchema = z.object({
  instructor_id:   z.string().uuid().optional(),
  vehicle_id:      z.string().uuid().nullable().optional(),
  location_id:     z.string().uuid().nullable().optional(),
  lesson_type_id:  z.string().uuid().optional(),
  starts_at:       z.string().regex(DATETIME_RE, 'Must be ISO datetime').optional(),
  ends_at:         z.string().regex(DATETIME_RE, 'Must be ISO datetime').optional(),
  timezone:        z.string().min(1).max(50).optional(),
  max_bookings:    z.number().int().min(1).max(50).optional(),
  notes:           z.string().max(2000).nullable().optional(),
});

export const LessonSlotListQuerySchema = ListQuerySchema.extend({
  instructor_id:  z.string().uuid().optional(),
  vehicle_id:     z.string().uuid().optional(),
  location_id:    z.string().uuid().optional(),
  lesson_type_id: z.string().uuid().optional(),
  status:         z.enum(LESSON_SLOT_STATUSES).optional(),
  from:           z.string().regex(DATETIME_RE, 'Must be ISO datetime').optional(),
  to:             z.string().regex(DATETIME_RE, 'Must be ISO datetime').optional(),
});

// ─── Booking Schemas ──────────────────────────────────────────────────────────

export const CreateBookingSchema = z.object({
  slot_id:    z.string().uuid(),
  student_id: z.string().uuid(),
  status:     z.enum(BOOKING_STATUSES).optional(),
  price_sek:  z.number().min(0).nullable().optional(),
});

export const UpdateBookingSchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
});

export const CancelBookingSchema = z.object({
  cancellation_reason:    z.string().max(2000).nullable().optional(),
  cancellation_category:  z.enum(CANCELLATION_CATEGORIES).nullable().optional(),
});

export const RescheduleBookingSchema = z.object({
  new_slot_id: z.string().uuid(),
});

export const LessonBookingListQuerySchema = ListQuerySchema.extend({
  student_id:    z.string().uuid().optional(),
  instructor_id: z.string().uuid().optional(),
  slot_id:       z.string().uuid().optional(),
  status:        z.enum(BOOKING_STATUSES).optional(),
  from:          z.string().regex(DATETIME_RE, 'Must be ISO datetime').optional(),
  to:            z.string().regex(DATETIME_RE, 'Must be ISO datetime').optional(),
});

// ─── DTO types ────────────────────────────────────────────────────────────────

export type CreateLessonSlotDto      = z.infer<typeof CreateLessonSlotSchema>;
export type UpdateLessonSlotDto      = z.infer<typeof UpdateLessonSlotSchema>;
export type LessonSlotListQueryDto   = z.infer<typeof LessonSlotListQuerySchema>;

export type CreateBookingDto         = z.infer<typeof CreateBookingSchema>;
export type UpdateBookingDto         = z.infer<typeof UpdateBookingSchema>;
export type CancelBookingDto         = z.infer<typeof CancelBookingSchema>;
export type RescheduleBookingDto     = z.infer<typeof RescheduleBookingSchema>;
export type LessonBookingListQueryDto = z.infer<typeof LessonBookingListQuerySchema>;
