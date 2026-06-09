import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import {
  AccrualScheduleRepository,
  AccrualReleaseLineRepository,
  PeriodicDeferredScheduleRepository,
} from '../repositories/accrual.repository.js';
import { NotFoundError, ValidationError } from '../errors/service-errors.js';

export class AccrualService {
  private scheduleRepo:  AccrualScheduleRepository;
  private lineRepo:      AccrualReleaseLineRepository;
  private deferredRepo:  PeriodicDeferredScheduleRepository;

  constructor(db: SupabaseClient<Database>) {
    this.scheduleRepo = new AccrualScheduleRepository(db);
    this.lineRepo     = new AccrualReleaseLineRepository(db);
    this.deferredRepo = new PeriodicDeferredScheduleRepository(db);
  }

  // ── Accrual Schedules ──────────────────────────────────────────────────────

  async createAccrualSchedule(
    ctx: TenantContext,
    params: {
      periodId?:            string | null;
      accrualType:          string;
      description:          string;
      totalAmount:          number;
      startDate:            string;
      releaseMonths:        number;
      releaseDebitAccount:  string;
      releaseCreditAccount: string;
      initialDebitAccount?: string | null;
      initialCreditAccount?: string | null;
      notes?:               string | null;
    }
  ) {
    if (params.totalAmount <= 0) {
      throw new ValidationError('totalAmount must be positive');
    }
    if (params.releaseMonths < 1) {
      throw new ValidationError('releaseMonths must be at least 1');
    }
    const scheduleId = await this.scheduleRepo.create(ctx, params);
    const schedule = await this.scheduleRepo.findById(ctx, scheduleId);
    if (!schedule) throw new NotFoundError('AccrualSchedule', scheduleId);
    return schedule;
  }

  async getAccrualSchedule(ctx: TenantContext, id: string) {
    const schedule = await this.scheduleRepo.findById(ctx, id);
    if (!schedule) throw new NotFoundError('AccrualSchedule', id);
    const lines = await this.lineRepo.findBySchedule(ctx, id);
    return { schedule, lines };
  }

  async listAccrualSchedules(
    ctx: TenantContext,
    params: { status?: string; accrualType?: string; limit?: number; offset?: number }
  ) {
    if (params.status)      return this.scheduleRepo.findByStatus(ctx, params.status);
    if (params.accrualType) return this.scheduleRepo.findByType(ctx, params.accrualType);
    return this.scheduleRepo.findAll(ctx, params.limit, params.offset);
  }

  async postAccrualRelease(ctx: TenantContext, scheduleId: string, periodId: string) {
    const schedule = await this.scheduleRepo.findById(ctx, scheduleId);
    if (!schedule) throw new NotFoundError('AccrualSchedule', scheduleId);
    if (schedule.status !== 'active') {
      throw new ValidationError(
        `Accrual schedule ${scheduleId} has status '${schedule.status}' — only active schedules can be released`
      );
    }
    const journalEntryId = await this.scheduleRepo.postRelease(ctx, scheduleId, periodId);
    const updated = await this.scheduleRepo.findById(ctx, scheduleId);
    return { journalEntryId, schedule: updated };
  }

  async cancelAccrualSchedule(ctx: TenantContext, scheduleId: string, reason: string) {
    const schedule = await this.scheduleRepo.findById(ctx, scheduleId);
    if (!schedule) throw new NotFoundError('AccrualSchedule', scheduleId);
    if (schedule.status !== 'active') {
      throw new ValidationError(
        `Accrual schedule ${scheduleId} has status '${schedule.status}' — only active schedules can be cancelled`
      );
    }
    await this.scheduleRepo.cancel(ctx, scheduleId, reason);
  }

  // ── Periodic Deferred Revenue ──────────────────────────────────────────────

  async createDeferredSchedule(
    ctx: TenantContext,
    params: {
      periodId?:           string | null;
      sourceType:          string;
      sourceId:            string;
      description:         string;
      totalAmount:         number;
      startDate:           string;
      releaseMonths:       number;
      deferralAccount?:    string;
      recognitionAccount?: string;
      notes?:              string | null;
    }
  ) {
    if (params.totalAmount <= 0) {
      throw new ValidationError('totalAmount must be positive');
    }
    const scheduleId = await this.deferredRepo.create(ctx, params);
    const schedule = await this.deferredRepo.findById(ctx, scheduleId);
    if (!schedule) throw new NotFoundError('PeriodicDeferredSchedule', scheduleId);
    return schedule;
  }

  async getDeferredSchedule(ctx: TenantContext, id: string) {
    const schedule = await this.deferredRepo.findById(ctx, id);
    if (!schedule) throw new NotFoundError('PeriodicDeferredSchedule', id);
    return schedule;
  }

  async listDeferredSchedules(
    ctx: TenantContext,
    params: { activeOnly?: boolean; limit?: number; offset?: number }
  ) {
    if (params.activeOnly) return this.deferredRepo.findActive(ctx);
    return this.deferredRepo.findAll(ctx, params.limit, params.offset);
  }

  async postDeferredRelease(ctx: TenantContext, scheduleId: string, periodId: string) {
    const schedule = await this.deferredRepo.findById(ctx, scheduleId);
    if (!schedule) throw new NotFoundError('PeriodicDeferredSchedule', scheduleId);
    if (schedule.is_fully_released) {
      throw new ValidationError(`Deferred schedule ${scheduleId} is already fully released`);
    }
    const journalEntryId = await this.deferredRepo.postRelease(ctx, scheduleId, periodId);
    const updated = await this.deferredRepo.findById(ctx, scheduleId);
    return { journalEntryId, schedule: updated };
  }

  async validateDeferredIntegrity(ctx: TenantContext, periodId: string) {
    return this.deferredRepo.validateIntegrity(ctx, periodId);
  }
}
