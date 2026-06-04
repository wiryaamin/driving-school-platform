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
