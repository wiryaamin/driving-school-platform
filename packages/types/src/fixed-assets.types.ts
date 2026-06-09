import type { UUID, Timestamp, DateString } from './common.types.js';
import type {
  FixedAssetStatusEnum,
  DepreciationMethodEnum,
  AssetDisposalTypeEnum,
  AccrualTypeEnum,
  AccrualStatusEnum,
  Json,
} from './database.types.js';

// ─── Enum aliases ─────────────────────────────────────────────────────────────

export type FixedAssetStatus   = FixedAssetStatusEnum;
export type DepreciationMethod = DepreciationMethodEnum;
export type AssetDisposalType  = AssetDisposalTypeEnum;
export type AccrualType        = AccrualTypeEnum;
export type AccrualStatus      = AccrualStatusEnum;

// ─── Fixed Asset Classes ──────────────────────────────────────────────────────

export interface FixedAssetClass {
  id:                        UUID;
  class_code:                string;
  class_name:                string;
  class_name_en:             string | null;
  asset_account:             string;
  accumulated_depr_account:  string;
  depreciation_exp_account:  string;
  disposal_gain_account:     string;
  disposal_loss_account:     string;
  default_method:            DepreciationMethod;
  default_useful_life_months: number;
  is_active:                 boolean;
  created_at:                Timestamp;
}

// ─── Fixed Assets ─────────────────────────────────────────────────────────────

export interface FixedAsset {
  id:                       UUID;
  organization_id:          UUID;
  asset_class_id:           UUID;
  financial_period_id:      UUID | null;
  asset_code:               string;
  asset_name:               string;
  description:              string | null;
  acquisition_date:         DateString;
  acquisition_cost:         number;
  residual_value:           number;
  useful_life_months:       number;
  depreciation_method:      DepreciationMethod;
  status:                   FixedAssetStatus;
  net_book_value:           number;
  accumulated_depreciation: number;
  periods_posted:           number;
  acquisition_entry_id:     UUID | null;
  last_depreciation_date:   DateString | null;
  fully_depreciated_at:     DateString | null;
  disposal_id:              UUID | null;
  notes:                    string | null;
  metadata:                 Json;
  created_at:               Timestamp;
  updated_at:               Timestamp;
  created_by:               UUID | null;
  updated_by:               UUID | null;
}

export interface FixedAssetRegisterRow extends FixedAsset {
  class_code:               string;
  class_name:               string;
  class_name_en:            string | null;
  depreciable_amount:       number;
  periods_remaining:        number;
  asset_account:            string;
  accumulated_depr_account: string;
  depreciation_exp_account: string;
}

// ─── Asset Disposals ─────────────────────────────────────────────────────────

export interface AssetDisposal {
  id:                         UUID;
  organization_id:            UUID;
  asset_id:                   UUID;
  disposal_type:              AssetDisposalType;
  disposal_date:              DateString;
  net_book_value_at_disposal: number;
  proceeds:                   number;
  gain_loss:                  number;
  journal_entry_id:           UUID | null;
  notes:                      string | null;
  metadata:                   Json;
  created_at:                 Timestamp;
  created_by:                 UUID | null;
}

// ─── Depreciation Schedules ───────────────────────────────────────────────────

export interface DepreciationSchedule {
  id:                  UUID;
  organization_id:     UUID;
  asset_id:            UUID;
  period_number:       number;
  schedule_date:       DateString;
  depreciation_amount: number;
  opening_nbv:         number;
  closing_nbv:         number;
  is_posted:           boolean;
  posted_at:           Timestamp | null;
  journal_entry_id:    UUID | null;
  created_at:          Timestamp;
}

export interface DepreciationScheduleSummary {
  asset_id:                    UUID;
  organization_id:             UUID;
  asset_code:                  string;
  asset_name:                  string;
  asset_status:                FixedAssetStatus;
  acquisition_cost:            number;
  residual_value:              number;
  total_periods:               number;
  posted_periods:              number;
  remaining_periods:           number;
  next_depreciation_date:      DateString | null;
  remaining_depreciation:      number | null;
  total_scheduled_depreciation: number;
}

// ─── Accrual Schedules ────────────────────────────────────────────────────────

export interface AccrualSchedule {
  id:                     UUID;
  organization_id:        UUID;
  financial_period_id:    UUID | null;
  accrual_type:           AccrualType;
  status:                 AccrualStatus;
  description:            string;
  total_amount:           number;
  released_amount:        number;
  release_months:         number;
  months_released:        number;
  start_date:             DateString;
  release_debit_account:  string;
  release_credit_account: string;
  initial_entry_id:       UUID | null;
  notes:                  string | null;
  metadata:               Json;
  created_at:             Timestamp;
  updated_at:             Timestamp;
  created_by:             UUID | null;
  updated_by:             UUID | null;
}

