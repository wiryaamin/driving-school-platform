import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Manual Government Workflow Tracker ────────────────────────────────────────
// Direct PostgREST + RLS, the same pattern already used for Vehicle CRUD
// (modules/resources/hooks/useVehicles.ts) — no Edge Function needed, since
// this is plain tenant-scoped CRUD with no external secret or provider
// involved (unlike the Vehicle/Person Lookup frameworks).

export type RegulatoryWorkflowType =
  | 'risk_education_report' | 'instructor_legitimation_report'
  | 'driving_school_permit' | 'driving_test_booking' | 'other';

export type RegulatoryWorkflowStatus =
  | 'not_started' | 'in_progress' | 'submitted' | 'confirmed' | 'rejected' | 'expired';

export interface RegulatoryWorkflow {
  id:                    string;
  workflow_type:         RegulatoryWorkflowType;
  status:                RegulatoryWorkflowStatus;
  title:                 string;
  description:           string | null;
  related_entity_type:   string | null;
  related_entity_id:     string | null;
  external_reference:    string | null;
  due_date:              string | null;
  submitted_at:          string | null;
  confirmed_at:          string | null;
  responsible_user_id:   string | null;
  notes:                 string | null;
  created_at:            string;
  updated_at:            string;
}

export interface CreateRegulatoryWorkflowInput {
  workflow_type:       RegulatoryWorkflowType;
  title:               string;
  description?:        string;
  related_entity_type?: string;
  related_entity_id?:  string;
  due_date?:           string;
  responsible_user_id?: string;
  notes?:              string;
}

export interface UpdateRegulatoryWorkflowInput {
  id:                  string;
  status?:             RegulatoryWorkflowStatus;
  external_reference?: string | null;
  due_date?:           string | null;
  submitted_at?:       string | null;
  confirmed_at?:       string | null;
  responsible_user_id?: string | null;
  notes?:              string | null;
}

// The government portal a given workflow type is actually completed on —
// static, Sweden-wide, not tenant configuration (see the migration's own
// header note on why this isn't a DB column).
export const WORKFLOW_TYPE_LABEL: Record<RegulatoryWorkflowType, string> = {
  risk_education_report:          'Riskutbildning — rapportering',
  instructor_legitimation_report: 'Trafiklärare/skolledare — rapportering',
  driving_school_permit:          'Trafikskoletillstånd',
  driving_test_booking:           'Förarprov — bokning',
  other:                          'Övrigt',
};

export const WORKFLOW_TYPE_AGENCY: Record<RegulatoryWorkflowType, 'Transportstyrelsen' | 'Trafikverket' | null> = {
  risk_education_report:          'Transportstyrelsen',
  instructor_legitimation_report: 'Transportstyrelsen',
  driving_school_permit:          'Transportstyrelsen',
  driving_test_booking:           'Trafikverket',
  other:                          null,
};

export const WORKFLOW_TYPE_PORTAL_URL: Record<RegulatoryWorkflowType, string | null> = {
  risk_education_report:
    'https://www.transportstyrelsen.se/sv/vagtrafik/korkort/foretag/forarutbildning-och-kunskapsprov/rapportera-utbildning-och-prov/rapportera-riskutbildning/',
  instructor_legitimation_report:
    'https://www.transportstyrelsen.se/sv/vagtrafik/e-tjanster-och-blanketter/e-tjanster-inom-vagtrafik/',
  driving_school_permit:
    'https://www.transportstyrelsen.se/sv/vagtrafik/korkort/foretag/forarutbildning-och-kunskapsprov/tillstand/driva-trafikskola/',
  driving_test_booking:
    'https://www.trafikverket.se/korkort/boka-prov/',
  other: null,
};

export const STATUS_LABEL: Record<RegulatoryWorkflowStatus, string> = {
  not_started: 'Ej påbörjad',
  in_progress: 'Pågår',
  submitted:   'Inskickad',
  confirmed:   'Bekräftad',
  rejected:    'Avvisad',
  expired:     'Utgången',
};

// ─── Query key ────────────────────────────────────────────────────────────────

