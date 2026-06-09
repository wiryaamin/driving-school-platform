import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';
import type {
  ComplianceEvent,
  AgiSubmission,
  AgiSubmissionLine,
  VatDeclaration,
  VatDeclarationLine,
  FilingCertification,
  SaftExport,
  RetentionPolicy,
  RegulatoryExportHash,
  CanonicalizationProfile,
  ReplayAssertion,
  DeterministicExportEntry,
  CertificationSnapshot,
  RegulatoryCertification,
  RegulatoryEvidencePackage,
  ExportLineageRecord,
  SigningKeyRegistry,
  CertificateSignature,
  AuthorityReceipt,
  SubmissionEnvelope,
  RegulatoryEndpoint,
  TransportManifest,
  SubmissionDelivery,
  DeliveryAttempt,
  DeliveryAttemptOutcomeEnum,
  TrustAnchor,
  CertificateChain,
  SignedAuthorityReceipt,
  TimestampAuthority,
  TemporalEvidenceRecord,
  TimestampSignatureRegistry,
  ChronologyLineage,
  TemporalTrustSnapshot,
  ReplayValidationSnapshot,
  CanonicalSerializerRegistry,
  ReplayRangeWindow,
  ChronologyArchiveBatch,
  AgiSubmissionStatusEnum,
  VatDeclarationStatusEnum,
  FilingEntityTypeEnum,
  SaftExportStatusEnum,
  SaftExportScopeEnum,
  RetentionPolicyTypeEnum,
  AgiCorrectionReasonEnum,
  VatCorrectionTypeEnum,
  ReplayAssertionStatusEnum,
  RegulatoryCertificationTypeEnum,
} from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import {
  ComplianceEventRepository,
  AgiSubmissionRepository,
  AgiSubmissionLineRepository,
  VatDeclarationRepository,
  VatDeclarationLineRepository,
  FilingCertificationRepository,
  SaftExportRepository,
  RetentionPolicyRepository,
  RegulatoryExportHashRepository,
  CanonicalizationProfileRepository,
  ReplayAssertionRepository,
  DeterministicExportRegistryRepository,
  CertificationSnapshotRepository,
} from '../repositories/compliance.repository.js';
import { assertPermission } from '../middleware/rbac.middleware.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class ComplianceService {
  private readonly eventRepo:      ComplianceEventRepository;
  private readonly agiSubRepo:     AgiSubmissionRepository;
  private readonly agiLineRepo:    AgiSubmissionLineRepository;
  private readonly vatDeclRepo:    VatDeclarationRepository;
  private readonly vatLineRepo:    VatDeclarationLineRepository;
  private readonly filingCertRepo: FilingCertificationRepository;
  private readonly saftRepo:       SaftExportRepository;
  private readonly retentionRepo:  RetentionPolicyRepository;
  private readonly regHashRepo:    RegulatoryExportHashRepository;
  private readonly canonRepo:      CanonicalizationProfileRepository;
  private readonly assertionRepo:  ReplayAssertionRepository;
  private readonly derRepo:        DeterministicExportRegistryRepository;
  private readonly snapshotRepo:   CertificationSnapshotRepository;

  constructor(db: SupabaseClient<Database>) {
    this.eventRepo      = new ComplianceEventRepository(db);
    this.agiSubRepo     = new AgiSubmissionRepository(db);
    this.agiLineRepo    = new AgiSubmissionLineRepository(db);
    this.vatDeclRepo    = new VatDeclarationRepository(db);
    this.vatLineRepo    = new VatDeclarationLineRepository(db);
    this.filingCertRepo = new FilingCertificationRepository(db);
    this.saftRepo       = new SaftExportRepository(db);
    this.retentionRepo  = new RetentionPolicyRepository(db);
    this.regHashRepo    = new RegulatoryExportHashRepository(db);
    this.canonRepo      = new CanonicalizationProfileRepository(db);
    this.assertionRepo  = new ReplayAssertionRepository(db);
    this.derRepo        = new DeterministicExportRegistryRepository(db);
    this.snapshotRepo   = new CertificationSnapshotRepository(db);
  }

  // ── Compliance Events ─────────────────────────────────────────────────────

  async getComplianceEvents(ctx: TenantContext, limit?: number): Promise<ComplianceEvent[]> {
    assertPermission(ctx, 'finance:compliance:read');
    return this.eventRepo.findByOrg(ctx, limit);
  }

  async getEntityEvents(ctx: TenantContext, entityType: string, entityId: string): Promise<ComplianceEvent[]> {
    assertPermission(ctx, 'finance:compliance:read');
    return this.eventRepo.findByEntity(ctx, entityType, entityId);
  }

  // ── AGI Submissions ───────────────────────────────────────────────────────

  async generateAgiSubmission(ctx: TenantContext, agiExportId: string): Promise<string> {
    assertPermission(ctx, 'finance:payroll:manage');
    const { data, error } = await (this.agiSubRepo['db'] as AnyClient)
      .rpc('generate_agi_submission', {
        p_org_id:         ctx.organizationId,
        p_agi_export_id:  agiExportId,
        p_actor_id:       ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async certifyAgiSubmission(ctx: TenantContext, submissionId: string): Promise<string> {
    assertPermission(ctx, 'finance:payroll:manage');
    const { data, error } = await (this.agiSubRepo['db'] as AnyClient)
      .rpc('certify_agi_submission', {
        p_submission_id: submissionId,
        p_actor_id:      ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async getAgiSubmissions(ctx: TenantContext, status?: AgiSubmissionStatusEnum): Promise<AgiSubmission[]> {
    assertPermission(ctx, 'finance:payroll:read');
    return this.agiSubRepo.findByOrg(ctx, status);
  }

  async getAgiSubmission(ctx: TenantContext, id: string): Promise<AgiSubmission> {
    assertPermission(ctx, 'finance:payroll:read');
    return this.agiSubRepo.findByIdOrFail(ctx, id);
  }

  async getAgiSubmissionLines(ctx: TenantContext, submissionId: string): Promise<AgiSubmissionLine[]> {
    assertPermission(ctx, 'finance:payroll:read');
    return this.agiLineRepo.findBySubmission(ctx, submissionId);
  }

  async createAgiCorrection(
    ctx: TenantContext,
    originalSubmissionId: string,
    correctionReason: AgiCorrectionReasonEnum,
    description: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:payroll:manage');
    const { data, error } = await (this.agiSubRepo['db'] as AnyClient)
      .rpc('create_agi_correction', {
        p_org_id:                  ctx.organizationId,
        p_original_submission_id:  originalSubmissionId,
        p_correction_reason:       correctionReason,
        p_description:             description,
        p_actor_id:                ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── VAT Declarations ──────────────────────────────────────────────────────

  async generateVatDeclaration(ctx: TenantContext, vatPeriodId: string): Promise<string> {
    assertPermission(ctx, 'finance:vat:manage');
    const { data, error } = await (this.vatDeclRepo['db'] as AnyClient)
      .rpc('generate_vat_declaration', {
        p_org_id:        ctx.organizationId,
        p_vat_period_id: vatPeriodId,
        p_actor_id:      ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async certifyVatDeclaration(ctx: TenantContext, declarationId: string): Promise<string> {
    assertPermission(ctx, 'finance:vat:manage');
    const { data, error } = await (this.vatDeclRepo['db'] as AnyClient)
      .rpc('certify_vat_declaration', {
        p_declaration_id: declarationId,
        p_actor_id:       ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async getVatDeclarations(ctx: TenantContext, status?: VatDeclarationStatusEnum): Promise<VatDeclaration[]> {
    assertPermission(ctx, 'finance:vat:read');
    return this.vatDeclRepo.findByOrg(ctx, status);
  }

  async getVatDeclaration(ctx: TenantContext, id: string): Promise<VatDeclaration> {
    assertPermission(ctx, 'finance:vat:read');
    return this.vatDeclRepo.findByIdOrFail(ctx, id);
  }

  async getVatDeclarationLines(ctx: TenantContext, declarationId: string): Promise<VatDeclarationLine[]> {
    assertPermission(ctx, 'finance:vat:read');
    return this.vatLineRepo.findByDeclaration(ctx, declarationId);
  }

  async createVatCorrection(
    ctx: TenantContext,
    originalDeclarationId: string,
    correctionType: VatCorrectionTypeEnum,
    description: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:vat:manage');
    const { data, error } = await (this.vatDeclRepo['db'] as AnyClient)
      .rpc('create_vat_correction', {
        p_org_id:                    ctx.organizationId,
        p_original_declaration_id:   originalDeclarationId,
        p_correction_type:           correctionType,
        p_description:               description,
        p_actor_id:                  ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Filing Certifications ─────────────────────────────────────────────────

  async validateFilingReplay(
    ctx: TenantContext,
    filingType: FilingEntityTypeEnum,
    filingId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.filingCertRepo['db'] as AnyClient)
      .rpc('validate_filing_replay', {
        p_org_id:      ctx.organizationId,
        p_filing_type: filingType,
        p_filing_id:   filingId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getFilingCertifications(ctx: TenantContext, entityType?: FilingEntityTypeEnum): Promise<FilingCertification[]> {
    assertPermission(ctx, 'finance:compliance:read');
    let q = (this.filingCertRepo['db'] as AnyClient)
      .from('filing_certifications')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false });
    if (entityType) q = q.eq('entity_type', entityType);
    const { data } = await q;
    return (data ?? []) as FilingCertification[];
  }

  // ── SAF-T Exports ─────────────────────────────────────────────────────────

  async generateSaftExport(
    ctx: TenantContext,
    periodStart: string,
    periodEnd: string,
    scope?: SaftExportScopeEnum,
  ): Promise<string> {
    assertPermission(ctx, 'finance:compliance:manage');
    const { data, error } = await (this.saftRepo['db'] as AnyClient)
      .rpc('generate_saf_t_export', {
        p_org_id:       ctx.organizationId,
        p_period_start: periodStart,
        p_period_end:   periodEnd,
        p_scope:        scope ?? 'full',
        p_actor_id:     ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async getSaftExports(ctx: TenantContext, status?: SaftExportStatusEnum): Promise<SaftExport[]> {
    assertPermission(ctx, 'finance:compliance:read');
    return this.saftRepo.findByOrg(ctx, status);
  }

  async getSaftExport(ctx: TenantContext, id: string): Promise<SaftExport> {
    assertPermission(ctx, 'finance:compliance:read');
    return this.saftRepo.findByIdOrFail(ctx, id);
  }

  // ── Retention Policies ────────────────────────────────────────────────────

  async getRetentionPolicies(ctx: TenantContext, activeOnly?: boolean): Promise<RetentionPolicy[]> {
    assertPermission(ctx, 'finance:compliance:read');
    return this.retentionRepo.findByOrg(ctx, activeOnly ?? true);
  }

  async enforceRetentionPolicy(
    ctx: TenantContext,
    policyType: RetentionPolicyTypeEnum,
    referenceDate?: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:manage');
    const { data, error } = await (this.retentionRepo['db'] as AnyClient)
      .rpc('enforce_retention_policy', {
        p_org_id:         ctx.organizationId,
        p_policy_type:    policyType,
        p_reference_date: referenceDate ?? null,
        p_actor_id:       ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Regulatory Export Hashes ──────────────────────────────────────────────

  async getRegulatoryExportHashes(ctx: TenantContext, exportType?: string): Promise<RegulatoryExportHash[]> {
    assertPermission(ctx, 'finance:compliance:read');
    return this.regHashRepo.findByOrg(ctx, exportType);
  }

  // ── Phase 5A.1: Canonicalization Profiles ────────────────────────────────────

  async getCanonicalizationProfiles(_ctx: TenantContext, activeOnly = true): Promise<CanonicalizationProfile[]> {
    return this.canonRepo.findAll(activeOnly);
  }

  // ── Phase 5A.1: Replay Assertions ────────────────────────────────────────────

  async assertReplayDeterminism(
    ctx: TenantContext,
    entityType: string,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:manage');
    const { data, error } = await (this.assertionRepo['db'] as AnyClient)
      .rpc('assert_replay_determinism', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getReplayAssertions(ctx: TenantContext, status?: ReplayAssertionStatusEnum): Promise<ReplayAssertion[]> {
    assertPermission(ctx, 'finance:compliance:read');
    return this.assertionRepo.findByOrg(ctx, status);
  }

  // ── Phase 5A.1: Deterministic Export Registry ─────────────────────────────────

  async getDeterministicExports(ctx: TenantContext, exportType?: string): Promise<DeterministicExportEntry[]> {
    assertPermission(ctx, 'finance:compliance:read');
    return this.derRepo.findByOrg(ctx, exportType);
  }

  // ── Phase 5A.1: Certification Snapshots ──────────────────────────────────────

  async createCertificationSnapshot(
    ctx: TenantContext,
    entityType: string,
    entityId: string,
  ): Promise<string> {
    assertPermission(ctx, 'finance:compliance:manage');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('create_certification_snapshot', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_actor_id:    ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async validateCertificationReplay(
    ctx: TenantContext,
    snapshotId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('validate_certification_replay', {
        p_snapshot_id: snapshotId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getCertificationSnapshots(
    ctx: TenantContext,
    entityType?: string,
    entityId?: string,
  ): Promise<CertificationSnapshot[]> {
    assertPermission(ctx, 'finance:compliance:read');
    if (entityType && entityId) {
      return this.snapshotRepo.findByEntity(ctx, entityType, entityId);
    }
    const { data } = await (this.snapshotRepo['db'] as AnyClient)
      .from('certification_snapshots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .limit(50);
    return (data ?? []) as CertificationSnapshot[];
  }

  // ── Phase 5A.2: Canonical Payload Builder ────────────────────────────────────

  async buildCanonicalPayload(
    ctx: TenantContext,
    entityType: string,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('build_canonical_payload', {
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_org_id:      ctx.organizationId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Phase 5A.3: Canonical Serialization Validation ───────────────────────────

  async runCanonicalValidation(ctx: TenantContext): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('run_canonical_validation_suite');
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Phase 5B: Filing Certification & Regulatory Sealing ──────────────────────

  async certifyRegulatoryFiling(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
    certificationtype?: RegulatoryCertificationTypeEnum,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:manage');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('certify_regulatory_filing', {
        p_org_id:             ctx.organizationId,
        p_entity_type:        entityType,
        p_entity_id:          entityId,
        p_certification_type: certificationtype ?? 'regulatory_seal',
        p_reason:             reason ?? '',
        p_actor_id:           ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async generateFilingCertificate(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('generate_filing_certificate', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_actor_id:    ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifyFilingCertificate(
    ctx: TenantContext,
    certificationId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_filing_certificate', {
        p_certification_id: certificationId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async buildRegulatoryEvidencePackage(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:manage');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('build_regulatory_evidence_package', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_actor_id:    ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifyExportLineage(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_export_lineage', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async generateReplayCertificate(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:manage');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('generate_replay_certificate', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_actor_id:    ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getRegulatoryCertifications(
    ctx: TenantContext,
    entityType?: FilingEntityTypeEnum,
    entityId?: string,
  ): Promise<RegulatoryCertification[]> {
    assertPermission(ctx, 'finance:compliance:read');
    let q = (this.snapshotRepo['db'] as AnyClient)
      .from('regulatory_certifications')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('certified_at', { ascending: false })
      .limit(100);
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId)   q = q.eq('entity_id', entityId);
    const { data } = await q;
    return (data ?? []) as RegulatoryCertification[];
  }

  async getRegulatoryEvidencePackages(
    ctx: TenantContext,
    entityType?: FilingEntityTypeEnum,
    entityId?: string,
  ): Promise<RegulatoryEvidencePackage[]> {
    assertPermission(ctx, 'finance:compliance:read');
    let q = (this.snapshotRepo['db'] as AnyClient)
      .from('regulatory_evidence_packages')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('assembled_at', { ascending: false })
      .limit(50);
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId)   q = q.eq('entity_id', entityId);
    const { data } = await q;
    return (data ?? []) as RegulatoryEvidencePackage[];
  }

  async getExportLineageRecords(
    ctx: TenantContext,
    entityType?: FilingEntityTypeEnum,
    entityId?: string,
  ): Promise<ExportLineageRecord[]> {
    assertPermission(ctx, 'finance:compliance:read');
    let q = (this.snapshotRepo['db'] as AnyClient)
      .from('export_lineage_records')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('recorded_at', { ascending: false })
      .limit(100);
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId)   q = q.eq('entity_id', entityId);
    const { data } = await q;
    return (data ?? []) as ExportLineageRecord[];
  }

  async runPhase5bValidation(ctx: TenantContext): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('run_phase5b_validation_suite');
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Phase 5C: Cryptographic Trust & Authority Submission ──────────────────────

  async signRegulatoryCertificate(
    ctx: TenantContext,
    certId: string,
    signingKeyId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:write');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('sign_regulatory_certificate', {
        p_org_id:         ctx.organizationId,
        p_cert_id:        certId,
        p_signing_key_id: signingKeyId,
        p_actor_id:       ctx.actorId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifySignature(
    ctx: TenantContext,
    signatureId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_certificate_signature', { p_signature_id: signatureId });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getCertificateSignatures(
    ctx: TenantContext,
    certificationId?: string,
  ): Promise<CertificateSignature[]> {
    assertPermission(ctx, 'finance:compliance:read');
    const db = this.snapshotRepo['db'] as AnyClient;
    let q = db
      .from('certificate_signatures')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('signed_at', { ascending: false });
    if (certificationId) q = q.eq('certification_id', certificationId);
    const { data } = await q;
    return (data ?? []) as CertificateSignature[];
  }

  async getSigningKeys(_ctx: TenantContext): Promise<SigningKeyRegistry[]> {
    const db = this.snapshotRepo['db'] as AnyClient;
    const { data } = await db
      .from('signing_key_registry')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    return (data ?? []) as SigningKeyRegistry[];
  }

  async registerAuthorityReceipt(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
    envelopeId: string,
    authorityName: string,
    authorityReference: string,
    submissionHash: string,
    receiptPayload: Record<string, unknown>,
    acknowledgmentRef?: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:write');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('register_authority_receipt', {
        p_org_id:              ctx.organizationId,
        p_entity_type:         entityType,
        p_entity_id:           entityId,
        p_envelope_id:         envelopeId,
        p_authority_name:      authorityName,
        p_authority_reference: authorityReference,
        p_submission_hash:     submissionHash,
        p_receipt_payload:     receiptPayload,
        p_acknowledgment_ref:  acknowledgmentRef ?? null,
        p_actor_id:            ctx.actorId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifyAuthorityReceipt(
    ctx: TenantContext,
    receiptId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_authority_receipt', { p_receipt_id: receiptId });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getAuthorityReceipts(
    ctx: TenantContext,
    entityType?: FilingEntityTypeEnum,
    entityId?: string,
  ): Promise<AuthorityReceipt[]> {
    assertPermission(ctx, 'finance:compliance:read');
    const db = this.snapshotRepo['db'] as AnyClient;
    let q = db
      .from('authority_receipts')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('recorded_at', { ascending: false });
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId)   q = q.eq('entity_id', entityId);
    const { data } = await q;
    return (data ?? []) as AuthorityReceipt[];
  }

  async buildSubmissionEnvelope(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:write');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('build_submission_envelope', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_actor_id:    ctx.actorId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifySubmissionIntegrity(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_submission_integrity', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getSubmissionEnvelopes(
    ctx: TenantContext,
    entityType?: FilingEntityTypeEnum,
    entityId?: string,
  ): Promise<SubmissionEnvelope[]> {
    assertPermission(ctx, 'finance:compliance:read');
    const db = this.snapshotRepo['db'] as AnyClient;
    let q = db
      .from('submission_envelopes')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('sealed_at', { ascending: false });
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId)   q = q.eq('entity_id', entityId);
    const { data } = await q;
    return (data ?? []) as SubmissionEnvelope[];
  }

  async runPhase5cValidation(ctx: TenantContext): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('run_phase5c_validation_suite');
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Phase 5D: Transport Trust & Regulatory Delivery ──────────────────────────

  async registerRegulatoryEndpoint(
    ctx: TenantContext,
    endpointKey: string,
    authorityName: string,
    protocol: string,
    endpointVersion?: string,
    eidasCompatible?: boolean,
    trustMaterial?: string,
    authorityMetadata?: Record<string, unknown>,
    transportMetadata?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:write');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('register_regulatory_endpoint', {
        p_endpoint_key:       endpointKey,
        p_authority_name:     authorityName,
        p_protocol:           protocol,
        p_endpoint_version:   endpointVersion ?? 'v1',
        p_eidas_compatible:   eidasCompatible ?? false,
        p_trust_material:     trustMaterial ?? null,
        p_authority_metadata: authorityMetadata ?? {},
        p_transport_metadata: transportMetadata ?? {},
        p_actor_id:           ctx.actorId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifyEndpointTrust(
    ctx: TenantContext,
    endpointId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_endpoint_trust', { p_endpoint_id: endpointId });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getRegulatoryEndpoints(_ctx: TenantContext): Promise<RegulatoryEndpoint[]> {
    const db = this.snapshotRepo['db'] as AnyClient;
    const { data } = await db
      .from('regulatory_endpoints')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    return (data ?? []) as RegulatoryEndpoint[];
  }

  async buildTransportManifest(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
    endpointId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:write');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('build_transport_manifest', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_endpoint_id: endpointId,
        p_actor_id:    ctx.actorId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getTransportManifests(
    ctx: TenantContext,
    entityType?: FilingEntityTypeEnum,
    entityId?: string,
  ): Promise<TransportManifest[]> {
    assertPermission(ctx, 'finance:compliance:read');
    const db = this.snapshotRepo['db'] as AnyClient;
    let q = db
      .from('transport_manifests')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('sealed_at', { ascending: false });
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId)   q = q.eq('entity_id', entityId);
    const { data } = await q;
    return (data ?? []) as TransportManifest[];
  }

  async createSubmissionDelivery(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
    transportManifestId: string,
    priorDeliveryId?: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:write');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('create_submission_delivery', {
        p_org_id:                ctx.organizationId,
        p_entity_type:           entityType,
        p_entity_id:             entityId,
        p_transport_manifest_id: transportManifestId,
        p_prior_delivery_id:     priorDeliveryId ?? null,
        p_actor_id:              ctx.actorId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async registerDeliveryAttempt(
    ctx: TenantContext,
    deliveryId: string,
    outcome: DeliveryAttemptOutcomeEnum,
    transportResponse?: Record<string, unknown>,
    authorityAcknowledgment?: string,
    acknowledgedAt?: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:write');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('register_delivery_attempt', {
        p_org_id:                   ctx.organizationId,
        p_delivery_id:              deliveryId,
        p_outcome:                  outcome,
        p_transport_response:       transportResponse ?? {},
        p_authority_acknowledgment: authorityAcknowledgment ?? null,
        p_acknowledged_at:          acknowledgedAt ?? null,
        p_actor_id:                 ctx.actorId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifyDeliveryIntegrity(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_delivery_integrity', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async finalizeDelivery(
    ctx: TenantContext,
    deliveryId: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:write');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('finalize_regulatory_delivery', {
        p_org_id:      ctx.organizationId,
        p_delivery_id: deliveryId,
        p_actor_id:    ctx.actorId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getSubmissionDeliveries(
    ctx: TenantContext,
    entityType?: FilingEntityTypeEnum,
    entityId?: string,
  ): Promise<SubmissionDelivery[]> {
    assertPermission(ctx, 'finance:compliance:read');
    const db = this.snapshotRepo['db'] as AnyClient;
    let q = db
      .from('submission_deliveries')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('initiated_at', { ascending: false });
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId)   q = q.eq('entity_id', entityId);
    const { data } = await q;
    return (data ?? []) as SubmissionDelivery[];
  }

  async getDeliveryAttempts(
    ctx: TenantContext,
    deliveryId: string,
  ): Promise<DeliveryAttempt[]> {
    assertPermission(ctx, 'finance:compliance:read');
    const db = this.snapshotRepo['db'] as AnyClient;
    const { data } = await db
      .from('delivery_attempts')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('delivery_id', deliveryId)
      .order('attempt_number', { ascending: true });
    return (data ?? []) as DeliveryAttempt[];
  }

  async runPhase5dValidation(ctx: TenantContext): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('run_phase5d_validation_suite');
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Phase 5E: PKI Trust Infrastructure ──────────────────────────────────────

  async registerTrustAnchor(
    _ctx: TenantContext,
    params: {
      anchorId: string; commonName: string; organization: string;
      jurisdiction?: string; publicKeyMaterial: string;
      validityNotBefore: string; validityNotAfter: string;
      eidasCompatible?: boolean; trustMaterial?: string;
      parentLineageHash?: string; actorId?: string;
    }
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('register_trust_anchor', {
        p_anchor_id:             params.anchorId,
        p_common_name:           params.commonName,
        p_organization:          params.organization,
        p_jurisdiction:          params.jurisdiction ?? 'SE',
        p_public_key_material:   params.publicKeyMaterial,
        p_validity_not_before:   params.validityNotBefore,
        p_validity_not_after:    params.validityNotAfter,
        p_eidas_compatible:      params.eidasCompatible ?? false,
        p_trust_material:        params.trustMaterial ?? null,
        p_parent_lineage_hash:   params.parentLineageHash ?? null,
        p_actor_id:              params.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getTrustAnchors(_ctx: TenantContext): Promise<TrustAnchor[]> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .from('trust_anchors')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as TrustAnchor[];
  }

  async registerCertificateChain(
    _ctx: TenantContext,
    params: {
      chainId: string; trustAnchorId: string; endpointId?: string;
      subjectCn: string; subjectOrg: string;
      issuerCn: string; issuerOrg: string;
      certMaterial: string; issuerMaterial: string;
      issuerLineage?: unknown[]; validityNotBefore: string; validityNotAfter: string;
      algorithm?: string; actorId?: string;
    }
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('register_certificate_chain', {
        p_chain_id:            params.chainId,
        p_trust_anchor_id:     params.trustAnchorId,
        p_endpoint_id:         params.endpointId ?? null,
        p_subject_cn:          params.subjectCn,
        p_subject_org:         params.subjectOrg,
        p_issuer_cn:           params.issuerCn,
        p_issuer_org:          params.issuerOrg,
        p_cert_material:       params.certMaterial,
        p_issuer_material:     params.issuerMaterial,
        p_issuer_lineage:      params.issuerLineage ?? [],
        p_validity_not_before: params.validityNotBefore,
        p_validity_not_after:  params.validityNotAfter,
        p_algorithm:           params.algorithm ?? 'sha256WithRSAEncryption',
        p_actor_id:            params.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getCertificateChains(_ctx: TenantContext): Promise<CertificateChain[]> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .from('certificate_chains')
      .select('*')
      .order('registered_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as CertificateChain[];
  }

  async validateCertificateChain(
    _ctx: TenantContext,
    chainId: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('validate_certificate_chain', { p_chain_id: chainId });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifyRevocationStatus(
    _ctx: TenantContext,
    chainId: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_revocation_status', { p_chain_id: chainId });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async registerSignedAuthorityReceipt(
    ctx: TenantContext,
    params: {
      authorityReceiptId: string; detachedSignature: string;
      certificateChainId?: string; signatureAlgorithm?: string;
      authorityCertificateRef?: string; actorId?: string;
    }
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('register_signed_authority_receipt', {
        p_org_id:                    ctx.organizationId,
        p_authority_receipt_id:      params.authorityReceiptId,
        p_detached_signature:        params.detachedSignature,
        p_certificate_chain_id:      params.certificateChainId ?? null,
        p_signature_algorithm:       params.signatureAlgorithm ?? 'sha256-keyed',
        p_authority_certificate_ref: params.authorityCertificateRef ?? null,
        p_actor_id:                  params.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getSignedAuthorityReceipts(ctx: TenantContext): Promise<SignedAuthorityReceipt[]> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .from('signed_authority_receipts')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('recorded_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as SignedAuthorityReceipt[];
  }

  async verifyAuthoritySignature(
    _ctx: TenantContext,
    signedReceiptId: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_authority_signature', { p_signed_receipt_id: signedReceiptId });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifyTransportAuthenticity(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_transport_authenticity', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async runPhase5eValidation(_ctx: TenantContext): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('run_phase5e_validation_suite');
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Phase 5F: Temporal Evidence & Cryptographic Replay Integrity ─────────────

  async registerTimestampAuthority(
    _ctx: TenantContext,
    params: {
      authorityId: string; commonName: string; organization: string;
      jurisdiction?: string; publicKeyMaterial: string;
      validityNotBefore: string; validityNotAfter: string;
      trustAnchorId?: string; parentLineageHash?: string;
      eidasCompatible?: boolean; actorId?: string;
    }
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('register_timestamp_authority', {
        p_authority_id:        params.authorityId,
        p_common_name:         params.commonName,
        p_organization:        params.organization,
        p_jurisdiction:        params.jurisdiction ?? 'SE',
        p_public_key_material: params.publicKeyMaterial,
        p_validity_not_before: params.validityNotBefore,
        p_validity_not_after:  params.validityNotAfter,
        p_trust_anchor_id:     params.trustAnchorId ?? null,
        p_parent_lineage_hash: params.parentLineageHash ?? null,
        p_eidas_compatible:    params.eidasCompatible ?? false,
        p_actor_id:            params.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getTimestampAuthorities(_ctx: TenantContext): Promise<TimestampAuthority[]> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .from('timestamp_authorities')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as TimestampAuthority[];
  }

  async issueTimestampEvidence(
    ctx: TenantContext,
    params: {
      entityType: FilingEntityTypeEnum; entityId: string;
      authorityId: string; timestampValue: string;
      payloadHash: string; timestampSignature: string;
      actorId?: string;
    }
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('issue_timestamp_evidence', {
        p_org_id:               ctx.organizationId,
        p_entity_type:          params.entityType,
        p_entity_id:            params.entityId,
        p_authority_id:         params.authorityId,
        p_timestamp_value:      params.timestampValue,
        p_payload_hash:         params.payloadHash,
        p_timestamp_signature:  params.timestampSignature,
        p_actor_id:             params.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getTemporalEvidenceRecords(ctx: TenantContext, entityId?: string): Promise<TemporalEvidenceRecord[]> {
    let q = (this.snapshotRepo['db'] as AnyClient)
      .from('temporal_evidence_records')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('timestamp_value', { ascending: false });
    if (entityId) q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as TemporalEvidenceRecord[];
  }

  async verifyTimestampSignature(
    _ctx: TenantContext,
    evidenceId: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_timestamp_signature', { p_evidence_id: evidenceId });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifyTemporalNonrepudiation(
    _ctx: TenantContext,
    evidenceId: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_temporal_nonrepudiation', { p_evidence_id: evidenceId });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getChronologyLineage(ctx: TenantContext, entityId?: string): Promise<ChronologyLineage[]> {
    let q = (this.snapshotRepo['db'] as AnyClient)
      .from('chronology_lineage')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('sequence_number', { ascending: true });
    if (entityId) q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as ChronologyLineage[];
  }

  async validateCertificateAtTimestamp(
    _ctx: TenantContext,
    chainId: string,
    atTimestamp: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('validate_certificate_at_timestamp', { p_chain_id: chainId, p_at_timestamp: atTimestamp });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async validateRevocationAtTimestamp(
    _ctx: TenantContext,
    chainId: string,
    atTimestamp: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('validate_revocation_at_timestamp', { p_chain_id: chainId, p_at_timestamp: atTimestamp });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async reconstructHistoricalTrustState(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
    atTimestamp: string
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('reconstruct_historical_trust_state', {
        p_org_id:       ctx.organizationId,
        p_entity_type:  entityType,
        p_entity_id:    entityId,
        p_at_timestamp: atTimestamp,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifyTemporalChainIntegrity(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_temporal_chain_integrity', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async createTemporalSnapshot(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
    atTimestamp: string,
    actorId?: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('create_temporal_snapshot', {
        p_org_id:       ctx.organizationId,
        p_entity_type:  entityType,
        p_entity_id:    entityId,
        p_at_timestamp: atTimestamp,
        p_actor_id:     actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getTemporalTrustSnapshots(ctx: TenantContext, entityId?: string): Promise<TemporalTrustSnapshot[]> {
    let q = (this.snapshotRepo['db'] as AnyClient)
      .from('temporal_trust_snapshots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('snapshot_timestamp', { ascending: false });
    if (entityId) q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as TemporalTrustSnapshot[];
  }

  async generateTemporalReplayCertificate(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
    atTimestamp: string,
    actorId?: string
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('generate_temporal_replay_certificate', {
        p_org_id:       ctx.organizationId,
        p_entity_type:  entityType,
        p_entity_id:    entityId,
        p_at_timestamp: atTimestamp,
        p_actor_id:     actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getReplayValidationSnapshots(ctx: TenantContext, entityId?: string): Promise<ReplayValidationSnapshot[]> {
    let q = (this.snapshotRepo['db'] as AnyClient)
      .from('replay_validation_snapshots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('validation_timestamp', { ascending: false });
    if (entityId) q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as ReplayValidationSnapshot[];
  }

  async getTimestampSignatureRegistry(_ctx: TenantContext): Promise<TimestampSignatureRegistry[]> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .from('timestamp_signature_registry')
      .select('*')
      .order('registered_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as TimestampSignatureRegistry[];
  }

  async runPhase5fValidation(_ctx: TenantContext): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('run_phase5f_validation_suite');
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Phase 5F-Audit: Serializer Registry ──────────────────────────────────────

  async registerSerializerProfile(
    _ctx: TenantContext,
    params: {
      serializerKey: string; serializerVersion: string; canonicalizationStrategy: string;
      introducedPhase: string; replayCompatible?: boolean; deterministic?: boolean;
      chronologyCompatible?: boolean; evidenceCompatible?: boolean;
      trustReconstructionCompatible?: boolean; replayNotes?: string; actorId?: string;
    }
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('register_serializer_profile', {
        p_serializer_key:                  params.serializerKey,
        p_serializer_version:              params.serializerVersion,
        p_canonicalization_strategy:       params.canonicalizationStrategy,
        p_introduced_phase:                params.introducedPhase,
        p_replay_compatible:               params.replayCompatible ?? true,
        p_deterministic:                   params.deterministic ?? true,
        p_chronology_compatible:           params.chronologyCompatible ?? true,
        p_evidence_compatible:             params.evidenceCompatible ?? true,
        p_trust_reconstruction_compatible: params.trustReconstructionCompatible ?? true,
        p_replay_notes:                    params.replayNotes ?? null,
        p_actor_id:                        params.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getSerializerRegistry(_ctx: TenantContext): Promise<CanonicalSerializerRegistry[]> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .from('canonical_serializer_registry')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as CanonicalSerializerRegistry[];
  }

  async validateSerializerCompatibility(
    _ctx: TenantContext,
    serializerKey: string,
    checkChronology?: boolean,
    checkEvidence?: boolean,
    checkTrust?: boolean,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('validate_serializer_compatibility', {
        p_serializer_key:    serializerKey,
        p_check_chronology:  checkChronology ?? true,
        p_check_evidence:    checkEvidence ?? true,
        p_check_trust:       checkTrust ?? true,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async reconstructSerializerVersion(
    _ctx: TenantContext,
    serializerKey: string,
    serializerVersion: string,
    canonicalizationStrategy: string,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('reconstruct_serializer_version', {
        p_serializer_key:            serializerKey,
        p_serializer_version:        serializerVersion,
        p_canonicalization_strategy: canonicalizationStrategy,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async verifySerializerReplayCompatibility(
    _ctx: TenantContext,
    serializerKey: string,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('verify_serializer_replay_compatibility', { p_serializer_key: serializerKey });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Phase 5F-Audit: Security Context ──────────────────────────────────────────

  async assertTemporalSecurityContext(
    ctx: TenantContext,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:read');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('assert_temporal_security_context', {
        p_org_id:   ctx.organizationId,
        p_actor_id: ctx.actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  // ── Phase 5F-Audit: Scalability ────────────────────────────────────────────────

  async createReplayRangeWindow(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
    windowStart: string,
    windowEnd: string,
    actorId?: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:manage');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('create_replay_range_window', {
        p_org_id:       ctx.organizationId,
        p_entity_type:  entityType,
        p_entity_id:    entityId,
        p_window_start: windowStart,
        p_window_end:   windowEnd,
        p_actor_id:     actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getReplayRangeWindows(ctx: TenantContext, entityId?: string): Promise<ReplayRangeWindow[]> {
    assertPermission(ctx, 'finance:compliance:read');
    let q = (this.snapshotRepo['db'] as AnyClient)
      .from('replay_range_windows')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('window_start', { ascending: false });
    if (entityId) q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as ReplayRangeWindow[];
  }

  async prepareChronologyArchiveBatch(
    ctx: TenantContext,
    entityType: FilingEntityTypeEnum,
    entityId: string,
    startSeq: number,
    endSeq: number,
    actorId?: string,
  ): Promise<Record<string, unknown>> {
    assertPermission(ctx, 'finance:compliance:manage');
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('prepare_chronology_archive_batch', {
        p_org_id:      ctx.organizationId,
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_start_seq:   startSeq,
        p_end_seq:     endSeq,
        p_actor_id:    actorId ?? null,
      });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }

  async getChronologyArchiveBatches(ctx: TenantContext, entityId?: string): Promise<ChronologyArchiveBatch[]> {
    assertPermission(ctx, 'finance:compliance:read');
    let q = (this.snapshotRepo['db'] as AnyClient)
      .from('chronology_archive_batches')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('archived_at', { ascending: false });
    if (entityId) q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as ChronologyArchiveBatch[];
  }

  async runPhase5fAuditValidation(_ctx: TenantContext): Promise<Record<string, unknown>> {
    const { data, error } = await (this.snapshotRepo['db'] as AnyClient)
      .rpc('run_phase5f_audit_validation_suite');
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }
}
