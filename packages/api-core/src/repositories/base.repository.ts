import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { ListQueryOptions, TableName } from '../utils/query-builder.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { NotFoundError } from '../errors/service-errors.js';
import { applyListQuery, buildOrgScope } from '../utils/query-builder.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * BaseRepository — org-scoped, soft-delete-aware foundation for all repositories.
 *
 * Type parameters:
 *   TRow    — the Row type from Database['public']['Tables'][T]
 *   TInsert — fields accepted on create (organization_id excluded — injected automatically)
 *   TUpdate — fields accepted on update (defaults to Partial<TInsert>)
 *
 * INVARIANTS:
 *   - Every read filters by organization_id AND deleted_at IS NULL (for org-scoped ops)
 *   - organization_id is injected on insert — callers must not include it in TInsert dtos
 *   - All mutations return the updated row via .select().single()
 *   - Complex / atomic operations are delegated to SECURITY DEFINER RPCs
 *   - RPC calls use `(this.db as AnyClient).rpc(...)` because Supabase's typed rpc()
 *     overload doesn't resolve correctly with custom Database types under
 *     exactOptionalPropertyTypes:true — runtime behaviour is identical and correct
 */
export abstract class BaseRepository<
  TRow extends { id: string },
  TInsert extends object,
  TUpdate extends object = Partial<TInsert>
> {
  constructor(
    protected readonly db: SupabaseClient<Database>,
    protected readonly table: TableName
  ) {}

  // Typed RPC helper — bypasses the Supabase generic type constraint issue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected rpc(fn: string, args: Record<string, unknown>): ReturnType<AnyClient['rpc']> {
    return (this.db as AnyClient).rpc(fn, args);
  }

  async findById(ctx: TenantContext, id: string): Promise<TRow | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.db as AnyClient)
      .from(this.table)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null);

    if (ctx.organizationId !== null) {
      query = query.eq('organization_id', ctx.organizationId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw mapDbError(error as Error);
    return data as TRow | null;
  }

  async findByIdOrThrow(ctx: TenantContext, id: string): Promise<TRow> {
    const row = await this.findById(ctx, id);
    if (row === null) throw new NotFoundError(String(this.table), id);
    return row;
  }

  async list(ctx: TenantContext, options: ListQueryOptions = {}): Promise<PagedResult<TRow>> {
    if (ctx.organizationId === null) {
      throw new Error('Organization context is required for list operations');
    }
    const normalized = normalizePagination(options);
    const base = buildOrgScope(this.db, this.table, ctx.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, count } = await applyListQuery(base as any, options);

    if (error) throw mapDbError(error as Error);
    return buildPagedResult<TRow>((data ?? []) as TRow[], normalized, count ?? 0);
  }

  async insert(ctx: TenantContext, dto: TInsert): Promise<TRow> {
    if (ctx.organizationId === null) {
      throw new Error('Organization context is required for insert operations');
    }
    const { data, error } = await (this.db as AnyClient)
      .from(this.table)
      .insert({ ...dto, organization_id: ctx.organizationId })
      .select()
      .single();

    if (error) throw mapDbError(error as Error);
    return data as TRow;
  }

  async update(ctx: TenantContext, id: string, dto: TUpdate): Promise<TRow> {
    if (ctx.organizationId === null) {
      throw new Error('Organization context is required for update operations');
    }
    const { data, error } = await (this.db as AnyClient)
      .from(this.table)
      .update(dto)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) throw mapDbError(error as Error);
    if (data === null) throw new NotFoundError(String(this.table), id);
    return data as TRow;
  }

  async softDelete(_ctx: TenantContext, id: string): Promise<void> {
    const { error } = await this.rpc('soft_delete', {
      p_table_name: String(this.table),
      p_record_id: id,
    });
    if (error) throw mapDbError(error as Error);
  }

  async softRestore(ctx: TenantContext, id: string): Promise<void> {
    const args: Record<string, unknown> = {
      p_table_name: String(this.table),
      p_record_id: id,
    };
    if (ctx.organizationId !== null) {
      args['p_org_id'] = ctx.organizationId;
    }
    const { error } = await this.rpc('soft_restore', args);
    if (error) throw mapDbError(error as Error);
  }

  async exists(ctx: TenantContext, id: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.db as AnyClient)
      .from(this.table)
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
      .is('deleted_at', null);

    if (ctx.organizationId !== null) {
      query = query.eq('organization_id', ctx.organizationId);
    }

    const { count, error } = await query;
    if (error) throw mapDbError(error as Error);
    return (count ?? 0) > 0;
  }

  async count(
    ctx: TenantContext,
    filters: Record<string, string | number | boolean | null> = {}
  ): Promise<number> {
    if (ctx.organizationId === null) return 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.db as AnyClient)
      .from(this.table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .is('deleted_at', null);

    for (const [col, val] of Object.entries(filters)) {
      if (val !== null) {
        query = query.eq(col, val);
      }
    }

    const { count, error } = await query;
    if (error) throw mapDbError(error as Error);
    return count ?? 0;
  }
}
