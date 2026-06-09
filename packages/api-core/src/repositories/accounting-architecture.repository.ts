import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  AccountingLayerRegistryEntry,
  ReplayValidationDelta,
  ReplayCertification,
  CertifyPeriodResult,
  ReplayIntegrityCertificate,
  ReplayExecutionJob,
  CanonicalExportHash,
  AccountingLayerTypeEnum,
  ReplayCertificationStatusEnum,
  ReplayJobTypeEnum,
  ReplayJobStatusEnum,
  CanonicalExportTypeEnum,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { NotFoundError } from '../errors/service-errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

// ── AccountingLayerRegistryRepository ────────────────────────────────────────

type LayerRow    = Database['public']['Tables']['accounting_layer_registry']['Row'];
type LayerInsert = Database['public']['Tables']['accounting_layer_registry']['Insert'];
type LayerUpdate = Database['public']['Tables']['accounting_layer_registry']['Update'];

function toLayer(r: LayerRow): AccountingLayerRegistryEntry {
  return {
    id:                 r.id,
    layerName:          r.layer_name,
    layerType:          r.layer_type,
    tableNames:         r.table_names,
    description:        r.description,
    isMutable:          r.is_mutable,
    isSourceOfTruth:    r.is_source_of_truth,
    isDerived:          r.is_derived,
    sortOrder:          r.sort_order,
    createdAt:          r.created_at,
  };
}

export class AccountingLayerRegistryRepository
  extends BaseRepository<LayerRow, LayerInsert, LayerUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'accounting_layer_registry');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<LayerRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('accounting_layer_registry')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as LayerRow | null;
  }

  async findAll(): Promise<AccountingLayerRegistryEntry[]> {
    const { data } = await (this.db as AnyClient)
      .from('accounting_layer_registry')
      .select('*')
      .order('sort_order', { ascending: true });
    return (data ?? []).map(toLayer);
  }

  async findByType(type: AccountingLayerTypeEnum): Promise<AccountingLayerRegistryEntry[]> {
    const { data } = await (this.db as AnyClient)
      .from('accounting_layer_registry')
      .select('*')
      .eq('layer_type', type)
      .order('sort_order', { ascending: true });
    return (data ?? []).map(toLayer);
  }
}

// ── ReplayValidationDeltaRepository ──────────────────────────────────────────

type DeltaRow    = Database['public']['Tables']['replay_validation_deltas']['Row'];
type DeltaInsert = Database['public']['Tables']['replay_validation_deltas']['Insert'];

function toDelta(r: DeltaRow): ReplayValidationDelta {
  return {
    id:             r.id,
    organizationId: r.organization_id,
    periodId:       r.period_id,
    replayRunId:    r.replay_run_id,
    accountCode:    r.account_code,
    deltaType:      r.delta_type,
    ledgerDebit:    r.ledger_debit,
    ledgerCredit:   r.ledger_credit,
    ledgerBalance:  r.ledger_balance,
    cacheDebit:     r.cache_debit,
    cacheCredit:    r.cache_credit,
    cacheBalance:   r.cache_balance,
    deltaAmount:    r.delta_amount,
    createdAt:      r.created_at,
  };
}

export class ReplayValidationDeltaRepository
  extends BaseRepository<DeltaRow, DeltaInsert, Partial<DeltaInsert>>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'replay_validation_deltas');
  }

  override async findById(ctx: TenantContext, id: string): Promise<DeltaRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('replay_validation_deltas')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    return (data ?? null) as DeltaRow | null;
  }

  async findByRun(ctx: TenantContext, replayRunId: string): Promise<ReplayValidationDelta[]> {
    const { data } = await (this.db as AnyClient)
      .from('replay_validation_deltas')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('replay_run_id', replayRunId)
      .order('delta_amount', { ascending: false });
    return (data ?? []).map(toDelta);
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<ReplayValidationDelta[]> {
    const { data } = await (this.db as AnyClient)
      .from('replay_validation_deltas')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false });
    return (data ?? []).map(toDelta);
  }
}

// ── ReplayCertificationRepository ────────────────────────────────────────────

type CertRow    = Database['public']['Tables']['replay_certifications']['Row'];
type CertInsert = Database['public']['Tables']['replay_certifications']['Insert'];

