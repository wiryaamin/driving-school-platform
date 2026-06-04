import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type { Payment, PaymentMethod, PaymentStatus, PaymentListQueryInput } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

// Stub insert type — payments are created only via record_payment() RPC
type PaymentInsert = Record<string, never>;
type PaymentUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class PaymentRepository extends BaseRepository<Payment, PaymentInsert, PaymentUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'payments');
  }

  override async insert(_ctx: TenantContext, _dto: PaymentInsert): Promise<Payment> {
    throw new InternalError('Payment: use recordViaRpc() — direct insert is not permitted');
  }

  override async softDelete(_ctx: TenantContext, _id: string): Promise<void> {
    throw new InternalError('Payments cannot be soft-deleted — void via recordVoidViaRpc()');
  }

  async recordViaRpc(
    ctx: TenantContext,
    invoiceId: string,
    amount: number,
    method: PaymentMethod,
    reference?: string
  ): Promise<string> {
    const args: Record<string, unknown> = {
      p_invoice_id: invoiceId,
      p_amount:     amount,
      p_method:     method,
      p_actor_id:   ctx.actorId,
    };
    if (reference !== undefined) args['p_reference'] = reference;

    const { data, error } = await this.rpc('record_payment', args);
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async listPayments(
    ctx: TenantContext,
    query: PaymentListQueryInput
  ): Promise<PagedResult<Payment>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('payments')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.invoice_id !== undefined) q = q.eq('invoice_id',      query.invoice_id);
    if (query.student_id !== undefined) q = q.eq('student_id',      query.student_id);
    if (query.status !== undefined && query.status !== 'all') q = q.eq('status', query.status as PaymentStatus);
    if (query.method  !== undefined) q = q.eq('payment_method',     query.method as PaymentMethod);
    if (query.from    !== undefined) q = q.gte('created_at',        query.from);
    if (query.to      !== undefined) q = q.lte('created_at',        query.to);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<Payment>((data ?? []) as Payment[], normalized, count ?? 0);
  }
}
