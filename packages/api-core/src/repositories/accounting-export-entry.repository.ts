import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { AccountingExportEntry, AccountingExportEntryInsert } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class AccountingExportEntryRepository extends BaseRepository<
  AccountingExportEntry,
  AccountingExportEntryInsert,
  never
> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'accounting_export_entries');
  }

  // Entries are created only by the create_accounting_export() SQL function.
  // Direct INSERT from TypeScript is not permitted (use the RPC instead).
  override async insert(_ctx: TenantContext, _data: AccountingExportEntryInsert): Promise<AccountingExportEntry> {
    throw new InternalError('accounting_export_entries are created exclusively via create_accounting_export() RPC');
  }

  async listByExportRun(
    ctx:       TenantContext,
    exportRunId: string
  ): Promise<AccountingExportEntry[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('accounting_export_entries')
      .select('*')
      .eq('export_run_id', exportRunId)
      .eq('organization_id', ctx.organizationId)
      .order('sequence_number', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as AccountingExportEntry[];
  }

  async countByExportRun(ctx: TenantContext, exportRunId: string): Promise<number> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { count, error } = await (this.db as AnyClient)
      .from('accounting_export_entries')
      .select('id', { count: 'exact', head: true })
      .eq('export_run_id', exportRunId)
      .eq('organization_id', ctx.organizationId);
    if (error) throw mapDbError(error as Error);
    return count ?? 0;
  }

  async findByAccount(
    ctx:     TenantContext,
    account: string,
    side:    'debit' | 'credit'
  ): Promise<AccountingExportEntry[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const column = side === 'debit' ? 'account_debit' : 'account_credit';
    const { data, error } = await (this.db as AnyClient)
      .from('accounting_export_entries')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq(column, account)
      .order('transaction_date', { ascending: true })
      .order('sequence_number', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as AccountingExportEntry[];
  }
}