function toCert(r: CertRow): ReplayCertification {
  return {
    id:                  r.id,
    organizationId:      r.organization_id,
    periodId:            r.period_id,
    replayRunId:         r.replay_run_id,
    replayHash:          r.replay_hash,
    certificationHash:   r.certification_hash,
    status:              r.status,
    deltaCount:          r.delta_count,
    certifiedAt:         r.certified_at,
    certifiedBy:         r.certified_by,
    revokedAt:           r.revoked_at,
    revocationReason:    r.revocation_reason,
  };
}

export class ReplayCertificationRepository
  extends BaseRepository<CertRow, CertInsert, Partial<CertInsert>>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'replay_certifications');
  }

  override async findById(ctx: TenantContext, id: string): Promise<CertRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('replay_certifications')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    return (data ?? null) as CertRow | null;
  }

  async findByPeriod(
    ctx:      TenantContext,
    periodId: string,
    status?:  ReplayCertificationStatusEnum,
  ): Promise<ReplayCertification[]> {
    let q = (this.db as AnyClient)
      .from('replay_certifications')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('certified_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data } = await q;
    return (data ?? []).map(toCert);
  }

  async getActiveCertification(ctx: TenantContext, periodId: string): Promise<ReplayCertification | null> {
    const { data } = await (this.db as AnyClient)
      .from('replay_certifications')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .eq('status', 'certified')
      .order('certified_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? toCert(data as CertRow) : null;
  }

  async certifyViaRpc(ctx: TenantContext, periodId: string): Promise<CertifyPeriodResult> {
    const { data, error } = await (this.db as AnyClient).rpc('certify_period_replay', {
      p_org_id:    ctx.organizationId,
      p_period_id: periodId,
      p_actor_id:  ctx.actorId ?? null,
    });
    if (error) throw error;
    return data as CertifyPeriodResult;
  }
}

// ── ReplayIntegrityCertificateRepository ─────────────────────────────────────

type RicRow    = Database['public']['Tables']['replay_integrity_certificates']['Row'];
type RicInsert = Database['public']['Tables']['replay_integrity_certificates']['Insert'];

function toRic(r: RicRow): ReplayIntegrityCertificate {
  return {
    id:                   r.id,
    organizationId:       r.organization_id,
    fiscalYearId:         r.fiscal_year_id,
    certificateHash:      r.certificate_hash,
    periodCount:          r.period_count,
    certifiedPeriodCount: r.certified_period_count,
    allPeriodsCertified:  r.all_periods_certified,
    periodHashes:         r.period_hashes,
    generatedAt:          r.generated_at,
    generatedBy:          r.generated_by,
  };
}

export class ReplayIntegrityCertificateRepository
  extends BaseRepository<RicRow, RicInsert, Partial<RicInsert>>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'replay_integrity_certificates');
  }

  override async findById(ctx: TenantContext, id: string): Promise<RicRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('replay_integrity_certificates')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    return (data ?? null) as RicRow | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<ReplayIntegrityCertificate> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('replay_integrity_certificates', id);
    return toRic(row);
  }

  async findByFiscalYear(ctx: TenantContext, fiscalYearId: string): Promise<ReplayIntegrityCertificate[]> {
    const { data } = await (this.db as AnyClient)
      .from('replay_integrity_certificates')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('fiscal_year_id', fiscalYearId)
      .order('generated_at', { ascending: false });
    return (data ?? []).map(toRic);
  }

  async generateViaRpc(ctx: TenantContext, fiscalYearId: string): Promise<string> {
    const { data, error } = await (this.db as AnyClient).rpc('generate_integrity_certificate', {
      p_org_id:          ctx.organizationId,
      p_fiscal_year_id:  fiscalYearId,
      p_actor_id:        ctx.actorId ?? null,
    });
    if (error) throw error;
    return data as string;
  }
}

// ── ReplayExecutionJobRepository ──────────────────────────────────────────────

type JobRow    = Database['public']['Tables']['replay_execution_jobs']['Row'];
type JobInsert = Database['public']['Tables']['replay_execution_jobs']['Insert'];
type JobUpdate = Database['public']['Tables']['replay_execution_jobs']['Update'];

