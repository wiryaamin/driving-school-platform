import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MigrationStatus =
  | 'draft'
  | 'uploading'
  | 'validating'
  | 'validated'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RowStatus =
  | 'pending'
  | 'valid'
  | 'warning'
  | 'error'
  | 'imported'
  | 'skipped'
  | 'failed';

export type MigrationEntity =
  | 'students'
  | 'instructors'
  | 'vehicles'
  | 'packages'
  | 'bookings'
  | 'invoices'
  | 'payments';

export interface MigrationSession {
  id:              string;
  organization_id: string;
  entity_type:     MigrationEntity;
  status:          MigrationStatus;
  file_name:       string | null;
  file_size_bytes: number | null;
  total_rows:      number;
  valid_rows:      number;
  warning_rows:    number;
  error_rows:      number;
  imported_rows:   number;
  skipped_rows:    number;
  import_mode:     'skip_errors' | 'abort_on_error';
  dry_run:         boolean;
  error_summary:   string | null;
  created_by:      string;
  created_at:      string;
  updated_at:      string;
  completed_at:    string | null;
}

export interface ValidationIssue {
  field:    string;
  message:  string;
  severity: 'error' | 'warning';
}

export interface MigrationRow {
  id:                string;
  session_id:        string;
  row_number:        number;
  raw_data:          Record<string, string>;
  normalized_data:   Record<string, unknown> | null;
  validation_status: RowStatus;
  errors:            ValidationIssue[];
  warnings:          ValidationIssue[];
  production_id:     string | null;
  created_at:        string;
}

export interface SessionListResponse {
  data: MigrationSession[];
  meta: { total: number; page: number; per_page: number };
}

export interface RowListResponse {
  data: MigrationRow[];
  meta: { total: number; page: number; per_page: number };
}

export interface ImportResult {
  data: {
    imported: number;
    skipped:  number;
    failed:   number;
    dry_run:  boolean;
  };
}

// ─── Query key factory ────────────────────────────────────────────────────────

export const migrationKeys = {
  all:      ['data-migration'] as const,
  sessions: () => [...migrationKeys.all, 'sessions'] as const,
  session:  (id: string) => [...migrationKeys.all, 'session', id] as const,
  rows:     (id: string, params: object) => [...migrationKeys.all, 'rows', id, params] as const,
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function invoke<T>(
  path: string,
  opts?: Parameters<typeof supabase.functions.invoke>[1],
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(path, opts);
  if (error) throw error;
  if (!data) throw new Error('Empty response');
  return data;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useMigrationSessions() {
  return useQuery({
    queryKey: migrationKeys.sessions(),
    queryFn:  () => invoke<SessionListResponse>('data-migration', { method: 'GET' }),
    staleTime: 30_000,
  });
}

export function useMigrationSession(id: string) {
  return useQuery({
    queryKey: migrationKeys.session(id),
    queryFn:  () => invoke<{ data: MigrationSession }>(`data-migration/${id}`, { method: 'GET' }).then((r) => r.data),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'validating' || status === 'importing' || status === 'uploading') {
        return 2_000;
      }
      return false;
    },
  });
}

export interface RowListParams {
  status?:   RowStatus | 'all';
  page:      number;
  per_page:  number;
}

export function useMigrationRows(sessionId: string, params: RowListParams) {
  const qs = new URLSearchParams();
  if (params.status && params.status !== 'all') qs.set('status',   params.status);
  qs.set('page',     String(params.page));
  qs.set('per_page', String(params.per_page));
  const query = qs.toString();

  return useQuery({
    queryKey: migrationKeys.rows(sessionId, params),
    queryFn:  () =>
      invoke<RowListResponse>(`data-migration/${sessionId}/rows${query ? `?${query}` : ''}`, { method: 'GET' }),
    staleTime: 30_000,
    enabled:  Boolean(sessionId),
  });
}

export function useCreateMigrationSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { entity_type: MigrationEntity; file_name?: string; file_size_bytes?: number }) =>
      invoke<{ data: MigrationSession }>('data-migration', {
        method: 'POST',
        body:   JSON.stringify(params),
      }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: migrationKeys.sessions() }),
  });
}

export interface UploadRowsParams {
  id:               string;
  rows:             Array<Record<string, string>>;
  file_name?:       string;
  file_size_bytes?: number;
}

export function useUploadMigrationRows() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rows, file_name, file_size_bytes }: UploadRowsParams) =>
      invoke<{ data: MigrationSession }>(`data-migration/${id}/upload`, {
        method: 'POST',
        body:   JSON.stringify({ rows, file_name, file_size_bytes }),
      }).then((r) => r.data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: migrationKeys.session(vars.id) });
      void qc.invalidateQueries({ queryKey: migrationKeys.sessions() });
    },
  });
}

export function useImportMigration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      invoke<ImportResult>(`data-migration/${id}/import`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: migrationKeys.session(id) });
      void qc.invalidateQueries({ queryKey: migrationKeys.sessions() });
      void qc.invalidateQueries({ queryKey: migrationKeys.all });
    },
  });
}

export function useCancelMigration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      invoke<unknown>(`data-migration/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: migrationKeys.session(id) });
      void qc.invalidateQueries({ queryKey: migrationKeys.sessions() });
    },
  });
}
