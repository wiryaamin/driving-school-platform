import type { UUID, Timestamp, DateString } from './common.types.js';
import type {
  PackageTypeEnum,
  PackageStatusEnum,
  CreditEntryTypeEnum,
  InvoiceStatusEnum,
  InvoiceLineTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  FinancialPeriodStatusEnum,
  Json,
} from './database.types.js';
import type { LessonCategory } from './scheduling.types.js';

// ─── Domain type aliases ──────────────────────────────────────────────────────

export type PackageType           = PackageTypeEnum;
export type PackageStatus         = PackageStatusEnum;
export type CreditEntryType       = CreditEntryTypeEnum;
export type InvoiceStatus         = InvoiceStatusEnum;
export type InvoiceLineType       = InvoiceLineTypeEnum;
export type PaymentMethod         = PaymentMethodEnum;
export type PaymentStatus         = PaymentStatusEnum;
export type FinancialPeriodStatus = FinancialPeriodStatusEnum;
// LessonCategory re-used here from scheduling.types.ts (already exported by that module)

// ─── Bundle credit component ──────────────────────────────────────────────────
// Used in package_offerings.bundle_credits JSON array

export interface BundleCreditComponent {
  lesson_category: LessonCategory;
  quantity:        number;
}

// ─── Domain models ────────────────────────────────────────────────────────────

export interface PackageCatalog {
  id:               UUID;
  organization_id:  UUID | null;
  name:             string;
  description:      string | null;
  package_type:     PackageType;
  lesson_category:  LessonCategory;
  default_quantity: number;
  default_price:    number;
  currency:         string;
  vat_rate:         number;
  validity_days:    number | null;
  is_active:        boolean;
  sort_order:       number;
  metadata:         Json;
  created_at:       Timestamp;
  updated_at:       Timestamp;
  created_by:       UUID | null;
  updated_by:       UUID | null;
}

export interface PackageOffering {
  id:               UUID;
  organization_id:  UUID;
  catalog_id:       UUID | null;
  name:             string;
  description:      string | null;
  package_type:     PackageType;
  lesson_category:  LessonCategory;
  quantity:         number;
  bundle_credits:   BundleCreditComponent[];
  price:            number;
  currency:         string;
  vat_rate:         number;
  validity_days:    number | null;
  status:           PackageStatus;
  sort_order:       number;
  metadata:         Json;
  created_at:       Timestamp;
  updated_at:       Timestamp;
  archived_at:      Timestamp | null;
  created_by:       UUID | null;
  updated_by:       UUID | null;
  archived_by:      UUID | null;
}

export interface StudentPackage {
  id:                UUID;
  organization_id:   UUID;
  student_id:        UUID;
  offering_id:       UUID;
  status:            PackageStatus;
  quantity_granted:  number;
  quantity_consumed: number;
  quantity_expired:  number;
  price_paid:        number;
  currency:          string;
  vat_rate:          number;
  purchased_at:      Timestamp;
  activated_at:      Timestamp | null;
  expires_at:        Timestamp | null;
  archived_at:       Timestamp | null;
  archived_by:       UUID | null;
  notes:             string | null;
  metadata:          Json;
  created_at:        Timestamp;
  updated_at:        Timestamp;
  created_by:        UUID | null;
}

export interface CreditLedgerEntry {
  id:                 UUID;
  organization_id:    UUID;
  student_id:         UUID;
  lesson_category:    LessonCategory;
  entry_type:         CreditEntryType;
  quantity:           number;
  currency:           string;
  student_package_id: UUID | null;
  booking_id:         UUID | null;
  grant_entry_id:     UUID | null;
  reference_type:     string | null;
  reference_id:       UUID | null;
  description:        string | null;
  actor_id:           UUID | null;
  expires_at:         Timestamp | null;
  metadata:           Json;
  created_at:         Timestamp;
}

export interface CreditBalanceCache {
  id:               UUID;
  organization_id:  UUID;
  student_id:       UUID;
  lesson_category:  LessonCategory;
  balance:          number;
  last_ledger_id:   UUID | null;
  updated_at:       Timestamp;
}

