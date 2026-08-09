import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BasAccount {
  account_code: string;
  account_name: string;
  sort_order:   number;
}

const PAGE_SIZE = 100;

// ─── KontoplanPage ────────────────────────────────────────────────────────────

export function KontoplanPage() {
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);

  const { data: accounts = [], isLoading } = useQuery<BasAccount[]>({
    queryKey: ['bas-account-catalog-full'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bas_account_catalog')
        .select('account_code, account_name, sort_order')
        .order('sort_order', { ascending: true });
      return (data ?? []) as BasAccount[];
    },
    staleTime: 10 * 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      a.account_code.includes(q) || a.account_name.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/finance/accounts" className="hover:text-foreground">Ekonomi</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Kontoplan</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        BAS 2020-kontoplanen är en gemensam, plattformsförvaltad referens — inga konton läggs till här per skola.
      </p>

      {/* Search */}
      <input
        type="text"
        placeholder="Sök efter namn eller kontonummer"
        value={search}
        onChange={e => handleSearch(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Kontonummer</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Namn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {slice.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                    Inga konton hittades.
                  </td>
                </tr>
              ) : (
                slice.map(a => (
                  <tr key={a.account_code} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-sm">{a.account_code}</td>
                    <td className="px-4 py-2.5 text-foreground">{a.account_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
              <span>
                Visar {(currentPage - 1) * PAGE_SIZE + 1} till{' '}
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} av {filtered.length} resultat
              </span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 6) }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                      p === currentPage
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent text-foreground'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {totalPages > 6 && <span className="px-1">…</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
