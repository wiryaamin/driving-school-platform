import type { UUID, Timestamp, DateString } from './common.types.js';
import type {
  JournalEntryTypeEnum,
  JournalEntryStatusEnum,
  Json,
} from './database.types.js';

// ─── Domain type aliases ──────────────────────────────────────────────────────

export type JournalEntryType   = JournalEntryTypeEnum;
export type JournalEntryStatus = JournalEntryStatusEnum;

// ─── Domain models ────────────────────────────────────────────────────────────

export interface JournalEntry {
  id:                      UUID;
  organization_id:         UUID;
  financial_period_id:     UUID | null;
  entry_type:              JournalEntryType;
  status:                  JournalEntryStatus;
  voucher_series:          string;
  voucher_number:          number;
  entry_date:              DateString;
  description:             string;
  source_event_type:       string | null;
  source_entity_type:      string | null;
  source_entity_id:        UUID | null;
  reversal_of_entry_id:    UUID | null;
  correction_of_entry_id:  UUID | null;
  total_debit:             number;
  total_credit:            number;
  posted_at:               Timestamp;
  posted_by:               UUID | null;
  notes:                   string | null;
  metadata:                Json;
  created_at:              Timestamp;
  created_by:              UUID | null;
}

export interface JournalEntryWithLines extends JournalEntry {
  lines: JournalLine[];
  // Computed from v_journal_entries view
  effective_status?:   string;
  reversal_entry_id?:  UUID | null;
  reversed_on?:        DateString | null;
  correction_entry_id?: UUID | null;
}

export interface JournalLine {
  id:               UUID;
  organization_id:  UUID;
  entry_id:         UUID;
  line_number:      number;
  account_code:     string;
  debit_amount:     number;
  credit_amount:    number;
  vat_rate_code:    string | null;
  vat_amount:       number | null;
  description:      string;
  metadata:         Json;
  created_at:       Timestamp;
}

export interface AccountBalance {
  id:                  UUID;
  organization_id:     UUID;
  financial_period_id: UUID;
  account_code:        string;
  opening_balance:     number;
  debit_movement:      number;
  credit_movement:     number;
  closing_balance:     number;
  transaction_count:   number;
  last_entry_id:       UUID | null;
  updated_at:          Timestamp;
}

export interface LedgerVoucherSequence {
  id:              UUID;
  organization_id: UUID;
  fiscal_year:     number;
  voucher_series:  string;
  last_number:     number;
  created_at:      Timestamp;
  updated_at:      Timestamp;
}

export interface DeferredRevenueSchedule {
  id:                    UUID;
  organization_id:       UUID;
  invoice_id:            UUID;
  student_package_id:    UUID;
  total_lessons:         number;
  recognized_lessons:    number;
  total_deferred_net:    number;
  recognized_amount_net: number;
  per_lesson_amount_net: number;
  deferral_account:      string;
  recognition_account:   string;
  initial_journal_id:    UUID | null;
  is_fully_recognized:   boolean;
  notes:                 string | null;
  created_at:            Timestamp;
  updated_at:            Timestamp;
  created_by:            UUID | null;
}

export interface RevenueRecognitionEvent {
  id:                 UUID;
  organization_id:    UUID;
  schedule_id:        UUID;
  booking_id:         UUID | null;
  recognition_date:   DateString;
  lessons_recognized: number;
  amount_net:         number;
  journal_entry_id:   UUID | null;
  notes:              string | null;
  created_at:         Timestamp;
  created_by:         UUID | null;
}

export interface LedgerSie4Export {
  id:                  UUID;
  organization_id:     UUID;
  financial_period_id: UUID;
  from_date:           DateString;
  to_date:             DateString;
  content_text:        string;
  content_hash:        string;
  entry_count:         number;
  account_count:       number;
  generated_at:        Timestamp;
  generated_by:        UUID | null;
  metadata:            Json;
}

// ─── Trial balance / reporting read models ────────────────────────────────────

export interface TrialBalanceRow {
  organization_id:     UUID;
  financial_period_id: UUID;
  period_name:         string;
  period_start:        DateString;
  period_end:          DateString;
  period_status:       string;
  account_code:        string;
  account_name:        string;
  account_name_en:     string;
  account_type:        string;
  normal_balance:      'debit' | 'credit';
  opening_balance:     number;
  debit_movement:      number;
  credit_movement:     number;
  closing_balance:     number;
  transaction_count:   number;
}

export interface IncomeStatementRow {
  organization_id:    UUID;
  financial_period_id: UUID;
  period_name:        string;
  period_start:       DateString;
  period_end:         DateString;
  account_code:       string;
  account_name:       string;
  account_type:       'revenue' | 'expense';
  normal_balance:     'debit' | 'credit';
  debit_movement:     number;
  credit_movement:    number;
  net_contribution:   number;
}

export interface BalanceSheetRow {
  organization_id:     UUID;
  financial_period_id: UUID;
  period_name:         string;
  period_end:          DateString;
  account_code:        string;
  account_name:        string;
  account_type:        'asset' | 'liability' | 'equity';
  normal_balance:      'debit' | 'credit';
  closing_balance:     number;
  reported_balance:    number;
  balance_position:    'normal' | 'contra';
}

// ─── Journal line input (for post_journal_entry RPC) ─────────────────────────

export interface JournalLineInput {
  account_code:   string;
  debit_amount:   number;
  credit_amount:  number;
  description?:   string;
  vat_rate_code?: string | null;
  vat_amount?:    number | null;
}

// ─── Insert types ─────────────────────────────────────────────────────────────

export interface JournalEntryInsert {
  organization_id:        string;
  financial_period_id?:   string | null;
  entry_type?:            JournalEntryType;
  status?:                JournalEntryStatus;
  voucher_series?:        string;
  voucher_number?:        number | null;
  entry_date:             string;
  description?:           string;
  source_event_type?:     string | null;
  source_entity_type?:    string | null;
  source_entity_id?:      string | null;
  reversal_of_entry_id?:  string | null;
  correction_of_entry_id?: string | null;
  total_debit?:           number;
  total_credit?:          number;
  posted_at?:             string | null;
  posted_by?:             string | null;
  notes?:                 string | null;
  metadata?:              Json;
  created_by?:            string | null;
}

export type JournalEntryUpdate = never; // Immutable after creation

// ─── Input DTOs ───────────────────────────────────────────────────────────────

export interface PostJournalEntryInput {
  period_id?:             UUID | null;
  entry_type?:            JournalEntryType;
  entry_date:             DateString;
  description:            string;
  lines:                  JournalLineInput[];
  source_event_type?:     string;
  source_entity_type?:    string;
  source_entity_id?:      UUID;
  voucher_series?:        string;
}

export interface PostInvoiceInput {
  invoice_id: UUID;
}

export interface PostPaymentInput {
  payment_id: UUID;
}

export interface ReverseEntryInput {
  entry_id:      UUID;
  reversal_date?: DateString;
  reason?:        string;
}

export interface CorrectEntryInput {
  entry_id:          UUID;
  new_lines:         JournalLineInput[];
  reason?:           string;
  correction_date?:  DateString;
}

export interface RecognizeRevenueInput {
  booking_id: UUID;
}

export interface BulkRecognizeInput {
  as_of_date?: DateString;
}

export interface GenerateSie4FromLedgerInput {
  period_id: UUID;
}

export interface JournalEntryListQuery {
  period_id?:         UUID;
  entry_type?:        JournalEntryType;
  source_entity_type?: string;
  source_entity_id?:  UUID;
  from_date?:         DateString;
  to_date?:           DateString;
  page?:              number;
  per_page?:          number;
}
