import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { PayrollRunRepository, PayrollEntryRepository } from '../repositories/payroll-run.repository.js';
import { NotFoundError, ValidationError } from '../errors/service-errors.js';

type AnyClient = any;

export class PayrollJournalService {
  private runRepo:   PayrollRunRepository;
  private entryRepo: PayrollEntryRepository;

  constructor(db: SupabaseClient<Database>) {
    this.runRepo   = new PayrollRunRepository(db as AnyClient);
    this.entryRepo = new PayrollEntryRepository(db as AnyClient);
  }

  async createRun(
    ctx: TenantContext,
    params: {
      payPeriodStart:     string;
      payPeriodEnd:       string;
      payDate:            string;
      financialPeriodId?: string | null;
      runType?:           string;
      correctionOfRunId?: string | null;
      notes?:             string | null;
    }
  ) {
    const runId = await this.runRepo.createRun(ctx, params);
    const run = await this.runRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('PayrollRun', runId);
    return run;
  }

  async addEntry(
    ctx: TenantContext,
    params: {
      runId:                string;
      employeeId:           string;
      grossSalary:          number;
      withheldTax?:         number;
      employerContribRate?: number;
      pensionAmount?:       number;
      benefitsAmount?:      number;
      instructorId?:        string | null;
      notes?:               string | null;
    }
  ) {
    const run = await this.runRepo.findById(ctx, params.runId);
    if (!run) throw new NotFoundError('PayrollRun', params.runId);
    if (run.status !== 'draft' && run.status !== 'ready') {
      throw new ValidationError(`Payroll run ${params.runId} is ${run.status} — entries can only be added to draft or ready runs`);
    }
    const entryId = await this.entryRepo.addEntry(ctx, params);
    const entry = await this.entryRepo.findById(ctx, entryId);
    if (!entry) throw new NotFoundError('PayrollEntry', entryId);
    return entry;
  }

  async getRun(ctx: TenantContext, runId: string) {
    const run = await this.runRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('PayrollRun', runId);
    return run;
  }

  async listRuns(ctx: TenantContext, params: { periodId?: string; status?: string; limit?: number; offset?: number }) {
    if (params.periodId) return this.runRepo.findByPeriod(ctx, params.periodId);
    if (params.status)   return this.runRepo.findByStatus(ctx, params.status);
    return this.runRepo.findAll(ctx, params.limit, params.offset);
  }

  async getEntries(ctx: TenantContext, runId: string) {
    const run = await this.runRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('PayrollRun', runId);
    return this.entryRepo.findByRun(ctx, runId);
  }

  async postJournal(ctx: TenantContext, runId: string) {
    const entryId = await this.runRepo.postJournal(ctx, runId);
    const run = await this.runRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('PayrollRun', runId);
    return { journalEntryId: entryId, run };
  }

  async postSalaryPayment(ctx: TenantContext, runId: string, paymentDate: string, bankAccount?: string) {
    const entryId = await this.runRepo.postSalaryPayment(ctx, runId, paymentDate, bankAccount);
    const run = await this.runRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('PayrollRun', runId);
    return { paymentEntryId: entryId, run };
  }

  async reverseRun(ctx: TenantContext, runId: string, reason: string) {
    const reversalEntryId = await this.runRepo.reverseRun(ctx, runId, reason);
    const run = await this.runRepo.findById(ctx, runId);
    if (!run) throw new NotFoundError('PayrollRun', runId);
    return { reversalEntryId, run };
  }
}
