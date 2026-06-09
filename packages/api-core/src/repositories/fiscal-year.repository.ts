import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { FiscalYear } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

type FiscalYearInsert = Database['public']['Tables']['fiscal_years']['Insert'];
type FiscalYearUpdate = Database['public']['Tables']['fiscal_years']['Update'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class FiscalYearRepository extends BaseRepository<FiscalYear, FiscalYearInsert, FiscalYearUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'fiscal_years');
  }

  // Override: fiscal_years has no deleted_at column
  override async findById(ctx: TenantContext, id: string): Promise<FiscalYear | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fiscal_years')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as FiscalYear | null;
  }

  async findByOrg(ctx: TenantContext): Promise<FiscalYear[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fiscal_years')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('year_number', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FiscalYear[];
  }

  async findByYear(ctx: TenantContext, yearNumber: number): Promise<FiscalYear | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fiscal_years')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('year_number', yearNumber)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as FiscalYear | null;
  }

  async createViaRpc(
    ctx:        TenantContext,
    yearNumber: number,
    yearStart:  string,
    yearEnd:    string,
    notes?:     string | null,
  ): Promise<string> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('create_fiscal_year', {
      p_org_id:       ctx.organizationId,
      p_year_number:  yearNumber,
      p_year_start:   yearStart,
      p_year_end:     yearEnd,
      p_notes:        notes ?? null,
      p_actor_id:     ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async assignPeriodViaRpc(
    ctx:          TenantContext,
    periodId:     string,
    fiscalYearId: string,
    isYearEnd:    boolean = false,
  ): Promise<void> {
    const { error } = await (this.db as AnyClient).rpc('assign_period_to_fiscal_year', {
      p_period_id:      periodId,
      p_fiscal_year_id: fiscalYearId,
      p_is_year_end:    isYearEnd,
      p_actor_id:       ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
  }

  async validateForCloseViaRpc(ctx: TenantContext, fiscalYearId: string): Promise<unknown> {
    const { data, error } = await (this.db as AnyClient).rpc('validate_fiscal_year_for_close', {
      p_fiscal_year_id: fiscalYearId,
      p_actor_id:       ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data;
  }

  async postRetainedEarningsViaRpc(ctx: TenantContext, fiscalYearId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient).rpc('post_retained_earnings_entry', {
      p_fiscal_year_id: fiscalYearId,
      p_actor_id:       ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async closeFiscalYearViaRpc(ctx: TenantContext, fiscalYearId: string): Promise<void> {
    const { error } = await (this.db as AnyClient).rpc('close_fiscal_year', {
      p_fiscal_year_id: fiscalYearId,
      p_actor_id:       ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
  }

  async rolloverOpeningBalancesViaRpc(
    ctx:            TenantContext,
    fiscalYearId:   string,
    targetPeriodId: string,
  ): Promise<number> {
    const { data, error } = await (this.db as AnyClient).rpc('rollover_opening_balances', {
      p_fiscal_year_id:   fiscalYearId,
      p_target_period_id: targetPeriodId,
      p_actor_id:         ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as number;
  }
}
