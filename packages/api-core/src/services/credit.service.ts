import type { PagedResult } from '@platform/types';
import type { CreditLedgerEntry, StudentWallet } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { CreditLedgerRepository } from '../repositories/credit-ledger.repository.js';
import type { CreditLedgerListQueryInput, GrantCreditInput } from '@platform/types';
import { assertPermission } from '../middleware/rbac.middleware.js';

export class CreditService {
  constructor(private readonly ledgerRepo: CreditLedgerRepository) {}

  async getWallet(ctx: TenantContext, studentId: string): Promise<StudentWallet> {
    assertPermission(ctx, 'finance:wallet:read');
    return this.ledgerRepo.getWallet(ctx, studentId);
  }

  async getLedger(
    ctx: TenantContext,
    query: CreditLedgerListQueryInput
  ): Promise<PagedResult<CreditLedgerEntry>> {
    assertPermission(ctx, 'finance:wallet:read');
    return this.ledgerRepo.getLedger(ctx, query);
  }

  async grantBonus(ctx: TenantContext, dto: GrantCreditInput): Promise<void> {
    assertPermission(ctx, 'finance:wallet:manage');
    if (ctx.actorId === null) throw new Error('Actor context required');
    return this.ledgerRepo.grantBonus(ctx, ctx.actorId, dto);
  }

  // Called by the event-worker after a lesson booking is completed
  async consumeCredit(
    ctx: TenantContext,
    studentId: string,
    bookingId: string,
    category: import('@platform/types').LessonCategory,
    quantity = 1
  ): Promise<string> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    return this.ledgerRepo.consumeViaRpc(ctx, ctx.organizationId, studentId, bookingId, category, quantity);
  }

  // Called by the maintenance tick
  async expireStaleCredits(ctx: TenantContext, limit = 50): Promise<{ expired: number }> {
    const expired = await this.ledgerRepo.expireStaleCreditsViaRpc(ctx, limit);
    return { expired };
  }
}
