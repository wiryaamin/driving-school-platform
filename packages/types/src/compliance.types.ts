// Phase 5A — Swedish Compliance & Regulatory Reporting domain types
// Phase 5A.1 — Deterministic Compliance Replay Hardening domain types

import type {
  ComplianceEventTypeEnum,
  AgiSubmissionStatusEnum,
  AgiCorrectionReasonEnum,
  VatDeclarationStatusEnum,
  VatCorrectionTypeEnum,
  FilingEntityTypeEnum,
  FilingCertificationStatusEnum,
  SaftExportStatusEnum,
  SaftExportScopeEnum,
  RetentionPolicyTypeEnum,
  RetentionEnforcementOutcomeEnum,
  ReplayAssertionTypeEnum,
  ReplayAssertionStatusEnum,
  CanonicalizationProfileTypeEnum,
  RegulatoryCertificationTypeEnum,
  EidasLevelTypeEnum,
  DeliveryStatusEnum,
  DeliveryAttemptOutcomeEnum,
  CertificateRevocationStateEnum,
  TimestampAuthorityStatusEnum,
  ReplayTestStatusEnum,
  SerializerDriftTypeEnum,
  ReplayAlertTypeEnum,
  ReplayAlertSeverityEnum,
  ReplayHealthStatusEnum,
  ReplayCiStatusEnum,
  ShadowRebuildStatusEnum,
  RestoreSimulationStatusEnum,
  ArchiveLifecycleStatusEnum,
  ReplayAnomalyTypeEnum,
} from './database.types.js';

// ── ComplianceEvent ───────────────────────────────────────────────────────────

export interface ComplianceEvent {
  id:             string;
  organizationId: string;
  eventType:      ComplianceEventTypeEnum;
  entityType:     string;
  entityId:       string;
  actorId:        string | null;
  metadata:       Record<string, unknown>;
  occurredAt:     string;
}

// ── AgiSubmission ─────────────────────────────────────────────────────────────

export interface AgiSubmission {
  id:                      string;
  organizationId:          string;
  agiExportId:             string;
  declarationPeriodStart:  string;
  declarationPeriodEnd:    string;
  submissionStatus:        AgiSubmissionStatusEnum;
  submissionReference:     string | null;
  submissionHash:          string;
  skatteverketReceipt:     string | null;
  acceptedAt:              string | null;
  rejectedAt:              string | null;
  rejectionReason:         string | null;
  correctionOfId:          string | null;
  submittedAt:             string | null;
  submittedBy:             string | null;
  certifiedAt:             string | null;
  certifiedBy:             string | null;
  certificationHash:       string | null;
  notes:                   string | null;
  metadata:                Record<string, unknown>;
  createdAt:               string;
  createdBy:               string | null;
}

export interface AgiSubmissionLine {
  id:               string;
  organizationId:   string;
  submissionId:     string;
  agiExportLineId:  string | null;
  employeeId:       string;
  grossSalary:      number;
  withheldTax:      number;
  employerContrib:  number;
  benefitsAmount:   number;
  pensionAmount:    number;
  isCorrected:      boolean;
  correctionNote:   string | null;
  createdAt:        string;
}

export interface AgiCorrection {
  id:                     string;
  organizationId:         string;
  originalSubmissionId:   string;
  correctionSubmissionId: string | null;
  correctionReason:       AgiCorrectionReasonEnum;
  correctionDescription:  string;
  correctionHash:         string;
  createdAt:              string;
  createdBy:              string | null;
}

// ── VatDeclaration ────────────────────────────────────────────────────────────

export interface VatDeclaration {
  id:                    string;
  organizationId:        string;
  vatPeriodId:           string;
  declarationStatus:     VatDeclarationStatusEnum;
  declarationReference:  string | null;
  box05TaxableTurnover:  number;
  box10OutputVat25:      number;
  box11OutputVat12:      number;
  box12OutputVat6:       number;
  box30InputVat:         number;
  box49NetVat:           number;
  declarationHash:       string;
  skatteverketReceipt:   string | null;
  correctionOfId:        string | null;
  submittedAt:           string | null;
  submittedBy:           string | null;
  certifiedAt:           string | null;
  certifiedBy:           string | null;
  certificationHash:     string | null;
  notes:                 string | null;
  metadata:              Record<string, unknown>;
  createdAt:             string;
  createdBy:             string | null;
}

