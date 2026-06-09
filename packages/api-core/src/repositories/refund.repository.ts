import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type { Refund, RefundType, RefundReasonCode, RefundListQueryInput } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

type RefundInsert = Record<string, never>;
type RefundUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class RefundRepository extends BaseRepository<Refund, RefundInsert, RefundUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'refunds');
  }

  override async insert(_ctx: TenantContext, _dto: RefundInsert): Promise<Refund> {
    throw new InternalError('Refund: use processViaRpc() — direct insert is not permitted');
  }

  async processViaRpc(
    ctx: TenantContext,
    invoiceId:       string,
    refundType:      RefundType,
    reasonCode:      RefundReasonCode,
    refundAmount:    number,
    creditQty:       number,
    creditCategory?: string,
    grantEntryId?:   string,
    paymentId?:      string,
    notes?:          string
  ): Promise<string> {
    const args: Record<string, unknown> = {
      p_org_id:          ctx.organizationId,
      p_invoice_id:      invoiceId,
      p_refund_type:     refundType,
      p_reason_code:     reasonCode,
      p_refund_amount:   refundAmount,
      p_credit_qty:      creditQty,
      p_actor_id:        ctx.actorId,
    };
    if (creditCategory !== undefined) args['p_credit_category'] = creditCategory;
    if (grantEntryId   !== undefined) args['p_grant_entry_id']  = grantEntryId;
    if (paymentId      !== undefined) args['p_payment_id']       = paymentId;
    if (notes          !== undefined) args['p_notes']            = notes;

    const { data, error } = await this.rpc('process_refund', args);
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  override async findById(ctx: TenantContext, id: string): Promise<Refund | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('refunds')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as Refund | null;
  }

  async listRefunds(ctx: TenantContext, query: RefundListQueryInput): Promise<PagedResult<Refund>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('refunds')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.invoice_id !== undefined) q = q.eq('invoice_id', query.invoice_id);
    if (query.student_id !== undefined) q = q.eq('student_id', query.student_id);
    if (query.status !== undefined && query.status !== 'all') q = q.eq('refund_status', query.status);
    if (query.from   !== undefined) q = q.gte('created_at', query.from);
    if (query.to     !== undefined) q = q.lte('created_at', query.to);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<Refund>((data ?? []) as Refund[], normalized, count ?? 0);
  }
}
