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

  status: CorporateCustomerStatus;

  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
  created_by: UUID | null;
  updated_by: UUID | null;
}

export interface CreateCorporateCustomerInput {
  company_name: string;
  org_number?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  city?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  contact_phone?: string;
  invoice_text?: string;
  notes?: string;
  status?: CorporateCustomerStatus;
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
