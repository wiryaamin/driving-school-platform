import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  LedgerReplayRun,
  ReplaySnapshot,
  LedgerReplayStatusEnum,
  ReplayStateResult,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { NotFoundError } from '../errors/service-errors.js';

type LedgerReplayRunInsert = Database['public']['Tables']['ledger_replay_runs']['Insert'];
type LedgerReplayRunUpdate = Database['public']['Tables']['ledger_replay_runs']['Update'];
type ReplaySnapshotInsert  = Database['public']['Tables']['replay_snapshots']['Insert'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class LedgerReplayRunRepository extends BaseRepository<LedgerReplayRun, LedgerReplayRunInsert, LedgerReplayRunUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'ledger_replay_runs');
  }

  override async findById(ctx: TenantContext, id: string): Promise<LedgerReplayRun | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('ledger_replay_runs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as LedgerReplayRun | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<LedgerReplayRun> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('LedgerReplayRun', id);
    return row;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<LedgerReplayRun[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('ledger_replay_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as LedgerReplayRun[];
  }

  async findLatestByPeriod(ctx: TenantContext, periodId: string): Promise<LedgerReplayRun | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('ledger_replay_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as LedgerReplayRun | null;
  }

  async findByFiscalYear(ctx: TenantContext, fiscalYearId: string): Promise<LedgerReplayRun[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('ledger_replay_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('fiscal_year_id', fiscalYearId)
      .order('created_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as LedgerReplayRun[];
  }

  async findDivergent(ctx: TenantContext): Promise<LedgerReplayRun[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('ledger_replay_runs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'divergent' satisfies LedgerReplayStatusEnum)
      .order('created_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as LedgerReplayRun[];
  }

  // ── RPC wrappers ─────────────────────────────────────────────────────────────

  async replayPeriodViaRpc(ctx: TenantContext, periodId: string): Promise<ReplayStateResult> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('replay_period_state', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as ReplayStateResult;
  }

  async validateBalanceReconstructionViaRpc(ctx: TenantContext, periodId: string): Promise<unknown> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('validate_balance_reconstruction', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data;
  }

  async replayFiscalYearViaRpc(ctx: TenantContext, fiscalYearId: string): Promise<unknown> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('replay_fiscal_year', {
      p_org_id:         ctx.organizationId,
      p_fiscal_year_id: fiscalYearId,
      p_actor_id:       ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data;
  }
}

export class ReplaySnapshotRepository extends BaseRepository<ReplaySnapshot, ReplaySnapshotInsert, never> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'replay_snapshots');
  }

  override async findById(ctx: TenantContext, id: string): Promise<ReplaySnapshot | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_snapshots')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ReplaySnapshot | null;
  }

  async findByRun(ctx: TenantContext, replayRunId: string): Promise<ReplaySnapshot[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_snapshots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('replay_run_id', replayRunId)
      .order('account_code', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ReplaySnapshot[];
  }

  async findDivergentByRun(ctx: TenantContext, replayRunId: string): Promise<ReplaySnapshot[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_snapshots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('replay_run_id', replayRunId)
      .eq('has_divergence', true)
      .order('divergence_amount', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ReplaySnapshot[];
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<ReplaySnapshot[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_snapshots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ReplaySnapshot[];
  }
}
