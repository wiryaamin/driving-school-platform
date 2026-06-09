import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  PeriodAuditSnapshot,
  LedgerConsistencyCheck,
  PeriodCloseReadiness,
  PeriodCloseValidationResult,
  SnapshotVerificationResult,
  SoftClosePeriodInput,
  ReopenPeriodInput,
  HardClosePeriodInput,
  PostAmendmentInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { PeriodAuditSnapshotRepository, LedgerConsistencyCheckRepository } from '../repositories/period-snapshot.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class FinancialCloseService {
  private readonly snapshotRepo: PeriodAuditSnapshotRepository;
  private readonly checkRepo:    LedgerConsistencyCheckRepository;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.snapshotRepo = new PeriodAuditSnapshotRepository(db);
    this.checkRepo    = new LedgerConsistencyCheckRepository(db);
  }

  async validatePeriodForClose(ctx: TenantContext, periodId: string): Promise<PeriodCloseValidationResult> {
    assertPermission(ctx, 'finance:close:read');
    const { data, error } = await (this.db as AnyClient).rpc('validate_period_for_close', {
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as PeriodCloseValidationResult;
  }

  async getPeriodCloseReadiness(ctx: TenantContext): Promise<PeriodCloseReadiness[]> {
    assertPermission(ctx, 'finance:close:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('v_period_close_readiness')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('period_start', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as PeriodCloseReadiness[];
  }

  async softClosePeriod(ctx: TenantContext, input: SoftClosePeriodInput): Promise<void> {
    assertPermission(ctx, 'finance:close:manage');
    const { error } = await (this.db as AnyClient).rpc('soft_close_period', {
      p_period_id: input.period_id,
      p_notes:     input.notes ?? null,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
  }

  async reopenSoftClosedPeriod(ctx: TenantContext, input: ReopenPeriodInput): Promise<void> {
    assertPermission(ctx, 'finance:close:manage');
    const { error } = await (this.db as AnyClient).rpc('reopen_soft_closed_period', {
      p_period_id: input.period_id,
      p_reason:    input.reason,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
  }

  async hardClosePeriod(ctx: TenantContext, input: HardClosePeriodInput): Promise<void> {
    assertPermission(ctx, 'finance:close:manage');
    const { error } = await (this.db as AnyClient).rpc('hard_close_period', {
      p_period_id: input.period_id,
      p_notes:     input.notes ?? null,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
  }

  async postAmendmentJournal(ctx: TenantContext, input: PostAmendmentInput): Promise<string> {
    assertPermission(ctx, 'finance:close:manage');
    const { data, error } = await (this.db as AnyClient).rpc('post_amendment_journal', {
      p_period_id: input.period_id,
      p_lines:     input.lines,
      p_reason:    input.reason,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async captureAuditSnapshot(
    ctx:          TenantContext,
    periodId:     string,
    snapshotType: string,
    notes?:       string | null,
  ): Promise<string> {
    assertPermission(ctx, 'finance:close:manage');
    return this.snapshotRepo.captureViaRpc(ctx, periodId, snapshotType, notes);
  }

  async getAuditSnapshot(ctx: TenantContext, snapshotId: string): Promise<PeriodAuditSnapshot | null> {
    assertPermission(ctx, 'finance:close:read');
    return this.snapshotRepo.findById(ctx, snapshotId);
  }

  async listAuditSnapshots(ctx: TenantContext, periodId: string): Promise<PeriodAuditSnapshot[]> {
    assertPermission(ctx, 'finance:close:read');
    return this.snapshotRepo.findByPeriod(ctx, periodId);
  }

  async verifyAuditSnapshot(ctx: TenantContext, snapshotId: string): Promise<SnapshotVerificationResult> {
    assertPermission(ctx, 'finance:close:read');
    const result = await this.snapshotRepo.verifyViaRpc(ctx, snapshotId);
    return result as SnapshotVerificationResult;
  }

  async runConsistencyCheck(
    ctx:       TenantContext,
    periodId:  string,
    checkType: string,
  ): Promise<string> {
    assertPermission(ctx, 'finance:close:manage');
    return this.checkRepo.runCheckViaRpc(ctx, periodId, checkType);
  }

  async getConsistencyCheck(ctx: TenantContext, checkId: string): Promise<LedgerConsistencyCheck | null> {
    assertPermission(ctx, 'finance:close:read');
    return this.checkRepo.findById(ctx, checkId);
  }

  async listConsistencyChecks(
    ctx:      TenantContext,
    periodId: string,
    limit?:   number,
  ): Promise<LedgerConsistencyCheck[]> {
    assertPermission(ctx, 'finance:close:read');
    return this.checkRepo.findByPeriod(ctx, periodId, limit);
  }
}