export interface Invoice {
  id:                  UUID;
  organization_id:     UUID;
  student_id:          UUID;
  student_package_id:  UUID | null;
  // Who is billed, when different from the student the invoice is for
  // (student_id stays the real service recipient). NULL = the student
  // themselves pays.
  corporate_customer_id: UUID | null;
  invoice_number:      string | null;
  status:              InvoiceStatus;
  currency:            string;
  subtotal_amount:     number;
  vat_amount:          number;
  total_amount:        number;
  paid_amount:         number;
  outstanding_amount:  number;
  due_date:            DateString | null;
  issued_at:           Timestamp | null;
  issued_by:           UUID | null;
  paid_at:             Timestamp | null;
  void_at:             Timestamp | null;
  void_by:             UUID | null;
  void_reason:         string | null;
  notes:               string | null;
  metadata:            Json;
  created_at:          Timestamp;
  updated_at:          Timestamp;
  created_by:          UUID | null;
  updated_by:          UUID | null;
}

export interface InvoiceLineItem {
  id:                 UUID;
  organization_id:    UUID;
  invoice_id:         UUID;
  student_package_id: UUID | null;
  line_type:          InvoiceLineType;
  description:        string;
  quantity:           number;
  unit_price:         number;
  vat_rate:           number;
  vat_amount:         number;
  line_total:         number;
  sort_order:         number;
  metadata:           Json;
  created_at:         Timestamp;
  updated_at:         Timestamp;
}

export interface Payment {
  id:                 UUID;
  organization_id:    UUID;
  invoice_id:         UUID;
  student_id:         UUID;
  payment_method:     PaymentMethod;
  status:             PaymentStatus;
  amount:             number;
  currency:           string;
  provider_reference: string | null;
  provider_metadata:  Json;
  paid_at:            Timestamp | null;
  confirmed_at:       Timestamp | null;
  confirmed_by:       UUID | null;
  void_at:            Timestamp | null;
  void_by:            UUID | null;
  void_reason:        string | null;
  refund_amount:      number | null;
  refunded_at:        Timestamp | null;
  refunded_by:        UUID | null;
  notes:              string | null;
  metadata:           Json;
  created_at:         Timestamp;
  updated_at:         Timestamp;
  created_by:         UUID | null;
}

export interface FinancialPeriod {
  id:               UUID;
  organization_id:  UUID;
  name:             string;
  period_start:     DateString;
  period_end:       DateString;
  status:           FinancialPeriodStatus;
  closed_at:        Timestamp | null;
  closed_by:        UUID | null;
  locked_at:        Timestamp | null;
  locked_by:        UUID | null;
  notes:            string | null;
  metadata:         Json;
  created_at:       Timestamp;
  updated_at:       Timestamp;
  created_by:       UUID | null;
}

// ─── Student wallet summary ───────────────────────────────────────────────────
// Derived read model returned by the wallet API — not a DB table.

export interface WalletCategoryBalance {
  lesson_category:  LessonCategory;
  balance:          number;
  expires_soonest:  Timestamp | null;
}

export interface StudentWallet {
  student_id:   UUID;
  balances:     WalletCategoryBalance[];
  total_credits: number;
}

// ─── Insert types ─────────────────────────────────────────────────────────────

export interface PackageCatalogInsert {
  organization_id?: UUID | null;
  name:             string;
  description?:     string | null;
  package_type?:    PackageType;
  lesson_category:  LessonCategory;
  default_quantity: number;
  default_price:    number;
  currency?:        string;
  vat_rate?:        number;
  validity_days?:   number | null;
  is_active?:       boolean;
  sort_order?:      number;
  metadata?:        Json;
  created_by?:      UUID | null;
  updated_by?:      UUID | null;
}

export interface PackageOfferingInsert {
  catalog_id?:      UUID | null;
  name:             string;
  description?:     string | null;
  package_type?:    PackageType;
  lesson_category:  LessonCategory;
  quantity:         number;
  bundle_credits?:  BundleCreditComponent[];
  price:            number;
  currency?:        string;
  vat_rate?:        number;
  validity_days?:   number | null;
  status?:          PackageStatus;
  sort_order?:      number;
  metadata?:        Json;
  created_by?:      UUID | null;
  updated_by?:      UUID | null;
  archived_by?:     UUID | null;
  archived_at?:     Timestamp | null;
}

export interface InvoiceInsert {
  student_id:          UUID;
  student_package_id?: UUID | null;
  currency?:           string;
  subtotal_amount?:    number;
  vat_amount?:         number;
  total_amount?:       number;
  paid_amount?:        number;
  outstanding_amount?: number;
  due_date?:           string | null;
  notes?:              string | null;
  metadata?:           Json;
  created_by?:         UUID | null;
  updated_by?:         UUID | null;
}

