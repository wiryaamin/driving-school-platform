import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { LessonReminder } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

type LessonReminderInsert = {
  booking_id:       string;
  recipient_id:     string;
  recipient_type?:  string;
  reminder_type:    string;
  offset_minutes:   number;
  scheduled_for:    string;
  idempotency_key:  string;
};

type LessonReminderUpdate = Partial<{
  status:          string;
  notification_id: string | null;
}>;

export class LessonReminderRepository extends BaseRepository<
  LessonReminder,
  LessonReminderInsert,
  LessonReminderUpdate
> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'lesson_reminders');
  }

  async findByBooking(
    ctx: TenantContext,
    bookingId: string
  ): Promise<LessonReminder[]> {
    if (ctx.organizationId === null) throw new Error('Organization context is required');

    const { data, error } = await (this.db as AnyClient)
      .from('lesson_reminders')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('booking_id', bookingId)
      .order('scheduled_for', { ascending: true });

    if (error) throw mapDbError(error as Error);
    return (data ?? []) as LessonReminder[];
  }

  async scheduleForBooking(
    _ctx: TenantContext,
    bookingId: string
  ): Promise<number> {
    const { data, error } = await this.rpc('schedule_lesson_reminders', {
      p_booking_id: bookingId,
    });
    if (error) throw mapDbError(error as Error);
    return (data as number) ?? 0;
  }

  async cancelForBooking(
    _ctx: TenantContext,
    bookingId: string
  ): Promise<number> {
    const { data, error } = await this.rpc('cancel_lesson_reminders', {
      p_booking_id: bookingId,
    });
    if (error) throw mapDbError(error as Error);
    return (data as number) ?? 0;
  }
}