export interface VatDeclarationLine {
  id:             string;
  organizationId: string;
  declarationId:  string;
  boxCode:        string;
  boxName:        string;
  baseAmount:     number;
  vatAmount:      number;
  vatRateCode:    string | null;
  sortOrder:      number;
  createdAt:      string;
}

export interface VatCorrection {
  id:                       string;
  organizationId:           string;
  originalDeclarationId:    string;
  correctionDeclarationId:  string | null;
  correctionType:           VatCorrectionTypeEnum;
  correctionDescription:    string;
  correctionHash:           string;
  createdAt:                string;
  createdBy:                string | null;
}

// ── FilingCertification ───────────────────────────────────────────────────────

export interface FilingCertification {
  id:                   string;
  organizationId:       string;
  entityType:           FilingEntityTypeEnum;
  entityId:             string;
  replayRunId:          string | null;
  replayHash:           string | null;
  filingHash:           string;
  certificationHash:    string;
  certificationStatus:  FilingCertificationStatusEnum;
  certifiedAt:          string | null;
  certifiedBy:          string | null;
  revokedAt:            string | null;
  revocationReason:     string | null;
  metadata:             Record<string, unknown>;
  createdAt:            string;
  createdBy:            string | null;
}

export interface ComplianceReplayLink {
  id:                    string;
  organizationId:        string;
  filingType:            FilingEntityTypeEnum;
  filingId:              string;
  replayCertificationId: string | null;
  replayRunId:           string | null;
  linkHash:              string;
  createdAt:             string;
  createdBy:             string | null;
}

// ── SAF-T Export ──────────────────────────────────────────────────────────────

export interface SaftExport {
  id:                    string;
  organizationId:        string;
  fiscalYearId:          string | null;
  periodStart:           string;
  periodEnd:             string;
  exportScope:           SaftExportScopeEnum;
  exportStatus:          SaftExportStatusEnum;
  saftVersion:           string;
  journalEntryCount:     number;
  transactionCount:      number;
  accountCount:          number;
  contentHash:           string | null;
  exportFileReference:   string | null;
  submittedAt:           string | null;
  submittedBy:           string | null;
  skatteverketReference: string | null;
  notes:                 string | null;
  metadata:              Record<string, unknown>;
  createdAt:             string;
  createdBy:             string | null;
}

// ── Retention ─────────────────────────────────────────────────────────────────

export interface RetentionPolicy {
  id:              string;
  organizationId:  string;
  policyType:      RetentionPolicyTypeEnum;
  retentionYears:  number;
  legalBasis:      string;
  appliesToTable:  string;
  appliesToColumn: string | null;
  isActive:        boolean;
  effectiveFrom:   string;
  effectiveTo:     string | null;
  notes:           string | null;
  createdAt:       string;
  createdBy:       string | null;
  updatedAt:       string;
}

export interface RetentionEnforcementLog {
  id:                  string;
  organizationId:      string;
  policyId:            string;
  policyType:          RetentionPolicyTypeEnum;
  checkDate:           string;
  referenceDate:       string;
  earliestAllowedDate: string;
  outcome:             RetentionEnforcementOutcomeEnum;
  violationDetails:    string | null;
  recordsChecked:      number;
  recordsAtRisk:       number;
  enforcedBy:          string | null;
  metadata:            Record<string, unknown>;
  createdAt:           string;
}

// ── RegulatoryExportHash ──────────────────────────────────────────────────────

export interface RegulatoryExportHash {
  id:               string;
  organizationId:   string;
  exportType:       string;
  exportId:         string;
  periodStart:      string | null;
  periodEnd:        string | null;
  hashValue:        string;
  hashAlgorithm:    string;
  hashInputSummary: string | null;
  generatedAt:      string;
  generatedBy:      string | null;
}

// ── Phase 5A.1 Deterministic Compliance Replay Hardening ──────────────────────

export interface CanonicalizationProfile {
  id:            string;
  profileName:   string;
  profileType:   CanonicalizationProfileTypeEnum;
  description:   string | null;
  configuration: Record<string, unknown>;
  isActive:      boolean;
  createdAt:     string;
  updatedAt:     string;
}

