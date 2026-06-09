import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  ComplianceEvent,
  AgiSubmission,
  AgiSubmissionLine,
  AgiCorrection,
  VatDeclaration,
  VatDeclarationLine,
  VatCorrection,
  FilingCertification,
  ComplianceReplayLink,
  SaftExport,
  RetentionPolicy,
  RegulatoryExportHash,
  CanonicalizationProfile,
  ReplayAssertion,
  DeterministicExportEntry,
  CertificationSnapshot,
  FilingEntityTypeEnum,
  SaftExportStatusEnum,
  AgiSubmissionStatusEnum,
  VatDeclarationStatusEnum,
  ReplayAssertionStatusEnum,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { BaseRepository } from './base.repository.js';
import { NotFoundError } from '../errors/service-errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

// ── ComplianceEventRepository ─────────────────────────────────────────────────

type CeRow    = Database['public']['Tables']['compliance_events']['Row'];
type CeInsert = Database['public']['Tables']['compliance_events']['Insert'];
type CeUpdate = Database['public']['Tables']['compliance_events']['Update'];

function toCe(r: CeRow): ComplianceEvent {
  return {
    id:             r.id,
    organizationId: r.organization_id,
    eventType:      r.event_type,
    entityType:     r.entity_type,
    entityId:       r.entity_id,
    actorId:        r.actor_id,
    metadata:       (r.metadata ?? {}) as Record<string, unknown>,
    occurredAt:     r.occurred_at,
  };
}

export class ComplianceEventRepository
  extends BaseRepository<CeRow, CeInsert, CeUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'compliance_events');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<CeRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('compliance_events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as CeRow | null;
  }

  async findByOrg(ctx: TenantContext, limit = 50): Promise<ComplianceEvent[]> {
    const { data } = await (this.db as AnyClient)
      .from('compliance_events')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    return ((data ?? []) as CeRow[]).map(toCe);
  }

  async findByEntity(ctx: TenantContext, entityType: string, entityId: string): Promise<ComplianceEvent[]> {
    const { data } = await (this.db as AnyClient)
      .from('compliance_events')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('occurred_at', { ascending: false });
    return ((data ?? []) as CeRow[]).map(toCe);
  }
}

// ── AgiSubmissionRepository ───────────────────────────────────────────────────

type AsiRow    = Database['public']['Tables']['agi_submissions']['Row'];
type AsiInsert = Database['public']['Tables']['agi_submissions']['Insert'];
type AsiUpdate = Database['public']['Tables']['agi_submissions']['Update'];

function toAsi(r: AsiRow): AgiSubmission {
  return {
    id:                     r.id,
    organizationId:         r.organization_id,
    agiExportId:            r.agi_export_id,
    declarationPeriodStart: r.declaration_period_start,
    declarationPeriodEnd:   r.declaration_period_end,
    submissionStatus:       r.submission_status,
    submissionReference:    r.submission_reference,
    submissionHash:         r.submission_hash,
    skatteverketReceipt:    r.skatteverket_receipt,
    acceptedAt:             r.accepted_at,
    rejectedAt:             r.rejected_at,
    rejectionReason:        r.rejection_reason,
    correctionOfId:         r.correction_of_id,
    submittedAt:            r.submitted_at,
    submittedBy:            r.submitted_by,
    certifiedAt:            r.certified_at,
    certifiedBy:            r.certified_by,
    certificationHash:      r.certification_hash,
    notes:                  r.notes,
    metadata:               (r.metadata ?? {}) as Record<string, unknown>,
    createdAt:              r.created_at,
    createdBy:              r.created_by,
  };
}

export class AgiSubmissionRepository
  extends BaseRepository<AsiRow, AsiInsert, AsiUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'agi_submissions');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<AsiRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('agi_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as AsiRow | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<AgiSubmission> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('agi_submissions', id);
    return toAsi(row);
  }

  async findByOrg(ctx: TenantContext, status?: AgiSubmissionStatusEnum): Promise<AgiSubmission[]> {
    let q = (this.db as AnyClient)
      .from('agi_submissions')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('submission_status', status);
    const { data } = await q;
    return ((data ?? []) as AsiRow[]).map(toAsi);
  }
}

// ── AgiSubmissionLineRepository ───────────────────────────────────────────────

type AslRow    = Database['public']['Tables']['agi_submission_lines']['Row'];
type AslInsert = Database['public']['Tables']['agi_submission_lines']['Insert'];
type AslUpdate = Database['public']['Tables']['agi_submission_lines']['Update'];

