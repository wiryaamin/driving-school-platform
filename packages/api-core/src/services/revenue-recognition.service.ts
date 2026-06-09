import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  DeferredRevenueSchedule,
  RevenueRecognitionEvent,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { DeferredRevenueRepository } from '../repositories/deferred-revenue.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

export class RevenueRecognitionService {
  private readonly deferredRepo: DeferredRevenueRepository;

  constructor(db: SupabaseClient<Database>) {
    this.deferredRepo = new DeferredRevenueRepository(db);
  }

  async postDeferredEntry(ctx: TenantContext, invoiceId: string): Promise<string> {
    assertPermission(ctx, 'finance:revenue:manage');
    return this.deferredRepo.postDeferredEntryViaRpc(ctx, invoiceId);
  }

  async recognizeLesson(ctx: TenantContext, bookingId: string): Promise<string | null> {
    assertPermission(ctx, 'finance:revenue:manage');
    return this.deferredRepo.recognizeLessonViaRpc(ctx, bookingId);
  }

  async bulkRecognize(ctx: TenantContext, asOfDate?: string): Promise<{ count: number }> {
    assertPermission(ctx, 'finance:revenue:manage');
    const count = await this.deferredRepo.bulkRecognizeViaRpc(ctx, asOfDate);
    return { count };
  }

  async getScheduleByInvoice(ctx: TenantContext, invoiceId: string): Promise<DeferredRevenueSchedule | null> {
    assertPermission(ctx, 'finance:revenue:manage');
    return this.deferredRepo.findByInvoice(ctx, invoiceId);
  }

  async getScheduleByPackage(ctx: TenantContext, packageId: string): Promise<DeferredRevenueSchedule | null> {
    assertPermission(ctx, 'finance:revenue:manage');
    return this.deferredRepo.findByPackage(ctx, packageId);
  }

  async getPendingSchedules(ctx: TenantContext): Promise<DeferredRevenueSchedule[]> {
    assertPermission(ctx, 'finance:revenue:manage');
    return this.deferredRepo.findPending(ctx);
  }

  async getRecognitionEvents(ctx: TenantContext, scheduleId: string): Promise<RevenueRecognitionEvent[]> {
    assertPermission(ctx, 'finance:revenue:manage');
    return this.deferredRepo.getEventsBySchedule(ctx, scheduleId);
  }

  async getEventByBooking(ctx: TenantContext, bookingId: string): Promise<RevenueRecognitionEvent | null> {
    assertPermission(ctx, 'finance:revenue:manage');
    return this.deferredRepo.getEventByBooking(ctx, bookingId);
  }
}
