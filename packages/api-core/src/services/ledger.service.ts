import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  JournalEntry,
  JournalLine,
  AccountBalance,
  LedgerSie4Export,
  JournalEntryTypeEnum,
  JournalEntryStatusEnum,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { JournalEntryRepository } from '../repositories/journal-entry.repository.js';
import { AccountBalanceRepository } from '../repositories/account-balance.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class LedgerService {
  private readonly journalRepo: JournalEntryRepository;
  private readonly balanceRepo: AccountBalanceRepository;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.journalRepo = new JournalEntryRepository(db);
    this.balanceRepo = new AccountBalanceRepository(db);
  }

  async getJournalEntry(
    ctx: TenantContext,
    id:  string,
  ): Promise<(JournalEntry & { lines: JournalLine[] }) | null> {
    assertPermission(ctx, 'finance:ledger:read');
    const entry = await this.journalRepo.findById(ctx, id);
    if (!entry) return null;
    const lines = await this.journalRepo.getLinesForEntry(ctx, id);
    return { ...entry, lines };
  }

  async listJournalEntries(
    ctx:     TenantContext,
    periodId:   string,
    entryType?: JournalEntryTypeEnum,
    status?:    JournalEntryStatusEnum,
  ): Promise<JournalEntry[]> {
    assertPermission(ctx, 'finance:ledger:read');
    return this.journalRepo.findByPeriod(ctx, periodId, entryType, status);
  }

  async getJournalEntriesForEntity(
    ctx:        TenantContext,
    entityType: string,
    entityId:   string,
  ): Promise<JournalEntry[]> {
    assertPermission(ctx, 'finance:ledger:read');
    return this.journalRepo.findBySourceEntity(ctx, entityType, entityId);
  }

  async getAccountBalancesByPeriod(ctx: TenantContext, periodId: string): Promise<AccountBalance[]> {
    assertPermission(ctx, 'finance:ledger:read');
    return this.balanceRepo.findByPeriod(ctx, periodId);
  }

  async getTrialBalance(ctx: TenantContext, periodId: string): Promise<{
    totalDebit:  number;
    totalCredit: number;
    isBalanced:  boolean;
    rows:        AccountBalance[];
  }> {
    assertPermission(ctx, 'finance:ledger:read');
    return this.balanceRepo.getTrialBalance(ctx, periodId);
  }

  async reverseJournalEntry(
    ctx:          TenantContext,
    entryId:      string,
    reversalDate?: string,
    reason?:       string,
  ): Promise<string> {
    assertPermission(ctx, 'finance:ledger:void');
    return this.journalRepo.reverseEntryViaRpc(ctx, entryId, reversalDate, reason);
  }

  async correctJournalEntry(
    ctx:             TenantContext,
    entryId:         string,
    newLines:        unknown[],
    reason?:         string,
    correctionDate?: string,
  ): Promise<string> {
    assertPermission(ctx, 'finance:ledger:manage');
    return this.journalRepo.correctEntryViaRpc(ctx, entryId, newLines, reason, correctionDate);
  }

  async generateSie4FromLedger(ctx: TenantContext, periodId: string): Promise<string> {
    assertPermission(ctx, 'finance:ledger:export');
    return this.journalRepo.generateSie4ViaRpc(ctx, periodId);
  }

  async getLedgerSie4Export(ctx: TenantContext, exportId: string): Promise<LedgerSie4Export | null> {
    assertPermission(ctx, 'finance:ledger:export');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('ledger_sie4_exports')
      .select('*')
      .eq('id', exportId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as LedgerSie4Export | null;
  }

  async listLedgerSie4Exports(ctx: TenantContext): Promise<LedgerSie4Export[]> {
    assertPermission(ctx, 'finance:ledger:export');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('ledger_sie4_exports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('generated_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as LedgerSie4Export[];
  }
}
