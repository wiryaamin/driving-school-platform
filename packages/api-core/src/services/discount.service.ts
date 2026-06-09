import type { PagedResult } from '@platform/types';
import type {
  DiscountDefinition,
  DiscountApplication,
  CouponCode,
  DiscountDefinitionInsert,
  CouponCodeInsert,
  DiscountListQueryInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import type { DiscountRepository } from '../repositories/discount.repository.js';
import type { CouponRepository } from '../repositories/coupon.repository.js';
import type { DiscountApplicationRepository } from '../repositories/discount-application.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { NotFoundError } from '../errors/service-errors.js';

export class DiscountService {
  constructor(
    private readonly discountRepo:     DiscountRepository,
    private readonly couponRepo:       CouponRepository,
    private readonly applicationRepo:  DiscountApplicationRepository
  ) {}

  // ─── Discount definitions ─────────────────────────────────────────────────

  async createDiscount(ctx: TenantContext, dto: DiscountDefinitionInsert): Promise<DiscountDefinition> {
    assertPermission(ctx, 'finance:discount:create');
    return this.discountRepo.insert(ctx, dto);
  }

  async getDiscount(ctx: TenantContext, discountId: string): Promise<DiscountDefinition> {
    assertPermission(ctx, 'finance:discount:read');
    const d = await this.discountRepo.findById(ctx, discountId);
    if (d === null) throw new NotFoundError('Discount', discountId);
    return d;
  }

  async listDiscounts(ctx: TenantContext, query: DiscountListQueryInput): Promise<PagedResult<DiscountDefinition>> {
    assertPermission(ctx, 'finance:discount:read');
    return this.discountRepo.listDiscounts(ctx, query);
  }

  async deactivateDiscount(ctx: TenantContext, discountId: string): Promise<void> {
    assertPermission(ctx, 'finance:discount:create');
    await this.discountRepo.deactivate(ctx, discountId);
  }

  // ─── Apply discount ───────────────────────────────────────────────────────

  async applyDiscount(ctx: TenantContext, invoiceId: string, discountId: string): Promise<string> {
    assertPermission(ctx, 'finance:discount:assign');
    if (ctx.actorId === null) throw new Error('Actor context required');
    return this.discountRepo.applyViaRpc(ctx, invoiceId, discountId);
  }

  async listApplicationsByInvoice(ctx: TenantContext, invoiceId: string): Promise<DiscountApplication[]> {
    assertPermission(ctx, 'finance:discount:read');
    return this.applicationRepo.listByInvoice(ctx, invoiceId);
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  async createCoupon(ctx: TenantContext, dto: CouponCodeInsert): Promise<CouponCode> {
    assertPermission(ctx, 'finance:coupon:create');
    // Normalize code to uppercase
    return this.couponRepo.insert(ctx, {
      ...dto,
      code: (dto.code as string).toUpperCase(),
    } as CouponCodeInsert);
  }

  async getCoupon(ctx: TenantContext, couponId: string): Promise<CouponCode> {
    assertPermission(ctx, 'finance:coupon:read');
    const c = await this.couponRepo.findById(ctx, couponId);
    if (c === null) throw new NotFoundError('Coupon', couponId);
    return c;
  }

  async listCoupons(
    ctx:   TenantContext,
    query: { discount_id?: string; is_active?: boolean; page?: number; per_page?: number }
  ): Promise<PagedResult<CouponCode>> {
    assertPermission(ctx, 'finance:coupon:read');
    return this.couponRepo.listCoupons(ctx, query);
  }

  async redeemCoupon(ctx: TenantContext, invoiceId: string, couponCode: string, studentId: string): Promise<string> {
    assertPermission(ctx, 'finance:discount:assign');
    if (ctx.actorId === null) throw new Error('Actor context required');
    return this.couponRepo.redeemViaRpc(ctx, invoiceId, couponCode, studentId);
  }
}
