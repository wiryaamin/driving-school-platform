import type { UUID, Timestamp, DateString } from './common.types.js';
import type {
  BankStatementStatusEnum,
  BankLineStatusEnum,
  ReconciliationTypeEnum,
  ReconciliationRunStatusEnum,
  ReconciliationItemStatusEnum,
  Json,
} from './database.types.js';

// ─── Enum aliases ─────────────────────────────────────────────────────────────

export type BankStatementStatus      = BankStatementStatusEnum;
export type BankLineStatus           = BankLineStatusEnum;
export type ReconciliationType       = ReconciliationTypeEnum;
export type ReconciliationRunStatus  = ReconciliationRunStatusEnum;
export type ReconciliationItemStatus = ReconciliationItemStatusEnum;

// ─── Bank reconciliation domain models ───────────────────────────────────────

export interface BankStatementImport {
  id:                  UUID;
  organization_id:     UUID;
  bank_account_number: string;
  bank_name:           string | null;
  statement_date:      DateString;
  period_start:        DateString;
  period_end:          DateString;
  opening_balance:     number;
  closing_balance:     number;
  currency:            string;
  total_lines:         number;
  status:              BankStatementStatus;
  file_reference:      string | null;
  imported_by:         UUID | null;
  imported_at:         Timestamp;
  confirmed_at:        Timestamp | null;
  confirmed_by:        UUID | null;
  notes:               string | null;
  metadata:            Json;
  created_at:          Timestamp;
  updated_at:          Timestamp;
}

export interface BankStatementLine {
  id:                  UUID;
  organization_id:     UUID;
  import_id:           UUID;
  line_number:         number;
  transaction_date:    DateString;
  value_date:          DateString | null;
  amount:              number;
  balance_after:       number | null;
  reference:           string | null;
  description:         string;
  counterpart_name:    string | null;
  counterpart_account: string | null;
  status:              BankLineStatus;
  payment_id:          UUID | null;
  matched_at:          Timestamp | null;
  matched_by:          UUID | null;
  match_method:        'automatic' | 'manual' | null;
  match_notes:         string | null;
  metadata:            Json;
  created_at:          Timestamp;
  updated_at:          Timestamp;
}

export interface ReconciliationRun {
  id:                       UUID;
  organization_id:          UUID;
  financial_period_id:      UUID | null;
  reconciliation_type:      ReconciliationType;
  status:                   ReconciliationRunStatus;
  bank_statement_import_id: UUID | null;
  total_items:              number;
  matched_items:            number;
  unmatched_items:          number;
  exception_items:          number;
  result_summary:           Json;
  is_reconciled:            boolean;
  variance_amount:          number | null;
  started_at:               Timestamp;
  completed_at:             Timestamp | null;
  actor_id:                 UUID | null;
  notes:                    string | null;
  metadata:                 Json;
  created_at:               Timestamp;
  updated_at:               Timestamp;
}

export interface ReconciliationItem {
  id:                   UUID;
  organization_id:      UUID;
  run_id:               UUID;
  ledger_entity_type:   string;
  ledger_entity_id:     UUID;
  external_entity_type: string | null;
  external_entity_id:   UUID | null;
  external_reference:   string | null;
  ledger_amount:        number;
  external_amount:      number | null;
  variance:             number | null;
  status:               ReconciliationItemStatus;
  match_method:         'automatic' | 'manual' | null;
  matched_at:           Timestamp;
  matched_by:           UUID | null;
  notes:                string | null;
  metadata:             Json;
  created_at:           Timestamp;
}

// ─── Fiscal year domain models ────────────────────────────────────────────────

export type FiscalYearStatus = 'open' | 'closing' | 'closed';

export interface FiscalYear {
  id:                          UUID;
  organization_id:             UUID;
  year_number:                 number;
  year_start:                  DateString;
  year_end:                    DateString;
  status:                      FiscalYearStatus;
  retained_earnings_entry_id:  UUID | null;
  closed_at:                   Timestamp | null;
  closed_by:                   UUID | null;
  notes:                       string | null;
  metadata:                    Json;
  created_at:                  Timestamp;
  updated_at:                  Timestamp;
  created_by:                  UUID | null;
}

// ─── Period audit snapshots ───────────────────────────────────────────────────

export type PeriodSnapshotType = 'soft_close' | 'hard_close' | 'year_end' | 'manual';

export interface PeriodAuditSnapshot {
  id:                   UUID;
  organization_id:      UUID;
  financial_period_id:  UUID;
  snapshot_type:        PeriodSnapshotType;
  snapshot_data:        Json;
  trial_balance_debit:  number;
  trial_balance_credit: number;
  is_balanced:          boolean;
  account_count:        number;
  content_hash:         string;
  captured_at:          Timestamp;
  captured_by:          UUID | null;
  notes:                string | null;
  metadata:             Json;
}

// ─── Ledger consistency checks ────────────────────────────────────────────────

