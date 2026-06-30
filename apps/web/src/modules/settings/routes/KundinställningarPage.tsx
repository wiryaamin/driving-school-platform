import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

interface StaffMember { id: string; first_name: string; last_name: string; role: string; }

export function KundinställningarPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [autoPassword,   setAutoPassword]   = useState(true);
  const [passSms,        setPassSms]        = useState(true);
  const [passEmail,      setPassEmail]      = useState(true);
  const [includeAppLink, setIncludeAppLink] = useState(false);
  const [autoControl,    setAutoControl]    = useState(false);
  const [archiveWeeks,   setArchiveWeeks]   = useState(26);
  const [bankIdStaff,    setBankIdStaff]    = useState<string[]>([]);
  const [staffSearch,    setStaffSearch]    = useState('');
  const [blankettText,   setBlankettText]   = useState('');

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-customers', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      return ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ['settings-staff-list', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('instructors')
        .select('id, first_name, last_name, role')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('first_name');
      return (data ?? []) as StaffMember[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!orgSettings) return;
    const s = (orgSettings['customers'] as Record<string, unknown> | undefined) ?? {};
    if (typeof s['auto_password']   === 'boolean') setAutoPassword(s['auto_password']);
    if (typeof s['pass_sms']        === 'boolean') setPassSms(s['pass_sms']);
    if (typeof s['pass_email']      === 'boolean') setPassEmail(s['pass_email']);
    if (typeof s['include_app_link']=== 'boolean') setIncludeAppLink(s['include_app_link']);
    if (typeof s['auto_control']    === 'boolean') setAutoControl(s['auto_control']);
    if (typeof s['archive_weeks']   === 'number')  setArchiveWeeks(s['archive_weeks']);
    if (Array.isArray(s['bankid_staff']))           setBankIdStaff(s['bankid_staff'] as string[]);
    if (typeof s['blankett_text']   === 'string')  setBlankettText(s['blankett_text']);
  }, [orgSettings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        settings: {
          ...(orgSettings ?? {}),
          customers: {
            auto_password: autoPassword, pass_sms: passSms, pass_email: passEmail,
            include_app_link: includeAppLink, auto_control: autoControl,
            archive_weeks: archiveWeeks, bankid_staff: bankIdStaff, blankett_text: blankettText,
          },
        },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      toast({ title: 'Sparat', description: 'Kundinställningarna har sparats.' });
      void qc.invalidateQueries({ queryKey: ['org-settings-customers', orgId] });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  const save = () => saveMut.mutate();
  const isPending = saveMut.isPending;

  const filteredStaff = staffSearch
    ? staffList.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(staffSearch.toLowerCase()))
    : staffList;

  function toggleBankIdStaff(id: string) {
    setBankIdStaff(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div className="max-w-xl space-y-8">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Kundinställningar</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Users className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Kundinställningar</h1>
        <p className="text-sm text-muted-foreground">Hantera autoinställningar för användaren och registrering.</p>
      </div>

      <Section title="Kundinställningar">
        <p className="text-xs text-muted-foreground">Välj om du vill skicka ut ett lösenord till dina kunder automatiskt.</p>
        <CheckRow checked={autoPassword} onChange={setAutoPassword} label="Skicka lösenord automatiskt" />
        <p className="text-xs text-muted-foreground mt-2">Välj hur du vill leverera lösenordet till din kund när du skapar ett konto:</p>
        <CheckRow checked={passSms}   onChange={setPassSms}   label="SMS" />
        <CheckRow checked={passEmail} onChange={setPassEmail} label="E-post" />
        <p className="text-xs text-muted-foreground mt-2">Välj om du vill inkludera en länk för att ladda ner Teoricentralens mobilapp.</p>
        <CheckRow checked={includeAppLink} onChange={setIncludeAppLink} label="Inkludera en länk till appen i App Store / Google Play" />
        <SaveBtn onClick={save} isPending={isPending} />
      </Section>

      <Section title="Kontrollera kunder">
        <p className="text-xs text-muted-foreground">Välj om du vill att kunder ska försvinna från "nya kunder" när du slutför deras order.</p>
        <CheckRow checked={autoControl} onChange={setAutoControl} label="Kontrollera automatiskt" />
        <SaveBtn onClick={save} isPending={isPending} />
      </Section>

      <Section title="Konfigurera automatisk arkivering">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Endast kunder som uppfyller följande kriterier: de har inga utestående saldon, ingen aktiv behörighet,
          inga teoribehörigheter kopplade till sig, inga aktiverade bokningar samt inga framtida bokningar planerade.
          Ange hur många veckor systemet ska vänta innan det automatiserar dina kunder.
        </p>
        <input
          type="number"
          value={archiveWeeks}
          min={1}
          max={520}
          onChange={e => setArchiveWeeks(Number(e.target.value))}
          className="w-24 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <SaveBtn onClick={save} isPending={isPending} />
      </Section>

      <Section title="Notifikationer vid registrering med Mobilt BankID">
        <p className="text-xs text-muted-foreground">
          Vi kan skicka en notifikation när en kund registrerar sig med Mobilt BankID. Välj vilka i personalen som ska meddelas.
        </p>
        <input
          type="text"
          value={staffSearch}
          onChange={e => setStaffSearch(e.target.value)}
          placeholder="Sök efter personal..."
          className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50"
        />
        {filteredStaff.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ingen personal hittades.</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
            {filteredStaff.map(s => (
              <label key={s.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-accent/20">
                <input
                  type="checkbox"
                  checked={bankIdStaff.includes(s.id)}
                  onChange={() => toggleBankIdStaff(s.id)}
                  className="rounded border-border accent-primary w-4 h-4 shrink-0"
                />
                <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{s.first_name} {s.last_name}</p>
                  <p className="text-xs text-muted-foreground">{s.role}</p>
                </div>
              </label>
            ))}
          </div>
        )}
        <SaveBtn onClick={save} isPending={isPending} />
      </Section>

      <Section title="Innehåll i anmälningsblankett">
        <p className="text-xs text-muted-foreground">Här kan du fylla i textinnehåll till elevens anmälningsblankett.</p>
        <div className="rounded-md border border-border bg-background overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30 flex-wrap">
            {['↩', '↪', 'Paragraf', 'B', 'I', '❝', '≡', '⊞', '🔗', '⊕'].map((t, i) => (
              <button key={i} type="button" className={`px-2 py-1 text-xs rounded hover:bg-accent transition-colors text-muted-foreground ${i === 2 ? 'border border-border text-foreground' : ''}`}>{t}</button>
            ))}
          </div>
          <textarea rows={6} value={blankettText} onChange={e => setBlankettText(e.target.value)} className="w-full px-3 py-2 text-sm bg-background text-foreground resize-y focus:outline-none placeholder:text-muted-foreground/50" />
        </div>
        <SaveBtn onClick={save} isPending={isPending} />
      </Section>

      <Section title="Efterregistrera examinerade moment automatiskt">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <p className="text-xs text-foreground">
            Denna åtgärd kan bara göras <span className="font-bold text-destructive">EN GÅNG OCH ÄR PERMANENT.</span>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Denna funktion kommer att gå igenom tidligare bokningar på tidmallar som avser "Examinationsmoment" och
            skapa upp ett examinationsmoment för respektive elev baserat på dess status i närvaro-listan.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="destructive" onClick={save} disabled={isPending}>Stäng</Button>
            <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={save} disabled={isPending}>
              Efterregistrera automatiskt
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      {children}
    </div>
  );
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded border-border accent-primary w-4 h-4" />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function SaveBtn({ onClick, isPending }: { onClick: () => void; isPending: boolean }) {
  return (
    <div className="flex justify-end">
      <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={onClick} disabled={isPending}>
        {isPending ? 'Sparar…' : 'Spara'}
      </Button>
    </div>
  );
}
