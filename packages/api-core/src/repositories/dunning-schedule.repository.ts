import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { DunningSchedule, DunningScheduleInsert, DunningScheduleStage, DunningScheduleStageInsert } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

type ScheduleUpdate = Partial<DunningScheduleInsert>;
type StageUpdate    = Partial<DunningScheduleStageInsert>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class DunningScheduleRepository extends BaseRepository<DunningSchedule, DunningScheduleInsert, ScheduleUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'dunning_schedules');
  }

  override async findById(ctx: TenantContext, id: string): Promise<DunningSchedule | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('dunning_schedules')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as DunningSchedule | null;
  }

  async findDefault(ctx: TenantContext): Promise<DunningSchedule | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('dunning_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as DunningSchedule | null;
  }

  async listSchedules(ctx: TenantContext): Promise<DunningSchedule[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('dunning_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as DunningSchedule[];
  }

  // ─── Stage operations ──────────────────────────────────────────────────────

  async listStages(ctx: TenantContext, scheduleId: string): Promise<DunningScheduleStage[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('dunning_schedule_stages')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('stage_number', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as DunningScheduleStage[];
  }

  async insertStage(ctx: TenantContext, dto: DunningScheduleStageInsert): Promise<DunningScheduleStage> {
    void ctx;
    const { data, error } = await (this.db as AnyClient)
      .from('dunning_schedule_stages')
      .insert(dto)
      .select('*')
      .single();
    if (error) throw mapDbError(error as Error);
    return data as DunningScheduleStage;
  }

  async updateStage(ctx: TenantContext, stageId: string, dto: StageUpdate): Promise<DunningScheduleStage> {
    void ctx;
    const { data, error } = await (this.db as AnyClient)
      .from('dunning_schedule_stages')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', stageId)
      .select('*')
      .single();
    if (error) throw mapDbError(error as Error);
    return data as DunningScheduleStage;
  }

  async deleteStage(ctx: TenantContext, stageId: string): Promise<void> {
    void ctx;
    const { error } = await (this.db as AnyClient)
      .from('dunning_schedule_stages')
      .delete()
      .eq('id', stageId);
    if (error) throw mapDbError(error as Error);
  }
}
