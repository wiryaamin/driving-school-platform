import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type { PaymentAllocation } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

type AllocationInsert = Record<string, never>;
type AllocationUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class PaymentAllocationRepository extends BaseRepository<PaymentAllocation, AllocationInsert, AllocationUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'payment_allocations');
  }

  override async insert(_ctx: TenantContext, _dto: AllocationInsert): Promise<PaymentAllocation> {
    throw new InternalError('PaymentAllocation: use allocateViaRpc() — direct insert is not permitted');
  }

  async allocateViaRpc(
    ctx:       TenantContext,
    paymentId: string,
    invoiceId: string,
    amount:    number,
    notes?:    string
  ): Promise<string> {
    const args: Record<string, unknown> = {
      p_org_id:      ctx.organizationId,
      p_payment_id:  paymentId,
      p_invoice_id:  invoiceId,
      p_amount:      amount,
      p_actor_id:    ctx.actorId,
    };
    if (notes !== undefined) args['p_notes'] = notes;

    const { data, error } = await this.rpc('allocate_payment', args);
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async listByPayment(ctx: TenantContext, paymentId: string): Promise<PaymentAllocation[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('payment_allocations')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as PaymentAllocation[];
  }

  async listByInvoice(ctx: TenantContext, invoiceId: string): Promise<PaymentAllocation[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('payment_allocations')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as PaymentAllocation[];
  }

  async listAllocations(
    ctx:      TenantContext,
    query:    { payment_id?: string; invoice_id?: string; page?: number; per_page?: number }
  ): Promise<PagedResult<PaymentAllocation>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('payment_allocations')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.payment_id !== undefined) q = q.eq('payment_id', query.payment_id);
    if (query.invoice_id !== undefined) q = q.eq('invoice_id', query.invoice_id);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<PaymentAllocation>((data ?? []) as PaymentAllocation[], normalized, count ?? 0);
  }
}
