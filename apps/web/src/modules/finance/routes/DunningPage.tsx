import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Shield,
  Layers,
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useDunningSchedules,
  useDunningSchedule,
  useActiveDunningStates,
  useCreateDunningSchedule,
  useAddDunningStage,
  useAdvanceDunning,
  useResolveDunning,
  type DunningSchedule,
  type DunningState,
} from '../hooks/useDunning.js';
import {
  useComplianceEvents,
  useVatDeclarations,
  useSaftExports,
  useRetentionPolicies,
  useCertifyVatDeclaration,
  useGenerateSaftExport,
  type VatDeclaration,
  type SaftExport,
  type ComplianceEvent,
} from '../hooks/useCompliance.js';
import { formatDate, formatDateTime } from '../lib/financeUtils.js';

// ─── Badges ──────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: number | null }) {
  if (stage === null) return <Badge variant="secondary">–</Badge>;
  const colors = ['bg-blue-100 text-blue-800', 'bg-amber-100 text-amber-800', 'bg-orange-100 text-orange-800', 'bg-red-100 text-red-800'];
  const cls = colors[Math.min(stage - 1, colors.length - 1)] ?? colors[colors.length - 1] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      Steg {stage}
    </span>
  );
}

function DeclarationStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:     { label: 'Utkast',     cls: 'bg-gray-100 text-gray-700' },
    submitted: { label: 'Inlämnad',   cls: 'bg-blue-100 text-blue-700' },
    certified: { label: 'Certifierad', cls: 'bg-green-100 text-green-700' },
    corrected: { label: 'Korrigerad', cls: 'bg-amber-100 text-amber-700' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function ExportStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    generating: { label: 'Genererar', cls: 'bg-blue-100 text-blue-700' },
    completed:  { label: 'Klar',      cls: 'bg-green-100 text-green-700' },
    failed:     { label: 'Misslyckad', cls: 'bg-red-100 text-red-700' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

// ─── Action type labels ───────────────────────────────────────────────────────

const ACTION_TYPES = [
  { value: 'reminder',     label: 'Påminnelse' },
  { value: 'warning',      label: 'Varning' },
  { value: 'final_notice', label: 'Slutlig varning' },
  { value: 'suspend',      label: 'Spärra tillgång' },
  { value: 'collection',   label: 'Inkassobolag' },
  { value: 'legal',        label: 'Rättslig åtgärd' },
];

function actionLabel(v: string) {
  return ACTION_TYPES.find((a) => a.value === v)?.label ?? v;
}

// ─── Tab 1: Active dunning states ────────────────────────────────────────────

function AdvanceDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const advance = useAdvanceDunning();
  const [confirm, setConfirm] = useState(false);

  async function handleAdvance() {
    try {
      await advance.mutateAsync(invoiceId);
      toast({ title: 'Inkassosteg avancerat' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avancera inkassosteg</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Faktura <code className="font-mono text-xs">{invoiceId.slice(0, 8)}…</code> kommer att
          flyttas till nästa inkassosteg. Eventuell avgift och åtgärd i det nya steget aktiveras.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Switch id="confirm-adv" checked={confirm} onCheckedChange={setConfirm} />
          <Label htmlFor="confirm-adv" className="text-sm">Jag bekräftar att jag vill avancera</Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            disabled={!confirm || advance.isPending}
            onClick={() => void handleAdvance()}
          >
            Avancera steg
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const resolve = useResolveDunning();

  async function handleResolve() {
    try {
      await resolve.mutateAsync(invoiceId);
      toast({ title: 'Inkassoärende avslutat' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avsluta inkassoärende</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Markera faktura <code className="font-mono text-xs">{invoiceId.slice(0, 8)}…</code> som
          löst. Inkassoindriving avslutas och inga fler påminnelser skickas.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button variant="destructive" disabled={resolve.isPending} onClick={() => void handleResolve()}>
            Avsluta ärende
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DunningStateRowProps {
  state: DunningState;
}

function DunningStateRow({ state }: DunningStateRowProps) {
  const [advancing, setAdvancing] = useState(false);
  const [resolving, setResolving] = useState(false);

  const isOverdue = state.next_action_at !== null && new Date(state.next_action_at) < new Date();

  return (
    <>
      <div className="flex items-center justify-between px-6 py-3 gap-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <StageBadge stage={state.current_stage_number} />
          <div className="min-w-0">
            <Link
              to={`/finance/invoices/${state.invoice_id}`}
              className="text-sm font-mono text-primary hover:underline"
            >
              {state.invoice_id.slice(0, 8)}…
            </Link>
            <p className={`text-xs mt-0.5 ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              {state.next_action_at
                ? `Nästa åtgärd: ${formatDateTime(state.next_action_at)}`
                : 'Ingen planerad åtgärd'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setAdvancing(true)}>
            Avancera
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setResolving(true)}>
            Lös
          </Button>
        </div>
      </div>

      {advancing && <AdvanceDialog invoiceId={state.invoice_id} onClose={() => setAdvancing(false)} />}
      {resolving && <ResolveDialog invoiceId={state.invoice_id} onClose={() => setResolving(false)} />}
    </>
  );
}

function ActiveDunningTab() {
  const { data: states = [], isLoading } = useActiveDunningStates();

  const overdueNow = states.filter(
    (s) => s.next_action_at !== null && new Date(s.next_action_at) < new Date(),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aktiva ärenden</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '…' : states.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              Förfallen åtgärd
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${overdueNow.length > 0 ? 'text-destructive' : ''}`}>
              {isLoading ? '…' : overdueNow.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Aktiva steg (snitt)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading || states.length === 0
                ? '–'
                : (
                    states.reduce((s, x) => s + (x.current_stage_number ?? 0), 0) / states.length
                  ).toFixed(1)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pågående inkassoärenden</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-6 py-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : states.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground text-center">
              Inga aktiva inkassoärenden.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {states.map((s) => (
                <DunningStateRow key={s.invoice_id} state={s} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2: Dunning schedules ─────────────────────────────────────────────────

function CreateScheduleSheet({ onClose }: { onClose: () => void }) {
  const createSchedule = useCreateDunningSchedule();
  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [isDefault, setIsDefault] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) return;
    try {
      await createSchedule.mutateAsync({
        name:        name.trim(),
        description: desc.trim() || undefined,
        is_default:  isDefault,
        is_active:   true,
      });
      toast({ title: 'Inkassoplan skapad' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ny inkassoplan</DialogTitle>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Namn</Label>
            <Input
              placeholder="t.ex. Standardinkasso"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Beskrivning (valfri)</Label>
            <Textarea
              placeholder="Kort beskrivning av planen…"
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="is-default" checked={isDefault} onCheckedChange={setIsDefault} />
            <Label htmlFor="is-default" className="text-sm">Standardplan för organisationen</Label>
          </div>
          <Button
            className="w-full mt-2"
            disabled={!name.trim() || createSchedule.isPending}
            onClick={() => void handleSubmit()}
          >
            Skapa plan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddStageDialog({
  scheduleId,
  nextStageNumber,
  onClose,
}: {
  scheduleId:      string;
  nextStageNumber: number;
  onClose:         () => void;
}) {
  const addStage = useAddDunningStage(scheduleId);
  const [daysOverdue, setDaysOverdue]     = useState('');
  const [actionType, setActionType]       = useState('reminder');
  const [subject, setSubject]             = useState('');
  const [message, setMessage]             = useState('');
  const [lateFee, setLateFee]             = useState('0');
  const [suspend, setSuspend]             = useState(false);
  const [isFinal, setIsFinal]             = useState(false);

  async function handleSubmit() {
    const days = parseInt(daysOverdue, 10);
    if (isNaN(days) || days < 0) return;
    try {
      await addStage.mutateAsync({
        stage_number:     nextStageNumber,
        days_overdue:     days,
        action_type:      actionType,
        subject_template: subject.trim() || undefined,
        message_template: message.trim() || undefined,
        late_fee_amount:  parseFloat(lateFee) || 0,
        suspend_access:   suspend,
        is_final_stage:   isFinal,
      });
      toast({ title: `Steg ${nextStageNumber} tillagt` });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lägg till steg {nextStageNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dagar förfallen</Label>
              <Input
                type="number"
                min="0"
                placeholder="t.ex. 14"
                value={daysOverdue}
                onChange={(e) => setDaysOverdue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Åtgärdstyp</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
              >
                {ACTION_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Ärendemallar — Ämnesrad (brevmall)</Label>
            <Input
              placeholder="t.ex. Påminnelse om obetald faktura {{invoice_number}}"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Meddelandemall (brevtext)</Label>
            <Textarea
              rows={5}
              placeholder={`Hej {{student_name}},\n\nVi påminner om faktura {{invoice_number}} på {{amount}} kr som förföll {{due_date}}.\n\nMvh, {{school_name}}`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Variabler: {'{'}{'{'} invoice_number {'}'}{'}'},  {'{'}{'{'} amount {'}'}{'}'},  {'{'}{'{'} due_date {'}'}{'}'},  {'{'}{'{'} student_name {'}'}{'}'}, {'{'}{'{'} school_name {'}'}{'}'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dröjsmålsavgift (kr)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={lateFee}
                onChange={(e) => setLateFee(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Switch id="suspend-access" checked={suspend} onCheckedChange={setSuspend} />
              <Label htmlFor="suspend-access" className="text-sm">Spärra elevens tillgång vid detta steg</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="is-final" checked={isFinal} onCheckedChange={setIsFinal} />
              <Label htmlFor="is-final" className="text-sm">Detta är det sista steget (avsluta inkasso)</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            disabled={!daysOverdue || addStage.isPending}
            onClick={() => void handleSubmit()}
          >
            Lägg till steg
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDetailSheet({
  schedule,
  onClose,
}: {
  schedule: DunningSchedule;
  onClose:  () => void;
}) {
  const { data: detail, isLoading } = useDunningSchedule(schedule.id);
  const [addingStage, setAddingStage] = useState(false);

  const stages    = detail?.stages ?? [];
  const nextStage = stages.length + 1;

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="w-full sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{schedule.name}</DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-1 text-sm text-muted-foreground">
            {schedule.description && <p>{schedule.description}</p>}
            <p className="flex items-center gap-2 mt-1">
              {schedule.is_default && (
                <Badge variant="secondary">Standardplan</Badge>
              )}
              {schedule.is_active
                ? <span className="text-green-600 font-medium">Aktiv</span>
                : <span className="text-muted-foreground">Inaktiv</span>}
            </p>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Inkassosteg ({stages.length})</h3>
              <Button size="sm" variant="outline" onClick={() => setAddingStage(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Lägg till steg
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-20 bg-muted rounded animate-pulse" />)}
              </div>
            ) : stages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                Inga steg konfigurerade. Lägg till ett steg för att definiera inkassoflödet.
              </p>
            ) : (
              <div className="space-y-3">
                {stages.map((stage) => (
                  <div
                    key={stage.id}
                    className="border rounded-lg p-3 bg-muted/20"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StageBadge stage={stage.stage_number} />
                        <span className="text-sm font-medium">
                          {actionLabel(stage.action_type)}
                        </span>
                        {stage.is_final_stage && (
                          <Badge variant="destructive" className="text-xs">Sista steg</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        +{stage.days_overdue} dagar
                      </span>
                    </div>

                    {stage.subject_template && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Ämne:</p>
                        <p className="text-xs font-mono bg-background border rounded px-2 py-1">
                          {stage.subject_template}
                        </p>
                      </div>
                    )}
                    {stage.message_template && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Brevmall:</p>
                        <pre className="text-xs font-mono bg-background border rounded px-2 py-1 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                          {stage.message_template}
                        </pre>
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      {stage.late_fee_amount > 0 && (
                        <span>Avgift: {stage.late_fee_amount} kr</span>
                      )}
                      {stage.suspend_access && (
                        <span className="text-amber-600">Spärrar tillgång</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {addingStage && (
        <AddStageDialog
          scheduleId={schedule.id}
          nextStageNumber={nextStage}
          onClose={() => setAddingStage(false)}
        />
      )}
    </>
  );
}

function ScheduleCard({ schedule }: { schedule: DunningSchedule }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="w-full text-left border rounded-lg p-4 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{schedule.name}</span>
            {schedule.is_default && (
              <Badge variant="secondary" className="text-xs">Standard</Badge>
            )}
            {!schedule.is_active && (
              <Badge variant="outline" className="text-xs text-muted-foreground">Inaktiv</Badge>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
        {schedule.description && (
          <p className="text-xs text-muted-foreground mt-1 ml-6">{schedule.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          Skapad {formatDate(schedule.created_at)}
        </p>
      </button>
      {open && <ScheduleDetailSheet schedule={schedule} onClose={() => setOpen(false)} />}
    </>
  );
}

function SchedulesTab() {
  const { data: schedules = [], isLoading } = useDunningSchedules();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Inkassoplaner definierar eskaleringsregler och brevmallar för förfallna fakturor.
        </p>
        <PermissionGate permission={Permissions.FINANCE_DUNNING_MANAGE}>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Ny plan
          </Button>
        </PermissionGate>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : schedules.length === 0 ? (
        <div className="border rounded-lg p-8 text-center space-y-2">
          <Layers className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Inga inkassoplaner</p>
          <p className="text-xs text-muted-foreground">
            Skapa en inkassoplan för att definiera eskaleringsregler och brevmallar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => <ScheduleCard key={s.id} schedule={s} />)}
        </div>
      )}

      {creating && <CreateScheduleSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

// ─── Tab 3: Compliance ────────────────────────────────────────────────────────

function eventTypeLabel(t: string) {
  const map: Record<string, string> = {
    vat_period_closed:       'Momsperiod stängd',
    agi_submitted:           'AGI inlämnad',
    saft_generated:          'SAF-T exporterad',
    period_locked:           'Period låst',
    retention_enforced:      'Arkiveringspolicy verkställd',
    certification_created:   'Certifiering skapad',
    filing_certified:        'Inlämning certifierad',
  };
  return map[t] ?? t;
}

function VatDeclarationRow({ decl, onCertify }: { decl: VatDeclaration; onCertify: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <DeclarationStatusBadge status={decl.declaration_status} />
          <span className="text-xs text-muted-foreground font-mono">{decl.id.slice(0, 8)}…</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(decl.created_at)}</p>
      </div>
      {decl.declaration_status === 'submitted' && (
        <Button size="sm" variant="outline" onClick={onCertify}>
          Certifiera
        </Button>
      )}
      {decl.certification_hash && (
        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
      )}
    </div>
  );
}

function SaftExportRow({ exp }: { exp: SaftExport }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ExportStatusBadge status={exp.export_status} />
          <span className="text-xs text-muted-foreground">
            {formatDate(exp.period_start)} – {formatDate(exp.period_end)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Typ: {exp.scope === 'full' ? 'Fullständig' : exp.scope} · {formatDate(exp.created_at)}
        </p>
      </div>
      {exp.sha256_hash && (
        <code className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
          {exp.sha256_hash.slice(0, 10)}…
        </code>
      )}
    </div>
  );
}

function GenerateSaftDialog({ onClose }: { onClose: () => void }) {
  const generate = useGenerateSaftExport();
  const [start, setStart] = useState('');
  const [end,   setEnd]   = useState('');
  const [scope, setScope] = useState('full');

  async function handleSubmit() {
    if (!start || !end) return;
    try {
      const result = await generate.mutateAsync({ period_start: start, period_end: end, scope });
      toast({ title: 'SAF-T export startad', description: `Export-ID: ${result.export_id.slice(0, 8)}…` });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generera SAF-T export</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Från datum</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Till datum</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="full">Fullständig (full)</option>
              <option value="gl">Huvudbok (gl)</option>
              <option value="ar">Kundreskontra (ar)</option>
              <option value="ap">Leverantörsreskontra (ap)</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            disabled={!start || !end || generate.isPending}
            onClick={() => void handleSubmit()}
          >
            Generera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComplianceTab() {
  const { data: events   = [], isLoading: eventsLoading }   = useComplianceEvents(20);
  const { data: vatDecls = [], isLoading: vatLoading }       = useVatDeclarations();
  const { data: saftExps = [], isLoading: saftLoading }      = useSaftExports();
  const { data: policies = [] }                              = useRetentionPolicies();
  const certifyVat                                           = useCertifyVatDeclaration();
  const [generatingSaft, setGeneratingSaft]                  = useState(false);

  async function handleCertifyVat(id: string) {
    try {
      await certifyVat.mutateAsync(id);
      toast({ title: 'Momsdeklaration certifierad' });
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      {/* VAT declarations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Momsdeklarationer</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {vatLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : vatDecls.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Inga momsdeklarationer.</p>
          ) : (
            <div className="divide-y divide-border">
              {vatDecls.slice(0, 10).map((d) => (
                <VatDeclarationRow
                  key={d.id}
                  decl={d}
                  onCertify={() => void handleCertifyVat(d.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SAF-T exports */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">SAF-T exporter</CardTitle>
            <PermissionGate permission={Permissions.FINANCE_DUNNING_MANAGE}>
              <Button size="sm" variant="outline" onClick={() => setGeneratingSaft(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Generera SAF-T
              </Button>
            </PermissionGate>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {saftLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : saftExps.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Inga SAF-T exporter.</p>
          ) : (
            <div className="divide-y divide-border">
              {saftExps.slice(0, 10).map((e) => <SaftExportRow key={e.id} exp={e} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retention policies */}
      {policies.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Arkiveringspolicyer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {policies.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{p.policy_type}</span>
                  <span className="font-medium">{p.retention_years} år</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance events */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Regelefterlevnadshändelser
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {eventsLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
            </div>
          ) : events.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Inga händelser.</p>
          ) : (
            <div className="divide-y divide-border">
              {events.map((ev: ComplianceEvent) => (
                <div key={ev.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{eventTypeLabel(ev.event_type)}</p>
                    {ev.entity_type && (
                      <p className="text-xs text-muted-foreground">
                        {ev.entity_type} · {ev.entity_id?.slice(0, 8)}…
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDateTime(ev.occurred_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {generatingSaft && <GenerateSaftDialog onClose={() => setGeneratingSaft(false)} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DunningPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Inkasso & Regelefterlevnad"
        description="Hantera förfallna fakturor, inkassoeskalering och regelefterlevnad"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Inkasso' },
        ]}
      />

      <PageContent>
        <PermissionGate permission={Permissions.FINANCE_DUNNING_MANAGE}>
          <Tabs defaultValue="states">
            <TabsList className="mb-6">
              <TabsTrigger value="states">
                <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                Inkassoärenden
              </TabsTrigger>
              <TabsTrigger value="schedules">
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                Inkassoplaner
              </TabsTrigger>
              <TabsTrigger value="compliance">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Regelefterlevnad
              </TabsTrigger>
            </TabsList>

            <TabsContent value="states">
              <ActiveDunningTab />
            </TabsContent>

            <TabsContent value="schedules">
              <SchedulesTab />
            </TabsContent>

            <TabsContent value="compliance">
              <ComplianceTab />
            </TabsContent>
          </Tabs>
        </PermissionGate>
      </PageContent>
    </PageLayout>
  );
}
