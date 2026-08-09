import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Info, CheckCircle2 } from 'lucide-react';
import { Button, Skeleton, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';

// ─── Types ────────────────────────────────────────────────────────────────────
//
// These event_type keys are read live by the posting engine via
// resolve_org_bas_account() — see supabase/migrations/20260724000006,
// 20260724000008, 20260724000009. Every value saved here genuinely changes
// where transactions post.
//
// Kundfordringar (AR/1510), utgående moms 25% (2610), and förutbetalda
// intäkter (2970) are NOT configurable here — a full finance-domain impact
// analysis found financial close, audit snapshots, bank reconciliation, and
// VAT clearing all assume those exact codes for balance verification.
// Remapping them would silently break those checks. They stay platform-fixed.

interface BasAccount { account_code: string; account_name: string; }

interface ChartOfAccountsRow {
  event_type:     string;
  account_debit:  string;
  account_credit: string;
}

const EVENT_TYPES: { key: string; label: string; help?: string }[] = [
  { key: 'Revenue.Direct', label: 'Intäkt — direktfakturering', help: 'Fakturor som inte avser paketköp.' },
];

const PAYMENT_EVENT_TYPES: { key: string; label: string }[] = [
  { key: 'Payment.Cash.bank_transfer', label: 'Banköverföring (BankGiro/PlusGiro)' },
  { key: 'Payment.Cash.swish',         label: 'Swish' },
  { key: 'Payment.Cash.card',          label: 'Kortbetalning' },
  { key: 'Payment.Cash.stripe',        label: 'Stripe' },
  { key: 'Payment.Cash.manual',        label: 'Manuell registrering' },
  { key: 'Payment.Cash.default',       label: 'Övrig/okänd betalmetod (standard)' },
];

const PAYROLL_EVENT_TYPES: { key: string; label: string; help?: string }[] = [
  { key: 'Payroll.Salary',                   label: 'Lön (bruttolön)' },
  { key: 'Payroll.EmployerContribExpense',   label: 'Sociala avgifter (kostnad)' },
  { key: 'Payroll.WithheldTaxLiability',     label: 'Personalskatt (skuld)' },
  { key: 'Payroll.EmployerContribLiability', label: 'Sociala avgifter (skuld)' },
  { key: 'Payroll.AccruedSalary',            label: 'Upplupna löner (nettolön)' },
  { key: 'Tax.ClearingAccount',              label: 'Avräkning för skatter och avgifter' },
  { key: 'Treasury.BankAccount',             label: 'Huvudkonto — löne- och skatteutbetalningar' },
];

function AccountSelect({ accounts, value, onChange, disabled }: { accounts: BasAccount[]; value: string; onChange: (v: string) => void; disabled?: boolean | undefined }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground disabled:opacity-50"
    >
      <option value="">Välj konto…</option>
      {accounts.map(a => <option key={a.account_code} value={a.account_code}>{a.account_code} - {a.account_name}</option>)}
    </select>
  );
}

function AccountRow({ label, help, accounts, value, onChange, disabled }: {
  label: string; help?: string | undefined; accounts: BasAccount[]; value: string; onChange: (v: string) => void; disabled?: boolean | undefined;
}) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-border/50 last:border-0">
      <div className="flex-1">
        <span className="text-sm text-foreground">{label}</span>
        {help && <p className="text-xs text-muted-foreground mt-0.5">{help}</p>}
      </div>
      <div className="w-52 shrink-0"><AccountSelect accounts={accounts} value={value} onChange={onChange} disabled={disabled} /></div>
    </div>
  );
}

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

