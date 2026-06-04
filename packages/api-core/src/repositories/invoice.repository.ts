import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type { Invoice, InvoiceInsert, InvoiceUpdate, InvoiceLineItem, InvoiceLineItemInsert, InvoiceLineItemUpdate, InvoiceListQueryInput } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class InvoiceRepository extends BaseRepository<Invoice, InvoiceInsert, InvoiceUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'invoices');
  }

  // No soft delete: use voidViaRpc() instead
  override async softDelete(_ctx: TenantContext, _id: string): Promise<void> {
    throw new InternalError('Invoices cannot be soft-deleted — use void_invoice() RPC');
  }

  async listInvoices(
    ctx: TenantContext,
    query: InvoiceListQueryInput
  ): Promise<PagedResult<Invoice>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order(query.sort_by ?? 'created_at', { ascending: (query.sort_dir ?? 'desc') === 'asc' })
      .range(from, to);

    if (query.student_id !== undefined) q = q.eq('student_id',  query.student_id);
    if (query.status !== undefined && query.status !== 'all') q = q.eq('status', query.status);
    if (query.from    !== undefined) q = q.gte('created_at', query.from);
    if (query.to      !== undefined) q = q.lte('created_at', query.to);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<Invoice>((data ?? []) as Invoice[], normalized, count ?? 0);
  }

  async issueViaRpc(ctx: TenantContext, invoiceId: string): Promise<string> {
    const { data, error } = await this.rpc('issue_invoice', {
      p_invoice_id: invoiceId,
      p_actor_id:   ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async voidViaRpc(ctx: TenantContext, invoiceId: string, reason?: string): Promise<string> {
    const { data, error } = await this.rpc('void_invoice', {
      p_invoice_id: invoiceId,
      p_actor_id:   ctx.actorId,
      ...(reason !== undefined && { p_reason: reason }),
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  // ─── Line item helpers ──────────────────────────────────────────────────────

  async listLineItems(ctx: TenantContext, invoiceId: string): Promise<InvoiceLineItem[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const { data, error } = await (this.db as AnyClient)
      .from('invoice_line_items')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true });

    if (error) throw mapDbError(error as Error);
    return (data ?? []) as InvoiceLineItem[];
  }

  async addLineItem(ctx: TenantContext, dto: InvoiceLineItemInsert): Promise<InvoiceLineItem> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const { data, error } = await (this.db as AnyClient)
      .from('invoice_line_items')
      .insert({ ...dto, organization_id: ctx.organizationId })
      .select()
      .single();

    if (error) throw mapDbError(error as Error);
    return data as InvoiceLineItem;
  }

  async updateLineItem(
    ctx: TenantContext,
    lineItemId: string,
    dto: InvoiceLineItemUpdate
  ): Promise<InvoiceLineItem> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const { data, error } = await (this.db as AnyClient)
      .from('invoice_line_items')
      .update(dto)
      .eq('id', lineItemId)
      .eq('organization_id', ctx.organizationId)
      .select()
      .single();

    if (error) throw mapDbError(error as Error);
    return data as InvoiceLineItem;
  }

  async deleteLineItem(ctx: TenantContext, lineItemId: string): Promise<void> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const { error } = await (this.db as AnyClient)
      .from('invoice_line_items')
      .delete()
      .eq('id', lineItemId)
      .eq('organization_id', ctx.organizationId);

    if (error) throw mapDbError(error as Error);
  }
}
