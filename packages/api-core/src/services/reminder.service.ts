import {
  type ServiceResult,
  type LessonReminder,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { requireOrgContext } from '../context/tenant-context.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { ok, fromError } from '../utils/result.js';
import { LessonReminderRepository } from '../repositories/lesson-reminder.repository.js';

export class ReminderService {
  constructor(
    private readonly reminderRepo: LessonReminderRepository,
  ) {}

  // Schedule reminder rows for a booking based on the org's automation rules.
  // Called after a booking is created (typically via worker handler).
  async scheduleRemindersForBooking(
    ctx: TenantContext,
    bookingId: string,
  ): Promise<ServiceResult<number>> {
    try {
      requireOrgContext(ctx);

      const count = await this.reminderRepo.scheduleForBooking(ctx, bookingId);
      return ok(count);
    } catch (err) {
      return fromError(err);
    }
  }

  // Cancel all 'scheduled' reminders for a booking.
  // Called when a booking is cancelled or rescheduled.
  async cancelRemindersForBooking(
    ctx: TenantContext,
    bookingId: string,
  ): Promise<ServiceResult<number>> {
    try {
      requireOrgContext(ctx);

      const count = await this.reminderRepo.cancelForBooking(ctx, bookingId);
      return ok(count);
    } catch (err) {
      return fromError(err);
    }
  }

  // List all reminders for a booking (read-only, for admin inspection).
  async listRemindersForBooking(
    ctx: TenantContext,
    bookingId: string,
  ): Promise<ServiceResult<LessonReminder[]>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'scheduling:booking:read');

      const reminders = await this.reminderRepo.findByBooking(ctx, bookingId);
      return ok(reminders);
    } catch (err) {
      return fromError(err);
    }
  }
}
