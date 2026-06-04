import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { FinancialPeriod, FinancialPeriodInsert, FinancialPeriodUpdate, FinancialPeriodStatus } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class FinancialPeriodRepository extends BaseRepository<FinancialPeriod, FinancialPeriodInsert, FinancialPeriodUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'financial_periods');
  }

  async listPeriods(ctx: TenantContext, status?: FinancialPeriodStatus): Promise<FinancialPeriod[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('financial_periods')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('period_start', { ascending: false });

    if (status !== undefined) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FinancialPeriod[];
  }

  async closePeriod(ctx: TenantContext, periodId: string): Promise<FinancialPeriod> {
    return this.update(ctx, periodId, {
      status:    'closed',
      closed_at: new Date().toISOString(),
      closed_by: ctx.actorId ?? undefined,
    } as FinancialPeriodUpdate);
  }

  async lockPeriod(ctx: TenantContext, periodId: string): Promise<FinancialPeriod> {
    return this.update(ctx, periodId, {
      status:    'locked',
      locked_at: new Date().toISOString(),
      locked_by: ctx.actorId ?? undefined,
    } as FinancialPeriodUpdate);
  }
}
