import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type {
  LessonBooking,
  LessonBookingInsert,
  LessonBookingUpdate,
  LessonBookingListQueryInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { buildPagedResult, normalizePagination } from '../utils/pagination.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class LessonBookingRepository extends BaseRepository<LessonBooking, LessonBookingInsert, LessonBookingUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'lesson_bookings');
  }

  async listBookings(
    ctx: TenantContext,
    query: LessonBookingListQueryInput
  ): Promise<PagedResult<LessonBooking>> {
    if (ctx.organizationId === null) {
      throw new Error('Organization context is required');
    }

    const normalized = normalizePagination({
      sort_by:  query.sort_by ?? 'starts_at',
      sort_dir: query.sort_dir ?? 'desc',
      ...(query.page     !== undefined && { page:     query.page }),
      ...(query.per_page !== undefined && { per_page: query.per_page }),
    });

    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('lesson_bookings')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .is('deleted_at', null)
      .order(normalized.sort_by, { ascending: normalized.sort_dir === 'asc' })
      .range(from, to);

    if (query.student_id    !== undefined) q = q.eq('student_id',    query.student_id);
    if (query.instructor_id !== undefined) q = q.eq('instructor_id', query.instructor_id);
    if (query.slot_id       !== undefined) q = q.eq('slot_id',       query.slot_id);
    if (query.status        !== undefined) q = q.eq('status',        query.status);
    if (query.from          !== undefined) q = q.gte('starts_at',    query.from);
    if (query.to            !== undefined) q = q.lte('starts_at',    query.to);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);

    return buildPagedResult<LessonBooking>((data ?? []) as LessonBooking[], normalized, count ?? 0);
  }

  async findBySlot(ctx: TenantContext, slotId: string): Promise<LessonBooking[]> {
    if (ctx.organizationId === null) throw new Error('Organization context is required');

    const { data, error } = await (this.db as AnyClient)
      .from('lesson_bookings')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('slot_id', slotId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw mapDbError(error as Error);
    return (data ?? []) as LessonBooking[];
  }

  async findByStudent(
    ctx: TenantContext,
    studentId: string,
    options?: { from?: string; to?: string; limit?: number }
  ): Promise<LessonBooking[]> {
    if (ctx.organizationId === null) throw new Error('Organization context is required');

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('lesson_bookings')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .order('starts_at', { ascending: false });

    if (options?.from !== undefined) q = q.gte('starts_at', options.from);
    if (options?.to   !== undefined) q = q.lte('starts_at', options.to);
    if (options?.limit !== undefined) q = q.limit(options.limit);

    const { data, error } = await q;
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as LessonBooking[];
  }

  async checkStudentAvailability(
    _ctx: TenantContext,
    studentId: string,
    startsAt: string,
    endsAt: string,
    excludeBookingId?: string
  ): Promise<boolean> {
    const args: Record<string, unknown> = {
      p_student_id: studentId,
      p_starts_at:  startsAt,
      p_ends_at:    endsAt,
    };
    if (excludeBookingId !== undefined) args['p_exclude_booking_id'] = excludeBookingId;

    const { data, error } = await this.rpc('check_student_booking_availability', args);
    if (error) throw mapDbError(error as Error);
    return data === true;
  }
}
