import type { PagedResult } from '@platform/types';
import type { Refund, RefundListQueryInput } from '@platform/types';
import type { ProcessRefundInput } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { RefundRepository } from '../repositories/refund.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { NotFoundError } from '../errors/service-errors.js';

export class RefundService {
  constructor(private readonly refundRepo: RefundRepository) {}

  async processRefund(ctx: TenantContext, dto: ProcessRefundInput): Promise<string> {
    assertPermission(ctx, 'finance:refund:create');
    if (ctx.actorId === null) throw new Error('Actor context required');

    return this.refundRepo.processViaRpc(
      ctx,
      dto.invoice_id,
      dto.refund_type,
      dto.reason_code,
      dto.refund_amount  ?? 0,
      dto.credit_qty     ?? 0,
      dto.credit_category,
      dto.grant_entry_id,
      dto.payment_id,
      dto.notes
    );
  }

  async listRefunds(ctx: TenantContext, query: RefundListQueryInput): Promise<PagedResult<Refund>> {
    assertPermission(ctx, 'finance:refund:read');
    return this.refundRepo.listRefunds(ctx, query);
  }

  async getRefund(ctx: TenantContext, refundId: string): Promise<Refund> {
    assertPermission(ctx, 'finance:refund:read');
    const refund = await this.refundRepo.findById(ctx, refundId);
    if (refund === null) throw new NotFoundError('Refund', refundId);
    return refund;
  }
}
