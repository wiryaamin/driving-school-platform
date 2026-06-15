import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Settings, ImageIcon, Upload } from 'lucide-react';
import { Button } from '@platform/ui';

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, desc }: {
  checked:  boolean;
  onChange: (v: boolean) => void;
  label:    string;
  desc?:    string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors mt-0.5 ${checked ? 'bg-primary' : 'bg-input'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

const inputCls = 'w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';

export function SysteminställningarPage() {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const [bankId,           setBankId]           = useState(false);

  // ── Search ───────────────────────────────────────────────────────────────────
  const [crossDeptSearch,  setCrossDeptSearch]  = useState(false);

  // ── Sales & payments ──────────────────────────────────────────────────────────
  const [lockDays,         setLockDays]         = useState(90);
  const [allowPayDate,     setAllowPayDate]     = useState(false);
  const [editPriceRole,    setEditPriceRole]    = useState('all');
  const [creditRole,       setCreditRole]       = useState('all');
  const [afternoonTime,    setAfternoonTime]    = useState('16:00');

  // ── Logo ─────────────────────────────────────────────────────────────────────
  const [logoFile,         setLogoFile]         = useState<File | null>(null);

  // ── Credit limit ─────────────────────────────────────────────────────────────
  const [creditLimit,      setCreditLimit]      = useState(0);
  const [blockSalesOver,   setBlockSalesOver]   = useState(false);

  function stub() { /* wire to org settings mutation */ }

  const roleOpts = [
    { value: 'all',    label: 'Alla' },
    { value: 'admin',  label: 'Administratörer' },
    { value: 'owner',  label: 'Ägare' },
  ];

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Systeminställningar</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <Settings className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Systeminställningar</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera systeminställningar för inloggning och säkerhet.</p>
        </div>
      </div>

      {/* ── Inloggning ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Inloggning</h2>
        <Toggle
          checked={bankId}
          onChange={setBankId}
          label="Mobilt BankID för personal"
          desc="Tillåt personalen att logga in med Mobilt BankID istället för e-post och lösenord. Kräver att personnummer är korrekt registrerat."
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>

      {/* ── Sök ─────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Sök efter student/företag</h2>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={crossDeptSearch}
            onChange={e => setCrossDeptSearch(e.target.checked)}
            className="rounded border-border accent-primary w-4 h-4 mt-0.5 shrink-0"
          />
          <span className="text-sm text-foreground">Aktivera elev- och företagssökningar över avdelningar</span>
        </label>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>

      {/* ── Inställningar för försäljning och betalningar ────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Inställningar för försäljning och betalningar</h2>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Lås redigering av anställda och resurstimmar på försäljning/aktiviteter äldre än:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={lockDays}
              onChange={e => setLockDays(Number(e.target.value))}
              min={0}
              max={365}
              className="w-20 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
            />
            <span className="text-sm text-muted-foreground">dagar</span>
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={allowPayDate}
            onChange={e => setAllowPayDate(e.target.checked)}
            className="rounded border-border accent-primary w-4 h-4 mt-0.5 shrink-0"
          />
          <span className="text-sm text-foreground">Kan ställa in betalningsdatum vid registrering av betalning</span>
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Användare som kan redigera pris, rabatter, anställdas timmar och kreditgräns:
          </label>
          <p className="text-xs text-muted-foreground">
            Kunna ändra pris, lägga in rabatt, ändra anställd- och resurstimmar på lektioner och elevens kreditgräns.
          </p>
          <select
            value={editPriceRole}
            onChange={e => setEditPriceRole(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
          >
            {roleOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Användare som kan registrera krediteringar:
          </label>
          <p className="text-xs text-muted-foreground">
            Kunna registrera krediteringar (rättelse, rabatt, kom ej etc.) på lektioner/kursartiklar och direkt på elevkonto.
          </p>
          <select
            value={creditRole}
            onChange={e => setCreditRole(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
          >
            {roleOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>

      {/* ── Eftermiddagspris ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Eftermiddagspris</h2>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Eftermiddagspris efter kl.:</label>
          <input
            type="time"
            value={afternoonTime}
            onChange={e => setAfternoonTime(e.target.value)}
            className="h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>

      {/* ── Logotyp ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Logotyp</h2>
        {logoFile ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
            <span className="text-sm text-foreground flex-1 truncate">{logoFile.name}</span>
            <button
              type="button"
              onClick={() => setLogoFile(null)}
              className="text-xs text-destructive hover:underline shrink-0"
            >
              Ta bort
            </button>
          </div>
        ) : (
          <label className="cursor-pointer block">
            <div className="border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground hover:bg-accent/20 transition-colors">
              <Upload className="w-6 h-6" />
              <p className="text-sm font-medium">Ladda upp ny logotyp</p>
              <p className="text-xs">Maximal filstorlek 2 MB</p>
            </div>
            <input
              type="file"
              className="sr-only"
              accept="image/*"
              onChange={e => { const f = e.target.files?.[0]; if (f) setLogoFile(f); }}
            />
          </label>
        )}
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>

      {/* ── Kreditgräns ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Kreditgräns</h2>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Standardkreditgräns för nya elever</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={creditLimit}
              onChange={e => setCreditLimit(Number(e.target.value))}
              min={0}
              className="w-28 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
            />
            <span className="text-sm text-muted-foreground">kr</span>
          </div>
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={blockSalesOver}
            onChange={e => setBlockSalesOver(e.target.checked)}
            className="rounded border-border accent-primary w-4 h-4 mt-0.5 shrink-0"
          />
          <span className="text-sm text-foreground">
            Tillåt inte försäljning till elever som har överskridit kreditgränsen
          </span>
        </label>
        <div className="flex justify-end">
          <Button size="sm" onClick={stub} className="bg-green-500 hover:bg-green-600 text-white">Spara</Button>
        </div>
      </div>
    </div>
  );
}
