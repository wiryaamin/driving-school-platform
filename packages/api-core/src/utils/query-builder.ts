import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaginationParams } from '@platform/types';
import { normalizePagination, paginationToRange } from './pagination.js';

export interface ListQueryOptions extends PaginationParams {
  search?: string;
  searchColumns?: string[];
  filters?: Record<string, string | number | boolean | null>;
}

/**
 * Applies sort, pagination range, column filters, and optional ILIKE search
 * to any Supabase PostgrestFilterBuilder. The `query` parameter must already
 * have .from().select() called; this function chains the rest.
 *
 * Uses `unknown` casts because the Supabase query builder's generic chain
 * types are complex and vary per table — individual repositories handle
 * table-specific typing. Runtime behaviour is correct.
 */
export function applyListQuery<T>(query: T, options: ListQueryOptions): T {
  const normalized = normalizePagination(options);
  const { from, to } = paginationToRange(normalized);

  let q = query as unknown as {
    order: (col: string, opts: { ascending: boolean }) => unknown;
    range: (from: number, to: number) => unknown;
    eq: (col: string, val: unknown) => unknown;
    or: (cond: string) => unknown;
  };

  q = q.order(normalized.sort_by, { ascending: normalized.sort_dir === 'asc' }) as typeof q;
  q = q.range(from, to) as typeof q;

  if (options.filters !== undefined) {
    for (const [column, value] of Object.entries(options.filters)) {
      if (value !== undefined && value !== null && value !== '') {
        q = q.eq(column, value) as typeof q;
      }
    }
  }

  if (options.search !== undefined && options.search !== '' && options.searchColumns !== undefined && options.searchColumns.length > 0) {
    const term = `%${options.search}%`;
    const conditions = options.searchColumns.map(col => `${col}.ilike.${term}`).join(',');
    q = q.or(conditions) as typeof q;
  }

  return q as unknown as T;
}

export type TableName = keyof Database['public']['Tables'];

/**
 * Creates a base org-scoped query on any soft-deleteable table.
 * Always apply before additional filters to guarantee tenant isolation.
 */
export function buildOrgScope(
  db: SupabaseClient<Database>,
  table: TableName,
  organizationId: string
) {
  return db
    .from(table)
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);
}
