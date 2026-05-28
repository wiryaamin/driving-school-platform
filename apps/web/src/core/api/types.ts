/**
 * API layer types — shared interfaces for all service modules.
 * These complement @platform/types with app-layer specifics.
 */

export interface ServiceListParams {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  search?: string;
}

export interface ServiceListResult<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

/**
 * Compute Supabase range parameters from page/per_page.
 */
export function toRange(page = 1, perPage = 25): { from: number; to: number } {
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  return { from, to };
}
