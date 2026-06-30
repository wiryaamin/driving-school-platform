import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OfferingStatus    = 'active' | 'archived';
export type PackageType       = 'driving' | 'theory' | 'bundle' | 'other';
export type LessonCategory    = 'driving' | 'theory' | 'risk1' | 'risk2' | 'intro' | string;
export type OfferingVisibility = 'public' | 'website' | 'student_portal' | 'internal';

export interface PackageOffering {
  id:               string;
  organization_id:  string;
  catalog_id:       string | null;
  name:             string;
  description:      string | null;
  package_type:     PackageType;
  lesson_category:  LessonCategory;
  quantity:         number;
  bundle_credits:   unknown[];
  price:            number;
  currency:         string;
  vat_rate:         number;
  validity_days:    number | null;
  sort_order:       number;
  status:           OfferingStatus;
  metadata:         Record<string, unknown>;
  package_code:     string | null;
  visibility:       OfferingVisibility;
  featured:         boolean;
  internal_notes:   string | null;
  archived_at:      string | null;
  archived_by:      string | null;
  created_at:       string;
  created_by:       string | null;
  updated_by:       string | null;
}

export interface PackageCatalogEntry {
  id:               string;
  organization_id:  string | null;
  name:             string;
  description:      string | null;
  package_type:     PackageType;
  lesson_category:  LessonCategory;
  default_quantity: number;
  default_price:    number;
  currency:         string;
  vat_rate:         number;
  validity_days:    number | null;
  sort_order:       number;
  is_active:        boolean;
  created_at:       string;
  created_by:       string | null;
}

export interface StudentPackage {
  id:               string;
  organization_id:  string;
  student_id:       string;
  offering_id:      string;
  status:           'active' | 'exhausted' | 'expired' | 'cancelled';
  purchased_at:     string;
  expires_at:       string | null;
  quantity_total:   number;
  quantity_used:    number;
  quantity_remaining: number;
  total_paid:       number;
  currency:         string;
  invoice_id:       string | null;
  notes:            string | null;
  created_at:       string;
}

export interface CreateOfferingInput {
  name:              string;
  lesson_category:   LessonCategory;
  quantity:          number;
  price:             number;
  package_type?:     PackageType | undefined;
  description?:      string | undefined;
  vat_rate?:         number | undefined;
  validity_days?:    number | undefined;
  sort_order?:       number | undefined;
  currency?:         string | undefined;
  catalog_id?:       string | undefined;
  package_code?:     string | undefined;
  visibility?:       OfferingVisibility | undefined;
  featured?:         boolean | undefined;
  internal_notes?:   string | undefined;
}

export interface UpdateOfferingInput {
  name?:           string | undefined;
  description?:    string | null | undefined;
  price?:          number | undefined;
  vat_rate?:       number | undefined;
  validity_days?:  number | null | undefined;
  sort_order?:     number | undefined;
  package_code?:   string | null | undefined;
  visibility?:     OfferingVisibility | undefined;
  featured?:       boolean | undefined;
  internal_notes?: string | null | undefined;
}

export interface CreateCatalogEntryInput {
  name:              string;
  lesson_category:   LessonCategory;
  default_quantity:  number;
  default_price:     number;
  package_type?:     PackageType | undefined;
  description?:      string | undefined;
  vat_rate?:         number | undefined;
  validity_days?:    number | undefined;
  currency?:         string | undefined;
}

export interface ListOfferingsParams {
  status?:          string | undefined;
  lesson_category?: string | undefined;
  visibility?:      string | undefined;
  featured?:        boolean | undefined;
  page?:            number | undefined;
  per_page?:        number | undefined;
}

export interface OfferingListResponse {
  data: PackageOffering[];
  meta: { page: number; per_page: number; total: number };
}