export interface InvoiceLineItemInsert {
  invoice_id:          UUID;
  student_package_id?: UUID | null;
  line_type?:          InvoiceLineType;
  description:         string;
  quantity?:           number;
  unit_price:          number;
  vat_rate?:           number;
  vat_amount?:         number;
  line_total?:         number;
  sort_order?:         number;
  metadata?:           Json;
}

export interface FinancialPeriodInsert {
  name:          string;
  period_start:  string;
  period_end:    string;
  status?:       FinancialPeriodStatus;
  notes?:        string | null;
  metadata?:     Json;
  created_by?:   UUID | null;
}

// ─── Update types ─────────────────────────────────────────────────────────────

export type PackageCatalogUpdate  = Partial<PackageCatalogInsert>;
export type PackageOfferingUpdate = Partial<PackageOfferingInsert>;

export interface InvoiceUpdate {
  notes?:      string | null;
  due_date?:   string | null;
  metadata?:   Json;
  updated_by?: UUID | null;
}

export interface InvoiceLineItemUpdate {
  description?: string;
  quantity?:    number;
  unit_price?:  number;
  vat_rate?:    number;
  sort_order?:  number;
  metadata?:    Json;
}

export interface FinancialPeriodUpdate {
  name?:       string;
  notes?:      string | null;
  status?:     FinancialPeriodStatus;
  metadata?:   Json;
  closed_at?:  Timestamp | null;
  closed_by?:  UUID | null;
  locked_at?:  Timestamp | null;
  locked_by?:  UUID | null;
}

// ─── Input DTOs (for service/edge function layer) ─────────────────────────────

export interface PurchasePackageInput {
  student_id:   UUID;
  offering_id:  UUID;
}

export interface CreateInvoiceDraftInput {
  student_id:         UUID;
  student_package_id?: UUID;
  currency?:          string;
  due_date?:          DateString;
  notes?:             string;
  metadata?:          Json;
}

export interface AddInvoiceLineItemInput {
  invoice_id:         UUID;
  student_package_id?: UUID;
  line_type?:         InvoiceLineType;
  description:        string;
  quantity?:          number;
  unit_price:         number;
  vat_rate?:          number;
  sort_order?:        number;
}

export interface IssueInvoiceInput {
  invoice_id: UUID;
}

export interface VoidInvoiceInput {
  invoice_id: UUID;
  reason?:    string;
}

export interface RecordPaymentInput {
  invoice_id:         UUID;
  amount:             number;
  payment_method:     PaymentMethod;
  provider_reference?: string;
  notes?:             string;
}

export interface CreatePackageCatalogInput {
  name:              string;
  description?:      string;
  package_type?:     PackageType;
  lesson_category:   LessonCategory;
  default_quantity:  number;
  default_price:     number;
  currency?:         string;
  vat_rate?:         number;
  validity_days?:    number;
  is_active?:        boolean;
  metadata?:         Json;
}

export interface CreatePackageOfferingInput {
  catalog_id?:       UUID;
  name:              string;
  description?:      string;
  package_type?:     PackageType;
  lesson_category:   LessonCategory;
  quantity:          number;
  bundle_credits?:   BundleCreditComponent[];
  price:             number;
  currency?:         string;
  vat_rate?:         number;
  validity_days?:    number;
  sort_order?:       number;
  metadata?:         Json;
}

export interface UpdatePackageOfferingInput {
  name?:          string;
  description?:   string;
  price?:         number;
  vat_rate?:      number;
  validity_days?: number;
  sort_order?:    number;
  metadata?:      Json;
}

export interface CreateFinancialPeriodInput {
  name:          string;
  period_start:  DateString;
  period_end:    DateString;
  notes?:        string;
  metadata?:     Json;
}

export interface GrantCreditInput {
  student_id:      UUID;
  lesson_category: LessonCategory;
  quantity:        number;
  description?:    string;
  expires_at?:     Timestamp;
  metadata?:       Json;
}

// ─── Phase 4B domain type aliases ────────────────────────────────────────────

export type RefundStatus          = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type RefundType            = 'full' | 'partial' | 'credit_only' | 'payment_only';
export type RefundReasonCode      = 'duplicate_payment' | 'student_cancellation' | 'administrative_error' | 'service_failure' | 'goodwill' | 'fraud_prevention' | 'partial_adjustment';
export type DiscountType          = 'percentage' | 'fixed';
export type DiscountScope         = 'offering' | 'catalog' | 'category' | 'all';
export type DunningActionType     = 'email' | 'sms' | 'both' | 'legal';
export type AccountingExportFormat = 'sie4' | 'fortnox_csv' | 'visma_csv';
export type AccountingExportStatus = 'pending' | 'running' | 'completed' | 'failed';

