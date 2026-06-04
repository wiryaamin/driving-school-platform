import type { PaginationMeta, PagedResult, PaginationParams } from '@platform/types';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 100;

export type NormalizedPagination = Required<PaginationParams>;

export function normalizePagination(params: PaginationParams = {}): NormalizedPagination {
  return {
    page:     Math.max(1, params.page ?? DEFAULT_PAGE),
    per_page: Math.min(MAX_PER_PAGE, Math.max(1, params.per_page ?? DEFAULT_PER_PAGE)),
    sort_by:  params.sort_by ?? 'created_at',
    sort_dir: params.sort_dir ?? 'desc',
  };
}

export function buildPaginationMeta(
  params: NormalizedPagination,
  total: number
): PaginationMeta {
  return {
    total,
    page:     params.page,
    per_page: params.per_page,
    has_more: params.page * params.per_page < total,
  };
}

/**
 * Convert 1-based page + per_page into a Supabase range() call's from/to.
 * Supabase range() is inclusive on both ends.
 */
export function paginationToRange(params: NormalizedPagination): { from: number; to: number } {
  const from = (params.page - 1) * params.per_page;
  return { from, to: from + params.per_page - 1 };
}

export function buildPagedResult<T>(
  items: T[],
  params: NormalizedPagination,
  total: number
): PagedResult<T> {
  return {
    data: items,
    meta: buildPaginationMeta(params, total),
  };
}
