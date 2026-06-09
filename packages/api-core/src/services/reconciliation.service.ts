import type { PagedResult } from '@platform/types';
import type { PaymentAllocation } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { PaymentAllocationRepository } from '../repositories/payment-allocation.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

export class ReconciliationService {
  constructor(private readonly allocationRepo: PaymentAllocationRepository) {}

  async allocatePayment(
    ctx:       TenantContext,
    paymentId: string,
    invoiceId: string,
    amount:    number,
    notes?:    string
  ): Promise<string> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    if (ctx.actorId === null) throw new Error('Actor context required');
    return this.allocationRepo.allocateViaRpc(ctx, paymentId, invoiceId, amount, notes);
  }

  async getPaymentAllocations(ctx: TenantContext, paymentId: string): Promise<PaymentAllocation[]> {
    assertPermission(ctx, 'finance:payment:read');
    return this.allocationRepo.listByPayment(ctx, paymentId);
  }

  async getInvoiceAllocations(ctx: TenantContext, invoiceId: string): Promise<PaymentAllocation[]> {
    assertPermission(ctx, 'finance:invoice:read');
    return this.allocationRepo.listByInvoice(ctx, invoiceId);
  }

  async listAllocations(
    ctx:   TenantContext,
    query: { payment_id?: string; invoice_id?: string; page?: number; per_page?: number }
  ): Promise<PagedResult<PaymentAllocation>> {
    assertPermission(ctx, 'finance:reconciliation:manage');
    return this.allocationRepo.listAllocations(ctx, query);
  }
}
