/**
 * Swedish finance domain types — Phase 4C
 * BAS 2020, Swedish VAT, SIE4, Fortnox, OCR references.
 */

import type { VatPeriodFrequencyEnum, VatPeriodStatusEnum, FortnoxSyncStatusEnum, Json } from './database.types.js';

// ─── BAS Account Catalog ──────────────────────────────────────────────────────

export type BasAccountType    = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'vat';
export type BasNormalBalance  = 'debit' | 'credit';

export interface BasAccountCatalog {
  id:              string;
  account_code:    string;
  account_name:    string;
  account_name_en: string | null;
  account_type:    BasAccountType;
  normal_balance:  BasNormalBalance;
  vat_code:        string | null;
  parent_code:     string | null;
  is_active:       boolean;
  sort_order:      number;
  created_at:      string;
}

// ─── VAT Rates ────────────────────────────────────────────────────────────────

export type SwedishVatRateCode = 'SE25' | 'SE12' | 'SE6' | 'SE0';

export interface VatRate {
  id:             string;
  rate_code:      SwedishVatRateCode;
  rate_percent:   number;
  description:    string;
  description_en: string | null;
  is_standard:    boolean;
  effective_from: string;
  effective_to:   string | null;
  created_at:     string;
}

// ─── Platform BAS Event Mappings ─────────────────────────────────────────────

export interface PlatformBasEventMapping {
  id:             string;
  event_type:     string;
  account_debit:  string;
  account_credit: string;
  vat_rate_code:  string | null;
  description:    string | null;
  is_active:      boolean;
  created_at:     string;
}

// ─── VAT Periods (momsperioder) ──────────────────────────────────────────────

export interface VatPeriod {
  id:               string;
  organization_id:  string;
  period_start:     string;
  period_end:       string;
  frequency:        VatPeriodFrequencyEnum;
  status:           VatPeriodStatusEnum;
  filing_reference: string | null;
  filed_at:         string | null;
  filed_by:         string | null;
  locked_at:        string | null;
  locked_by:        string | null;
  total_output_vat: number;
  total_input_vat:  number;
  net_vat_payable:  number;
  notes:            string | null;
  metadata:         Json;
  created_at:       string;
  updated_at:       string;
}

export interface VatPeriodInsert {
  period_start:      string;
  period_end:        string;
  frequency?:        VatPeriodFrequencyEnum;
  notes?:            string | null;
  metadata?:         Json;
}

// ─── VAT Report Entries ───────────────────────────────────────────────────────

export interface VatReportEntry {
  id:               string;
  organization_id:  string;
  vat_period_id:    string;
  invoice_id:       string | null;
  transaction_date: string;
  vat_rate_code:    string | null;
  net_amount:       number;
  vat_amount:       number;
  gross_amount:     number;
  bas_account:      string;
  vat_account:      string | null;
  description:      string | null;
  source_type:      string;
  source_id:        string;
  created_at:       string;
}

// ─── Organization Swedish Settings ───────────────────────────────────────────

export interface OrganizationSwedishSettings {
  id:                      string;
  organization_id:         string;
  org_number:              string | null;
  vat_reg_number:          string | null;
  f_tax_registered:        boolean;
  bankgiro_number:         string | null;
  plusgiro_number:         string | null;
  invoice_payment_days:    number;
  reminder_fee_amount:     number;
  late_interest_rate:      number;
  sie4_company_name:       string | null;
  sie4_fiscal_year_start:  string | null;
  invoice_footer_text:     string | null;
  invoice_header_logo_url: string | null;
  is_active:               boolean;
  created_at:              string;
  updated_at:              string;
}

export interface SwedishSettingsInput {
  org_number?:              string | null;
  vat_reg_number?:          string | null;
  f_tax_registered?:        boolean;
  bankgiro_number?:         string | null;
  plusgiro_number?:         string | null;
  invoice_payment_days?:    number;
  reminder_fee_amount?:     number;
  late_interest_rate?:      number;
  sie4_company_name?:       string | null;
  sie4_fiscal_year_start?:  string | null;
  invoice_footer_text?:     string | null;
  invoice_header_logo_url?: string | null;
}

// ─── Invoice OCR References ───────────────────────────────────────────────────

export interface InvoiceOcrReference {
  id:               string;
  organization_id:  string;
  invoice_id:       string;
  ocr_reference:    string;
  payment_ref_full: string;
  created_at:       string;
}

// ─── SIE4 Exports ─────────────────────────────────────────────────────────────

export interface Sie4Export {
  id:                string;
  organization_id:   string;
  export_run_id:     string;
  content_text:      string;
  content_hash:      string;
  voucher_count:     number;
  transaction_count: number;
  from_date:         string;
  to_date:           string;
  fiscal_year_start: string | null;
  generated_at:      string;
  generated_by:      string | null;
}

// ─── Fortnox Sync ─────────────────────────────────────────────────────────────

export interface FortnoxCustomerSync {
  id:                      string;
  organization_id:         string;
  student_id:              string;
  fortnox_customer_number: string | null;
  sync_status:             FortnoxSyncStatusEnum;
  last_synced_at:          string | null;
  last_sync_attempt_at:    string | null;
  sync_error:              string | null;
  retry_count:             number;
  local_hash:              string | null;
  fortnox_data:            Json;
  created_at:              string;
  updated_at:              string;
}

export interface FortnoxInvoiceSync {
  id:                      string;
  organization_id:         string;
  invoice_id:              string;
  fortnox_invoice_number:  string | null;
  fortnox_document_number: string | null;
  sync_status:             FortnoxSyncStatusEnum;
  last_synced_at:          string | null;
  last_sync_attempt_at:    string | null;
  sync_error:              string | null;
  retry_count:             number;
  local_hash:              string | null;
  fortnox_data:            Json;
  created_at:              string;
  updated_at:              string;
}

export interface FortnoxPaymentSync {
  id:                   string;
  organization_id:      string;
  payment_id:           string;
  fortnox_voucher_id:   string | null;
  fortnox_payment_ref:  string | null;
  sync_status:          FortnoxSyncStatusEnum;
  last_synced_at:       string | null;
  last_sync_attempt_at: string | null;
  sync_error:           string | null;
  retry_count:          number;
  local_hash:           string | null;
  fortnox_data:         Json;
  created_at:           string;
  updated_at:           string;
}

export interface FortnoxExportLineage {
  id:               string;
  organization_id:  string;
  export_run_id:    string;
  fortnox_batch_id: string | null;
  sync_status:      FortnoxSyncStatusEnum;
  entries_total:    number;
  entries_synced:   number;
  entries_failed:   number;
  exported_at:      string | null;
  exported_by:      string | null;
  sync_error:       string | null;
  fortnox_data:     Json;
  created_at:       string;
  updated_at:       string;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateVatPeriodDto {
  period_start: string;
  period_end:   string;
  frequency?:   VatPeriodFrequencyEnum;
  notes?:       string;
}

export interface LockVatPeriodDto {
  period_id:         string;
  filing_reference?: string;
}

export interface GenerateSie4Dto {
  export_run_id: string;
}

export interface QueueFortnoxSyncDto {
  entity:     'customer' | 'invoice' | 'payment';
  entity_id:  string;
}