export const regulatoryWorkflowKeys = {
  all:  ['regulatory-workflows'] as const,
  list: () => [...regulatoryWorkflowKeys.all, 'list'] as const,
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchRegulatoryWorkflows(): Promise<RegulatoryWorkflow[]> {
  const { data, error } = await supabase
    .from('regulatory_workflows')
    .select(`
      id, workflow_type, status, title, description,
      related_entity_type, related_entity_id, external_reference,
      due_date, submitted_at, confirmed_at, responsible_user_id, notes,
      created_at, updated_at
    `)
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RegulatoryWorkflow[];
}

async function createRegulatoryWorkflow(input: CreateRegulatoryWorkflowInput & { organization_id: string }): Promise<void> {
  const { error } = await supabase.from('regulatory_workflows').insert(input as never);
  if (error) throw new Error(error.message);
}

async function updateRegulatoryWorkflow(input: UpdateRegulatoryWorkflowInput): Promise<void> {
  const { id, ...fields } = input;
  const { error } = await supabase.from('regulatory_workflows').update(fields as never).eq('id', id);
  if (error) throw new Error(error.message);
}

async function deleteRegulatoryWorkflow(id: string): Promise<void> {
  const { error } = await supabase
    .from('regulatory_workflows')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useRegulatoryWorkflows() {
  return useQuery({
    queryKey: regulatoryWorkflowKeys.list(),
    queryFn:  fetchRegulatoryWorkflows,
    staleTime: 60_000,
  });
}

export function useCreateRegulatoryWorkflow() {
  const qc = useQueryClient();
  const { organization, user } = useSession();
  const orgId = organization?.id;
  return useMutation({
    mutationFn: (input: CreateRegulatoryWorkflowInput) => {
      if (!orgId) throw new Error('Ingen organisation');
      // The creating staff member is recorded as responsible by default —
      // reassignable afterward via the edit dialog's responsible_user_id.
      return createRegulatoryWorkflow({
        ...(user?.id ? { responsible_user_id: user.id } : {}),
        ...input,
        organization_id: orgId,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: regulatoryWorkflowKeys.list() }),
  });
}

export function useUpdateRegulatoryWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateRegulatoryWorkflow,
    onSuccess:  () => qc.invalidateQueries({ queryKey: regulatoryWorkflowKeys.list() }),
  });
}

export function useDeleteRegulatoryWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRegulatoryWorkflow,
    onSuccess:  () => qc.invalidateQueries({ queryKey: regulatoryWorkflowKeys.list() }),
  });
}

// ─── Document attachments ──────────────────────────────────────────────────────

export interface RegulatoryWorkflowDocument {
  id:              string;
  workflow_id:     string;
  file_name:       string;
  storage_path:    string;
  mime_type:       string | null;
  file_size_bytes: number | null;
  created_at:      string;
}

async function fetchWorkflowDocuments(workflowId: string): Promise<RegulatoryWorkflowDocument[]> {
  const { data, error } = await supabase
    .from('regulatory_workflow_documents')
    .select('id, workflow_id, file_name, storage_path, mime_type, file_size_bytes, created_at')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RegulatoryWorkflowDocument[];
}

export function useWorkflowDocuments(workflowId: string | null) {
  return useQuery({
    queryKey: ['regulatory-workflows', 'documents', workflowId],
    queryFn:  () => fetchWorkflowDocuments(workflowId as string),
    enabled:  !!workflowId,
  });
}

export function useUploadWorkflowDocument() {
  const qc = useQueryClient();
  const { organization } = useSession();
  const orgId = organization?.id;
  return useMutation({
    mutationFn: async ({ workflowId, file }: { workflowId: string; file: File }) => {
      if (!orgId) throw new Error('Ingen organisation');
      const path = `${orgId}/${workflowId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('regulatory-workflow-documents')
        .upload(path, file);
      if (uploadErr) throw new Error(uploadErr.message);

      const { error: insertErr } = await supabase.from('regulatory_workflow_documents').insert({
        organization_id: orgId,
        workflow_id:     workflowId,
        file_name:       file.name,
        storage_path:    path,
        mime_type:       file.type || null,
        file_size_bytes: file.size,
      } as never);
      if (insertErr) throw new Error(insertErr.message);
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['regulatory-workflows', 'documents', vars.workflowId] }),
  });
}

// ─── Audit history ──────────────────────────────────────────────────────────
// audit_trigger_fn() (enterprise_foundation migration) already fires on every
// INSERT/UPDATE/DELETE against regulatory_workflows — no new logging
// mechanism needed, just a read of the existing audit_logs table. Gated by
// administration:audit:read (same permission the table's own RLS checks),
// so callers should skip this query entirely for roles that lack it rather
// than let it fail — see useWorkflowAuditHistory's `enabled` guard.

export interface WorkflowAuditEntry {
  id:             string;
  operation:      'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';
  changed_fields: string[] | null;
  actor_email:    string | null;
  occurred_at:    string;
}

async function fetchWorkflowAuditHistory(workflowId: string): Promise<WorkflowAuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, operation, changed_fields, actor_email, occurred_at')
    .eq('entity_type', 'regulatory_workflows')
    .eq('entity_id', workflowId)
    .order('occurred_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as WorkflowAuditEntry[];
}

export function useWorkflowAuditHistory(workflowId: string | null, canRead: boolean) {
  return useQuery({
    queryKey: ['regulatory-workflows', 'audit', workflowId],
    queryFn:  () => fetchWorkflowAuditHistory(workflowId as string),
    enabled:  !!workflowId && canRead,
  });
}
