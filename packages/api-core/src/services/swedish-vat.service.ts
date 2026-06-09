import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { VatPeriod, VatReportEntry, VatRate, BasAccountCatalog } from '@platform/types';
import type { VatPeriodFrequencyEnum } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { VatPeriodRepository } from '../repositories/vat-period.repository.js';
import { BasAccountRepository } from '../repositories/bas-account.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class SwedishVatService {
  private readonly vatPeriodRepo: VatPeriodRepository;
  private readonly basAccountRepo: BasAccountRepository;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.vatPeriodRepo  = new VatPeriodRepository(db);
    this.basAccountRepo = new BasAccountRepository(db);
  }

  // ─── VAT Periods ─────────────────────────────────────────────────────────

  async createPeriod(
    ctx:         TenantContext,
    periodStart: string,
    periodEnd:   string,
    frequency:   VatPeriodFrequencyEnum = 'monthly',
  ): Promise<string> {
    assertPermission(ctx, 'finance:vat:manage');
    return this.vatPeriodRepo.createViaRpc(ctx, periodStart, periodEnd, frequency);
  }

  async listPeriods(ctx: TenantContext, status?: string): Promise<VatPeriod[]> {
    assertPermission(ctx, 'finance:vat:read');
    return this.vatPeriodRepo.listPeriods(ctx, status);
  }

  async getPeriod(ctx: TenantContext, periodId: string): Promise<VatPeriod | null> {
    assertPermission(ctx, 'finance:vat:read');
    return this.vatPeriodRepo.findById(ctx, periodId);
  }

  async populatePeriod(ctx: TenantContext, periodId: string): Promise<number> {
    assertPermission(ctx, 'finance:vat:manage');
    return this.vatPeriodRepo.populateViaRpc(ctx, periodId);
  }

  async lockPeriod(ctx: TenantContext, periodId: string, filingReference?: string): Promise<void> {
    assertPermission(ctx, 'finance:vat:manage');
    return this.vatPeriodRepo.lockViaRpc(ctx, periodId, filingReference);
  }

  async listPeriodEntries(ctx: TenantContext, periodId: string): Promise<VatReportEntry[]> {
    assertPermission(ctx, 'finance:vat:read');
    return this.vatPeriodRepo.listEntries(ctx, periodId);
  }

  // ─── BAS Catalog (read-only) ──────────────────────────────────────────────

  async listBasAccounts(ctx: TenantContext): Promise<BasAccountCatalog[]> {
    assertPermission(ctx, 'finance:bas:read');
    return this.basAccountRepo.listAll(ctx);
  }

  async listVatRates(ctx: TenantContext): Promise<VatRate[]> {
    assertPermission(ctx, 'finance:bas:read');
    const { data, error } = await (this.db as AnyClient)
      .from('vat_rates')
      .select('*')
      .order('rate_percent', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as VatRate[];
  }
}
