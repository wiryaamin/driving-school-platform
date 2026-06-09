import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  ScheduleGeneration,
  ScheduleGenerationLink,
  FiscalDependencyEdge,
  ReplayDivergenceEvent,
  SubledgerCloseJob,
  ReplayValidationReport,
  CanonicalReplayExport,
  ReplayHashRegistry,
  ScheduleGenerationTypeEnum,
  SubledgerTypeEnum,
  SubledgerCloseStatusEnum,
  ReplayHashTypeEnum,
  CloseDependencyResult,
  ReopenPeriodResult,
  SubledgerOrchestrationResult,
  ReplayIntegrityResult,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { mapDbError } from '../errors/db-error-mapper.js';
import { NotFoundError } from '../errors/service-errors.js';

type ScheduleGenerationInsert = Database['public']['Tables']['schedule_generations']['Insert'];
type ScheduleGenerationUpdate = Database['public']['Tables']['schedule_generations']['Update'];
type ScheduleGenerationLinkInsert = Database['public']['Tables']['schedule_generation_links']['Insert'];
type FiscalDependencyInsert = Database['public']['Tables']['fiscal_dependency_graph']['Insert'];
type FiscalDependencyUpdate = Database['public']['Tables']['fiscal_dependency_graph']['Update'];
type ReplayDivergenceInsert = Database['public']['Tables']['replay_divergence_events']['Insert'];
type ReplayDivergenceUpdate = Database['public']['Tables']['replay_divergence_events']['Update'];
type SubledgerCloseJobInsert = Database['public']['Tables']['subledger_close_jobs']['Insert'];
type SubledgerCloseJobUpdate = Database['public']['Tables']['subledger_close_jobs']['Update'];
type ReplayValidationReportInsert = Database['public']['Tables']['replay_validation_reports']['Insert'];
type CanonicalReplayExportInsert = Database['public']['Tables']['canonical_replay_exports']['Insert'];
type ReplayHashRegistryInsert = Database['public']['Tables']['replay_hash_registry']['Insert'];
type ReplayHashRegistryUpdate = Database['public']['Tables']['replay_hash_registry']['Update'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

// ── Schedule Generations ──────────────────────────────────────────────────────

export class ScheduleGenerationRepository extends BaseRepository<ScheduleGeneration, ScheduleGenerationInsert, ScheduleGenerationUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'schedule_generations');
  }

  override async findById(ctx: TenantContext, id: string): Promise<ScheduleGeneration | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('schedule_generations')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ScheduleGeneration | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<ScheduleGeneration> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('ScheduleGeneration', id);
    return row;
  }

  async findCurrentBySource(
    ctx:          TenantContext,
    scheduleType: ScheduleGenerationTypeEnum,
    sourceId:     string,
  ): Promise<ScheduleGeneration | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('schedule_generations')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('schedule_type', scheduleType)
      .eq('source_id', sourceId)
      .eq('is_current', true)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ScheduleGeneration | null;
  }

  async findAllBySource(
    ctx:          TenantContext,
    scheduleType: ScheduleGenerationTypeEnum,
    sourceId:     string,
  ): Promise<ScheduleGeneration[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('schedule_generations')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('schedule_type', scheduleType)
      .eq('source_id', sourceId)
      .order('generation_number', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ScheduleGeneration[];
  }

  async supersedeViaRpc(
    ctx:          TenantContext,
    scheduleType: ScheduleGenerationTypeEnum,
    sourceId:     string,
    linesCount:   number,
    totalAmount:  number,
    reason?:      string,
  ): Promise<string> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('supersede_schedule_generation', {
      p_org_id:        ctx.organizationId,
      p_schedule_type: scheduleType,
      p_source_id:     sourceId,
      p_lines_count:   linesCount,
      p_total_amount:  totalAmount,
      p_reason:        reason ?? null,
      p_actor_id:      ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }
}

export class ScheduleGenerationLinkRepository extends BaseRepository<ScheduleGenerationLink, ScheduleGenerationLinkInsert, never> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'schedule_generation_links');
  }

  override async findById(ctx: TenantContext, id: string): Promise<ScheduleGenerationLink | null> {
    const { data, error } = await (this.db as AnyClient)
      .from('schedule_generation_links')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ScheduleGenerationLink | null;
    void ctx;
  }

  async findByParent(ctx: TenantContext, parentGenerationId: string): Promise<ScheduleGenerationLink[]> {
    void ctx;
    const { data, error } = await (this.db as AnyClient)
      .from('schedule_generation_links')
      .select('*')
      .eq('parent_generation_id', parentGenerationId)
      .order('created_at', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ScheduleGenerationLink[];
  }

  async findByChild(ctx: TenantContext, childGenerationId: string): Promise<ScheduleGenerationLink | null> {
    void ctx;
    const { data, error } = await (this.db as AnyClient)
      .from('schedule_generation_links')
      .select('*')
      .eq('child_generation_id', childGenerationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ScheduleGenerationLink | null;
  }
}

// ── Fiscal Dependency Graph ───────────────────────────────────────────────────

export class FiscalDependencyGraphRepository extends BaseRepository<FiscalDependencyEdge, FiscalDependencyInsert, FiscalDependencyUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'fiscal_dependency_graph');
  }

  override async findById(ctx: TenantContext, id: string): Promise<FiscalDependencyEdge | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fiscal_dependency_graph')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as FiscalDependencyEdge | null;
  }

  async findDependenciesForPeriod(ctx: TenantContext, periodId: string): Promise<FiscalDependencyEdge[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fiscal_dependency_graph')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('dependent_period_id', periodId)
      .eq('is_active', true);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FiscalDependencyEdge[];
  }

  async findDownstreamDependents(ctx: TenantContext, requiredPeriodId: string): Promise<FiscalDependencyEdge[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('fiscal_dependency_graph')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('required_period_id', requiredPeriodId)
      .eq('is_active', true);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as FiscalDependencyEdge[];
  }

  async validateCloseViaRpc(ctx: TenantContext, periodId: string): Promise<CloseDependencyResult> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('validate_close_dependencies', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as CloseDependencyResult;
  }

  async reopenPeriodSafeViaRpc(
    ctx:      TenantContext,
    periodId: string,
    reason:   string,
  ): Promise<ReopenPeriodResult> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('reopen_period_safe', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_reason:    reason,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as ReopenPeriodResult;
  }
}

