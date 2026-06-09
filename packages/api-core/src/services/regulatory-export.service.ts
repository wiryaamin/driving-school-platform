import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import {
  AgiExportRepository,
  AgiExportLineRepository,
  RegulatoryAuditExportRepository,
} from '../repositories/regulatory-export.repository.js';
import { NotFoundError } from '../errors/service-errors.js';

type AnyClient = any;

export class RegulatoryExportService {
  private agiRepo:       AgiExportRepository;
  private agiLineRepo:   AgiExportLineRepository;
  private auditRepo:     RegulatoryAuditExportRepository;

  constructor(db: SupabaseClient<Database>) {
    this.agiRepo     = new AgiExportRepository(db as AnyClient);
    this.agiLineRepo = new AgiExportLineRepository(db as AnyClient);
    this.auditRepo   = new RegulatoryAuditExportRepository(db as AnyClient);
  }

  // ── AGI export lifecycle ─────────────────────────────────────────────────────

  async generateAgi(ctx: TenantContext, payrollRunId: string, notes?: string | null) {
    const exportId = await this.agiRepo.generate(ctx, payrollRunId, notes);
    const agi = await this.agiRepo.findById(ctx, exportId);
    if (!agi) throw new NotFoundError('AgiExport', exportId);
    return agi;
  }

  async getAgi(ctx: TenantContext, exportId: string) {
    const agi = await this.agiRepo.findById(ctx, exportId);
    if (!agi) throw new NotFoundError('AgiExport', exportId);
    return agi;
  }

  async listAgis(ctx: TenantContext, params: { status?: string; limit?: number; offset?: number }) {
    if (params.status) return this.agiRepo.findByStatus(ctx, params.status);
    return this.agiRepo.findAll(ctx, params.limit, params.offset);
  }

  async getAgiLines(ctx: TenantContext, exportId: string) {
    const agi = await this.agiRepo.findById(ctx, exportId);
    if (!agi) throw new NotFoundError('AgiExport', exportId);
    return this.agiLineRepo.findByExport(ctx, exportId);
  }

  async lockAgi(ctx: TenantContext, exportId: string, receipt?: string | null) {
    await this.agiRepo.lock(ctx, exportId, receipt);
    const agi = await this.agiRepo.findById(ctx, exportId);
    if (!agi) throw new NotFoundError('AgiExport', exportId);
    return agi;
  }

  async verifyAgiIntegrity(ctx: TenantContext, exportId: string): Promise<Json> {
    const agi = await this.agiRepo.findById(ctx, exportId);
    if (!agi) throw new NotFoundError('AgiExport', exportId);
    return this.agiRepo.verifyIntegrity(ctx, exportId);
  }

  // ── Regulatory audit export lifecycle ────────────────────────────────────────

  async generateAuditExport(
    ctx: TenantContext,
    params: { periodId: string; exportType: string; notes?: string | null }
  ) {
    const exportId = await this.auditRepo.generate(ctx, params);
    const audit = await this.auditRepo.findById(ctx, exportId);
    if (!audit) throw new NotFoundError('RegulatoryAuditExport', exportId);
    return audit;
  }

  async getAuditExport(ctx: TenantContext, exportId: string) {
    const audit = await this.auditRepo.findById(ctx, exportId);
    if (!audit) throw new NotFoundError('RegulatoryAuditExport', exportId);
    return audit;
  }

  async listAuditExports(ctx: TenantContext, params: { periodId?: string; exportType?: string; limit?: number; offset?: number }) {
    if (params.periodId)   return this.auditRepo.findByPeriod(ctx, params.periodId);
    if (params.exportType) return this.auditRepo.findByType(ctx, params.exportType);
    return this.auditRepo.findAll(ctx, params.limit, params.offset);
  }
}
