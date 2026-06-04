import type { PagedResult } from '@platform/types';
import type { Payment } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { PaymentRepository } from '../repositories/payment.repository.js';
import type { RecordPaymentInput, PaymentListQueryInput } from '@platform/types';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { NotFoundError } from '../errors/service-errors.js';

export class PaymentService {
  constructor(private readonly paymentRepo: PaymentRepository) {}

  async listPayments(ctx: TenantContext, query: PaymentListQueryInput): Promise<PagedResult<Payment>> {
    assertPermission(ctx, 'finance:payment:read');
    return this.paymentRepo.listPayments(ctx, query);
  }

  async getPayment(ctx: TenantContext, paymentId: string): Promise<Payment> {
    assertPermission(ctx, 'finance:payment:read');
    const payment = await this.paymentRepo.findById(ctx, paymentId);
    if (payment === null) throw new NotFoundError('Payment', paymentId);
    return payment;
  }

  async recordPayment(ctx: TenantContext, dto: RecordPaymentInput): Promise<string> {
    assertPermission(ctx, 'finance:payment:create');
    if (ctx.actorId === null) throw new Error('Actor context required');

    return this.paymentRepo.recordViaRpc(
      ctx,
      dto.invoice_id,
      dto.amount,
      dto.payment_method,
      dto.provider_reference
    );
  }
}
