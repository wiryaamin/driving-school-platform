import {
  ApiErrorCode,
  type ServiceResult,
  type PagedResult,
  type LessonSlot,
  type LessonBooking,
  type CreateLessonSlotInput,
  type UpdateLessonSlotInput,
  type LessonSlotInsert,
  type LessonSlotUpdate,
  type LessonSlotListQueryInput,
  type CreateBookingInput,
  type CancelBookingInput,
  type RescheduleBookingInput,
  type LessonBookingListQueryInput,
  type BookingStatus,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { requireOrgContext } from '../context/tenant-context.js';
import { assertPermission, requireActor } from '../middleware/rbac.middleware.js';
import { ok, fail, fromError } from '../utils/result.js';
import { OutboxPublisher } from '../events/outbox.publisher.js';
import { LessonSlotRepository } from '../repositories/lesson-slot.repository.js';
import { LessonBookingRepository } from '../repositories/lesson-booking.repository.js';

// ─── Booking state machine ─────────────────────────────────────────────────────
// Mirrors is_valid_booking_transition() in the DB (Phase 2B Section 9).

const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  draft:       ['reserved', 'confirmed', 'cancelled'],
  reserved:    ['confirmed', 'cancelled'],
  confirmed:   ['completed', 'cancelled', 'no_show', 'rescheduled'],
  completed:   [],
  cancelled:   [],
  no_show:     [],
  rescheduled: [],
};

