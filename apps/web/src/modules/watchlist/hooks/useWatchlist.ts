import { useState, useCallback } from 'react';

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

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'watchlist_items_v1';

function loadItems(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

function persistItems(items: WatchlistItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(loadItems);

  const update = useCallback((fn: (prev: WatchlistItem[]) => WatchlistItem[]) => {
    setItems((prev) => {
      const next = fn(prev);
      persistItems(next);
      return next;
    });
  }, []);

  const addItem = useCallback((input: CreateWatchlistInput) => {
    const item: WatchlistItem = {
      id: crypto.randomUUID(),
      ...input,
      created_at: new Date().toISOString(),
      status: 'active',
    };
    update((prev) => [item, ...prev]);
  }, [update]);

  const archiveItem = useCallback((id: string) => {
    update((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: 'archived' as const, archived_at: new Date().toISOString() }
          : i,
      ),
    );
  }, [update]);

  const restoreItem = useCallback((id: string) => {
    update((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: 'active' as const, archived_at: undefined }
          : i,
      ),
    );
  }, [update]);

  const deleteItem = useCallback((id: string) => {
    update((prev) => prev.filter((i) => i.id !== id));
  }, [update]);

  return {
    activeItems:   items.filter((i) => i.status === 'active'),
    archivedItems: items.filter((i) => i.status === 'archived'),
    addItem,
    archiveItem,
    restoreItem,
    deleteItem,
  };
}
