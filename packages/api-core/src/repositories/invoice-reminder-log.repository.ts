import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { InvoiceReminderLog } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';

type LogInsert = Record<string, never>;
type LogUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class InvoiceReminderLogRepository extends BaseRepository<InvoiceReminderLog, LogInsert, LogUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'invoice_reminder_log');
  }

  override async insert(_ctx: TenantContext, _dto: LogInsert): Promise<InvoiceReminderLog> {
    throw new InternalError('InvoiceReminderLog: written by process_dunning_tick and advance_dunning_stage — do not insert directly');
  }

  async listByInvoice(ctx: TenantContext, invoiceId: string): Promise<InvoiceReminderLog[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('invoice_reminder_log')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('invoice_id', invoiceId)
      .order('sent_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as InvoiceReminderLog[];
  }

  async listByStudent(ctx: TenantContext, studentId: string): Promise<InvoiceReminderLog[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('invoice_reminder_log')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('student_id', studentId)
      .order('sent_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as InvoiceReminderLog[];
  }
}
