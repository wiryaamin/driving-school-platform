import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type {
  AccountingChartOfAccounts,
  AccountingExportRun,
  AccountingExportQueueItem,
  AccountingExportFormat,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

type RunInsert    = Record<string, never>;
type RunUpdate    = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class AccountingExportRepository extends BaseRepository<AccountingExportRun, RunInsert, RunUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'accounting_export_runs');
  }

  // ─── Chart of accounts ────────────────────────────────────────────────────

  async listChartEntries(ctx: TenantContext): Promise<AccountingChartOfAccounts[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('accounting_chart_of_accounts')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('event_type');
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as AccountingChartOfAccounts[];
  }

  async upsertChartEntry(
    ctx:          TenantContext,
    eventType:    string,
    accountDebit: string,
    accountCredit: string,
    description?: string
  ): Promise<AccountingChartOfAccounts> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('accounting_chart_of_accounts')
      .upsert({
        organization_id: ctx.organizationId,
        event_type:      eventType,
        account_debit:   accountDebit,
        account_credit:  accountCredit,
        description:     description ?? null,
        is_active:       true,
        created_by:      ctx.actorId,
      }, { onConflict: 'organization_id,event_type' })
      .select('*')
      .single();
    if (error) throw mapDbError(error as Error);
    return data as AccountingChartOfAccounts;
  }

  // ─── Export runs ──────────────────────────────────────────────────────────

  async createRun(
    ctx:      TenantContext,
    format:   AccountingExportFormat,
    fromDate: string,
    toDate:   string
  ): Promise<AccountingExportRun> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('accounting_export_runs')
      .insert({
        organization_id: ctx.organizationId,
        format,
        from_date:  fromDate,
        to_date:    toDate,
        status:     'pending',
        created_by: ctx.actorId,
      })
      .select('*')
      .single();
    if (error) throw mapDbError(error as Error);
    return data as AccountingExportRun;
  }

  async findRunById(ctx: TenantContext, runId: string): Promise<AccountingExportRun | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('accounting_export_runs')
      .select('*')
      .eq('id', runId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as AccountingExportRun | null;
  }

  async updateRunStatus(
    ctx:        TenantContext,
    runId:      string,
    status:     'running' | 'completed' | 'failed',
    itemCount?: number,
    fileRef?:   string,
    errMsg?:    string
  ): Promise<void> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const update: Record<string, unknown> = { status };
    if (status === 'completed' || status === 'failed') update['completed_at'] = new Date().toISOString();
    if (itemCount !== undefined) update['item_count']     = itemCount;
    if (fileRef   !== undefined) update['file_reference'] = fileRef;
    if (errMsg    !== undefined) update['error_message']  = errMsg;

    const { error } = await (this.db as AnyClient)
      .from('accounting_export_runs')
      .update(update)
      .eq('id', runId)
      .eq('organization_id', ctx.organizationId);
    if (error) throw mapDbError(error as Error);
  }

  async listRuns(
    ctx:   TenantContext,
    query: { page?: number; per_page?: number }
  ): Promise<PagedResult<AccountingExportRun>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    const { data, error, count } = await (this.db as AnyClient)
      .from('accounting_export_runs')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order('started_at', { ascending: false })
      .range(from, to);
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<AccountingExportRun>(
      (data ?? []) as AccountingExportRun[], normalized, count ?? 0
    );
  }

  // ─── Export queue ─────────────────────────────────────────────────────────

  async getPendingQueueItems(
    ctx:      TenantContext,
    fromDate: string,
    toDate:   string
  ): Promise<AccountingExportQueueItem[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('accounting_export_queue')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .is('exported_at', null)
      .gte('transaction_date', fromDate)
      .lte('transaction_date', toDate)
      .order('transaction_date', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as AccountingExportQueueItem[];
  }

  async markExported(
    ctx:    TenantContext,
    ids:    string[],
    runId:  string
  ): Promise<void> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    if (ids.length === 0) return;
    const { error } = await (this.db as AnyClient)
      .from('accounting_export_queue')
      .update({
        exported_at:   new Date().toISOString(),
        export_run_id: runId,
      })
      .in('id', ids)
      .eq('organization_id', ctx.organizationId);
    if (error) throw mapDbError(error as Error);
  }

  async enqueueItem(
    orgId:           string,
    eventType:       string,
    eventData:       Record<string, unknown>,
    amount:          number | null,
    currency:        string,
    transactionDate: string,
    accountDebit?:   string,
    accountCredit?:  string
  ): Promise<void> {
    const { error } = await (this.db as AnyClient)
      .from('accounting_export_queue')
      .insert({
        organization_id:  orgId,
        event_type:       eventType,
        event_data:       eventData,
        amount,
        currency,
        transaction_date: transactionDate,
        account_debit:    accountDebit ?? null,
        account_credit:   accountCredit ?? null,
      });
    if (error) throw mapDbError(error as Error);
  }
}
