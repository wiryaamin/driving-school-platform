import { useState, useMemo } from 'react';
import {
  Plus, Loader2, AlertCircle, Users, CheckCircle2, Clock, RefreshCw,
  ChevronRight, X, Receipt, Banknote, RotateCcw, ArrowRight,
} from 'lucide-react';
import {
  Button, Input, Label, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Badge, Tabs, TabsContent, TabsList, TabsTrigger,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { useInstructorList } from '@modules/instructors/hooks/useInstructors.js';
import { useFinancialPeriods } from '../hooks/useReconciliation.js';
import { formatCurrency, formatDate } from '../lib/financeUtils.js';
import {
  usePayrollRuns,
  usePayrollRunEntries,
  useCreatePayrollRun,
  useAddPayrollEntry,
  usePostPayrollJournal,
  usePostSalaryPayment,
  useReversePayrollRun,
  useTaxRemittances,
  useCreateTaxRemittance,
  useClearTaxRemittance,
  usePayTaxRemittance,
  useCompleteTaxRemittance,
  type PayrollRun,
  type PayrollEntry,
  type TaxRemittance,
  type PayrollRunStatus,
  type TaxRemittanceStatus,
} from '../hooks/usePayroll.js';

// ─── Status configs ────────────────────────────────────────────────────────────

const RUN_STATUS: Record<PayrollRunStatus, { label: string; color: string }> = {
  draft:     { label: 'Utkast',    color: 'bg-gray-100 text-gray-600'    },
  ready:     { label: 'Klar',      color: 'bg-blue-100 text-blue-700'    },
  posted:    { label: 'Bokförd',   color: 'bg-green-100 text-green-700'  },
  reversed:  { label: 'Återförd',  color: 'bg-orange-100 text-orange-700'},
  corrected: { label: 'Korrigerad',color: 'bg-amber-100 text-amber-700'  },
};

const TAX_STATUS: Record<TaxRemittanceStatus, { label: string; color: string }> = {
  pending:         { label: 'Väntar',     color: 'bg-gray-100 text-gray-600'     },
  clearing_posted: { label: 'Clearad',    color: 'bg-blue-100 text-blue-700'     },
  payment_posted:  { label: 'Betald',     color: 'bg-amber-100 text-amber-700'   },
  completed:       { label: 'Klar',       color: 'bg-green-100 text-green-700'   },
  cancelled:       { label: 'Makulerad',  color: 'bg-red-100 text-red-700'       },
};

const RUN_TYPE_LABELS: Record<string, string> = {
  regular:       'Ordinarie',
  supplementary: 'Tilläggsbetalning',
  correction:    'Korrigering',
};

function RunStatusBadge({ status }: { status: PayrollRunStatus }) {
  const cfg = RUN_STATUS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>;
}

function TaxStatusBadge({ status }: { status: TaxRemittanceStatus }) {
  const cfg = TAX_STATUS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>;
}

// ─── Create Payroll Run Sheet ──────────────────────────────────────────────────

function CreateRunSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createRun = useCreatePayrollRun();
  const { data: periods = [] } = useFinancialPeriods();

  const [periodStart,  setPeriodStart]  = useState('');
  const [periodEnd,    setPeriodEnd]    = useState('');
  const [payDate,      setPayDate]      = useState('');
  const [runType,      setRunType]      = useState<string>('regular');
  const [financialPeriodId, setFinancialPeriodId] = useState('');
  const [notes,        setNotes]        = useState('');

  function reset() {
    setPeriodStart(''); setPeriodEnd(''); setPayDate('');
    setRunType('regular'); setFinancialPeriodId(''); setNotes('');
  }

  async function handleSubmit() {
    if (!periodStart || !periodEnd) {
      toast({ title: 'Ange löneperiod', variant: 'destructive' }); return;
    }
    try {
      await createRun.mutateAsync({
        pay_period_start:     periodStart,
        pay_period_end:       periodEnd,
        pay_date:             payDate   || undefined,
        run_type:             runType as 'regular' | 'supplementary' | 'correction',
        financial_period_id:  financialPeriodId || undefined,
        notes:                notes    || undefined,
      });
      toast({ title: 'Lönekörning skapad' });
      reset(); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle>Ny lönekörning</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period från <span className="text-destructive">*</span></Label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Period till <span className="text-destructive">*</span></Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Utbetalningsdatum</Label>
            <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Körningstyp</Label>
            <Select value={runType} onValueChange={setRunType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">Ordinarie</SelectItem>
                <SelectItem value="supplementary">Tilläggsbetalning</SelectItem>
                <SelectItem value="correction">Korrigering</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periods.length > 0 && (
            <div className="space-y-1.5">
              <Label>Bokföringsperiod</Label>
              <Select value={financialPeriodId} onValueChange={setFinancialPeriodId}>
                <SelectTrigger><SelectValue placeholder="Välj period (valfritt)" /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({formatDate(p.period_start)} – {formatDate(p.period_end)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Anteckning</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="resize-none h-20" placeholder="Valfri anteckning…" />
          </div>
          <Button onClick={handleSubmit} disabled={!periodStart || !periodEnd || createRun.isPending} className="w-full">
            {createRun.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Skapa körning
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Entry Dialog ──────────────────────────────────────────────────────────

function AddEntryDialog({ run, onClose }: { run: PayrollRun | null; onClose: () => void }) {
  const { data: instructorData } = useInstructorList({ per_page: 100 });
  const instructors = instructorData?.data ?? [];
  const addEntry = useAddPayrollEntry();

  const [instructorId,  setInstructorId]  = useState('');
  const [grossSalary,   setGrossSalary]   = useState('');
  const [withheldTax,   setWithheldTax]   = useState('');
  const [contribRate,   setContribRate]   = useState('31.42');
  const [pension,       setPension]       = useState('0');
  const [benefits,      setBenefits]      = useState('0');
  const [notes,         setNotes]         = useState('');

  const selectedInstructor = instructors.find(i => i.id === instructorId);
  const grossNum  = parseFloat(grossSalary)  || 0;
  const taxNum    = parseFloat(withheldTax)  || 0;
  const rateNum   = parseFloat(contribRate)  / 100 || 0.3142;
  const contribAmt = grossNum * rateNum;
  const netPay    = grossNum - taxNum;

  function reset() {
    setInstructorId(''); setGrossSalary(''); setWithheldTax('');
    setContribRate('31.42'); setPension('0'); setBenefits('0'); setNotes('');
  }

  async function handleAdd() {
    if (!run || !instructorId || !grossSalary) {
      toast({ title: 'Fyll i obligatoriska fält', variant: 'destructive' }); return;
    }
    if (!selectedInstructor?.user_id) {
      toast({ title: 'Instruktören saknar kopplat användarkonto', variant: 'destructive' }); return;
    }
    if (taxNum > grossNum) {
      toast({ title: 'Källskatt kan inte överstiga bruttolön', variant: 'destructive' }); return;
    }
    try {
      await addEntry.mutateAsync({
        run_id:                run.id,
        employee_id:           selectedInstructor.user_id,
        instructor_id:         instructorId,
        gross_salary:          grossNum,
        withheld_tax:          taxNum,
        employer_contrib_rate: rateNum,
        pension_amount:        parseFloat(pension)   || 0,
        benefits_amount:       parseFloat(benefits)  || 0,
        notes:                 notes || undefined,
      });
      toast({ title: `${selectedInstructor.first_name} ${selectedInstructor.last_name} tillagd` });
      reset(); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={Boolean(run)} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lägg till lönepost</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Instruktör <span className="text-destructive">*</span></Label>
            <Select value={instructorId} onValueChange={setInstructorId}>
              <SelectTrigger>
                <SelectValue placeholder="Välj instruktör…" />
              </SelectTrigger>
              <SelectContent>
                {instructors.filter(i => i.user_id).map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.first_name} {i.last_name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({i.employment_type === 'employed' ? 'Anställd' : 'Konsult'})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {instructors.filter(i => !i.user_id).length > 0 && (
              <p className="text-xs text-amber-600">
                {instructors.filter(i => !i.user_id).length} instruktörer saknar användarkonto och visas inte.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bruttolön (kr) <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" step="100" value={grossSalary} onChange={e => setGrossSalary(e.target.value)} placeholder="35 000" />
            </div>
            <div className="space-y-1.5">
              <Label>Källskatt (kr)</Label>
              <Input type="number" min="0" step="100" value={withheldTax} onChange={e => setWithheldTax(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Arbetsgivaravgift %</Label>
              <Input type="number" min="0" max="100" step="0.01" value={contribRate} onChange={e => setContribRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Pension (kr)</Label>
              <Input type="number" min="0" step="100" value={pension} onChange={e => setPension(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Förmåner (kr)</Label>
              <Input type="number" min="0" step="100" value={benefits} onChange={e => setBenefits(e.target.value)} />
            </div>
          </div>

          {/* Live calculation preview */}
          {grossNum > 0 && (
            <div className="rounded-lg bg-muted/50 border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bruttolön</span>
                <span className="font-mono">{formatCurrency(grossNum)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">− Källskatt</span>
                <span className="font-mono text-red-600">−{formatCurrency(taxNum)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1.5 mt-1.5">
                <span>Nettolön</span>
                <span className="font-mono">{formatCurrency(netPay)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Arbetsgivaravgift ({contribRate}%)</span>
                <span className="font-mono">{formatCurrency(contribAmt)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total lönekostnad</span>
                <span className="font-mono">{formatCurrency(grossNum + contribAmt)}</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Anteckning</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Valfri anteckning…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Avbryt</Button>
          <Button onClick={handleAdd} disabled={!instructorId || !grossSalary || addEntry.isPending}>
            {addEntry.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Lägg till
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Post Journal Dialog ───────────────────────────────────────────────────────

function PostJournalDialog({ run, onClose }: { run: PayrollRun | null; onClose: () => void }) {
  const post = usePostPayrollJournal(run?.id ?? '');

  async function handlePost() {
    if (!run) return;
    try {
      await post.mutateAsync();
      toast({ title: 'Lönejournalen bokförd', description: 'DR 7010 / CR 2940+2710+2731 postades.' });
      onClose();
    } catch (e) {
      toast({ title: 'Bokföring misslyckades', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={Boolean(run)} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bokför lönejournal</DialogTitle></DialogHeader>
        {run && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2 bg-muted/30 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span>{formatDate(run.pay_period_start)} – {formatDate(run.pay_period_end)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Brutto totalt</span><span className="font-mono font-semibold">{formatCurrency(run.total_gross)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Arbetsgivaravgift</span><span className="font-mono">{formatCurrency(run.total_employer_contrib)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Källskatt</span><span className="font-mono">{formatCurrency(run.total_withheld_tax)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-2"><span>Nettolön</span><span className="font-mono">{formatCurrency(run.total_net_pay)}</span></div>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Kontering som skapas:</p>
              <p>DR 7010 Löner {formatCurrency(run.total_gross)}</p>
              <p>CR 2940 Personalens källskatt {formatCurrency(run.total_withheld_tax)}</p>
              <p>CR 2710 Arbetsgivaravgifter {formatCurrency(run.total_employer_contrib)}</p>
              <p>CR 2731 Nettolöner att utbetala {formatCurrency(run.total_net_pay)}</p>
            </div>
            <p className="text-xs text-muted-foreground">Åtgärden är oåterkalllelig. Se till att alla lönerader är korrekta innan du bokför.</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button onClick={handlePost} disabled={post.isPending}>
            {post.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4 mr-1" />}
            Bokför
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Salary Payment Dialog ─────────────────────────────────────────────────────

function SalaryPaymentDialog({ run, onClose }: { run: PayrollRun | null; onClose: () => void }) {
  const postPayment = usePostSalaryPayment(run?.id ?? '');
  const [paymentDate, setPaymentDate] = useState('');
  const [bankAccount, setBankAccount] = useState('1930');

  async function handlePost() {
    if (!run || !paymentDate) { toast({ title: 'Ange utbetalningsdatum', variant: 'destructive' }); return; }
    try {
      await postPayment.mutateAsync({ payment_date: paymentDate, bank_account: bankAccount });
      toast({ title: 'Löner utbetalda', description: 'DR 2940 / CR 1930 postades.' });
      setPaymentDate(''); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={Boolean(run)} onOpenChange={v => { if (!v) { setPaymentDate(''); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Utbetala nettolöner</DialogTitle></DialogHeader>
        {run && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/30 text-sm flex justify-between">
              <span className="text-muted-foreground">Nettolön att betala ut</span>
              <span className="font-mono font-bold">{formatCurrency(run.total_net_pay)}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Utbetalningsdatum <span className="text-destructive">*</span></Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bankkonto (BAS)</Label>
              <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="1930" />
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
              DR 2940 Nettolöner att utbetala {formatCurrency(run.total_net_pay)}<br />
              CR {bankAccount} Bank {formatCurrency(run.total_net_pay)}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { setPaymentDate(''); onClose(); }}>Avbryt</Button>
          <Button onClick={handlePost} disabled={!paymentDate || postPayment.isPending}>
            {postPayment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4 mr-1" />}
            Bokför utbetalning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Run Detail Sheet ──────────────────────────────────────────────────────────

function RunDetailSheet({ run, onClose }: { run: PayrollRun | null; onClose: () => void }) {
  const { data: entries = [], isLoading } = usePayrollRunEntries(run?.id ?? null);
  const reverse = useReversePayrollRun(run?.id ?? '');
  const [addEntryOpen,    setAddEntryOpen]    = useState(false);
  const [postJournalOpen, setPostJournalOpen] = useState(false);
  const [salaryPayOpen,   setSalaryPayOpen]   = useState(false);
  const [reverseReason,   setReverseReason]   = useState('');
  const [reverseOpen,     setReverseOpen]     = useState(false);

  const canAddEntry    = run?.status === 'draft';
  const canPostJournal = run?.status === 'draft' && (run?.entry_count ?? 0) > 0;
  const canPaySalary   = run?.status === 'posted' && !run.salary_payment_entry_id;
  const isPosted       = run?.status === 'posted';

  async function handleReverse() {
    if (!reverseReason.trim()) { toast({ title: 'Ange skäl för återföring', variant: 'destructive' }); return; }
    try {
      await reverse.mutateAsync(reverseReason);
      toast({ title: 'Lönekörning återförd' });
      setReverseOpen(false); setReverseReason('');
    } catch (e) {
      toast({ title: 'Återföring misslyckades', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <>
      <Dialog open={Boolean(run)} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="w-full sm:max-w-xl max-h-[85vh] overflow-y-auto p-0">
          {run && (
            <>
              {/* Sticky header */}
              <div className="sticky top-0 z-10 bg-background border-b px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold">
                        {formatDate(run.pay_period_start)} – {formatDate(run.pay_period_end)}
                      </p>
                      <RunStatusBadge status={run.status} />
                      <Badge variant="outline" className="text-xs">{RUN_TYPE_LABELS[run.run_type] ?? run.run_type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{run.entry_count} lönerader · Skapad {formatDate(run.created_at)}</p>
                  </div>
                  <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="px-5 py-5 space-y-5">
                {/* Totals summary */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Bruttolön',        value: run.total_gross            },
                    { label: 'Arbetsgivaravg.',   value: run.total_employer_contrib },
                    { label: 'Källskatt',         value: run.total_withheld_tax    },
                    { label: 'Nettolön',          value: run.total_net_pay         },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <p className="font-mono font-semibold text-sm">{formatCurrency(value)}</p>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {canAddEntry && (
                    <Button size="sm" onClick={() => setAddEntryOpen(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Lägg till lönepost
                    </Button>
                  )}
                  {canPostJournal && (
                    <Button size="sm" variant="outline" onClick={() => setPostJournalOpen(true)}>
                      <Receipt className="w-3.5 h-3.5 mr-1.5" /> Bokför lönejournal
                    </Button>
                  )}
                  {canPaySalary && (
                    <Button size="sm" variant="outline" onClick={() => setSalaryPayOpen(true)}>
                      <Banknote className="w-3.5 h-3.5 mr-1.5" /> Utbetala nettolöner
                    </Button>
                  )}
                  {isPosted && (
                    <Button size="sm" variant="outline" onClick={() => setReverseOpen(true)} className="text-destructive hover:text-destructive">
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Återför
                    </Button>
                  )}
                </div>

                {/* Status indicators */}
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {run.journal_entry_id && (
                    <p className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Lönejournal bokförd {run.posted_at ? formatDate(run.posted_at) : ''}
                    </p>
                  )}
                  {run.salary_payment_entry_id && (
                    <p className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Nettolöner utbetalda
                    </p>
                  )}
                  {run.notes && <p className="italic">{run.notes}</p>}
                </div>

                {/* Entries */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Lönerader ({run.entry_count})
                  </p>
                  {isLoading ? (
                    <div className="flex items-center gap-2 py-6 text-muted-foreground justify-center text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Hämtar…
                    </div>
                  ) : entries.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      Inga lönerader tillagda.
                      {canAddEntry && (
                        <button onClick={() => setAddEntryOpen(true)} className="block mx-auto mt-2 text-primary hover:underline text-sm">
                          Lägg till den första →
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border divide-y overflow-hidden">
                      {entries.map((e: PayrollEntry) => (
                        <div key={e.id} className="px-4 py-3 text-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="font-medium">{e.employee_id.slice(0, 8)}…</p>
                            <span className="font-mono font-semibold">{formatCurrency(e.gross_salary)}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Netto {formatCurrency(e.net_pay)}</span>
                            <span>Skatt {formatCurrency(e.withheld_tax)}</span>
                            <span>Arbg.avg. {formatCurrency(e.employer_contrib_amount)}</span>
                          </div>
                          {e.notes && <p className="text-xs italic text-muted-foreground mt-0.5">{e.notes}</p>}
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

      {/* Sub-dialogs */}
      <AddEntryDialog    run={addEntryOpen ? run : null}    onClose={() => setAddEntryOpen(false)} />
      <PostJournalDialog run={postJournalOpen ? run : null} onClose={() => setPostJournalOpen(false)} />
      <SalaryPaymentDialog run={salaryPayOpen ? run : null} onClose={() => setSalaryPayOpen(false)} />

      {/* Reverse dialog */}
      <Dialog open={reverseOpen} onOpenChange={v => { if (!v) setReverseOpen(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Återför lönekörning</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Återföringen skapar en motbokning av hela lönejournalen. Åtgärden kan inte ångras.</p>
            <div className="space-y-1.5">
              <Label>Skäl <span className="text-destructive">*</span></Label>
              <Textarea value={reverseReason} onChange={e => setReverseReason(e.target.value)} className="resize-none h-20" placeholder="Beskriv orsaken till återföringen…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleReverse} disabled={!reverseReason.trim() || reverse.isPending}>
              {reverse.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
              Återför
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Tax Remittance Sheet ──────────────────────────────────────────────────────

function CreateRemittanceSheet({ open, onClose, runs }: {
  open:    boolean;
  onClose: () => void;
  runs:    PayrollRun[];
}) {
  const createRemittance = useCreateTaxRemittance();
  const { data: periods = [] } = useFinancialPeriods();

  const [periodStart,    setPeriodStart]    = useState('');
  const [periodEnd,      setPeriodEnd]      = useState('');
  const [dueDate,        setDueDate]        = useState('');
  const [withheldTax,    setWithheldTax]    = useState('');
  const [employerContrib,setEmployerContrib]= useState('');
  const [runId,          setRunId]          = useState('');
  const [periodId,       setPeriodId]       = useState('');
  const [notes,          setNotes]          = useState('');

  // Auto-fill from selected run
  function handleRunSelect(id: string) {
    setRunId(id);
    const r = runs.find(r => r.id === id);
    if (r) {
      setWithheldTax(String(r.total_withheld_tax));
      setEmployerContrib(String(r.total_employer_contrib));
      setPeriodStart(r.pay_period_start);
      setPeriodEnd(r.pay_period_end);
    }
  }

  function reset() {
    setPeriodStart(''); setPeriodEnd(''); setDueDate(''); setWithheldTax('');
    setEmployerContrib(''); setRunId(''); setPeriodId(''); setNotes('');
  }

  async function handleSubmit() {
    if (!periodStart || !periodEnd || !withheldTax || !employerContrib) {
      toast({ title: 'Fyll i obligatoriska fält', variant: 'destructive' }); return;
    }
    try {
      await createRemittance.mutateAsync({
        declaration_period_start: periodStart,
        declaration_period_end:   periodEnd,
        due_date:                 dueDate         || undefined,
        withheld_tax_amount:      parseFloat(withheldTax)     || 0,
        employer_contrib_amount:  parseFloat(employerContrib) || 0,
        payroll_run_id:           runId           || undefined,
        financial_period_id:      periodId        || undefined,
        notes:                    notes           || undefined,
      });
      toast({ title: 'Skatteredovisning skapad' });
      reset(); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  const total = (parseFloat(withheldTax) || 0) + (parseFloat(employerContrib) || 0);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle>Ny skatteredovisning</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {runs.filter(r => r.status === 'posted').length > 0 && (
            <div className="space-y-1.5">
              <Label>Fyll från lönekörning (valfritt)</Label>
              <Select value={runId} onValueChange={handleRunSelect}>
                <SelectTrigger><SelectValue placeholder="Välj körning…" /></SelectTrigger>
                <SelectContent>
                  {runs.filter(r => r.status === 'posted').map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {formatDate(r.pay_period_start)} – {formatDate(r.pay_period_end)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Deklarationsperiod från <span className="text-destructive">*</span></Label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Deklarationsperiod till <span className="text-destructive">*</span></Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Förfallodatum (Skatteverket)</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Normalt den 12:e månaden efter lönemånaden.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Källskatt (kr) <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" value={withheldTax} onChange={e => setWithheldTax(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Arbetsgivaravgift (kr) <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" value={employerContrib} onChange={e => setEmployerContrib(e.target.value)} placeholder="0" />
            </div>
          </div>

          {total > 0 && (
            <div className="rounded-lg border p-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Total att betala till Skatteverket</span>
              <span className="font-mono font-bold">{formatCurrency(total)}</span>
            </div>
          )}

          {periods.length > 0 && (
            <div className="space-y-1.5">
              <Label>Bokföringsperiod</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="Välj period (valfritt)" /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({formatDate(p.period_start)} – {formatDate(p.period_end)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Anteckning</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Valfri anteckning…" />
          </div>

          <Button onClick={handleSubmit} disabled={!periodStart || !periodEnd || !withheldTax || !employerContrib || createRemittance.isPending} className="w-full">
            {createRemittance.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Skapa redovisning
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tax Remittance Row ────────────────────────────────────────────────────────

function TaxRemittanceRow({ remittance }: { remittance: TaxRemittance }) {
  const clear    = useClearTaxRemittance(remittance.id);
  const pay      = usePayTaxRemittance(remittance.id);
  const complete = useCompleteTaxRemittance(remittance.id);

  const [payDate, setPayDate]   = useState('');
  const [payRef,  setPayRef]    = useState('');
  const [payOpen, setPayOpen]   = useState(false);

  async function handleClear() {
    try {
      await clear.mutateAsync();
      toast({ title: 'Skatteskulder clearade', description: 'DR 2710+2731 / CR 1630 postades.' });
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handlePay() {
    if (!payDate) { toast({ title: 'Ange betalningsdatum', variant: 'destructive' }); return; }
    try {
      await pay.mutateAsync({ payment_date: payDate, reference: payRef || undefined });
      toast({ title: 'Skattebetalning bokförd', description: 'DR 1630 / CR 1930 postades.' });
      setPayDate(''); setPayRef(''); setPayOpen(false);
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handleComplete() {
    try {
      await complete.mutateAsync();
      toast({ title: 'Redovisning markerad som klar' });
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  const canClear    = remittance.status === 'pending';
  const canPay      = remittance.status === 'clearing_posted';
  const canComplete = remittance.status === 'payment_posted';

  return (
    <>
      <div className="px-5 py-4 flex items-start gap-4 border-b last:border-0 hover:bg-muted/20 transition-colors">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">
              {formatDate(remittance.declaration_period_start)} – {formatDate(remittance.declaration_period_end)}
            </p>
            <TaxStatusBadge status={remittance.status} />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span>Källskatt {formatCurrency(remittance.withheld_tax_amount)}</span>
            <span>Arbg.avg. {formatCurrency(remittance.employer_contrib_amount)}</span>
            <span className="font-semibold text-foreground">Totalt {formatCurrency(remittance.total_amount)}</span>
            {remittance.due_date && (
              <span className={new Date(remittance.due_date) < new Date() && remittance.status !== 'completed' ? 'text-destructive font-medium' : ''}>
                Förfaller {formatDate(remittance.due_date)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canClear && (
            <Button size="sm" variant="outline" onClick={handleClear} disabled={clear.isPending}>
              {clear.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5 mr-1" />}
              Cleara
            </Button>
          )}
          {canPay && (
            <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
              <Banknote className="w-3.5 h-3.5 mr-1" /> Betala
            </Button>
          )}
          {canComplete && (
            <Button size="sm" onClick={handleComplete} disabled={complete.isPending}>
              {complete.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              Klar
            </Button>
          )}
        </div>
      </div>

      {/* Pay dialog */}
      <Dialog open={payOpen} onOpenChange={v => { if (!v) { setPayDate(''); setPayRef(''); setPayOpen(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Betala till Skatteverket</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Belopp</span>
              <span className="font-mono font-bold">{formatCurrency(remittance.total_amount)}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Betalningsdatum <span className="text-destructive">*</span></Label>
              <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Referens (OCR / skattekontonummer)</Label>
              <Input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Skattekontonummer…" />
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
              DR 1630 Skattekonto {formatCurrency(remittance.total_amount)}<br />
              CR 1930 Bank {formatCurrency(remittance.total_amount)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayDate(''); setPayRef(''); setPayOpen(false); }}>Avbryt</Button>
            <Button onClick={handlePay} disabled={!payDate || pay.isPending}>
              {pay.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4 mr-1" />}
              Bokför betalning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── PayrollPage ───────────────────────────────────────────────────────────────

export function PayrollPage() {
  const { data: runs = [],         isLoading: runsLoading,  isError: runsError  } = usePayrollRuns();
  const { data: remittances = [],  isLoading: taxLoading,   isError: taxError   } = useTaxRemittances();

  const [createRunOpen,        setCreateRunOpen]        = useState(false);
  const [createRemittanceOpen, setCreateRemittanceOpen] = useState(false);
  const [selectedRun,          setSelectedRun]          = useState<PayrollRun | null>(null);

  const stats = useMemo(() => ({
    totalGross:     runs.reduce((s, r) => s + r.total_gross, 0),
    postedCount:    runs.filter(r => r.status === 'posted').length,
    pendingTax:     remittances.filter(r => r.status !== 'completed' && r.status !== 'cancelled').reduce((s, r) => s + r.total_amount, 0),
    overdueCount:   remittances.filter(r => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'completed').length,
  }), [runs, remittances]);

  return (
    <PageLayout>
      <PageHeader
        title="Lönehantering"
        description="Lönekörningar, skatteredovisning och arbetsgivaravgifter"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCreateRemittanceOpen(true)}>
              <Receipt className="w-4 h-4 mr-2" /> Skatteredovisning
            </Button>
            <Button onClick={() => setCreateRunOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Ny lönekörning
            </Button>
          </div>
        }
      />

      <PageContent>
        <SubscriptionGate feature="finance:payroll:run">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total bruttolön',    value: formatCurrency(stats.totalGross),  sub: 'Alla körningar', icon: Banknote,     color: 'text-blue-600'  },
            { label: 'Bokförda körningar', value: String(stats.postedCount),         sub: `av ${runs.length} totalt`, icon: CheckCircle2, color: 'text-green-600' },
            { label: 'Utestående skatt',   value: formatCurrency(stats.pendingTax),  sub: 'Ej betald till Skatteverket', icon: Clock, color: stats.pendingTax > 0 ? 'text-amber-600' : 'text-green-600' },
            { label: 'Förfallna',          value: String(stats.overdueCount),        sub: 'Skatteredovisningar', icon: AlertCircle, color: stats.overdueCount > 0 ? 'text-red-600' : 'text-green-600' },
          ].map(({ label, value, sub, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                <p className="text-[10px] text-muted-foreground">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="runs">
          <TabsList className="mb-4">
            <TabsTrigger value="runs">
              Lönekörningar
              {runs.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{runs.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="tax">
              Skatteredovisning
              {stats.overdueCount > 0 && <Badge variant="destructive" className="ml-2 text-xs">{stats.overdueCount}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* Payroll runs tab */}
          <TabsContent value="runs">
            {runsError ? (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-sm text-destructive">Kunde inte hämta lönekörningar (finance:payroll:read krävs).</p>
              </div>
            ) : runsLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Hämtar körningar…</span>
              </div>
            ) : runs.length === 0 ? (
              <div className="rounded-xl border bg-card p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
                  <Users className="w-7 h-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold">Inga lönekörningar</p>
                  <p className="text-sm text-muted-foreground mt-1">Skapa en lönekörning för att registrera månadslöner.</p>
                </div>
                <Button onClick={() => setCreateRunOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Skapa lönekörning
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                {runs.map(run => (
                  <div
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className="flex items-center gap-4 px-5 py-4 border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold">
                          {formatDate(run.pay_period_start)} – {formatDate(run.pay_period_end)}
                        </p>
                        <RunStatusBadge status={run.status} />
                        <span className="text-xs text-muted-foreground">{RUN_TYPE_LABELS[run.run_type] ?? run.run_type}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{run.entry_count} lönerader</span>
                        <span>Brutto {formatCurrency(run.total_gross)}</span>
                        <span>Netto {formatCurrency(run.total_net_pay)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">{formatDate(run.created_at)}</p>
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tax remittance tab */}
          <TabsContent value="tax">
            {taxError ? (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-sm text-destructive">Kunde inte hämta skatteredovisningar (finance:tax:read krävs).</p>
              </div>
            ) : taxLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Hämtar redovisningar…</span>
              </div>
            ) : remittances.length === 0 ? (
              <div className="rounded-xl border bg-card p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
                  <RefreshCw className="w-7 h-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold">Inga skatteredovisningar</p>
                  <p className="text-sm text-muted-foreground mt-1">Skapa en redovisning för att registrera skattebetalning till Skatteverket.</p>
                </div>
                <Button onClick={() => setCreateRemittanceOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Skapa redovisning
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                {remittances.map(r => <TaxRemittanceRow key={r.id} remittance={r} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
        </SubscriptionGate>
      </PageContent>

      {/* Sheets & dialogs */}
      <CreateRunSheet        open={createRunOpen}        onClose={() => setCreateRunOpen(false)} />
      <CreateRemittanceSheet open={createRemittanceOpen} onClose={() => setCreateRemittanceOpen(false)} runs={runs} />
      <RunDetailSheet        run={selectedRun}           onClose={() => setSelectedRun(null)} />
    </PageLayout>
  );
}
