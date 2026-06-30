import type { UUID, Timestamp } from './common.types.js';

export type CorporateCustomerStatus = 'active' | 'paused' | 'archived';

export interface CorporateCustomer {
  id: UUID;
  organization_id: UUID;

  org_number: string | null;
  company_name: string;

  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;

  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;

  invoice_text: string | null;
  notes: string | null;

  alt_name: string | null;
  default_discount_pct: number | null;
  payment_terms_days: number | null;
  economy_notes: string | null;
  has_debt_collection: boolean;

  status: CorporateCustomerStatus;

  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
  created_by: UUID | null;
  updated_by: UUID | null;
}

export interface CreateCorporateCustomerInput {
  company_name: string;
  org_number?: string | undefined;
  address_line1?: string | undefined;
  address_line2?: string | undefined;
  postal_code?: string | undefined;
  city?: string | undefined;
  contact_first_name?: string | undefined;
  contact_last_name?: string | undefined;
  contact_email?: string | undefined;
  contact_phone?: string | undefined;
  invoice_text?: string | undefined;
  notes?: string | undefined;
  status?: CorporateCustomerStatus | undefined;
  alt_name?: string | undefined;
  default_discount_pct?: number | undefined;
  payment_terms_days?: number | undefined;
  economy_notes?: string | undefined;
  has_debt_collection?: boolean | undefined;
}

export type UpdateCorporateCustomerInput = Partial<CreateCorporateCustomerInput>;

export interface CorporateCustomerListQueryInput {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  search?: string;
  status?: CorporateCustomerStatus;
}

// ─── Corporate Contract ───────────────────────────────────────────────────────

export interface CorporateContract {
  id:                    UUID;
  organization_id:       UUID;
  corporate_customer_id: UUID;

  name:               string;
  er_ref:             string | null;
  payment_terms_days: number | null;
  credit_limit_sek:   number | null;
  discount_pct:       number | null;
  is_active:          boolean;
  comment:            string | null;
  contact_email:      string | null;
  contact_name:       string | null;
  contact_phone:      string | null;

  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  created_by: UUID | null;
  updated_by: UUID | null;
}

export interface CreateCorporateContractInput {
  corporate_customer_id: string;
  name:               string;
  er_ref?:            string | undefined;
  payment_terms_days?: number | undefined;
  credit_limit_sek?:  number | undefined;
  discount_pct?:      number | undefined;
  is_active?:         boolean | undefined;
  comment?:           string | undefined;
  contact_email?:     string | undefined;
  contact_name?:      string | undefined;
  contact_phone?:     string | undefined;
}

export type UpdateCorporateContractInput = Partial<Omit<CreateCorporateContractInput, 'corporate_customer_id'>>;
