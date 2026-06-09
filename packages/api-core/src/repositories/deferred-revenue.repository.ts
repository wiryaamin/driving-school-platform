import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  DeferredRevenueSchedule,
  RevenueRecognitionEvent,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { NotFoundError } from '../errors/service-errors.js';

type DeferredRevenueScheduleInsert = Record<string, never>;
type DeferredRevenueScheduleUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class DeferredRevenueRepository extends BaseRepository<
  DeferredRevenueSchedule,
  DeferredRevenueScheduleInsert,
  DeferredRevenueScheduleUpdate
> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'deferred_revenue_schedules');
  }

  // Override: deferred_revenue_schedules has no deleted_at
  override async findById(ctx: TenantContext, id: string): Promise<DeferredRevenueSchedule | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('deferred_revenue_schedules')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as DeferredRevenueSchedule | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<DeferredRevenueSchedule> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('DeferredRevenueSchedule', id);
    return row;
  }

  async findByInvoice(ctx: TenantContext, invoiceId: string): Promise<DeferredRevenueSchedule | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('deferred_revenue_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('invoice_id', invoiceId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as DeferredRevenueSchedule | null;
  }

  async findByPackage(ctx: TenantContext, packageId: string): Promise<DeferredRevenueSchedule | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('deferred_revenue_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('student_package_id', packageId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as DeferredRevenueSchedule | null;
  }

  async findPending(ctx: TenantContext): Promise<DeferredRevenueSchedule[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('deferred_revenue_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('is_fully_recognized', false)
      .order('created_at', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as DeferredRevenueSchedule[];
  }

  async getEventsBySchedule(ctx: TenantContext, scheduleId: string): Promise<RevenueRecognitionEvent[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('revenue_recognition_events')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('schedule_id', scheduleId)
      .order('recognition_date', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as RevenueRecognitionEvent[];
  }

  async getEventByBooking(ctx: TenantContext, bookingId: string): Promise<RevenueRecognitionEvent | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('revenue_recognition_events')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as RevenueRecognitionEvent | null;
  }

  // ── RPC wrappers ─────────────────────────────────────────────────────────────

  async postDeferredEntryViaRpc(ctx: TenantContext, invoiceId: string): Promise<string> {
    const { data, error } = await this.rpc('post_deferred_revenue_entry', {
      p_invoice_id: invoiceId,
      p_actor_id:   ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async recognizeLessonViaRpc(ctx: TenantContext, bookingId: string): Promise<string | null> {
    const { data, error } = await this.rpc('recognize_lesson_revenue', {
      p_booking_id: bookingId,
      p_actor_id:   ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as string | null;
  }

  async bulkRecognizeViaRpc(ctx: TenantContext, asOfDate?: string): Promise<number> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await this.rpc('bulk_recognize_revenue', {
      p_org_id:     ctx.organizationId,
      p_as_of_date: asOfDate ?? null,
      p_actor_id:   ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? 0) as number;
  }
}
