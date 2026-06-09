import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  AccountingLayerRegistryEntry,
  ReplayValidationDelta,
  ReplayCertification,
  CertifyPeriodResult,
  ReplayIntegrityCertificate,
  ReplayExecutionJob,
  CanonicalExportHash,
  EnqueueReplayJobRequest,
  AccountingLayerTypeEnum,
  ReplayCertificationStatusEnum,
  CanonicalExportTypeEnum,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import {
  AccountingLayerRegistryRepository,
  ReplayValidationDeltaRepository,
  ReplayCertificationRepository,
  ReplayIntegrityCertificateRepository,
  ReplayExecutionJobRepository,
  CanonicalExportHashRepository,
} from '../repositories/accounting-architecture.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

export class AccountingArchitectureService {
  private readonly layerRepo:       AccountingLayerRegistryRepository;
  private readonly deltaRepo:       ReplayValidationDeltaRepository;
  private readonly certRepo:        ReplayCertificationRepository;
  private readonly intCertRepo:     ReplayIntegrityCertificateRepository;
  private readonly jobRepo:         ReplayExecutionJobRepository;
  private readonly exportHashRepo:  CanonicalExportHashRepository;

  constructor(db: SupabaseClient<Database>) {
    this.layerRepo      = new AccountingLayerRegistryRepository(db);
    this.deltaRepo      = new ReplayValidationDeltaRepository(db);
    this.certRepo       = new ReplayCertificationRepository(db);
    this.intCertRepo    = new ReplayIntegrityCertificateRepository(db);
    this.jobRepo        = new ReplayExecutionJobRepository(db);
    this.exportHashRepo = new CanonicalExportHashRepository(db);
  }

  // ── Accounting Layer Registry ─────────────────────────────────────────────

  async getAccountingLayers(_ctx: TenantContext): Promise<AccountingLayerRegistryEntry[]> {
    return this.layerRepo.findAll();
  }

  async getLayersByType(
    _ctx: TenantContext,
    type: AccountingLayerTypeEnum,
  ): Promise<AccountingLayerRegistryEntry[]> {
    return this.layerRepo.findByType(type);
  }

  // ── Replay Validation Deltas ──────────────────────────────────────────────

  async getDeltasByRun(ctx: TenantContext, replayRunId: string): Promise<ReplayValidationDelta[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.deltaRepo.findByRun(ctx, replayRunId);
  }

  async getDeltasByPeriod(ctx: TenantContext, periodId: string): Promise<ReplayValidationDelta[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.deltaRepo.findByPeriod(ctx, periodId);
  }

  // ── Replay Certifications ─────────────────────────────────────────────────

  async certifyPeriodReplay(ctx: TenantContext, periodId: string): Promise<CertifyPeriodResult> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.certRepo.certifyViaRpc(ctx, periodId);
  }

  async getCertificationsByPeriod(
    ctx:      TenantContext,
    periodId: string,
    status?:  ReplayCertificationStatusEnum,
  ): Promise<ReplayCertification[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.certRepo.findByPeriod(ctx, periodId, status);
  }

  async getActiveCertification(ctx: TenantContext, periodId: string): Promise<ReplayCertification | null> {
    assertPermission(ctx, 'finance:replay:read');
    return this.certRepo.getActiveCertification(ctx, periodId);
  }

  // ── Replay Integrity Certificates ────────────────────────────────────────

  async generateIntegrityCertificate(ctx: TenantContext, fiscalYearId: string): Promise<string> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.intCertRepo.generateViaRpc(ctx, fiscalYearId);
  }

  async getIntegrityCertificate(
    ctx:          TenantContext,
    certificateId: string,
  ): Promise<ReplayIntegrityCertificate> {
    assertPermission(ctx, 'finance:replay:read');
    return this.intCertRepo.findByIdOrFail(ctx, certificateId);
  }

  async getIntegrityCertificatesByFiscalYear(
    ctx:          TenantContext,
    fiscalYearId: string,
  ): Promise<ReplayIntegrityCertificate[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.intCertRepo.findByFiscalYear(ctx, fiscalYearId);
  }

  // ── Replay Execution Jobs ─────────────────────────────────────────────────

  async enqueueReplayJob(ctx: TenantContext, req: EnqueueReplayJobRequest): Promise<string> {
    assertPermission(ctx, 'finance:governance:manage');
    return this.jobRepo.enqueueViaRpc(
      ctx,
      req.periodId     ?? null,
      req.fiscalYearId ?? null,
      req.jobType,
      req.priority     ?? 50,
    );
  }

  async getJob(ctx: TenantContext, jobId: string): Promise<ReplayExecutionJob> {
    assertPermission(ctx, 'finance:replay:read');
    return this.jobRepo.findByIdOrFail(ctx, jobId);
  }

  async getQueuedJobs(ctx: TenantContext): Promise<ReplayExecutionJob[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.jobRepo.findByStatus(ctx, 'queued');
  }

  async getJobsByPeriod(ctx: TenantContext, periodId: string): Promise<ReplayExecutionJob[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.jobRepo.findByPeriod(ctx, periodId);
  }

  // ── Canonical Export Hashes ───────────────────────────────────────────────

  async getExportHashesByPeriod(ctx: TenantContext, periodId: string): Promise<CanonicalExportHash[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.exportHashRepo.findByPeriod(ctx, periodId);
  }

  async getExportHashByExportId(ctx: TenantContext, exportId: string): Promise<CanonicalExportHash | null> {
    assertPermission(ctx, 'finance:replay:read');
    return this.exportHashRepo.findByExportId(ctx, exportId);
  }

  async getExportHashesByType(
    ctx:        TenantContext,
    periodId:   string,
    exportType: CanonicalExportTypeEnum,
  ): Promise<CanonicalExportHash[]> {
    assertPermission(ctx, 'finance:replay:read');
    return this.exportHashRepo.findByType(ctx, periodId, exportType);
  }
}
