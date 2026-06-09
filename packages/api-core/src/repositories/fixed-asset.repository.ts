import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';

type AnyClient = any;

type FixedAssetClassRow    = Database['public']['Tables']['fixed_asset_classes']['Row'];
type FixedAssetClassInsert = Database['public']['Tables']['fixed_asset_classes']['Insert'];
type FixedAssetClassUpdate = Database['public']['Tables']['fixed_asset_classes']['Update'];

type FixedAssetRow    = Database['public']['Tables']['fixed_assets']['Row'];
type FixedAssetInsert = Database['public']['Tables']['fixed_assets']['Insert'];
type FixedAssetUpdate = Database['public']['Tables']['fixed_assets']['Update'];

type AssetDisposalRow    = Database['public']['Tables']['asset_disposals']['Row'];
type AssetDisposalInsert = Database['public']['Tables']['asset_disposals']['Insert'];

export class FixedAssetClassRepository extends BaseRepository<FixedAssetClassRow, FixedAssetClassInsert, FixedAssetClassUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'fixed_asset_classes');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<FixedAssetClassRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('fixed_asset_classes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findActive(_ctx: TenantContext): Promise<FixedAssetClassRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('fixed_asset_classes')
      .select('*')
      .eq('is_active', true)
      .order('class_code');
    if (error) throw error;
    return data ?? [];
  }

  async findByCode(_ctx: TenantContext, classCode: string): Promise<FixedAssetClassRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('fixed_asset_classes')
      .select('*')
      .eq('class_code', classCode)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}

export class FixedAssetRepository extends BaseRepository<FixedAssetRow, FixedAssetInsert, FixedAssetUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'fixed_assets');
  }

  override async findById(ctx: TenantContext, id: string): Promise<FixedAssetRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('fixed_assets')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findAll(ctx: TenantContext, limit = 50, offset = 0): Promise<FixedAssetRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('fixed_assets')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('asset_code')
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  }

  async findByStatus(ctx: TenantContext, status: string): Promise<FixedAssetRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('fixed_assets')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('status', status)
      .order('asset_code');
    if (error) throw error;
    return data ?? [];
  }

  async findByClass(ctx: TenantContext, assetClassId: string): Promise<FixedAssetRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('fixed_assets')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('asset_class_id', assetClassId)
      .order('asset_code');
    if (error) throw error;
    return data ?? [];
  }

  async register(
    ctx: TenantContext,
    params: {
      periodId:          string;
      assetClassId:      string;
      assetCode:         string;
      assetName:         string;
      acquisitionDate:   string;
      acquisitionCost:   number;
      residualValue?:    number;
      usefulLifeMonths?: number;
      depreciationMethod?: string;
      creditAccount?:    string;
      description?:      string | null;
      notes?:            string | null;
    }
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('register_fixed_asset' as never, {
        p_org_id:              ctx.organizationId,
        p_period_id:           params.periodId,
        p_asset_class_id:      params.assetClassId,
        p_asset_code:          params.assetCode,
        p_asset_name:          params.assetName,
        p_acquisition_date:    params.acquisitionDate,
        p_acquisition_cost:    params.acquisitionCost,
        p_residual_value:      params.residualValue ?? 0,
        p_useful_life_months:  params.usefulLifeMonths ?? 60,
        p_depreciation_method: params.depreciationMethod ?? 'straight_line',
        p_credit_account:      params.creditAccount ?? '2440',
        p_description:         params.description ?? null,
        p_notes:               params.notes ?? null,
        p_actor_id:            ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }
}

export class AssetDisposalRepository extends BaseRepository<AssetDisposalRow, AssetDisposalInsert, never> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'asset_disposals');
  }

  override async findById(ctx: TenantContext, id: string): Promise<AssetDisposalRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('asset_disposals')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByAsset(ctx: TenantContext, assetId: string): Promise<AssetDisposalRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('asset_disposals')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('asset_id', assetId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByOrg(ctx: TenantContext, limit = 50, offset = 0): Promise<AssetDisposalRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('asset_disposals')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('disposal_date', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  }

  async postDisposal(
    ctx: TenantContext,
    params: {
      assetId:      string;
      periodId:     string;
      disposalType: string;
      disposalDate: string;
      proceeds?:    number;
      notes?:       string | null;
    }
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_asset_disposal' as never, {
        p_asset_id:      params.assetId,
        p_period_id:     params.periodId,
        p_disposal_type: params.disposalType,
        p_disposal_date: params.disposalDate,
        p_proceeds:      params.proceeds ?? 0,
        p_notes:         params.notes ?? null,
        p_actor_id:      ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }
}