// ── Replay Divergence Events ──────────────────────────────────────────────────

export class ReplayDivergenceEventRepository extends BaseRepository<ReplayDivergenceEvent, ReplayDivergenceInsert, ReplayDivergenceUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'replay_divergence_events');
  }

  override async findById(ctx: TenantContext, id: string): Promise<ReplayDivergenceEvent | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_divergence_events')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ReplayDivergenceEvent | null;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<ReplayDivergenceEvent[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_divergence_events')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('detected_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ReplayDivergenceEvent[];
  }

  async findUnresolved(ctx: TenantContext): Promise<ReplayDivergenceEvent[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_divergence_events')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .is('resolved_at', null)
      .order('detected_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ReplayDivergenceEvent[];
  }
}

// ── Subledger Close Jobs ──────────────────────────────────────────────────────

export class SubledgerCloseJobRepository extends BaseRepository<SubledgerCloseJob, SubledgerCloseJobInsert, SubledgerCloseJobUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'subledger_close_jobs');
  }

  override async findById(ctx: TenantContext, id: string): Promise<SubledgerCloseJob | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('subledger_close_jobs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as SubledgerCloseJob | null;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<SubledgerCloseJob[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('subledger_close_jobs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('subledger_type', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as SubledgerCloseJob[];
  }

  async findByPeriodAndType(
    ctx:          TenantContext,
    periodId:     string,
    subledgerType: SubledgerTypeEnum,
  ): Promise<SubledgerCloseJob | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('subledger_close_jobs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .eq('subledger_type', subledgerType)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as SubledgerCloseJob | null;
  }

  async findBlockingByPeriod(ctx: TenantContext, periodId: string): Promise<SubledgerCloseJob[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('subledger_close_jobs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .in('status', ['failed', 'pending'] satisfies SubledgerCloseStatusEnum[])
      .gt('items_blocking', 0);
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as SubledgerCloseJob[];
  }

  async orchestrateViaRpc(ctx: TenantContext, periodId: string): Promise<SubledgerOrchestrationResult> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('orchestrate_subledger_close', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as SubledgerOrchestrationResult;
  }
}

// ── Replay Validation Reports ─────────────────────────────────────────────────

export class ReplayValidationReportRepository extends BaseRepository<ReplayValidationReport, ReplayValidationReportInsert, never> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'replay_validation_reports');
  }

  override async findById(ctx: TenantContext, id: string): Promise<ReplayValidationReport | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_validation_reports')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ReplayValidationReport | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<ReplayValidationReport> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('ReplayValidationReport', id);
    return row;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<ReplayValidationReport[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_validation_reports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ReplayValidationReport[];
  }

  async validateIntegrityViaRpc(ctx: TenantContext, periodId: string): Promise<ReplayIntegrityResult> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('validate_replay_integrity', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as ReplayIntegrityResult;
  }

  async generateSnapshotViaRpc(ctx: TenantContext, periodId: string): Promise<string> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('generate_replay_snapshot', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }
}

// ── Canonical Replay Exports ──────────────────────────────────────────────────

export class CanonicalReplayExportRepository extends BaseRepository<CanonicalReplayExport, CanonicalReplayExportInsert, never> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'canonical_replay_exports');
  }

  override async findById(ctx: TenantContext, id: string): Promise<CanonicalReplayExport | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('canonical_replay_exports')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as CanonicalReplayExport | null;
  }

  async findLatestByPeriod(ctx: TenantContext, periodId: string): Promise<CanonicalReplayExport | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('canonical_replay_exports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as CanonicalReplayExport | null;
  }

  async generateViaRpc(ctx: TenantContext, periodId: string, notes?: string): Promise<string> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient).rpc('generate_canonical_replay_export', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_notes:     notes ?? null,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw mapDbError(error as Error);
    return data as string;
  }
}

// ── Replay Hash Registry ──────────────────────────────────────────────────────

export class ReplayHashRegistryRepository extends BaseRepository<ReplayHashRegistry, ReplayHashRegistryInsert, ReplayHashRegistryUpdate> {
  constructor(db: SupabaseClient<Database>) {
    super(db, 'replay_hash_registry');
  }

  override async findById(ctx: TenantContext, id: string): Promise<ReplayHashRegistry | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_hash_registry')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ReplayHashRegistry | null;
  }

  async findByPeriodAndType(
    ctx:      TenantContext,
    periodId: string,
    hashType: ReplayHashTypeEnum,
  ): Promise<ReplayHashRegistry | null> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_hash_registry')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .eq('hash_type', hashType)
      .maybeSingle();
    if (error) throw mapDbError(error as Error);
    return (data ?? null) as ReplayHashRegistry | null;
  }

  async findAllByPeriod(ctx: TenantContext, periodId: string): Promise<ReplayHashRegistry[]> {
    if (ctx.organizationId === null) throw new Error('Organization context required');
    const { data, error } = await (this.db as AnyClient)
      .from('replay_hash_registry')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('hash_type', { ascending: true });
    if (error) throw mapDbError(error as Error);
    return (data ?? []) as ReplayHashRegistry[];
  }
}
