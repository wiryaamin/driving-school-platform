import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type {
  Notification,
  NotificationInsert,
  NotificationUpdate,
  NotificationListQueryInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { buildPagedResult, normalizePagination } from '../utils/pagination.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class NotificationRepository extends BaseRepository<
  Notification,
  NotificationInsert,
  NotificationUpdate
> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'notifications');
  }

  async listNotifications(
    ctx: TenantContext,
    query: NotificationListQueryInput
  ): Promise<PagedResult<Notification>> {
    if (ctx.organizationId === null) {
      throw new Error('Organization context is required');
    }

    const normalized = normalizePagination({
      sort_by:  query.sort_by ?? 'created_at',
      sort_dir: query.sort_dir ?? 'desc',
      ...(query.page     !== undefined && { page:     query.page }),
      ...(query.per_page !== undefined && { per_page: query.per_page }),
    });

    const rangeFrom = (normalized.page - 1) * normalized.per_page;
    const rangeTo   = rangeFrom + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order(normalized.sort_by, { ascending: normalized.sort_dir === 'asc' })
      .range(rangeFrom, rangeTo);

    if (query.recipient_id !== undefined) q = q.eq('recipient_id', query.recipient_id);
    if (query.channel      !== undefined) q = q.eq('channel',      query.channel);
    if (query.status       !== undefined) q = q.eq('status',       query.status);
    if (query.template_key !== undefined) q = q.eq('template_key', query.template_key);
    if (query.from         !== undefined) q = q.gte('created_at',  query.from);
    if (query.to           !== undefined) q = q.lte('created_at',  query.to);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);
    return buildPagedResult<Notification>((data ?? []) as Notification[], normalized, count ?? 0);
  }

  async findByIdempotencyKey(
    _ctx: TenantContext,
    key: string
  ): Promise<Notification | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('notifications')
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (error) throw mapDbError(error as Error);
    return data as Notification | null;
  }
}
