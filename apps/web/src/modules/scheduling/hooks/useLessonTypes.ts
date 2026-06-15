import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { LessonType } from '@platform/types';

export type { LessonType };

// ─── Query keys ───────────────────────────────────────────────────────────────

export const lessonTypeKeys = {
  all:  ['lesson-types'] as const,
  list: () => [...lessonTypeKeys.all, 'list'] as const,
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function fetchLessonTypes(): Promise<LessonType[]> {
  const { data, error } = await supabase
    .from('lesson_types')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LessonType[];
}

// ─── Query hook ───────────────────────────────────────────────────────────────

export function useLessonTypes(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: lessonTypeKeys.list(),
    queryFn:  fetchLessonTypes,
    staleTime: 10 * 60_000,
    enabled:  options?.enabled !== false,
  });
}
