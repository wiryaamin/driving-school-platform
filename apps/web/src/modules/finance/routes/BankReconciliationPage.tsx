import { useState, useMemo, useCallback } from 'react';
import {
  Plus, Loader2, AlertCircle, RefreshCw, CheckCircle2, Link2, Link2Off,
  ChevronRight, ArrowUpCircle, ArrowDownCircle, Building2, Calendar,
  FileCheck, Wand2,
} from 'lucide-react';
import {
  Button, Input, Label, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Badge,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { formatCurrency, formatDate } from '../lib/financeUtils.js';
import {
  useBankImports,
  useBankImportLines,
  useFinancialPeriods,
  useImportBankStatement,
  useAutoMatchLines,
  useManualMatchLine,
  useUnmatchLine,
  useConfirmBankReconciliation,
  type BankStatementImport,
  type BankStatementLine,
  type BankStatementStatus,
  type BankLineStatus,
  type ImportLineInput,
} from '../hooks/useReconciliation.js';

// ─── Status labels and colours ─────────────────────────────────────────────────

const IMPORT_STATUS: Record<BankStatementStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  imported:    { label: 'Importerad',   variant: 'secondary' },
  reconciling: { label: 'Matchning',    variant: 'default'   },
  reconciled:  { label: 'Matchad',      variant: 'default'   },
  confirmed:   { label: 'Bekräftad',    variant: 'outline'   },
};

const LINE_STATUS: Record<BankLineStatus, { label: string; color: string }> = {
  unmatched:  { label: 'Omatchad',  color: 'bg-red-100 text-red-700'     },
  matched:    { label: 'Matchad',   color: 'bg-green-100 text-green-700' },
  confirmed:  { label: 'Bekräftad', color: 'bg-emerald-100 text-emerald-700' },
  exception:  { label: 'Undantag',  color: 'bg-amber-100 text-amber-700' },
  ignored:    { label: 'Ignorerad', color: 'bg-gray-100 text-gray-500'   },
};

function ImportStatusBadge({ status }: { status: BankStatementStatus }) {
  const cfg = IMPORT_STATUS[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function LineStatusBadge({ status }: { status: BankLineStatus }) {
  const cfg = LINE_STATUS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── CSV parser ────────────────────────────────────────────────────────────────

function parseCSVLines(raw: string): ImportLineInput[] {
  const lines = raw.trim().split('\n').filter(l => l.trim());
  const result: ImportLineInput[] = [];

  for (const line of lines) {
    const sep  = line.includes(';') ? ';' : ',';
    const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) continue;

    // Try to detect date column (YYYY-MM-DD or YYYYMMDD or DD.MM.YYYY)
    let dateStr = '';
    let amount  = 0;
    let desc    = '';
    let ref     = '';

    const dateCol = cols.find(c => /^\d{4}-\d{2}-\d{2}$/.test(c) || /^\d{8}$/.test(c) || /^\d{2}\.\d{2}\.\d{4}$/.test(c));
    if (dateCol) {
      if (/^\d{8}$/.test(dateCol)) {
        dateStr = `${dateCol.slice(0, 4)}-${dateCol.slice(4, 6)}-${dateCol.slice(6, 8)}`;
      } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateCol)) {
        const [d, m, y] = dateCol.split('.');
        dateStr = `${y}-${m}-${d}`;
      } else {
        dateStr = dateCol;
      }
    } else {
      continue; // skip rows without a date
    }

    // Parse amount: find a column that looks like a number (may have , or . decimal)
    for (const col of cols) {
      const normalised = col.replace(/\s/g, '').replace(',', '.');
      const num = parseFloat(normalised);
      if (!isNaN(num) && col !== dateCol) {
        amount = num;
        break;
      }
    }

    // Everything that's not date/amount becomes description/reference
    const rest = cols.filter(c => c !== dateCol && !(!isNaN(parseFloat(c.replace(',', '.')))));
    desc = rest[0] ?? '';
    ref  = rest[1] ?? '';

    if (!dateStr || amount === 0) continue;
    result.push({ transaction_date: dateStr, amount, description: desc, reference: ref || undefined });
  }

  return result;
}

// ─── Import Wizard Sheet ───────────────────────────────────────────────────────

interface ImportWizardSheetProps {
  open:    boolean;
  onClose: () => void;
}

