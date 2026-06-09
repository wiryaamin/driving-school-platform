import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { ReconciliationRun, ReconciliationItem, ReconciliationTypeEnum } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

type ReconciliationRunInsert = Database['public']['Tables']['reconciliation_runs']['Insert'];
type ReconciliationRunUpdate = Database['public']['Tables']['reconciliation_runs']['Update'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class ReconciliationRunRepository extends BaseRepository<ReconciliationRun, ReconciliationRunInsert, ReconciliationRunUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'reconciliation_runs');
  }

  // Override: reconciliation_runs has no deleted_at column
  override async findById(ctx: TenantContext, id: string): Promise<ReconciliationRun | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('reconciliation_runs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ReconciliationRun | null;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<ReconciliationRun[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('reconciliation_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .order('started_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ReconciliationRun[];
  }

  async findLatestByType(
    ctx:      TenantContext,
    periodId: string,
    type:     ReconciliationTypeEnum,
  ): Promise<ReconciliationRun | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('reconciliation_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .eq('reconciliation_type', type)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ReconciliationRun | null;
  }

  async confirmBankReconciliationViaRpc(
    ctx:      TenantContext,
    importId: string,
    periodId: string,
    notes?:   string | null,
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient).rpc('confirm_bank_reconciliation', {
      p_import_id: importId,
      p_period_id: periodId,
      p_notes:     notes ?? null,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async reconcileArViaRpc(ctx: TenantContext, periodId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient).rpc('reconcile_accounts_receivable', {
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async reconcileVatViaRpc(ctx: TenantContext, periodId: string, vatPeriodId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient).rpc('reconcile_vat_period', {
      p_period_id:     periodId,
      p_vat_period_id: vatPeriodId,
      p_actor_id:      ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async reconcileDeferredViaRpc(ctx: TenantContext, periodId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient).rpc('reconcile_deferred_revenue', {
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }
}

type ReconciliationItemInsert = Database['public']['Tables']['reconciliation_items']['Insert'];
type ReconciliationItemUpdate = Database['public']['Tables']['reconciliation_items']['Update'];

export class ReconciliationItemRepository extends BaseRepository<ReconciliationItem, ReconciliationItemInsert, ReconciliationItemUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'reconciliation_items');
  }

  // Override: reconciliation_items has no deleted_at column
  override async findById(ctx: TenantContext, id: string): Promise<ReconciliationItem | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('reconciliation_items')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ReconciliationItem | null;
  }

  async findByRun(ctx: TenantContext, runId: string): Promise<ReconciliationItem[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('reconciliation_items')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('run_id', runId)
      .order('matched_at', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ReconciliationItem[];
  }
}
