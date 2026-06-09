import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { AccountBalance } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

type AccountBalanceInsert = Record<string, never>;
type AccountBalanceUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class AccountBalanceRepository extends BaseRepository<AccountBalance, AccountBalanceInsert, AccountBalanceUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'account_balances');
  }

  // Override: account_balances has no deleted_at column
  override async findById(ctx: TenantContext, id: string): Promise<AccountBalance | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('account_balances')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as AccountBalance | null;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<AccountBalance[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('account_balances')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .order('account_code', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as AccountBalance[];
  }

  async findByPeriodAndAccount(
    ctx:         TenantContext,
    periodId:    string,
    accountCode: string,
  ): Promise<AccountBalance | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('account_balances')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .eq('account_code', accountCode)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as AccountBalance | null;
  }

  async findNonZeroByPeriod(ctx: TenantContext, periodId: string): Promise<AccountBalance[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('account_balances')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .neq('closing_balance', 0)
      .order('account_code', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as AccountBalance[];
  }

  async getTrialBalance(ctx: TenantContext, periodId: string): Promise<{
    totalDebit:  number;
    totalCredit: number;
    isBalanced:  boolean;
    rows:        AccountBalance[];
  }> {
    const rows = await this.findByPeriod(ctx, periodId);

    let totalDebit  = 0;
    let totalCredit = 0;
    for (const row of rows) {
      totalDebit  += Number(row.debit_movement);
      totalCredit += Number(row.credit_movement);
    }

    return {
      totalDebit,
      totalCredit,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      rows,
    };
  }
}
