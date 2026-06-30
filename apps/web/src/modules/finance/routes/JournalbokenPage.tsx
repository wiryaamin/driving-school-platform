import { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Download,
  FileCheck,
  RefreshCw,
  RotateCcw,
  XCircle,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useFinancialPeriods } from '../hooks/useReconciliation.js';
import {
  useJournalEntries,
  useJournalEntry,
  useTrialBalance,
  useLedgerSIE4Exports,
  useReverseJournalEntry,
  useGenerateLedgerSIE4,
  type JournalEntry,
  type JournalEntryType,
  type LedgerSIE4Export,
  type TrialBalanceRow,
} from '../hooks/useLedger.js';
import { formatDate, formatDateTime, formatCurrency } from '../lib/financeUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEK = (n: number | null | undefined) =>
  n == null ? '–' : formatCurrency(n, 'SEK');

function entryTypeLabel(t: JournalEntryType | string): string {
  const map: Record<string, string> = {
    invoice_posted:    'Faktura',
    payment_posted:    'Betalning',
    void_posted:       'Makulering',
    deferred_revenue:  'Uppskjuten intäkt',
    lesson_recognized: 'Intäktsföring',
    depreciation:      'Avskrivning',
    payroll:           'Lön',
    manual:            'Manuell',
    reversal:          'Återföring',
    correction:        'Korrigering',
  };
  return map[t] ?? t;
}