export interface AccrualReleaseLine {
  id:                  UUID;
  organization_id:     UUID;
  accrual_schedule_id: UUID;
  period_number:       number;
  release_date:        DateString;
  release_amount:      number;
  is_posted:           boolean;
  is_cancelled:        boolean;
  posted_at:           Timestamp | null;
  journal_entry_id:    UUID | null;
  created_at:          Timestamp;
}

// ─── Periodic Deferred Revenue Schedules ──────────────────────────────────────

export interface PeriodicDeferredSchedule {
  id:                   UUID;
  organization_id:      UUID;
  financial_period_id:  UUID | null;
  source_type:          string;
  source_id:            UUID;
  description:          string;
  total_amount:         number;
  released_amount:      number;
  release_months:       number;
  months_released:      number;
  start_date:           DateString;
  deferral_account:     string;
  recognition_account:  string;
  is_fully_released:    boolean;
  notes:                string | null;
  metadata:             Json;
  created_at:           Timestamp;
  updated_at:           Timestamp;
  created_by:           UUID | null;
  updated_by:           UUID | null;
}

export interface PeriodicDeferredLine {
  id:               UUID;
  organization_id:  UUID;
  schedule_id:      UUID;
  period_number:    number;
  release_date:     DateString;
  release_amount:   number;
  is_posted:        boolean;
  posted_at:        Timestamp | null;
  journal_entry_id: UUID | null;
  created_at:       Timestamp;
}

// ─── Fiscal Integrity ─────────────────────────────────────────────────────────

export interface CloseDependencyValidation {
  id:               UUID;
  organization_id:  UUID;
  period_id:        UUID;
  status:           'ok' | 'blocking_periods';
  blocking_count:   number;
  blocking_periods: Json;
  validated_at:     Timestamp;
  validated_by:     UUID | null;
}

export interface AccountingReplayRun {
  id:                UUID;
  organization_id:   UUID;
  period_id:         UUID;
  status:            'valid' | 'discrepancies_found';
  accounts_checked:  number;
  discrepancy_count: number;
  discrepancies:     Json;
  run_duration_ms:   number | null;
  run_at:            Timestamp;
  run_by:            UUID | null;
}

export interface CanonicalAccountingExport {
  id:                  UUID;
  organization_id:     UUID;
  period_id:           UUID;
  content_hash:        string;
  journal_entry_count: number;
  journal_line_count:  number;
  total_debit:         number;
  total_credit:        number;
  notes:               string | null;
  metadata:            Json;
  created_at:          Timestamp;
  created_by:          UUID | null;
}

// ─── Service input types ──────────────────────────────────────────────────────

export interface RegisterFixedAssetInput {
  orgId:             UUID;
  periodId:          UUID;
  assetClassId:      UUID;
  assetCode:         string;
  assetName:         string;
  acquisitionDate:   DateString;
  acquisitionCost:   number;
  residualValue?:    number;
  usefulLifeMonths?: number;
  depreciationMethod?: DepreciationMethod;
  creditAccount?:    string;
  description?:      string;
  notes?:            string;
}

export interface PostDisposalInput {
  assetId:       UUID;
  periodId:      UUID;
  disposalType:  AssetDisposalType;
  disposalDate:  DateString;
  proceeds?:     number;
  notes?:        string;
}

export interface PostImpairmentInput {
  assetId:           UUID;
  periodId:          UUID;
  impairmentDate:    DateString;
  impairmentAmount:  number;
  reason?:           string;
}

export interface CreateAccrualScheduleInput {
  orgId:                UUID;
  periodId?:            UUID;
  accrualType:          AccrualType;
  description:          string;
  totalAmount:          number;
  startDate:            DateString;
  releaseMonths:        number;
  releaseDebitAccount:  string;
  releaseCreditAccount: string;
  initialDebitAccount?: string;
  initialCreditAccount?: string;
  notes?:               string;
}

export interface CreateDeferredScheduleInput {
  orgId:               UUID;
  periodId?:           UUID;
  sourceType:          string;
  sourceId:            UUID;
  description:         string;
  totalAmount:         number;
  startDate:           DateString;
  releaseMonths:       number;
  deferralAccount?:    string;
  recognitionAccount?: string;
  notes?:              string;
}