function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SchedulingService {
  constructor(
    private readonly slotRepo: LessonSlotRepository,
    private readonly bookingRepo: LessonBookingRepository,
    private readonly outbox: OutboxPublisher,
  ) {}

  // ── Slot operations ──────────────────────────────────────────────────────────

  async createSlot(
    ctx: TenantContext,
    input: CreateLessonSlotInput,
  ): Promise<ServiceResult<LessonSlot>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'scheduling:slot:create');

      const instructorAvail = await this.slotRepo.checkInstructorAvailability(
        ctx, input.instructor_id, input.starts_at, input.ends_at
      );
      if (!instructorAvail) {
        return fail(ApiErrorCode.SLOT_UNAVAILABLE, 'Instructor is not available during this time window');
      }

      if (input.vehicle_id !== undefined && input.vehicle_id !== null) {
        const vehicleAvail = await this.slotRepo.checkVehicleAvailability(
          ctx, input.vehicle_id, input.starts_at, input.ends_at
        );
        if (!vehicleAvail) {
          return fail(ApiErrorCode.SLOT_UNAVAILABLE, 'Vehicle is not available during this time window');
        }
      }

      const insertDto: LessonSlotInsert = {
        ...input,
        created_by: ctx.actorId,
        updated_by: ctx.actorId,
      };

      const slot = await this.slotRepo.insert(ctx, insertDto);

      await this.outbox.publish(ctx, {
        eventType: 'Lesson.SlotCreated',
        channel:   'internal',
        payload:   { slot_id: slot.id, instructor_id: slot.instructor_id, starts_at: slot.starts_at },
        targetId:  slot.id,
      });

      return ok(slot as LessonSlot);
    } catch (err) {
      return fromError(err);
    }
  }

  async updateSlot(
    ctx: TenantContext,
    id: string,
    input: UpdateLessonSlotInput,
  ): Promise<ServiceResult<LessonSlot>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'scheduling:slot:update');

      const existing = await this.slotRepo.findByIdOrThrow(ctx, id);

      const newStartsAt = input.starts_at ?? existing.starts_at;
      const newEndsAt   = input.ends_at   ?? existing.ends_at;
      const newInstr    = input.instructor_id ?? existing.instructor_id;
      const newVehicle  = input.vehicle_id !== undefined ? input.vehicle_id : existing.vehicle_id;

      if (
        input.instructor_id !== undefined ||
        input.starts_at !== undefined ||
        input.ends_at !== undefined
      ) {
        const avail = await this.slotRepo.checkInstructorAvailability(
          ctx, newInstr, newStartsAt, newEndsAt, id
        );
        if (!avail) {
          return fail(ApiErrorCode.SLOT_UNAVAILABLE, 'Instructor is not available during this time window');
        }
      }

      if (
        newVehicle !== null &&
        (input.vehicle_id !== undefined || input.starts_at !== undefined || input.ends_at !== undefined)
      ) {
        const avail = await this.slotRepo.checkVehicleAvailability(
          ctx, newVehicle!, newStartsAt, newEndsAt, id
        );
        if (!avail) {
          return fail(ApiErrorCode.SLOT_UNAVAILABLE, 'Vehicle is not available during this time window');
        }
      }

      const updateDto: LessonSlotUpdate = {
        ...input,
        updated_by: ctx.actorId,
      };

      const slot = await this.slotRepo.update(ctx, id, updateDto);
      return ok(slot as LessonSlot);
    } catch (err) {
      return fromError(err);
    }
  }

  async getSlot(ctx: TenantContext, id: string): Promise<ServiceResult<LessonSlot>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'scheduling:slot:read');

      const slot = await this.slotRepo.findByIdOrThrow(ctx, id);
      return ok(slot as LessonSlot);
    } catch (err) {
      return fromError(err);
    }
  }

  async listSlots(
    ctx: TenantContext,
    query: LessonSlotListQueryInput,
  ): Promise<ServiceResult<PagedResult<LessonSlot>>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'scheduling:slot:read');

      const result = await this.slotRepo.listSlots(ctx, query);
      return ok(result as PagedResult<LessonSlot>);
    } catch (err) {
      return fromError(err);
    }
  }

  async cancelSlot(ctx: TenantContext, id: string): Promise<ServiceResult<LessonSlot>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'scheduling:slot:delete');

      const slot = await this.slotRepo.findByIdOrThrow(ctx, id);

      if (slot.status === 'cancelled') {
        return fail(ApiErrorCode.CONFLICT, 'Slot is already cancelled');
      }

      // Check for active bookings before cancelling
      const bookings = await this.bookingRepo.findBySlot(ctx, id);
      const activeBookings = bookings.filter(
        b => !['cancelled', 'no_show', 'rescheduled'].includes(b.status)
      );
      if (activeBookings.length > 0) {
        return fail(
          ApiErrorCode.CONFLICT,
          `Cannot cancel slot with ${activeBookings.length} active booking(s). Cancel or reschedule bookings first.`
        );
      }

      const updated = await this.slotRepo.update(ctx, id, {
        status:            'cancelled',
        status_changed_at: new Date().toISOString(),
        updated_by:        ctx.actorId,
      });

      await this.outbox.publish(ctx, {
        eventType: 'Lesson.SlotCancelled',
        channel:   'internal',
        payload:   { slot_id: id, cancelled_by: ctx.actorId },
        targetId:  id,
      });

      return ok(updated as LessonSlot);
    } catch (err) {
      return fromError(err);
    }
  }

  // ── Booking operations ───────────────────────────────────────────────────────

  async createBooking(
    ctx: TenantContext,
    input: CreateBookingInput,
  ): Promise<ServiceResult<LessonBooking>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'scheduling:booking:create');

      // Verify slot exists and has capacity
      const slot = await this.slotRepo.findByIdOrThrow(ctx, input.slot_id);
      if (slot.status === 'cancelled' || slot.status === 'blocked') {
        return fail(ApiErrorCode.SLOT_UNAVAILABLE, `Slot is ${slot.status}`);
      }
      if (slot.current_bookings >= slot.max_bookings) {
        return fail(ApiErrorCode.SLOT_UNAVAILABLE, 'Slot is at full capacity');
      }

      // Pre-flight: check student has no overlapping booking
      const studentAvail = await this.bookingRepo.checkStudentAvailability(
        ctx, input.student_id, slot.starts_at, slot.ends_at
      );
      if (!studentAvail) {
        return fail(ApiErrorCode.CONFLICT, 'Student already has a booking overlapping this time window');
      }

      const booking = await this.bookingRepo.insert(ctx, {
        slot_id:    input.slot_id,
        student_id: input.student_id,
        status:     input.status ?? 'reserved',
        booked_by:  ctx.actorId,
        ...(input.price_sek !== undefined && { price_sek: input.price_sek }),
        created_by: ctx.actorId,
        updated_by: ctx.actorId,
      });

      await this.outbox.publish(ctx, {
        eventType: 'Lesson.Created',
        channel:   'internal',
        payload: {
          booking_id:    booking.id,
          slot_id:       booking.slot_id,
          student_id:    booking.student_id,
          instructor_id: booking.instructor_id,
          starts_at:     booking.starts_at,
        },
        targetId: booking.id,
      });

      return ok(booking as LessonBooking);
    } catch (err) {
      // PostgreSQL EXCLUDE violation (23P01) = double-booking
      if (err instanceof Error && err.message.includes('23P01')) {
        return fail(ApiErrorCode.SLOT_UNAVAILABLE, 'Booking conflict: the time window is already occupied');
      }
      return fromError(err);
    }
  }

  async updateBooking(
    ctx: TenantContext,
    id: string,
    input: { status: BookingStatus },
  ): Promise<ServiceResult<LessonBooking>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'scheduling:booking:update');

      const existing = await this.bookingRepo.findByIdOrThrow(ctx, id);

      if (!isValidTransition(existing.status, input.status)) {
        return fail(
          ApiErrorCode.CONFLICT,
          `Booking status transition '${existing.status}' → '${input.status}' is not permitted`
        );
      }

      const booking = await this.bookingRepo.update(ctx, id, {
        status:            input.status,
        status_changed_at: new Date().toISOString(),
        updated_by:        ctx.actorId,
      });

      await this.outbox.publish(ctx, {
        eventType: 'Lesson.Updated',
        channel:   'internal',
        payload:   { booking_id: id, status: input.status },
        targetId:  id,
      });

      return ok(booking as LessonBooking);
    } catch (err) {
      return fromError(err);
    }
  }

  async getBooking(ctx: TenantContext, id: string): Promise<ServiceResult<LessonBooking>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'scheduling:booking:read');

      const booking = await this.bookingRepo.findByIdOrThrow(ctx, id);
      return ok(booking as LessonBooking);
    } catch (err) {
      return fromError(err);
    }
  }

  async listBookings(
    ctx: TenantContext,
    query: LessonBookingListQueryInput,
  ): Promise<ServiceResult<PagedResult<LessonBooking>>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'scheduling:booking:read');

      const result = await this.bookingRepo.listBookings(ctx, query);
      return ok(result as PagedResult<LessonBooking>);
    } catch (err) {
      return fromError(err);
    }
  }

  async cancelBooking(
    ctx: TenantContext,
    id: string,
    input: CancelBookingInput = {},
  ): Promise<ServiceResult<LessonBooking>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'scheduling:booking:update');

      const existing = await this.bookingRepo.findByIdOrThrow(ctx, id);

      if (!isValidTransition(existing.status, 'cancelled')) {
        return fail(
          ApiErrorCode.CONFLICT,
          `Cannot cancel a booking in '${existing.status}' status`
        );
      }

      const now = new Date().toISOString();
      const booking = await this.bookingRepo.update(ctx, id, {
        status:               'cancelled',
        status_changed_at:    now,
        cancelled_at:         now,
        cancelled_by:         ctx.actorId,
        ...(input.cancellation_reason   !== undefined && { cancellation_reason:   input.cancellation_reason }),
        ...(input.cancellation_category !== undefined && { cancellation_category: input.cancellation_category }),
        updated_by: ctx.actorId,
      });

      await this.outbox.publish(ctx, {
        eventType: 'Lesson.Cancelled',
        channel:   'internal',
        payload: {
          booking_id:           id,
          student_id:           existing.student_id,
          slot_id:              existing.slot_id,
          cancellation_category: input.cancellation_category ?? null,
        },
        targetId: id,
      });

      return ok(booking as LessonBooking);
    } catch (err) {
      return fromError(err);
    }
  }

  async rescheduleBooking(
    ctx: TenantContext,
    id: string,
    input: RescheduleBookingInput,
  ): Promise<ServiceResult<LessonBooking>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'scheduling:booking:create');

      const oldBooking = await this.bookingRepo.findByIdOrThrow(ctx, id);

      // Only reserved or confirmed bookings can be rescheduled
      if (!['reserved', 'confirmed'].includes(oldBooking.status)) {
        return fail(
          ApiErrorCode.CONFLICT,
          `Cannot reschedule a booking in '${oldBooking.status}' status. Only reserved or confirmed bookings may be rescheduled.`
        );
      }

      const newSlot = await this.slotRepo.findByIdOrThrow(ctx, input.new_slot_id);
      if (newSlot.status === 'cancelled' || newSlot.status === 'blocked') {
        return fail(ApiErrorCode.SLOT_UNAVAILABLE, `Target slot is ${newSlot.status}`);
      }
      if (newSlot.current_bookings >= newSlot.max_bookings) {
        return fail(ApiErrorCode.SLOT_UNAVAILABLE, 'Target slot is at full capacity');
      }

      // Pre-flight: check student is available at new slot time (excluding old booking)
      const studentAvail = await this.bookingRepo.checkStudentAvailability(
        ctx,
        oldBooking.student_id,
        newSlot.starts_at,
        newSlot.ends_at,
        id  // exclude old booking from the overlap check
      );
      if (!studentAvail) {
        return fail(ApiErrorCode.CONFLICT, 'Student already has a booking overlapping the target time window');
      }

      // Mark old booking as rescheduled
      const now = new Date().toISOString();
      await this.bookingRepo.update(ctx, id, {
        status:            'rescheduled',
        status_changed_at: now,
        updated_by:        ctx.actorId,
      });

      // Create new booking pointing back to the old one
      const newBooking = await this.bookingRepo.insert(ctx, {
        slot_id:             input.new_slot_id,
        student_id:          oldBooking.student_id,
        status:              'reserved',
        rescheduled_from_id: id,
        booked_by:           ctx.actorId,
        ...(oldBooking.price_sek !== null && { price_sek: oldBooking.price_sek }),
        created_by: ctx.actorId,
        updated_by: ctx.actorId,
      });

      await this.outbox.publish(ctx, {
        eventType: 'Lesson.Rescheduled',
        channel:   'internal',
        payload: {
          old_booking_id: id,
          new_booking_id: newBooking.id,
          student_id:     oldBooking.student_id,
          old_slot_id:    oldBooking.slot_id,
          new_slot_id:    input.new_slot_id,
          new_starts_at:  newSlot.starts_at,
        },
        targetId: newBooking.id,
      });

      return ok(newBooking as LessonBooking);
    } catch (err) {
      if (err instanceof Error && err.message.includes('23P01')) {
        return fail(ApiErrorCode.SLOT_UNAVAILABLE, 'Booking conflict: the target time window is already occupied');
      }
      return fromError(err);
    }
  }

  async getStudentHistory(
    ctx: TenantContext,
    studentId: string,
    options?: { from?: string; to?: string; limit?: number },
  ): Promise<ServiceResult<LessonBooking[]>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'scheduling:booking:read');

      const bookings = await this.bookingRepo.findByStudent(ctx, studentId, options);
      return ok(bookings as LessonBooking[]);
    } catch (err) {
      return fromError(err);
    }
  }
}
