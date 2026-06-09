import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { Sie4Export } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { InternalError } from '../errors/service-errors.js';

type Sie4ExportInsert = Record<string, never>;
type Sie4ExportUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class Sie4ExportRepository extends BaseRepository<Sie4Export, Sie4ExportInsert, Sie4ExportUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'sie4_exports');
  }

  override async insert(_ctx: TenantContext, _dto: Sie4ExportInsert): Promise<Sie4Export> {
    throw new InternalError('SIE4: use generateViaRpc() — direct insert is not permitted');
  }

  override async findById(ctx: TenantContext, id: string): Promise<Sie4Export | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('sie4_exports')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as Sie4Export | null;
  }

  async findByExportRun(ctx: TenantContext, exportRunId: string): Promise<Sie4Export | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('sie4_exports')
      .select('*')
      .eq('export_run_id', exportRunId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as Sie4Export | null;
  }

  async listRecent(ctx: TenantContext, limit = 10): Promise<Sie4Export[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('sie4_exports')
      .select('id, organization_id, export_run_id, content_hash, voucher_count, transaction_count, from_date, to_date, fiscal_year_start, generated_at, generated_by')
      .eq('organization_id', ctx.organizationId)
      .order('generated_at', { ascending: false })
      .limit(limit);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as Sie4Export[];
  }

  async generateViaRpc(ctx: TenantContext, exportRunId: string): Promise<string> {
    const { data, error } = await this.rpc('generate_sie4_export', {
      p_export_run_id: exportRunId,
      p_actor_id:      ctx.actorId,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }
}
