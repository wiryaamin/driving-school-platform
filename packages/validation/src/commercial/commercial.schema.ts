import { z } from 'zod';

const UuidSchema  = z.string().uuid();
const MoneySchema = z.number().nonnegative().multipleOf(0.01);
const VatSchema   = z.number().min(0).max(1);

const LessonCategorySchema = z.enum([
  'driving', 'theory', 'risk1', 'risk2',
  'simulator', 'assessment', 'intensive', 'group_theory', 'other',
]);

const PackageTypeSchema = z.enum([
  'driving', 'theory', 'risk1', 'risk2', 'intensive', 'mixed', 'custom',
]);

const PackageStatusSchema = z.enum(['draft', 'active', 'archived', 'discontinued']);

const PaymentMethodSchema = z.enum([
  'manual', 'card', 'bank_transfer', 'swish', 'stripe', 'invoice_credit', 'other',
]);

const InvoiceLineTypeSchema = z.enum([
  'package', 'lesson', 'fee', 'discount', 'tax', 'other',
]);

// ─── Package catalog ──────────────────────────────────────────────────────────

export const CreatePackageCatalogSchema = z.object({
  name:             z.string().min(1).max(200),
  description:      z.string().max(1000).optional(),
  package_type:     PackageTypeSchema.optional().default('driving'),
  lesson_category:  LessonCategorySchema,
  default_quantity: z.number().int().min(1).max(500),
  default_price:    MoneySchema,
  currency:         z.string().length(3).optional().default('SEK'),
  vat_rate:         VatSchema.optional().default(0.25),
  validity_days:    z.number().int().min(1).max(3650).optional(),
  is_active:        z.boolean().optional().default(true),
  metadata:         z.record(z.unknown()).optional().default({}),
});

export const UpdatePackageCatalogSchema = CreatePackageCatalogSchema.partial();

// ─── Package offerings ────────────────────────────────────────────────────────

const BundleCreditComponentSchema = z.object({
  lesson_category: LessonCategorySchema,
  quantity:        z.number().int().min(1).max(500),
});

export const CreatePackageOfferingSchema = z.object({
  catalog_id:      UuidSchema.optional(),
  name:            z.string().min(1).max(200),
  description:     z.string().max(1000).optional(),
  package_type:    PackageTypeSchema.optional().default('driving'),
  lesson_category: LessonCategorySchema,
  quantity:        z.number().int().min(1).max(500),
  bundle_credits:  z.array(BundleCreditComponentSchema).optional().default([]),
  price:           MoneySchema,
  currency:        z.string().length(3).optional().default('SEK'),
  vat_rate:        VatSchema.optional().default(0.25),
  validity_days:   z.number().int().min(1).max(3650).optional(),
  sort_order:      z.number().int().min(0).optional().default(0),
  metadata:        z.record(z.unknown()).optional().default({}),
});

export const UpdatePackageOfferingSchema = z.object({
  name:          z.string().min(1).max(200).optional(),
  description:   z.string().max(1000).optional(),
  price:         MoneySchema.optional(),
  vat_rate:      VatSchema.optional(),
  validity_days: z.number().int().min(1).max(3650).optional(),
  sort_order:    z.number().int().min(0).optional(),
  metadata:      z.record(z.unknown()).optional(),
});

export const PackageOfferingListQuerySchema = z.object({
  lesson_category: LessonCategorySchema.optional(),
  status:          z.union([PackageStatusSchema, z.literal('all')]).optional().default('active'),
  page:            z.coerce.number().int().min(1).optional().default(1),
  per_page:        z.coerce.number().int().min(1).max(100).optional().default(25),
  sort_by:         z.string().optional().default('sort_order'),
  sort_dir:        z.enum(['asc', 'desc']).optional().default('asc'),
});

// ─── Purchase ─────────────────────────────────────────────────────────────────

