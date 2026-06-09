import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  ScheduleGeneration,
  ScheduleGenerationLink,
  FiscalDependencyEdge,
  ReplayDivergenceEvent,
  SubledgerCloseJob,
  ReplayValidationReport,
  CanonicalReplayExport,
  ReplayHashRegistry,
  ScheduleGenerationTypeEnum,
  SubledgerTypeEnum,
  ReplayHashTypeEnum,
  CloseDependencyResult,
  ReopenPeriodResult,
  SubledgerOrchestrationResult,
  ReplayIntegrityResult,
  SupersedeScheduleRequest,
  ReopenPeriodRequest,
  GenerateReplayExportRequest,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import {
  ScheduleGenerationRepository,
  ScheduleGenerationLinkRepository,
  FiscalDependencyGraphRepository,
  ReplayDivergenceEventRepository,
  SubledgerCloseJobRepository,
  ReplayValidationReportRepository,
  CanonicalReplayExportRepository,
  ReplayHashRegistryRepository,
} from '../repositories/ledger-governance.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

export class LedgerGovernanceService {
  private readonly scheduleGenRepo:    ScheduleGenerationRepository;
  private readonly scheduleLinksRepo:  ScheduleGenerationLinkRepository;
  private readonly dependencyRepo:     FiscalDependencyGraphRepository;
  private readonly divergenceRepo:     ReplayDivergenceEventRepository;
  private readonly subledgerJobRepo:   SubledgerCloseJobRepository;
  private readonly validationRepo:     ReplayValidationReportRepository;
  private readonly canonicalExportRepo: CanonicalReplayExportRepository;
  private readonly hashRegistryRepo:   ReplayHashRegistryRepository;

  constructor(db: SupabaseClient<Database>) {
    this.scheduleGenRepo     = new ScheduleGenerationRepository(db);
    this.scheduleLinksRepo   = new ScheduleGenerationLinkRepository(db);
    this.dependencyRepo      = new FiscalDependencyGraphRepository(db);
    this.divergenceRepo      = new ReplayDivergenceEventRepository(db);
    this.subledgerJobRepo    = new SubledgerCloseJobRepository(db);
    this.validationRepo      = new ReplayValidationReportRepository(db);
    this.canonicalExportRepo = new CanonicalReplayExportRepository(db);
    this.hashRegistryRepo    = new ReplayHashRegistryRepository(db);
  }

  // ── Schedule Lineage ────────────────────────────────────────────────────────

