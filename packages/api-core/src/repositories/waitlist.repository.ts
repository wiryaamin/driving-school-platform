import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { WaitlistEntry, WaitlistEntryInsert, WaitlistEntryUpdate } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class WaitlistRepository extends BaseRepository<
  WaitlistEntry,
  WaitlistEntryInsert,
  WaitlistEntryUpdate
> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'waitlist_entries');
  }

  async listBySlot(
    ctx: TenantContext,
    slotId: string,
    status?: string
  ): Promise<WaitlistEntry[]> {
    if (ctx.organizationId === null) throw new Error('Organization context is required');

    // eslint-disable-next-line prefer-const
    let q = (this.db as AnyClient)
      .from('waitlist_entries')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('slot_id', slotId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (status !== undefined) {
      q = q.eq('status', status);
    }

    const { data, error } = await q;
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as WaitlistEntry[];
  }

  async findActiveByStudentAndSlot(
    ctx: TenantContext,
    studentId: string,
    slotId: string
  ): Promise<WaitlistEntry | null> {
    if (ctx.organizationId === null) throw new Error('Organization context is required');

    const { data, error } = await (this.db as AnyClient)
      .from('waitlist_entries')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('student_id', studentId)
      .eq('slot_id', slotId)
      .eq('status', 'waiting')
      .maybeSingle();

    if (error) throw mapDbError(error as Error);
    return data as WaitlistEntry | null;
  }

  async promoteNext(
    _ctx: TenantContext,
    slotId: string
  ): Promise<string | null> {
    const { data, error } = await this.rpc('promote_waitlist_next', {
      p_slot_id: slotId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string | null;
  }

  async expireStaleReservations(
    _ctx: TenantContext,
    timeoutMinutes?: number
  ): Promise<number> {
    const args: Record<string, unknown> = {};
    if (timeoutMinutes !== undefined) args['p_timeout_minutes'] = timeoutMinutes;

    const { data, error } = await this.rpc('expire_stale_reservations', args);
    if (error) throw mapDbError(error as Error);
    return (data as number) ?? 0;
  }
}
