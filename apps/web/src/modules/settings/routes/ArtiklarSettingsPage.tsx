import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Article {
  id:              string;
  article_number:  string | number;
  name:            string;
  price_incl_vat:  number;
  vat_percent:     number;
  article_type:    string;
  lesson_type?:    string | null;
}

// ─── ArtiklarSettingsPage ─────────────────────────────────────────────────────

export function ArtiklarSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const [tab, setTab]     = useState<'active' | 'inactive'>('active');
  const [search, setSearch] = useState('');

  const { data: articles = [], isLoading } = useQuery<Article[]>({
    queryKey: ['settings-articles', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('articles')
        .select('id, article_number, name, price_incl_vat, vat_percent, article_type, lesson_type')
        .eq('organization_id', orgId)
        .order('article_number', { ascending: true });
      return (data ?? []) as Article[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  const visible = articles.filter(a => {
    const q = search.toLowerCase();
    if (q && !a.name.toLowerCase().includes(q) && !String(a.article_number).includes(q)) return false;
    return true;
  });

  function fmtPrice(p: number) {
    return `${p.toLocaleString('sv-SE')} kr`;
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/finance/accounts" className="hover:text-foreground">Ekonomi</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Artiklar</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa artikel
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {(['active', 'inactive'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            {t === 'active' ? 'Aktiva artiklar' : 'Inaktiva artiklar'}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Sök efter namn eller artikelnummer"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Artikelnummer', 'Internt namn', 'Pris inkl. moms', 'Moms (%)', 'Artikeltyp', 'Lektionstyp'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      {h} <ChevronsUpDown className="w-3 h-3 opacity-50" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {articles.length === 0
                      ? 'Inga artiklar har skapats ännu.'
                      : 'Inga artiklar matchade sökningen.'}
                  </td>
                </tr>
              ) : (
                visible.map(a => (
                  <tr key={a.id} className="hover:bg-accent/20 transition-colors cursor-pointer">
                    <td className="px-4 py-2.5 font-mono">{a.article_number}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{a.name}</td>
                    <td className="px-4 py-2.5">{fmtPrice(a.price_incl_vat)}</td>
                    <td className="px-4 py-2.5">{a.vat_percent} %</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.article_type}</td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[160px]">
                      {a.lesson_type ?? ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