// ─── Phase 4B domain models ───────────────────────────────────────────────────

export interface Refund {
  id:                UUID;
  organization_id:   UUID;
  invoice_id:        UUID;
  payment_id:        UUID | null;
  student_id:        UUID;
  refund_type:       RefundType;
  refund_status:     RefundStatus;
  reason_code:       RefundReasonCode;
  refund_amount:     number;
  credit_quantity:   number;
  credit_category:   string | null;
  credit_ledger_id:  UUID | null;
  notes:             string | null;
  processed_at:      Timestamp | null;
  processed_by:      UUID | null;
  failed_reason:     string | null;
  metadata:          Json;
  created_at:        Timestamp;
  created_by:        UUID | null;
}

export interface PaymentAllocation {
  id:               UUID;
  organization_id:  UUID;
  payment_id:       UUID;
  invoice_id:       UUID;
  allocated_amount: number;
  notes:            string | null;
  created_at:       Timestamp;
  created_by:       UUID | null;
}

export interface DiscountDefinition {
  id:                   UUID;
  organization_id:      UUID;
  name:                 string;
  description:          string | null;
  discount_type:        DiscountType;
  discount_scope:       DiscountScope;
  scope_reference_id:   UUID | null;
  scope_category:       string | null;
  discount_value:       number;
  max_discount_amount:  number | null;
  currency:             string;
  valid_from:           DateString | null;
  valid_to:             DateString | null;
  is_active:            boolean;
  requires_coupon:      boolean;
  metadata:             Json;
  created_at:           Timestamp;
  updated_at:           Timestamp;
  created_by:           UUID | null;
  updated_by:           UUID | null;
}

export interface CouponCode {
  id:                           UUID;
  organization_id:              UUID;
  discount_id:                  UUID;
  code:                         string;
  description:                  string | null;
  redemption_limit_total:       number | null;
  redemption_limit_per_student: number | null;
  redemptions_count:            number;
  valid_from:                   DateString | null;
  valid_to:                     DateString | null;
  is_active:                    boolean;
  metadata:                     Json;
  created_at:                   Timestamp;
  updated_at:                   Timestamp;
  created_by:                   UUID | null;
}

export interface DiscountApplication {
  id:                   UUID;
  organization_id:      UUID;
  invoice_id:           UUID;
  invoice_line_item_id: UUID;
  discount_id:          UUID;
  coupon_id:            UUID | null;
  student_id:           UUID;
  original_subtotal:    number;
  discount_amount:      number;
  applied_at:           Timestamp;
  applied_by:           UUID | null;
}

export interface DunningSchedule {
  id:               UUID;
  organization_id:  UUID;
  name:             string;
  description:      string | null;
  is_default:       boolean;
  is_active:        boolean;
  metadata:         Json;
  created_at:       Timestamp;
  updated_at:       Timestamp;
  created_by:       UUID | null;
  updated_by:       UUID | null;
}

export interface DunningScheduleStage {
  id:               UUID;
  schedule_id:      UUID;
  stage_number:     number;
  days_overdue:     number;
  action_type:      DunningActionType;
  subject_template: string | null;
  message_template: string | null;
  late_fee_amount:  number;
  suspend_access:   boolean;
  is_final_stage:   boolean;
  metadata:         Json;
  created_at:       Timestamp;
  updated_at:       Timestamp;
}

export interface InvoiceDunningState {
  id:                   UUID;
  organization_id:      UUID;
  invoice_id:           UUID;
  schedule_id:          UUID | null;
  current_stage_number: number;
  current_stage_id:     UUID | null;
  next_action_at:       Timestamp | null;
  last_actioned_at:     Timestamp | null;
  is_resolved:          boolean;
  is_escalated_legal:   boolean;
  notes:                string | null;
  created_at:           Timestamp;
  updated_at:           Timestamp;
}

export interface InvoiceReminderLog {
  id:               UUID;
  organization_id:  UUID;
  invoice_id:       UUID;
  student_id:       UUID;
  stage_id:         UUID | null;
  stage_number:     number | null;
  action_type:      DunningActionType;
  sent_at:          Timestamp;
  sent_by:          UUID | null;
  is_automated:     boolean;
  notes:            string | null;
  created_at:       Timestamp;
}

