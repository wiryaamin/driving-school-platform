import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  FiscalYear,
  FiscalYearOverview,
  FiscalYearValidationResult,
  CreateFiscalYearInput,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { FiscalYearRepository } from '../repositories/fiscal-year.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class FiscalYearService {
  private readonly fyRepo: FiscalYearRepository;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.fyRepo = new FiscalYearRepository(db);
  }

  async createFiscalYear(ctx: TenantContext, input: CreateFiscalYearInput): Promise<string> {
    assertPermission(ctx, 'finance:year_end:manage');
    return this.fyRepo.createViaRpc(
      ctx,
      input.year_number,
      input.year_start,
      input.year_end,
      input.notes ?? null,
    );
  }

  async getFiscalYear(ctx: TenantContext, fiscalYearId: string): Promise<FiscalYear | null> {
    assertPermission(ctx, 'finance:close:read');
    return this.fyRepo.findById(ctx, fiscalYearId);
  }

  async listFiscalYears(ctx: TenantContext): Promise<FiscalYear[]> {
    assertPermission(ctx, 'finance:close:read');
    return this.fyRepo.findByOrg(ctx);
  }

  async getFiscalYearByNumber(ctx: TenantContext, yearNumber: number): Promise<FiscalYear | null> {
    assertPermission(ctx, 'finance:close:read');
    return this.fyRepo.findByYear(ctx, yearNumber);
  }

  async assignPeriodToFiscalYear(
    ctx:          TenantContext,
    periodId:     string,
    fiscalYearId: string,
    isYearEnd:    boolean = false,
  ): Promise<void> {
    assertPermission(ctx, 'finance:year_end:manage');
    return this.fyRepo.assignPeriodViaRpc(ctx, periodId, fiscalYearId, isYearEnd);
  }

  async validateFiscalYearForClose(ctx: TenantContext, fiscalYearId: string): Promise<FiscalYearValidationResult> {
    assertPermission(ctx, 'finance:year_end:manage');
    const result = await this.fyRepo.validateForCloseViaRpc(ctx, fiscalYearId);
    return result as FiscalYearValidationResult;
  }

  async postRetainedEarnings(ctx: TenantContext, fiscalYearId: string): Promise<string> {
    assertPermission(ctx, 'finance:year_end:manage');
    return this.fyRepo.postRetainedEarningsViaRpc(ctx, fiscalYearId);
  }

  async closeFiscalYear(ctx: TenantContext, fiscalYearId: string): Promise<void> {
    assertPermission(ctx, 'finance:year_end:manage');
    return this.fyRepo.closeFiscalYearViaRpc(ctx, fiscalYearId);
  }

  async rolloverOpeningBalances(
    ctx:            TenantContext,
    fiscalYearId:   string,
    targetPeriodId: string,
  ): Promise<number> {
    assertPermission(ctx, 'finance:year_end:manage');
    return this.fyRepo.rolloverOpeningBalancesViaRpc(ctx, fiscalYearId, targetPeriodId);
  }

  async getFiscalYearOverview(ctx: TenantContext): Promise<FiscalYearOverview[]> {
    assertPermission(ctx, 'finance:close:read');
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('v_fiscal_year_overview')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('year_number', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FiscalYearOverview[];
  }
}