export function BaskontaPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [vals,       setVals]       = useState<Record<string, string>>({});
  const [interval,   setInterval]   = useState('monthly');
  const [bokforDay,  setBokforDay]  = useState(2);
  const [kostStalle, setKostStalle] = useState('');

  const { data: accounts = [], isLoading: catalogLoading } = useQuery<BasAccount[]>({
    queryKey: ['bas-account-catalog'],
    queryFn: async () => {
      const { data } = await supabase.from('bas_account_catalog').select('account_code, account_name').eq('is_active', true).order('sort_order', { ascending: true });
      return (data ?? []) as BasAccount[];
    },
    staleTime: 5 * 60_000,
  });

  // Tenant's live account mappings — the actual posting-engine source of truth.
  const { data: mappings = [], isLoading: mappingsLoading } = useQuery<ChartOfAccountsRow[]>({
    queryKey: ['org-chart-of-accounts', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('accounting_chart_of_accounts')
        .select('event_type, account_debit, account_credit')
        .eq('organization_id', orgId)
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []) as ChartOfAccountsRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const m of mappings) next[m.event_type] = m.account_debit;
    setVals(next);
  }, [mappings]);

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-baskon', orgId],
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
    const s = (orgSettings['bas_interval'] as Record<string, unknown> | undefined) ?? {};
    if (typeof s['interval']    === 'string') setInterval(s['interval']);
    if (typeof s['bokfor_day']  === 'number') setBokforDay(s['bokfor_day']);
    if (typeof s['kost_stelle'] === 'string') setKostStalle(s['kost_stelle']);
  }, [orgSettings]);

  const saveIntervalMut = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        settings: { ...(orgSettings ?? {}), bas_interval: { interval, bokfor_day: bokforDay, kost_stelle: kostStalle } },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      toast({ title: 'Sparat' });
      void qc.invalidateQueries({ queryKey: ['org-settings-baskon', orgId] });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  // Saves one event_type -> account mapping directly to the live posting
  // source of truth. account_debit = account_credit by the single-account
  // convention documented in resolve_org_bas_account().
  const saveMapping = useMutation({
    mutationFn: async ({ eventType, code }: { eventType: string; code: string }) => {
      if (!orgId || !code) return;
      const { error } = await supabase.from('accounting_chart_of_accounts').upsert({
        organization_id: orgId,
        event_type:       eventType,
        account_debit:    code,
        account_credit:   code,
        is_active:        true,
      } as never, { onConflict: 'organization_id,event_type' });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['org-chart-of-accounts', orgId] });
      toast({ title: 'Kontot sparades', description: 'Ändringen används direkt av bokföringsmotorn.' });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  function set(key: string) {
    return (v: string) => {
      setVals(prev => ({ ...prev, [key]: v }));
      saveMapping.mutate({ eventType: key, code: v });
    };
  }

  const isLoading = catalogLoading || mappingsLoading;

  if (isLoading) {
    return <div className="max-w-2xl space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
  }

  return (
    <PermissionGate permission={Permissions.FINANCE_BAS_MANAGE}>
    <div className="max-w-2xl space-y-4">
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">Baskonton</span>
      </nav>

      <div className="flex items-start gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
        <p className="text-xs text-green-800 dark:text-green-300 leading-relaxed">
          Kontona nedan används direkt av bokföringsmotorn vid fakturering, betalningsregistrering
          och lönekörning — ändringar tillämpas omedelbart på nya bokföringar.
        </p>
      </div>

      {/* Bokföringsintervall */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Bokföringsintervall</h2>
        <p className="text-xs text-muted-foreground -mt-2">
          Inte kopplat till den verkliga momsperiodhanteringen (vat_periods) ännu — sparas för närvarande separat.
        </p>
        <div className="flex items-center gap-4">
          <select value={interval} onChange={e => setInterval(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground">
            <option value="monthly">Varje månad</option>
            <option value="quarterly">Varje kvartal</option>
            <option value="yearly">Varje år</option>
          </select>
          {interval === 'monthly' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Föregående månad blir bokförd dag</span>
              <input type="number" min={1} max={28} value={bokforDay} onChange={e => setBokforDay(Number(e.target.value))} className="w-16 h-9 px-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-center" />
              <span>i månaden</span>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveIntervalMut.mutate()} disabled={saveIntervalMut.isPending} className="bg-green-500 hover:bg-green-600 text-white">
            {saveIntervalMut.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      {/* Kostnadsställe */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Kostnadsställe</h2>
        <input type="text" value={kostStalle} onChange={e => setKostStalle(e.target.value)} placeholder="Kostnadsställeref. (Exempel: ke12345)" className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50" />
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">Fältet är inte obligatoriskt, men om det anges kommer alla transaktioner nästa redovisningsperiod att kopplas till detta kostnadsställe och därmed att synas i SIE-filen. Endast ett kostnadsställe kan anges åt gången i TABS.</p>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveIntervalMut.mutate()} disabled={saveIntervalMut.isPending} className="bg-green-500 hover:bg-green-600 text-white">
            {saveIntervalMut.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      <SectionCard title="Fakturering" colHeader="Kontonummer">
        {EVENT_TYPES.map(({ key, label, help }) => (
          <AccountRow key={key} label={label} help={help} accounts={accounts} value={vals[key] ?? ''} onChange={set(key)} disabled={saveMapping.isPending} />
        ))}
      </SectionCard>

      <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border p-3">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Kundfordringar (1510), utgående moms 25% (2610) och förutbetalda intäkter vid paketköp (2970)
          är plattformsstyrda och går inte att ändra här — bokslut, avstämningar och momsredovisning
          förutsätter dessa exakta konton för att räkna rätt.
        </p>
      </div>

      <SectionCard title="Betalningar — konto per betalmetod" colHeader="Kontonummer">
        {PAYMENT_EVENT_TYPES.map(({ key, label }) => (
          <AccountRow key={key} label={label} accounts={accounts} value={vals[key] ?? ''} onChange={set(key)} disabled={saveMapping.isPending} />
        ))}
      </SectionCard>

      <SectionCard title="Löner & skatt" colHeader="Kontonummer">
        {PAYROLL_EVENT_TYPES.map(({ key, label, help }) => (
          <AccountRow key={key} label={label} help={help} accounts={accounts} value={vals[key] ?? ''} onChange={set(key)} disabled={saveMapping.isPending} />
        ))}
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        Återbetalningar och momsavräkning (utgående moms 12/6%, ingående moms, momsredovisningskonto)
        bokförs ännu inte mot tenant-konfigurerade konton — det hanteras i en kommande version.
      </p>
    </div>
    </PermissionGate>
  );
}
