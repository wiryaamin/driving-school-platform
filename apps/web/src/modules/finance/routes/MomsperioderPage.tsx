import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Lock,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useVatPeriods,
  useVatPeriodEntries,
  useCreateVatPeriod,
  usePopulateVatPeriod,
  useLockVatPeriod,
  useVatRates,
  type VatPeriod,
  type VatPeriodFrequency,
  type VatReportEntry,
} from '../hooks/useSwedishVat.js';
import { formatDate, formatCurrency } from '../lib/financeUtils.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEK = (n: number | null | undefined) =>
  n == null ? '–' : formatCurrency(n, 'SEK');

function errorMessage(e: unknown): string {
  const msg = String(e);
  if (msg.includes('VAT_PERIOD_DUPLICATE'))     return 'En period med dessa datum finns redan.';
  if (msg.includes('VAT_PERIOD_INVALID_DATES')) return 'Slutdatum måste vara efter startdatum.';
  if (msg.includes('VAT_PERIOD_NOT_OPEN'))      return 'Perioden är inte öppen och kan inte populeras.';
  if (msg.includes('VAT_PERIOD_CANNOT_LOCK'))   return 'Perioden kan inte låsas i nuläget.';
  if (msg.includes('VAT_PERIOD_IMMUTABLE'))     return 'Låst period kan inte ändras.';
  return msg;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function VatStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open:      { label: 'Öppen',      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
    populated: { label: 'Populerad',  cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    locked:    { label: 'Låst',       cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
    filed:     { label: 'Inlämnad',   cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function freqLabel(f: string) {
  return f === 'quarterly' ? 'Kvartal' : 'Månad';
}

// ─── Create period dialog ─────────────────────────────────────────────────────

function CreatePeriodDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateVatPeriod();
  const [start,     setStart]     = useState('');
  const [end,       setEnd]       = useState('');
  const [frequency, setFrequency] = useState<VatPeriodFrequency>('monthly');

  async function handleSubmit() {
    if (!start || !end) return;
    try {
      await create.mutateAsync({ period_start: start, period_end: end, frequency });
      toast({ title: 'Momsperiod skapad' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: errorMessage(e), variant: 'destructive' });
    }
  }

  // Formats a Date using its LOCAL year/month/day — never .toISOString(),
  // which converts to UTC first and silently shifts the date backward by
  // one day for any positive UTC offset (all of Sweden's own timezone,
  // CET/CEST). That exact bug previously made "Denna månad" create a
  // period ending one day short of the real last day of the month.
  const toLocalDateString = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const monthStart = () => {
    const d = new Date();
    return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const monthEnd = () => {
    const d = new Date();
    return toLocalDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  };

  function prefillMonth() {
    setStart(monthStart());
    setEnd(monthEnd());
    setFrequency('monthly');
  }

  function prefillQuarter() {
    const d = new Date();
    const q  = Math.floor(d.getMonth() / 3);
    const qs = toLocalDateString(new Date(d.getFullYear(), q * 3, 1));
    const qe = toLocalDateString(new Date(d.getFullYear(), q * 3 + 3, 0));
    setStart(qs);
    setEnd(qe);
    setFrequency('quarterly');
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skapa momsperiod</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={prefillMonth}>Denna månad</Button>
            <Button size="sm" variant="outline" onClick={prefillQuarter}>Detta kvartal</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Startdatum</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Slutdatum</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Frekvens</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as VatPeriodFrequency)}
            >
              <option value="monthly">Månadsvis</option>
              <option value="quarterly">Kvartalsvis</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            disabled={!start || !end || create.isPending}
            onClick={() => void handleSubmit()}
          >
            Skapa period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lock period dialog ───────────────────────────────────────────────────────

function LockPeriodDialog({ period, onClose }: { period: VatPeriod; onClose: () => void }) {
  const lock = useLockVatPeriod();
  const [ref, setRef] = useState('');

  async function handleSubmit() {
    try {
      await lock.mutateAsync({ periodId: period.id, filingReference: ref.trim() || undefined });
      toast({ title: 'Momsperiod låst', description: ref.trim() ? `Referens: ${ref.trim()}` : undefined });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: errorMessage(e), variant: 'destructive' });
    }
  }

  const outputVat = period.output_vat_total ?? 0;
  const inputVat  = period.input_vat_total  ?? 0;
  const netVat    = period.net_vat_payable  ?? (outputVat - inputVat);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lås momsperiod</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Perioden {formatDate(period.period_start)} – {formatDate(period.period_end)} låses.
            Detta är oåterkalleligt.
          </p>

          <div className="grid grid-cols-3 gap-3 border rounded-lg p-3 bg-muted/30 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Utgående moms</p>
              <p className="font-mono font-semibold text-amber-700 dark:text-amber-400">{SEK(outputVat)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ingående moms</p>
              <p className="font-mono font-semibold text-green-700 dark:text-green-400">– {SEK(inputVat)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Att betala</p>
              <p className={`font-mono font-bold ${netVat > 0 ? 'text-destructive' : 'text-green-700'}`}>
                {SEK(netVat)}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Inlämningsreferens (valfri)</Label>
            <Input
              placeholder="t.ex. Skatteverket-referens eller kvittonummer"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Referensnummer från Skatteverket e-tjänst vid inlämning.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            disabled={lock.isPending}
            onClick={() => void handleSubmit()}
          >
            <Lock className="w-3.5 h-3.5 mr-1.5" />
            Lås period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Period entries table ─────────────────────────────────────────────────────

function EntriesTable({ periodId }: { periodId: string }) {
  const { data: entries = [], isLoading } = useVatPeriodEntries(periodId);

  const totalOutput = entries.reduce((s, e) => s + (e.output_vat_amount ?? 0), 0);
  const totalInput  = entries.reduce((s, e) => s + (e.input_vat_amount  ?? 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-1.5 mt-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6 border rounded-lg mt-3">
        Inga transaktionsposter. Klicka "Populera" för att hämta momstransaktioner.
      </p>
    );
  }

  return (
    <div className="mt-3 border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Datum</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Konto</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Beskrivning</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Brutto</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Utg. moms</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ing. moms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry: VatReportEntry) => (
              <tr key={entry.id} className="hover:bg-muted/20">
                <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(entry.transaction_date)}</td>
                <td className="px-3 py-1.5 font-mono">{entry.account_code ?? '–'}</td>
                <td className="px-3 py-1.5 max-w-[200px] truncate text-muted-foreground">
                  {entry.description ?? (entry.invoice_id
                    ? <Link to={`/finance/invoices/${entry.invoice_id}`} className="text-primary hover:underline font-mono">{entry.invoice_id.slice(0, 8)}…</Link>
                    : '–')}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(entry.gross_amount, 'SEK')}</td>
                <td className="px-3 py-1.5 text-right font-mono text-amber-700 dark:text-amber-400">
                  {entry.output_vat_amount ? formatCurrency(entry.output_vat_amount, 'SEK') : '–'}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-green-700 dark:text-green-400">
                  {entry.input_vat_amount ? formatCurrency(entry.input_vat_amount, 'SEK') : '–'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30 font-semibold">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-right text-xs">Summa</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-amber-700 dark:text-amber-400">
                {formatCurrency(totalOutput, 'SEK')}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-green-700 dark:text-green-400">
                {formatCurrency(totalInput, 'SEK')}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Period detail sheet ──────────────────────────────────────────────────────

function PeriodDetailSheet({ period: initialPeriod, onClose }: { period: VatPeriod; onClose: () => void }) {
  const populate = usePopulateVatPeriod();
  const [locking, setLocking] = useState(false);

  const isLocked    = initialPeriod.status === 'locked' || initialPeriod.status === 'filed';
  const isOpen      = initialPeriod.status === 'open';
  const isPopulated = initialPeriod.status === 'populated';

  const outputVat = initialPeriod.output_vat_total ?? 0;
  const inputVat  = initialPeriod.input_vat_total  ?? 0;
  const netVat    = initialPeriod.net_vat_payable  ?? (outputVat - inputVat);

  async function handlePopulate() {
    try {
      const result = await populate.mutateAsync(initialPeriod.id);
      toast({
        title:       'Period populerad',
        description: `${result.entries_inserted} momsposter importerade`,
      });
    } catch (e) {
      toast({ title: 'Fel', description: errorMessage(e), variant: 'destructive' });
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Momsperiod: {formatDate(initialPeriod.period_start)} – {formatDate(initialPeriod.period_end)}
            </DialogTitle>
          </DialogHeader>

          {/* Status + actions */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <VatStatusBadge status={initialPeriod.status} />
            <Badge variant="outline" className="text-xs">{freqLabel(initialPeriod.frequency)}</Badge>

            {(isOpen || isPopulated) && (
              <Button
                size="sm"
                variant="outline"
                disabled={populate.isPending}
                onClick={() => void handlePopulate()}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${populate.isPending ? 'animate-spin' : ''}`} />
                Populera
              </Button>
            )}
            {isPopulated && (
              <PermissionGate permission={Permissions.FINANCE_VAT_MANAGE}>
                <Button size="sm" onClick={() => setLocking(true)}>
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  Lås period
                </Button>
              </PermissionGate>
            )}
          </div>

          {/* VAT summary */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20">
              <p className="text-xs text-muted-foreground">Utgående moms</p>
              <p className="font-mono font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                {SEK(outputVat)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">BAS 2610–2650</p>
            </div>
            <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
              <p className="text-xs text-muted-foreground">Ingående moms</p>
              <p className="font-mono font-bold text-green-700 dark:text-green-400 mt-0.5">
                {SEK(inputVat)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">BAS 2640</p>
            </div>
            <div className={`border rounded-lg p-3 ${netVat > 0 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/30'}`}>
              <p className="text-xs text-muted-foreground">Att betala/erhålla</p>
              <p className={`font-mono font-bold mt-0.5 ${netVat > 0 ? 'text-destructive' : 'text-green-700 dark:text-green-400'}`}>
                {SEK(netVat)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {netVat > 0 ? 'Skatteskuld' : netVat < 0 ? 'Skattefordran' : 'Neutral'}
              </p>
            </div>
          </div>

          {/* Meta info */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {initialPeriod.entries_count != null && (
              <div>
                <p className="text-xs text-muted-foreground">Antal poster</p>
                <p className="font-medium">{initialPeriod.entries_count}</p>
              </div>
            )}
            {initialPeriod.locked_at && (
              <div>
                <p className="text-xs text-muted-foreground">Låst</p>
                <p className="font-medium">{formatDate(initialPeriod.locked_at)}</p>
              </div>
            )}
            {initialPeriod.filing_reference && (
              <div>
                <p className="text-xs text-muted-foreground">Inlämningsreferens</p>
                <p className="font-mono font-medium">{initialPeriod.filing_reference}</p>
              </div>
            )}
          </div>

          {isLocked && (
            <div className="mt-4 flex items-center gap-2 text-sm text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/50 rounded-lg px-3 py-2 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Perioden är låst och kan inte ändras.
            </div>
          )}

          {/* Transactions */}
          <div className="mt-5">
            <h3 className="text-sm font-semibold">Momstransaktioner</h3>
            <EntriesTable periodId={initialPeriod.id} />
          </div>
        </DialogContent>
      </Dialog>

      {locking && <LockPeriodDialog period={initialPeriod} onClose={() => setLocking(false)} />}
    </>
  );
}

// ─── Period row ───────────────────────────────────────────────────────────────

function PeriodRow({ period }: { period: VatPeriod }) {
  const [open, setOpen] = useState(false);
  const populate = usePopulateVatPeriod();

  const outputVat = period.output_vat_total ?? 0;
  const inputVat  = period.input_vat_total  ?? 0;
  const netVat    = period.net_vat_payable  ?? (outputVat - inputVat);
  const isLocked  = period.status === 'locked' || period.status === 'filed';

  async function handlePopulate(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const result = await populate.mutateAsync(period.id);
      toast({ title: 'Period populerad', description: `${result.entries_inserted} poster importerade` });
    } catch (err) {
      toast({ title: 'Fel', description: errorMessage(err), variant: 'destructive' });
    }
  }

  return (
    <>
      <button
        className="w-full text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between px-6 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {formatDate(period.period_start)} – {formatDate(period.period_end)}
                </span>
                <VatStatusBadge status={period.status} />
                <span className="text-xs text-muted-foreground">{freqLabel(period.frequency)}</span>
              </div>
              {isLocked && period.filing_reference && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ref: {period.filing_reference}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-mono font-semibold">
                {netVat !== 0 ? SEK(netVat) : '–'}
              </p>
              <p className="text-xs text-muted-foreground">Att betala</p>
            </div>
            {period.status === 'open' && (
              <Button
                size="sm"
                variant="outline"
                disabled={populate.isPending}
                onClick={(e) => void handlePopulate(e)}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${populate.isPending ? 'animate-spin' : ''}`} />
                Populera
              </Button>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </button>
      {open && <PeriodDetailSheet period={period} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MomsperioderPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [creating,     setCreating]     = useState(false);

  const { data: periods = [], isLoading } = useVatPeriods(statusFilter || undefined);
  const { data: rates   = [] }            = useVatRates();

  const openCount      = periods.filter((p) => p.status === 'open').length;
  const populatedCount = periods.filter((p) => p.status === 'populated').length;
  const lockedCount    = periods.filter((p) => p.status === 'locked' || p.status === 'filed').length;

  const totalNetVat = periods
    .filter((p) => p.status === 'populated')
    .reduce((s, p) => s + (p.net_vat_payable ?? 0), 0);

  return (
    <PageLayout fullBleed>
      <PageHeader
        description="Hantera momsredovisning och momsperioder för Skatteverket"
        actions={
          <PermissionGate permission={Permissions.FINANCE_VAT_MANAGE}>
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Ny period
            </Button>
          </PermissionGate>
        }
      />

      <PageContent>
        <SubscriptionGate feature="finance:vat:report">
        <PermissionGate permission={Permissions.FINANCE_VAT_READ}>
          <div className="space-y-6">

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    Öppna perioder
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{isLoading ? '…' : openCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Att rapportera
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${populatedCount > 0 ? 'text-amber-600' : ''}`}>
                    {isLoading ? '…' : populatedCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Populerade, ej låsta</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-green-500" />
                    Inlämnade
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{isLoading ? '…' : lockedCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Moms att betala</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold font-mono ${totalNetVat > 0 ? 'text-destructive' : 'text-green-600'}`}>
                    {isLoading ? '…' : SEK(totalNetVat)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Populerade perioder</p>
                </CardContent>
              </Card>
            </div>

            {/* VAT rates reference */}
            {rates.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Momssatser</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 flex-wrap text-sm">
                    {rates.map((r) => (
                      <div key={r.id} className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-foreground">{r.rate_percent} %</span>
                        <span className="text-muted-foreground">{r.rate_name}</span>
                        {r.bas_output_account && (
                          <span className="text-xs text-muted-foreground font-mono">({r.bas_output_account})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filter */}
            <div className="flex items-center gap-3">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Alla perioder</option>
                <option value="open">Öppna</option>
                <option value="populated">Populerade</option>
                <option value="locked">Låsta</option>
                <option value="filed">Inlämnade</option>
              </select>
            </div>

            {/* Periods list */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="px-6 py-4 space-y-3">
                    {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted rounded animate-pulse" />)}
                  </div>
                ) : periods.length === 0 ? (
                  <div className="px-6 py-10 text-center space-y-2">
                    <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
                    <p className="text-sm font-medium">Inga momsperioder</p>
                    <p className="text-xs text-muted-foreground">
                      Skapa din första momsperiod för att börja redovisa moms.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {periods.map((p) => <PeriodRow key={p.id} period={p} />)}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </PermissionGate>
        </SubscriptionGate>
      </PageContent>

      {creating && <CreatePeriodDialog onClose={() => setCreating(false)} />}
    </PageLayout>
  );
}