export const PurchasePackageSchema = z.object({
  student_id:   UuidSchema,
  offering_id:  UuidSchema,
});

export const StudentPackageListQuerySchema = z.object({
  student_id:  UuidSchema.optional(),
  status:      z.union([PackageStatusSchema, z.literal('all')]).optional().default('active'),
  page:        z.coerce.number().int().min(1).optional().default(1),
  per_page:    z.coerce.number().int().min(1).max(100).optional().default(25),
});

// ─── Invoice ──────────────────────────────────────────────────────────────────

export const CreateInvoiceDraftSchema = z.object({
  student_id:         UuidSchema,
  student_package_id: UuidSchema.optional(),
  currency:           z.string().length(3).optional().default('SEK'),
  due_date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:              z.string().max(1000).optional(),
  metadata:           z.record(z.unknown()).optional().default({}),
});

export const AddInvoiceLineItemSchema = z.object({
  invoice_id:         UuidSchema,
  student_package_id: UuidSchema.optional(),
  line_type:          InvoiceLineTypeSchema.optional().default('package'),
  description:        z.string().min(1).max(500),
  quantity:           z.number().int().min(1).optional().default(1),
  unit_price:         MoneySchema,
  vat_rate:           VatSchema.optional().default(0.25),
  sort_order:         z.number().int().min(0).optional().default(0),
});

export const IssueInvoiceSchema = z.object({
  invoice_id: UuidSchema,
});

export const VoidInvoiceSchema = z.object({
  invoice_id: UuidSchema,
  reason:     z.string().max(500).optional(),
});

export const InvoiceListQuerySchema = z.object({
  student_id: UuidSchema.optional(),
  status:     z.union([
    z.enum(['draft', 'issued', 'paid', 'partially_paid', 'void', 'overdue']),
    z.literal('all'),
  ]).optional().default('all'),
  from:       z.string().datetime({ offset: true }).optional(),
  to:         z.string().datetime({ offset: true }).optional(),
  page:       z.coerce.number().int().min(1).optional().default(1),
  per_page:   z.coerce.number().int().min(1).max(100).optional().default(25),
  sort_by:    z.string().optional().default('created_at'),
  sort_dir:   z.enum(['asc', 'desc']).optional().default('desc'),
});

// ─── Payments ─────────────────────────────────────────────────────────────────

export const RecordPaymentSchema = z.object({
  invoice_id:          UuidSchema,
  amount:              z.number().positive().multipleOf(0.01),
  payment_method:      PaymentMethodSchema,
  provider_reference:  z.string().max(200).optional(),
  notes:               z.string().max(1000).optional(),
});

export const PaymentListQuerySchema = z.object({
  invoice_id:  UuidSchema.optional(),
  student_id:  UuidSchema.optional(),
  status:      z.union([
    z.enum(['pending', 'confirmed', 'failed', 'refunded', 'partially_refunded', 'void']),
    z.literal('all'),
  ]).optional().default('all'),
  method:      PaymentMethodSchema.optional(),
  from:        z.string().datetime({ offset: true }).optional(),
  to:          z.string().datetime({ offset: true }).optional(),
  page:        z.coerce.number().int().min(1).optional().default(1),
  per_page:    z.coerce.number().int().min(1).max(100).optional().default(25),
});

// ─── Wallet ───────────────────────────────────────────────────────────────────

export const WalletQuerySchema = z.object({
  student_id: UuidSchema,
});