export type ConsistencyCheckType = 'pre_close' | 'post_close' | 'periodic' | 'manual';

export interface LedgerConsistencyCheck {
  id:                   UUID;
  organization_id:      UUID;
  financial_period_id:  UUID | null;
  check_type:           ConsistencyCheckType;
  passed:               boolean;
  total_checks:         number;
  passed_checks:        number;
  failed_checks:        number;
  results:              Json;
  run_duration_ms:      number | null;
  actor_id:             UUID | null;
  created_at:           Timestamp;
}

// ─── View row types ───────────────────────────────────────────────────────────

export interface PeriodCloseReadiness {
  period_id:                  UUID;
  organization_id:            UUID;
  period_name:                string;
  period_start:               DateString;
  period_end:                 DateString;
  status:                     string;
  amendment_count:            number;
  close_validated_at:         Timestamp | null;
  closed_at:                  Timestamp | null;
  locked_at:                  Timestamp | null;
  trial_balance_debit:        number;
  trial_balance_credit:       number;
  trial_balance_balanced:     boolean;
  posted_entry_count:         number;
  bank_reconciled:            boolean;
  ar_reconciled:              boolean;
  vat_reconciled:             boolean;
  deferred_reconciled:        boolean;
  soft_close_snapshot_exists: boolean;
  hard_close_snapshot_exists: boolean;
}

export interface FiscalYearOverview {
  fiscal_year_id:              UUID;
  organization_id:             UUID;
  year_number:                 number;
  year_start:                  DateString;
  year_end:                    DateString;
  fiscal_year_status:          FiscalYearStatus;
  retained_earnings_entry_id:  UUID | null;
  closed_at:                   Timestamp | null;
  total_periods:               number;
  open_periods:                number;
  soft_closed_periods:         number;
  hard_closed_periods:         number;
  year_end_period_id:          UUID | null;
  year_end_period_status:      string | null;
  first_period_start:          DateString | null;
  last_period_end:             DateString | null;
  total_amendments:            number;
}

// ─── RPC result types ─────────────────────────────────────────────────────────

export interface PeriodCloseValidationResult {
  period_id:       UUID;
  period_status:   string;
  checks:          CloseCheck[];
  critical_passed: boolean;
  all_passed:      boolean;
  validated_at:    Timestamp;
}

export interface CloseCheck {
  check:    string;
  critical?: boolean;
  passed:   boolean;
  message:  string;
}

export interface FiscalYearValidationResult {
  fiscal_year_id: UUID;
  year_number:    number;
  status:         FiscalYearStatus;
  checks:         CloseCheck[];
  all_passed:     boolean;
  validated_at:   Timestamp;
}

export interface SnapshotVerificationResult {
  snapshot_id:          UUID;
  financial_period_id:  UUID;
  period_status:        string;
  snapshot_type:        PeriodSnapshotType;
  captured_at:          Timestamp;
  is_balanced:          boolean;
  matches:              boolean;
  stored_hash:          string;
  current_hash:         string;
  verified_at:          Timestamp;
  integrity:            string;
}

export interface ReconciliationReport {
  generated_at:      Timestamp;
  period:            {
    id:              UUID;
    name:            string;
    period_start:    DateString;
    period_end:      DateString;
    status:          string;
    amendment_count: number;
  };
  trial_balance:     {
    total_debit:  number;
    total_credit: number;
    variance:     number;
    is_balanced:  boolean;
  };
  reconciliations: {
    bank?:                Json | null;
    accounts_receivable?: Json | null;
    vat?:                 Json | null;
    deferred_revenue?:    Json | null;
  };
  consistency_check: Json | null;
  audit_snapshot:    Json | null;
}

// ─── Input DTOs ───────────────────────────────────────────────────────────────

export interface BankStatementLineInput {
  line_number:         number;
  transaction_date:    DateString;
  value_date?:         DateString | null;
  amount:              number;
  balance_after?:      number | null;
  reference?:          string | null;
  description?:        string;
  counterpart_name?:   string | null;
  counterpart_account?: string | null;
}

export interface ImportBankStatementInput {
  account_number:   string;
  bank_name?:       string | null;
  statement_date:   DateString;
  period_start:     DateString;
  period_end:       DateString;
  opening_balance?: number;
  closing_balance?: number;
  currency?:        string;
  lines:            BankStatementLineInput[];
}

export interface SoftClosePeriodInput {
  period_id: UUID;
  notes?:    string | null;
}

export interface ReopenPeriodInput {
  period_id: UUID;
  reason:    string;
}

export interface HardClosePeriodInput {
  period_id: UUID;
  notes?:    string | null;
}

export interface PostAmendmentInput {
  period_id: UUID;
  lines:     unknown[];
  reason:    string;
}

export interface CreateFiscalYearInput {
  year_number: number;
  year_start:  DateString;
  year_end:    DateString;
  notes?:      string | null;
}
