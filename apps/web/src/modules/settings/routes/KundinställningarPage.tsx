import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';
import { Button } from '@platform/ui';

// ─── KundinställningarPage ────────────────────────────────────────────────────

export function KundinställningarPage() {
  // Section 1: Lösenord
  const [autoPassword,  setAutoPassword]  = useState(true);
  const [passSms,       setPassSms]       = useState(true);
  const [passEmail,     setPassEmail]     = useState(true);
  const [includeAppLink, setIncludeAppLink] = useState(false);

  // Section 2: Kontrollera kunder
  const [autoControl, setAutoControl] = useState(false);

  // Section 3: Automatisk arkivering
  const [archiveWeeks, setArchiveWeeks] = useState(26);

  // Section 4: BankID notifikationer
  const [bankIdSearch, setBankIdSearch] = useState('');

  // Section 5: Anmälningsblankett
  const [blankettText, setBlankettText] = useState('');

  function noop() { /* would call Supabase to persist org.settings */ }

  return (
    <div className="max-w-xl space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Kundinställningar</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Users className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Kundinställningar</h1>
        <p className="text-sm text-muted-foreground">Hantera autoinställningar för användaren och registrering.</p>
      </div>

      {/* ── Kundinställningar ────────────────────────────────────────────────── */}
      <Section title="Kundinställningar">
        <p className="text-xs text-muted-foreground">
          Välj om du vill skicka ut ett lösenord till dina kunder automatiskt.
        </p>
        <CheckRow checked={autoPassword} onChange={setAutoPassword} label="Skicka lösenord automatiskt" />

        <p className="text-xs text-muted-foreground mt-2">
          Välj hur du vill leverera lösenordet till din kund när du skapar ett konto:
        </p>
        <CheckRow checked={passSms}   onChange={setPassSms}   label="SMS" />
        <CheckRow checked={passEmail} onChange={setPassEmail} label="E-post" />

        <p className="text-xs text-muted-foreground mt-2">
          Välj om du vill inkludera en länk för att ladda ner Teoricentralens mobilapp.
        </p>
        <CheckRow
          checked={includeAppLink}
          onChange={setIncludeAppLink}
          label="Inkludera en länk till appen i App Store / Google Play"
        />
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Kontrollera kunder ───────────────────────────────────────────────── */}
      <Section title="Kontrollera kunder">
        <p className="text-xs text-muted-foreground">
          Välj om du vill att kunder ska försvinna från "nya kunder" när du slutför deras order.
        </p>
        <CheckRow checked={autoControl} onChange={setAutoControl} label="Kontrollera automatiskt" />
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Konfigurera automatisk arkivering ───────────────────────────────── */}
      <Section title="Konfigurera automatisk arkivering">
        <p className="text-xs text-muted-foreground">
          Endast kunder som uppfyller följande kriterier: de har inga utestående saldon, ingen aktiv behörighet,
          inga teoribehörigheter kopplade till sig, inga aktiverade bokningar samt inga framtida bokningar
          planerade. Ange hur många veckor systemet ska vänta innan det automatiserar dina kunder.
        </p>
        <input
          type="number"
          value={archiveWeeks}
          min={1}
          max={520}
          onChange={e => setArchiveWeeks(Number(e.target.value))}
          className="w-24 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Notifikationer vid registrering med Mobilt BankID ───────────────── */}
      <Section title="Notifikationer vid registrering med Mobilt BankID">
        <p className="text-xs text-muted-foreground">
          Vi kan skicka en notifikation när en kund registrerar sig med Mobilt BankID. Välj vilka i personalen
          som ska meddelas när någon har gjort en registrering med Mobilt BankID.
        </p>
        <div className="relative">
          <input
            type="text"
            value={bankIdSearch}
            onChange={e => setBankIdSearch(e.target.value)}
            placeholder="Sök efter personal..."
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50"
          />
        </div>
        {/* Hardcoded staff entry matching EMTECH screenshot */}
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Kameran Abdulmejid</p>
            <p className="text-xs text-muted-foreground">Ägare</p>
          </div>
        </div>
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Innehåll i anmälningsblankett ───────────────────────────────────── */}
      <Section title="Innehåll i anmälningsblankett">
        <p className="text-xs text-muted-foreground">
          Här kan du fylla i textinnehåll till elevens anmälningsblankett. Det här är det första utkaset.
        </p>
        <div className="rounded-md border border-border bg-background overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30 flex-wrap">
            {['↩', '↪', 'Paragraf', 'B', 'I', '❝', '≡', '⊞', '🔗', '⊕'].map((t, i) => (
              <button
                key={i}
                type="button"
                className={`px-2 py-1 text-xs rounded hover:bg-accent transition-colors text-muted-foreground ${
                  i === 2 ? 'border border-border text-foreground' : ''
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            rows={6}
            value={blankettText}
            onChange={e => setBlankettText(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-background text-foreground resize-y
                       focus:outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Efterregistrera examinerade moment automatiskt ───────────────────── */}
      <Section title="Efterregistrera examinerade moment automatiskt">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <p className="text-xs text-foreground">
            Denna åtgärd kan bara göras{' '}
            <span className="font-bold text-destructive">EN GÅNG OCH ÄR PERMANENT.</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Denna funktion kommer att gå igenom tidligare bokningar på tidmallar som avser "Examinationsmoment"
            och kommer skapa upp ett examinationsmoment för respektive elev baserat på dess status i när-variolistan.
          </p>
          <p className="text-xs text-muted-foreground">
            Detta betyder att alla tidmallar som avser examinerade-moment som ska efterregistreras behöver
            vara konfigurerade som examinerade och ha en tillhörande typ innan funktionen körs.
          </p>
          <p className="text-xs text-muted-foreground">
            Om du vill ha några examinerade-moment som ska efterregistreras kan du klicka på knappen "Stäng"
            för att ta bort funktionen.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="destructive" onClick={noop}>Stäng</Button>
            <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={noop}>
              Efterregistrera automatiskt
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-border accent-primary w-4 h-4"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function SaveBtn({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={onClick}>
        Spara
      </Button>
    </div>
  );
}
