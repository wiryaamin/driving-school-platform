import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Star, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

interface Holiday { name: string; start: string; end: string; custom?: boolean; }

// Computes Swedish public holidays for a given year (fixed rules + Easter-based moveable feasts)
function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function fmt(d: Date): string { return d.toISOString().slice(0, 10); }

function sweHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const midsommarLord = new Date(year, 5, 20); // June 20
  while (midsommarLord.getDay() !== 6) midsommarLord.setDate(midsommarLord.getDate() + 1);
  const allaSjalar = new Date(year, 9, 31); // Oct 31
  while (allaSjalar.getDay() !== 6) allaSjalar.setDate(allaSjalar.getDate() + 1);

  return [
    { name: 'Nyårsdagen',             start: `${year}-01-01`, end: `${year}-01-01` },
    { name: 'Trettondedag jul',       start: `${year}-01-06`, end: `${year}-01-06` },
    { name: 'Långfredagen',           start: fmt(addDays(easter, -2)), end: fmt(addDays(easter, -2)) },
    { name: 'Påskdagen',              start: fmt(easter),               end: fmt(easter) },
    { name: 'Annandag påsk',          start: fmt(addDays(easter, 1)),   end: fmt(addDays(easter, 1)) },
    { name: 'Första maj',             start: `${year}-05-01`, end: `${year}-05-01` },
    { name: 'Kristi himmelsfärdsdag', start: fmt(addDays(easter, 39)),  end: fmt(addDays(easter, 39)) },
    { name: 'Pingstdagen',            start: fmt(addDays(easter, 49)),  end: fmt(addDays(easter, 49)) },
    { name: 'Nationaldagen',          start: `${year}-06-06`, end: `${year}-06-06` },
    { name: 'Midsommardagen',         start: fmt(midsommarLord),        end: fmt(midsommarLord) },
    { name: 'Alla helgons dag',       start: fmt(allaSjalar),           end: fmt(allaSjalar) },
    { name: 'Juldagen',               start: `${year}-12-25`, end: `${year}-12-25` },
    { name: 'Annandag jul',           start: `${year}-12-26`, end: `${year}-12-26` },
  ].sort((a, b) => a.start.localeCompare(b.start));
}

export function HelgdagarPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  const [customHolidays, setCustomHolidays] = useState<Holiday[]>([]);
  const [showForm,       setShowForm]       = useState(false);
  const [draftName,      setDraftName]      = useState('');
  const [draftDate,      setDraftDate]      = useState('');

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-holidays', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      return ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!orgSettings) return;
    const saved = orgSettings['custom_holidays'];
    if (Array.isArray(saved)) setCustomHolidays(saved as Holiday[]);
  }, [orgSettings]);

  const saveMut = useMutation({
    mutationFn: async (next: Holiday[]) => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        settings: { ...(orgSettings ?? {}), custom_holidays: next },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      toast({ title: 'Sparat' });
      void qc.invalidateQueries({ queryKey: ['org-settings-holidays', orgId] });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  const thisYear = useMemo(() => sweHolidays(currentYear),     [currentYear]);
  const nextYear = useMemo(() => sweHolidays(currentYear + 1), [currentYear]);
  const prevYear = useMemo(() => sweHolidays(currentYear - 1), [currentYear]);

  const upcoming = [...thisYear, ...nextYear].filter(h => h.start >= today).slice(0, 10);
  const pastThis  = thisYear.filter(h => h.start < today);
  const pastPrev  = prevYear;

  function importHolidays() {
    const existing = new Set(customHolidays.map(h => h.start));
    const toImport = thisYear.filter(h => !existing.has(h.start)).map(h => ({ ...h, custom: false }));
    const next = [...customHolidays, ...toImport];
    setCustomHolidays(next);
    saveMut.mutate(next);
    toast({ title: 'Importerat', description: `${toImport.length} helgdagar importerades för ${currentYear}.` });
  }

  function addCustom() {
    if (!draftName.trim() || !draftDate) return;
    const next = [...customHolidays, { name: draftName.trim(), start: draftDate, end: draftDate, custom: true }];
    setCustomHolidays(next);
    saveMut.mutate(next);
    setShowForm(false);
    setDraftName('');
    setDraftDate('');
  }

  function removeCustom(idx: number) {
    const next = customHolidays.filter((_, i) => i !== idx);
    setCustomHolidays(next);
    saveMut.mutate(next);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/schema/time-templates" className="hover:text-foreground">Schema</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Helgdagar</span>
        </nav>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={importHolidays} disabled={saveMut.isPending}>
            Importera helgdagar
          </Button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={() => setShowForm(true)}>
            Skapa helgdag
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
          <Star className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Helgdagar</h1>
        <p className="text-sm text-muted-foreground">Hantera helgdagar och lediga dagar för bokningsschemat.</p>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Ny helgdag</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Namn</label>
              <input autoFocus type="text" value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="t.ex. Lokalt firande" className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Datum</label>
              <input type="date" value={draftDate} onChange={e => setDraftDate(e.target.value)} className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Avbryt</Button>
            <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={addCustom} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Sparar…' : 'Spara'}
            </Button>
          </div>
        </div>
      )}

      {customHolidays.filter(h => h.custom).length > 0 && (
        <HolidaySection title="Egna helgdagar" holidays={customHolidays.filter(h => h.custom)} onRemove={i => removeCustom(customHolidays.indexOf(customHolidays.filter(h => h.custom)[i]!))} />
      )}

      <HolidaySection title={`Kommande helgdagar ${currentYear}/${currentYear + 1}`} holidays={upcoming} clickable />
      <HolidaySection title={`Tidigare helgdagar ${currentYear}`} holidays={pastThis} />
      <HolidaySection title={`Tidigare helgdagar ${currentYear - 1}`} holidays={pastPrev} />
    </div>
  );
}

function HolidaySection({ title, holidays, clickable, onRemove }: {
  title:     string;
  holidays:  Holiday[];
  clickable?: boolean;
  onRemove?: (idx: number) => void;
}) {
  if (holidays.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {holidays.map((h, i) => (
          <div key={`${h.name}-${h.start}`} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{h.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{h.start} – {h.end}</p>
            </div>
            <div className="flex items-center gap-2">
              {h.custom && onRemove && (
                <button type="button" onClick={() => onRemove(i)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {clickable && <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
              {!clickable && !h.custom && <Plus className="w-4 h-4 text-muted-foreground/30 shrink-0" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