function toAsl(r: AslRow): AgiSubmissionLine {
  return {
    id:              r.id,
    organizationId:  r.organization_id,
    submissionId:    r.submission_id,
    agiExportLineId: r.agi_export_line_id,
    employeeId:      r.employee_id,
    grossSalary:     r.gross_salary,
    withheldTax:     r.withheld_tax,
    employerContrib: r.employer_contrib,
    benefitsAmount:  r.benefits_amount,
    pensionAmount:   r.pension_amount,
    isCorrected:     r.is_corrected,
    correctionNote:  r.correction_note,
    createdAt:       r.created_at,
  };
}

export class AgiSubmissionLineRepository
  extends BaseRepository<AslRow, AslInsert, AslUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'agi_submission_lines');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<AslRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('agi_submission_lines')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as AslRow | null;
  }

  async findBySubmission(ctx: TenantContext, submissionId: string): Promise<AgiSubmissionLine[]> {
    const { data } = await (this.db as AnyClient)
      .from('agi_submission_lines')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('submission_id', submissionId);
    return ((data ?? []) as AslRow[]).map(toAsl);
  }
}

// ── VatDeclarationRepository ──────────────────────────────────────────────────

type VdRow    = Database['public']['Tables']['vat_declarations']['Row'];
type VdInsert = Database['public']['Tables']['vat_declarations']['Insert'];
type VdUpdate = Database['public']['Tables']['vat_declarations']['Update'];

function toVd(r: VdRow): VatDeclaration {
  return {
    id:                   r.id,
    organizationId:       r.organization_id,
    vatPeriodId:          r.vat_period_id,
    declarationStatus:    r.declaration_status,
    declarationReference: r.declaration_reference,
    box05TaxableTurnover: r.box_05_taxable_turnover,
    box10OutputVat25:     r.box_10_output_vat_25,
    box11OutputVat12:     r.box_11_output_vat_12,
    box12OutputVat6:      r.box_12_output_vat_6,
    box30InputVat:        r.box_30_input_vat,
    box49NetVat:          r.box_49_net_vat,
    declarationHash:      r.declaration_hash,
    skatteverketReceipt:  r.skatteverket_receipt,
    correctionOfId:       r.correction_of_id,
    submittedAt:          r.submitted_at,
    submittedBy:          r.submitted_by,
    certifiedAt:          r.certified_at,
    certifiedBy:          r.certified_by,
    certificationHash:    r.certification_hash,
    notes:                r.notes,
    metadata:             (r.metadata ?? {}) as Record<string, unknown>,
    createdAt:            r.created_at,
    createdBy:            r.created_by,
  };
}

export class VatDeclarationRepository
  extends BaseRepository<VdRow, VdInsert, VdUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'vat_declarations');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<VdRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('vat_declarations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as VdRow | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<VatDeclaration> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('vat_declarations', id);
    return toVd(row);
  }

  async findByOrg(ctx: TenantContext, status?: VatDeclarationStatusEnum): Promise<VatDeclaration[]> {
    let q = (this.db as AnyClient)
      .from('vat_declarations')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('declaration_status', status);
    const { data } = await q;
    return ((data ?? []) as VdRow[]).map(toVd);
  }

  async findByPeriod(ctx: TenantContext, vatPeriodId: string): Promise<VatDeclaration | null> {
    const { data } = await (this.db as AnyClient)
      .from('vat_declarations')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('vat_period_id', vatPeriodId)
      .is('correction_of_id', null)
      .maybeSingle();
    return data ? toVd(data as VdRow) : null;
  }
}

// ── VatDeclarationLineRepository ──────────────────────────────────────────────

type VdlRow    = Database['public']['Tables']['vat_declaration_lines']['Row'];
type VdlInsert = Database['public']['Tables']['vat_declaration_lines']['Insert'];
type VdlUpdate = Database['public']['Tables']['vat_declaration_lines']['Update'];

function toVdl(r: VdlRow): VatDeclarationLine {
  return {
    id:             r.id,
    organizationId: r.organization_id,
    declarationId:  r.declaration_id,
    boxCode:        r.box_code,
    boxName:        r.box_name,
    baseAmount:     r.base_amount,
    vatAmount:      r.vat_amount,
    vatRateCode:    r.vat_rate_code,
    sortOrder:      r.sort_order,
    createdAt:      r.created_at,
  };
}

export class VatDeclarationLineRepository
  extends BaseRepository<VdlRow, VdlInsert, VdlUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'vat_declaration_lines');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<VdlRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('vat_declaration_lines')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as VdlRow | null;
  }

  async findByDeclaration(ctx: TenantContext, declarationId: string): Promise<VatDeclarationLine[]> {
    const { data } = await (this.db as AnyClient)
      .from('vat_declaration_lines')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('declaration_id', declarationId)
      .order('sort_order', { ascending: true });
    return ((data ?? []) as VdlRow[]).map(toVdl);
  }
}

