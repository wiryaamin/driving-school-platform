import { useState } from 'react';
import {
  Loader2, AlertCircle, CheckCircle2, XCircle, Lock, LockOpen,
  ChevronRight, X, RefreshCw, Camera, ClipboardList, Plus,
  ShieldCheck, Archive,
} from 'lucide-react';
import {
  Button, Input, Label, Textarea,
  Sheet, SheetContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Badge, Tabs, TabsContent, TabsList, TabsTrigger,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { formatDate, formatDateTime } from '../lib/financeUtils.js';
import {
  usePeriodReadiness, useFiscalYears,
  usePeriodSnapshots, usePeriodChecks,
  useValidatePeriod, useSoftClosePeriod, useReopenPeriod, useHardClosePeriod,
  useCaptureSnapshot, useRunConsistencyCheck,
  useCreateFiscalYear, useValidateFiscalYear,
  usePostRetainedEarnings, useCloseFiscalYear, useRolloverOpeningBalances,
  useAssignPeriodToFiscalYear,
  type PeriodReadiness, type FiscalYearOverview, type ValidationResult,
  type PeriodStatus, type FiscalYearStatus,
} from '../hooks/useFinancialClose.js';
import {
  useFinancialPeriods, useCreateFinancialPeriod,
  type FinancialPeriod,
} from '../hooks/useReconciliation.js';

// ─── Status badges ────────────────────────────────────────────────────────────

const PERIOD_STATUS: Record<PeriodStatus, { label: string; color: string }> = {
  open:   { label: 'Öppen',     color: 'bg-blue-100 text-blue-700'   },
  closed: { label: 'Mjukstängd',color: 'bg-amber-100 text-amber-700' },
  locked: { label: 'Låst',      color: 'bg-green-100 text-green-700' },
};

const FY_STATUS: Record<FiscalYearStatus, { label: string; color: string }> = {
  open:    { label: 'Öppet',     color: 'bg-blue-100 text-blue-700'    },
  closing: { label: 'Stängs',    color: 'bg-amber-100 text-amber-700'  },
  closed:  { label: 'Avslutat',  color: 'bg-green-100 text-green-700'  },
};

function PeriodBadge({ status }: { status: PeriodStatus }) {
  const cfg = PERIOD_STATUS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>;
}

function FYBadge({ status }: { status: FiscalYearStatus }) {
  const cfg = FY_STATUS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>;
}

// ─── Check indicator ──────────────────────────────────────────────────────────

function CheckIcon({ passed }: { passed: boolean }) {
  return passed
    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
    : <XCircle      className="w-3.5 h-3.5 text-red-500   shrink-0" />;
}

// ─── Validation result dialog ─────────────────────────────────────────────────

function ValidationDialog({
  result, title, onClose,
}: { result: ValidationResult | null; title: string; onClose: () => void }) {
  return (
    <Dialog open={Boolean(result)} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {result && (
          <div className="space-y-3">
            <div className={`rounded-lg border p-3 flex items-center gap-2 text-sm font-semibold ${
              result.all_passed
                ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800'
                : 'bg-red-50 border-red-200 text-destructive dark:bg-red-900/20 dark:border-red-800'
            }`}>
              {result.all_passed
                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                : <XCircle      className="w-4 h-4 shrink-0" />
              }
              {result.all_passed ? 'Alla kontroller godkända' : 'Vissa kontroller misslyckades'}
            </div>
            <div className="rounded-lg border divide-y overflow-hidden">
              {result.checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
                  <CheckIcon passed={c.passed} />
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    {c.detail && <p className="text-xs text-muted-foreground">{c.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Stäng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Period detail sheet ──────────────────────────────────────────────────────

function PeriodDetailSheet({ period, onClose }: { period: PeriodReadiness | null; onClose: () => void }) {
  const { data: snapshots = [], isLoading: snapsLoading } = usePeriodSnapshots(period?.period_id ?? null);
  const { data: checks    = [], isLoading: chksLoading  } = usePeriodChecks(period?.period_id ?? null);

  const validate     = useValidatePeriod();
  const softClose    = useSoftClosePeriod();
  const reopen       = useReopenPeriod();
  const hardClose    = useHardClosePeriod();
  const captureSnap  = useCaptureSnapshot();
  const runCheck     = useRunConsistencyCheck();

  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [reopenOpen,   setReopenOpen]   = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [closeNotes,   setCloseNotes]   = useState('');
  const [confirmHard,  setConfirmHard]  = useState(false);

  async function handleValidate() {
    if (!period) return;
    try {
      const result = await validate.mutateAsync(period.period_id);
      setValidationResult(result);
    } catch (e) {
      toast({ title: 'Validering misslyckades', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handleSoftClose() {
    if (!period) return;
    try {
      await softClose.mutateAsync({ periodId: period.period_id, notes: closeNotes || undefined });
      toast({ title: `Period "${period.period_name}" mjukstängd` });
      setCloseNotes(''); onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Okänt fel';
      toast({ title: 'Mjukstängning misslyckades', description: msgToSwedish(msg), variant: 'destructive' });
    }
  }

  async function handleReopen() {
    if (!period || !reopenReason.trim()) return;
    try {
      await reopen.mutateAsync({ periodId: period.period_id, reason: reopenReason });
      toast({ title: `Period "${period.period_name}" återöppnad` });
      setReopenReason(''); setReopenOpen(false); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handleHardClose() {
    if (!period) return;
    try {
      await hardClose.mutateAsync({ periodId: period.period_id, notes: closeNotes || undefined });
      toast({ title: `Period "${period.period_name}" låst permanent` });
      setCloseNotes(''); setConfirmHard(false); onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Okänt fel';
      toast({ title: 'Låsning misslyckades', description: msgToSwedish(msg), variant: 'destructive' });
    }
  }

  async function handleSnapshot() {
    if (!period) return;
    try {
      await captureSnap.mutateAsync({ periodId: period.period_id });
      toast({ title: 'Revisionssnapshot skapad' });
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handleConsistency() {
    if (!period) return;
    try {
      await runCheck.mutateAsync(period.period_id);
      toast({ title: 'Konsistenskontroll kördes' });
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  if (!period) return null;

  const isOpen   = period.status === 'open';
  const isClosed = period.status === 'closed';
  const isLocked = period.status === 'locked';

  const readinessItems = [
    { label: 'Balansräkning balanserad', ok: period.trial_balance_balanced },
    { label: 'Bankavstämning klar',      ok: period.bank_reconciled        },
    { label: 'Kundreskontra stämd',      ok: period.ar_reconciled          },
    { label: 'Momsavstämning klar',      ok: period.vat_reconciled         },
    { label: 'Periodisering stämd',      ok: period.deferred_reconciled    },
    { label: 'Mjukstängning snapshot',   ok: period.soft_close_snapshot_exists },
    { label: 'Hårdstängning snapshot',   ok: period.hard_close_snapshot_exists },
  ];

  const readyCount = readinessItems.filter(r => r.ok).length;

  return (
    <>
      <Sheet open={Boolean(period)} onOpenChange={v => { if (!v) onClose(); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background border-b px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="font-semibold">{period.period_name}</p>
                  <PeriodBadge status={period.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(period.period_start)} – {formatDate(period.period_end)}
                  · {period.posted_entry_count} bokföringar
                  {period.amendment_count > 0 && ` · ${period.amendment_count} tillägg`}
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="px-5 py-5 space-y-6">
            {/* Readiness checklist */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Beredskap ({readyCount}/{readinessItems.length})</p>
                <div className="h-1.5 w-28 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${readyCount === readinessItems.length ? 'bg-green-500' : 'bg-amber-400'}`}
                    style={{ width: `${Math.round(readyCount / readinessItems.length * 100)}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg border divide-y overflow-hidden">
                {readinessItems.map(({ label, ok }) => (
                  <div key={label} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <CheckIcon passed={ok} />
                    <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trial balance summary */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                { label: 'Debet',  value: period.trial_balance_debit.toLocaleString('sv-SE', { minimumFractionDigits: 2 }) + ' kr' },
                { label: 'Kredit', value: period.trial_balance_credit.toLocaleString('sv-SE', { minimumFractionDigits: 2 }) + ' kr' },
                { label: 'Status', value: period.trial_balance_balanced ? '✓ Balanserad' : '✗ Obalanserad' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border bg-muted/20 p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-xs font-mono font-semibold leading-snug">{value}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <PermissionGate permission={Permissions.FINANCE_CLOSE_MANAGE}>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Åtgärder</p>

                {/* Validate */}
                <Button
                  variant="outline" size="sm" className="w-full justify-start"
                  onClick={handleValidate} disabled={isLocked || validate.isPending}
                >
                  {validate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Validera period
                </Button>

                {/* Consistency check */}
                <Button
                  variant="outline" size="sm" className="w-full justify-start"
                  onClick={handleConsistency} disabled={isLocked || runCheck.isPending}
                >
                  {runCheck.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-2" />}
                  Kör konsistenskontroll
                </Button>

                {/* Snapshot */}
                <Button
                  variant="outline" size="sm" className="w-full justify-start"
                  onClick={handleSnapshot} disabled={captureSnap.isPending}
                >
                  {captureSnap.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                  Ta revisionssnapshot
                </Button>

                {/* Notes field */}
                {(isOpen || isClosed) && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Anteckning (valfritt)</Label>
                    <Textarea
                      value={closeNotes}
                      onChange={e => setCloseNotes(e.target.value)}
                      className="resize-none h-16 text-sm"
                      placeholder="Anteckning för stängningsjournalen…"
                    />
                  </div>
                )}

                {/* Soft close */}
                {isOpen && (
                  <Button
                    size="sm" className="w-full justify-start"
                    onClick={handleSoftClose} disabled={softClose.isPending}
                  >
                    {softClose.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
                    Mjukstäng period
                  </Button>
                )}

                {/* Reopen */}
                {isClosed && (
                  <Button
                    variant="outline" size="sm" className="w-full justify-start text-amber-700 border-amber-300 hover:text-amber-700"
                    onClick={() => setReopenOpen(true)}
                  >
                    <LockOpen className="w-4 h-4 mr-2" /> Återöppna period
                  </Button>
                )}

                {/* Hard close */}
                {isClosed && !confirmHard && (
                  <Button
                    variant="outline" size="sm"
                    className="w-full justify-start text-destructive border-destructive/30 hover:text-destructive"
                    onClick={() => setConfirmHard(true)}
                  >
                    <Lock className="w-4 h-4 mr-2" /> Lås permanent (hard-close)
                  </Button>
                )}
                {isClosed && confirmHard && (
                  <div className="rounded-lg border border-destructive/30 p-3 space-y-2">
                    <p className="text-xs text-destructive font-semibold">Bekräfta permanent låsning</p>
                    <p className="text-xs text-muted-foreground">
                      Perioden låses och kan inte återöppnas. Alla kontroller måste ha passerats.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={handleHardClose} disabled={hardClose.isPending}>
                        {hardClose.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Lås'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmHard(false)}>Avbryt</Button>
                    </div>
                  </div>
                )}
              </div>
            </PermissionGate>

            {/* Snapshots */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Revisionssnapshots ({snapshots.length})
              </p>
              {snapsLoading ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Hämtar…
                </div>
              ) : snapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga snapshots tagna.</p>
              ) : (
                <div className="rounded-lg border divide-y overflow-hidden">
                  {snapshots.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{s.snapshot_type}</p>
                        {s.notes && <p className="text-xs text-muted-foreground truncate">{s.notes}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0">{formatDateTime(s.captured_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Consistency checks */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Konsistenskontroller
              </p>
              {chksLoading ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Hämtar…
                </div>
              ) : checks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga kontroller körda.</p>
              ) : (
                <div className="rounded-lg border divide-y overflow-hidden">
                  {checks.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        {c.passed === null ? <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                          : <CheckIcon passed={c.passed} />}
                        <span>{c.check_type}</span>
                        {c.issues_found > 0 && (
                          <Badge variant="destructive" className="text-[10px]">{c.issues_found} problem</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0">{formatDate(c.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="space-y-1 text-xs text-muted-foreground border-t pt-4">
              {period.close_validated_at && <p>Validerad: {formatDateTime(period.close_validated_at)}</p>}
              {period.closed_at          && <p>Mjukstängd: {formatDateTime(period.closed_at)}</p>}
              {period.locked_at          && <p>Låst: {formatDateTime(period.locked_at)}</p>}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reopen dialog */}
      <Dialog open={reopenOpen} onOpenChange={v => { if (!v) { setReopenReason(''); setReopenOpen(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Återöppna period</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Perioden återöppnas för rättning. Ange orsak (visas i revisionsloggen).
            </p>
            <div className="space-y-1.5">
              <Label>Orsak <span className="text-destructive">*</span></Label>
              <Textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} className="resize-none h-20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReopenReason(''); setReopenOpen(false); }}>Avbryt</Button>
            <Button onClick={handleReopen} disabled={!reopenReason.trim() || reopen.isPending}>
              {reopen.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Återöppna'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ValidationDialog result={validationResult} title={`Validering — ${period.period_name}`} onClose={() => setValidationResult(null)} />
    </>
  );
}

// ─── Create fiscal year sheet ─────────────────────────────────────────────────

function CreateFiscalYearSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateFiscalYear();
  const [yearNumber, setYearNumber] = useState('');
  const [yearStart,  setYearStart]  = useState('');
  const [yearEnd,    setYearEnd]    = useState('');
  const [notes,      setNotes]      = useState('');

  function reset() { setYearNumber(''); setYearStart(''); setYearEnd(''); setNotes(''); }

  async function handleSubmit() {
    if (!yearNumber || !yearStart || !yearEnd) {
      toast({ title: 'Fyll i alla obligatoriska fält', variant: 'destructive' }); return;
    }
    try {
      await create.mutateAsync({
        year_number: parseInt(yearNumber, 10),
        year_start:  yearStart,
        year_end:    yearEnd,
        notes:       notes || undefined,
      });
      toast({ title: `Räkenskapsår ${yearNumber} skapat` });
      reset(); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-4">
          <DialogTitle>Nytt räkenskapsår</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Årsnummer <span className="text-destructive">*</span></Label>
            <Input
              type="number" min="2000" max="2099"
              value={yearNumber} onChange={e => setYearNumber(e.target.value)}
              placeholder={String(new Date().getFullYear())}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Räkenskapsstart <span className="text-destructive">*</span></Label>
              <Input type="date" value={yearStart} onChange={e => setYearStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Räkenskapsslut <span className="text-destructive">*</span></Label>
              <Input type="date" value={yearEnd} onChange={e => setYearEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Anteckning</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="resize-none h-16" />
          </div>
          <Button onClick={handleSubmit} disabled={!yearNumber || !yearStart || !yearEnd || create.isPending} className="w-full">
            {create.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Skapa räkenskapsår
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create financial period dialog ──────────────────────────────────────────

function CreatePeriodDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateFinancialPeriod();
  const [name,  setName]  = useState('');
  const [start, setStart] = useState('');
  const [end,   setEnd]   = useState('');

  function reset() { setName(''); setStart(''); setEnd(''); }

  async function handleSubmit() {
    if (!name.trim() || !start || !end) {
      toast({ title: 'Fyll i alla obligatoriska fält', variant: 'destructive' }); return;
    }
    try {
      await create.mutateAsync({ name: name.trim(), period_start: start, period_end: end });
      toast({ title: `Period "${name.trim()}" skapad` });
      reset(); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-4">
          <DialogTitle>Ny bokföringsperiod</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Periodnamn <span className="text-destructive">*</span></Label>
            <Input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="T.ex. Jan 2026 eller Q1 2026"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Periodens start <span className="text-destructive">*</span></Label>
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Periodens slut <span className="text-destructive">*</span></Label>
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || !start || !end || create.isPending}
            className="w-full"
          >
            {create.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Skapa period
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign period to fiscal year dialog ──────────────────────────────────────

function AssignPeriodDialog({
  fy, assignedPeriodIds, onClose,
}: { fy: FiscalYearOverview; assignedPeriodIds: string[]; onClose: () => void }) {
  const { data: allPeriods = [] } = useFinancialPeriods();
  const assign = useAssignPeriodToFiscalYear();
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [isYearEnd, setIsYearEnd] = useState(false);

  const unassigned = allPeriods.filter(
    (p: FinancialPeriod) => !assignedPeriodIds.includes(p.id)
  );

  async function handleAssign() {
    if (!selectedPeriodId) { toast({ title: 'Välj en period', variant: 'destructive' }); return; }
    try {
      await assign.mutateAsync({ fyId: fy.fiscal_year_id, periodId: selectedPeriodId, isYearEnd });
      const pname = unassigned.find((p: FinancialPeriod) => p.id === selectedPeriodId)?.name ?? '';
      toast({ title: `Period "${pname}" tilldelad räkenskapsår ${fy.year_number}` });
      setSelectedPeriodId(''); setIsYearEnd(false); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) { setSelectedPeriodId(''); setIsYearEnd(false); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Tilldela period — Räkenskapsår {fy.year_number}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground">
            Välj en bokföringsperiod att koppla till detta räkenskapsår.
          </p>
          {unassigned.length === 0 ? (
            <p className="text-sm text-amber-600">
              Inga otilldelade perioder hittades. Skapa en ny bokföringsperiod i fliken Perioder.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Period <span className="text-destructive">*</span></Label>
              <select
                value={selectedPeriodId}
                onChange={e => setSelectedPeriodId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Välj period…</option>
                {unassigned.map((p: FinancialPeriod) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatDate(p.period_start)} – {formatDate(p.period_end)})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <input
              id="is-year-end"
              type="checkbox"
              checked={isYearEnd}
              onChange={e => setIsYearEnd(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="is-year-end" className="text-sm cursor-pointer">
              Markera som bokslutsperiod (sista perioden i räkenskapsåret)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button onClick={() => void handleAssign()} disabled={!selectedPeriodId || assign.isPending || unassigned.length === 0}>
            {assign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tilldela'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fiscal year row ──────────────────────────────────────────────────────────

function FiscalYearRow({ fy, periods }: { fy: FiscalYearOverview; periods: PeriodReadiness[] }) {
  const validateFY        = useValidateFiscalYear();
  const postEarnings      = usePostRetainedEarnings();
  const closeFY           = useCloseFiscalYear();
  const rollover          = useRolloverOpeningBalances();
  const [validation, setValidation]     = useState<ValidationResult | null>(null);
  const [rolloverPeriod, setRolloverPeriod] = useState('');
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [assignOpen, setAssignOpen]     = useState(false);

  const isClosed = fy.fiscal_year_status === 'closed';

  const openPeriods = periods.filter(p => p.status === 'open');

  async function handleValidate() {
    try {
      const result = await validateFY.mutateAsync(fy.fiscal_year_id);
      setValidation(result);
    } catch (e) {
      toast({ title: 'Validering misslyckades', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handlePostEarnings() {
    try {
      await postEarnings.mutateAsync(fy.fiscal_year_id);
      toast({ title: 'Balanserat resultat bokfört', description: 'DR 8999 / CR 2099 postades.' });
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handleClose() {
    try {
      await closeFY.mutateAsync(fy.fiscal_year_id);
      toast({ title: `Räkenskapsår ${fy.year_number} avslutat` });
      setConfirmClose(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Okänt fel';
      toast({ title: 'Avslutning misslyckades', description: msgToSwedish(msg), variant: 'destructive' });
    }
  }

  async function handleRollover() {
    if (!rolloverPeriod) { toast({ title: 'Välj målperiod', variant: 'destructive' }); return; }
    try {
      const result = await rollover.mutateAsync({ fyId: fy.fiscal_year_id, targetPeriodId: rolloverPeriod });
      toast({ title: `Ingångssaldon överförda`, description: `${result.accounts_rolled_over} konton rullades över.` });
      setRolloverPeriod(''); setRolloverOpen(false);
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <>
      <div className="px-5 py-4 border-b last:border-0 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3 justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">Räkenskapsår {fy.year_number}</p>
              <FYBadge status={fy.fiscal_year_status} />
              {fy.retained_earnings_entry_id && (
                <span className="text-xs text-green-600 font-medium">✓ Balanserat</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDate(fy.year_start)} – {formatDate(fy.year_end)}
            </p>
          </div>
          {fy.closed_at && (
            <p className="text-xs text-muted-foreground shrink-0">{formatDate(fy.closed_at)}</p>
          )}
        </div>

        {/* Period counts */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{fy.total_periods} perioder</span>
          {fy.open_periods       > 0 && <span className="text-blue-600">{fy.open_periods} öppna</span>}
          {fy.soft_closed_periods > 0 && <span className="text-amber-600">{fy.soft_closed_periods} mjukstängda</span>}
          {fy.hard_closed_periods > 0 && <span className="text-green-600">{fy.hard_closed_periods} låsta</span>}
        </div>

        {/* Actions */}
        {!isClosed && (
          <PermissionGate permission={Permissions.FINANCE_YEAR_END_MANAGE}>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleValidate} disabled={validateFY.isPending}>
                {validateFY.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                Validera
              </Button>

              {!fy.retained_earnings_entry_id && (
                <Button size="sm" variant="outline" onClick={handlePostEarnings} disabled={postEarnings.isPending}>
                  {postEarnings.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Bokför balanserat res.
                </Button>
              )}

              {fy.retained_earnings_entry_id && !confirmClose && (
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => setConfirmClose(true)}>
                  <Archive className="w-3.5 h-3.5 mr-1.5" /> Avsluta år
                </Button>
              )}

              {confirmClose && (
                <div className="w-full flex items-center gap-2 rounded-lg border border-destructive/30 p-2 bg-red-50/50 dark:bg-red-900/10">
                  <p className="text-xs text-destructive flex-1">Bekräfta avslutning av räkenskapsår {fy.year_number}?</p>
                  <Button size="sm" variant="destructive" onClick={handleClose} disabled={closeFY.isPending}>
                    {closeFY.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Avsluta'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmClose(false)}>Avbryt</Button>
                </div>
              )}

              <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Tilldela period
              </Button>

              {isClosed === false && (
                <Button size="sm" variant="outline" onClick={() => setRolloverOpen(true)}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Rulla ingångssaldon
                </Button>
              )}
            </div>
          </PermissionGate>
        )}
      </div>

      {assignOpen && (
        <AssignPeriodDialog
          fy={fy}
          assignedPeriodIds={[]}
          onClose={() => setAssignOpen(false)}
        />
      )}

      {/* Rollover dialog */}
      <Dialog open={rolloverOpen} onOpenChange={v => { if (!v) { setRolloverPeriod(''); setRolloverOpen(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rulla ingångssaldon</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Välj den öppna period i nästa räkenskapsår som ingångssaldona ska postas till.
            </p>
            <div className="space-y-1.5">
              <Label>Målperiod <span className="text-destructive">*</span></Label>
              <select
                value={rolloverPeriod}
                onChange={e => setRolloverPeriod(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Välj period…</option>
                {openPeriods.map(p => (
                  <option key={p.period_id} value={p.period_id}>
                    {p.period_name} ({formatDate(p.period_start)} – {formatDate(p.period_end)})
                  </option>
                ))}
              </select>
              {openPeriods.length === 0 && (
                <p className="text-xs text-amber-600">Inga öppna perioder tillgängliga.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRolloverPeriod(''); setRolloverOpen(false); }}>Avbryt</Button>
            <Button onClick={handleRollover} disabled={!rolloverPeriod || rollover.isPending}>
              {rollover.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Rulla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ValidationDialog result={validation} title={`Validering — Räkenskapsår ${fy.year_number}`} onClose={() => setValidation(null)} />
    </>
  );
}

// ─── Error message Swedish mapper ─────────────────────────────────────────────

function msgToSwedish(msg: string): string {
  if (msg.includes('PERIOD_NOT_OPEN'))       return 'Perioden måste vara öppen för att mjukstängas.';
  if (msg.includes('PERIOD_NOT_SOFT_CLOSED')) return 'Perioden måste vara mjukstängd för att låsas.';
  if (msg.includes('PERIOD_LOCKED'))         return 'Perioden är redan låst.';
  if (msg.includes('CLOSE_BLOCKED'))         return 'Stängning blockeras av misslyckade kontroller.';
  if (msg.includes('HARD_CLOSE_BLOCKED'))    return 'Hårdstängning kräver att alla kontroller har passerats.';
  if (msg.includes('FISCAL_YEAR_ALREADY'))   return 'Räkenskapsåret är redan avslutat.';
  if (msg.includes('FISCAL_YEAR_CLOSE_BLOCKED')) return 'Avslutning blockeras — alla perioder måste vara låsta.';
  if (msg.includes('NO_INCOME_ACCOUNTS'))    return 'Inga resultatkonton med saldon hittades.';
  return msg;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FinancialClosePage() {
  const { data: periods     = [], isLoading: perLoading, isError: perError  } = usePeriodReadiness();
  const { data: fiscalYears = [], isLoading: fyLoading,  isError: fyError   } = useFiscalYears();

  const [selectedPeriod,   setSelectedPeriod]   = useState<PeriodReadiness | null>(null);
  const [createFYOpen,     setCreateFYOpen]      = useState(false);
  const [createPeriodOpen, setCreatePeriodOpen]  = useState(false);

  const stats = {
    open:   periods.filter(p => p.status === 'open').length,
    closed: periods.filter(p => p.status === 'closed').length,
    locked: periods.filter(p => p.status === 'locked').length,
    ready:  periods.filter(p => p.trial_balance_balanced && p.bank_reconciled).length,
  };

  return (
    <PageLayout>
      <PageHeader
        title="Periodstängning"
        description="Mjuk- och hårdstängning av bokföringsperioder, räkenskapsårsbokslut"
        breadcrumbs={[{ label: 'Hem' }, { label: 'Ekonomi', href: '/finance' }, { label: 'Periodstängning' }]}
        actions={
          <div className="flex items-center gap-2">
            <PermissionGate permission={Permissions.FINANCE_PERIOD_MANAGE}>
              <Button variant="outline" onClick={() => setCreatePeriodOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Ny period
              </Button>
            </PermissionGate>
            <PermissionGate permission={Permissions.FINANCE_YEAR_END_MANAGE}>
              <Button variant="outline" onClick={() => setCreateFYOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Nytt räkenskapsår
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <PageContent>
        <SubscriptionGate feature="finance:financial-close:run">
        <PermissionGate
          permission={Permissions.FINANCE_CLOSE_READ}
          fallback={
            <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Du saknar behörighet (finance:close:read).</p>
            </div>
          }
        >
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Öppna perioder',   value: stats.open,   color: 'text-blue-600'                                                },
              { label: 'Mjukstängda',      value: stats.closed, color: 'text-amber-600'                                               },
              { label: 'Låsta',            value: stats.locked, color: 'text-green-600'                                               },
              { label: 'Klara att stänga', value: stats.ready,  color: stats.ready > 0 ? 'text-green-600' : 'text-muted-foreground'  },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 ${color}`}>
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>

          <Tabs defaultValue="periods">
            <TabsList className="mb-4">
              <TabsTrigger value="periods">
                Perioder
                {periods.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{periods.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="fiscal-years">
                Räkenskapsår
                {fiscalYears.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{fiscalYears.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* Periods tab */}
            <TabsContent value="periods">
              {perError ? (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">Kunde inte hämta perioder.</p>
                </div>
              ) : perLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Hämtar beredskapsdata…</span>
                </div>
              ) : periods.length === 0 ? (
                <div className="rounded-xl border bg-card p-12 text-center space-y-2">
                  <Lock className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="font-semibold">Inga bokföringsperioder</p>
                  <p className="text-sm text-muted-foreground">Skapa perioder i kontoplansinställningarna.</p>
                </div>
              ) : (
                <div className="rounded-xl border bg-card overflow-hidden">
                  {periods.map(p => {
                    const readyChecks = [p.trial_balance_balanced, p.bank_reconciled, p.ar_reconciled].filter(Boolean).length;
                    const totalChecks = 3;
                    return (
                      <div
                        key={p.period_id}
                        onClick={() => setSelectedPeriod(p)}
                        className="flex items-center gap-4 px-5 py-4 border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{p.period_name}</p>
                            <PeriodBadge status={p.status} />
                            {!p.trial_balance_balanced && (
                              <span className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">
                                Obalans
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span>{formatDate(p.period_start)} – {formatDate(p.period_end)}</span>
                            <span>{p.posted_entry_count} bokf.</span>
                            <span className={readyChecks === totalChecks ? 'text-green-600' : 'text-amber-600'}>
                              {readyChecks}/{totalChecks} kontroller ✓
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Fiscal years tab */}
            <TabsContent value="fiscal-years">
              {fyError ? (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">Kunde inte hämta räkenskapsår.</p>
                </div>
              ) : fyLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Hämtar räkenskapsår…</span>
                </div>
              ) : fiscalYears.length === 0 ? (
                <div className="rounded-xl border bg-card p-12 text-center space-y-3">
                  <Archive className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="font-semibold">Inga räkenskapsår</p>
                  <p className="text-sm text-muted-foreground">Skapa ett räkenskapsår för att organisera perioder och genomföra bokslut.</p>
                  <PermissionGate permission={Permissions.FINANCE_YEAR_END_MANAGE}>
                    <Button onClick={() => setCreateFYOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" /> Skapa räkenskapsår
                    </Button>
                  </PermissionGate>
                </div>
              ) : (
                <div className="rounded-xl border bg-card overflow-hidden">
                  {fiscalYears.map(fy => (
                    <FiscalYearRow key={fy.fiscal_year_id} fy={fy} periods={periods} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </PermissionGate>
        </SubscriptionGate>
      </PageContent>

      <PeriodDetailSheet period={selectedPeriod} onClose={() => setSelectedPeriod(null)} />
      <CreateFiscalYearSheet open={createFYOpen} onClose={() => setCreateFYOpen(false)} />
      <CreatePeriodDialog open={createPeriodOpen} onClose={() => setCreatePeriodOpen(false)} />
    </PageLayout>
  );
}
