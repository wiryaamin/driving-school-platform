import type {
  AgingBucket,
  VatSummaryRow,
  RevenueByPeriod,
  WalletLiabilityRow,
  FinanceDashboardSnapshot,
  OverdueInvoiceSummaryRow,
  VatLiabilitySummaryRow,
  PaymentReconciliationSummaryRow,
  RefundMetricsSummaryRow,
  FinanceInvoiceAgingRow,
  FinancePaymentAllocationRow,
  FinanceRefundSummaryRow,
  FinanceVatSummaryRow,
  FinanceRevenueSummaryRow,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class ReportingService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // ─── Phase 4B aggregated RPCs (existing) ─────────────────────────────────

  async getAgingReport(ctx: TenantContext): Promise<AgingBucket[]> {
    assertPermission(ctx, 'finance:report:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('get_aging_report', {
      p_org_id: ctx.organizationId,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as AgingBucket[];
  }

  async getVatSummary(ctx: TenantContext, fromDate: string, toDate: string): Promise<VatSummaryRow[]> {
    assertPermission(ctx, 'finance:report:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('get_vat_summary', {
      p_org_id:    ctx.organizationId,
      p_from_date: fromDate,
      p_to_date:   toDate,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as VatSummaryRow[];
  }

  async getRevenueByPeriod(ctx: TenantContext): Promise<RevenueByPeriod[]> {
    assertPermission(ctx, 'finance:report:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('v_revenue_by_period')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('period_start', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as RevenueByPeriod[];
  }

  async getWalletLiability(ctx: TenantContext): Promise<WalletLiabilityRow[]> {
    assertPermission(ctx, 'finance:report:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('v_wallet_liability')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('lesson_category');
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as WalletLiabilityRow[];
  }

  async getOutstandingInvoices(ctx: TenantContext): Promise<unknown[]> {
    assertPermission(ctx, 'finance:invoice:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('v_outstanding_invoices')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('days_overdue', { ascending: false, nullsFirst: false });
    if (error) throw mapDbError(error as Error);
    return data ?? [];
  }

  // ─── Phase 4B.7 dashboard RPC ─────────────────────────────────────────────

  async getFinanceDashboardSnapshot(ctx: TenantContext): Promise<FinanceDashboardSnapshot> {
    assertPermission(ctx, 'finance:report:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('finance_dashboard_snapshot', {
      p_org_id: ctx.organizationId,
    });
    if (error) throw mapDbError(error as Error);
    return data as FinanceDashboardSnapshot;
  }

  async getOverdueInvoiceSummary(ctx: TenantContext): Promise<OverdueInvoiceSummaryRow[]> {
    assertPermission(ctx, 'finance:report:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('overdue_invoice_summary', {
      p_org_id: ctx.organizationId,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as OverdueInvoiceSummaryRow[];
  }

  async getVatLiabilitySummary(
    ctx:      TenantContext,
    fromDate: string,
    toDate:   string
  ): Promise<VatLiabilitySummaryRow[]> {
    assertPermission(ctx, 'finance:report:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('vat_liability_summary', {
      p_org_id:    ctx.organizationId,
      p_from_date: fromDate,
      p_to_date:   toDate,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as VatLiabilitySummaryRow[];
  }

  async getPaymentReconciliationSummary(ctx: TenantContext): Promise<PaymentReconciliationSummaryRow[]> {
    assertPermission(ctx, 'finance:report:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('payment_reconciliation_summary', {
      p_org_id: ctx.organizationId,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as PaymentReconciliationSummaryRow[];
  }

  async getRefundMetricsSummary(
    ctx:      TenantContext,
    fromDate: string,
    toDate:   string
  ): Promise<RefundMetricsSummaryRow[]> {
    assertPermission(ctx, 'finance:report:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('refund_metrics_summary', {
      p_org_id:    ctx.organizationId,
      p_from_date: fromDate,
      p_to_date:   toDate,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as RefundMetricsSummaryRow[];
  }

  // ─── Phase 4B.7 operational reporting views ───────────────────────────────

  async getFinanceInvoiceAging(ctx: TenantContext): Promise<FinanceInvoiceAgingRow[]> {
    assertPermission(ctx, 'finance:invoice:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('finance_invoice_aging_v')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('days_overdue', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FinanceInvoiceAgingRow[];
  }

  async getFinancePaymentAllocations(ctx: TenantContext): Promise<FinancePaymentAllocationRow[]> {
    assertPermission(ctx, 'finance:payment:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('finance_payment_allocations_v')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('allocated_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FinancePaymentAllocationRow[];
  }

  async getFinanceRefundSummary(ctx: TenantContext): Promise<FinanceRefundSummaryRow[]> {
    assertPermission(ctx, 'finance:refund:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('finance_refund_summary_v')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FinanceRefundSummaryRow[];
  }

  async getFinanceVatSummary(ctx: TenantContext): Promise<FinanceVatSummaryRow[]> {
    assertPermission(ctx, 'finance:invoice:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('finance_vat_summary_v')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('issued_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FinanceVatSummaryRow[];
  }

  async getFinanceRevenueSummary(ctx: TenantContext): Promise<FinanceRevenueSummaryRow[]> {
    assertPermission(ctx, 'finance:payment:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('finance_revenue_summary_v')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('payment_confirmed_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FinanceRevenueSummaryRow[];
  }
}
