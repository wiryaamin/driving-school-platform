import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { DiscountApplication } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';

type ApplicationInsert = Record<string, never>;
type ApplicationUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class DiscountApplicationRepository extends BaseRepository<DiscountApplication, ApplicationInsert, ApplicationUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'discount_applications');
  }

  override async insert(_ctx: TenantContext, _dto: ApplicationInsert): Promise<DiscountApplication> {
    throw new InternalError('DiscountApplication: use applyViaRpc() or redeemCouponViaRpc() — direct insert not permitted');
  }

  async listByInvoice(ctx: TenantContext, invoiceId: string): Promise<DiscountApplication[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('discount_applications')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('invoice_id', invoiceId)
      .order('applied_at', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as DiscountApplication[];
  }

  async listByStudent(ctx: TenantContext, studentId: string): Promise<DiscountApplication[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('discount_applications')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('student_id', studentId)
      .order('applied_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as DiscountApplication[];
  }
}
