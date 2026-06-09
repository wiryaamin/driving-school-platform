import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  BankStatementImport,
  BankStatementLine,
  ReconciliationRun,
  ReconciliationItem,
  ReconciliationTypeEnum,
  ImportBankStatementInput,
  ReconciliationReport,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BankStatementImportRepository, BankStatementLineRepository } from '../repositories/bank-statement.repository.js';
import { ReconciliationRunRepository, ReconciliationItemRepository } from '../repositories/reconciliation-run.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class BankReconciliationService {
  private readonly importRepo:          BankStatementImportRepository;
  private readonly lineRepo:            BankStatementLineRepository;
  private readonly reconciliationRepo:  ReconciliationRunRepository;
  private readonly itemRepo:            ReconciliationItemRepository;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.importRepo         = new BankStatementImportRepository(db);
    this.lineRepo           = new BankStatementLineRepository(db);
    this.reconciliationRepo = new ReconciliationRunRepository(db);
    this.itemRepo           = new ReconciliationItemRepository(db);
  }

  async importBankStatement(ctx: TenantContext, input: ImportBankStatementInput): Promise<string> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    return this.importRepo.importViaRpc(
      ctx,
      input.account_number,
      input.bank_name ?? null,
      input.statement_date,
      input.period_start,
      input.period_end,
      input.opening_balance ?? 0,
      input.closing_balance ?? 0,
      input.currency ?? 'SEK',
      input.lines,
    );
  }

  async getBankStatementImport(ctx: TenantContext, importId: string): Promise<BankStatementImport | null> {
    assertPermission(ctx, 'finance:reconciliation:read');
    return this.importRepo.findById(ctx, importId);
  }

  async listBankStatementImports(ctx: TenantContext, limit?: number, offset?: number): Promise<BankStatementImport[]> {
    assertPermission(ctx, 'finance:reconciliation:read');
    return this.importRepo.findByOrg(ctx, limit, offset);
  }

  async getBankStatementLines(ctx: TenantContext, importId: string): Promise<BankStatementLine[]> {
    assertPermission(ctx, 'finance:reconciliation:read');
    return this.lineRepo.findByImport(ctx, importId);
  }

  async autoMatchLines(ctx: TenantContext, importId: string): Promise<number> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    return this.importRepo.autoMatchLines(ctx, importId);
  }

  async manualMatchLine(ctx: TenantContext, lineId: string, paymentId: string, notes?: string): Promise<void> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    return this.lineRepo.manualMatch(ctx, lineId, paymentId, notes);
  }

  async unmatchLine(ctx: TenantContext, lineId: string): Promise<void> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    return this.lineRepo.unmatch(ctx, lineId);
  }

  async confirmBankReconciliation(
    ctx:      TenantContext,
    importId: string,
    periodId: string,
    notes?:   string | null,
  ): Promise<string> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    return this.reconciliationRepo.confirmBankReconciliationViaRpc(ctx, importId, periodId, notes);
  }

  async reconcileAccountsReceivable(ctx: TenantContext, periodId: string): Promise<string> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    return this.reconciliationRepo.reconcileArViaRpc(ctx, periodId);
  }

  async reconcileVatPeriod(ctx: TenantContext, periodId: string, vatPeriodId: string): Promise<string> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    return this.reconciliationRepo.reconcileVatViaRpc(ctx, periodId, vatPeriodId);
  }

  async reconcileDeferredRevenue(ctx: TenantContext, periodId: string): Promise<string> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    return this.reconciliationRepo.reconcileDeferredViaRpc(ctx, periodId);
  }

  async getReconciliationRun(ctx: TenantContext, runId: string): Promise<ReconciliationRun | null> {
    assertPermission(ctx, 'finance:reconciliation:read');
    return this.reconciliationRepo.findById(ctx, runId);
  }

  async listReconciliationRunsForPeriod(ctx: TenantContext, periodId: string): Promise<ReconciliationRun[]> {
    assertPermission(ctx, 'finance:reconciliation:read');
    return this.reconciliationRepo.findByPeriod(ctx, periodId);
  }

  async getLatestReconciliationRun(
    ctx:      TenantContext,
    periodId: string,
    type:     ReconciliationTypeEnum,
  ): Promise<ReconciliationRun | null> {
    assertPermission(ctx, 'finance:reconciliation:read');
    return this.reconciliationRepo.findLatestByType(ctx, periodId, type);
  }

  async getReconciliationItems(ctx: TenantContext, runId: string): Promise<ReconciliationItem[]> {
    assertPermission(ctx, 'finance:reconciliation:read');
    return this.itemRepo.findByRun(ctx, runId);
  }

  async generateReconciliationReport(ctx: TenantContext, periodId: string): Promise<ReconciliationReport> {
    assertPermission(ctx, 'finance:reconciliation:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('generate_reconciliation_report', {
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as ReconciliationReport;
  }
}
