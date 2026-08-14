import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@shared/hooks/useSession.js';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentCategory =
  | 'identity_document'
  | 'medical_clearance'
  | 'theory_result'
  | 'risk_education'
  | 'practical_result'
  | 'licence_copy'
  | 'enrollment_contract'
  | 'other';

export type DocumentStatus = 'pending_review' | 'approved' | 'rejected' | 'expired';

export interface StudentDocument {
  id:               string;
  organization_id:  string;
  student_id:       string;
  category:         DocumentCategory;
  status:           DocumentStatus;
  file_name:        string;
  storage_path:     string;
  storage_bucket:   string;
  mime_type:        string | null;
  file_size_bytes:  number | null;
  description:      string | null;
  expires_at:       string | null;
  uploaded_by:      string | null;
  reviewed_by:      string | null;
  reviewed_at:      string | null;
  rejection_reason: string | null;
  created_at:       string;
  updated_at:       string;
  students?:        { id: string; first_name: string; last_name: string; email: string | null } | null;
}

export interface UploadDocumentInput {
  student_id:  string;
  category:    DocumentCategory;
  file:        File;
  description?: string;
  expires_at?:  string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const documentKeys = {
  all:    ['student-documents'] as const,
  lists:  () => [...documentKeys.all, 'list'] as const,
  list:   (studentId?: string) => [...documentKeys.lists(), studentId ?? 'all'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useDocumentList(studentId?: string) {
  const { organization } = useSession();
  const orgId = organization?.id;

  return useQuery<StudentDocument[]>({
    queryKey: documentKeys.list(studentId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as unknown as any)
        .from('student_documents')
        .select('id, organization_id, student_id, category, status, file_name, storage_path, storage_bucket, mime_type, file_size_bytes, description, expires_at, uploaded_by, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at, students(id, first_name, last_name, email)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (studentId) {
        q = q.eq('student_id', studentId);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as StudentDocument[];
    },
    enabled: !!orgId,
    staleTime: 2 * 60_000,
  });
}

export function useDocumentUpload() {
  const { organization, user } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadDocumentInput): Promise<StudentDocument> => {
      if (!orgId) throw new Error('Ingen organisation');
      if (!user?.id) throw new Error('Ingen användare');

      const ext = input.file.name.split('.').pop() ?? '';
      const uniqueName = `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
      const storagePath = `${orgId}/${input.student_id}/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from('student-documents')
        .upload(storagePath, input.file, { contentType: input.file.type });

      if (uploadError) throw new Error(uploadError.message);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbError } = await (supabase as unknown as any)
        .from('student_documents')
        .insert({
          organization_id: orgId,
          student_id:      input.student_id,
          category:        input.category,
          file_name:       input.file.name,
          storage_path:    storagePath,
          storage_bucket:  'student-documents',
          mime_type:       input.file.type || null,
          file_size_bytes: input.file.size,
          description:     input.description ?? null,
          expires_at:      input.expires_at ?? null,
          uploaded_by:     user.id,
        })
        .select()
        .single();

      if (dbError) {
        await supabase.storage.from('student-documents').remove([storagePath]);
        throw new Error(dbError.message);
      }

      return data as StudentDocument;
    },
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: documentKeys.list(doc.student_id) });
      void qc.invalidateQueries({ queryKey: documentKeys.list() });
    },
  });
}

export function useDocumentDelete() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id, studentId, storagePath, storageBucket,
    }: {
      id: string; studentId: string; storagePath: string; storageBucket: string;
    }): Promise<void> => {
      // Remove the physical Storage object before soft-deleting the metadata
      // row — matches the Student → Övrigt → Dokument delete behavior. If
      // Storage removal fails, the mutation throws here and the DB row is
      // left untouched (never soft-deleted while its file may still exist),
      // so a failure is never misreported as a completed deletion.
      const { error: storageError } = await supabase.storage.from(storageBucket).remove([storagePath]);
      if (storageError) throw new Error(storageError.message);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return void studentId;
    },
    onSuccess: (_v, { studentId }) => {
      void qc.invalidateQueries({ queryKey: documentKeys.list(studentId) });
      void qc.invalidateQueries({ queryKey: documentKeys.list() });
    },
  });
}

export function useApproveDocument() {
  const { user } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }): Promise<void> => {
      if (!user?.id) throw new Error('Ingen användare');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_documents')
        .update({
          status:           'approved',
          reviewed_by:      user.id,
          reviewed_at:      new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_v, { studentId }) => {
      void qc.invalidateQueries({ queryKey: documentKeys.list(studentId) });
      void qc.invalidateQueries({ queryKey: documentKeys.list() });
    },
  });
}

export function useRejectDocument() {
  const { user } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; studentId: string; reason?: string }): Promise<void> => {
      if (!user?.id) throw new Error('Ingen användare');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_documents')
        .update({
          status:           'rejected',
          reviewed_by:      user.id,
          reviewed_at:      new Date().toISOString(),
          rejection_reason: reason?.trim() || null,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_v, { studentId }) => {
      void qc.invalidateQueries({ queryKey: documentKeys.list(studentId) });
      void qc.invalidateQueries({ queryKey: documentKeys.list() });
    },
  });
}

export function useDocumentRename() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fileName }: { id: string; studentId: string; fileName: string }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_documents')
        .update({ file_name: fileName.trim() })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_v, { studentId }) => {
      void qc.invalidateQueries({ queryKey: documentKeys.list(studentId) });
      void qc.invalidateQueries({ queryKey: documentKeys.list() });
    },
  });
}

export function useDocumentDownloadUrl() {
  return async (storagePath: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('student-documents')
      .createSignedUrl(storagePath, 60);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  identity_document:   'ID-handling',
  medical_clearance:   'Läkarintyg',
  theory_result:       'Kunskapsprov',
  risk_education:      'Riskutbildning',
  practical_result:    'Körprov',
  licence_copy:        'Körkortkopia',
  enrollment_contract: 'Avtal',
  other:               'Övrigt',
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  pending_review: 'Väntar granskning',
  approved:       'Godkänd',
  rejected:       'Avvisad',
  expired:        'Utgången',
};
