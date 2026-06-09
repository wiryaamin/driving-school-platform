import type {
  DunningSchedule,
  DunningScheduleInsert,
  DunningScheduleStage,
  DunningScheduleStageInsert,
  InvoiceDunningState,
  InvoiceReminderLog,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { DunningScheduleRepository } from '../repositories/dunning-schedule.repository.js';
import type { InvoiceDunningStateRepository } from '../repositories/invoice-dunning-state.repository.js';
import type { InvoiceReminderLogRepository } from '../repositories/invoice-reminder-log.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { NotFoundError } from '../errors/service-errors.js';

export class DunningService {
  constructor(
    private readonly scheduleRepo:  DunningScheduleRepository,
    private readonly stateRepo:     InvoiceDunningStateRepository,
    private readonly reminderRepo:  InvoiceReminderLogRepository
  ) {}

  // ─── Schedule management ──────────────────────────────────────────────────

  async createSchedule(ctx: TenantContext, dto: DunningScheduleInsert): Promise<DunningSchedule> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.scheduleRepo.insert(ctx, dto);
  }

  async getSchedule(ctx: TenantContext, scheduleId: string): Promise<DunningSchedule> {
    assertPermission(ctx, 'finance:dunning:manage');
    const s = await this.scheduleRepo.findById(ctx, scheduleId);
    if (s === null) throw new NotFoundError('DunningSchedule', scheduleId);
    return s;
  }

  async listSchedules(ctx: TenantContext): Promise<DunningSchedule[]> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.scheduleRepo.listSchedules(ctx);
  }

  async addStage(
    ctx:        TenantContext,
    scheduleId: string,
    dto:        Omit<DunningScheduleStageInsert, 'schedule_id'>
  ): Promise<DunningScheduleStage> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.scheduleRepo.insertStage(ctx, { ...dto, schedule_id: scheduleId });
  }

  async updateStage(
    ctx:     TenantContext,
    stageId: string,
    dto:     Partial<DunningScheduleStageInsert>
  ): Promise<DunningScheduleStage> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.scheduleRepo.updateStage(ctx, stageId, dto);
  }

  async deleteStage(ctx: TenantContext, stageId: string): Promise<void> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.scheduleRepo.deleteStage(ctx, stageId);
  }

  async listStages(ctx: TenantContext, scheduleId: string): Promise<DunningScheduleStage[]> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.scheduleRepo.listStages(ctx, scheduleId);
  }

  // ─── Dunning state ────────────────────────────────────────────────────────

  async getDunningState(ctx: TenantContext, invoiceId: string): Promise<InvoiceDunningState | null> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.stateRepo.findByInvoice(ctx, invoiceId);
  }

  async listActive(
    ctx:   TenantContext,
    query: { page?: number; per_page?: number }
  ): Promise<InvoiceDunningState[]> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.stateRepo.listActive(ctx, query);
  }

  async advanceStage(ctx: TenantContext, invoiceId: string): Promise<void> {
    assertPermission(ctx, 'finance:dunning:manage');
    if (ctx.actorId === null) throw new Error('Actor context required');
    return this.stateRepo.advanceViaRpc(ctx, invoiceId);
  }

  async resolveInvoice(ctx: TenantContext, invoiceId: string): Promise<void> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.stateRepo.markResolved(ctx, invoiceId);
  }

  // ─── Reminder log ─────────────────────────────────────────────────────────

  async getReminderHistory(ctx: TenantContext, invoiceId: string): Promise<InvoiceReminderLog[]> {
    assertPermission(ctx, 'finance:dunning:manage');
    return this.reminderRepo.listByInvoice(ctx, invoiceId);
  }
}
