import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ImageIcon, Upload } from 'lucide-react';
import { Button } from '@platform/ui';

const inputCls = 'w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';
const textareaCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring';

// ─── KassaSettingsPage ────────────────────────────────────────────────────────

export function KassaSettingsPage() {
  const [autoKontantfaktura, setAutoKontantfaktura] = useState(false);
  const [gästköp, setGästköp]                       = useState(true);
  const [kvittotext, setKvittotext]                  = useState('');
  const [autoDebitering, setAutoDebitering]           = useState(false);

  // ── Faktureringsavgift ──────────────────────────────────────────────────────
  const [swishFee,    setSwishFee]    = useState(0);
  const [billectaFee, setBillectaFee] = useState(0);

  // ── Standard förfallodatum ──────────────────────────────────────────────────
  const [payTermsDays, setPayTermsDays] = useState(10);

  // ── Billecta / Kivra ────────────────────────────────────────────────────────
  const [kivra, setKivra] = useState('inactive');

  // ── Standardtext på faktura ─────────────────────────────────────────────────
  const [textSwish,       setTextSwish]       = useState('');
  const [textBillecta,    setTextBillecta]    = useState('');
  const [textPaminnelse,  setTextPaminnelse]  = useState('');
  const [textInkasso,     setTextInkasso]     = useState('');
  const [textKredit,      setTextKredit]      = useState('');
  const [textKontoutdrag, setTextKontoutdrag] = useState('');
  const [textBekraftelse, setTextBekraftelse] = useState('');
  const [textAconto,      setTextAconto]      = useState('');
  const [textKontant,     setTextKontant]     = useState('');

  function stub() { /* wire to org settings mutation */ }

  return (
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + feedback */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/finance/accounts" className="hover:text-foreground">Ekonomi</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Kassa</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
          <span className="text-2xl">💳</span>
        </div>
        <h1 className="text-lg font-semibold text-foreground">Kassa</h1>
        <p className="text-sm text-muted-foreground">Hantera kassainställningar, fakturor och betalningar.</p>
      </div>

      {/* Kontantfakturor */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Kontantfakturor</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automatisk utskick av{' '}
            <span className="text-primary underline cursor-pointer">kontantfakturor</span> efter köp.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={autoKontantfaktura}
            onChange={e => setAutoKontantfaktura(e.target.checked)}
            className="rounded border-border"
          />
          Skicka kontantfakturor automatiskt efter köp
        </label>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">
            Spara
          </Button>
        </div>
      </div>

      {/* Gästköp */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Gästköp i kassan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Aktivera eller inaktivera möjligheten för gästköp.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={gästköp}
            onChange={e => setGästköp(e.target.checked)}
            className="rounded border-border accent-primary"
          />
          Tillåt gästköp i kassan
        </label>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">
            Spara
          </Button>
        </div>
      </div>

      {/* Fakturalogotyp */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Fakturalogotyp</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Ladda upp din egen logotyp för att visas på dina fakturor.</p>
        </div>
        {/* Current logo placeholder */}
        <div className="w-16 h-16 rounded-md border border-border bg-muted flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
        </div>
        {/* Upload zone */}
        <div className="border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground cursor-pointer hover:bg-accent/20 transition-colors">
          <Upload className="w-6 h-6" />
          <p className="text-sm">Klicka för att ladda upp logotyp</p>
          <p className="text-xs">Maximal filstorlek att ladda upp är 2 megabyte.</p>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">
            Spara
          </Button>
        </div>
      </div>

      {/* Kvittotext */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Kvittotext</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Här har du möjlighet att skriva en text som visas på alla dina kvitton / kreditkvitto.
          </p>
        </div>
        <textarea
          value={kvittotext}
          onChange={e => setKvittotext(e.target.value)}
          maxLength={255}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none
                     focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">Max 255 tecken.</p>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">
            Spara
          </Button>
        </div>
      </div>

      {/* Automatisk debitering */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Automatisk debitering</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Teoricentralen kan automatiskt debitera dina bokningar varje dag. Varje dag klockan 22:00 går
            systemet igenom dagens bokningar och debiterar kunder mot lektionssaldo. Om en kund saknar
            täckning skapas en order och kunden debiteras mot elevsaldo.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={autoDebitering}
            onChange={e => setAutoDebitering(e.target.checked)}
            className="rounded border-border"
          />
          Slå igång automatisk debitering
        </label>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">
            Spara
          </Button>
        </div>
      </div>

      {/* ── Faktureringsavgift ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Faktureringsavgift</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            "Automatisk avgift" anger om avgiften ska läggas till som standard på fakturor.
          </p>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-2 border-b border-border bg-muted/30">
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">Fakturatyp</div>
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">Faktureringsavgift</div>
          </div>
          {[
            ['Swish-faktura',    swishFee,    setSwishFee   ],
            ['Billecta-faktura', billectaFee, setBillectaFee],
          ].map(([label, val, setVal]) => (
            <div key={String(label)} className="grid grid-cols-2 border-b border-border last:border-0">
              <div className="px-4 py-3 text-sm text-foreground">{String(label)}</div>
              <div className="px-4 py-2">
                <input
                  type="number"
                  value={Number(val)}
                  onChange={e => (setVal as (v: number) => void)(Number(e.target.value))}
                  min={0}
                  className="w-full h-8 px-3 text-sm border border-border rounded bg-background text-foreground
                             focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>

      {/* ── Standard förfallodatum ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Standard förfallodatum</h2>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Betalningsvillkor (dagar)</label>
          <input
            type="number"
            value={payTermsDays}
            onChange={e => setPayTermsDays(Number(e.target.value))}
            min={0}
            max={365}
            className="w-28 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>

      {/* ── Billecta / Kivra ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Billecta / Kivra</h2>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Kivra som leveransalternativ</label>
          <select
            value={kivra}
            onChange={e => setKivra(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
          >
            <option value="inactive">- Inte aktiverad -</option>
            <option value="optional">Valfritt (eleven väljer)</option>
            <option value="default">Standard (aktiverat som standard)</option>
          </select>
        </div>
        {kivra !== 'inactive' && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            Observera att Kivra måste aktiveras hos Billecta för ditt företag innan du väljer att aktivera detta som ett leveransalternativ.
          </div>
        )}
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>

      {/* ── Standardtext på faktura ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Standardtext på faktura, kreditfaktura m.m.</h2>
        <div className="grid grid-cols-2 gap-4">
          {([
            ['Faktura (Swish):',       textSwish,       setTextSwish],
            ['Faktura (Billecta):',    textBillecta,    setTextBillecta],
            ['Påminnelse:',            textPaminnelse,  setTextPaminnelse],
            ['Inkassokrav:',           textInkasso,     setTextInkasso],
            ['Kreditfaktura:',         textKredit,      setTextKredit],
            ['Kontoutdrag:',           textKontoutdrag, setTextKontoutdrag],
            ['Betalningsbekräftelse:', textBekraftelse, setTextBekraftelse],
            ['A-conto:',               textAconto,      setTextAconto],
            ['Kontantfaktura:',        textKontant,     setTextKontant],
          ] as [string, string, (v: string) => void][]).map(([label, val, setVal]) => (
            <div key={label} className="space-y-1">
              <label className="text-xs font-medium text-foreground">{label}</label>
              <textarea
                value={val}
                onChange={e => setVal(e.target.value)}
                rows={3}
                className={textareaCls}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>
    </div>
  );
}
