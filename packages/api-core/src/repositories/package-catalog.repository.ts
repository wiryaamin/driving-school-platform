import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { PackageCatalog, PackageCatalogInsert, PackageCatalogUpdate, LessonCategory } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class PackageCatalogRepository extends BaseRepository<PackageCatalog, PackageCatalogInsert, PackageCatalogUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'package_catalog');
  }

  async listActive(
    ctx: TenantContext,
    lessonCategory?: LessonCategory
  ): Promise<PackageCatalog[]> {
    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('package_catalog')
      .select('*')
      .eq('is_active', true)
      .or(`organization_id.is.null,organization_id.eq.${ctx.organizationId ?? ''}`)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (lessonCategory !== undefined) {
      q = q.eq('lesson_category', lessonCategory);
    }

    const { data, error } = await q;
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as PackageCatalog[];
  }
}