function ImportWizardSheet({ open, onClose }: ImportWizardSheetProps) {
  const importMutation = useImportBankStatement();

  const [step,            setStep]           = useState<1 | 2>(1);
  const [accountNumber,   setAccountNumber]  = useState('');
  const [bankName,        setBankName]       = useState('');
  const [statementDate,   setStatementDate]  = useState('');
  const [periodStart,     setPeriodStart]    = useState('');
  const [periodEnd,       setPeriodEnd]      = useState('');
  const [openingBalance,  setOpeningBalance] = useState('');
  const [closingBalance,  setClosingBalance] = useState('');
  const [currency,        setCurrency]       = useState('SEK');
  const [csvText,         setCsvText]        = useState('');
  const [parsedLines,     setParsedLines]    = useState<ImportLineInput[]>([]);
  const [parseError,      setParseError]     = useState('');

  function reset() {
    setStep(1);
    setAccountNumber(''); setBankName(''); setStatementDate('');
    setPeriodStart(''); setPeriodEnd('');
    setOpeningBalance(''); setClosingBalance('');
    setCurrency('SEK'); setCsvText(''); setParsedLines([]); setParseError('');
  }

  function handleClose() { reset(); onClose(); }

  function handleParseCSV() {
    setParseError('');
    const lines = parseCSVLines(csvText);
    if (lines.length === 0) {
      setParseError('Inga giltiga rader hittades. Kontrollera format (datum;belopp;beskrivning).');
      return;
    }
    setParsedLines(lines);
  }

  async function handleSubmit() {
    if (!accountNumber || !statementDate || !periodStart || !periodEnd) {
      toast({ title: 'Fyll i alla obligatoriska fält', variant: 'destructive' });
      return;
    }
    if (parsedLines.length === 0) {
      toast({ title: 'Lägg till minst en rad', variant: 'destructive' });
      return;
    }
    try {
      await importMutation.mutateAsync({
        account_number:  accountNumber,
        bank_name:       bankName || undefined,
        statement_date:  statementDate,
        period_start:    periodStart,
        period_end:      periodEnd,
        opening_balance: parseFloat(openingBalance) || 0,
        closing_balance: parseFloat(closingBalance) || 0,
        currency,
        lines:           parsedLines,
      });
      toast({ title: `${parsedLines.length} rader importerade`, description: 'Starta automatchning för att matcha betalningar.' });
      handleClose();
    } catch (e) {
      toast({ title: 'Import misslyckades', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={open_ => { if (!open_) handleClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle>Importera bankutdrag</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {([1, 2] as const).map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                ${step === s ? 'bg-primary text-primary-foreground' : step > s ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              <span className={`text-sm ${step === s ? 'font-semibold' : 'text-muted-foreground'}`}>
                {s === 1 ? 'Bankuppgifter' : 'Transaktioner'}
              </span>
              {s < 2 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kontonummer <span className="text-destructive">*</span></Label>
                <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="XXXX-XXXXXXX" />
              </div>
              <div className="space-y-1.5">
                <Label>Banknamn</Label>
                <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="SEB, Handelsbanken…" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Utdragsdatum <span className="text-destructive">*</span></Label>
              <Input type="date" value={statementDate} onChange={e => setStatementDate(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Perioden från <span className="text-destructive">*</span></Label>
                <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Perioden till <span className="text-destructive">*</span></Label>
                <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Ingående saldo</Label>
                <Input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Utgående saldo</Label>
                <Input type="number" value={closingBalance} onChange={e => setClosingBalance(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Valuta</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEK">SEK</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setStep(2)}
                disabled={!accountNumber || !statementDate || !periodStart || !periodEnd}
              >
                Nästa <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Klistra in CSV-data</Label>
              <p className="text-xs text-muted-foreground">
                Stöder semikolon- och kommaseparerat format. Kolumner: datum; belopp; beskrivning; referens (positiva belopp = inbetalning)
              </p>
              <Textarea
                value={csvText}
                onChange={e => { setCsvText(e.target.value); setParsedLines([]); setParseError(''); }}
                placeholder="2024-01-15;1500.00;Betalning faktura F-001;OCR123456"
                className="font-mono text-xs h-40 resize-none"
              />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {parseError}
              </div>
            )}

            <Button variant="outline" onClick={handleParseCSV} disabled={!csvText.trim()} className="w-full">
              <Wand2 className="w-4 h-4 mr-2" /> Tolka CSV
            </Button>

            {parsedLines.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {parsedLines.length} rader tolkade
                </div>
                <div className="divide-y max-h-48 overflow-y-auto">
                  {parsedLines.map((l, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <span className="text-muted-foreground w-24 shrink-0">{l.transaction_date}</span>
                      <span className={`font-mono font-medium w-20 shrink-0 ${l.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {l.amount >= 0 ? '+' : ''}{formatCurrency(l.amount)}
                      </span>
                      <span className="text-foreground truncate">{l.description || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Tillbaka
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={parsedLines.length === 0 || importMutation.isPending}
                className="flex-1"
              >
                {importMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importerar…</>
                  : <><Plus className="w-4 h-4 mr-2" /> Importera {parsedLines.length} rader</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Manual Match Dialog ───────────────────────────────────────────────────────

interface ManualMatchDialogProps {
  line:     BankStatementLine | null;
  importId: string;
  onClose:  () => void;
}

function ManualMatchDialog({ line, importId, onClose }: ManualMatchDialogProps) {
  const matchMutation = useManualMatchLine();
  const [paymentId,   setPaymentId]  = useState('');
  const [matchNotes,  setMatchNotes] = useState('');

  async function handleMatch() {
    if (!line || !paymentId.trim()) return;
    try {
      await matchMutation.mutateAsync({ lineId: line.id, paymentId: paymentId.trim(), notes: matchNotes || undefined, importId });
      toast({ title: 'Rad matchad manuellt' });
      setPaymentId(''); setMatchNotes('');
      onClose();
    } catch (e) {
      toast({ title: 'Matchning misslyckades', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={Boolean(line)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manuell matchning</DialogTitle>
        </DialogHeader>

        {line && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-1 text-sm bg-muted/30">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Datum</span>
                <span className="font-medium">{formatDate(line.transaction_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Belopp</span>
                <span className={`font-mono font-semibold ${line.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {line.amount >= 0 ? '+' : ''}{formatCurrency(line.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Beskrivning</span>
                <span className="font-medium truncate max-w-[200px]">{line.description || '—'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Betalnings-ID <span className="text-destructive">*</span></Label>
              <Input
                value={paymentId}
                onChange={e => setPaymentId(e.target.value)}
                placeholder="UUID för betalningspost…"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Kopiera ID från en betalning i betalningslistan.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Anteckning</Label>
              <Input value={matchNotes} onChange={e => setMatchNotes(e.target.value)} placeholder="Valfri förklaring…" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button onClick={handleMatch} disabled={!paymentId.trim() || matchMutation.isPending}>
            {matchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
            Matcha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Confirm Reconciliation Dialog ─────────────────────────────────────────────

interface ConfirmReconDialogProps {
  open:     boolean;
  importId: string;
  onClose:  () => void;
}

function ConfirmReconDialog({ open, importId, onClose }: ConfirmReconDialogProps) {
  const { data: periods = [], isLoading: periodsLoading } = useFinancialPeriods();
  const confirmMutation = useConfirmBankReconciliation(importId);
  const [periodId, setPeriodId] = useState('');
  const [notes,    setNotes]    = useState('');

  async function handleConfirm() {
    if (!periodId) { toast({ title: 'Välj en bokföringsperiod', variant: 'destructive' }); return; }
    try {
      await confirmMutation.mutateAsync({ periodId, notes: notes || undefined });
      toast({ title: 'Avstämning bekräftad', description: 'Bankavstämningen är nu slutförd.' });
      setPeriodId(''); setNotes('');
      onClose();
    } catch (e) {
      toast({ title: 'Bekräftelse misslyckades', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={open_ => { if (!open_) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bekräfta bankavstämning</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Välj den bokföringsperiod detta bankutdrag tillhör. Bekräftelsen skapar en revisorsspår i systemet.
          </p>

          <div className="space-y-1.5">
            <Label>Bokföringsperiod <span className="text-destructive">*</span></Label>
            {periodsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Hämtar perioder…
              </div>
            ) : periods.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded-lg">
                Inga bokföringsperioder hittades. Skapa en period under Ekonomi → Periodinställningar.
              </p>
            ) : (
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj period…" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({formatDate(p.period_start)} – {formatDate(p.period_end)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Anteckning</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Valfri anteckning om denna avstämning…"
              className="resize-none h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button onClick={handleConfirm} disabled={!periodId || confirmMutation.isPending}>
            {confirmMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4 mr-1" />}
            Bekräfta avstämning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import Detail Sheet ───────────────────────────────────────────────────────

interface ImportDetailSheetProps {
  imp:     BankStatementImport | null;
  onClose: () => void;
}

function ImportDetailSheet({ imp, onClose }: ImportDetailSheetProps) {
  const { data: lines = [], isLoading: linesLoading } = useBankImportLines(imp?.id ?? null);
  const autoMatch    = useAutoMatchLines(imp?.id ?? '');
  const unmatchLine  = useUnmatchLine();

  const [matchTarget,   setMatchTarget]   = useState<BankStatementLine | null>(null);
  const [confirmOpen,   setConfirmOpen]   = useState(false);

  const matchedCount   = lines.filter(l => l.status === 'matched' || l.status === 'confirmed').length;
  const unmatchedCount = lines.filter(l => l.status === 'unmatched').length;

  async function handleAutoMatch() {
    if (!imp) return;
    try {
      const result = await autoMatch.mutateAsync();
      toast({ title: `${result.matched_count} rader automatchade` });
    } catch (e) {
      toast({ title: 'Automatchning misslyckades', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handleUnmatch(line: BankStatementLine) {
    if (!imp) return;
    try {
      await unmatchLine.mutateAsync({ lineId: line.id, importId: imp.id });
      toast({ title: 'Matchning borttagen' });
    } catch (e) {
      toast({ title: 'Fel vid borttagning', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  const isConfirmed = imp?.status === 'confirmed';

  return (
    <>
      <Dialog open={Boolean(imp)} onOpenChange={open => { if (!open) onClose(); }}>
        <DialogContent className="w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          {imp && (
            <>
              {/* Header */}
              <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <p className="font-semibold text-foreground">{imp.bank_name ?? imp.bank_account_number}</p>
                      <ImportStatusBadge status={imp.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Konto: {imp.bank_account_number} · {formatDate(imp.period_start)} – {formatDate(imp.period_end)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 space-y-6">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Ingående saldo',   value: formatCurrency(imp.opening_balance, imp.currency) },
                    { label: 'Utgående saldo',    value: formatCurrency(imp.closing_balance, imp.currency) },
                    { label: 'Diff',              value: formatCurrency(imp.closing_balance - imp.opening_balance, imp.currency) },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <p className="font-mono font-semibold text-sm">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Match progress */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Matchningsläge</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        {matchedCount} matchade
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-400" />
                        {unmatchedCount} omatchade
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: lines.length ? `${(matchedCount / lines.length) * 100}%` : '0%' }}
                    />
                  </div>

                  {!isConfirmed && (
                    <PermissionGate permission={Permissions.FINANCE_RECONCILIATION_MANAGE}>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAutoMatch}
                        disabled={autoMatch.isPending || unmatchedCount === 0}
                        className="flex-1"
                      >
                        {autoMatch.isPending
                          ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Matchar…</>
                          : <><Wand2 className="w-3.5 h-3.5 mr-1.5" /> Automatchning</>}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setConfirmOpen(true)}
                        disabled={unmatchedCount > 0}
                        className="flex-1"
                      >
                        <FileCheck className="w-3.5 h-3.5 mr-1.5" />
                        Bekräfta {unmatchedCount > 0 ? `(${unmatchedCount} kvar)` : 'avstämning'}
                      </Button>
                    </div>
                    </PermissionGate>
                  )}
                  {isConfirmed && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Bekräftad {imp.confirmed_at ? formatDate(imp.confirmed_at) : ''}
                    </p>
                  )}
                </div>

                {/* Lines */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Transaktionsrader ({imp.total_lines})
                  </p>

                  {linesLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Hämtar rader…</span>
                    </div>
                  ) : lines.length === 0 ? (
                    <p className="text-sm text-center text-muted-foreground py-8">Inga rader hittades.</p>
                  ) : (
                    <div className="rounded-lg border overflow-hidden divide-y">
                      {lines.map(line => (
                        <div key={line.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                          {/* Direction icon */}
                          <div className="shrink-0 mt-0.5">
                            {line.amount >= 0
                              ? <ArrowDownCircle className="w-4 h-4 text-green-500" />
                              : <ArrowUpCircle className="w-4 h-4 text-red-400" />}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium truncate">{line.description || '—'}</span>
                              <span className={`text-sm font-mono font-semibold shrink-0 ${line.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {line.amount >= 0 ? '+' : ''}{formatCurrency(line.amount, imp.currency)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">
                                <Calendar className="w-3 h-3 inline mr-0.5" />
                                {formatDate(line.transaction_date)}
                              </span>
                              {line.reference && (
                                <span className="text-xs text-muted-foreground font-mono">{line.reference}</span>
                              )}
                              {line.counterpart_name && (
                                <span className="text-xs text-muted-foreground">{line.counterpart_name}</span>
                              )}
                              <LineStatusBadge status={line.status} />
                              {line.match_method && (
                                <span className="text-xs text-muted-foreground">
                                  ({line.match_method === 'automatic' ? 'auto' : 'manuell'})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          {!isConfirmed && (
                            <PermissionGate permission={Permissions.FINANCE_RECONCILIATION_MANAGE}>
                            <div className="shrink-0 flex items-center gap-1">
                              {(line.status === 'unmatched' || line.status === 'exception') && (
                                <button
                                  onClick={() => setMatchTarget(line)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  title="Matcha manuellt"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(line.status === 'matched') && (
                                <button
                                  onClick={() => handleUnmatch(line)}
                                  disabled={unmatchLine.isPending}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Ta bort matchning"
                                >
                                  <Link2Off className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            </PermissionGate>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual match dialog */}
      <ManualMatchDialog
        line={matchTarget}
        importId={imp?.id ?? ''}
        onClose={() => setMatchTarget(null)}
      />

      {/* Confirm dialog */}
      {imp && (
        <ConfirmReconDialog
          open={confirmOpen}
          importId={imp.id}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}

// ─── Import row card ───────────────────────────────────────────────────────────

function ImportCard({
  imp,
  onClick,
}: {
  imp:     BankStatementImport;
  onClick: () => void;
}) {
  const matchedEstimate  = imp.status === 'confirmed' ? imp.total_lines : 0;
  const pct = imp.total_lines > 0 ? Math.round((matchedEstimate / imp.total_lines) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-4 border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
        <Building2 className="w-5 h-5 text-blue-600" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-foreground truncate">
            {imp.bank_name ?? imp.bank_account_number}
          </p>
          <ImportStatusBadge status={imp.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDate(imp.period_start)} – {formatDate(imp.period_end)}
          {' · '}{imp.total_lines} rader
          {' · '}{formatCurrency(imp.closing_balance - imp.opening_balance, imp.currency)} nettodiff
        </p>
        <div className="mt-1.5 h-1 bg-muted rounded-full w-32 overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full"
            style={{ width: `${imp.status === 'confirmed' ? 100 : pct}%` }}
          />
        </div>
      </div>

      <div className="text-right shrink-0 space-y-1">
        <p className="text-xs text-muted-foreground">{formatDate(imp.imported_at)}</p>
        <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
      </div>
    </div>
  );
}

// ─── BankReconciliationPage ────────────────────────────────────────────────────

export function BankReconciliationPage() {
  const { data: imports = [], isLoading, isError, refetch } = useBankImports();
  const [wizardOpen,    setWizardOpen]    = useState(false);
  const [selectedImport, setSelectedImport] = useState<BankStatementImport | null>(null);

  const handleSelectImport = useCallback((imp: BankStatementImport) => {
    setSelectedImport(imp);
  }, []);

  const stats = useMemo(() => ({
    total:      imports.length,
    confirmed:  imports.filter(i => i.status === 'confirmed').length,
    pending:    imports.filter(i => i.status !== 'confirmed').length,
  }), [imports]);

  return (
    <PageLayout fullBleed>
      <PageHeader
        description="Importera bankutdrag, matcha betalningar och bekräfta perioder"
        actions={
          <PermissionGate permission={Permissions.FINANCE_RECONCILIATION_MANAGE}>
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Nytt bankutdrag
            </Button>
          </PermissionGate>
        }
      />

      <PageContent>
        <SubscriptionGate feature="finance:reconciliation:run">
        <PermissionGate permission={Permissions.FINANCE_RECONCILIATION_READ}>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Totalt utdrag',    value: stats.total,     icon: FileCheck,    color: 'text-blue-600' },
            { label: 'Bekräftade',       value: stats.confirmed, icon: CheckCircle2, color: 'text-green-600' },
            { label: 'Under arbete',     value: stats.pending,   icon: RefreshCw,    color: 'text-amber-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Hämtar bankutdrag…</span>
          </div>
        ) : isError ? (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive">Kunde inte hämta bankutdrag</p>
              <p className="text-xs text-muted-foreground mt-0.5">Kontrollera din behörighet (finance:reconciliation:read).</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Försök igen
            </Button>
          </div>
        ) : imports.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-muted mx-auto flex items-center justify-center">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Inga bankutdrag importerade</p>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
                Importera ett bankutdrag för att starta månadsavstämningen. Klistra in CSV-data från din internetbank.
              </p>
            </div>
            <PermissionGate permission={Permissions.FINANCE_RECONCILIATION_MANAGE}>
              <Button onClick={() => setWizardOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Importera bankutdrag
              </Button>
            </PermissionGate>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            {imports.map(imp => (
              <ImportCard key={imp.id} imp={imp} onClick={() => handleSelectImport(imp)} />
            ))}
          </div>
        )}
        </PermissionGate>
        </SubscriptionGate>
      </PageContent>

      {/* Import wizard sheet */}
      <ImportWizardSheet open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {/* Import detail sheet */}
      <ImportDetailSheet imp={selectedImport} onClose={() => setSelectedImport(null)} />
    </PageLayout>
  );
}
