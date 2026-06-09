import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { JournalEntryRepository } from '../repositories/journal-entry.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

export class PostingService {
  private readonly journalRepo: JournalEntryRepository;

  constructor(db: SupabaseClient<Database>) {
    this.journalRepo = new JournalEntryRepository(db);
  }

  async postInvoice(ctx: TenantContext, invoiceId: string): Promise<string> {
    assertPermission(ctx, 'finance:ledger:manage');
    return this.journalRepo.postInvoiceEntryViaRpc(ctx, invoiceId);
  }

  async postPayment(ctx: TenantContext, paymentId: string): Promise<string> {
    assertPermission(ctx, 'finance:ledger:manage');
    return this.journalRepo.postPaymentEntryViaRpc(ctx, paymentId);
  }

  async postVoid(ctx: TenantContext, invoiceId: string): Promise<string> {
    assertPermission(ctx, 'finance:ledger:void');
    return this.journalRepo.postVoidEntryViaRpc(ctx, invoiceId);
  }
}
