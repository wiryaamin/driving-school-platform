import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type { PackageOffering, PackageOfferingInsert, PackageOfferingUpdate, LessonCategory, PackageStatus, PackageOfferingListQueryInput } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class PackageOfferingRepository extends BaseRepository<PackageOffering, PackageOfferingInsert, PackageOfferingUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'package_offerings');
  }

  async listOfferings(
    ctx: TenantContext,
    query: PackageOfferingListQueryInput
  ): Promise<PagedResult<PackageOffering>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('package_offerings')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order(query.sort_by ?? 'sort_order', { ascending: (query.sort_dir ?? 'asc') === 'asc' })
      .range(from, to);

    if (query.status !== undefined && query.status !== 'all') {
      q = q.eq('status', query.status as PackageStatus);
    }
    if (query.lesson_category !== undefined) {
      q = q.eq('lesson_category', query.lesson_category as LessonCategory);
    }

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<PackageOffering>((data ?? []) as PackageOffering[], normalized, count ?? 0);
  }

  async archiveOffering(ctx: TenantContext, offeringId: string, actorId: string): Promise<PackageOffering> {
    return this.update(ctx, offeringId, {
      status:      'archived',
      archived_at: new Date().toISOString(),
      archived_by: actorId,
    } as PackageOfferingUpdate);
  }
}
