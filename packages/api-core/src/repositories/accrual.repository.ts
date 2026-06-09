import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';

type AnyClient = any;

type AccrualScheduleRow    = Database['public']['Tables']['accrual_schedules']['Row'];
type AccrualScheduleInsert = Database['public']['Tables']['accrual_schedules']['Insert'];
type AccrualScheduleUpdate = Database['public']['Tables']['accrual_schedules']['Update'];

type AccrualReleaseLineRow    = Database['public']['Tables']['accrual_release_lines']['Row'];
type AccrualReleaseLineInsert = Database['public']['Tables']['accrual_release_lines']['Insert'];
type AccrualReleaseLineUpdate = Database['public']['Tables']['accrual_release_lines']['Update'];

type PeriodicDeferredScheduleRow    = Database['public']['Tables']['periodic_deferred_schedules']['Row'];
type PeriodicDeferredScheduleInsert = Database['public']['Tables']['periodic_deferred_schedules']['Insert'];
type PeriodicDeferredScheduleUpdate = Database['public']['Tables']['periodic_deferred_schedules']['Update'];

export class AccrualScheduleRepository extends BaseRepository<AccrualScheduleRow, AccrualScheduleInsert, AccrualScheduleUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'accrual_schedules');
  }

  override async findById(ctx: TenantContext, id: string): Promise<AccrualScheduleRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('accrual_schedules')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findAll(ctx: TenantContext, limit = 50, offset = 0): Promise<AccrualScheduleRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('accrual_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('start_date', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  }

  async findByStatus(ctx: TenantContext, status: string): Promise<AccrualScheduleRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('accrual_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('status', status)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findByType(ctx: TenantContext, accrualType: string): Promise<AccrualScheduleRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('accrual_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('accrual_type', accrualType)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async create(
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
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('create_accrual_schedule' as never, {
        p_org_id:                  ctx.organizationId,
        p_period_id:               params.periodId ?? null,
        p_accrual_type:            params.accrualType,
        p_description:             params.description,
        p_total_amount:            params.totalAmount,
        p_start_date:              params.startDate,
        p_release_months:          params.releaseMonths,
        p_release_debit_account:   params.releaseDebitAccount,
        p_release_credit_account:  params.releaseCreditAccount,
        p_initial_debit_account:   params.initialDebitAccount ?? null,
        p_initial_credit_account:  params.initialCreditAccount ?? null,
        p_notes:                   params.notes ?? null,
        p_actor_id:                ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async postRelease(ctx: TenantContext, scheduleId: string, periodId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_accrual_release' as never, {
        p_schedule_id: scheduleId,
        p_period_id:   periodId,
        p_actor_id:    ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async cancel(ctx: TenantContext, scheduleId: string, reason: string): Promise<void> {
    const { error } = await (this.db as AnyClient)
      .rpc('cancel_accrual_schedule' as never, {
        p_schedule_id: scheduleId,
        p_reason:      reason,
        p_actor_id:    ctx.actorId,
      });
    if (error) throw error;
  }
}

export class AccrualReleaseLineRepository extends BaseRepository<AccrualReleaseLineRow, AccrualReleaseLineInsert, AccrualReleaseLineUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'accrual_release_lines');
  }

  override async findById(ctx: TenantContext, id: string): Promise<AccrualReleaseLineRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('accrual_release_lines')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findBySchedule(ctx: TenantContext, scheduleId: string): Promise<AccrualReleaseLineRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('accrual_release_lines')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('accrual_schedule_id', scheduleId)
      .order('period_number');
    if (error) throw error;
    return data ?? [];
  }
}

export class PeriodicDeferredScheduleRepository extends BaseRepository<PeriodicDeferredScheduleRow, PeriodicDeferredScheduleInsert, PeriodicDeferredScheduleUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'periodic_deferred_schedules');
  }

  override async findById(ctx: TenantContext, id: string): Promise<PeriodicDeferredScheduleRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('periodic_deferred_schedules')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findAll(ctx: TenantContext, limit = 50, offset = 0): Promise<PeriodicDeferredScheduleRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('periodic_deferred_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('start_date', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  }

  async findActive(ctx: TenantContext): Promise<PeriodicDeferredScheduleRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('periodic_deferred_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('is_fully_released', false)
      .order('start_date');
    if (error) throw error;
    return data ?? [];
  }

  async findBySource(ctx: TenantContext, sourceType: string, sourceId: string): Promise<PeriodicDeferredScheduleRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('periodic_deferred_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(
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
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('create_periodic_deferred_schedule' as never, {
        p_org_id:               ctx.organizationId,
        p_period_id:            params.periodId ?? null,
        p_source_type:          params.sourceType,
        p_source_id:            params.sourceId,
        p_description:          params.description,
        p_total_amount:         params.totalAmount,
        p_start_date:           params.startDate,
        p_release_months:       params.releaseMonths,
        p_deferral_account:     params.deferralAccount ?? '2970',
        p_recognition_account:  params.recognitionAccount ?? '3041',
        p_notes:                params.notes ?? null,
        p_actor_id:             ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async postRelease(ctx: TenantContext, scheduleId: string, periodId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_periodic_deferred_release' as never, {
        p_schedule_id: scheduleId,
        p_period_id:   periodId,
        p_actor_id:    ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async validateIntegrity(ctx: TenantContext, periodId: string): Promise<unknown> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('validate_deferred_release_integrity' as never, {
        p_org_id:    ctx.organizationId,
        p_period_id: periodId,
      });
    if (error) throw error;
    return data;
  }
}
