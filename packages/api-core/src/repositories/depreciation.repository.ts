import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';

type AnyClient = any;

type DepreciationScheduleRow    = Database['public']['Tables']['depreciation_schedules']['Row'];
type DepreciationScheduleInsert = Database['public']['Tables']['depreciation_schedules']['Insert'];
type DepreciationScheduleUpdate = Database['public']['Tables']['depreciation_schedules']['Update'];

export class DepreciationScheduleRepository extends BaseRepository<DepreciationScheduleRow, DepreciationScheduleInsert, DepreciationScheduleUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'depreciation_schedules');
  }

  override async findById(ctx: TenantContext, id: string): Promise<DepreciationScheduleRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('depreciation_schedules')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByAsset(ctx: TenantContext, assetId: string): Promise<DepreciationScheduleRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('depreciation_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('asset_id', assetId)
      .order('period_number');
    if (error) throw error;
    return data ?? [];
  }

  async findUnposted(ctx: TenantContext, assetId: string): Promise<DepreciationScheduleRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('depreciation_schedules')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('asset_id', assetId)
      .eq('is_posted', false)
      .order('period_number');
    if (error) throw error;
    return data ?? [];
  }

  async generateSchedule(ctx: TenantContext, assetId: string): Promise<number> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('generate_depreciation_schedule' as never, {
        p_asset_id: assetId,
        p_actor_id: ctx.actorId,
      });
    if (error) throw error;
    return data as number;
  }

  async postPeriod(ctx: TenantContext, assetId: string, periodId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_depreciation_period' as never, {
        p_asset_id:  assetId,
        p_period_id: periodId,
        p_actor_id:  ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async postImpairment(
    ctx: TenantContext,
    params: {
      assetId:          string;
      periodId:         string;
      impairmentDate:   string;
      impairmentAmount: number;
      reason?:          string | null;
    }
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_impairment_adjustment' as never, {
        p_asset_id:          params.assetId,
        p_period_id:         params.periodId,
        p_impairment_date:   params.impairmentDate,
        p_impairment_amount: params.impairmentAmount,
        p_reason:            params.reason ?? null,
        p_actor_id:          ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }
}
