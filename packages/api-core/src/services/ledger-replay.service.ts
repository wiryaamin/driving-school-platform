import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  LedgerReplayRun,
  ReplaySnapshot,
  ReplayStateResult,
  RunReplayRequest,
  RunFiscalYearReplayRequest,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { LedgerReplayRunRepository, ReplaySnapshotRepository } from '../repositories/ledger-replay.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

export class LedgerReplayService {
  private readonly replayRunRepo:  LedgerReplayRunRepository;
  private readonly snapshotRepo:   ReplaySnapshotRepository;

  constructor(db: SupabaseClient<Database>) {
    this.replayRunRepo = new LedgerReplayRunRepository(db);
    this.snapshotRepo  = new ReplaySnapshotRepository(db);
  }

  async replayPeriod(ctx: TenantContext, req: RunReplayRequest): Promise<ReplayStateResult> {
    assertPermission(ctx, 'finance:replay:manage');
    return this.replayRunRepo.replayPeriodViaRpc(ctx, req.periodId);
  }

  async validateBalanceReconstruction(ctx: TenantContext, periodId: string): Promise<unknown> {
    assertPermission(ctx, 'finance:replay:read');
    return this.replayRunRepo.validateBalanceReconstructionViaRpc(ctx, periodId);
  }

  async replayFiscalYear(ctx: TenantContext, req: RunFiscalYearReplayRequest): Promise<unknown> {
    assertPermission(ctx, 'finance:replay:manage');
    return this.replayRunRepo.replayFiscalYearViaRpc(ctx, req.fiscalYearId);
  }

  async getRunsByPeriod(ctx: TenantContext, periodId: string): Promise<LedgerReplayRun[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.replayRunRepo.findByPeriod(ctx, periodId);
  }

  async getLatestRunByPeriod(ctx: TenantContext, periodId: string): Promise<LedgerReplayRun | null> {
    assertPermission(ctx, 'finance:replay:read');
    return this.replayRunRepo.findLatestByPeriod(ctx, periodId);
  }

  async getRunsByFiscalYear(ctx: TenantContext, fiscalYearId: string): Promise<LedgerReplayRun[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.replayRunRepo.findByFiscalYear(ctx, fiscalYearId);
  }

  async getDivergentRuns(ctx: TenantContext): Promise<LedgerReplayRun[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.replayRunRepo.findDivergent(ctx);
  }

  async getRunById(ctx: TenantContext, id: string): Promise<LedgerReplayRun> {
    assertPermission(ctx, 'finance:replay:read');
    return this.replayRunRepo.findByIdOrFail(ctx, id);
  }

  async getSnapshotsByRun(ctx: TenantContext, replayRunId: string): Promise<ReplaySnapshot[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.snapshotRepo.findByRun(ctx, replayRunId);
  }

  async getDivergentSnapshotsByRun(ctx: TenantContext, replayRunId: string): Promise<ReplaySnapshot[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.snapshotRepo.findDivergentByRun(ctx, replayRunId);
  }

  async getSnapshotsByPeriod(ctx: TenantContext, periodId: string): Promise<ReplaySnapshot[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.snapshotRepo.findByPeriod(ctx, periodId);
  }
}