// ── FilingCertificationRepository ─────────────────────────────────────────────

type FcRow    = Database['public']['Tables']['filing_certifications']['Row'];
type FcInsert = Database['public']['Tables']['filing_certifications']['Insert'];
type FcUpdate = Database['public']['Tables']['filing_certifications']['Update'];

function toFc(r: FcRow): FilingCertification {
  return {
    id:                  r.id,
    organizationId:      r.organization_id,
    entityType:          r.entity_type,
    entityId:            r.entity_id,
    replayRunId:         r.replay_run_id,
    replayHash:          r.replay_hash,
    filingHash:          r.filing_hash,
    certificationHash:   r.certification_hash,
    certificationStatus: r.certification_status,
    certifiedAt:         r.certified_at,
    certifiedBy:         r.certified_by,
    revokedAt:           r.revoked_at,
    revocationReason:    r.revocation_reason,
    metadata:            (r.metadata ?? {}) as Record<string, unknown>,
    createdAt:           r.created_at,
    createdBy:           r.created_by,
  };
}

export class FilingCertificationRepository
  extends BaseRepository<FcRow, FcInsert, FcUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'filing_certifications');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<FcRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('filing_certifications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as FcRow | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<FilingCertification> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('filing_certifications', id);
    return toFc(row);
  }

  async findByEntity(ctx: TenantContext, entityType: FilingEntityTypeEnum, entityId: string): Promise<FilingCertification[]> {
    const { data } = await (this.db as AnyClient)
      .from('filing_certifications')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
    return ((data ?? []) as FcRow[]).map(toFc);
  }
}

// ── SaftExportRepository ──────────────────────────────────────────────────────

type SeRow    = Database['public']['Tables']['saf_t_exports']['Row'];
type SeInsert = Database['public']['Tables']['saf_t_exports']['Insert'];
type SeUpdate = Database['public']['Tables']['saf_t_exports']['Update'];

function toSe(r: SeRow): SaftExport {
  return {
    id:                    r.id,
    organizationId:        r.organization_id,
    fiscalYearId:          r.fiscal_year_id,
    periodStart:           r.period_start,
    periodEnd:             r.period_end,
    exportScope:           r.export_scope,
    exportStatus:          r.export_status,
    saftVersion:           r.saft_version,
    journalEntryCount:     r.journal_entry_count,
    transactionCount:      r.transaction_count,
    accountCount:          r.account_count,
    contentHash:           r.content_hash,
    exportFileReference:   r.export_file_reference,
    submittedAt:           r.submitted_at,
    submittedBy:           r.submitted_by,
    skatteverketReference: r.skatteverket_reference,
    notes:                 r.notes,
    metadata:              (r.metadata ?? {}) as Record<string, unknown>,
    createdAt:             r.created_at,
    createdBy:             r.created_by,
  };
}

export class SaftExportRepository
  extends BaseRepository<SeRow, SeInsert, SeUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'saf_t_exports');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<SeRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('saf_t_exports')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as SeRow | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<SaftExport> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('saf_t_exports', id);
    return toSe(row);
  }

  async findByOrg(ctx: TenantContext, status?: SaftExportStatusEnum): Promise<SaftExport[]> {
    let q = (this.db as AnyClient)
      .from('saf_t_exports')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('period_start', { ascending: false });
    if (status) q = q.eq('export_status', status);
    const { data } = await q;
    return ((data ?? []) as SeRow[]).map(toSe);
  }
}

// ── RetentionPolicyRepository ─────────────────────────────────────────────────

type RpRow    = Database['public']['Tables']['retention_policies']['Row'];
type RpInsert = Database['public']['Tables']['retention_policies']['Insert'];
type RpUpdate = Database['public']['Tables']['retention_policies']['Update'];

function toRp(r: RpRow): RetentionPolicy {
  return {
    id:              r.id,
    organizationId:  r.organization_id,
    policyType:      r.policy_type,
    retentionYears:  r.retention_years,
    legalBasis:      r.legal_basis,
    appliesToTable:  r.applies_to_table,
    appliesToColumn: r.applies_to_column,
    isActive:        r.is_active,
    effectiveFrom:   r.effective_from,
    effectiveTo:     r.effective_to,
    notes:           r.notes,
    createdAt:       r.created_at,
    createdBy:       r.created_by,
    updatedAt:       r.updated_at,
  };
}

