import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type {
  CorporateCustomer,
  CorporateCustomerStatus,
  CorporateCustomerListQueryInput,
  CreateCorporateCustomerInput,
  UpdateCorporateCustomerInput,
  CorporateContract,
  CreateCorporateContractInput,
  UpdateCorporateContractInput,
} from '@platform/types';

export type { CorporateCustomer, CorporateCustomerStatus, CorporateContract };

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface CorporateListMeta {
  total:    number;
  page:     number;
  per_page: number;
  has_more: boolean;
}

export interface CorporateListResponse {
  data: CorporateCustomer[];
  meta: CorporateListMeta;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const corporateKeys = {
  all:     ['corporate'] as const,
  lists:   () => [...corporateKeys.all, 'list']          as const,
  list:    (p: CorporateCustomerListQueryInput) => [...corporateKeys.lists(), p] as const,
  details: () => [...corporateKeys.all, 'detail']        as const,
  detail:  (id: string) => [...corporateKeys.details(), id] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiList(params: CorporateCustomerListQueryInput): Promise<CorporateListResponse> {
  const sp = new URLSearchParams();
  if (params.page     !== undefined) sp.set('page',     String(params.page));
  if (params.per_page !== undefined) sp.set('per_page', String(params.per_page));
  if (params.sort_by  !== undefined) sp.set('sort_by',  params.sort_by);
  if (params.sort_dir !== undefined) sp.set('sort_dir', params.sort_dir);
  if (params.search   !== undefined && params.search.trim() !== '') sp.set('search', params.search.trim());
  if (params.status   !== undefined) sp.set('status',   params.status);

  const fn = sp.toString() ? `corporate-customers?${sp.toString()}` : 'corporate-customers';
  const { data, error } = await supabase.functions.invoke<CorporateListResponse>(fn, { method: 'GET' });
  if (error) throw error;
  return data ?? { data: [], meta: { total: 0, page: 1, per_page: 25, has_more: false } };
}

async function apiGetById(id: string): Promise<CorporateCustomer> {
  const { data, error } = await supabase.functions.invoke<{ data: CorporateCustomer }>(
    `corporate-customers/${id}`, { method: 'GET' },
  );
  if (error) throw error;
  if (!data?.data) throw new Error('Företagskunden hittades inte');
  return data.data;
}

async function apiCreate(input: CreateCorporateCustomerInput): Promise<CorporateCustomer> {
  const { data, error } = await supabase.functions.invoke<{ data: CorporateCustomer }>(
    'corporate-customers', { method: 'POST', body: input },
  );
  if (error) throw error;
  if (!data?.data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdate(id: string, input: UpdateCorporateCustomerInput): Promise<CorporateCustomer> {
  const { data, error } = await supabase.functions.invoke<{ data: CorporateCustomer }>(
    `corporate-customers/${id}`, { method: 'PATCH', body: input },
  );
  if (error) throw error;
  if (!data?.data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiArchive(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke(
    `corporate-customers/${id}`, { method: 'DELETE' },
  );
  if (error) throw error;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCorporateList(
  params: CorporateCustomerListQueryInput = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: corporateKeys.list(params),
    queryFn:  () => apiList(params),
    enabled:  options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useCorporateCustomer(id: string | null) {
  return useQuery({
    queryKey: corporateKeys.detail(id ?? ''),
    queryFn:  () => apiGetById(id!),
    enabled:  id !== null && id !== '',
    staleTime: 60_000,
  });
}

export function useCreateCorporateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCorporateCustomerInput) => apiCreate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: corporateKeys.lists() });
    },
  });
}

export function useUpdateCorporateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCorporateCustomerInput }) =>
      apiUpdate(id, input),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: corporateKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: corporateKeys.detail(id) });
    },
  });
}

export function useArchiveCorporateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiArchive(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: corporateKeys.lists() });
      queryClient.removeQueries({ queryKey: corporateKeys.detail(id) });
    },
  });
}

// ─── Corporate Contract query keys ────────────────────────────────────────────

export const contractKeys = {
  all:   ['corporate-contracts'] as const,
  lists: () => [...contractKeys.all, 'list'] as const,
  list:  (corporateCustomerId: string) => [...contractKeys.lists(), corporateCustomerId] as const,
};

// ─── Contract response shape ──────────────────────────────────────────────────

export interface ContractListResponse {
  data: CorporateContract[];
  meta: { total: number; page: number; per_page: number; has_more: boolean };
}

// ─── Contract API helpers ─────────────────────────────────────────────────────

async function apiListContracts(corporateCustomerId: string): Promise<ContractListResponse> {
  const { data, error } = await supabase.functions.invoke<ContractListResponse>(
    `corporate-contracts?corporate_customer_id=${corporateCustomerId}&per_page=100`,
    { method: 'GET' },
  );
  if (error) throw error;
  return data ?? { data: [], meta: { total: 0, page: 1, per_page: 100, has_more: false } };
}

async function apiCreateContract(input: CreateCorporateContractInput): Promise<CorporateContract> {
  const { data, error } = await supabase.functions.invoke<{ data: CorporateContract }>(
    'corporate-contracts', { method: 'POST', body: input },
  );
  if (error) throw error;
  if (!data?.data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateContract(id: string, input: UpdateCorporateContractInput): Promise<CorporateContract> {
  const { data, error } = await supabase.functions.invoke<{ data: CorporateContract }>(
    `corporate-contracts/${id}`, { method: 'PATCH', body: input },
  );
  if (error) throw error;
  if (!data?.data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiArchiveContract(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke(`corporate-contracts/${id}`, { method: 'DELETE' });
  if (error) throw error;
}

// ─── Contract hooks ───────────────────────────────────────────────────────────

export function useCorporateContracts(corporateCustomerId: string) {
  return useQuery({
    queryKey:  contractKeys.list(corporateCustomerId),
    queryFn:   () => apiListContracts(corporateCustomerId),
    enabled:   corporateCustomerId !== '',
    staleTime: 60_000,
  });
}

export function useCreateCorporateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCorporateContractInput) => apiCreateContract(input),
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: contractKeys.list(input.corporate_customer_id) });
    },
  });
}

export function useUpdateCorporateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCorporateContractInput; corporateCustomerId: string }) =>
      apiUpdateContract(id, input),
    onSuccess: (_data, { corporateCustomerId }) => {
      void qc.invalidateQueries({ queryKey: contractKeys.list(corporateCustomerId) });
    },
  });
}

export function useArchiveCorporateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contractId }: { contractId: string; corporateCustomerId: string }) =>
      apiArchiveContract(contractId),
    onSuccess: (_data, { corporateCustomerId }) => {
      void qc.invalidateQueries({ queryKey: contractKeys.list(corporateCustomerId) });
    },
  });
}