export interface ReplayAssertion {
  id:                 string;
  organizationId:     string;
  entityType:         string;
  entityId:           string;
  assertionType:      ReplayAssertionTypeEnum;
  assertionStatus:    ReplayAssertionStatusEnum;
  storedHash:         string | null;
  recomputedHash:     string | null;
  hashMatched:        boolean;
  assertionMetadata:  Record<string, unknown>;
  assertedAt:         string;
  assertedBy:         string | null;
}

export interface DeterministicExportEntry {
  id:               string;
  organizationId:   string;
  exportType:       string;
  exportId:         string;
  canonicalPayload: Record<string, unknown>;
  replaySafeHash:   string;
  profileName:      string;
  registeredAt:     string;
  registeredBy:     string | null;
}

export interface CertificationSnapshot {
  id:               string;
  organizationId:   string;
  entityType:       string;
  entityId:         string;
  snapshotHash:     string;
  entityState:      Record<string, unknown>;
  certificationId:  string | null;
  createdAt:        string;
  createdBy:        string | null;
}

// ── Phase 5B: Filing Certification & Regulatory Sealing ───────────────────────

export type RegulatoryCertificationType = RegulatoryCertificationTypeEnum;

// ── Phase 5C: Cryptographic Trust & Authority Submission ──────────────────────

export type EidasLevel = EidasLevelTypeEnum;

export interface RegulatoryCertification {
  id:                    string;
  organizationId:        string;
  entityType:            FilingEntityTypeEnum;
  entityId:              string;
  certificationType:     RegulatoryCertificationTypeEnum;
  canonicalPayloadHash:  string;
  serializerVersion:     string;
  replayProfileVersion:  string;
  lineageChainHash:      string;
  priorCertificationId:  string | null;
  filingHash:            string | null;
  certificateHash:       string;
  certificationReason:   string;
  actorId:               string | null;
  metadata:              Record<string, unknown>;
  certifiedAt:           string;
}

export interface RegulatoryEvidencePackage {
  id:                   string;
  organizationId:       string;
  entityType:           FilingEntityTypeEnum;
  entityId:             string;
  manifest:             Record<string, unknown>;
  evidenceHash:         string;
  certificationIds:     unknown[];
  snapshotIds:          unknown[];
  assertionIds:         unknown[];
  chainHash:            string;
  serializationProfile: string;
  replayProfile:        string;
  packageVersion:       string;
  assembledAt:          string;
  assembledBy:          string | null;
}

export interface ExportLineageRecord {
  id:                string;
  organizationId:    string;
  entityType:        FilingEntityTypeEnum;
  entityId:          string;
  sourceHash:        string;
  canonicalHash:     string;
  certificationHash: string | null;
  chainHash:         string;
  priorLineageId:    string | null;
  serializerVersion: string;
  replayProfile:     string;
  recordedAt:        string;
  recordedBy:        string | null;
}

export interface SigningKeyRegistry {
  id:               string;
  keyId:            string;
  algorithm:        string;
  version:          string;
  isActive:         boolean;
  eidasCompatible:  boolean;
  keyFingerprint:   string;
  activatedAt:      string;
  revokedAt:        string | null;
  revocationReason: string | null;
  metadata:         Record<string, unknown>;
  createdAt:        string;
}

export interface CertificateSignature {
  id:                   string;
  organizationId:       string;
  certificationId:      string;
  signingKeyId:         string;
  algorithm:            string;
  signatureVersion:     string;
  signaturePayloadHash: string;
  signatureValue:       string;
  eidasLevel:           EidasLevelTypeEnum | null;
  actorId:              string | null;
  metadata:             Record<string, unknown>;
  signedAt:             string;
}

export interface AuthorityReceipt {
  id:                      string;
  organizationId:          string;
  entityType:              FilingEntityTypeEnum;
  entityId:                string;
  submissionEnvelopeId:    string | null;
  authorityName:           string;
  authorityReference:      string | null;
  submissionHash:          string;
  receiptPayload:          Record<string, unknown>;
  receiptHash:             string;
  acknowledgmentReference: string | null;
  acceptedAt:              string | null;
  rejectedAt:              string | null;
  rejectionReason:         string | null;
  actorId:                 string | null;
  metadata:                Record<string, unknown>;
  recordedAt:              string;
}

