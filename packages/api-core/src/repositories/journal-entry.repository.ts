import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  JournalEntry,
  JournalEntryInsert,
  JournalLine,
  JournalEntryTypeEnum,
  JournalEntryStatusEnum,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { NotFoundError, InternalError } from '../errors/service-errors.js';

type JournalEntryUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class JournalEntryRepository extends BaseRepository<JournalEntry, JournalEntryInsert, JournalEntryUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'journal_entries');
  }

  override async insert(_ctx: TenantContext, _dto: JournalEntryInsert): Promise<JournalEntry> {
    throw new InternalError('JournalEntry: use postViaRpc() — direct insert is not permitted');
  }

  // Override: journal_entries has no deleted_at column
  override async findById(ctx: TenantContext, id: string): Promise<JournalEntry | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('journal_entries')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as JournalEntry | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<JournalEntry> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('JournalEntry', id);
    return row;
  }

  async findByPeriod(
    ctx: TenantContext,
    periodId:   string,
    entryType?: JournalEntryTypeEnum,
    status?:    JournalEntryStatusEnum,
  ): Promise<JournalEntry[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    let q = (this.db as AnyClient)
      .from('journal_entries')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .order('voucher_series', { ascending: true })
      .order('voucher_number', { ascending: true });

    if (entryType) q = q.eq('entry_type', entryType);
    if (status)    q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as JournalEntry[];
  }

  async findBySourceEntity(
    ctx: TenantContext,
    entityType: string,
    entityId:   string,
  ): Promise<JournalEntry[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('journal_entries')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('source_entity_type', entityType)
      .eq('source_entity_id', entityId)
      .order('posted_at', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as JournalEntry[];
  }

  async findReversalOf(ctx: TenantContext, entryId: string): Promise<JournalEntry | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('journal_entries')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('reversal_of_entry_id', entryId)
      .eq('status', 'posted')
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as JournalEntry | null;
  }

  async getLinesForEntry(ctx: TenantContext, entryId: string): Promise<JournalLine[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('journal_lines')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('entry_id', entryId)
      .order('line_number', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as JournalLine[];
  }

  // ── RPC wrappers ─────────────────────────────────────────────────────────────

  async postInvoiceEntryViaRpc(ctx: TenantContext, invoiceId: string): Promise<string> {
    const { data, error } = await this.rpc('post_invoice_journal_entry', {
      p_invoice_id: invoiceId,
      p_actor_id:   ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async postPaymentEntryViaRpc(ctx: TenantContext, paymentId: string): Promise<string> {
    const { data, error } = await this.rpc('post_payment_journal_entry', {
      p_payment_id: paymentId,
      p_actor_id:   ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async postVoidEntryViaRpc(ctx: TenantContext, invoiceId: string): Promise<string> {
    const { data, error } = await this.rpc('post_void_journal_entry', {
      p_invoice_id: invoiceId,
      p_actor_id:   ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async reverseEntryViaRpc(
    ctx:           TenantContext,
    entryId:       string,
    reversalDate?: string,
    reason?:       string,
  ): Promise<string> {
    const { data, error } = await this.rpc('reverse_journal_entry', {
      p_entry_id:       entryId,
      p_reversal_date:  reversalDate ?? null,
      p_reason:         reason ?? null,
      p_actor_id:       ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async correctEntryViaRpc(
    ctx:             TenantContext,
    entryId:         string,
    newLines:        unknown[],
    reason?:         string,
    correctionDate?: string,
  ): Promise<string> {
    const { data, error } = await this.rpc('correct_journal_entry', {
      p_entry_id:         entryId,
      p_new_lines:        newLines,
      p_reason:           reason ?? null,
      p_correction_date:  correctionDate ?? null,
      p_actor_id:         ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async generateSie4ViaRpc(ctx: TenantContext, periodId: string): Promise<string> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await this.rpc('generate_sie4_from_ledger', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_actor_id:  ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }
}
