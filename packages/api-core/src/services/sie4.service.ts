import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { Sie4Export } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { Sie4ExportRepository } from '../repositories/sie4-export.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

export class Sie4Service {
  private readonly repo: Sie4ExportRepository;

  constructor(db: SupabaseClient<Database>) {
    this.repo = new Sie4ExportRepository(db);
  }

  async generate(ctx: TenantContext, exportRunId: string): Promise<string> {
    assertPermission(ctx, 'finance:sie_export:run');
    return this.repo.generateViaRpc(ctx, exportRunId);
  }

  async getById(ctx: TenantContext, id: string): Promise<Sie4Export | null> {
    assertPermission(ctx, 'finance:sie_export:read');
    return this.repo.findById(ctx, id);
  }

  async getByExportRun(ctx: TenantContext, exportRunId: string): Promise<Sie4Export | null> {
    assertPermission(ctx, 'finance:sie_export:read');
    return this.repo.findByExportRun(ctx, exportRunId);
  }

  async listRecent(ctx: TenantContext, limit = 10): Promise<Sie4Export[]> {
    assertPermission(ctx, 'finance:sie_export:read');
    return this.repo.listRecent(ctx, limit);
  }
}
