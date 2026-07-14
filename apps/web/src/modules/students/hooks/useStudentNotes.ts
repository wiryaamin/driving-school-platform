import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@shared/hooks/useSession.js';
import { supabase } from '@core/api/supabase.js';

// ─── Types — aligned with Phase 2A Baseline schema ───────────────────────────
//
// Baseline columns: id, organization_id, student_id, author_id (NOT NULL),
//   body (NOT NULL), is_internal, is_pinned, deleted_at, deleted_by,
//   created_at, updated_at.
// category is added by the Epic 2.5 additive migration.

export type NoteCategory =
  | 'general'
  | 'instructional'
  | 'medical'
  | 'administrative'
  | 'behavioral'
  | 'other';

export interface StudentNote {
  id:              string;
  organization_id: string;
  student_id:      string;
  author_id:       string;
  body:            string;
  category:        NoteCategory;
  is_pinned:       boolean;
  is_internal:     boolean;
  created_at:      string;
  updated_at:      string;
}

export interface CreateNoteInput {
  student_id:   string;
  body:         string;
  category:     NoteCategory;
  is_pinned?:   boolean;
  is_internal?: boolean;
}

export interface UpdateNoteInput {
  id:           string;
  student_id:   string;
  body?:        string;
  category?:    NoteCategory;
  is_pinned?:   boolean;
  is_internal?: boolean;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const noteKeys = {
  all:   ['student-notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
  list:  (studentId: string) => [...noteKeys.lists(), studentId] as const,
};

// ─── Display helpers ──────────────────────────────────────────────────────────

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  general:        'Allmänt',
  instructional:  'Utbildning',
  medical:        'Medicinskt',
  administrative: 'Administration',
  behavioral:     'Beteende',
  other:          'Övrigt',
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useStudentNotes(studentId: string) {
  const { organization } = useSession();
  const orgId = organization?.id;

  return useQuery<StudentNote[]>({
    queryKey: noteKeys.list(studentId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('student_notes')
        .select('id, organization_id, student_id, author_id, body, category, is_pinned, is_internal, created_at, updated_at')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as StudentNote[];
    },
    enabled: !!orgId && !!studentId,
    staleTime: 60_000,
  });
}

export function useCreateNote() {
  const { organization, user } = useSession();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateNoteInput): Promise<StudentNote> => {
      const orgId = organization?.id;
      if (!orgId) throw new Error('Ingen organisation');
      if (!user?.id) throw new Error('Ingen användare');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('student_notes')
        .insert({
          organization_id: orgId,
          student_id:      input.student_id,
          author_id:       user.id,
          body:            input.body.trim(),
          category:        input.category,
          is_pinned:       input.is_pinned  ?? false,
          is_internal:     input.is_internal ?? false,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as StudentNote;
    },
    onSuccess: (_note, { student_id }) => {
      void qc.invalidateQueries({ queryKey: noteKeys.list(student_id) });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateNoteInput): Promise<void> => {
      const patch: Record<string, unknown> = {};
      if (input.body        !== undefined) patch.body        = input.body.trim();
      if (input.category    !== undefined) patch.category    = input.category;
      if (input.is_pinned   !== undefined) patch.is_pinned   = input.is_pinned;
      if (input.is_internal !== undefined) patch.is_internal = input.is_internal;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_notes')
        .update(patch)
        .eq('id', input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_v, { student_id }) => {
      void qc.invalidateQueries({ queryKey: noteKeys.list(student_id) });
    },
  });
}

export function useDeleteNote() {
  const { user } = useSession();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; student_id: string }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_notes')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_v, { student_id }) => {
      void qc.invalidateQueries({ queryKey: noteKeys.list(student_id) });
    },
  });
}
