import {
  ApiErrorCode,
  type ServiceResult,
  type WaitlistEntry,
  type JoinWaitlistInput,
  type WaitlistEntryInsert,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { requireOrgContext } from '../context/tenant-context.js';
import { assertPermission, requireActor } from '../middleware/rbac.middleware.js';
import { ok, fail, fromError } from '../utils/result.js';
import { WaitlistRepository } from '../repositories/waitlist.repository.js';
import { LessonSlotRepository } from '../repositories/lesson-slot.repository.js';

export class WaitlistService {
  constructor(
    private readonly waitlistRepo: WaitlistRepository,
    private readonly slotRepo: LessonSlotRepository,
  ) {}

  async joinWaitlist(
    ctx: TenantContext,
    input: JoinWaitlistInput,
  ): Promise<ServiceResult<WaitlistEntry>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'scheduling:booking:create');

      // Verify slot exists and belongs to this org
      const slot = await this.slotRepo.findByIdOrThrow(ctx, input.slot_id);

      if (slot.status === 'cancelled' || slot.status === 'blocked') {
        return fail(ApiErrorCode.CONFLICT, `Cannot join waitlist for a ${slot.status} slot`);
      }

      // Check for an existing active waitlist entry for this student + slot
      const existing = await this.waitlistRepo.findActiveByStudentAndSlot(
        ctx, input.student_id, input.slot_id
      );
      if (existing !== null) {
        return fail(ApiErrorCode.CONFLICT, 'Student already has an active waitlist entry for this slot');
      }

      const insertDto: WaitlistEntryInsert = {
        ...input,
        status: 'waiting',
      };

      const entry = await this.waitlistRepo.insert(ctx, insertDto);
      return ok(entry);
    } catch (err) {
      return fromError(err);
    }
  }

  async leaveWaitlist(
    ctx: TenantContext,
    entryId: string,
  ): Promise<ServiceResult<WaitlistEntry>> {
    try {
      requireOrgContext(ctx);
      requireActor(ctx);
      assertPermission(ctx, 'scheduling:booking:update');

      const existing = await this.waitlistRepo.findByIdOrThrow(ctx, entryId);

      if (existing.status !== 'waiting') {
        return fail(
          ApiErrorCode.CONFLICT,
          `Cannot cancel a waitlist entry in '${existing.status}' status`
        );
      }

      const updated = await this.waitlistRepo.update(ctx, entryId, {
        status:            'cancelled',
        status_changed_at: new Date().toISOString(),
      });
      return ok(updated);
    } catch (err) {
      return fromError(err);
    }
  }

  async getEntry(
    ctx: TenantContext,
    entryId: string,
  ): Promise<ServiceResult<WaitlistEntry>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'scheduling:booking:read');

      const entry = await this.waitlistRepo.findByIdOrThrow(ctx, entryId);
      return ok(entry);
    } catch (err) {
      return fromError(err);
    }
  }

  async listWaitlist(
    ctx: TenantContext,
    slotId: string,
    statusFilter?: string,
  ): Promise<ServiceResult<WaitlistEntry[]>> {
    try {
      requireOrgContext(ctx);
      assertPermission(ctx, 'scheduling:booking:read');

      const entries = await this.waitlistRepo.listBySlot(ctx, slotId, statusFilter);
      return ok(entries);
    } catch (err) {
      return fromError(err);
    }
  }

  // Promote the top-priority waiting entry for a slot.
  // Called by the worker after a lesson cancellation frees a slot.
  async promoteNext(
    ctx: TenantContext,
    slotId: string,
  ): Promise<ServiceResult<string | null>> {
    try {
      requireOrgContext(ctx);

      const promotedId = await this.waitlistRepo.promoteNext(ctx, slotId);
      return ok(promotedId);
    } catch (err) {
      return fromError(err);
    }
  }

  // Expire all draft/reserved bookings past their org's configured timeout.
  // Called from the worker maintenance tick; returns the count of expired bookings.
  async expireStaleReservations(
    ctx: TenantContext,
    timeoutMinutes?: number,
  ): Promise<ServiceResult<{ expired: number }>> {
    try {
      requireOrgContext(ctx);

      const count = await this.waitlistRepo.expireStaleReservations(ctx, timeoutMinutes);
      return ok({ expired: count });
    } catch (err) {
      return fromError(err);
    }
  }
}
