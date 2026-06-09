import type { PagedResult } from '@platform/types';
import type {
  AccountingChartOfAccounts,
  AccountingExportRun,
  AccountingExportEntry,
  AccountingExportFormat,
  CreateAccountingExportInput,
  FinalizeAccountingExportInput,
  AbortAccountingExportInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { AccountingExportRepository } from '../repositories/accounting-export.repository.js';
import type { AccountingExportEntryRepository } from '../repositories/accounting-export-entry.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { NotFoundError } from '../errors/service-errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class AccountingExportService {
  constructor(
    private readonly exportRepo:      AccountingExportRepository,
    private readonly entryRepo:       AccountingExportEntryRepository
  ) {}

  // ─── Chart of accounts ────────────────────────────────────────────────────

  async listChartOfAccounts(ctx: TenantContext): Promise<AccountingChartOfAccounts[]> {
    assertPermission(ctx, 'finance:export:run');
    return this.exportRepo.listChartEntries(ctx);
  }

  async upsertChartEntry(
    ctx:          TenantContext,
    eventType:    string,
    accountDebit: string,
    accountCredit: string,
    description?: string
  ): Promise<AccountingChartOfAccounts> {
    assertPermission(ctx, 'finance:export:run');
    return this.exportRepo.upsertChartEntry(ctx, eventType, accountDebit, accountCredit, description);
  }

  // ─── Export runs (legacy TypeScript-layer workflow) ───────────────────────

  async startExportRun(
    ctx:      TenantContext,
    format:   AccountingExportFormat,
    fromDate: string,
    toDate:   string
  ): Promise<AccountingExportRun> {
    assertPermission(ctx, 'finance:export:run');
    const run = await this.exportRepo.createRun(ctx, format, fromDate, toDate);
    await this.exportRepo.updateRunStatus(ctx, run.id, 'running');
    const items = await this.exportRepo.getPendingQueueItems(ctx, fromDate, toDate);
    if (items.length > 0) {
      await this.exportRepo.markExported(ctx, items.map(i => i.id), run.id);
    }
    await this.exportRepo.updateRunStatus(ctx, run.id, 'completed', items.length);
    const updated = await this.exportRepo.findRunById(ctx, run.id);
    return updated ?? run;
  }

  async getExportRun(ctx: TenantContext, runId: string): Promise<AccountingExportRun> {
    assertPermission(ctx, 'finance:export:run');
    const run = await this.exportRepo.findRunById(ctx, runId);
    if (run === null) throw new NotFoundError('AccountingExportRun', runId);
    return run;
  }

  async listExportRuns(
    ctx:   TenantContext,
    query: { page?: number; per_page?: number }
  ): Promise<PagedResult<AccountingExportRun>> {
    assertPermission(ctx, 'finance:export:run');
    return this.exportRepo.listRuns(ctx, query);
  }

  // ─── Export runs (RPC-based workflow with immutable snapshot) ────────────
  // These methods use the SECURITY DEFINER SQL functions introduced in Phase 4B.7.
  // They create an immutable accounting_export_entries snapshot, which enables:
  //   1. Reproducible SIE4 file generation from the snapshot
  //   2. Duplicate export prevention
  //   3. Full audit lineage (queue item → entry → run)

  async createExportRun(
    ctx:   TenantContext,
    input: CreateAccountingExportInput
  ): Promise<string> {
    assertPermission(ctx, 'finance:export:run');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.exportRepo as AnyClient).db.rpc(
      'create_accounting_export',
      {
        p_org_id:    ctx.organizationId,
        p_format:    input.format,
        p_from_date: input.from_date,
        p_to_date:   input.to_date,
        p_actor_id:  ctx.actorId ?? null,
      }
    );
    if (error) throw new Error((error as { message?: string }).message ?? 'create_accounting_export failed');
    return data as string;
  }

  async finalizeExportRun(
    ctx:   TenantContext,
    input: FinalizeAccountingExportInput
  ): Promise<void> {
    assertPermission(ctx, 'finance:export:run');
    const { error } = await (this.exportRepo as AnyClient).db.rpc(
      'finalize_accounting_export',
      {
        p_export_run_id:  input.export_run_id,
        p_file_reference: input.file_reference,
        p_item_count:     input.item_count,
        p_actor_id:       ctx.actorId ?? null,
      }
    );
    if (error) throw new Error((error as { message?: string }).message ?? 'finalize_accounting_export failed');
  }

  async abortExportRun(
    ctx:   TenantContext,
    input: AbortAccountingExportInput
  ): Promise<void> {
    assertPermission(ctx, 'finance:export:run');
    const { error } = await (this.exportRepo as AnyClient).db.rpc(
      'abort_accounting_export',
      {
        p_export_run_id: input.export_run_id,
        p_error_message: input.error_message,
        p_actor_id:      ctx.actorId ?? null,
      }
    );
    if (error) throw new Error((error as { message?: string }).message ?? 'abort_accounting_export failed');
  }

  // ─── Export entries (immutable snapshot) ─────────────────────────────────

  async listExportEntries(
    ctx:          TenantContext,
    exportRunId:  string
  ): Promise<AccountingExportEntry[]> {
    assertPermission(ctx, 'finance:export:run');
    return this.entryRepo.listByExportRun(ctx, exportRunId);
  }

  async countExportEntries(ctx: TenantContext, exportRunId: string): Promise<number> {
    assertPermission(ctx, 'finance:export:run');
    return this.entryRepo.countByExportRun(ctx, exportRunId);
  }
}
