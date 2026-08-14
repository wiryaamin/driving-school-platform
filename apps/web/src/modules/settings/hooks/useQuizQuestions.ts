import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuizCategory = 'trafikregler' | 'vagmarken' | 'miljo' | 'fordon' | 'riskhantering';
export type QuizDifficulty = 'easy' | 'normal' | 'hard';
export type QuizAnswerType = 'single' | 'multiple';
export type QuizMediaType = 'image' | 'video';

export interface QuizOption {
  /** Stable per-option id. Existing rows predate this field — callers must
   *  backfill it on read (see normalizeOptions in TeorifragorPage.tsx)
   *  rather than relying on array position or text as identity. */
  id?: string;
  text: string;
  is_correct: boolean;
}

export interface QuizQuestion {
  id:              string;
  organization_id: string | null;
  category:        QuizCategory;
  question_text:   string;
  options:         QuizOption[];
  explanation:     string | null;
  difficulty:      QuizDifficulty;
  answer_type:     QuizAnswerType;
  media_url:       string | null;
  media_type:      QuizMediaType | null;
  is_active:       boolean;
  sort_order:       number;
  created_at:      string;
  updated_at:      string;
}

export interface UpsertQuizQuestionInput {
  category:      QuizCategory;
  question_text: string;
  options:       QuizOption[];
  explanation?:  string | null;
  difficulty:    QuizDifficulty;
  answer_type:   QuizAnswerType;
  media_url?:    string | null;
  media_type?:   QuizMediaType | null;
}

// quiz_questions is not present in @platform/types' hand-maintained Database
// stub — same escape hatch as useDemoRequests.ts/useAnnouncements.ts; RLS
// (quiz_questions_tenant_read/quiz_questions_tenant_write) enforces org
// isolation, not this cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function quizQuestionsTable() { return (supabase as any).from('quiz_questions'); }

const QUIZ_QUESTIONS_KEY = ['settings', 'quiz-questions'] as const;

// ─── Queries ──────────────────────────────────────────────────────────────────
// Org-authored questions only (organization_id IS NULL rows are the 25
// system-wide defaults, managed by the platform, not editable per-school).

export function useOrgQuizQuestions() {
  const { organization } = useSession();
  return useQuery({
    queryKey: QUIZ_QUESTIONS_KEY,
    queryFn: async (): Promise<QuizQuestion[]> => {
      const { data, error } = await quizQuestionsTable()
        .select('*')
        .not('organization_id', 'is', null)
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true });

      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as QuizQuestion[];
    },
    enabled: !!organization?.id,
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateQuizQuestion() {
  const { organization } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertQuizQuestionInput): Promise<QuizQuestion> => {
      if (!organization?.id) throw new Error('Ingen organisation');
      const { data, error } = await quizQuestionsTable()
        .insert({
          organization_id: organization.id,
          category:        input.category,
          question_text:   input.question_text.trim(),
          options:         input.options,
          explanation:     input.explanation?.trim() || null,
          difficulty:      input.difficulty,
          answer_type:     input.answer_type,
          media_url:       input.media_url ?? null,
          media_type:      input.media_type ?? null,
        })
        .select('*')
        .single();
      if (error) throw new Error((error as { message: string }).message);
      return data as QuizQuestion;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUIZ_QUESTIONS_KEY }),
  });
}

export function useUpdateQuizQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpsertQuizQuestionInput & { id: string }): Promise<QuizQuestion> => {
      const { data, error } = await quizQuestionsTable()
        .update({
          category:      input.category,
          question_text: input.question_text.trim(),
          options:       input.options,
          explanation:   input.explanation?.trim() || null,
          difficulty:    input.difficulty,
          answer_type:   input.answer_type,
          media_url:     input.media_url ?? null,
          media_type:    input.media_type ?? null,
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new Error((error as { message: string }).message);
      return data as QuizQuestion;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUIZ_QUESTIONS_KEY }),
  });
}

// Uploads to the public quiz-question-media bucket (20260814090000), same
// upload shape as useOrgBrandingAssets/useUploadOrgBrandingAsset — direct
// storage.upload + getPublicUrl, no signed-URL handling needed since the
// bucket is public and RLS already scopes writes to the caller's org folder.
export function useUploadQuizQuestionMedia() {
  const { organization } = useSession();
  const orgId = organization?.id;

  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string; type: QuizMediaType }> => {
      if (!orgId) throw new Error('Ingen organisation');

      const mediaType: QuizMediaType = file.type.startsWith('video/') ? 'video' : 'image';
      const ext = file.name.includes('.') ? file.name.split('.').pop() : (mediaType === 'video' ? 'mp4' : 'png');
      const path = `${orgId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('quiz-question-media')
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      const { data: pub } = supabase.storage.from('quiz-question-media').getPublicUrl(path);
      return { url: pub.publicUrl, type: mediaType };
    },
  });
}

export function useToggleQuizQuestionActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }): Promise<void> => {
      const { error } = await quizQuestionsTable().update({ is_active }).eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUIZ_QUESTIONS_KEY }),
  });
}

export function useDeleteQuizQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await quizQuestionsTable().delete().eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUIZ_QUESTIONS_KEY }),
  });
}
