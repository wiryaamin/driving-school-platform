import type {
  LedgerReplayStatusEnum,
  LedgerReplayTypeEnum,
  ScheduleGenerationTypeEnum,
  SubledgerTypeEnum,
  SubledgerCloseStatusEnum,
  FiscalDependencyTypeEnum,
  ReplayDivergenceTypeEnum,
  ReplayValidationTypeEnum,
  ReplayValidationStatusEnum,
  ReplayHashTypeEnum,
} from './database.types.js';

export type {
  LedgerReplayStatusEnum,
  LedgerReplayTypeEnum,
  ScheduleGenerationTypeEnum,
  SubledgerTypeEnum,
  SubledgerCloseStatusEnum,
  FiscalDependencyTypeEnum,
  ReplayDivergenceTypeEnum,
  ReplayValidationTypeEnum,
  ReplayValidationStatusEnum,
  ReplayHashTypeEnum,
};

// ── Replay ────────────────────────────────────────────────────────────────────

export interface LedgerReplayRun {
  id:                        string;
  organizationId:            string;
  periodId:                  string | null;
  fiscalYearId:              string | null;
  replayType:                LedgerReplayTypeEnum;
  status:                    LedgerReplayStatusEnum;
  startedAt:                 string;
  completedAt:               string | null;
  journalEntriesProcessed:   number;
  journalLinesProcessed:     number;
  accountsReconstructed:     number;
  divergenceCount:           number;
  replayHash:                string | null;
  errorDetail:               string | null;
  actorId:                   string | null;
  createdAt:                 string;
}

export interface ReplaySnapshot {
  id:                    string;
  organizationId:        string;
  periodId:              string;
  replayRunId:           string;
  accountCode:           string;
  reconstructedDebit:    number;
  reconstructedCredit:   number;
  reconstructedBalance:  number;
  cachedDebit:           number | null;
  cachedCredit:          number | null;
  cachedBalance:         number | null;
  divergenceAmount:      number;
  hasDivergence:         boolean;
  createdAt:             string;
}

export interface ReplayStateResult {
  status:               LedgerReplayStatusEnum;
  run_id:               string;
  accounts_processed:   number;
  divergence_count:     number;
  replay_hash:          string | null;
  error?:               string;
}

// ── Schedule Lineage ──────────────────────────────────────────────────────────

export interface ScheduleGeneration {
  id:               string;
  organizationId:   string;
  scheduleType:     ScheduleGenerationTypeEnum;
  sourceId:         string;
  generationNumber: number;
  linesCount:       number;
  totalAmount:      number;
  isCurrent:        boolean;
  supersededAt:     string | null;
  supersededBy:     string | null;
  reason:           string | null;
  metadata:         Record<string, unknown>;
  createdAt:        string;
  createdBy:        string | null;
}

export interface ScheduleGenerationLink {
  id:                  string;
  parentGenerationId:  string;
  childGenerationId:   string;
  linkReason:          string | null;
  createdAt:           string;
}

// ── Fiscal Dependency ─────────────────────────────────────────────────────────

export interface FiscalDependencyEdge {
  id:                 string;
  organizationId:     string;
  dependentPeriodId:  string;
  requiredPeriodId:   string;
  dependencyType:     FiscalDependencyTypeEnum;
  isActive:           boolean;
  notes:              string | null;
  createdAt:          string;
  createdBy:          string | null;
}

export interface ReplayDivergenceEvent {
  id:               string;
  organizationId:   string;
  periodId:         string;
  replayRunId:      string;
  divergenceType:   ReplayDivergenceTypeEnum;
  accountCode:      string | null;
  expectedBalance:  number | null;
  actualBalance:    number | null;
  divergenceAmount: number | null;
  detail:           string | null;
  detectedAt:       string;
  resolvedAt:       string | null;
  resolvedBy:       string | null;
  resolutionNotes:  string | null;
}

export interface CloseDependencyResult {
  status:           'ready' | 'blocked';
  blocking_count:   number;
  blocking_periods: string[];
  dependency_edges: number;
}

export interface ReopenPeriodResult {
  status:    'reopened' | 'already_open' | 'blocked';
  period_id: string;
  reason?:   string;
  error?:    string;
}

// ── Subledger Orchestration ───────────────────────────────────────────────────

export interface SubledgerCloseJob {
  id:             string;
  organizationId: string;
  periodId:       string;
  subledgerType:  SubledgerTypeEnum;
  status:         SubledgerCloseStatusEnum;
  itemsFound:     number;
  itemsReady:     number;
  itemsBlocking:  number;
  checkDetail:    Record<string, unknown>;
  errorDetail:    string | null;
  startedAt:      string | null;
  completedAt:    string | null;
  createdAt:      string;
  updatedAt:      string;
  createdBy:      string | null;
}

export interface SubledgerOrchestrationResult {
  period_id:        string;
  subledgers_run:   number;
  blocking_count:   number;
  all_ready:        boolean;
  jobs:             Array<{
    subledger_type:  SubledgerTypeEnum;
    status:          SubledgerCloseStatusEnum;
    items_blocking:  number;
  }>;
}

// ── Replay Validation ─────────────────────────────────────────────────────────

export interface ReplayValidationReport {
  id:             string;
  organizationId: string;
  periodId:       string;
  replayRunId:    string | null;
  validationType: ReplayValidationTypeEnum;
  status:         ReplayValidationStatusEnum;
  checksRun:      number;
  checksPassed:   number;
  checksFailed:   number;
  reportData:     Record<string, unknown>;
  contentHash:    string;
  notes:          string | null;
  createdAt:      string;
  createdBy:      string | null;
}

export interface CanonicalReplayExport {
  id:             string;
  organizationId: string;
  periodId:       string;
  replayRunId:    string;
  exportContent:  Record<string, unknown>;
  contentHash:    string;
  accountCount:   number;
  totalDebit:     number;
  totalCredit:    number;
  notes:          string | null;
  metadata:       Record<string, unknown>;
  createdAt:      string;
  createdBy:      string | null;
}

export interface ReplayHashRegistry {
  id:             string;
  organizationId: string;
  periodId:       string;
  replayRunId:    string | null;
  hashValue:      string;
  hashType:       ReplayHashTypeEnum;
  createdAt:      string;
  updatedAt:      string;
}

export interface ReplayIntegrityResult {
  period_id:       string;
  overall_status:  ReplayValidationStatusEnum;
  report_id:       string;
  checks:          Array<{
    check_name:    string;
    status:        'passed' | 'failed';
    detail:        Record<string, unknown>;
  }>;
}

// ── Request / Response DTOs ───────────────────────────────────────────────────

export interface RunReplayRequest {
  periodId:  string;
  actorId?:  string;
}

export interface RunFiscalYearReplayRequest {
  fiscalYearId: string;
  actorId?:     string;
}

export interface SupersedeScheduleRequest {
  scheduleType: ScheduleGenerationTypeEnum;
  sourceId:     string;
  linesCount:   number;
  totalAmount:  number;
  reason?:      string;
  actorId?:     string;
}

export interface ReopenPeriodRequest {
  periodId:  string;
  reason:    string;
  actorId?:  string;
}

export interface GenerateReplayExportRequest {
  periodId:  string;
  notes?:    string;
  actorId?:  string;
}
