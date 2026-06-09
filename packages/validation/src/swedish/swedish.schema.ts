import { z } from 'zod';

// ─── BAS ──────────────────────────────────────────────────────────────────────

export const BasAccountTypeSchema = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense', 'vat']);
export const SwedishVatRateCodeSchema = z.enum(['SE25', 'SE12', 'SE6', 'SE0']);

// ─── Swedish Settings ─────────────────────────────────────────────────────────

export const UpsertSwedishSettingsSchema = z.object({
  org_number:              z.string().regex(/^\d{6}-\d{4}$/, 'Org number must be in format 559000-0000').optional().nullable(),
  vat_reg_number:          z.string().regex(/^SE\d{12}$/, 'VAT reg number must be in format SE559000000001').optional().nullable(),
  f_tax_registered:        z.boolean().optional(),
  bankgiro_number:         z.string().optional().nullable(),
  plusgiro_number:         z.string().optional().nullable(),
  invoice_payment_days:    z.number().int().min(1).max(365).optional(),
  reminder_fee_amount:     z.number().min(60, 'Reminder fee minimum is 60 SEK (Inkassolagen)').optional(),
  late_interest_rate:      z.number().min(0).max(0.99).optional(),
  sie4_company_name:       z.string().max(100).optional().nullable(),
  sie4_fiscal_year_start:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  invoice_footer_text:     z.string().max(500).optional().nullable(),
  invoice_header_logo_url: z.string().url().optional().nullable(),
});

export type UpsertSwedishSettingsDto = z.infer<typeof UpsertSwedishSettingsSchema>;

// ─── VAT Periods ──────────────────────────────────────────────────────────────

export const VatPeriodFrequencySchema = z.enum(['monthly', 'quarterly', 'annually']);

export const CreateVatPeriodSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'period_start must be YYYY-MM-DD'),
  period_end:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'period_end must be YYYY-MM-DD'),
  frequency:    VatPeriodFrequencySchema.optional().default('monthly'),
  notes:        z.string().max(1000).optional(),
}).refine(d => d.period_end >= d.period_start, {
  message: 'period_end must be >= period_start',
  path:    ['period_end'],
});

export type CreateVatPeriodDto = z.infer<typeof CreateVatPeriodSchema>;

export const LockVatPeriodSchema = z.object({
  filing_reference: z.string().max(100).optional(),
});

export type LockVatPeriodDto = z.infer<typeof LockVatPeriodSchema>;

// ─── SIE4 ─────────────────────────────────────────────────────────────────────

export const GenerateSie4Schema = z.object({
  export_run_id: z.string().uuid(),
});

export type GenerateSie4Dto = z.infer<typeof GenerateSie4Schema>;

// ─── Fortnox ─────────────────────────────────────────────────────────────────

export const FortnoxQueueSyncSchema = z.object({
  entity:    z.enum(['customer', 'invoice', 'payment']),
  entity_id: z.string().uuid(),
});

export type FortnoxQueueSyncDto = z.infer<typeof FortnoxQueueSyncSchema>;
