import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Info } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BasAccount {
  account_code: string;
  account_name: string;
}

// ─── AccountSelect ────────────────────────────────────────────────────────────

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: BasAccount[];
  value:    string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm
                 focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
    >
      <option value="">Välj konto…</option>
      {accounts.map(a => (
        <option key={a.account_code} value={a.account_code}>
          {a.account_code} - {a.account_name}
        </option>
      ))}
    </select>
  );
}

// ─── AccountRow ───────────────────────────────────────────────────────────────

function AccountRow({
  label,
  accounts,
  value,
  onChange,
}: {
  label:    string;
  accounts: BasAccount[];
  value:    string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="flex-1 text-sm text-foreground">{label}</span>
      <div className="w-52 shrink-0">
        <AccountSelect accounts={accounts} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

function SectionCard({ title, colHeader, children }: { title: string; colHeader?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center px-5 py-3 border-b border-border bg-muted/30">
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {colHeader && <span className="w-52 text-xs font-semibold text-muted-foreground shrink-0">{colHeader}</span>}
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: Record<string, string> = {
  // Tillgångar
  kf_privat:              '1510',
  ej_fakt_momsfri:        '1790',
  ej_fakt_moms6:          '1790',
  ej_fakt_moms12:         '1790',
  ej_fakt_moms25:         '1790',
  // Eget kapital och skulder
  utg_moms6:              '2630',
  utg_moms12:             '2620',
  utg_moms25:             '2610',
  ing_moms:               '2641',
  forskott_momsfri:       '2420',
  forskott_moms6:         '2420',
  forskott_moms12:        '2420',
  forskott_moms25:        '2420',
  forskott_ospec:         '2422',
  // Betalningar
  pay_bank:               '1940',
  pay_kontant:            '1910',
  pay_kort:               '1930',
  pay_kreditkort:         '1930',
  pay_swish:              '1943',
  pay_bankgiro:           '1940',
  pay_presentkort:        '2421',
  pay_overforing_in:      '1940',
  pay_overforing_ut:      '1940',
  pay_tabs_swish:         '1943',
  pay_tabs_nets:          '1941',
  pay_billecta:           '1930',
  // Återbetalningar
  ret_bank:               '1940',
  ret_kontant:            '1910',
  ret_swish:              '1943',
  ret_kort:               '1930',
  ret_presentkort:        '2421',
  ret_tabs_swish:         '1943',
  ret_tabs_nets:          '1941',
  ret_bankgiro:           '1940',
};

// ─── BaskontaPage ─────────────────────────────────────────────────────────────

export function BaskontaPage() {
  const [vals, setVals]             = useState<Record<string, string>>(DEFAULTS);
  const [interval, setInterval]     = useState('monthly');
  const [bokforDay, setBokforDay]   = useState(2);
  const [kostStalle, setKostStalle] = useState('');

  const { data: accounts = [], isLoading } = useQuery<BasAccount[]>({
    queryKey: ['bas-account-catalog'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bas_account_catalog')
        .select('account_code, account_name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      return (data ?? []) as BasAccount[];
    },
    staleTime: 5 * 60_000,
  });

  function set(key: string) {
    return (v: string) => setVals(prev => ({ ...prev, [key]: v }));
  }

  function handleSave() { /* wire to org settings mutation */ }

  const todayStr = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  const nextMonthStr = nextMonth.toISOString().slice(0, 10);

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">Baskonton</span>
      </nav>

      {/* ── Bokföringsintervall ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Bokföringsintervall</h2>

        <div className="flex items-center gap-4">
          <select
            value={interval}
            onChange={e => setInterval(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
          >
            <option value="monthly">Varje månad</option>
            <option value="quarterly">Varje kvartal</option>
            <option value="yearly">Varje år</option>
          </select>

          {interval === 'monthly' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Föregående månad blir bokförd dag</span>
              <input
                type="number"
                min={1}
                max={28}
                value={bokforDay}
                onChange={e => setBokforDay(Number(e.target.value))}
                className="w-16 h-9 px-2 text-sm border border-border rounded-md bg-background text-foreground
                           focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
              />
              <span>i månaden</span>
            </div>
          )}
        </div>

        {/* Status bokföring table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status bokföring</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {[
                ['Datum för senaste bokföring', todayStr],
                ['Gällande regel', `Varje månad, Dag ${bokforDay}`],
                ['Nästa period', `${nextMonthStr} – …`],
                ['Nästa tidpunkt för generering av verifikat',
                  (() => { const d = new Date(); d.setMonth(d.getMonth() + 1, bokforDay); return d.toISOString().slice(0,10); })()],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td className="px-4 py-2.5 text-foreground font-medium">{label}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-right">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} className="bg-green-500 hover:bg-green-600 text-white">
            Spara
          </Button>
        </div>
      </div>

      {/* ── Kostnadsställe ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Kostnadsställe</h2>
        <input
          type="text"
          value={kostStalle}
          onChange={e => setKostStalle(e.target.value)}
          placeholder="Kostnadsställeref. (Exempel: ke12345)"
          className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50"
        />
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            Fältet är inte obligatoriskt, men om det anges kommer alla transaktioner nästa
            redovisningsperiod att kopplas till detta kostnadsställe och därmed att synas i SIE-filen.
            Endast ett kostnadsställe kan anges åt gången i TABS.
          </p>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} className="bg-green-500 hover:bg-green-600 text-white">
            Spara
          </Button>
        </div>
      </div>

      {/* ── Tillgångar ──────────────────────────────────────────────────────── */}
      <SectionCard title="Tillgångar" colHeader="Kontonummer">
        {([
          ['Kundfordringar',              'kf_privat'],
          ['Ej fakturerat (momsbefriad)', 'ej_fakt_momsfri'],
          ['Ej fakturerat (moms 6%)',     'ej_fakt_moms6'],
          ['Ej fakturerat (moms 12%)',    'ej_fakt_moms12'],
          ['Ej fakturerat (moms 25%)',    'ej_fakt_moms25'],
        ] as [string, string][]).map(([label, key]) => (
          <AccountRow key={key} label={label} accounts={accounts} value={vals[key] ?? ''} onChange={set(key)} />
        ))}
      </SectionCard>

      {/* ── Eget kapital och skulder ─────────────────────────────────────────── */}
      <SectionCard title="Eget kapital och skulder" colHeader="Kontonummer">
        {([
          ['Utgående moms 6%',                  'utg_moms6'],
          ['Utgående moms 12%',                 'utg_moms12'],
          ['Utgående moms 25%',                 'utg_moms25'],
          ['Ingående moms',                     'ing_moms'],
          ['Förskottsbetalning (momsbefriad)',   'forskott_momsfri'],
          ['Förskottsbetalning (moms 6%)',       'forskott_moms6'],
          ['Förskottsbetalning (moms 12%)',      'forskott_moms12'],
          ['Förskottsbetalning (moms 25%)',      'forskott_moms25'],
          ['Förskottsbetalning (ospecificerad)', 'forskott_ospec'],
        ] as [string, string][]).map(([label, key]) => (
          <AccountRow key={key} label={label} accounts={accounts} value={vals[key] ?? ''} onChange={set(key)} />
        ))}
      </SectionCard>

      {/* ── Betalningar ─────────────────────────────────────────────────────── */}
      <SectionCard title="Betalningar" colHeader="Kontonummer">
        {([
          ['Bank',              'pay_bank'],
          ['Kontant',           'pay_kontant'],
          ['Kort',              'pay_kort'],
          ['Kreditkort',        'pay_kreditkort'],
          ['Swish',             'pay_swish'],
          ['Bankgiro',          'pay_bankgiro'],
          ['Astra presentkort', 'pay_presentkort'],
          ['Överföring in',     'pay_overforing_in'],
          ['Överföring ut',     'pay_overforing_ut'],
          ['TABS Swish',        'pay_tabs_swish'],
          ['TABS Nets',         'pay_tabs_nets'],
          ['Billecta betalning','pay_billecta'],
        ] as [string, string][]).map(([label, key]) => (
          <AccountRow key={key} label={label} accounts={accounts} value={vals[key] ?? ''} onChange={set(key)} />
        ))}
      </SectionCard>

      {/* ── Återbetalningar ─────────────────────────────────────────────────── */}
      <SectionCard title="Återbetalningar" colHeader="Kontonummer">
        {([
          ['Återbetalning bank',             'ret_bank'],
          ['Återbetalning kontant',          'ret_kontant'],
          ['Återbetalning Swish',            'ret_swish'],
          ['Återbetalning kort',             'ret_kort'],
          ['Återbetalning Astra presentkort','ret_presentkort'],
          ['Återbetalning TABS Swish',       'ret_tabs_swish'],
          ['Återbetalning TABS Nets',        'ret_tabs_nets'],
          ['Återbetalning Bankgiro',         'ret_bankgiro'],
        ] as [string, string][]).map(([label, key]) => (
          <AccountRow key={key} label={label} accounts={accounts} value={vals[key] ?? ''} onChange={set(key)} />
        ))}
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="bg-green-500 hover:bg-green-600 text-white">
          Spara baskonton
        </Button>
      </div>
    </div>
  );
}
