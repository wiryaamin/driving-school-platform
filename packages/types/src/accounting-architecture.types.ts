import type { Json } from './database.types.js';

// ── Re-export Phase 4H-A enum types ──────────────────────────────────────────
export type {
  AccountingLayerTypeEnum,
  ReplayDeltaTypeEnum,
  ReplayCertificationStatusEnum,
  ReplayJobTypeEnum,
  ReplayJobStatusEnum,
  CanonicalExportTypeEnum,
} from './database.types.js';

// ── Accounting Layer Registry ─────────────────────────────────────────────────

export interface AccountingLayerRegistryEntry {
  id:                 string;
  layerName:          string;
  layerType:          import('./database.types.js').AccountingLayerTypeEnum;
  tableNames:         string[];
  description:        string;
  isMutable:          boolean;
  isSourceOfTruth:    boolean;
  isDerived:          boolean;
  sortOrder:          number;
  createdAt:          string;
}

// ── Replay Validation Deltas (storage-light divergence records) ───────────────

export interface ReplayValidationDelta {
  id:              string;
  organizationId:  string;
  periodId:        string;
  replayRunId:     string;
  accountCode:     string;
  deltaType:       import('./database.types.js').ReplayDeltaTypeEnum;
  ledgerDebit:     number | null;
  ledgerCredit:    number | null;
  ledgerBalance:   number | null;
  cacheDebit:      number | null;
  cacheCredit:     number | null;
  cacheBalance:    number | null;
  deltaAmount:     number;
  createdAt:       string;
}

export interface DeltaSummary {
  organizationId:       string;
  periodId:             string;
  periodStart:          string;
  periodEnd:            string;
  replayRunId:          string;
  totalDeltas:          number;
  balanceMismatchCount: number;
  missingFromCacheCount:number;
  missingFromLedgerCount:number;
  orphanCount:          number;
  maxDeltaAmount:       number | null;
  totalDeltaAmount:     number | null;
  detectedAt:           string;
}

// ── Replay Certifications ─────────────────────────────────────────────────────

export interface ReplayCertification {
  id:                  string;
  organizationId:      string;
  periodId:            string;
  replayRunId:         string;
  replayHash:          string;
  certificationHash:   string;
  status:              import('./database.types.js').ReplayCertificationStatusEnum;
  deltaCount:          number;
  certifiedAt:         string;
  certifiedBy:         string | null;
  revokedAt:           string | null;
  revocationReason:    string | null;
}

export interface CertifyPeriodResult {
  certificationId:   string;
  periodId:          string;
  replayRunId:       string;
  replayHash:        string | null;
  certificationHash: string;
  deltaCount:        number;
  status:            string;
  certifiedAt:       string;
}

// ── Replay Integrity Certificates (fiscal-year level) ────────────────────────

export interface ReplayIntegrityCertificate {
  id:                   string;
  organizationId:       string;
  fiscalYearId:         string;
  certificateHash:      string;
  periodCount:          number;
  certifiedPeriodCount: number;
  allPeriodsCertified:  boolean;
  periodHashes:         Json;
  generatedAt:          string;
  generatedBy:          string | null;
}

// ── Replay Execution Jobs ─────────────────────────────────────────────────────

export interface ReplayExecutionJob {
  id:              string;
  organizationId:  string;
  periodId:        string | null;
  fiscalYearId:    string | null;
  jobType:         import('./database.types.js').ReplayJobTypeEnum;
  status:          import('./database.types.js').ReplayJobStatusEnum;
  priority:        number;
  replayRunId:     string | null;
  requestedBy:     string | null;
  queuedAt:        string;
  startedAt:       string | null;
  completedAt:     string | null;
  errorDetail:     string | null;
  resultData:      Json;
  createdAt:       string;
  updatedAt:       string;
}

export interface EnqueueReplayJobRequest {
  periodId?:      string;
  fiscalYearId?:  string;
  jobType:        import('./database.types.js').ReplayJobTypeEnum;
  priority?:      number;
}

// ── Canonical Export Hashes ───────────────────────────────────────────────────

export interface CanonicalExportHash {
  id:              string;
  organizationId:  string;
  periodId:        string | null;
  fiscalYearId:    string | null;
  exportType:      import('./database.types.js').CanonicalExportTypeEnum;
  exportId:        string;
  hashValue:       string;
  algorithm:       string;
  generatedAt:     string;
  generatedBy:     string | null;
}

// ── View result types ─────────────────────────────────────────────────────────

export interface CertificationDashboardRow {
  periodId:               string;
  organizationId:         string;
  periodStart:            string;
  periodEnd:              string;
  periodStatus:           string;
  certificationId:        string | null;
  certificationStatus:    string | null;
  certifiedReplayHash:    string | null;
  certificationHash:      string | null;
  certifiedDeltaCount:    number | null;
  certifiedAt:            string | null;
  certifiedBy:            string | null;
  latestRunId:            string | null;
  latestRunHash:          string | null;
  latestRunStatus:        string | null;
  latestRunDivergences:   number | null;
  lastReplayedAt:         string | null;
  hashStable:             boolean;
  currentDeltaCount:      number;
}

export interface ReplayExecutionStatusRow extends ReplayExecutionJob {
  elapsedSeconds: number;
}
