import { useState } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@platform/ui';
import { useInsightsDemografi } from '../hooks/useInsightsDemografi.js';
import { useLicenceCategories } from '@modules/classlist/hooks/useClassList.js';
import { cn } from '@/lib/utils.js';

// ─── Horizontal bar row ───────────────────────────────────────────────────────

interface BarRowProps {
  label:   string;
  men:     number;
  women:   number;
  total:   number;
  maxTotal: number;
}

function BarRow({ label, men, women, total, maxTotal }: BarRowProps) {
  const menPct   = total > 0 ? Math.round((men   / total) * 100) : 0;
  const womenPct = total > 0 ? Math.round((women / total) * 100) : 0;
  const barScale = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

  return (
    <div className="grid grid-cols-[120px_1fr_80px] items-center gap-3 py-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="space-y-0.5">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${barScale * (menPct / 100)}%` }}
          />
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-pink-500 rounded-full transition-all"
            style={{ width: `${barScale * (womenPct / 100)}%` }}
          />
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs text-blue-600 dark:text-blue-400">{men > 0 ? `${men} st (${menPct}%)` : '0 st (0%)'}</p>
        <p className="text-xs text-pink-600 dark:text-pink-400">{women > 0 ? `${women} st (${womenPct}%)` : '0 st (0%)'}</p>
      </div>
    </div>
  );
}

// ─── City bar row ─────────────────────────────────────────────────────────────

interface CityBarProps { city: string; count: number; maxCount: number; total: number }

function CityBar({ city, count, maxCount, total }: CityBarProps) {
  const pct      = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const totalPct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[130px_1fr_80px] items-center gap-3 py-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{city}</p>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-right text-muted-foreground">{count} st ({totalPct}%)</p>
    </div>
  );
}

// ─── Demografi Tab ────────────────────────────────────────────────────────────

export function DemografiTab() {
  const [customerType,  setCustomerType]  = useState('all');
  const [licenceCat,    setLicenceCat]    = useState('all');

  const { data: categories = [] } = useLicenceCategories();
  const { data, isLoading }       = useInsightsDemografi(licenceCat);

  const g    = data?.gender;
  const ageGroups = data?.ageGroups ?? [];
  const cities    = data?.cities ?? [];
  const total     = data?.total ?? 0;
  const maxAge    = Math.max(...ageGroups.map((a) => a.total), 1);
  const maxCity   = cities[0]?.count ?? 1;

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Filters */}
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Välj kundtyp</p>
          <Select value={customerType} onValueChange={setCustomerType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kunder</SelectItem>
              <SelectItem value="active">Aktiva kunder</SelectItem>
              <SelectItem value="corporate">Företagskunder</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Välj utbildningsbehörigheter</p>
          <Select value={licenceCat} onValueChange={setLicenceCat}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla utbildningsbehörigheter</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Laddar demografidata…</p>
      ) : (
        <>
          {/* Gender */}
          <section>
            <h3 className="text-sm font-semibold text-primary mb-3">Kunder efter kön</h3>
            {(g?.unknown ?? 0) === total && total > 0 ? (
              <p className="text-xs text-muted-foreground">
                Könsdata kräver personnummer — ej tillgängligt för alla elever.
              </p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-[120px_1fr_80px] items-center gap-3 py-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">MÄN</p>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: g && total > 0 ? `${(g.men / total) * 100}%` : '0%' }}
                    />
                  </div>
                  <p className="text-xs text-right text-muted-foreground">
                    {g?.men ?? 0} st ({total > 0 ? Math.round(((g?.men ?? 0) / total) * 100) : 0}%)
                  </p>
                </div>
                <div className="grid grid-cols-[120px_1fr_80px] items-center gap-3 py-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">KVINNOR</p>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-pink-500 rounded-full"
                      style={{ width: g && total > 0 ? `${(g.women / total) * 100}%` : '0%' }}
                    />
                  </div>
                  <p className="text-xs text-right text-muted-foreground">
                    {g?.women ?? 0} st ({total > 0 ? Math.round(((g?.women ?? 0) / total) * 100) : 0}%)
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Age */}
          <section>
            <h3 className="text-sm font-semibold text-primary mb-1">Kunder efter ålder</h3>
            <div className="divide-y divide-border/40">
              {ageGroups.map((ag) => (
                <BarRow
                  key={ag.label}
                  label={ag.label}
                  men={ag.men}
                  women={ag.women}
                  total={ag.total}
                  maxTotal={maxAge}
                />
              ))}
            </div>
          </section>

          {/* Cities */}
          {cities.length > 0 && (
            <section>
              <h3 className={cn('text-sm font-semibold text-primary mb-1')}>
                Kunder efter stad, {cities.length} största
              </h3>
              <div className="divide-y divide-border/40">
                {cities.map((c) => (
                  <CityBar key={c.city} city={c.city} count={c.count} maxCount={maxCity} total={total} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
