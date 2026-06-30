import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Download } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  amount:       number;
  description:  string | null;
  category:     string | null;
  invoice_date: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  package:  'Paket',
  lesson:   'Enskild lektion',
  fee:      'Avgift',
  discount: 'Rabatt',
  tax:      'Skatt',
  other:    'Övrigt',
};

const MONTH_OPTIONS = [3, 6, 12];

function formatSEK(amt: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amt);
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useRevenueData(orgId: string | undefined, months: number) {
  return useQuery<InvoiceLine[]>({
    queryKey: ['report-intakter', orgId, months],
    queryFn: async () => {
      if (!orgId) return [];
      const from = new Date(Date.now() - months * 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('invoice_line_items')
        .select('line_total, description, line_type, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', from)
        .neq('line_type', 'discount');
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ line_total: number; description: string | null; line_type: string | null; created_at: string }>)
        .map(r => ({
          amount:       Number(r.line_total),
          description:  r.description,
          category:     r.line_type,
          invoice_date: r.created_at,
        }));
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

// ─── Bar chart (SVG) ──────────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; value: number; pct: number }[] }) {
  const colors = [
    '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
    '#06b6d4','#f97316','#84cc16','#ec4899',
  ];

  return (
    <div className="space-y-2.5">
      {data.map((item, i) => (
        <div key={item.label} className="flex items-center gap-3">
          <div className="w-28 text-xs text-muted-foreground text-right shrink-0 truncate">{item.label}</div>
          <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{ width: `${item.pct}%`, backgroundColor: colors[i % colors.length] }}
            />
          </div>
          <div className="text-xs font-semibold text-foreground tabular-nums w-24 shrink-0">
            {formatSEK(item.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── IntakterRapportPage ──────────────────────────────────────────────────────

export function IntakterRapportPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const [months, setMonths] = useState(6);

  const { data: lines = [], isLoading } = useRevenueData(orgId, months);

  // Group by category
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const line of lines) {
      const cat = line.category ?? 'other';
      m[cat] = (m[cat] ?? 0) + line.amount;
    }
    return m;
  }, [lines]);

  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);

  const categoryData = useMemo(() => {
    return Object.entries(byCategory)
      .map(([cat, amt]) => ({
        label: CATEGORY_LABELS[cat] ?? cat,
        value: amt,
        pct:   total > 0 ? (amt / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [byCategory, total]);

  // Group by month
  const byMonth = useMemo(() => {
    const m: Record<string, number> = {};
    for (const line of lines) {
      const key = monthKey(line.invoice_date);
      m[key] = (m[key] ?? 0) + line.amount;
    }
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [lines]);

  const maxMonthAmt = byMonth.reduce((max, [, v]) => Math.max(max, v), 0);

  function formatMonthKey(key: string): string {
    return new Date(`${key}-01`).toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' });
  }

  function exportCsv() {
    const rows = [
      ['Kategori', 'Intäkt (SEK)', 'Andel (%)'],
      ...categoryData.map(r => [r.label, r.value.toFixed(2), r.pct.toFixed(1)]),
    ];
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `intakter-${months}man.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Intäktsanalys
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Intäkter per lektionskategori</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            {MONTH_OPTIONS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${months === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {m} mån
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* Total */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-muted-foreground">Total intäkt</p>
          <p className="text-3xl font-bold text-foreground mt-1">{formatSEK(total)}</p>
          <p className="text-xs text-muted-foreground mt-1">Senaste {months} månader</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Lektionskategorier</p>
          <p className="text-3xl font-bold text-foreground mt-1">{categoryData.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Aktiva</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Snitt/månad</p>
          <p className="text-3xl font-bold text-foreground mt-1">
            {formatSEK(months > 0 ? total / months : 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Genomsnitt</p>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-4">Fördelning per kategori</p>
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(n => <Skeleton key={n} className="h-6 rounded" />)}
          </div>
        ) : categoryData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Ingen data för perioden.</p>
        ) : (
          <BarChart data={categoryData} />
        )}
      </div>

      {/* Monthly trend */}
      {byMonth.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Månadsvis trend</p>
          <div className="flex items-end gap-1.5 h-32">
            {byMonth.map(([key, amt]) => {
              const pct = maxMonthAmt > 0 ? (amt / maxMonthAmt) : 0;
              return (
                <div key={key} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end" style={{ height: '80px' }}>
                    <div
                      className="w-full bg-primary/70 rounded-t transition-all hover:bg-primary"
                      style={{ height: `${Math.max(pct * 80, 3)}px` }}
                      title={formatSEK(amt)}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground leading-tight text-center">
                    {formatMonthKey(key)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