export interface SubmissionEnvelope {
  id:                    string;
  organizationId:        string;
  entityType:            FilingEntityTypeEnum;
  entityId:              string;
  certificationId:       string;
  evidencePackageId:     string | null;
  envelopeVersion:       string;
  canonicalPayloadHash:  string;
  certificationManifest: Record<string, unknown>;
  evidenceHash:          string;
  trustChainHash:        string;
  serializerVersion:     string;
  replayProfile:         string;
  authorityMetadata:     Record<string, unknown>;
  replayMetadata:        Record<string, unknown>;
  envelopeHash:          string;
  actorId:               string | null;
  metadata:              Record<string, unknown>;
  sealedAt:              string;
}

// ── Phase 5D: Transport Trust & Regulatory Delivery ───────────────────────────

export type DeliveryStatus         = DeliveryStatusEnum;
export type DeliveryAttemptOutcome = DeliveryAttemptOutcomeEnum;

export interface RegulatoryEndpoint {
  id:                   string;
  endpointKey:          string;
  authorityName:        string;
  protocol:             string;
  endpointVersion:      string;
  trustFingerprint:     string;
  endpointIdentityHash: string;
  isActive:             boolean;
  eidasCompatible:      boolean;
  certificateLineage:   Record<string, unknown>;
  authorityMetadata:    Record<string, unknown>;
  transportMetadata:    Record<string, unknown>;
  revokedAt:            string | null;
  revocationReason:     string | null;
  metadata:             Record<string, unknown>;
  createdAt:            string;
  updatedAt:            string;
}

export interface TransportManifest {
  id:                   string;
  organizationId:       string;
  entityType:           FilingEntityTypeEnum;
  entityId:             string;
  submissionEnvelopeId: string;
  endpointId:           string;
  manifestVersion:      string;
  envelopeHash:         string;
  trustChainHash:       string;
  endpointKey:          string;
  authorityName:        string;
  protocol:             string;
  endpointIdentityHash: string;
  transportMetadata:    Record<string, unknown>;
  authorityMetadata:    Record<string, unknown>;
  serializerVersion:    string;
  replayProfile:        string;
  replayMetadata:       Record<string, unknown>;
  manifestHash:         string;
  actorId:              string | null;
  metadata:             Record<string, unknown>;
  sealedAt:             string;
}

export interface SubmissionDelivery {
  id:                  string;
  organizationId:      string;
  entityType:          FilingEntityTypeEnum;
  entityId:            string;
  transportManifestId: string;
  endpointId:          string;
  priorDeliveryId:     string | null;
  deliveryVersion:     string;
  deliveryChainHash:   string;
  deliveryStatus:      DeliveryStatusEnum;
  deliveryHash:        string;
  finalizedAt:         string | null;
  actorId:             string | null;
  metadata:            Record<string, unknown>;
  initiatedAt:         string;
}

export interface DeliveryAttempt {
  id:                      string;
  organizationId:          string;
  deliveryId:              string;
  attemptNumber:           number;
  attemptOutcome:          DeliveryAttemptOutcomeEnum;
  transportResponse:       Record<string, unknown>;
  responseHash:            string;
  authorityAcknowledgment: string | null;
  acknowledgedAt:          string | null;
  errorDetails:            string | null;
  actorId:                 string | null;
  metadata:                Record<string, unknown>;
  attemptedAt:             string;
}

// ── Phase 5E: PKI Trust Infrastructure & Authority Authenticity ───────────────

export type CertificateRevocationState = CertificateRevocationStateEnum;

export interface TrustAnchor {
  id:                     string;
  anchorId:               string;
  commonName:             string;
  organization:           string;
  jurisdiction:           string;
  anchorFingerprint:      string;
  trustIdentityHash:      string;
  publicKeyMaterial:      string;
  validityNotBefore:      string;
  validityNotAfter:       string;
  isActive:               boolean;
  revokedAt:              string | null;
  revocationReason:       string | null;
  certificateLineageHash: string;
  eidasCompatible:        boolean;
  metadata:               Record<string, unknown>;
  createdAt:              string;
  updatedAt:              string;
}

