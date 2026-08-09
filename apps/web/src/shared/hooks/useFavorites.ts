import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Favorite {
  id:    string;
  label: string;
  path:  string;
}

// user_favorites is not present in @platform/types' hand-maintained Database
// stub yet — same escape hatch already used by useDemoRequests.ts/
// useAnnouncements.ts; RLS (user_favorites_select_own/insert_own/delete_own)
// is what actually enforces per-user isolation, not this cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function favoritesTable() { return (supabase as any).from('user_favorites'); }

const FAVORITES_KEY = ['favorites'] as const;

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useFavorites() {
  const { user } = useSession();
  return useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: async (): Promise<Favorite[]> => {
      const { data, error } = await favoritesTable()
        .select('id, label, path')
        .order('created_at', { ascending: false });

      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as Favorite[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useAddFavorite() {
  const { user, organization } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, path }: { label: string; path: string }): Promise<void> => {
      if (!user?.id || !organization?.id) throw new Error('Ingen session');
      const { error } = await favoritesTable().insert({
        user_id: user.id,
        organization_id: organization.id,
        label: label.trim(),
        path,
      });
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: FAVORITES_KEY }),
  });
}

export function useRemoveFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await favoritesTable().delete().eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: FAVORITES_KEY }),
  });
}
