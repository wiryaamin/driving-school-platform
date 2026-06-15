import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronsUpDown, Package } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id:              string;
  internal_name:   string;
  external_name:   string;
  category:        string;
  product_type:    string;
  price_sek:       number;
  sort_order:      number;
  is_active:       boolean;
  image_url?:      string | null;
  ecommerce_active: boolean;
}

// ─── ProdukterSettingsPage ────────────────────────────────────────────────────

export function ProdukterSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const [tab, setTab]     = useState<'active' | 'inactive'>('active');
  const [search, setSearch] = useState('');

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['settings-products', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('products')
        .select('id, internal_name, external_name, category, product_type, price_sek, sort_order, is_active, image_url, ecommerce_active')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true });
      return (data ?? []) as Product[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  const filtered = products.filter(p => {
    if (tab === 'active'   && !p.is_active) return false;
    if (tab === 'inactive' &&  p.is_active) return false;
    const q = search.toLowerCase();
    if (q && !p.internal_name.toLowerCase().includes(q) && !p.external_name.toLowerCase().includes(q)) return false;
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
          <span className="text-foreground">Produkter</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa produkt
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
            {t === 'active' ? 'Aktiva produkter' : 'Inaktiva produkter'}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Sök efter internt namn eller externt namn..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Bild</th>
                {['Internt namn', 'Externt namn', 'Kategori', 'Typ', 'Pris', 'Sorteringsordning', 'E-handel'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      {h} <ChevronsUpDown className="w-3 h-3 opacity-50" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    {products.length === 0
                      ? 'Inga produkter har skapats ännu.'
                      : 'Inga produkter matchade sökningen.'}
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="hover:bg-accent/20 transition-colors cursor-pointer">
                    <td className="px-4 py-2.5">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                          <Package className="w-4 h-4 text-primary" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{p.internal_name}</td>
                    <td className="px-4 py-2.5 font-medium">{p.external_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.category}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.product_type}</td>
                    <td className="px-4 py-2.5">{fmtPrice(p.price_sek)}</td>
                    <td className="px-4 py-2.5 text-center">{p.sort_order}</td>
                    <td className="px-4 py-2.5">
                      {p.ecommerce_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium whitespace-nowrap">
                          Aktiv i e-handel
                        </span>
                      )}
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
