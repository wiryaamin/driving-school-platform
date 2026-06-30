import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, GraduationCap, Pencil, X, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

interface LicenseRow { code: string; label: string; abbr: string; webAlias: string; webCat: string; catColor: string; defaultOn: boolean; }
interface LicenseGroup { group: string; licenses: LicenseRow[]; }

const LICENSE_GROUPS: LicenseGroup[] = [
  { group: 'Personbil', licenses: [
    { code: 'B_MAN',    label: 'Behörighet BMan',   abbr: 'BMan',    webAlias: '', webCat: 'Personbil',               catColor: 'blue',   defaultOn: true  },
    { code: 'B_AUT',    label: 'Behörighet BAut',   abbr: 'BAut',    webAlias: '', webCat: 'Personbil automat',        catColor: 'blue',   defaultOn: true  },
    { code: 'B_UT',     label: 'Utökad B',          abbr: 'Utökad',  webAlias: '', webCat: '',                        catColor: '',       defaultOn: false },
    { code: 'BE',       label: 'Behörighet BE',     abbr: 'BE',      webAlias: '', webCat: 'Personbil med tungt släp', catColor: 'blue',   defaultOn: true  },
  ]},
  { group: 'Motorcykel/moped', licenses: [
    { code: 'A',        label: 'Behörighet A',       abbr: 'A',        webAlias: 'MC',   webCat: 'Motorcykel (A)',   catColor: 'orange', defaultOn: false },
    { code: 'A1',       label: 'Behörighet A1',      abbr: 'A1',       webAlias: 'Moto', webCat: 'Motorcykel (A1)', catColor: 'orange', defaultOn: false },
    { code: 'A2',       label: 'Behörighet A2',      abbr: 'A2',       webAlias: 'Moto', webCat: 'Motorcykel (A2)', catColor: 'orange', defaultOn: false },
    { code: 'AM',       label: 'Behörighet AM',      abbr: 'AM',       webAlias: 'AM',   webCat: '',                catColor: '',       defaultOn: false },
    { code: 'MOPED_FB', label: 'Förarbevis - Moped', abbr: 'MopedKI',  webAlias: 'Föra', webCat: '',                catColor: '',       defaultOn: false },
  ]},
  { group: 'Lastbil', licenses: [
    { code: 'C',   label: 'Behörighet C',   abbr: 'C',   webAlias: 'Tung', webCat: 'Lastbil',          catColor: 'red',  defaultOn: false },
    { code: 'C1E', label: 'Behörighet C1E', abbr: 'C1E', webAlias: 'Med',  webCat: 'Medelung lastbil', catColor: 'red',  defaultOn: false },
    { code: 'C1',  label: 'Behörighet C1',  abbr: 'C1',  webAlias: 'Med',  webCat: 'Medelung lastbil', catColor: 'red',  defaultOn: false },
    { code: 'CE',  label: 'Behörighet CE',  abbr: 'CE',  webAlias: 'Tung', webCat: 'Lastbil och släp', catColor: 'red',  defaultOn: true  },
  ]},
  { group: 'Buss', licenses: [
    { code: 'D',   label: 'Behörighet D',   abbr: 'D',   webAlias: 'Bus', webCat: 'Buss',          catColor: 'purple', defaultOn: false },
    { code: 'DE',  label: 'Behörighet DE',  abbr: 'DE',  webAlias: 'Bus', webCat: 'Buss (DE)',      catColor: 'purple', defaultOn: false },
    { code: 'D1E', label: 'Behörighet D1E', abbr: 'D1E', webAlias: 'Mel', webCat: 'Minibuss (D1E)', catColor: 'purple', defaultOn: false },
    { code: 'D1',  label: 'Behörighet D1',  abbr: 'D1',  webAlias: 'Mel', webCat: 'Minibuss',       catColor: 'purple', defaultOn: false },
  ]},
  { group: 'Traktor',    licenses: [{ code: 'T', label: 'Behörighet T', abbr: 'Tr', webAlias: 'Trak', webCat: '', catColor: '', defaultOn: false }]},
  { group: 'Snöskoter',  licenses: [{ code: 'S', label: 'Behörighet S', abbr: 'S',  webAlias: 'Snö',  webCat: '', catColor: '', defaultOn: false }]},
  { group: 'Yrkesförare', licenses: [
    { code: 'YKB_P',  label: 'YKB Persontransport',              abbr: 'G YKB P', webAlias: 'YKB', webCat: 'YKB Person',       catColor: 'teal', defaultOn: true  },
    { code: 'YKB_G',  label: 'YKB Godstransport',                abbr: 'G YKB G', webAlias: 'YKB', webCat: 'YKB gods',         catColor: 'teal', defaultOn: true  },
    { code: 'YKB_FP', label: 'YKB Fortbildning persontransport', abbr: 'F YKB P', webAlias: 'YSK', webCat: 'YKB Person Fortb', catColor: 'teal', defaultOn: false },
    { code: 'YKB_FG', label: 'YKB Fortbildning godstransport',   abbr: 'F YKB G', webAlias: 'YSK', webCat: 'YKB Gods Fortb',   catColor: 'teal', defaultOn: false },
  ]},
  { group: 'Övrigt', licenses: [
    { code: 'RISK1A',   label: 'Riskettan A',                abbr: 'Risk1 A',  webAlias: 'Risk',  webCat: '',               catColor: '',      defaultOn: false },
    { code: 'RISK1B',   label: 'Riskettan B',                abbr: 'Risk1 B',  webAlias: 'Risk',  webCat: 'Riskettan B',    catColor: 'green', defaultOn: true  },
    { code: 'RISK2A',   label: 'Risktvåan A',                abbr: 'Risk2 A',  webAlias: 'A Lätt',webCat: '',               catColor: '',      defaultOn: false },
    { code: 'RISK2AL',  label: 'Risktvåan A Lätt',           abbr: 'A Lätt',   webAlias: '',      webCat: '',               catColor: '',      defaultOn: false },
    { code: 'RISK2B',   label: 'Risktvåan B',                abbr: 'Risk2 B',  webAlias: '',      webCat: 'Risktvåan B',    catColor: 'green', defaultOn: true  },
    { code: 'INTRO',    label: 'Introduktionskurs',          abbr: 'Intro',    webAlias: 'Intro', webCat: 'Introduktionskur',catColor: 'amber', defaultOn: true  },
    { code: 'TERRANG',  label: 'Terränghjuling',             abbr: 'Terrän',   webAlias: 'Terr',  webCat: '',               catColor: '',      defaultOn: false },
    { code: 'PRESENTK', label: 'Presentkort',                abbr: 'Present',  webAlias: 'Gavi',  webCat: '',               catColor: '',      defaultOn: false },
    { code: 'TAXI',     label: 'Taxi',                       abbr: 'Taxi',     webAlias: '',      webCat: '',               catColor: '',      defaultOn: true  },
    { code: 'TAXI2',    label: 'Taxi del 2',                 abbr: 'Taxi',     webAlias: '',      webCat: '',               catColor: '',      defaultOn: false },
    { code: 'TAXI_ECO', label: 'Taxi EcoDrive',              abbr: 'EcoDriv',  webAlias: '',      webCat: '',               catColor: '',      defaultOn: false },
    { code: 'HEAVY_ECO',label: 'Heavy EcoDrive',             abbr: 'EcoDriv',  webAlias: 'Heav',  webCat: '',               catColor: '',      defaultOn: false },
    { code: 'WORK_ECO', label: 'Working EcoDrive',           abbr: 'EcoDriv',  webAlias: 'Worl',  webCat: '',               catColor: '',      defaultOn: false },
    { code: 'ADR',      label: 'ADR Grund',                  abbr: 'ADR Gr',   webAlias: 'Grun',  webCat: '',               catColor: '',      defaultOn: false },
    { code: 'ADR_REP',  label: 'ADR Repetition',             abbr: 'ADR rep',  webAlias: 'Grun',  webCat: '',               catColor: '',      defaultOn: false },
    { code: 'ADR1',     label: 'Klass 1 Farligt gods grund', abbr: 'ADR1 Gr',  webAlias: 'Klas',  webCat: '',               catColor: '',      defaultOn: false },
    { code: 'ADR7',     label: 'Klass 7 Farligt gods grund', abbr: 'ADR7 Gr',  webAlias: 'Klas',  webCat: '',               catColor: '',      defaultOn: false },
    { code: 'ADR_TANK', label: 'Tank Farligt gods grund',    abbr: 'ADR T G',  webAlias: 'Tank',  webCat: '',               catColor: '',      defaultOn: false },
  ]},
];

