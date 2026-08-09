import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WatchlistType = 'student' | 'payment' | 'exam' | 'other';

export interface WatchlistItem {
  id: string;
  subject: string;
  type: WatchlistType;
  note: string;
  created_at: string;
  archived_at?: string | undefined;
  status: 'active' | 'archived';
}

export interface CreateWatchlistInput {
  subject: string;
  type: WatchlistType;
  note: string;
}

// watchlist_items is not present in @platform/types' hand-maintained Database
// stub yet — same escape hatch already used by useAnnouncements.ts/
// useFavorites.ts; RLS (watchlist_items_select_org/insert_org/update_org/
// delete_org) is what actually enforces org-wide shared visibility.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function watchlistTable() { return (supabase as any).from('watchlist_items'); }

const WATCHLIST_KEY = ['watchlist-items'] as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWatchlist() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: WATCHLIST_KEY,
    queryFn: async (): Promise<WatchlistItem[]> => {
      const { data, error } = await watchlistTable()
        .select('id, subject, type, note, status, archived_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as WatchlistItem[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const addItem = useMutation({
    mutationFn: async (input: CreateWatchlistInput): Promise<void> => {
      if (!orgId) throw new Error('Ingen organisation');
      const { error } = await watchlistTable().insert({
        organization_id: orgId,
        subject: input.subject.trim(),
        type: input.type,
        note: input.note.trim(),
      });
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  const archiveItem = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await watchlistTable()
        .update({ status: 'archived', archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  const restoreItem = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await watchlistTable()
        .update({ status: 'active', archived_at: null })
        .eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await watchlistTable().delete().eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  return {
    activeItems:   items.filter((i) => i.status === 'active'),
    archivedItems: items.filter((i) => i.status === 'archived'),
    addItem:       (input: CreateWatchlistInput) => addItem.mutate(input),
    archiveItem:   (id: string) => archiveItem.mutate(id),
    restoreItem:   (id: string) => restoreItem.mutate(id),
    deleteItem:    (id: string) => deleteItem.mutate(id),
  };
}
