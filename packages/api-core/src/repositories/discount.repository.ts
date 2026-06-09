import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type { DiscountDefinition, DiscountDefinitionInsert, DiscountListQueryInput } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

type DiscountUpdate = Partial<DiscountDefinitionInsert>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class DiscountRepository extends BaseRepository<DiscountDefinition, DiscountDefinitionInsert, DiscountUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'discount_definitions');
  }

  override async findById(ctx: TenantContext, id: string): Promise<DiscountDefinition | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('discount_definitions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as DiscountDefinition | null;
  }

  async listDiscounts(ctx: TenantContext, query: DiscountListQueryInput): Promise<PagedResult<DiscountDefinition>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('discount_definitions')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.is_active     !== undefined) q = q.eq('is_active',       query.is_active);
    if (query.discount_type !== undefined) q = q.eq('discount_type',   query.discount_type);
    if (query.discount_scope !== undefined) q = q.eq('discount_scope', query.discount_scope);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<DiscountDefinition>((data ?? []) as DiscountDefinition[], normalized, count ?? 0);
  }

  async applyViaRpc(
    ctx:        TenantContext,
    invoiceId:  string,
    discountId: string
  ): Promise<string> {
    const { data, error } = await this.rpc('apply_discount', {
      p_org_id:      ctx.organizationId,
      p_invoice_id:  invoiceId,
      p_discount_id: discountId,
      p_actor_id:    ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async deactivate(ctx: TenantContext, id: string): Promise<void> {
    if (ctx.organizationId === null) throw new InternalError('Organization context required');
    const { error } = await (this.db as AnyClient)
      .from('discount_definitions')
      .update({ is_active: false, updated_by: ctx.actorId })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);
    if (error) throw mapDbError(error as Error);
  }
}
