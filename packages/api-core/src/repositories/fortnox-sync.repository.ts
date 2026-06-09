import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  FortnoxCustomerSync,
  FortnoxInvoiceSync,
  FortnoxPaymentSync,
  FortnoxExportLineage,
} from '@platform/types';
import type { FortnoxSyncStatusEnum } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// FortnoxSyncRepository manages all 4 Fortnox sync tables.
// Uses fortnox_customer_sync as the base table for BaseRepository generics.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

type CustomerInsert = Omit<FortnoxCustomerSync, 'id' | 'created_at' | 'updated_at'>;
type CustomerUpdate = Partial<CustomerInsert>;

export class FortnoxSyncRepository extends BaseRepository<FortnoxCustomerSync, CustomerInsert, CustomerUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'fortnox_customer_sync');
  }

  // ─── Customer sync ────────────────────────────────────────────────────────

  async getCustomerSync(ctx: TenantContext, studentId: string): Promise<FortnoxCustomerSync | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fortnox_customer_sync')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as FortnoxCustomerSync | null;
  }

  async listPendingCustomers(ctx: TenantContext, limit = 50): Promise<FortnoxCustomerSync[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fortnox_customer_sync')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('sync_status', 'pending')
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FortnoxCustomerSync[];
  }

  async updateCustomerSyncStatus(
    ctx:      TenantContext,
    studentId: string,
    status:   FortnoxSyncStatusEnum,
    opts?: { fortnox_customer_number?: string; sync_error?: string | null; fortnox_data?: object }
  ): Promise<void> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const update: Record<string, unknown> = {
      sync_status:          status,
      last_sync_attempt_at: new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    };
    if (status === 'synced') update['last_synced_at'] = new Date().toISOString();
    if (opts?.fortnox_customer_number !== undefined) update['fortnox_customer_number'] = opts.fortnox_customer_number;
    if (opts?.sync_error !== undefined) update['sync_error'] = opts.sync_error;
    if (opts?.fortnox_data !== undefined) update['fortnox_data'] = opts.fortnox_data;

    const { error } = await (this.db as AnyClient)
      .from('fortnox_customer_sync')
      .update(update)
      .eq('organization_id', ctx.organizationId)
      .eq('student_id', studentId);
    if (error) throw mapDbError(error as Error);
  }

  // ─── Invoice sync ─────────────────────────────────────────────────────────

  async getInvoiceSync(ctx: TenantContext, invoiceId: string): Promise<FortnoxInvoiceSync | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fortnox_invoice_sync')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('invoice_id', invoiceId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as FortnoxInvoiceSync | null;
  }

  async listPendingInvoices(ctx: TenantContext, limit = 50): Promise<FortnoxInvoiceSync[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fortnox_invoice_sync')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('sync_status', 'pending')
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FortnoxInvoiceSync[];
  }

  // ─── Payment sync ─────────────────────────────────────────────────────────

  async getPaymentSync(ctx: TenantContext, paymentId: string): Promise<FortnoxPaymentSync | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fortnox_payment_sync')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('payment_id', paymentId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as FortnoxPaymentSync | null;
  }

  // ─── Export lineage ───────────────────────────────────────────────────────

  async getExportLineage(ctx: TenantContext, exportRunId: string): Promise<FortnoxExportLineage | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fortnox_export_lineage')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('export_run_id', exportRunId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as FortnoxExportLineage | null;
  }

  async listExportLineage(ctx: TenantContext, limit = 20): Promise<FortnoxExportLineage[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fortnox_export_lineage')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FortnoxExportLineage[];
  }

  // ─── Queue via RPC ────────────────────────────────────────────────────────

  async queueSyncViaRpc(
    ctx:       TenantContext,
    entity:    'customer' | 'invoice' | 'payment',
    entityId:  string
  ): Promise<void> {
    const { error } = await this.rpc('queue_fortnox_sync', {
      p_org_id:    ctx.organizationId,
      p_entity:    entity,
      p_entity_id: entityId,
    });
    if (error) throw mapDbError(error as Error);
  }
}