export class RetentionPolicyRepository
  extends BaseRepository<RpRow, RpInsert, RpUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'retention_policies');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<RpRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('retention_policies')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as RpRow | null;
  }

  async findByOrg(ctx: TenantContext, activeOnly = true): Promise<RetentionPolicy[]> {
    let q = (this.db as AnyClient)
      .from('retention_policies')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('policy_type', { ascending: true });
    if (activeOnly) q = q.eq('is_active', true);
    const { data } = await q;
    return ((data ?? []) as RpRow[]).map(toRp);
  }
}

// ── RegulatoryExportHashRepository ────────────────────────────────────────────

type RehRow    = Database['public']['Tables']['regulatory_export_hashes']['Row'];
type RehInsert = Database['public']['Tables']['regulatory_export_hashes']['Insert'];
type RehUpdate = Database['public']['Tables']['regulatory_export_hashes']['Update'];

function toReh(r: RehRow): RegulatoryExportHash {
  return {
    id:               r.id,
    organizationId:   r.organization_id,
    exportType:       r.export_type,
    exportId:         r.export_id,
    periodStart:      r.period_start,
    periodEnd:        r.period_end,
    hashValue:        r.hash_value,
    hashAlgorithm:    r.hash_algorithm,
    hashInputSummary: r.hash_input_summary,
    generatedAt:      r.generated_at,
    generatedBy:      r.generated_by,
  };
}

export class RegulatoryExportHashRepository
  extends BaseRepository<RehRow, RehInsert, RehUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'regulatory_export_hashes');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<RehRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('regulatory_export_hashes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as RehRow | null;
  }

  async findByExport(ctx: TenantContext, exportType: string, exportId: string): Promise<RegulatoryExportHash | null> {
    const { data } = await (this.db as AnyClient)
      .from('regulatory_export_hashes')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('export_type', exportType)
      .eq('export_id', exportId)
      .maybeSingle();
    return data ? toReh(data as RehRow) : null;
  }

  async findByOrg(ctx: TenantContext, exportType?: string): Promise<RegulatoryExportHash[]> {
    let q = (this.db as AnyClient)
      .from('regulatory_export_hashes')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('generated_at', { ascending: false });
    if (exportType) q = q.eq('export_type', exportType);
    const { data } = await q;
    return ((data ?? []) as RehRow[]).map(toReh);
  }
}

// ── CanonicalizationProfileRepository ────────────────────────────────────────

type CpRow    = Database['public']['Tables']['canonicalization_profiles']['Row'];
type CpInsert = Database['public']['Tables']['canonicalization_profiles']['Insert'];
type CpUpdate = Database['public']['Tables']['canonicalization_profiles']['Update'];

function toCp(r: CpRow): CanonicalizationProfile {
  return {
    id:            r.id,
    profileName:   r.profile_name,
    profileType:   r.profile_type,
    description:   r.description,
    configuration: (r.configuration ?? {}) as Record<string, unknown>,
    isActive:      r.is_active,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  };
}

export class CanonicalizationProfileRepository
  extends BaseRepository<CpRow, CpInsert, CpUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'canonicalization_profiles');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<CpRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('canonicalization_profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as CpRow | null;
  }

  async findAll(activeOnly = true): Promise<CanonicalizationProfile[]> {
    let q = (this.db as AnyClient)
      .from('canonicalization_profiles')
      .select('*')
      .order('profile_name', { ascending: true });
    if (activeOnly) q = q.eq('is_active', true);
    const { data } = await q;
    return ((data ?? []) as CpRow[]).map(toCp);
  }

  async findByName(_ctx: TenantContext, profileName: string): Promise<CanonicalizationProfile | null> {
    const { data } = await (this.db as AnyClient)
      .from('canonicalization_profiles')
      .select('*')
      .eq('profile_name', profileName)
      .maybeSingle();
    return data ? toCp(data as CpRow) : null;
  }
}

// ── ReplayAssertionRepository ─────────────────────────────────────────────────

type RaRow    = Database['public']['Tables']['replay_assertions']['Row'];
type RaInsert = Database['public']['Tables']['replay_assertions']['Insert'];
type RaUpdate = Database['public']['Tables']['replay_assertions']['Update'];

function toRa(r: RaRow): ReplayAssertion {
  return {
    id:                r.id,
    organizationId:    r.organization_id,
    entityType:        r.entity_type,
    entityId:          r.entity_id,
    assertionType:     r.assertion_type,
    assertionStatus:   r.assertion_status,
    storedHash:        r.stored_hash,
    recomputedHash:    r.recomputed_hash,
    hashMatched:       r.hash_matched,
    assertionMetadata: (r.assertion_metadata ?? {}) as Record<string, unknown>,
    assertedAt:        r.asserted_at,
    assertedBy:        r.asserted_by,
  };
}

