import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PagedResult } from '@platform/types';
import type {
  LessonSlot,
  LessonSlotInsert,
  LessonSlotUpdate,
  LessonSlotListQueryInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { buildPagedResult, normalizePagination } from '../utils/pagination.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class LessonSlotRepository extends BaseRepository<LessonSlot, LessonSlotInsert, LessonSlotUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'lesson_slots');
  }

  async listSlots(
    ctx: TenantContext,
    query: LessonSlotListQueryInput
  ): Promise<PagedResult<LessonSlot>> {
    if (ctx.organizationId === null) {
      throw new Error('Organization context is required');
    }

    const normalized = normalizePagination({
      sort_by:  query.sort_by ?? 'starts_at',
      sort_dir: query.sort_dir ?? 'asc',
      ...(query.page     !== undefined && { page:     query.page }),
      ...(query.per_page !== undefined && { per_page: query.per_page }),
    });

    const from = (normalized.page - 1) * normalized.per_page;
    const to   = from + normalized.per_page - 1;

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('lesson_slots')
      .select('*', { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .is('deleted_at', null)
      .order(normalized.sort_by, { ascending: normalized.sort_dir === 'asc' })
      .range(from, to);

    if (query.instructor_id !== undefined)  q = q.eq('instructor_id', query.instructor_id);
    if (query.vehicle_id    !== undefined)  q = q.eq('vehicle_id',    query.vehicle_id);
    if (query.location_id   !== undefined)  q = q.eq('location_id',   query.location_id);
    if (query.lesson_type_id !== undefined) q = q.eq('lesson_type_id', query.lesson_type_id);
    if (query.status        !== undefined)  q = q.eq('status',        query.status);
    if (query.from          !== undefined)  q = q.gte('starts_at',    query.from);
    if (query.to            !== undefined)  q = q.lte('starts_at',    query.to);

    const { data, error, count } = await q;
    if (error) throw mapDbError(error as Error);

    return buildPagedResult<LessonSlot>((data ?? []) as LessonSlot[], normalized, count ?? 0);
  }

  async checkInstructorAvailability(
    _ctx: TenantContext,
    instructorId: string,
    startsAt: string,
    endsAt: string,
    excludeSlotId?: string
  ): Promise<boolean> {
    const args: Record<string, unknown> = {
      p_instructor_id: instructorId,
      p_starts_at:     startsAt,
      p_ends_at:       endsAt,
    };
    if (excludeSlotId !== undefined) args['p_exclude_slot_id'] = excludeSlotId;

    const { data, error } = await this.rpc('check_instructor_availability', args);
    if (error) throw mapDbError(error as Error);
    return data === true;
  }

  async checkVehicleAvailability(
    _ctx: TenantContext,
    vehicleId: string,
    startsAt: string,
    endsAt: string,
    excludeSlotId?: string
  ): Promise<boolean> {
    const args: Record<string, unknown> = {
      p_vehicle_id: vehicleId,
      p_starts_at:  startsAt,
      p_ends_at:    endsAt,
    };
    if (excludeSlotId !== undefined) args['p_exclude_slot_id'] = excludeSlotId;

    const { data, error } = await this.rpc('check_vehicle_availability', args);
    if (error) throw mapDbError(error as Error);
    return data === true;
  }

  async findByInstructor(
    ctx: TenantContext,
    instructorId: string,
    from?: string,
    to?: string
  ): Promise<LessonSlot[]> {
    if (ctx.organizationId === null) throw new Error('Organization context is required');

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('lesson_slots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('instructor_id', instructorId)
      .is('deleted_at', null)
      .order('starts_at', { ascending: true });

    if (from !== undefined) q = q.gte('starts_at', from);
    if (to   !== undefined) q = q.lte('starts_at', to);

    const { data, error } = await q;
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as LessonSlot[];
  }
}
