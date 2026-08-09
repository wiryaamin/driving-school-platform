import { useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Layers,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useFinancialPeriods } from '../hooks/useReconciliation.js';
import {
  useAccrualSchedules,
  useAccrualSchedule,
  useDeferredSchedules,
  useCreateAccrualSchedule,
  useReleaseAccrual,
  useCancelAccrual,
  useReleaseDeferredSchedule,
  useRunIntegrityReplay,
  useRunCloseDependencies,
  useGenerateCanonicalExport,
  type AccrualSchedule,
  type AccrualStatus,
  type DeferredSchedule,
  type AccrualType,
  type IntegrityResult,
} from '../hooks/useAccruals.js';
import { formatDate, formatCurrency } from '../lib/financeUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEK = (n: number | null | undefined) =>
  n == null ? '–' : formatCurrency(n, 'SEK');

const ACCRUAL_TYPE_OPTIONS: { value: AccrualType; label: string }[] = [
  { value: 'expense_prepaid',  label: 'Förutbetald kostnad' },
  { value: 'income_accrued',   label: 'Upplupen intäkt' },
  { value: 'deferred_cost',    label: 'Förutbetald utgift' },
  { value: 'deferred_income',  label: 'Upplupet arvode' },
];

function accrualTypeLabel(t: string): string {
  return ACCRUAL_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function progressPercent(s: AccrualSchedule): number {
  if (!s.total_amount || s.total_amount === 0) return 0;
  return Math.min(100, Math.round((s.released_amount / s.total_amount) * 100));
}

// ─── Status badges ─────────────────────────────────────────────────────────────

function AccrualStatusBadge({ status }: { status: AccrualStatus | string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
    active:    { label: 'Aktiv',     cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',    icon: Clock },
    completed: { label: 'Avslutad',  cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle2 },
    cancelled: { label: 'Avbruten',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400',    icon: XCircle },
  };
  const s = map[status] ?? map['active']!;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${s.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {s.label}
    </span>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-muted rounded-full h-1.5">
      <div
        className="bg-blue-500 h-1.5 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Release accrual dialog ───────────────────────────────────────────────────

function ReleaseAccrualDialog({
  schedule,
  onClose,
}: {
  schedule: AccrualSchedule;
  onClose: () => void;
}) {
  const periods   = useFinancialPeriods();
  const release   = useReleaseAccrual(schedule.id);
  const [periodId, setPeriodId] = useState('');

  const openPeriods = (periods.data ?? []).filter((p) => p.status === 'open');
  const nextPct     = progressPercent(schedule);

  async function handleSubmit() {
    if (!periodId) return;
    try {
      await release.mutateAsync(periodId);
      toast({ title: 'Period frisläppt', description: `${schedule.months_released + 1} av ${schedule.release_months} månader bokförda` });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Frisläpp period</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1.5">
            <p className="font-semibold">{schedule.description}</p>
            <p className="text-xs text-muted-foreground">{accrualTypeLabel(schedule.accrual_type)}</p>
            <div className="flex items-center justify-between text-xs mt-1">
              <span>{schedule.months_released} av {schedule.release_months} månader</span>
              <span>{nextPct} %</span>
            </div>
            <ProgressBar pct={nextPct} />
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground">Kvarvarande</span>
              <span className="font-mono font-semibold">{SEK(schedule.remaining_amount)}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Bokföringsperiod</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">Välj period…</option>
              {openPeriods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={!periodId || release.isPending} onClick={() => void handleSubmit()}>
            <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
            Frisläpp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cancel accrual dialog ────────────────────────────────────────────────────

function CancelAccrualDialog({ schedule, onClose }: { schedule: AccrualSchedule; onClose: () => void }) {
  const cancel = useCancelAccrual(schedule.id);
  const [reason, setReason] = useState('');

  async function handleSubmit() {
    try {
      await cancel.mutateAsync(reason.trim() || 'Avbruten av användaren');
      toast({ title: 'Periodisering avbruten' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avbryt periodisering</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Resterande {schedule.release_months - schedule.months_released} perioder avbryts.
            Redan bokförda poster påverkas inte.
          </p>
          <div className="space-y-1.5">
            <Label>Orsak (valfri)</Label>
            <Textarea
              placeholder="Ange orsak till avbrytning…"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button variant="destructive" disabled={cancel.isPending} onClick={() => void handleSubmit()}>
            Avbryt periodisering
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Accrual detail sheet ──────────────────────────────────────────────────────

function AccrualDetailSheet({ scheduleId, onClose }: { scheduleId: string; onClose: () => void }) {
  const { data, isLoading } = useAccrualSchedule(scheduleId);
  const [releasing, setReleasing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const pct = data ? progressPercent(data) : 0;

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isLoading ? 'Laddar…' : (data?.description ?? 'Periodisering')}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
            </div>
          ) : data ? (
            <div className="mt-4 space-y-5">
              {/* Status + type */}
              <div className="flex items-center gap-2 flex-wrap">
                <AccrualStatusBadge status={data.status} />
                <Badge variant="outline" className="text-xs">{accrualTypeLabel(data.accrual_type)}</Badge>
              </div>

              {/* Summary grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Totalt belopp</p>
                  <p className="font-mono font-bold">{SEK(data.total_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Kvarvarande</p>
                  <p className="font-mono font-bold">{SEK(data.remaining_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Frisläppt</p>
                  <p className="font-mono font-semibold text-green-700 dark:text-green-400">{SEK(data.released_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Perioder</p>
                  <p className="font-semibold">{data.months_released} / {data.release_months}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Startdatum</p>
                  <p className="font-medium">{formatDate(data.start_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Skapad</p>
                  <p className="font-medium">{formatDate(data.created_at)}</p>
                </div>
              </div>

              {/* Progress */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Framsteg</span>
                  <span>{pct} %</span>
                </div>
                <ProgressBar pct={pct} />
              </div>

              {/* BAS accounts */}
              <div className="border rounded-lg p-3 bg-muted/30 text-xs space-y-1.5">
                <p className="font-medium text-sm">Bokföringskonton</p>
                <div className="grid grid-cols-2 gap-2">
                  {data.initial_debit_account && (
                    <div><p className="text-muted-foreground">Initial debet</p><p className="font-mono">{data.initial_debit_account}</p></div>
                  )}
                  {data.initial_credit_account && (
                    <div><p className="text-muted-foreground">Initial kredit</p><p className="font-mono">{data.initial_credit_account}</p></div>
                  )}
                  <div><p className="text-muted-foreground">Frisläpp debet</p><p className="font-mono">{data.release_debit_account}</p></div>
                  <div><p className="text-muted-foreground">Frisläpp kredit</p><p className="font-mono">{data.release_credit_account}</p></div>
                </div>
              </div>

              {data.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Anteckningar</p>
                  <p className="text-sm">{data.notes}</p>
                </div>
              )}

              {data.cancel_reason && (
                <div className="flex items-start gap-2 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 bg-red-50 dark:bg-red-950/20 text-sm text-destructive">
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Avbruten</p>
                    <p className="text-xs mt-0.5">{data.cancel_reason}</p>
                  </div>
                </div>
              )}

              {/* Release lines */}
              {data.lines.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Frisläppningsplan</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Period</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Datum</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Belopp</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.lines.map((line) => (
                          <tr key={line.id} className={line.status === 'posted' ? 'bg-green-50/50 dark:bg-green-950/10' : ''}>
                            <td className="px-3 py-1.5 font-semibold">{line.period_number}</td>
                            <td className="px-3 py-1.5">{formatDate(line.release_date)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(line.release_amount, 'SEK')}</td>
                            <td className="px-3 py-1.5">
                              {line.status === 'posted' ? (
                                <span className="inline-flex items-center gap-0.5 text-green-700 dark:text-green-400">
                                  <CheckCircle2 className="w-3 h-3" /> Bokförd
                                </span>
                              ) : line.status === 'skipped' ? (
                                <span className="text-muted-foreground">Hoppades över</span>
                              ) : (
                                <span className="text-muted-foreground">Väntande</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              {data.status === 'active' && (
                <PermissionGate permission={Permissions.FINANCE_ACCRUALS_MANAGE}>
                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="sm" onClick={() => setReleasing(true)}>
                      <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                      Frisläpp period
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setCancelling(true)}
                    >
                      Avbryt
                    </Button>
                  </div>
                </PermissionGate>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {releasing && data && <ReleaseAccrualDialog schedule={data} onClose={() => setReleasing(false)} />}
      {cancelling && data && <CancelAccrualDialog schedule={data} onClose={() => setCancelling(false)} />}
    </>
  );
}

// ─── Create accrual sheet ──────────────────────────────────────────────────────

function CreateAccrualSheet({ onClose }: { onClose: () => void }) {
  const create = useCreateAccrualSchedule();
  const [form, setForm] = useState({
    accrual_type:           'expense_prepaid' as AccrualType,
    description:            '',
    total_amount:           '',
    start_date:             '',
    release_months:         '12',
    release_debit_account:  '',
    release_credit_account: '',
    initial_debit_account:  '',
    initial_credit_account: '',
    notes:                  '',
  });

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit() {
    const amount  = parseFloat(form.total_amount);
    const months  = parseInt(form.release_months, 10);
    if (!form.description || !amount || !form.start_date || !months) return;
    if (!form.release_debit_account || !form.release_credit_account) return;
    try {
      await create.mutateAsync({
        accrual_type:           form.accrual_type,
        description:            form.description.trim(),
        total_amount:           amount,
        start_date:             form.start_date,
        release_months:         months,
        release_debit_account:  form.release_debit_account.trim(),
        release_credit_account: form.release_credit_account.trim(),
        initial_debit_account:  form.initial_debit_account.trim() || undefined,
        initial_credit_account: form.initial_credit_account.trim() || undefined,
        notes:                  form.notes.trim() || undefined,
      });
      toast({ title: 'Periodisering skapad' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  const valid = Boolean(form.description && form.total_amount && form.start_date && form.release_months && form.release_debit_account && form.release_credit_account);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ny periodisering</DialogTitle>
        </DialogHeader>
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.accrual_type} onChange={set('accrual_type')}>
              {ACCRUAL_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Beskrivning</Label>
            <Input placeholder="t.ex. Hyra jan–dec" value={form.description} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Totalt belopp (kr)</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.total_amount} onChange={set('total_amount')} />
            </div>
            <div className="space-y-1.5">
              <Label>Antal månader</Label>
              <Input type="number" min="1" max="120" value={form.release_months} onChange={set('release_months')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Startdatum</Label>
            <Input type="date" value={form.start_date} onChange={set('start_date')} />
          </div>
          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bokföringskonton</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Frisläpp debet (BAS)</Label>
                <Input placeholder="t.ex. 5010" value={form.release_debit_account} onChange={set('release_debit_account')} />
              </div>
              <div className="space-y-1.5">
                <Label>Frisläpp kredit (BAS)</Label>
                <Input placeholder="t.ex. 1710" value={form.release_credit_account} onChange={set('release_credit_account')} />
              </div>
              <div className="space-y-1.5">
                <Label>Initial debet (valfri)</Label>
                <Input placeholder="t.ex. 1710" value={form.initial_debit_account} onChange={set('initial_debit_account')} />
              </div>
              <div className="space-y-1.5">
                <Label>Initial kredit (valfri)</Label>
                <Input placeholder="t.ex. 1930" value={form.initial_credit_account} onChange={set('initial_credit_account')} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Anteckningar (valfritt)</Label>
            <Textarea rows={2} value={form.notes} onChange={set('notes')} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => void handleSubmit()} disabled={!valid || create.isPending}>
              Skapa periodisering
            </Button>
            <Button variant="outline" onClick={onClose}>Avbryt</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Accrual row ──────────────────────────────────────────────────────────────

function AccrualRow({ schedule }: { schedule: AccrualSchedule }) {
  const [open, setOpen] = useState(false);
  const pct = progressPercent(schedule);

  return (
    <>
      <button
        className="w-full text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{schedule.description}</span>
              <AccrualStatusBadge status={schedule.status} />
              <span className="text-xs text-muted-foreground">{accrualTypeLabel(schedule.accrual_type)}</span>
            </div>
            <div className="flex items-center gap-4 mt-1">
              <div className="flex-1 max-w-[160px]">
                <ProgressBar pct={pct} />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {schedule.months_released}/{schedule.release_months} mån
              </span>
            </div>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            <p className="font-mono text-sm font-semibold">{SEK(schedule.remaining_amount)}</p>
            <p className="text-xs text-muted-foreground">kvarstårnde</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </button>
      {open && <AccrualDetailSheet scheduleId={schedule.id} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Accruals tab ──────────────────────────────────────────────────────────────

function AccrualsTab() {
  const [statusFilter, setStatusFilter] = useState('active');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [creating,     setCreating]     = useState(false);

  const { data, isLoading } = useAccrualSchedules({
    status:       statusFilter || undefined,
    accrual_type: typeFilter   || undefined,
  });

  const schedules = data?.data ?? [];
  const total     = data?.meta.total ?? 0;

  const activeCount    = schedules.filter((s) => s.status === 'active').length;
  const totalRemaining = schedules.reduce((sum, s) => sum + (s.remaining_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Alla status</option>
            <option value="active">Aktiva</option>
            <option value="completed">Avslutade</option>
            <option value="cancelled">Avbrutna</option>
          </select>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Alla typer</option>
            {ACCRUAL_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {total > 0 && <span className="self-center text-xs text-muted-foreground">{total} periodiseringar</span>}
        </div>
        <PermissionGate permission={Permissions.FINANCE_ACCRUALS_MANAGE}>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Ny periodisering
          </Button>
        </PermissionGate>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">Aktiva</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{isLoading ? '…' : activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">Kvarstårnde belopp</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{isLoading ? '…' : SEK(totalRemaining)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
            </div>
          ) : schedules.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <CalendarDays className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Inga periodiseringar</p>
              <p className="text-xs text-muted-foreground">Skapa en ny för att sprida ut kostnader eller intäkter.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {schedules.map((s) => <AccrualRow key={s.id} schedule={s} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {creating && <CreateAccrualSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

// ─── Deferred revenue tab ──────────────────────────────────────────────────────

function ReleaseDeferredDialog({ schedule, onClose }: { schedule: DeferredSchedule; onClose: () => void }) {
  const periods = useFinancialPeriods();
  const release = useReleaseDeferredSchedule(schedule.id);
  const [periodId, setPeriodId] = useState('');

  const openPeriods = (periods.data ?? []).filter((p) => p.status === 'open');

  async function handleSubmit() {
    if (!periodId) return;
    try {
      await release.mutateAsync(periodId);
      toast({ title: 'Uppskjuten intäkt bokförd' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  const pct = schedule.total_amount > 0
    ? Math.min(100, Math.round((schedule.released_amount / schedule.total_amount) * 100))
    : 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bokför uppskjuten intäkt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1.5">
            <p className="font-semibold">{schedule.description}</p>
            <p className="text-xs text-muted-foreground">{schedule.source_type}: {schedule.source_id.slice(0, 8)}…</p>
            <div className="flex items-center justify-between text-xs mt-1">
              <span>{schedule.months_released} av {schedule.release_months} månader</span>
              <span>{pct} %</span>
            </div>
            <ProgressBar pct={pct} />
          </div>
          <div className="space-y-1.5">
            <Label>Bokföringsperiod</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">Välj period…</option>
              {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={!periodId || release.isPending} onClick={() => void handleSubmit()}>
            Bokför
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeferredRow({ schedule }: { schedule: DeferredSchedule }) {
  const [releasing, setReleasing] = useState(false);
  const pct = schedule.total_amount > 0
    ? Math.min(100, Math.round((schedule.released_amount / schedule.total_amount) * 100))
    : 0;

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{schedule.description}</span>
            {schedule.is_fully_released ? (
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                <CheckCircle2 className="w-2.5 h-2.5" /> Klar
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                <Clock className="w-2.5 h-2.5" /> Aktiv
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 max-w-[160px]">
              <ProgressBar pct={pct} />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {schedule.months_released}/{schedule.release_months} mån
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{schedule.deferral_account} → {schedule.recognition_account}</span>
            <span>{formatDate(schedule.start_date)}</span>
          </div>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <p className="font-mono text-sm font-semibold">{SEK(schedule.remaining_amount)}</p>
          <p className="text-xs text-muted-foreground">kvar</p>
        </div>
        {!schedule.is_fully_released && (
          <PermissionGate permission={Permissions.FINANCE_ACCRUALS_MANAGE}>
            <Button size="sm" variant="outline" onClick={() => setReleasing(true)}>
              <PlayCircle className="w-3.5 h-3.5" />
            </Button>
          </PermissionGate>
        )}
      </div>
      {releasing && <ReleaseDeferredDialog schedule={schedule} onClose={() => setReleasing(false)} />}
    </>
  );
}

function DeferredTab() {
  const [activeOnly, setActiveOnly] = useState(true);
  const { data, isLoading } = useDeferredSchedules(activeOnly);
  const schedules = data?.data ?? [];
  const total     = data?.meta.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="rounded"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Visa bara aktiva
        </label>
        {total > 0 && <span className="text-xs text-muted-foreground">{total} scheman</span>}
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
            </div>
          ) : schedules.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <Layers className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Inga uppskjutna intäkter</p>
              <p className="text-xs text-muted-foreground">Scheman skapas automatiskt när fakturor bokförs med uppskjuten intäkt.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {schedules.map((s) => <DeferredRow key={s.id} schedule={s} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Integrity tab ─────────────────────────────────────────────────────────────

function IntegrityResultBox({ result }: { result: IntegrityResult | null }) {
  if (!result) return null;
  const passed = result.passed ?? false;
  return (
    <div className={`border rounded-lg p-4 text-sm ${
      passed
        ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50'
        : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'
    }`}>
      <div className={`flex items-center gap-2 font-semibold mb-2 ${passed ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
        {passed ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        {passed ? 'Integritetskontroll godkänd' : 'Integritetskontroll misslyckades'}
      </div>
      {result.errors && Array.isArray(result.errors) && result.errors.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {result.errors.map((e, i) => (
            <li key={i} className="flex items-start gap-1">
              <span className="mt-0.5">•</span>
              <span>{typeof e === 'string' ? e : JSON.stringify(e)}</span>
            </li>
          ))}
        </ul>
      )}
      {result.checks && Array.isArray(result.checks) && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {result.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-1">
              <span className="mt-0.5">•</span>
              <span>{typeof c === 'string' ? c : JSON.stringify(c)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IntegrityTab() {
  const periods      = useFinancialPeriods();
  const [periodId, setPeriodId] = useState('');
  const [replayResult,   setReplayResult]   = useState<IntegrityResult | null>(null);
  const [closeDepsResult, setCloseDepsResult] = useState<IntegrityResult | null>(null);

  const replay        = useRunIntegrityReplay();
  const closeDeps     = useRunCloseDependencies();
  const canonExport   = useGenerateCanonicalExport();

  const allPeriods = periods.data ?? [];

  async function handleReplay() {
    if (!periodId) return;
    try {
      const result = await replay.mutateAsync(periodId);
      setReplayResult(result);
    } catch (e) {
      toast({ title: 'Replay-validering misslyckades', description: String(e), variant: 'destructive' });
    }
  }

  async function handleCloseDeps() {
    if (!periodId) return;
    try {
      const result = await closeDeps.mutateAsync(periodId);
      setCloseDepsResult(result);
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  async function handleCanonExport() {
    if (!periodId) return;
    try {
      await canonExport.mutateAsync({ periodId });
      toast({ title: 'Kanonisk export genererad' });
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <PermissionGate permission={Permissions.FINANCE_INTEGRITY_MANAGE}>
      <div className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Välj period för integritetskontroll</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[240px]"
              value={periodId}
              onChange={(e) => { setPeriodId(e.target.value); setReplayResult(null); setCloseDepsResult(null); }}
            >
              <option value="">Välj period…</option>
              {allPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Replay validation */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                Replay-validering
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Kör en deterministisk replay av alla bokföringshändelser och verifierar integritet.
              </p>
              <Button
                size="sm"
                disabled={!periodId || replay.isPending}
                onClick={() => void handleReplay()}
                className="w-full"
              >
                {replay.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5 mr-1.5" />}
                Kör replay
              </Button>
            </CardContent>
          </Card>

          {/* Close dependencies */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Stängningsordning
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Validerar kronologiska beroenden för periodstängning.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!periodId || closeDeps.isPending}
                onClick={() => void handleCloseDeps()}
                className="w-full"
              >
                {closeDeps.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                Kontrollera
              </Button>
            </CardContent>
          </Card>

          {/* Canonical export */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-500" />
                Kanonisk export
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Genererar en SHA-256-verifierad kanonisk bokföringsexport.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!periodId || canonExport.isPending}
                onClick={() => void handleCanonExport()}
                className="w-full"
              >
                {canonExport.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                Generera
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        {replayResult && (
          <div>
            <p className="text-sm font-semibold mb-2">Replay-resultat</p>
            <IntegrityResultBox result={replayResult} />
          </div>
        )}
        {closeDepsResult && (
          <div>
            <p className="text-sm font-semibold mb-2">Stängningsordning</p>
            <IntegrityResultBox result={closeDepsResult} />
          </div>
        )}
      </div>
    </PermissionGate>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function PeriodiseringarPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Periodiseringar"
        description="Förutbetalda kostnader, upplupna intäkter och uppskjuten intäktsredovisning"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Periodiseringar' },
        ]}
      />

      <PageContent>
        <SubscriptionGate feature="finance:accruals:manage">
        <PermissionGate permission={Permissions.FINANCE_ACCRUALS_READ}>
          <Tabs defaultValue="accruals">
            <TabsList>
              <TabsTrigger value="accruals">Periodiseringsplaner</TabsTrigger>
              <TabsTrigger value="deferred">Uppskjutna intäkter</TabsTrigger>
              <TabsTrigger value="integrity">Räkenskapsintegritet</TabsTrigger>
            </TabsList>
            <TabsContent value="accruals" className="mt-4">
              <AccrualsTab />
            </TabsContent>
            <TabsContent value="deferred" className="mt-4">
              <DeferredTab />
            </TabsContent>
            <TabsContent value="integrity" className="mt-4">
              <IntegrityTab />
            </TabsContent>
          </Tabs>
        </PermissionGate>
        </SubscriptionGate>
      </PageContent>
    </PageLayout>
  );
}
