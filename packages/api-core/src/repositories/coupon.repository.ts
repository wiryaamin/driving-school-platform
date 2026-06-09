import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type { CouponCode, CouponCodeInsert } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

type CouponUpdate = Partial<Pick<CouponCode, 'is_active' | 'redemption_limit_total' | 'redemption_limit_per_student' | 'valid_to' | 'description'>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class CouponRepository extends BaseRepository<CouponCode, CouponCodeInsert, CouponUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'coupon_codes');
  }

  async findByCode(ctx: TenantContext, code: string): Promise<CouponCode | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('coupon_codes')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('code', code.toUpperCase())
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as CouponCode | null;
  }

  override async findById(ctx: TenantContext, id: string): Promise<CouponCode | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('coupon_codes')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as CouponCode | null;
  }

  async listCoupons(
    ctx:   TenantContext,
    query: { discount_id?: string; is_active?: boolean; page?: number; per_page?: number }
  ): Promise<PagedResult<CouponCode>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('coupon_codes')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.discount_id !== undefined) q = q.eq('discount_id', query.discount_id);
    if (query.is_active   !== undefined) q = q.eq('is_active',   query.is_active);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<CouponCode>((data ?? []) as CouponCode[], normalized, count ?? 0);
  }

  async redeemViaRpc(
    ctx:        TenantContext,
    invoiceId:  string,
    couponCode: string,
    studentId:  string
  ): Promise<string> {
    const { data, error } = await this.rpc('redeem_coupon', {
      p_org_id:      ctx.organizationId,
      p_invoice_id:  invoiceId,
      p_coupon_code: couponCode,
      p_student_id:  studentId,
      p_actor_id:    ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }
}
