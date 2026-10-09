import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ChevronRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { DEFAULT_WORK_HOURS, parseOrgWorkHours } from '@modules/instructors/hooks/useWorkSchedule.js';

const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00:00`);

const WORK_DAY_OPTIONS = [
  { value: 1, label: 'Mån' }, { value: 2, label: 'Tis' }, { value: 3, label: 'Ons' },
  { value: 4, label: 'Tor' }, { value: 5, label: 'Fre' }, { value: 6, label: 'Lör' }, { value: 0, label: 'Sön' },
];

export function SchemaConfigPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [startTime,        setStartTime]        = useState('08:00:00');
  const [endTime,          setEndTime]          = useState('18:00:00');
  const [showWeekends,     setShowWeekends]     = useState(true);
  const [openSlotOnCreate, setOpenSlotOnCreate] = useState(false);
  const [workDays,         setWorkDays]         = useState<number[]>(DEFAULT_WORK_HOURS.days);
  const [workStart,        setWorkStart]        = useState(DEFAULT_WORK_HOURS.start);
  const [workEnd,          setWorkEnd]          = useState(DEFAULT_WORK_HOURS.end);

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-schema', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      return ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!orgSettings) return;
    const s = (orgSettings['schema'] as Record<string, unknown> | undefined) ?? {};
    if (s['start_time'])                    setStartTime(s['start_time'] as string);
    if (s['end_time'])                      setEndTime(s['end_time'] as string);
    if (typeof s['show_weekends'] === 'boolean') setShowWeekends(s['show_weekends']);
    if (typeof s['open_slot_on_create'] === 'boolean') setOpenSlotOnCreate(s['open_slot_on_create']);
    const wh = parseOrgWorkHours(orgSettings);
    setWorkDays(wh.days);
    setWorkStart(wh.start);
    setWorkEnd(wh.end);
  }, [orgSettings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      if (workDays.length > 0 && workEnd <= workStart) throw new Error('Arbetstidens sluttid måste vara efter starttiden.');
      const prevSchema = (orgSettings?.['schema'] as Record<string, unknown> | undefined) ?? {};
      const { error } = await supabase.from('organizations').update({
        settings: {
          ...(orgSettings ?? {}),
          schema: {
            ...prevSchema,
            start_time: startTime, end_time: endTime, show_weekends: showWeekends, open_slot_on_create: openSlotOnCreate,
            work_days: workDays, work_start: workStart, work_end: workEnd,
          },
        },
      } as never).eq('id', orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: 'Sparat', description: 'Schemainställningarna har sparats.' });
      void qc.invalidateQueries({ queryKey: ['org-settings-schema', orgId] });
    },
    onError: (e) => toast({ title: 'Kunde inte spara', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
  });

  return (
    <div className="max-w-xl space-y-6">
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/settings/schema/time-templates" className="hover:text-foreground">Schema</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">Schemainställningar</span>
      </nav>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Settings className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Schemainställningar</h1>
        <p className="text-sm text-muted-foreground">Konfigurera verksamhetens schema- och bokningsinställningar.</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Verksamhetens tider</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Starttid schema</label>
            <select
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Sluttid schema</label>
            <select
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Standardarbetstid för lärare</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Förval när en ny lärare läggs till och när ett schema skapas automatiskt. Varje lärare kan sedan få egna tider.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {WORK_DAY_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={workDays.includes(value)}
                  onChange={() => setWorkDays((prev) => prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value])}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm text-foreground">{label}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground" htmlFor="work-start">Arbetar från</label>
              <input id="work-start" type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground" htmlFor="work-end">Arbetar till</label>
              <input id="work-end" type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          </div>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={showWeekends} onChange={e => setShowWeekends(e.target.checked)} className="mt-0.5 rounded border-border accent-primary w-4 h-4 shrink-0" />
          <div>
            <span className="text-sm text-foreground">Visa helger som standard i bokningsschemat</span>
            <p className="text-xs text-primary/70 mt-0.5">Markera denna ruta ifall du önskar att helger ska visas i bokningsschemat som standard.</p>
          </div>
        </label>

        <label className="flex items-start gap-2 cursor-not-allowed opacity-60">
          <input type="checkbox" checked={openSlotOnCreate} onChange={e => setOpenSlotOnCreate(e.target.checked)} disabled className="mt-0.5 rounded border-border accent-primary w-4 h-4 shrink-0" />
          <div>
            <span className="text-sm text-foreground">Öppna tidsluckan direkt efter skapande</span>
            <p className="text-xs text-muted-foreground mt-0.5">Inte implementerat ännu — skapande av en tidslucka stänger formuläret men öppnar inte redigeringsvyn automatiskt idag.</p>
          </div>
        </label>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>
    </div>
  );
}