function toJob(r: JobRow): ReplayExecutionJob {
  return {
    id:              r.id,
    organizationId:  r.organization_id,
    periodId:        r.period_id,
    fiscalYearId:    r.fiscal_year_id,
    jobType:         r.job_type,
    status:          r.status,
    priority:        r.priority,
    replayRunId:     r.replay_run_id,
    requestedBy:     r.requested_by,
    queuedAt:        r.queued_at,
    startedAt:       r.started_at,
    completedAt:     r.completed_at,
    errorDetail:     r.error_detail,
    resultData:      r.result_data,
    createdAt:       r.created_at,
    updatedAt:       r.updated_at,
  };
}

export class ReplayExecutionJobRepository
  extends BaseRepository<JobRow, JobInsert, JobUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'replay_execution_jobs');
  }

  override async findById(ctx: TenantContext, id: string): Promise<JobRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('replay_execution_jobs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    return (data ?? null) as JobRow | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<ReplayExecutionJob> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('replay_execution_jobs', id);
    return toJob(row);
  }

  async findByStatus(ctx: TenantContext, status: ReplayJobStatusEnum): Promise<ReplayExecutionJob[]> {
    const { data } = await (this.db as AnyClient)
      .from('replay_execution_jobs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('status', status)
      .order('priority', { ascending: false })
      .order('queued_at', { ascending: true });
    return (data ?? []).map(toJob);
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<ReplayExecutionJob[]> {
    const { data } = await (this.db as AnyClient)
      .from('replay_execution_jobs')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false });
    return (data ?? []).map(toJob);
  }

  async enqueueViaRpc(
    ctx:           TenantContext,
    periodId:      string | null,
    fiscalYearId:  string | null,
    jobType:       ReplayJobTypeEnum,
    priority:      number,
  ): Promise<string> {
    const { data, error } = await (this.db as AnyClient).rpc('enqueue_replay_job', {
      p_org_id:          ctx.organizationId,
      p_period_id:       periodId,
      p_fiscal_year_id:  fiscalYearId,
      p_job_type:        jobType,
      p_priority:        priority,
      p_actor_id:        ctx.actorId ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async dequeueViaRpc(ctx: TenantContext): Promise<unknown> {
    const { data, error } = await (this.db as AnyClient).rpc('dequeue_replay_job', {
      p_org_id: ctx.organizationId,
    });
    if (error) throw error;
    return data;
  }
}

// ── CanonicalExportHashRepository ────────────────────────────────────────────

type CehRow    = Database['public']['Tables']['canonical_export_hashes']['Row'];
type CehInsert = Database['public']['Tables']['canonical_export_hashes']['Insert'];

function toCeh(r: CehRow): CanonicalExportHash {
  return {
    id:              r.id,
    organizationId:  r.organization_id,
    periodId:        r.period_id,
    fiscalYearId:    r.fiscal_year_id,
    exportType:      r.export_type,
    exportId:        r.export_id,
    hashValue:       r.hash_value,
    algorithm:       r.algorithm,
    generatedAt:     r.generated_at,
    generatedBy:     r.generated_by,
  };
}

export class CanonicalExportHashRepository
  extends BaseRepository<CehRow, CehInsert, Partial<CehInsert>>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'canonical_export_hashes');
  }

  override async findById(ctx: TenantContext, id: string): Promise<CehRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('canonical_export_hashes')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    return (data ?? null) as CehRow | null;
  }

  async findByPeriod(ctx: TenantContext, periodId: string): Promise<CanonicalExportHash[]> {
    const { data } = await (this.db as AnyClient)
      .from('canonical_export_hashes')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .order('generated_at', { ascending: false });
    return (data ?? []).map(toCeh);
  }

  async findByExportId(ctx: TenantContext, exportId: string): Promise<CanonicalExportHash | null> {
    const { data } = await (this.db as AnyClient)
      .from('canonical_export_hashes')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('export_id', exportId)
      .maybeSingle();
    return data ? toCeh(data as CehRow) : null;
  }

  async findByType(
    ctx:        TenantContext,
    periodId:   string,
    exportType: CanonicalExportTypeEnum,
  ): Promise<CanonicalExportHash[]> {
    const { data } = await (this.db as AnyClient)
      .from('canonical_export_hashes')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('period_id', periodId)
      .eq('export_type', exportType)
      .order('generated_at', { ascending: false });
    return (data ?? []).map(toCeh);
  }
}