export class ReplayAssertionRepository
  extends BaseRepository<RaRow, RaInsert, RaUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'replay_assertions');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<RaRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('replay_assertions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as RaRow | null;
  }

  async findByEntity(ctx: TenantContext, entityType: string, entityId: string): Promise<ReplayAssertion[]> {
    const { data } = await (this.db as AnyClient)
      .from('replay_assertions')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('asserted_at', { ascending: false });
    return ((data ?? []) as RaRow[]).map(toRa);
  }

  async findByOrg(ctx: TenantContext, status?: ReplayAssertionStatusEnum): Promise<ReplayAssertion[]> {
    let q = (this.db as AnyClient)
      .from('replay_assertions')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('asserted_at', { ascending: false });
    if (status) q = q.eq('assertion_status', status);
    const { data } = await q;
    return ((data ?? []) as RaRow[]).map(toRa);
  }
}

// ── DeterministicExportRegistryRepository ────────────────────────────────────

type DerRow    = Database['public']['Tables']['deterministic_export_registry']['Row'];
type DerInsert = Database['public']['Tables']['deterministic_export_registry']['Insert'];
type DerUpdate = Database['public']['Tables']['deterministic_export_registry']['Update'];

function toDer(r: DerRow): DeterministicExportEntry {
  return {
    id:               r.id,
    organizationId:   r.organization_id,
    exportType:       r.export_type,
    exportId:         r.export_id,
    canonicalPayload: (r.canonical_payload ?? {}) as Record<string, unknown>,
    replaySafeHash:   r.replay_safe_hash,
    profileName:      r.profile_name,
    registeredAt:     r.registered_at,
    registeredBy:     r.registered_by,
  };
}

export class DeterministicExportRegistryRepository
  extends BaseRepository<DerRow, DerInsert, DerUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'deterministic_export_registry');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<DerRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('deterministic_export_registry')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as DerRow | null;
  }

  async findByExport(ctx: TenantContext, exportType: string, exportId: string): Promise<DeterministicExportEntry | null> {
    const { data } = await (this.db as AnyClient)
      .from('deterministic_export_registry')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('export_type', exportType)
      .eq('export_id', exportId)
      .maybeSingle();
    return data ? toDer(data as DerRow) : null;
  }

  async findByOrg(ctx: TenantContext, exportType?: string): Promise<DeterministicExportEntry[]> {
    let q = (this.db as AnyClient)
      .from('deterministic_export_registry')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('registered_at', { ascending: false });
    if (exportType) q = q.eq('export_type', exportType);
    const { data } = await q;
    return ((data ?? []) as DerRow[]).map(toDer);
  }
}

// ── CertificationSnapshotRepository ──────────────────────────────────────────

type CsRow    = Database['public']['Tables']['certification_snapshots']['Row'];
type CsInsert = Database['public']['Tables']['certification_snapshots']['Insert'];
type CsUpdate = Database['public']['Tables']['certification_snapshots']['Update'];

function toCs(r: CsRow): CertificationSnapshot {
  return {
    id:              r.id,
    organizationId:  r.organization_id,
    entityType:      r.entity_type,
    entityId:        r.entity_id,
    snapshotHash:    r.snapshot_hash,
    entityState:     (r.entity_state ?? {}) as Record<string, unknown>,
    certificationId: r.certification_id,
    createdAt:       r.created_at,
    createdBy:       r.created_by,
  };
}

export class CertificationSnapshotRepository
  extends BaseRepository<CsRow, CsInsert, CsUpdate>
{
  constructor(db: SupabaseClient<Database>) {
    super(db, 'certification_snapshots');
  }

  override async findById(_ctx: TenantContext, id: string): Promise<CsRow | null> {
    const { data } = await (this.db as AnyClient)
      .from('certification_snapshots')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as CsRow | null;
  }

  async findByIdOrFail(ctx: TenantContext, id: string): Promise<CertificationSnapshot> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError('certification_snapshots', id);
    return toCs(row);
  }

  async findByEntity(ctx: TenantContext, entityType: string, entityId: string): Promise<CertificationSnapshot[]> {
    const { data } = await (this.db as AnyClient)
      .from('certification_snapshots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
    return ((data ?? []) as CsRow[]).map(toCs);
  }
}

// ── Unused type aliases (keep TS from complaining about imports) ───────────────

export type { AgiCorrection, VatCorrection, ComplianceReplayLink };