export interface AccountingChartOfAccounts {
  id:               UUID;
  organization_id:  UUID;
  event_type:       string;
  account_debit:    string;
  account_credit:   string;
  description:      string | null;
  is_active:        boolean;
  metadata:         Json;
  created_at:       Timestamp;
  updated_at:       Timestamp;
  created_by:       UUID | null;
}

export interface AccountingExportRun {
  id:               UUID;
  organization_id:  UUID;
  format:           AccountingExportFormat;
  from_date:        DateString;
  to_date:          DateString;
  status:           AccountingExportStatus;
  item_count:       number;
  file_reference:   string | null;
  error_message:    string | null;
  started_at:       Timestamp;
  completed_at:     Timestamp | null;
  created_by:       UUID | null;
}

export interface AccountingExportQueueItem {
  id:               UUID;
  organization_id:  UUID;
  event_type:       string;
  event_data:       Json;
  amount:           number | null;
  currency:         string;
  transaction_date: DateString;
  account_debit:    string | null;
  account_credit:   string | null;
  exported_at:      Timestamp | null;
  export_run_id:    UUID | null;
  created_at:       Timestamp;
}

// ─── Reporting read models (derived, not DB tables) ───────────────────────────

export interface RevenueByPeriod {
  organization_id:         UUID;
  period_id:               UUID;
  period_name:             string;
  period_start:            DateString;
  period_end:              DateString;
  period_status:           FinancialPeriodStatus;
  payment_count:           number;
  total_payments_received: number;
  net_payments:            number;
  total_refunds:           number;
  invoice_count:           number;
  total_invoiced:          number;
  total_vat_invoiced:      number;
  total_outstanding:       number;
}

export interface VatSummaryRow {
  month_start:     DateString;
  currency:        string;
  invoice_count:   number;
  total_subtotal:  number;
  total_vat:       number;
  total_gross:     number;
}

export interface AgingBucket {
  aging_bucket:      'current' | '1_30_days' | '31_60_days' | '61_90_days' | '90_plus_days';
  invoice_count:     number;
  outstanding_amount: number;
  currency:          string;
}

export interface WalletLiabilityRow {
  organization_id: UUID;
  lesson_category: string;
  total_credits:   number;
  student_count:   number;
}

// ─── Phase 4B Insert types ────────────────────────────────────────────────────

export interface DiscountDefinitionInsert {
  name:                 string;
  description?:         string;
  discount_type:        DiscountType;
  discount_scope?:      DiscountScope;
  scope_reference_id?:  UUID;
  scope_category?:      string;
  discount_value:       number;
  max_discount_amount?: number;
  currency?:            string;
  valid_from?:          DateString;
  valid_to?:            DateString;
  is_active?:           boolean;
  requires_coupon?:     boolean;
  metadata?:            Json;
}

export interface CouponCodeInsert {
  discount_id:                  UUID;
  code:                         string;
  description?:                 string;
  redemption_limit_total?:      number;
  redemption_limit_per_student?: number;
  valid_from?:                  DateString;
  valid_to?:                    DateString;
  is_active?:                   boolean;
  metadata?:                    Json;
}

export interface DunningScheduleInsert {
  name:         string;
  description?: string;
  is_default?:  boolean;
  is_active?:   boolean;
  metadata?:    Json;
}

export interface DunningScheduleStageInsert {
  schedule_id:      UUID;
  stage_number:     number;
  days_overdue:     number;
  action_type:      DunningActionType;
  subject_template?: string;
  message_template?: string;
  late_fee_amount?:  number;
  suspend_access?:   boolean;
  is_final_stage?:   boolean;
  metadata?:         Json;
}

// ─── Phase 4B Input DTOs ──────────────────────────────────────────────────────

export interface ProcessRefundInput {
  invoice_id:        UUID;
  refund_type:       RefundType;
  reason_code:       RefundReasonCode;
  refund_amount?:    number;
  credit_qty?:       number;
  credit_category?:  string;
  grant_entry_id?:   UUID;
  payment_id?:       UUID;
  notes?:            string;
}

export interface ApplyDiscountInput {
  invoice_id:   UUID;
  discount_id:  UUID;
}

export interface RedeemCouponInput {
  invoice_id:   UUID;
  coupon_code:  string;
  student_id:   UUID;
}