  async supersedeScheduleGeneration(ctx: TenantContext, req: SupersedeScheduleRequest): Promise<string> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.scheduleGenRepo.supersedeViaRpc(
      ctx,
      req.scheduleType,
      req.sourceId,
      req.linesCount,
      req.totalAmount,
      req.reason,
    );
  }

  async getCurrentGeneration(
    ctx:          TenantContext,
    scheduleType: ScheduleGenerationTypeEnum,
    sourceId:     string,
  ): Promise<ScheduleGeneration | null> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.scheduleGenRepo.findCurrentBySource(ctx, scheduleType, sourceId);
  }

  async getGenerationHistory(
    ctx:          TenantContext,
    scheduleType: ScheduleGenerationTypeEnum,
    sourceId:     string,
  ): Promise<ScheduleGeneration[]> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.scheduleGenRepo.findAllBySource(ctx, scheduleType, sourceId);
  }

  async getGenerationLinks(ctx: TenantContext, generationId: string): Promise<ScheduleGenerationLink[]> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.scheduleLinksRepo.findByParent(ctx, generationId);
  }

  // ── Fiscal Dependency ───────────────────────────────────────────────────────

  async validateCloseDependencies(ctx: TenantContext, periodId: string): Promise<CloseDependencyResult> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.dependencyRepo.validateCloseViaRpc(ctx, periodId);
  }

  async reopenPeriodSafe(ctx: TenantContext, req: ReopenPeriodRequest): Promise<ReopenPeriodResult> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.dependencyRepo.reopenPeriodSafeViaRpc(ctx, req.periodId, req.reason);
  }

  async getDependenciesForPeriod(ctx: TenantContext, periodId: string): Promise<FiscalDependencyEdge[]> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.dependencyRepo.findDependenciesForPeriod(ctx, periodId);
  }

  async getDownstreamDependents(ctx: TenantContext, periodId: string): Promise<FiscalDependencyEdge[]> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.dependencyRepo.findDownstreamDependents(ctx, periodId);
  }

  // ── Replay Divergence ───────────────────────────────────────────────────────

  async getDivergencesByPeriod(ctx: TenantContext, periodId: string): Promise<ReplayDivergenceEvent[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.divergenceRepo.findByPeriod(ctx, periodId);
  }

  async getUnresolvedDivergences(ctx: TenantContext): Promise<ReplayDivergenceEvent[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.divergenceRepo.findUnresolved(ctx);
  }

  // ── Subledger Orchestration ─────────────────────────────────────────────────

  async orchestrateSubledgerClose(ctx: TenantContext, periodId: string): Promise<SubledgerOrchestrationResult> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.subledgerJobRepo.orchestrateViaRpc(ctx, periodId);
  }

  async getSubledgerJobsByPeriod(ctx: TenantContext, periodId: string): Promise<SubledgerCloseJob[]> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.subledgerJobRepo.findByPeriod(ctx, periodId);
  }

  async getSubledgerJobByType(
    ctx:           TenantContext,
    periodId:      string,
    subledgerType: SubledgerTypeEnum,
  ): Promise<SubledgerCloseJob | null> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.subledgerJobRepo.findByPeriodAndType(ctx, periodId, subledgerType);
  }

  async getBlockingSubledgerJobs(ctx: TenantContext, periodId: string): Promise<SubledgerCloseJob[]> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.subledgerJobRepo.findBlockingByPeriod(ctx, periodId);
  }

  // ── Replay Validation ───────────────────────────────────────────────────────

  async validateReplayIntegrity(ctx: TenantContext, periodId: string): Promise<ReplayIntegrityResult> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.validationRepo.validateIntegrityViaRpc(ctx, periodId);
  }

  async generateReplaySnapshot(ctx: TenantContext, periodId: string): Promise<string> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.validationRepo.generateSnapshotViaRpc(ctx, periodId);
  }

  async getValidationReportsByPeriod(ctx: TenantContext, periodId: string): Promise<ReplayValidationReport[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.validationRepo.findByPeriod(ctx, periodId);
  }

  async getValidationReport(ctx: TenantContext, reportId: string): Promise<ReplayValidationReport> {
    assertPermission(ctx, 'finance:replay:read');
    return this.validationRepo.findByIdOrFail(ctx, reportId);
  }

  // ── Canonical Replay Export ─────────────────────────────────────────────────

  async generateCanonicalReplayExport(ctx: TenantContext, req: GenerateReplayExportRequest): Promise<string> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.canonicalExportRepo.generateViaRpc(ctx, req.periodId, req.notes);
  }

  async getLatestCanonicalExport(ctx: TenantContext, periodId: string): Promise<CanonicalReplayExport | null> {
    assertPermission(ctx, 'finance:replay:read');
    return this.canonicalExportRepo.findLatestByPeriod(ctx, periodId);
  }

  // ── Hash Registry ───────────────────────────────────────────────────────────

  async getHashesForPeriod(ctx: TenantContext, periodId: string): Promise<ReplayHashRegistry[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.hashRegistryRepo.findAllByPeriod(ctx, periodId);
  }

  async getHashByType(
    ctx:      TenantContext,
    periodId: string,
    hashType: ReplayHashTypeEnum,
  ): Promise<ReplayHashRegistry | null> {
    assertPermission(ctx, 'finance:replay:read');
    return this.hashRegistryRepo.findByPeriodAndType(ctx, periodId, hashType);
  }
}