export interface StudentPackageListResponse {
  data: StudentPackage[];
  meta: { page: number; per_page: number; total: number };
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const packageKeys = {
  all:          ['packages'] as const,
  offerings:    (p: ListOfferingsParams) => [...packageKeys.all, 'offerings', p] as const,
  offering:     (id: string)             => [...packageKeys.all, 'offering', id]  as const,
  catalog:      (cat?: string)           => [...packageKeys.all, 'catalog', cat ?? 'all'] as const,
  studentPkgs:  (studentId?: string)     => [...packageKeys.all, 'student-packages', studentId ?? 'all'] as const,
};

function invalidatePackages(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: packageKeys.all });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePackageOfferings(params: ListOfferingsParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: packageKeys.offerings(params),
    queryFn:  async (): Promise<OfferingListResponse> => {
      const qs = new URLSearchParams();
      if (params.status)                    qs.set('status',          params.status);
      if (params.lesson_category)           qs.set('lesson_category', params.lesson_category);
      if (params.visibility)                qs.set('visibility',      params.visibility);
      if (params.featured !== undefined)    qs.set('featured',        String(params.featured));
      if (params.page)                      qs.set('page',            String(params.page));
      if (params.per_page)                  qs.set('per_page',        String(params.per_page));
      const path = qs.toString() ? `packages?${qs.toString()}` : 'packages';
      const { data, error } = await supabase.functions.invoke<OfferingListResponse>(
        path, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], meta: { page: 1, per_page: 25, total: 0 } };
    },
    staleTime: 20_000,
    enabled:   options.enabled ?? true,
  });
}

export function usePackageOffering(id: string | null) {
  return useQuery({
    queryKey: packageKeys.offering(id ?? ''),
    queryFn:  async (): Promise<PackageOffering> => {
      const { data, error } = await supabase.functions.invoke<PackageOffering>(
        `packages/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Package offering not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 30_000,
  });
}

export function usePackageCatalog(lessonCategory?: string) {
  return useQuery({
    queryKey: packageKeys.catalog(lessonCategory),
    queryFn:  async (): Promise<PackageCatalogEntry[]> => {
      const qs = lessonCategory ? `?lesson_category=${lessonCategory}` : '';
      const { data, error } = await supabase.functions.invoke<{ data: PackageCatalogEntry[] }>(
        `packages/catalog${qs}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useStudentPackages(studentId?: string) {
  return useQuery({
    queryKey: packageKeys.studentPkgs(studentId),
    queryFn:  async (): Promise<StudentPackageListResponse> => {
      const qs = studentId ? `?student_id=${studentId}` : '';
      const { data, error } = await supabase.functions.invoke<StudentPackageListResponse>(
        `student-packages${qs}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], meta: { page: 1, per_page: 25, total: 0 } };
    },
    staleTime: 20_000,
  });
}

export function useCreateOffering() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOfferingInput): Promise<PackageOffering> => {
      const { data, error } = await supabase.functions.invoke<PackageOffering>(
        'packages', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? ({} as PackageOffering);
    },
    onSuccess: () => invalidatePackages(qc),
  });
}

export function useUpdateOffering(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOfferingInput): Promise<PackageOffering> => {
      const { data, error } = await supabase.functions.invoke<PackageOffering>(
        `packages/${id}`, { method: 'PATCH', body: input },
      );
      if (error) throw error;
      return data ?? ({} as PackageOffering);
    },
    onSuccess: () => invalidatePackages(qc),
  });
}

export function useArchiveOffering(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `packages/${id}/archive`, { method: 'POST' },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidatePackages(qc),
  });
}

export function useCreateCatalogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCatalogEntryInput): Promise<PackageCatalogEntry> => {
      const { data, error } = await supabase.functions.invoke<PackageCatalogEntry>(
        'packages/catalog', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? ({} as PackageCatalogEntry);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: packageKeys.catalog() }),
  });
}

export function useActivateOffering(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `packages/${id}/activate`, { method: 'POST' },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidatePackages(qc),
  });
}

export function usePurchasePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      studentId,
      offeringId,
    }: {
      studentId:  string;
      offeringId: string;
    }): Promise<StudentPackage> => {
      const { data, error } = await supabase.functions.invoke<StudentPackage>(
        'student-packages',
        { method: 'POST', body: { student_id: studentId, offering_id: offeringId } },
      );
      if (error) throw error;
      return data ?? ({} as StudentPackage);
    },
    onSuccess: () => invalidatePackages(qc),
  });
}