export interface CertificateChain {
  id:                  string;
  chainId:             string;
  trustAnchorId:       string;
  endpointId:          string | null;
  subjectCommonName:   string;
  subjectOrganization: string;
  issuerCommonName:    string;
  issuerOrganization:  string;
  subjectFingerprint:  string;
  issuerFingerprint:   string;
  certificateHash:     string;
  chainDepth:          number;
  issuerLineage:       unknown[];
  validityNotBefore:   string;
  validityNotAfter:    string;
  revocationState:     CertificateRevocationStateEnum;
  revocationHash:      string | null;
  revokedAt:           string | null;
  revocationReason:    string | null;
  algorithm:           string;
  metadata:            Record<string, unknown>;
  registeredAt:        string;
}

export interface SignedAuthorityReceipt {
  id:                        string;
  organizationId:            string;
  authorityReceiptId:        string;
  certificateChainId:        string | null;
  detachedSignature:         string;
  signatureAlgorithm:        string;
  signaturePayloadHash:      string;
  nonrepudiationHash:        string;
  transportSignatureLineage: string;
  authorityCertificateRef:   string | null;
  verifiedAt:                string | null;
  actorId:                   string | null;
  metadata:                  Record<string, unknown>;
  recordedAt:                string;
}

// ── Phase 5F: Temporal Evidence & Cryptographic Replay Integrity ──────────────

export type TimestampAuthorityStatus = TimestampAuthorityStatusEnum;

export interface TimestampAuthority {
  id:                     string;
  authorityId:            string;
  commonName:             string;
  organization:           string;
  jurisdiction:           string;
  authorityVersion:       string;
  authorityFingerprint:   string;
  authorityIdentityHash:  string;
  publicKeyMaterial:      string;
  validityNotBefore:      string;
  validityNotAfter:       string;
  authorityStatus:        TimestampAuthorityStatusEnum;
  revokedAt:              string | null;
  revocationReason:       string | null;
  authorityLineageHash:   string;
  parentAuthorityId:      string | null;
  trustAnchorId:          string | null;
  eidasCompatible:        boolean;
  metadata:               Record<string, unknown>;
  createdAt:              string;
  updatedAt:              string;
}

export interface TemporalEvidenceRecord {
  id:                          string;
  organizationId:              string;
  entityType:                  FilingEntityTypeEnum;
  entityId:                    string;
  authorityId:                 string;
  timestampValue:              string;
  payloadHash:                 string;
  evidenceHash:                string;
  signaturePayloadHash:        string;
  temporalNonrepudiationHash:  string;
  timestampSignature:          string;
  chronologyHash:              string;
  serializerVersion:           string;
  actorId:                     string | null;
  metadata:                    Record<string, unknown>;
  recordedAt:                  string;
}

export interface TimestampSignatureRegistry {
  id:                   string;
  evidenceId:           string;
  authorityId:          string;
  signatureAlgorithm:   string;
  signatureValue:       string;
  signaturePayloadHash: string;
  nonrepudiationHash:   string;
  verifiedAt:           string | null;
  metadata:             Record<string, unknown>;
  registeredAt:         string;
}

export interface ChronologyLineage {
  id:                   string;
  organizationId:       string;
  entityType:           FilingEntityTypeEnum;
  entityId:             string;
  sequenceNumber:       number;
  evidenceId:           string;
  timestampValue:       string;
  chronologyHash:       string;
  priorChronologyHash:  string | null;
  metadata:             Record<string, unknown>;
  appendedAt:           string;
}

export interface TemporalTrustSnapshot {
  id:                    string;
  organizationId:        string;
  entityType:            FilingEntityTypeEnum;
  entityId:              string;
  snapshotTimestamp:     string;
  trustAnchorState:      Record<string, unknown>;
  certificateChainState: Record<string, unknown>;
  authorityState:        Record<string, unknown>;
  revocationState:       Record<string, unknown>;
  snapshotHash:          string;
  temporalEvidenceId:    string | null;
  actorId:               string | null;
  metadata:              Record<string, unknown>;
  createdAt:             string;
}

export interface ReplayValidationSnapshot {
  id:                  string;
  organizationId:      string;
  entityType:          FilingEntityTypeEnum;
  entityId:            string;
  validationTimestamp: string;
  validationResult:    Record<string, unknown>;
  validationHash:      string;
  checksPassed:        number;
  checksTotal:         number;
  isValid:             boolean;
  temporalSnapshotId:  string | null;
  actorId:             string | null;
  metadata:            Record<string, unknown>;
  validatedAt:         string;
}

// ── Phase 5F-Audit: Serializer Registry ───────────────────────────────────────

