import { useState } from 'react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/ui';
import { useInsightsTrends, useCategoryTrend } from '../hooks/useInsightsTrends.js';
import { useLicenceCategories } from '@modules/classlist/hooks/useClassList.js';
import { SvgLineChart } from '../components/SvgLineChart.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PctBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-green-600 dark:text-green-400 text-sm font-semibold">Ny</span>;
  const cls = value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive';
  return <span className={cn('text-sm font-semibold', cls)}>{value >= 0 ? '+' : ''}{value}%</span>;
}

// ─── Elevtrender Tab ──────────────────────────────────────────────────────────

const MONTHS = [
  { value: '0',  label: 'Hela året' },
  { value: '1',  label: 'Januari'   },
  { value: '2',  label: 'Februari'  },
  { value: '3',  label: 'Mars'      },
  { value: '4',  label: 'April'     },
  { value: '5',  label: 'Maj'       },
  { value: '6',  label: 'Juni'      },
  { value: '7',  label: 'Juli'      },
  { value: '8',  label: 'Augusti'   },
  { value: '9',  label: 'September' },
  { value: '10', label: 'Oktober'   },
  { value: '11', label: 'November'  },
  { value: '12', label: 'December'  },
];

export function ElevtrendTab() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2].map(String);

  const [pendingYear,  setPendingYear]  = useState(String(currentYear));
  const [pendingMonth, setPendingMonth] = useState('0');
  const [activeYear,   setActiveYear]   = useState(currentYear);
  const [activeMonth,  setActiveMonth]  = useState(0);

  // Comparison category — 'none' means no second series
  const [comparisonCategory, setComparisonCategory] = useState('none');

  function handleUpdate() {
    setActiveYear(parseInt(pendingYear, 10));
    setActiveMonth(parseInt(pendingMonth, 10));
  }

  const { data, isLoading, error } = useInsightsTrends(activeYear, activeMonth);
  const { data: categories = [] }   = useLicenceCategories();
  const { data: catPoints, isLoading: catLoading } = useCategoryTrend(
    activeYear,
    activeMonth,
    comparisonCategory,
  );

  const chartData  = (data?.monthPoints ?? []).map((p) => ({ label: p.label, value: p.count }));
  const chartData2 = catPoints ? catPoints.map((p) => ({ label: p.label, value: p.count })) : undefined;

  const selectedCatLabel = categories.find((c) => c === comparisonCategory) ?? comparisonCategory;

  return (
    <div className="space-y-6">

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">År</p>
            <Select value={pendingYear} onValueChange={setPendingYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Månad</p>
            <Select value={pendingMonth} onValueChange={setPendingMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleUpdate} className="w-full bg-primary text-primary-foreground">
              Uppdatera
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive py-8 text-center">Det gick inte att hämta trenddata.</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Aktiva elever card */}
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground font-medium">Aktiva elever</p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {isLoading ? '…' : data?.totalActive ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{activeYear}</p>
              {!isLoading && data && (
                <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-border">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      VS FÖREGÅENDE MÅNAD
                    </p>
                    <div className="mt-1">
                      <PctBadge value={data.pctMonth} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{data.prevMonthTotal} elever</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      VS SAMMA PERIOD FÖREGÅENDE ÅR
                    </p>
                    <div className="mt-1">
                      <PctBadge value={data.pctYear} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{data.prevYearTotal} elever</p>
                  </div>
                </div>
              )}
            </div>

            {/* Behörighetsjämförelse — now wired */}
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground font-medium">Behörighetsjämförelse</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Välj en behörighet för att lägga till en jämförelselinje i grafen.
              </p>
              <Select value={comparisonCategory} onValueChange={setComparisonCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj behörighet…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen jämförelse</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {comparisonCategory !== 'none' && !catLoading && catPoints && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-sm font-semibold text-foreground">{selectedCatLabel}</p>
                  <p className="text-2xl font-bold text-amber-500 mt-0.5">
                    {catPoints[catPoints.length - 1]?.count ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">aktiva elever (senaste månaden)</p>
                </div>
              )}
              {comparisonCategory !== 'none' && catLoading && (
                <div className="mt-3 h-6 bg-muted rounded animate-pulse" />
              )}
            </div>
          </div>

          {/* Line chart */}
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm font-semibold text-foreground">Aktiva elever månad för månad</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Visar antal aktiva elever vid slutet av varje månad i vald period.
            </p>
            {isLoading ? (
              <div className="h-40 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Laddar…</p>
              </div>
            ) : (
              <SvgLineChart
                data={chartData}
                data2={chartData2}
                legendLabel="Alla elever"
                legend2Label={comparisonCategory !== 'none' ? selectedCatLabel : undefined}
              />
            )}
          </div>

          {/* Behörighetsutveckling */}
          {!isLoading && (data?.categoryStats?.length ?? 0) > 0 && (
            <div>
              <p className="text-sm font-semibold text-foreground">Behörighetsutveckling</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                Jämför aktuellt elevantal för varje behörighet med föregående månad och samma period föregående år.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(data?.categoryStats ?? []).map((cat) => (
                  <div
                    key={cat.category}
                    className={cn(
                      'bg-card border rounded-lg p-4 cursor-pointer transition-colors hover:bg-muted/20',
                      comparisonCategory === cat.category
                        ? 'border-amber-400 dark:border-amber-600 ring-1 ring-amber-400/30'
                        : 'border-border',
                    )}
                    onClick={() =>
                      setComparisonCategory((prev) =>
                        prev === cat.category ? 'none' : cat.category,
                      )
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      setComparisonCategory((prev) =>
                        prev === cat.category ? 'none' : cat.category,
                      )
                    }
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-foreground">{cat.category}</p>
                      <div className="flex items-center gap-1.5">
                        {comparisonCategory === cat.category && (
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                            Jämförs
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {activeYear}
                        </span>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{cat.current}</p>
                    <div className="space-y-1 mt-3 pt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Vs föregående månad</p>
                        <PctBadge value={cat.pctMonth} />
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Vs samma period föregående år</p>
                        <PctBadge value={cat.pctYear} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
