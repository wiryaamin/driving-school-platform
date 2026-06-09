import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { InvoiceDunningState } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';

type StateInsert = Record<string, never>;
type StateUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class InvoiceDunningStateRepository extends BaseRepository<InvoiceDunningState, StateInsert, StateUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'invoice_dunning_state');
  }

  override async insert(_ctx: TenantContext, _dto: StateInsert): Promise<InvoiceDunningState> {
    throw new InternalError('InvoiceDunningState: managed by process_dunning_tick — do not insert directly');
  }

  async findByInvoice(ctx: TenantContext, invoiceId: string): Promise<InvoiceDunningState | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('invoice_dunning_state')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('invoice_id', invoiceId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as InvoiceDunningState | null;
  }

  async listActive(
    ctx:   TenantContext,
    query: { page?: number; per_page?: number }
  ): Promise<InvoiceDunningState[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const perPage = query.per_page ?? 50;
    const page    = query.page    ?? 1;
    const from    = (page - 1) * perPage;
    const to      = from + perPage - 1;

    const { data, error } = await (this.db as AnyClient)
      .from('invoice_dunning_state')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('is_resolved', false)
      .order('next_action_at', { ascending: true, nullsFirst: false })
      .range(from, to);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as InvoiceDunningState[];
  }

  async markResolved(ctx: TenantContext, invoiceId: string): Promise<void> {
    if (ctx.organizationId === null) throw new InternalError('Organization context required');
    const { error } = await (this.db as AnyClient)
      .from('invoice_dunning_state')
      .update({ is_resolved: true, updated_at: new Date().toISOString() })
      .eq('organization_id', ctx.organizationId)
      .eq('invoice_id', invoiceId);
    if (error) throw mapDbError(error as Error);
  }

  async advanceViaRpc(ctx: TenantContext, invoiceId: string): Promise<void> {
    const { error } = await this.rpc('advance_dunning_stage', {
      p_invoice_id: invoiceId,
      p_actor_id:   ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
  }
}
