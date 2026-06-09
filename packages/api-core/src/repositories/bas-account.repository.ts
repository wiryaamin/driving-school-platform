import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { BasAccountCatalog } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

type BasAccountInsert = Omit<BasAccountCatalog, 'id' | 'created_at'>;
type BasAccountUpdate = Partial<BasAccountInsert>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class BasAccountRepository extends BaseRepository<BasAccountCatalog, BasAccountInsert, BasAccountUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'bas_account_catalog');
  }

  // bas_account_catalog is platform-global — override findById to skip org scope
  override async findById(_ctx: TenantContext, id: string): Promise<BasAccountCatalog | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('bas_account_catalog')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as BasAccountCatalog | null;
  }

  async findByCode(_ctx: TenantContext, code: string): Promise<BasAccountCatalog | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('bas_account_catalog')
      .select('*')
      .eq('account_code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as BasAccountCatalog | null;
  }

  async listAll(_ctx: TenantContext): Promise<BasAccountCatalog[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('bas_account_catalog')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('account_code', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as BasAccountCatalog[];
  }

  async listByType(_ctx: TenantContext, accountType: string): Promise<BasAccountCatalog[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('bas_account_catalog')
      .select('*')
      .eq('account_type', accountType)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as BasAccountCatalog[];
  }

  async seedOrgChartViaRpc(ctx: TenantContext): Promise<number> {
    const { data, error } = await this.rpc('seed_org_chart_of_accounts', {
      p_org_id:   ctx.organizationId,
      p_actor_id: ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? 0) as number;
  }
}
