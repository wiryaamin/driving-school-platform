import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SwedishOrgSettings {
  organization_id:        string;
  company_name:           string | null;
  org_number:             string | null;
  vat_number:             string | null;
  bank_name:              string | null;
  bank_account_number:    string | null;
  bank_clearing_number:   string | null;
  bankgiro_number:        string | null;
  plusgiro_number:        string | null;
  invoice_due_days:       number | null;
  invoice_payment_terms:  string | null;
  invoice_footer_text:    string | null;
  default_vat_rate:       number | null;
  swish_number:           string | null;
  autogiro_enabled:       boolean | null;
  created_at:             string;
  updated_at:             string;
}

export interface OcrReference {
  id:           string;
  invoice_id:   string;
  organization_id: string;
  ocr_number:   string;
  invoice_number: string | null;
  created_at:   string;
}

export type SwedishSettingsInput = Partial<Omit<SwedishOrgSettings, 'organization_id' | 'created_at' | 'updated_at'>>;

// ─── Query keys ───────────────────────────────────────────────────────────────

export const swedishSettingsKeys = {
  all:      ['swedish-settings'] as const,
  settings: ()              => [...swedishSettingsKeys.all, 'settings']       as const,
  ocr:      ()              => [...swedishSettingsKeys.all, 'ocr']            as const,
  ocrItem:  (id: string)    => [...swedishSettingsKeys.all, 'ocr-item', id]   as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSwedishSettings() {
  return useQuery({
    queryKey: swedishSettingsKeys.settings(),
    queryFn:  async (): Promise<SwedishOrgSettings | null> => {
      const { data, error } = await supabase.functions.invoke<SwedishOrgSettings>(
        'swedish-settings', { method: 'GET' },
      );
      if (error) throw error;
      return data ?? null;
    },
    staleTime: 60_000,
  });
}

export function useOcrReferences() {
  return useQuery({
    queryKey: swedishSettingsKeys.ocr(),
    queryFn:  async (): Promise<OcrReference[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: OcrReference[] }>(
        'swedish-settings/ocr', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useUpdateSwedishSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SwedishSettingsInput): Promise<SwedishOrgSettings> => {
      const { data, error } = await supabase.functions.invoke<SwedishOrgSettings>(
        'swedish-settings',
        { method: 'PUT', body: input },
      );
      if (error) throw error;
      return data ?? ({} as SwedishOrgSettings);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: swedishSettingsKeys.settings() }),
  });
}

export function useSeedBAS() {
  return useMutation({
    mutationFn: async (): Promise<{ seeded: number }> => {
      const { data, error } = await supabase.functions.invoke<{ seeded: number }>(
        'swedish-settings/seed-bas', { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { seeded: 0 };
    },
  });
}

export function useSeedDunning() {
  return useMutation({
    mutationFn: async (): Promise<{ schedule_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ schedule_id: string }>(
        'swedish-settings/seed-dunning', { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { schedule_id: '' };
    },
  });
}
