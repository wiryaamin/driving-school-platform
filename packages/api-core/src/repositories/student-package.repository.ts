import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type { StudentPackage, PackageStatus, StudentPackageListQueryInput } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { normalizePagination, buildPagedResult } from '../utils/pagination.js';
import { InternalError } from '../errors/service-errors.js';

// Stub insert/update types — student_packages are created only via purchase_package() RPC
type StudentPackageInsert = Record<string, never>;
type StudentPackageUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class StudentPackageRepository extends BaseRepository<StudentPackage, StudentPackageInsert, StudentPackageUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'student_packages');
  }

  // Direct insert is blocked: use purchaseViaRpc() instead
  override async insert(_ctx: TenantContext, _dto: StudentPackageInsert): Promise<StudentPackage> {
    throw new InternalError('StudentPackage: use purchaseViaRpc() — direct insert is not permitted');
  }

  async purchaseViaRpc(
    ctx: TenantContext,
    studentId: string,
    offeringId: string,
    actorId: string
  ): Promise<string> {
    const { data, error } = await this.rpc('purchase_package', {
      p_org_id:      ctx.organizationId,
      p_student_id:  studentId,
      p_offering_id: offeringId,
      p_actor_id:    actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async listPackages(
    ctx: TenantContext,
    query: StudentPackageListQueryInput
  ): Promise<PagedResult<StudentPackage>> {
    if (ctx.organizationId === null) throw new Error('Organization context required');

    const normalized = normalizePagination(query);
    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('student_packages')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order('purchased_at', { ascending: false })
      .range(from, to);

    if (query.student_id !== undefined) {
      q = q.eq('student_id', query.student_id);
    }
    if (query.status !== undefined && query.status !== 'all') {
      q = q.eq('status', query.status as PackageStatus);
    }

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<StudentPackage>((data ?? []) as StudentPackage[], normalized, count ?? 0);
  }
}
