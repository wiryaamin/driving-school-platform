import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';

type AnyClient = any;

type AgiExportRow              = Database['public']['Tables']['agi_exports']['Row'];
type AgiExportInsert           = Database['public']['Tables']['agi_exports']['Insert'];
type AgiExportUpdate           = Database['public']['Tables']['agi_exports']['Update'];
type AgiExportLineRow          = Database['public']['Tables']['agi_export_lines']['Row'];
type AgiExportLineInsert       = Database['public']['Tables']['agi_export_lines']['Insert'];
type RegulatoryAuditExportRow  = Database['public']['Tables']['regulatory_audit_exports']['Row'];
type RegulatoryAuditExportInsert = Database['public']['Tables']['regulatory_audit_exports']['Insert'];

export class AgiExportRepository extends BaseRepository<AgiExportRow, AgiExportInsert, AgiExportUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'agi_exports');
  }

  override async findById(ctx: TenantContext, id: string): Promise<AgiExportRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('agi_exports')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByStatus(ctx: TenantContext, status: string): Promise<AgiExportRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('agi_exports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('status', status)
      .order('declaration_month', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findAll(ctx: TenantContext, limit = 50, offset = 0): Promise<AgiExportRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('agi_exports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('declaration_month', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  }

  async generate(ctx: TenantContext, payrollRunId: string, notes?: string | null): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('generate_agi_export' as never, {
        p_org_id:         ctx.organizationId,
        p_payroll_run_id: payrollRunId,
        p_notes:          notes ?? null,
        p_actor_id:       ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }

  async lock(ctx: TenantContext, agiExportId: string, receipt?: string | null): Promise<void> {
    const { error } = await (this.db as AnyClient)
      .rpc('lock_agi_export' as never, {
        p_agi_export_id: agiExportId,
        p_receipt:       receipt ?? null,
        p_actor_id:      ctx.actorId,
      });
    if (error) throw error;
  }

  async verifyIntegrity(_ctx: TenantContext, agiExportId: string): Promise<Json> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('verify_agi_export_integrity' as never, { p_agi_export_id: agiExportId });
    if (error) throw error;
    return data as Json;
  }
}

export class AgiExportLineRepository extends BaseRepository<AgiExportLineRow, AgiExportLineInsert, never> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'agi_export_lines');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<AgiExportLineRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('agi_export_lines')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByExport(ctx: TenantContext, exportId: string): Promise<AgiExportLineRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('agi_export_lines')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('agi_export_id', exportId)
      .order('employee_id');
    if (error) throw error;
    return data ?? [];
  }
}

export class RegulatoryAuditExportRepository extends BaseRepository<RegulatoryAuditExportRow, RegulatoryAuditExportInsert, never> {
  constructor(db: SupabaseClient<Database>) {
    super(db as AnyClient, 'regulatory_audit_exports');
  }

  override async findById(ctx: TenantContext, id: string): Promise<RegulatoryAuditExportRow | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('regulatory_audit_exports')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<RegulatoryAuditExportRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('regulatory_audit_exports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .order('export_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findByType(ctx: TenantContext, exportType: string): Promise<RegulatoryAuditExportRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('regulatory_audit_exports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('export_type', exportType)
      .order('export_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findAll(ctx: TenantContext, limit = 50, offset = 0): Promise<RegulatoryAuditExportRow[]> {
    const { data, error } = await (this.db as AnyClient)
      .from('regulatory_audit_exports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('export_date', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  }

  async generate(
    ctx: TenantContext,
    params: { periodId: string; exportType: string; notes?: string | null }
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient)
      .rpc('generate_regulatory_audit_export' as never, {
        p_org_id:      ctx.organizationId,
        p_period_id:   params.periodId,
        p_export_type: params.exportType,
        p_notes:       params.notes ?? null,
        p_actor_id:    ctx.actorId,
      });
    if (error) throw error;
    return data as string;
  }
}