export interface AllocatePaymentInput {
  payment_id:  UUID;
  invoice_id:  UUID;
  amount:      number;
  notes?:      string;
}

export interface CreateExportRunInput {
  format:     AccountingExportFormat;
  from_date:  DateString;
  to_date:    DateString;
}

export interface RefundListQueryInput {
  invoice_id?:   UUID;
  student_id?:   UUID;
  status?:       RefundStatus | 'all';
  from?:         Timestamp;
  to?:           Timestamp;
  page?:         number;
  per_page?:     number;
}

export interface DiscountListQueryInput {
  is_active?:      boolean;
  discount_type?:  DiscountType;
  discount_scope?: DiscountScope;
  page?:           number;
  per_page?:       number;
}

// ─── Phase 4B.7 domain model ──────────────────────────────────────────────────

export interface AccountingExportEntry {
  id:                   UUID;
  organization_id:      UUID;
  export_run_id:        UUID;
  sequence_number:      number;
  transaction_date:     DateString;
  account_debit:        string;
  account_credit:       string;
  debit_amount:         number;
  credit_amount:        number;
  description:          string;
  source_event_type:    string;
  source_queue_item_id: UUID | null;
  metadata:             Json;
  created_at:           Timestamp;
}

export interface AccountingExportEntryInsert {
  export_run_id:         UUID;
  sequence_number:       number;
  transaction_date:      DateString;
  account_debit:         string;
  account_credit:        string;
  debit_amount:          number;
  credit_amount:         number;
  description?:          string;
  source_event_type:     string;
  source_queue_item_id?: UUID;
  metadata?:             Json;
}

// ─── Phase 4B.7 reporting view read models ────────────────────────────────────

export interface FinanceInvoiceAgingRow {
  invoice_id:              UUID;
  organization_id:         UUID;
  student_id:              UUID;
  student_package_id:      UUID | null;
  invoice_number:          string | null;
  status:                  InvoiceStatus;
  currency:                string;
  total_amount:            number;
  subtotal_amount:         number;
  vat_amount:              number;
  paid_amount:             number;
  outstanding_amount:      number;
  issued_at:               Timestamp | null;
  due_date:                DateString | null;
  paid_at:                 Timestamp | null;
  days_overdue:            number;
  aging_bucket:            'current' | '1_30_days' | '31_60_days' | '61_90_days' | '90_plus_days';
  total_allocated:         number;
  total_refunded:          number;
  dunning_stage:           number | null;
  is_legal_escalated:      boolean | null;
  dunning_next_action_at:  Timestamp | null;
  created_at:              Timestamp;
  updated_at:              Timestamp;
}

export interface FinancePaymentAllocationRow {
  allocation_id:           UUID;
  organization_id:         UUID;
  payment_id:              UUID;
  invoice_id:              UUID;
  allocated_amount:        number;
  allocation_notes:        string | null;
  allocated_at:            Timestamp;
  allocated_by:            UUID | null;
  student_id:              UUID;
  payment_amount:          number;
  payment_method:          PaymentMethod;
  payment_status:          PaymentStatus;
  payment_confirmed_at:    Timestamp | null;
  provider_reference:      string | null;
  invoice_number:          string | null;
  invoice_status:          InvoiceStatus;
  invoice_total:           number;
  invoice_paid:            number;
  invoice_outstanding:     number;
  currency:                string;
}

export interface FinanceRefundSummaryRow {
  refund_id:                UUID;
  organization_id:          UUID;
  invoice_id:               UUID;
  payment_id:               UUID | null;
  student_id:               UUID;
  refund_type:              RefundType;
  refund_status:            RefundStatus;
  reason_code:              RefundReasonCode;
  refund_amount:            number;
  credit_quantity:          number;
  credit_category:          string | null;
  credit_ledger_id:         UUID | null;
  refund_notes:             string | null;
  processed_at:             Timestamp | null;
  processed_by:             UUID | null;
  failed_reason:            string | null;
  created_at:               Timestamp;
  created_by:               UUID | null;
  invoice_number:           string | null;
  invoice_status:           InvoiceStatus;
  invoice_total:            number;
  currency:                 string;
  payment_method:           PaymentMethod | null;
  original_payment_amount:  number | null;
  payment_confirmed_at:     Timestamp | null;
}

