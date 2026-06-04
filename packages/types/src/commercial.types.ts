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