export interface CanonicalSerializerRegistry {
  id:                             string;
  serializerKey:                  string;
  serializerVersion:              string;
  canonicalizationStrategy:       string;
  replayCompatible:               boolean;
  deterministic:                  boolean;
  introducedPhase:                string;
  deprecatedPhase:                string | null;
  replayNotes:                    string | null;
  schemaHash:                     string;
  chronologyCompatible:           boolean;
  evidenceCompatible:             boolean;
  trustReconstructionCompatible:  boolean;
  createdAt:                      string;
}

// ── Phase 5F-Audit: Scalability ────────────────────────────────────────────────

export interface ReplayRangeWindow {
  id:                  string;
  organizationId:      string;
  entityType:          FilingEntityTypeEnum;
  entityId:            string;
  windowStart:         string;
  windowEnd:           string;
  chronologyStartSeq:  number;
  chronologyEndSeq:    number;
  evidenceCount:       number;
  windowHash:          string;
  actorId:             string | null;
  metadata:            Record<string, unknown>;
  createdAt:           string;
}

export interface ChronologyArchiveBatch {
  id:             string;
  organizationId: string;
  entityType:     FilingEntityTypeEnum;
  entityId:       string;
  batchStartSeq:  number;
  batchEndSeq:    number;
  batchHash:      string;
  batchSize:      number;
  archiveStatus:  string;
  archivedAt:     string;
  actorId:        string | null;
  metadata:       Record<string, unknown>;
}

// ── Phase 6A: Platform Stabilization Interfaces ───────────────────────────────

export interface ReplayTestRun {
  id:             string;
  organizationId: string;
  entityType:     FilingEntityTypeEnum;
  entityId:       string;
  testType:       string;
  runStatus:      ReplayTestStatusEnum;
  testsRun:       number;
  testsPassed:    number;
  testsFailed:    number;
  runHash:        string | null;
  actorId:        string | null;
  startedAt:      string;
  completedAt:    string | null;
  metadata:       Record<string, unknown>;
}

export interface ReplayTestResult {
  id:                 string;
  runId:              string;
  testName:           string;
  testPassed:         boolean;
  expectedHash:       string | null;
  actualHash:         string | null;
  divergenceDetected: boolean;
  resultDetails:      Record<string, unknown>;
  recordedAt:         string;
}

export interface ReplayReproducibilityReport {
  id:               string;
  organizationId:   string;
  runId1:           string;
  runId2:           string;
  allHashesMatch:   boolean;
  divergenceCount:  number;
  reportHash:       string;
  generatedAt:      string;
}

export interface ReplayChainDriftReport {
  id:               string;
  organizationId:   string;
  entityType:       FilingEntityTypeEnum;
  entityId:         string;
  baselineHash:     string;
  currentHash:      string;
  driftDetected:    boolean;
  reportHash:       string;
  detectedAt:       string;
  actorId:          string | null;
}

export interface SerializerDriftReport {
  id:                  string;
  serializerKey:       string;
  baselineSchemaHash:  string;
  currentSchemaHash:   string;
  driftDetected:       boolean;
  driftType:           SerializerDriftTypeEnum;
  reportHash:          string;
  detectedAt:          string;
}

export interface ReplaySchemaEvolution {
  id:                   string;
  serializerKey:        string;
  fromVersion:          string;
  toVersion:            string;
  fromSchemaHash:       string;
  toSchemaHash:         string;
  backwardCompatible:   boolean;
  chronologyCompatible: boolean;
  breakingChange:       boolean;
  evolutionHash:        string;
  registeredAt:         string;
}

export interface ReplayBenchmarkRun {
  id:              string;
  organizationId:  string;
  benchmarkType:   string;
  scaleFactor:     number;
  elementsTested:  number;
  executionMs:     number;
  throughputRps:   number;
  benchmarkHash:   string;
  actorId:         string | null;
  executedAt:      string;
}

export interface TenantIsolationTestRun {
  id:                string;
  organizationId:    string;
  testType:          string;
  testStatus:        ReplayTestStatusEnum;
  isolationVerified: boolean;
  checksPassed:      number;
  checksTotal:       number;
  testHash:          string | null;
  actorId:           string | null;
  executedAt:        string;
  completedAt:       string | null;
  metadata:          Record<string, unknown>;
}

