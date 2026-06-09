import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';

type AnyClient = any;

type PayrollRunRow    = Database['public']['Tables']['payroll_runs']['Row'];
type PayrollRunInsert = Database['public']['Tables']['payroll_runs']['Insert'];
type PayrollRunUpdate = Database['public']['Tables']['payroll_runs']['Update'];
type PayrollEntryRow    = Database['public']['Tables']['payroll_entries']['Row'];
type PayrollEntryInsert = Database['public']['Tables']['payroll_entries']['Insert'];
type PayrollEntryUpdate = Database['public']['Tables']['payroll_entries']['Update'];

export class PayrollRunRepository extends BaseRepository<PayrollRunRow, PayrollRunInsert, PayrollRunUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'payroll_runs');
  }

  override async findById(ctx: TenantContext, id: string): Promise<PayrollRunRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('payroll_runs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<PayrollRunRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('payroll_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .order('pay_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findByStatus(ctx: TenantContext, status: string): Promise<PayrollRunRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('payroll_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('status', status)
      .order('pay_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findAll(ctx: TenantContext, limit = 50, offset = 0): Promise<PayrollRunRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('payroll_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('pay_date', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
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
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('create_payroll_run' as never, {
        p_org_id:                ctx.organizationId,
        p_financial_period_id:   params.financialPeriodId ?? null,
        p_pay_period_start:      params.payPeriodStart,
        p_pay_period_end:        params.payPeriodEnd,
        p_pay_date:              params.payDate,
        p_run_type:              params.runType ?? 'regular',
        p_correction_of_run_id:  params.correctionOfRunId ?? null,
        p_notes:                 params.notes ?? null,
        p_actor_id:              ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async postJournal(ctx: TenantContext, runId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_payroll_journal' as never, { p_run_id: runId, p_actor_id: ctx.actorId });
    if (error) throw error;
    return data as string;
  }

  async postSalaryPayment(ctx: TenantContext, runId: string, paymentDate: string, bankAccount?: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_salary_payment' as never, {
        p_run_id:        runId,
        p_payment_date:  paymentDate,
        p_bank_account:  bankAccount ?? '1930',
        p_actor_id:      ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async reverseRun(ctx: TenantContext, runId: string, reason: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('reverse_payroll_run' as never, { p_run_id: runId, p_reason: reason, p_actor_id: ctx.actorId });
    if (error) throw error;
    return data as string;
  }
}

export class PayrollEntryRepository extends BaseRepository<PayrollEntryRow, PayrollEntryInsert, PayrollEntryUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'payroll_entries');
  }

  override async findById(ctx: TenantContext, id: string): Promise<PayrollEntryRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('payroll_entries')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByRun(ctx: TenantContext, runId: string): Promise<PayrollEntryRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('payroll_entries')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('payroll_run_id', runId)
      .order('employee_id');
    if (error) throw error;
    return data ?? [];
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
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('add_payroll_entry' as never, {
        p_run_id:                params.runId,
        p_employee_id:           params.employeeId,
        p_gross_salary:          params.grossSalary,
        p_withheld_tax:          params.withheldTax ?? 0,
        p_employer_contrib_rate: params.employerContribRate ?? 0.3142,
        p_pension_amount:        params.pensionAmount ?? 0,
        p_benefits_amount:       params.benefitsAmount ?? 0,
        p_instructor_id:         params.instructorId ?? null,
        p_notes:                 params.notes ?? null,
        p_actor_id:              ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }
}
