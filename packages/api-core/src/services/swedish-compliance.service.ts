import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { OrganizationSwedishSettings, InvoiceOcrReference } from '@platform/types';
import type { SwedishSettingsInput } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class SwedishComplianceService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // ─── Swedish Settings ─────────────────────────────────────────────────────

  async getSettings(ctx: TenantContext): Promise<OrganizationSwedishSettings | null> {
    assertPermission(ctx, 'finance:settings:read');
    const { data, error } = await (this.db as AnyClient)
      .from('organization_swedish_settings')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as OrganizationSwedishSettings | null;
  }

  async upsertSettings(ctx: TenantContext, input: SwedishSettingsInput): Promise<OrganizationSwedishSettings> {
    assertPermission(ctx, 'finance:settings:manage');
    const { data, error } = await (this.db as AnyClient)
      .from('organization_swedish_settings')
      .upsert({
        organization_id: ctx.organizationId,
        ...input,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' })
      .select('*')
      .single();
    if (error) throw mapDbError(error as Error);
    return data as OrganizationSwedishSettings;
  }

  // ─── OCR References ───────────────────────────────────────────────────────

  async getOcrReference(ctx: TenantContext, invoiceId: string): Promise<InvoiceOcrReference | null> {
    assertPermission(ctx, 'finance:settings:read');
    const { data, error } = await (this.db as AnyClient)
      .from('invoice_ocr_references')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as InvoiceOcrReference | null;
  }

  async listOcrReferences(ctx: TenantContext, limit = 50): Promise<InvoiceOcrReference[]> {
    assertPermission(ctx, 'finance:settings:read');
    const { data, error } = await (this.db as AnyClient)
      .from('invoice_ocr_references')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as InvoiceOcrReference[];
  }

  // ─── BAS Account seeding ──────────────────────────────────────────────────

  async seedBasAccounts(ctx: TenantContext): Promise<number> {
    assertPermission(ctx, 'finance:bas:manage');
    const { data, error } = await (this.db as AnyClient).rpc('seed_org_chart_of_accounts', {
      p_org_id:   ctx.organizationId,
      p_actor_id: ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return (data ?? 0) as number;
  }

  // ─── Swedish dunning schedule seed ───────────────────────────────────────

  async seedSwedishDunningSchedule(ctx: TenantContext): Promise<string> {
    assertPermission(ctx, 'finance:settings:manage');
    const { data, error } = await (this.db as AnyClient).rpc('seed_swedish_dunning_schedule', {
      p_org_id:   ctx.organizationId,
      p_actor_id: ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }
}
