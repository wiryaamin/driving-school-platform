import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { TaxRemittanceRepository, VatClearingRunRepository } from '../repositories/tax-remittance.repository.js';
import { NotFoundError } from '../errors/service-errors.js';

type AnyClient = any;

export class TaxClearingService {
  private remittanceRepo:  TaxRemittanceRepository;
  private vatClearingRepo: VatClearingRunRepository;

  constructor(db: SupabaseClient<Database>) {
    this.remittanceRepo  = new TaxRemittanceRepository(db as AnyClient);
    this.vatClearingRepo = new VatClearingRunRepository(db as AnyClient);
  }

  // ── Tax remittance lifecycle ─────────────────────────────────────────────────

  async createRemittance(
    ctx: TenantContext,
    params: {
      financialPeriodId?:      string | null;
      payrollRunId?:           string | null;
      declarationPeriodStart?: string | null;
      declarationPeriodEnd?:   string | null;
      dueDate?:                string | null;
      withheldTaxAmount:       number;
      employerContribAmount:   number;
      notes?:                  string | null;
    }
  ) {
    const remittanceId = await this.remittanceRepo.create(ctx, params);
    const remittance = await this.remittanceRepo.findById(ctx, remittanceId);
    if (!remittance) throw new NotFoundError('TaxRemittance', remittanceId);
    return remittance;
  }

  async getRemittance(ctx: TenantContext, remittanceId: string) {
    const r = await this.remittanceRepo.findById(ctx, remittanceId);
    if (!r) throw new NotFoundError('TaxRemittance', remittanceId);
    return r;
  }

  async listRemittances(ctx: TenantContext, params: { periodId?: string; status?: string; limit?: number; offset?: number }) {
    if (params.periodId) return this.remittanceRepo.findByPeriod(ctx, params.periodId);
    if (params.status)   return this.remittanceRepo.findByStatus(ctx, params.status);
    return this.remittanceRepo.findAll(ctx, params.limit, params.offset);
  }

  async postClearingJournal(ctx: TenantContext, remittanceId: string) {
    const entryId = await this.remittanceRepo.postClearingJournal(ctx, remittanceId);
    const remittance = await this.remittanceRepo.findById(ctx, remittanceId);
    if (!remittance) throw new NotFoundError('TaxRemittance', remittanceId);
    return { clearingEntryId: entryId, remittance };
  }

  async postPaymentJournal(ctx: TenantContext, remittanceId: string, paymentDate: string, reference?: string | null) {
    const entryId = await this.remittanceRepo.postPaymentJournal(ctx, remittanceId, paymentDate, reference);
    const remittance = await this.remittanceRepo.findById(ctx, remittanceId);
    if (!remittance) throw new NotFoundError('TaxRemittance', remittanceId);
    return { paymentEntryId: entryId, remittance };
  }

  async completeRemittance(ctx: TenantContext, remittanceId: string) {
    await this.remittanceRepo.complete(ctx, remittanceId);
    const remittance = await this.remittanceRepo.findById(ctx, remittanceId);
    if (!remittance) throw new NotFoundError('TaxRemittance', remittanceId);
    return remittance;
  }

  // ── VAT clearing lifecycle ───────────────────────────────────────────────────

  async createVatClearingRun(
    ctx: TenantContext,
    params: { financialPeriodId: string; vatPeriodId?: string | null; runDate?: string | null; notes?: string | null }
  ) {
    const runId = await this.vatClearingRepo.create(ctx, params);
    const run = await this.vatClearingRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('VatClearingRun', runId);
    return run;
  }

  async getVatClearingRun(ctx: TenantContext, runId: string) {
    const run = await this.vatClearingRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('VatClearingRun', runId);
    return run;
  }

  async listVatClearingRuns(ctx: TenantContext, params: { periodId?: string; limit?: number; offset?: number }) {
    if (params.periodId) return this.vatClearingRepo.findByPeriod(ctx, params.periodId);
    return this.vatClearingRepo.findAll(ctx, params.limit, params.offset);
  }

  async postVatClearingJournal(ctx: TenantContext, runId: string) {
    const entryId = await this.vatClearingRepo.postClearingJournal(ctx, runId);
    const run = await this.vatClearingRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('VatClearingRun', runId);
    return { clearingEntryId: entryId, run };
  }

  async postVatPaymentJournal(ctx: TenantContext, runId: string, paymentDate: string) {
    const entryId = await this.vatClearingRepo.postPaymentJournal(ctx, runId, paymentDate);
    const run = await this.vatClearingRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('VatClearingRun', runId);
    return { paymentEntryId: entryId, run };
  }
}
