import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';

type AnyClient = any;

type TaxRemittanceRow    = Database['public']['Tables']['tax_remittances']['Row'];
type TaxRemittanceInsert = Database['public']['Tables']['tax_remittances']['Insert'];
type TaxRemittanceUpdate = Database['public']['Tables']['tax_remittances']['Update'];
type VatClearingRunRow    = Database['public']['Tables']['vat_clearing_runs']['Row'];
type VatClearingRunInsert = Database['public']['Tables']['vat_clearing_runs']['Insert'];
type VatClearingRunUpdate = Database['public']['Tables']['vat_clearing_runs']['Update'];

export class TaxRemittanceRepository extends BaseRepository<TaxRemittanceRow, TaxRemittanceInsert, TaxRemittanceUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'tax_remittances');
  }

  override async findById(ctx: TenantContext, id: string): Promise<TaxRemittanceRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('tax_remittances')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByStatus(ctx: TenantContext, status: string): Promise<TaxRemittanceRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('tax_remittances')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('status', status)
      .order('due_date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<TaxRemittanceRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('tax_remittances')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findAll(ctx: TenantContext, limit = 50, offset = 0): Promise<TaxRemittanceRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('tax_remittances')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  }

  async create(
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
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('create_tax_remittance' as never, {
        p_org_id:                    ctx.organizationId,
        p_financial_period_id:       params.financialPeriodId ?? null,
        p_payroll_run_id:            params.payrollRunId ?? null,
        p_declaration_period_start:  params.declarationPeriodStart ?? null,
        p_declaration_period_end:    params.declarationPeriodEnd ?? null,
        p_due_date:                  params.dueDate ?? null,
        p_withheld_tax_amount:       params.withheldTaxAmount,
        p_employer_contrib_amount:   params.employerContribAmount,
        p_notes:                     params.notes ?? null,
        p_actor_id:                  ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async postClearingJournal(ctx: TenantContext, remittanceId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_tax_clearing_journal' as never, { p_remittance_id: remittanceId, p_actor_id: ctx.actorId });
    if (error) throw error;
    return data as string;
  }

  async postPaymentJournal(ctx: TenantContext, remittanceId: string, paymentDate: string, reference?: string | null): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_tax_payment_journal' as never, {
        p_remittance_id: remittanceId,
        p_payment_date:  paymentDate,
        p_reference:     reference ?? null,
        p_actor_id:      ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async complete(ctx: TenantContext, remittanceId: string): Promise<void> {
    const { error } = await (this.db as AnyClient)
      .rpc('complete_tax_remittance' as never, { p_remittance_id: remittanceId, p_actor_id: ctx.actorId });
    if (error) throw error;
  }
}

export class VatClearingRunRepository extends BaseRepository<VatClearingRunRow, VatClearingRunInsert, VatClearingRunUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'vat_clearing_runs');
  }

  override async findById(ctx: TenantContext, id: string): Promise<VatClearingRunRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('vat_clearing_runs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<VatClearingRunRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('vat_clearing_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .order('run_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findAll(ctx: TenantContext, limit = 50, offset = 0): Promise<VatClearingRunRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('vat_clearing_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('run_date', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  }

  async create(ctx: TenantContext, params: { financialPeriodId: string; vatPeriodId?: string | null; runDate?: string | null; notes?: string | null }): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('create_vat_clearing_run' as never, {
        p_org_id:              ctx.organizationId,
        p_financial_period_id: params.financialPeriodId,
        p_vat_period_id:       params.vatPeriodId ?? null,
        p_run_date:            params.runDate ?? null,
        p_notes:               params.notes ?? null,
        p_actor_id:            ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async postClearingJournal(ctx: TenantContext, runId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_vat_clearing_journal' as never, { p_run_id: runId, p_actor_id: ctx.actorId });
    if (error) throw error;
    return data as string;
  }

  async postPaymentJournal(ctx: TenantContext, runId: string, paymentDate: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('post_vat_payment_journal' as never, { p_run_id: runId, p_payment_date: paymentDate, p_actor_id: ctx.actorId });
    if (error) throw error;
    return data as string;
  }
}