const CAT_COLORS: Record<string, string> = {
  blue:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  red:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  teal:   'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  green:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  amber:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export function UtbildningsbehörigheterPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const allCodes = LICENSE_GROUPS.flatMap(g => g.licenses).map(l => l.code);

  const [enabled,    setEnabled]    = useState<Set<string>>(() => new Set(LICENSE_GROUPS.flatMap(g => g.licenses).filter(l => l.defaultOn).map(l => l.code)));
  const [webAliases, setWebAliases] = useState<Record<string, string>>(() => Object.fromEntries(LICENSE_GROUPS.flatMap(g => g.licenses).map(l => [l.code, l.webAlias])));
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [webCats,    setWebCats]    = useState<Record<string, string>>(() => Object.fromEntries(LICENSE_GROUPS.flatMap(g => g.licenses).map(l => [l.code, l.webCat])));
  const [catColors,  setCatColors]  = useState<Record<string, string>>(() => Object.fromEntries(LICENSE_GROUPS.flatMap(g => g.licenses).map(l => [l.code, l.catColor])));
  const [catInput,   setCatInput]   = useState('');

  const [arkiverateori, setArkiverateori] = useState(false);
  const [sendSms,       setSendSms]       = useState(false);
  const [sendEmail,     setSendEmail]     = useState(false);
  const [subject,       setSubject]       = useState('');
  const [body,          setBody]          = useState('');

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-licenses', orgId],
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
    const s = (orgSettings['licenses'] as Record<string, unknown> | undefined) ?? {};
    if (Array.isArray(s['enabled']))       setEnabled(new Set(s['enabled'] as string[]));
    if (s['web_aliases'] && typeof s['web_aliases'] === 'object') setWebAliases(s['web_aliases'] as Record<string, string>);
    if (s['web_cats']    && typeof s['web_cats']    === 'object') setWebCats(s['web_cats'] as Record<string, string>);
    if (s['cat_colors']  && typeof s['cat_colors']  === 'object') setCatColors(s['cat_colors'] as Record<string, string>);
    if (typeof s['arkivera_teori'] === 'boolean') setArkiverateori(s['arkivera_teori']);
    const msg = (s['message'] as Record<string, unknown> | undefined) ?? {};
    if (typeof msg['send_sms']   === 'boolean') setSendSms(msg['send_sms']);
    if (typeof msg['send_email'] === 'boolean') setSendEmail(msg['send_email']);
    if (typeof msg['subject']    === 'string')  setSubject(msg['subject']);
    if (typeof msg['body']       === 'string')  setBody(msg['body']);
  }, [orgSettings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        settings: {
          ...(orgSettings ?? {}),
          licenses: {
            enabled: [...enabled], web_aliases: webAliases, web_cats: webCats, cat_colors: catColors,
            arkivera_teori: arkiverateori,
            message: { send_sms: sendSms, send_email: sendEmail, subject, body },
          },
        },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      toast({ title: 'Sparat', description: 'Utbildningsbehörigheter har sparats.' });
      void qc.invalidateQueries({ queryKey: ['org-settings-licenses', orgId] });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  const save = () => saveMut.mutate();
  const isPending = saveMut.isPending;

  const allChecked  = allCodes.every(c => enabled.has(c));
  const someChecked = allCodes.some(c => enabled.has(c)) && !allChecked;

  function toggleAll(checked: boolean) { setEnabled(checked ? new Set(allCodes) : new Set()); }
  function toggleLicense(code: string) { setEnabled(prev => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; }); }
  function startEditCat(code: string) { setCatInput(webCats[code] ?? ''); setEditingCat(code); }
  function saveCat(code: string) { setWebCats(prev => ({ ...prev, [code]: catInput })); setEditingCat(null); }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Utbildningsbehörigheter</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-red-100 text-red-500 flex items-center justify-center"><GraduationCap className="w-6 h-6" /></div>
        <h1 className="text-lg font-semibold text-foreground">Utbildningsbehörigheter</h1>
        <p className="text-sm text-muted-foreground">Hantera de utbildningsbehörigheter som tillhandahålls av trafikskolan.</p>
      </div>

      {/* Behörighetstabel */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="flex-1 text-sm font-semibold text-foreground">Våra undervisningsbehörigheter</h2>
          <Button size="sm" onClick={save} disabled={isPending} className="bg-green-500 hover:bg-green-600 text-white">{isPending ? 'Sparar…' : 'Spara'}</Button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="w-10 px-4 py-2 text-left">
                <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked; }} onChange={e => toggleAll(e.target.checked)} className="rounded border-border accent-primary w-4 h-4" />
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Behörighet</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Förkortning</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Alias på webben</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Kategori på webben</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {LICENSE_GROUPS.map(({ group, licenses }) => (
              <>
                <tr key={`group-${group}`} className="bg-muted/10">
                  <td colSpan={5} className="px-4 py-2 text-xs font-bold text-foreground uppercase tracking-wide border-y border-border/60">{group}</td>
                </tr>
                {licenses.map(lt => {
                  const isOn  = enabled.has(lt.code);
                  const cat   = webCats[lt.code] ?? '';
                  const color = catColors[lt.code] ?? '';
                  return (
                    <tr key={lt.code} className={cn('transition-colors', isOn ? 'hover:bg-accent/20' : 'opacity-50 hover:bg-accent/10')}>
                      <td className="px-4 py-2"><input type="checkbox" checked={isOn} onChange={() => toggleLicense(lt.code)} className="rounded border-border accent-primary w-4 h-4" /></td>
                      <td className="px-4 py-2 font-medium text-foreground">{lt.label}</td>
                      <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{lt.abbr}</td>
                      <td className="px-4 py-2">
                        <input type="text" value={webAliases[lt.code] ?? ''} onChange={e => setWebAliases(prev => ({ ...prev, [lt.code]: e.target.value }))} className="w-full max-w-[120px] h-7 px-2 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
                      </td>
                      <td className="px-4 py-2">
                        {editingCat === lt.code ? (
                          <div className="flex items-center gap-1">
                            <input type="text" value={catInput} onChange={e => setCatInput(e.target.value)} autoFocus className="h-7 px-2 text-xs border border-primary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 w-32" />
                            <button type="button" onClick={() => saveCat(lt.code)} className="p-1 text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => setEditingCat(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {cat ? <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', color && CAT_COLORS[color] ? CAT_COLORS[color] : 'bg-muted text-muted-foreground')}>{cat}</span> : null}
                            <button type="button" onClick={() => startEditCat(lt.code)} className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-opacity"><Pencil className="w-3 h-3" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Teorimaterial */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Teorimaterial</h2>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" checked={arkiverateori} onChange={e => setArkiverateori(e.target.checked)} className="rounded border-border accent-primary w-4 h-4" />
          Arkivera teorimaterial när behörighet slutförs
        </label>
      </div>

      {/* Meddelande när behörighet slutförs */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Meddelande när behörighet slutförs</h2>
        <p className="text-xs text-primary leading-relaxed">Fyll i det meddelande du vill skicka när en behörighet slutförts, t.ex. länk till enkät eller recension.</p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} className="rounded border-border accent-primary w-4 h-4" />
            SMS
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="rounded border-border accent-primary w-4 h-4" />
            E-post
          </label>
        </div>
        {sendEmail && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Ämne (ifall e-post skickas)</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        )}
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={isPending} className="bg-green-500 hover:bg-green-600 text-white">{isPending ? 'Sparar…' : 'Spara'}</Button>
        </div>
      </div>
    </div>
  );
}
