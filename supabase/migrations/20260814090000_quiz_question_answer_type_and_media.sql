-- Theory question editor: answer_type (single/multiple correct answers) +
-- optional image/video media, plus the storage bucket to hold that media.
--
-- options stays the same JSONB shape ({text, is_correct}[]) — the editor adds
-- a stable client-generated `id` to each option object going forward (and
-- backfills it for existing rows on read, no data migration needed here).
-- Correctness continues to live on the option object itself (is_correct),
-- now addressed by that id instead of by array position/text — multiple
-- options may be true when answer_type = 'multiple'.

ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS answer_type text NOT NULL DEFAULT 'single'
    CHECK (answer_type IN ('single', 'multiple')),
  ADD COLUMN IF NOT EXISTS media_url  text,
  ADD COLUMN IF NOT EXISTS media_type text
    CHECK (media_type IN ('image', 'video'));

-- ─── Storage bucket for question media ─────────────────────────────────────
--
-- Public bucket, same shape as org-branding (20260724000007): quiz media is
-- non-sensitive visual/video content and the token-based student-portal
-- consumer benefits from a plain public URL over signed-URL plumbing.
-- Write RLS mirrors quiz_questions_tenant_write's existing posture exactly
-- (org match only, no permission-code check) rather than inventing a
-- stricter requirement than the table it belongs to already enforces.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quiz-question-media', 'quiz-question-media', true, 52428800,
  ARRAY[
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "quiz_question_media_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'quiz-question-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

CREATE POLICY "quiz_question_media_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'quiz-question-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  )
  WITH CHECK (
    bucket_id = 'quiz-question-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

CREATE POLICY "quiz_question_media_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'quiz-question-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

CREATE POLICY "quiz_question_media_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'quiz-question-media');