export interface FinanceVatSummaryRow {
  invoice_id:        UUID;
  organization_id:   UUID;
  invoice_number:    string | null;
  student_id:        UUID;
  issued_at:         Timestamp;
  issued_month:      DateString;
  currency:          string;
  subtotal_amount:   number;
  vat_amount:        number;
  total_amount:      number;
  effective_vat_rate: number;
  status:            InvoiceStatus;
  paid_at:           Timestamp | null;
}

export interface FinanceRevenueSummaryRow {
  period_id:              UUID;
  organization_id:        UUID;
  period_name:            string;
  period_start:           DateString;
  period_end:             DateString;
  period_status:          FinancialPeriodStatus;
  payment_id:             UUID;
  student_id:             UUID;
  payment_amount:         number;
  refund_amount:          number;
  net_payment_amount:     number;
  payment_method:         PaymentMethod;
  payment_status:         PaymentStatus;
  payment_confirmed_at:   Timestamp;
  invoice_id:             UUID;
  invoice_number:         string | null;
  invoice_total:          number;
  invoice_subtotal:       number;
  invoice_vat:            number;
  currency:               string;
}

// ─── Phase 4B.7 dashboard RPC return types ────────────────────────────────────

export interface FinanceDashboardSnapshot {
  total_outstanding:     number;
  overdue_invoice_count: number;
  overdue_amount:        number;
  payments_this_month:   number;
  invoiced_this_month:   number;
  refunds_this_month:    number;
  unallocated_payments:  number;
  pending_export_items:  number;
  total_credit_liability: number;
  snapshot_at:           string;
  period_month_start:    string;
  currency:              string;
}

export interface OverdueInvoiceSummaryRow {
  aging_bucket:       'current' | '1_30_days' | '31_60_days' | '61_90_days' | '90_plus_days';
  invoice_count:      number;
  outstanding_amount: number;
  legal_count:        number;
  currency:           string;
}

export interface VatLiabilitySummaryRow {
  month_start:        DateString;
  invoice_count:      number;
  net_subtotal:       number;
  total_vat:          number;
  total_gross:        number;
  effective_vat_rate: number;
  currency:           string;
}

export interface PaymentReconciliationSummaryRow {
  metric:         'confirmed_payments' | 'total_allocated' | 'outstanding_receivable' | 'completed_refunds';
  invoice_count:  number;
  payment_count:  number;
  total_amount:   number;
  currency:       string;
}

export interface RefundMetricsSummaryRow {
  reason_code:     RefundReasonCode;
  refund_count:    number;
  total_amount:    number;
  credit_quantity: number;
  currency:        string;
}

// ─── Phase 4B.7 input DTOs ────────────────────────────────────────────────────

export interface CreateAccountingExportInput {
  format:    AccountingExportFormat;
  from_date: DateString;
  to_date:   DateString;
}

export interface FinalizeAccountingExportInput {
  export_run_id:  UUID;
  file_reference: string;
  item_count:     number;
}

export interface AbortAccountingExportInput {
  export_run_id:  UUID;
  error_message:  string;
}

export interface DateRangeQueryInput {
  from_date: DateString;
  to_date:   DateString;
}

// ─── Query/filter inputs ──────────────────────────────────────────────────────

export interface PackageOfferingListQueryInput {
  lesson_category?: LessonCategory;
  status?:          PackageStatus | 'all';
  page?:            number;
  per_page?:        number;
  sort_by?:         string;
  sort_dir?:        'asc' | 'desc';
}

export interface StudentPackageListQueryInput {
  student_id?:  UUID;
  status?:      PackageStatus | 'all';
  page?:        number;
  per_page?:    number;
}

export interface InvoiceListQueryInput {
  student_id?: UUID;
  status?:     InvoiceStatus | 'all';
  from?:       Timestamp;
  to?:         Timestamp;
  page?:       number;
  per_page?:   number;
  sort_by?:    string;
  sort_dir?:   'asc' | 'desc';
}

export interface PaymentListQueryInput {
  invoice_id?:  UUID;
  student_id?:  UUID;
  status?:      PaymentStatus | 'all';
  method?:      PaymentMethod;
  from?:        Timestamp;
  to?:          Timestamp;
  page?:        number;
  per_page?:    number;
}

export interface CreditLedgerListQueryInput {
  student_id:       UUID;
  lesson_category?: LessonCategory;
  entry_type?:      CreditEntryType;
  from?:            Timestamp;
  to?:              Timestamp;
  page?:            number;
  per_page?:        number;
}
