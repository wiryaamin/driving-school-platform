import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { BankStatementImport, BankStatementLine } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

type BankStatementImportInsert = Database['public']['Tables']['bank_statement_imports']['Insert'];
type BankStatementImportUpdate = Database['public']['Tables']['bank_statement_imports']['Update'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class BankStatementImportRepository extends BaseRepository<BankStatementImport, BankStatementImportInsert, BankStatementImportUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'bank_statement_imports');
  }

  // Override: bank_statement_imports has no deleted_at column
  override async findById(ctx: TenantContext, id: string): Promise<BankStatementImport | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('bank_statement_imports')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as BankStatementImport | null;
  }

  async findByOrg(
    ctx:    TenantContext,
    limit:  number = 50,
    offset: number = 0,
  ): Promise<BankStatementImport[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('bank_statement_imports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('imported_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as BankStatementImport[];
  }

  async importViaRpc(
    ctx:            TenantContext,
    accountNumber:  string,
    bankName:       string | null,
    statementDate:  string,
    periodStart:    string,
    periodEnd:      string,
    openingBalance: number,
    closingBalance: number,
    currency:       string,
    lines:          unknown[],
  ): Promise<string> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('import_bank_statement', {
      p_org_id:           ctx.organizationId,
      p_account_number:   accountNumber,
      p_bank_name:        bankName,
      p_statement_date:   statementDate,
      p_period_start:     periodStart,
      p_period_end:       periodEnd,
      p_opening_balance:  openingBalance,
      p_closing_balance:  closingBalance,
      p_currency:         currency,
      p_lines:            lines,
      p_actor_id:         ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async autoMatchLines(ctx: TenantContext, importId: string): Promise<number> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('auto_match_bank_lines', {
      p_import_id: importId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as number;
  }
}

type BankStatementLineInsert = Database['public']['Tables']['bank_statement_lines']['Insert'];
type BankStatementLineUpdate = Database['public']['Tables']['bank_statement_lines']['Update'];

export class BankStatementLineRepository extends BaseRepository<BankStatementLine, BankStatementLineInsert, BankStatementLineUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'bank_statement_lines');
  }

  // Override: bank_statement_lines has no deleted_at column
  override async findById(ctx: TenantContext, id: string): Promise<BankStatementLine | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('bank_statement_lines')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as BankStatementLine | null;
  }

  async findByImport(ctx: TenantContext, importId: string): Promise<BankStatementLine[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('bank_statement_lines')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('import_id', importId)
      .order('line_number', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as BankStatementLine[];
  }

  async manualMatch(ctx: TenantContext, lineId: string, paymentId: string, notes?: string): Promise<void> {
    const { error } = await (this.db as AnyClient).rpc('manual_match_bank_line', {
      p_line_id:   lineId,
      p_payment_id: paymentId,
      p_notes:     notes ?? null,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
  }

  async unmatch(ctx: TenantContext, lineId: string): Promise<void> {
    const { error } = await (this.db as AnyClient).rpc('unmatch_bank_line', {
      p_line_id:  lineId,
      p_actor_id: ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
  }
}
