import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type { PeriodAuditSnapshot, LedgerConsistencyCheck } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';

// period_audit_snapshots is immutable — no Insert/Update from TS side
type SnapshotInsert = Record<string, never>;
type SnapshotUpdate = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class PeriodAuditSnapshotRepository extends BaseRepository<PeriodAuditSnapshot, SnapshotInsert, SnapshotUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'period_audit_snapshots');
  }

  // Override: period_audit_snapshots has no deleted_at column
  override async findById(ctx: TenantContext, id: string): Promise<PeriodAuditSnapshot | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('period_audit_snapshots')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as PeriodAuditSnapshot | null;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<PeriodAuditSnapshot[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('period_audit_snapshots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .order('captured_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as PeriodAuditSnapshot[];
  }

  async captureViaRpc(
    ctx:          TenantContext,
    periodId:     string,
    snapshotType: string,
    notes?:       string | null,
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient).rpc('capture_period_audit_snapshot', {
      p_period_id:     periodId,
      p_snapshot_type: snapshotType,
      p_notes:         notes ?? null,
      p_actor_id:      ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async verifyViaRpc(_ctx: TenantContext, snapshotId: string): Promise<unknown> {
    const { data, error } = await (this.db as AnyClient).rpc('verify_period_audit_snapshot', {
      p_snapshot_id: snapshotId,
    });
    if (error) throw mapDbError(error as Error);
    return data;
  }
}

// ledger_consistency_checks is append-only — no Insert/Update from TS side
type CheckInsert = Record<string, never>;
type CheckUpdate = Record<string, never>;

export class LedgerConsistencyCheckRepository extends BaseRepository<LedgerConsistencyCheck, CheckInsert, CheckUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'ledger_consistency_checks');
  }

  // Override: ledger_consistency_checks has no deleted_at column
  override async findById(ctx: TenantContext, id: string): Promise<LedgerConsistencyCheck | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('ledger_consistency_checks')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as LedgerConsistencyCheck | null;
  }

  async findByPeriod(ctx: TenantContext, periodId: string, limit = 10): Promise<LedgerConsistencyCheck[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('ledger_consistency_checks')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('financial_period_id', periodId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as LedgerConsistencyCheck[];
  }

  async runCheckViaRpc(
    ctx:       TenantContext,
    periodId:  string,
    checkType: string,
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient).rpc('run_ledger_consistency_check', {
      p_period_id:  periodId,
      p_check_type: checkType,
      p_actor_id:   ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }
}
