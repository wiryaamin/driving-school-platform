import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  FortnoxCustomerSync,
  FortnoxInvoiceSync,
  FortnoxPaymentSync,
  FortnoxExportLineage,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { FortnoxSyncRepository } from '../repositories/fortnox-sync.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

export class FortnoxService {
  private readonly repo: FortnoxSyncRepository;

  constructor(db: SupabaseClient<Database>) {
    this.repo = new FortnoxSyncRepository(db);
  }

  // ─── Queue ────────────────────────────────────────────────────────────────

  async queueSync(
    ctx:      TenantContext,
    entity:   'customer' | 'invoice' | 'payment',
    entityId: string
  ): Promise<void> {
    assertPermission(ctx, 'finance:fortnox:manage');
    return this.repo.queueSyncViaRpc(ctx, entity, entityId);
  }

  // ─── Customer sync ────────────────────────────────────────────────────────

  async getCustomerSync(ctx: TenantContext, studentId: string): Promise<FortnoxCustomerSync | null> {
    assertPermission(ctx, 'finance:fortnox:manage');
    return this.repo.getCustomerSync(ctx, studentId);
  }

  async listPendingCustomers(ctx: TenantContext, limit = 50): Promise<FortnoxCustomerSync[]> {
    assertPermission(ctx, 'finance:fortnox:manage');
    return this.repo.listPendingCustomers(ctx, limit);
  }

  // ─── Invoice sync ─────────────────────────────────────────────────────────

  async getInvoiceSync(ctx: TenantContext, invoiceId: string): Promise<FortnoxInvoiceSync | null> {
    assertPermission(ctx, 'finance:fortnox:manage');
    return this.repo.getInvoiceSync(ctx, invoiceId);
  }

  async listPendingInvoices(ctx: TenantContext, limit = 50): Promise<FortnoxInvoiceSync[]> {
    assertPermission(ctx, 'finance:fortnox:manage');
    return this.repo.listPendingInvoices(ctx, limit);
  }

  // ─── Payment sync ─────────────────────────────────────────────────────────

  async getPaymentSync(ctx: TenantContext, paymentId: string): Promise<FortnoxPaymentSync | null> {
    assertPermission(ctx, 'finance:fortnox:manage');
    return this.repo.getPaymentSync(ctx, paymentId);
  }

  // ─── Export lineage ───────────────────────────────────────────────────────

  async getExportLineage(ctx: TenantContext, exportRunId: string): Promise<FortnoxExportLineage | null> {
    assertPermission(ctx, 'finance:fortnox:manage');
    return this.repo.getExportLineage(ctx, exportRunId);
  }

  async listExportLineage(ctx: TenantContext, limit = 20): Promise<FortnoxExportLineage[]> {
    assertPermission(ctx, 'finance:fortnox:manage');
    return this.repo.listExportLineage(ctx, limit);
  }
}
