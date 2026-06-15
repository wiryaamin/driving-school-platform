import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type {
  CorporateCustomer,
  CorporateCustomerStatus,
  CorporateCustomerListQueryInput,
  CreateCorporateCustomerInput,
  UpdateCorporateCustomerInput,
} from '@platform/types';

export type { CorporateCustomer, CorporateCustomerStatus };

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface CorporateListMeta {
  total: number;
  page: number;
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
  lists:   () => [...corporateKeys.all, 'list'] as const,
  list:    (p: CorporateCustomerListQueryInput) => [...corporateKeys.lists(), p] as const,
  details: () => [...corporateKeys.all, 'detail'] as const,
  detail:  (id: string) => [...corporateKeys.details(), id] as const,
};

// ─── Org ID from session ──────────────────────────────────────────────────────

async function getOrgId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Inte inloggad');
  try {
    const b64 = session.access_token.split('.')[1] ?? '';
    const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    const orgId = payload['organization_id'];
    if (typeof orgId !== 'string') throw new Error('organisation_id saknas i session');
    return orgId;
  } catch {
    throw new Error('Kunde inte läsa organisation från session');
  }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCorporateList(
  params: CorporateCustomerListQueryInput = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: corporateKeys.list(params),
    queryFn: async (): Promise<CorporateListResponse> => {
      const {
        page = 1,
        per_page = 25,
        sort_by = 'created_at',
        sort_dir = 'desc',
        search,
        status,
      } = params;

      const from = (page - 1) * per_page;
      const to   = from + per_page - 1;

      // eslint-disable-next-line prefer-const
      let q = (supabase as unknown as any)
        .from('corporate_customers')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order(sort_by, { ascending: sort_dir === 'asc' })
        .range(from, to);

      if (status)                         q = q.eq('status', status);
      if (search && search.trim() !== '') {
        q = q.or(
          `company_name.ilike.%${search}%,contact_email.ilike.%${search}%,org_number.ilike.%${search}%`,
        );
      }

      const { data, count, error } = await q;
      if (error) throw new Error(error.message);

      return {
        data:  (data ?? []) as CorporateCustomer[],
        meta: {
          total:    count ?? 0,
          page,
          per_page,
          has_more: page * per_page < (count ?? 0),
        },
      };
    },
    enabled: options?.enabled ?? true,
    refetchOnMount: 'always',
  });
}

export function useCorporateCustomer(id: string | null) {
  return useQuery({
    queryKey: corporateKeys.detail(id ?? ''),
    queryFn: async (): Promise<CorporateCustomer> => {
      const { data, error } = await (supabase as unknown as any)
        .from('corporate_customers')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data)  throw new Error('Företagskunden hittades inte');
      return data as CorporateCustomer;
    },
    enabled: id !== null && id !== '',
  });
}

export function useCreateCorporateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCorporateCustomerInput): Promise<CorporateCustomer> => {
      const orgId = await getOrgId();
      const { data, error } = await (supabase as unknown as any)
        .from('corporate_customers')
        .insert({ ...input, organization_id: orgId })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as CorporateCustomer;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: corporateKeys.lists() });
    },
  });
}

export function useUpdateCorporateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UpdateCorporateCustomerInput;
    }): Promise<CorporateCustomer> => {
      const { data, error } = await (supabase as unknown as any)
        .from('corporate_customers')
        .update(input)
        .eq('id', id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw new Error(error.message);
      if (!data)  throw new Error('Företagskunden hittades inte');
      return data as CorporateCustomer;
    },
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: corporateKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: corporateKeys.detail(id) });
    },
  });
}

export function useArchiveCorporateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await (supabase as unknown as any)
        .from('corporate_customers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .is('deleted_at', null);

      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: corporateKeys.lists() });
      queryClient.removeQueries({ queryKey: corporateKeys.detail(id) });
    },
  });
}
