import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Smartphone } from 'lucide-react';
import { Button } from '@platform/ui';

const OVA_LICENSES = [
  'B - Svenska', 'A - Svenska', 'BE - Svenska', 'B - العربية',
  'B - English', 'C1 - Svenska', 'C1E - Svenska', 'C - Svenska',
  'CE - Svenska', 'D - Svenska', 'YKB-Godstransporter - Svenska',
  'YKB-Persontransporter - Svenska', 'B - Pусский', 'Snöskoter - Svenska',
];

const PRODUCT_LICENSES = [
  'B-körkortet', 'AM-körkortet', 'A-körkortet', 'BE-körkortet',
  'C1-körkortet', 'C-körkortet', 'C1E-körkortet', 'CE-körkortet',
  'D1-körkortet', 'D-körkortet', 'D1E-körkortet', 'DE-körkortet',
  'YKB-C Godstransporter', 'YKB-D Persontransporter', 'Taxi', 'Snöskoter',
];

export function TeoricentralenPage() {
  const [modules, setModules] = useState({
    booking:      true,
    education:    true,
    directLink:   false,
    bankId:       false,
  });
  const [theoryValidity, setTheoryValidity] = useState(12);
  const [examThreshold,  setExamThreshold]  = useState(80);
  const [ovaThresholds,  setOvaThresholds]  = useState<Record<string, number>>(
    Object.fromEntries(OVA_LICENSES.map(l => [l, 0]))
  );
  const [products, setProducts] = useState<Record<string, string>>(
    Object.fromEntries(PRODUCT_LICENSES.map(l => [l, '']))
  );

  function toggleModule(key: keyof typeof modules) {
    setModules(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Teoricentralen</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center">
          <Smartphone className="w-7 h-7 text-teal-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Teoricentralen</h1>
          <p className="text-sm text-muted-foreground mt-1">Konfigurera moduler, tillstånd och teorimaterial</p>
        </div>
      </div>

      {/* Moduler */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Moduler</h2>
          <p className="text-xs text-muted-foreground mt-1">Välj vilka moduler som ska vara aktiva i elevportalen.</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          {(
            [
              { key: 'booking',    label: 'Bokningsmodul',                    desc: 'Låt elever boka lektioner direkt i elevportalen' },
              { key: 'education',  label: 'Utbildningsmodul',                 desc: 'Ger elever tillgång till teorimaterial och övningsprov' },
              { key: 'directLink', label: 'Direkt bokningslänk',              desc: 'Aktivera direktlänk för bokning utan inloggning' },
              { key: 'bankId',     label: 'Registrering med Mobilt BankID',   desc: 'Kräv BankID-verifiering vid elevregistrering' },
            ] as { key: keyof typeof modules; label: string; desc: string }[]
          ).map(({ key, label, desc }) => (
            <div key={key} className="flex items-start gap-3">
              <input
                id={`mod-${key}`}
                type="checkbox"
                checked={modules[key]}
                onChange={() => toggleModule(key)}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary"
              />
              <label htmlFor={`mod-${key}`} className="flex-1 cursor-pointer">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </label>
            </div>
          ))}
          <Button size="sm">Spara</Button>
        </div>
      </div>

      {/* Teorimaterial giltighetstid */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Digital teorimaterial - giltighetstid</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Antal månader som teorimaterialet är tillgängligt för eleven efter aktivering.
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={60}
              value={theoryValidity}
              onChange={e => setTheoryValidity(Number(e.target.value))}
              className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <span className="text-sm text-muted-foreground">månader</span>
          </div>
          <Button size="sm">Spara</Button>
        </div>
      </div>

      {/* Procentuellt tröskel på prov */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Procentuellt tröskel på prov</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Minsta procentandel rätt svar som krävs för att eleven ska godkännas på ett prov.
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={100}
              value={examThreshold}
              onChange={e => setExamThreshold(Number(e.target.value))}
              className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <Button size="sm">Spara</Button>
        </div>
      </div>

      {/* Procentuellt tröskel på Öva-delen */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Procentuellt tröskel på Öva-delen</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ange minsta procentandel rätt svar för varje körkortstyp och språk i Öva-läget.
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="space-y-2">
            {OVA_LICENSES.map(license => (
              <div key={license} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-foreground">{license}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={ovaThresholds[license] ?? 0}
                    onChange={e => setOvaThresholds(prev => ({ ...prev, [license]: Number(e.target.value) }))}
                    className="w-20 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground text-right"
                  />
                  <span className="text-sm text-muted-foreground w-4">%</span>
                </div>
              </div>
            ))}
          </div>
          <Button size="sm">Spara</Button>
        </div>
      </div>

      {/* Koppla teorimaterial till produkt */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Koppla teorimaterial till produkt</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Koppla varje körkortstyp till en produkt i ert produktregister. När en elev köper produkten
            får de automatiskt tillgång till teorimaterialet.
          </p>
        </div>
        <div className="px-5 py-4 space-y-2">
          {PRODUCT_LICENSES.map(license => (
            <div key={license} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-foreground">{license}</span>
              <select
                value={products[license] ?? ''}
                onChange={e => setProducts(prev => ({ ...prev, [license]: e.target.value }))}
                className="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Välj produkt...</option>
                <option value="p1">Paket B-körkort</option>
                <option value="p2">Teorimaterial B</option>
                <option value="p3">Teorimaterial A</option>
                <option value="p4">Teorimaterial C</option>
              </select>
            </div>
          ))}
          <div className="pt-2">
            <Button size="sm">Spara</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