function entryTypeAccountTypeClass(t: string): string {
  const map: Record<string, string> = {
    invoice_posted:    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    payment_posted:    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    void_posted:       'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    deferred_revenue:  'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    lesson_recognized: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    depreciation:      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    payroll:           'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    manual:            'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300',
    reversal:          'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    correction:        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  };
  return map[t] ?? 'bg-gray-100 text-gray-700';
}

function EntryTypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${entryTypeAccountTypeClass(type)}`}>
      {entryTypeLabel(type)}
    </span>
  );
}

function EntryStatusBadge({ status }: { status: string }) {
  return status === 'reversed' ? (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400">
      <XCircle className="w-2.5 h-2.5" />
      Återförd
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
      <CheckCircle2 className="w-2.5 h-2.5" />
      Bokförd
    </span>
  );
}

// ─── Reverse dialog ───────────────────────────────────────────────────────────

function ReverseDialog({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const reverse = useReverseJournalEntry();
  const [date,   setDate]   = useState('');
  const [reason, setReason] = useState('');

  async function handleSubmit() {
    try {
      const result = await reverse.mutateAsync({
        entryId:      entry.id,
        reversalDate: date || undefined,
        reason:       reason.trim() || undefined,
      });
      toast({
        title:       'Verifikat återfört',
        description: `Nytt verifikat: ${result.reversal_entry_id.slice(0, 8)}…`,
      });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  const voucherLabel = entry.voucher_series
    ? `${entry.voucher_series}${entry.voucher_number ?? ''}`
    : entry.id.slice(0, 8) + '…';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Återför verifikat {voucherLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            En motbokning skapas som nollställer alla rader. Operationen är oåterkallelig.
          </p>
          <div className="border rounded-lg p-3 bg-muted/30 text-sm">
            <p className="text-muted-foreground mb-0.5">Verifikat</p>
            <p className="font-medium">{entry.description ?? voucherLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(entry.entry_date)}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Återföringsdatum (lämna tomt = idag)</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Orsak</Label>
            <Input
              placeholder="Orsak till återföringen"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            variant="destructive"
            disabled={reverse.isPending}
            onClick={() => void handleSubmit()}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Återför verifikat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Journal entry detail sheet ───────────────────────────────────────────────

function EntryDetailSheet({
  entryId,
  onClose,
}: {
  entryId: string;
  onClose: () => void;
}) {
  const { data: entry, isLoading } = useJournalEntry(entryId);
  const [reversing, setReversing] = useState(false);

  const totalDebit  = entry?.lines.reduce((s, l) => s + l.debit_amount,  0) ?? 0;
  const totalCredit = entry?.lines.reduce((s, l) => s + l.credit_amount, 0) ?? 0;
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01;

  const voucherLabel = entry?.voucher_series
    ? `${entry.voucher_series}${entry.voucher_number ?? ''}`
    : entryId.slice(0, 8) + '…';

  return (
    <>
      <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="w-[560px] sm:w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {isLoading ? 'Laddar…' : `Verifikat ${voucherLabel}`}
            </SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
            </div>
          ) : entry ? (
            <div className="mt-4 space-y-5">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Typ</p>
                  <EntryTypeBadge type={entry.entry_type} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <EntryStatusBadge status={entry.status} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Datum</p>
                  <p className="font-medium">{formatDate(entry.entry_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Skapad</p>
                  <p className="font-medium">{formatDateTime(entry.created_at)}</p>
                </div>
                {entry.description && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Beskrivning</p>
                    <p className="font-medium">{entry.description}</p>
                  </div>
                )}
                {entry.reference && (
                  <div>
                    <p className="text-xs text-muted-foreground">Referens</p>
                    <p className="font-mono font-medium text-sm">{entry.reference}</p>
                  </div>
                )}
                {entry.reversal_of && (
                  <div>
                    <p className="text-xs text-muted-foreground">Återför verifikat</p>
                    <p className="font-mono text-xs text-muted-foreground">{entry.reversal_of.slice(0, 8)}…</p>
                  </div>
                )}
              </div>

              {/* Balance indicator */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                balanced
                  ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-destructive'
              }`}>
                {balanced
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 shrink-0" />}
                {balanced
                  ? 'Verifikatet är balanserat'
                  : `Obalanserat: debet ${SEK(totalDebit)} ≠ kredit ${SEK(totalCredit)}`}
              </div>

              {/* Journal lines */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Bokföringsrader</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-7">#</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Konto</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Beskrivning</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Debet</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Kredit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {entry.lines.map((line) => (
                        <tr key={line.id} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5 text-muted-foreground">{line.line_number}</td>
                          <td className="px-3 py-1.5">
                            <span className="font-mono font-semibold">{line.account_code}</span>
                            {line.account_name && (
                              <span className="text-muted-foreground ml-1.5">{line.account_name}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground hidden sm:table-cell max-w-[140px] truncate">
                            {line.description ?? '–'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {line.debit_amount > 0 ? formatCurrency(line.debit_amount, 'SEK') : ''}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {line.credit_amount > 0 ? formatCurrency(line.credit_amount, 'SEK') : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/30 font-semibold">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right text-xs">Summa</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{SEK(totalDebit)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{SEK(totalCredit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Actions */}
              {entry.status === 'posted' && (
                <PermissionGate permission={Permissions.FINANCE_LEDGER_VOID}>
                  <div className="pt-2 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setReversing(true)}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Återför verifikat
                    </Button>
                  </div>
                </PermissionGate>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {reversing && entry && (
        <ReverseDialog entry={entry} onClose={() => setReversing(false)} />
      )}
    </>
  );
}

// ─── Journal entry row ─────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: JournalEntry }) {
  const [open, setOpen] = useState(false);
  const voucherLabel = entry.voucher_series
    ? `${entry.voucher_series}${entry.voucher_number ?? ''}`
    : '–';

  return (
    <>
      <button
        className="w-full text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between px-4 py-2.5 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="hidden sm:block text-right w-14 shrink-0">
              <span className="font-mono text-xs text-muted-foreground">{voucherLabel}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <EntryTypeBadge type={entry.entry_type} />
                {entry.status === 'reversed' && <EntryStatusBadge status="reversed" />}
                <span className="text-sm text-foreground truncate max-w-[200px]">
                  {entry.description ?? '–'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(entry.entry_date)}
                {entry.reference && <span className="ml-2 font-mono">· {entry.reference}</span>}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </button>
      {open && <EntryDetailSheet entryId={entry.id} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Journal entries tab ──────────────────────────────────────────────────────

function JournalEntriesTab({ periodId }: { periodId: string | null }) {
  const [entryType, setEntryType] = useState('');
  const [status,    setStatus]    = useState('');

  const { data, isLoading } = useJournalEntries(
    periodId
      ? { period_id: periodId, entry_type: entryType || undefined, status: status || undefined }
      : null,
  );

  const entries = data?.data ?? [];
  const total   = data?.total ?? 0;

  if (!periodId) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Välj en period ovan för att visa journalposter.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={entryType}
          onChange={(e) => setEntryType(e.target.value)}
        >
          <option value="">Alla typer</option>
          <option value="invoice_posted">Faktura</option>
          <option value="payment_posted">Betalning</option>
          <option value="void_posted">Makulering</option>
          <option value="deferred_revenue">Uppskjuten intäkt</option>
          <option value="lesson_recognized">Intäktsföring</option>
          <option value="depreciation">Avskrivning</option>
          <option value="payroll">Lön</option>
          <option value="manual">Manuell</option>
          <option value="reversal">Återföring</option>
        </select>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Alla status</option>
          <option value="posted">Bokförda</option>
          <option value="reversed">Återförda</option>
        </select>
        {total > 0 && (
          <span className="self-center text-xs text-muted-foreground ml-1">
            {total} verifikat
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <BookOpen className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Inga journalposter</p>
              <p className="text-xs text-muted-foreground">Perioden har inga bokförda verifikat.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((e) => <EntryRow key={e.id} entry={e} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Trial balance tab ────────────────────────────────────────────────────────

function TrialBalanceTab({ periodId, periodName }: { periodId: string | null; periodName: string }) {
  const [generating, setGenerating] = useState(false);
  const { data, isLoading } = useTrialBalance(periodId);

  if (!periodId) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Välj en period ovan för att visa råbalansen.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + balanced indicator */}
      {data && !isLoading && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${
              data.is_balanced
                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-destructive'
            }`}>
              {data.is_balanced
                ? <CheckCircle2 className="w-4 h-4" />
                : <AlertTriangle className="w-4 h-4" />}
              {data.is_balanced ? 'Råbalansen är balanserad' : 'Obalanserad råbalans!'}
            </div>
            <div className="text-sm text-muted-foreground hidden sm:block">
              Debet: <span className="font-mono font-medium text-foreground">{SEK(data.total_debit)}</span>
              {' · '}
              Kredit: <span className="font-mono font-medium text-foreground">{SEK(data.total_credit)}</span>
            </div>
          </div>
          <PermissionGate permission={Permissions.FINANCE_LEDGER_EXPORT}>
            <Button size="sm" variant="outline" onClick={() => setGenerating(true)}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Generera SIE4
            </Button>
          </PermissionGate>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-9 bg-muted rounded animate-pulse" />)}
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <FileCheck className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Inga kontosaldon</p>
              <p className="text-xs text-muted-foreground">Perioden har inga bokförda transaktioner.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Konto</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Typ</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Debet</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Kredit</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Netto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((row: TrialBalanceRow) => (
                    <tr
                      key={row.account_code}
                      className="hover:bg-muted/20"
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-mono font-semibold">{row.account_code}</span>
                        {row.account_name && (
                          <span className="text-muted-foreground ml-2 text-xs">{row.account_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {row.account_type && (
                          <Badge variant="outline" className="text-[10px] px-1.5">{row.account_type}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {row.debit_movement > 0 ? formatCurrency(row.debit_movement, 'SEK') : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {row.credit_movement > 0 ? formatCurrency(row.credit_movement, 'SEK') : ''}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${
                        row.net_balance > 0 ? 'text-blue-700 dark:text-blue-400'
                        : row.net_balance < 0 ? 'text-orange-700 dark:text-orange-400'
                        : 'text-muted-foreground'
                      }`}>
                        {SEK(row.net_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 bg-muted/30 font-bold">
                  <tr>
                    <td colSpan={2} className="px-4 py-2.5 text-sm">Totalt</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm">{SEK(data.total_debit)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm">{SEK(data.total_credit)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono text-sm ${data.is_balanced ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                      {SEK(data.total_debit - data.total_credit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {generating && periodId && (
        <GenerateSIE4Dialog
          periodId={periodId}
          periodName={periodName}
          onClose={() => setGenerating(false)}
        />
      )}
    </div>
  );
}

// ─── SIE4 export dialog ───────────────────────────────────────────────────────

function GenerateSIE4Dialog({ periodId, periodName, onClose }: {
  periodId: string;
  periodName: string;
  onClose: () => void;
}) {
  const generate = useGenerateLedgerSIE4();

  async function handleGenerate() {
    try {
      await generate.mutateAsync(periodId);
      toast({ title: 'SIE4-fil genererad', description: `Period: ${periodName}` });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generera SIE4-export</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            En SIE4-fil (SHA-256-verifierad) genereras från bokföringshändelserna i perioden.
          </p>
          <div className="border rounded-lg p-3 bg-muted/30 text-sm">
            <p className="text-xs text-muted-foreground">Vald period</p>
            <p className="font-semibold mt-0.5">{periodName}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={generate.isPending} onClick={() => void handleGenerate()}>
            {generate.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1.5" />
            )}
            Generera SIE4
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SIE4 exports tab ────────────────────────────────────────────────────────

function SIE4ExportsTab({ selectedPeriodId, selectedPeriodName }: {
  selectedPeriodId:   string | null;
  selectedPeriodName: string;
}) {
  const [generating, setGenerating] = useState(false);
  const { data: exports = [], isLoading } = useLedgerSIE4Exports();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          SIE4-filer är SHA-256-verifierade och deterministiska.
        </p>
        <PermissionGate permission={Permissions.FINANCE_LEDGER_EXPORT}>
          <Button
            size="sm"
            disabled={!selectedPeriodId}
            onClick={() => setGenerating(true)}
            title={!selectedPeriodId ? 'Välj en period först' : undefined}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Generera SIE4
          </Button>
        </PermissionGate>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted rounded animate-pulse" />)}
            </div>
          ) : exports.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <Download className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Inga SIE4-exportfiler</p>
              <p className="text-xs text-muted-foreground">
                Välj en period i råbalansen och klicka Generera SIE4.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {exports.map((exp: LedgerSIE4Export) => (
                <div key={exp.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-sm font-medium">
                        {formatDate(exp.from_date)} – {formatDate(exp.to_date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{exp.entry_count} verifikat</span>
                      <span>{exp.account_count} konton</span>
                      <span>Genererad {formatDateTime(exp.generated_at)}</span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate max-w-[340px]">
                      SHA-256: {exp.content_hash}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0 text-green-700 border-green-300">
                    Verifierad
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {generating && selectedPeriodId && (
        <GenerateSIE4Dialog
          periodId={selectedPeriodId}
          periodName={selectedPeriodName}
          onClose={() => setGenerating(false)}
        />
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function JournalbokenPage() {
  const { data: periods = [], isLoading: periodsLoading } = useFinancialPeriods();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const periodName     = selectedPeriod?.name ?? '–';

  return (
    <PageLayout>
      <PageHeader
        title="Journalboken"
        description="Dubbelbokhållning – journalposter, råbalans och SIE4-export"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Journalboken' },
        ]}
      />

      <PageContent>
        <PermissionGate permission={Permissions.FINANCE_LEDGER_READ}>
          <div className="space-y-5">

            {/* Period selector — always visible */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Räkenskapsperiod</CardTitle>
              </CardHeader>
              <CardContent>
                {periodsLoading ? (
                  <div className="h-9 w-56 bg-muted rounded animate-pulse" />
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[240px]"
                      value={selectedPeriodId}
                      onChange={(e) => setSelectedPeriodId(e.target.value)}
                    >
                      <option value="">Välj period…</option>
                      {periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.status === 'open' ? 'Öppen' : p.status === 'closed' ? 'Stängd' : p.status})
                        </option>
                      ))}
                    </select>
                    {selectedPeriod && (
                      <span className="text-sm text-muted-foreground">
                        {formatDate(selectedPeriod.period_start)} – {formatDate(selectedPeriod.period_end)}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="journal">
              <TabsList>
                <TabsTrigger value="journal">Journalposter</TabsTrigger>
                <TabsTrigger value="trial">Råbalans</TabsTrigger>
                <TabsTrigger value="sie4">SIE4-export</TabsTrigger>
              </TabsList>

              <TabsContent value="journal" className="mt-4">
                <JournalEntriesTab periodId={selectedPeriodId || null} />
              </TabsContent>

              <TabsContent value="trial" className="mt-4">
                <TrialBalanceTab
                  periodId={selectedPeriodId || null}
                  periodName={periodName}
                />
              </TabsContent>

              <TabsContent value="sie4" className="mt-4">
                <SIE4ExportsTab
                  selectedPeriodId={selectedPeriodId || null}
                  selectedPeriodName={periodName}
                />
              </TabsContent>
            </Tabs>

          </div>
        </PermissionGate>
      </PageContent>
    </PageLayout>
  );
}
