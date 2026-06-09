import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { VatPeriod, VatPeriodInsert, VatReportEntry } from '@platform/types';
import type { VatPeriodFrequencyEnum } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

type VatPeriodUpdate = Partial<VatPeriodInsert>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class VatPeriodRepository extends BaseRepository<VatPeriod, VatPeriodInsert, VatPeriodUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'vat_periods');
  }

  override async findById(ctx: TenantContext, id: string): Promise<VatPeriod | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('vat_periods')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as VatPeriod | null;
  }

  async listPeriods(ctx: TenantContext, status?: string): Promise<VatPeriod[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    let q = (this.db as AnyClient)
      .from('vat_periods')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('period_start', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as VatPeriod[];
  }

  async createViaRpc(
    ctx: TenantContext,
    periodStart:  string,
    periodEnd:    string,
    frequency:    VatPeriodFrequencyEnum = 'monthly',
  ): Promise<string> {
    const { data, error } = await this.rpc('create_vat_period', {
      p_org_id:       ctx.organizationId,
      p_period_start: periodStart,
      p_period_end:   periodEnd,
      p_frequency:    frequency,
      p_actor_id:     ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async populateViaRpc(ctx: TenantContext, periodId: string): Promise<number> {
    void ctx;
    const { data, error } = await this.rpc('populate_vat_period', {
      p_period_id: periodId,
      p_actor_id:  ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? 0) as number;
  }

  async lockViaRpc(ctx: TenantContext, periodId: string, filingReference?: string): Promise<void> {
    const { error } = await this.rpc('lock_vat_period', {
      p_period_id:       periodId,
      p_actor_id:        ctx.actorId,
      p_filing_reference: filingReference ?? null,
    });
    if (error) throw mapDbError(error as Error);
  }

  async listEntries(ctx: TenantContext, periodId: string): Promise<VatReportEntry[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('vat_report_entries')
      .select('*')
      .eq('vat_period_id', periodId)
      .eq('organization_id', ctx.organizationId)
      .order('transaction_date', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as VatReportEntry[];
  }
}