export interface ReplayHealthCheck {
  id:             string;
  organizationId: string;
  checkType:      string;
  healthStatus:   ReplayHealthStatusEnum;
  checksPassed:   number;
  checksTotal:    number;
  healthHash:     string;
  actorId:        string | null;
  checkedAt:      string;
}

export interface ReplayOperationalAlert {
  id:             string;
  organizationId: string;
  alertType:      ReplayAlertTypeEnum;
  alertSeverity:  ReplayAlertSeverityEnum;
  alertMessage:   string;
  resolvedAt:     string | null;
  alertHash:      string;
  createdAt:      string;
}

// ── Phase 6B: DevOps, Replay CI/CD & Production Operations ───────────────────

export interface ReplayCiRun {
  id:              string;
  organizationId:  string;
  pipelineVersion: string;
  ciStatus:        ReplayCiStatusEnum;
  checksPassed:    number;
  checksTotal:     number;
  runHash:         string;
  actorId:         string | null;
  startedAt:       string;
  completedAt:     string | null;
}

export interface MigrationReproducibilityReport {
  id:                 string;
  organizationId:     string;
  migrationVersion:   string;
  preMigrationHash:   string;
  postMigrationHash:  string;
  isReproducible:     boolean;
  reportHash:         string;
  actorId:            string | null;
  generatedAt:        string;
}

export interface DeploymentIntegrityReport {
  id:                string;
  organizationId:    string;
  deploymentVersion: string;
  replayHashStable:  boolean;
  serializerCompat:  boolean;
  chronologyCont:    boolean;
  appendOnlyOk:      boolean;
  overallIntegrity:  boolean;
  integrityHash:     string;
  actorId:           string | null;
  generatedAt:       string;
}

export interface ReplaySmokeTestResult {
  id:             string;
  organizationId: string;
  ciRunId:        string | null;
  testName:       string;
  testCategory:   string;
  passed:         boolean;
  expectedHash:   string | null;
  actualHash:     string | null;
  resultHash:     string;
  actorId:        string | null;
  executedAt:     string;
}

export interface ShadowRebuildRun {
  id:                string;
  organizationId:    string;
  rebuildVersion:    string;
  rebuildStatus:     ShadowRebuildStatusEnum;
  primaryChainHash:  string | null;
  shadowChainHash:   string | null;
  hashesEquivalent:  boolean;
  checksPassed:      number;
  checksTotal:       number;
  runHash:           string;
  actorId:           string | null;
  startedAt:         string;
  completedAt:       string | null;
}

export interface RestoreSimulationRun {
  id:                string;
  organizationId:    string;
  simulationVersion: string;
  simStatus:         RestoreSimulationStatusEnum;
  preRestoreHash:    string | null;
  postRestoreHash:   string | null;
  hashesMatch:       boolean;
  checksPassed:      number;
  checksTotal:       number;
  simHash:           string;
  actorId:           string | null;
  startedAt:         string;
  completedAt:       string | null;
}

export interface ReplayRestoreBenchmark {
  id:                string;
  organizationId:    string;
  simulationRunId:   string | null;
  elementsRecovered: number;
  elapsedMs:         number;
  throughputRps:     number;
  benchmarkHash:     string;
  actorId:           string | null;
  benchmarkedAt:     string;
}

export interface ReplayArchiveBatch {
  id:               string;
  organizationId:   string;
  entityType:       string;
  archiveStatus:    ArchiveLifecycleStatusEnum;
  elementsArchived: number;
  chainHashBefore:  string;
  chainHashAfter:   string;
  archiveHash:      string;
  actorId:          string | null;
  archivedAt:       string;
}

export interface ReplayOperationalMetric {
  id:                  string;
  organizationId:      string;
  metricType:          string;
  replayThroughputRps: number;
  replayLatencyMs:     number;
  divergenceCount:     number;
  errorCount:          number;
  elementsProcessed:   number;
  metricsHash:         string;
  actorId:             string | null;
  collectedAt:         string;
}

export interface ReplayAnomalyDetection {
  id:             string;
  organizationId: string;
  anomalyType:    ReplayAnomalyTypeEnum;
  entityType:     string;
  entityId:       string | null;
  severity:       'info' | 'warning' | 'critical';
  description:    string;
  detectionHash:  string;
  actorId:        string | null;
  detectedAt:     string;
}