export const CreditLedgerListQuerySchema = z.object({
  student_id:      UuidSchema,
  lesson_category: LessonCategorySchema.optional(),
  entry_type:      z.enum(['grant', 'bonus', 'consume', 'expire', 'adjust', 'reverse']).optional(),
  from:            z.string().datetime({ offset: true }).optional(),
  to:              z.string().datetime({ offset: true }).optional(),
  page:            z.coerce.number().int().min(1).optional().default(1),
  per_page:        z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const GrantCreditSchema = z.object({
  student_id:      UuidSchema,
  lesson_category: LessonCategorySchema,
  quantity:        z.number().int().min(1).max(1000),
  description:     z.string().max(500).optional(),
  expires_at:      z.string().datetime({ offset: true }).optional(),
  metadata:        z.record(z.unknown()).optional().default({}),
});

// ─── Financial periods ────────────────────────────────────────────────────────

export const CreateFinancialPeriodSchema = z.object({
  name:         z.string().min(1).max(100),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:        z.string().max(1000).optional(),
  metadata:     z.record(z.unknown()).optional().default({}),
}).refine(data => data.period_end >= data.period_start, {
  message: 'period_end must be on or after period_start',
  path: ['period_end'],
});

// ─── Phase 4B: Enums ──────────────────────────────────────────────────────────

const RefundTypeSchema = z.enum(['full', 'partial', 'credit_only', 'payment_only']);
const RefundReasonCodeSchema = z.enum([
  'duplicate_payment', 'student_cancellation', 'administrative_error',
  'service_failure', 'goodwill', 'fraud_prevention', 'partial_adjustment',
]);
const DiscountTypeSchema   = z.enum(['percentage', 'fixed']);
const DiscountScopeSchema  = z.enum(['offering', 'catalog', 'category', 'all']);
const DunningActionSchema  = z.enum(['email', 'sms', 'both', 'legal']);
const ExportFormatSchema   = z.enum(['sie4', 'fortnox_csv', 'visma_csv']);

// ─── Phase 4B: Refunds ────────────────────────────────────────────────────────

export const ProcessRefundSchema = z.object({
  invoice_id:       UuidSchema,
  refund_type:      RefundTypeSchema,
  reason_code:      RefundReasonCodeSchema,
  refund_amount:    MoneySchema.optional().default(0),
  credit_qty:       z.number().int().nonnegative().optional().default(0),
  credit_category:  LessonCategorySchema.optional(),
  grant_entry_id:   UuidSchema.optional(),
  payment_id:       UuidSchema.optional(),
  notes:            z.string().max(1000).optional(),
}).refine(
  d => (d.refund_amount ?? 0) > 0 || (d.credit_qty ?? 0) > 0,
  { message: 'At least one of refund_amount or credit_qty must be > 0' }
).refine(
  d => !(d.credit_qty && d.credit_qty > 0) || d.credit_category !== undefined,
  { message: 'credit_category is required when credit_qty > 0', path: ['credit_category'] }
);

export const AllocatePaymentSchema = z.object({
  payment_id: UuidSchema,
  invoice_id: UuidSchema,
  amount:     MoneySchema.positive(),
  notes:      z.string().max(1000).optional(),
});

export const RefundListQuerySchema = z.object({
  invoice_id: UuidSchema.optional(),
  student_id: UuidSchema.optional(),
  status:     z.enum(['pending','processing','completed','failed','cancelled','all']).optional(),
  from:       z.string().datetime().optional(),
  to:         z.string().datetime().optional(),
  page:       z.number().int().positive().optional().default(1),
  per_page:   z.number().int().min(1).max(100).optional().default(25),
});

// ─── Phase 4B: Discounts ──────────────────────────────────────────────────────

export const CreateDiscountSchema = z.object({
  name:                 z.string().min(1).max(200),
  description:          z.string().max(1000).optional(),
  discount_type:        DiscountTypeSchema,
  discount_scope:       DiscountScopeSchema.optional().default('all'),
  scope_reference_id:   UuidSchema.optional(),
  scope_category:       LessonCategorySchema.optional(),
  discount_value:       z.number().positive(),
  max_discount_amount:  MoneySchema.positive().optional(),
  currency:             z.string().length(3).optional().default('SEK'),
  valid_from:           z.string().date().optional(),
  valid_to:             z.string().date().optional(),
  is_active:            z.boolean().optional().default(true),
  requires_coupon:      z.boolean().optional().default(false),
  metadata:             z.record(z.unknown()).optional().default({}),
}).refine(
  d => d.discount_type !== 'percentage' || (d.discount_value > 0 && d.discount_value <= 1),
  { message: 'Percentage discount_value must be between 0 and 1', path: ['discount_value'] }
).refine(
  d => !(d.discount_scope === 'offering' || d.discount_scope === 'catalog') || d.scope_reference_id !== undefined,
  { message: 'scope_reference_id is required for offering/catalog scope', path: ['scope_reference_id'] }
).refine(
  d => d.discount_scope !== 'category' || d.scope_category !== undefined,
  { message: 'scope_category is required for category scope', path: ['scope_category'] }
);

export const ApplyDiscountSchema = z.object({
  invoice_id:  UuidSchema,
  discount_id: UuidSchema,
});

export const CreateCouponSchema = z.object({
  discount_id:                  UuidSchema,
  code:                         z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase alphanumeric'),
  description:                  z.string().max(500).optional(),
  redemption_limit_total:       z.number().int().positive().optional(),
  redemption_limit_per_student: z.number().int().positive().optional(),
  valid_from:                   z.string().date().optional(),
  valid_to:                     z.string().date().optional(),
  is_active:                    z.boolean().optional().default(true),
  metadata:                     z.record(z.unknown()).optional().default({}),
});

export const RedeemCouponSchema = z.object({
  invoice_id:  UuidSchema,
  coupon_code: z.string().min(1).max(50),
  student_id:  UuidSchema,
});

// ─── Phase 4B: Dunning ────────────────────────────────────────────────────────

export const CreateDunningScheduleSchema = z.object({
  name:         z.string().min(1).max(200),
  description:  z.string().max(1000).optional(),
  is_default:   z.boolean().optional().default(false),
  is_active:    z.boolean().optional().default(true),
  metadata:     z.record(z.unknown()).optional().default({}),
});

export const CreateDunningStageSchema = z.object({
  stage_number:     z.number().int().min(1),
  days_overdue:     z.number().int().nonnegative(),
  action_type:      DunningActionSchema,
  subject_template: z.string().max(500).optional(),
  message_template: z.string().max(2000).optional(),
  late_fee_amount:  MoneySchema.optional().default(0),
  suspend_access:   z.boolean().optional().default(false),
  is_final_stage:   z.boolean().optional().default(false),
  metadata:         z.record(z.unknown()).optional().default({}),
});

// ─── Phase 4B: Accounting exports ────────────────────────────────────────────

export const CreateExportRunSchema = z.object({
  format:     ExportFormatSchema,
  from_date:  z.string().date(),
  to_date:    z.string().date(),
}).refine(d => d.to_date >= d.from_date, {
  message: 'to_date must be on or after from_date',
  path: ['to_date'],
});

export const UpsertChartEntrySchema = z.object({
  event_type:     z.string().min(1).max(100),
  account_debit:  z.string().min(1).max(20),
  account_credit: z.string().min(1).max(20),
  description:    z.string().max(500).optional(),
  is_active:      z.boolean().optional().default(true),
});

// ─── Phase 4B.7: Reporting queries ───────────────────────────────────────────

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const DateRangeQuerySchema = z.object({
  from_date: DateStringSchema,
  to_date:   DateStringSchema,
}).refine(d => d.from_date <= d.to_date, {
  message: 'from_date must be on or before to_date',
  path: ['to_date'],
});

export const VatLiabilityQuerySchema = DateRangeQuerySchema;

export const RefundMetricsQuerySchema = DateRangeQuerySchema;

// ─── Phase 4B.7: Accounting exports (RPC-based) ───────────────────────────────

export const CreateAccountingExportSchema = z.object({
  format:    z.enum(['sie4', 'fortnox_csv', 'visma_csv']),
  from_date: DateStringSchema,
  to_date:   DateStringSchema,
}).refine(d => d.from_date <= d.to_date, {
  message: 'from_date must be on or before to_date',
  path: ['to_date'],
});

export const FinalizeAccountingExportSchema = z.object({
  export_run_id:  z.string().uuid(),
  file_reference: z.string().min(1).max(1000),
  item_count:     z.number().int().min(0),
});

export const AbortAccountingExportSchema = z.object({
  export_run_id: z.string().uuid(),
  error_message: z.string().min(1).max(2000),
});

// ─── Inferred DTO types ───────────────────────────────────────────────────────

export type CreatePackageCatalogDto      = z.infer<typeof CreatePackageCatalogSchema>;
export type UpdatePackageCatalogDto      = z.infer<typeof UpdatePackageCatalogSchema>;
export type CreatePackageOfferingDto     = z.infer<typeof CreatePackageOfferingSchema>;
export type UpdatePackageOfferingDto     = z.infer<typeof UpdatePackageOfferingSchema>;
export type PackageOfferingListQueryDto  = z.infer<typeof PackageOfferingListQuerySchema>;
export type PurchasePackageDto           = z.infer<typeof PurchasePackageSchema>;
export type StudentPackageListQueryDto   = z.infer<typeof StudentPackageListQuerySchema>;
export type CreateInvoiceDraftDto        = z.infer<typeof CreateInvoiceDraftSchema>;
export type AddInvoiceLineItemDto        = z.infer<typeof AddInvoiceLineItemSchema>;
export type IssueInvoiceDto              = z.infer<typeof IssueInvoiceSchema>;
export type VoidInvoiceDto               = z.infer<typeof VoidInvoiceSchema>;
export type InvoiceListQueryDto          = z.infer<typeof InvoiceListQuerySchema>;
export type RecordPaymentDto             = z.infer<typeof RecordPaymentSchema>;
export type PaymentListQueryDto          = z.infer<typeof PaymentListQuerySchema>;
export type WalletQueryDto               = z.infer<typeof WalletQuerySchema>;
export type CreditLedgerListQueryDto     = z.infer<typeof CreditLedgerListQuerySchema>;
export type GrantCreditDto               = z.infer<typeof GrantCreditSchema>;
export type CreateFinancialPeriodDto     = z.infer<typeof CreateFinancialPeriodSchema>;
// Phase 4B
export type ProcessRefundDto            = z.infer<typeof ProcessRefundSchema>;
export type AllocatePaymentDto          = z.infer<typeof AllocatePaymentSchema>;
export type RefundListQueryDto          = z.infer<typeof RefundListQuerySchema>;
export type CreateDiscountDto           = z.infer<typeof CreateDiscountSchema>;
export type ApplyDiscountDto            = z.infer<typeof ApplyDiscountSchema>;
export type CreateCouponDto             = z.infer<typeof CreateCouponSchema>;
export type RedeemCouponDto             = z.infer<typeof RedeemCouponSchema>;
export type CreateDunningScheduleDto    = z.infer<typeof CreateDunningScheduleSchema>;
export type CreateDunningStageDto       = z.infer<typeof CreateDunningStageSchema>;
export type CreateExportRunDto          = z.infer<typeof CreateExportRunSchema>;
export type UpsertChartEntryDto         = z.infer<typeof UpsertChartEntrySchema>;
// Phase 4B.7
export type DateRangeQueryDto           = z.infer<typeof DateRangeQuerySchema>;
export type VatLiabilityQueryDto        = z.infer<typeof VatLiabilityQuerySchema>;
export type RefundMetricsQueryDto       = z.infer<typeof RefundMetricsQuerySchema>;
export type CreateAccountingExportDto   = z.infer<typeof CreateAccountingExportSchema>;
export type FinalizeAccountingExportDto = z.infer<typeof FinalizeAccountingExportSchema>;
export type AbortAccountingExportDto    = z.infer<typeof AbortAccountingExportSchema>;
