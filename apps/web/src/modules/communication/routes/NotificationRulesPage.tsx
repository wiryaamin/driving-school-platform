import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Check, Info, ToggleLeft, ToggleRight, CheckCircle2, AlertTriangle, Clock, Zap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast, Skeleton } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useNotificationRules,
  useCommTemplates,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useSeedDefaults,
  type NotificationRule,
  type CommChannel,
  type CreateRuleParams,
} from '../hooks/useCommunication.js';
import { ChannelBadge } from '../components/ChannelIcon.js';
import { useBookingList } from '@modules/scheduling/hooks/useBookings.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';

// ─── Trigger event definitions ────────────────────────────────────────────────

const TRIGGER_EVENTS = [
  { value: 'booking_confirmed',          label: 'Bokning bekräftad' },
  { value: 'booking_cancelled',          label: 'Bokning avbokad' },
  { value: 'booking_rescheduled',        label: 'Bokning ombokad' },
  { value: 'booking_reminder_24h',       label: 'Lektionspåminnelse (24 tim)' },
  { value: 'booking_reminder_same_day',  label: 'Lektionspåminnelse (samma dag)' },
  { value: 'instructor_schedule_daily',  label: 'Instruktörens dagsprogram' },
  { value: 'invoice_created',            label: 'Faktura skapad' },
  { value: 'invoice_due',                label: 'Faktura förfaller' },
  { value: 'invoice_overdue',            label: 'Faktura försenad' },
  { value: 'student_created',            label: 'Ny elev registrerad' },
  { value: 'permit_expiring',            label: 'Tillstånd utgår snart' },
  { value: 'exam_scheduled',             label: 'Prov bokat' },
] as const;

type TriggerEvent = (typeof TRIGGER_EVENTS)[number]['value'];

const CHANNEL_OPTS: CommChannel[] = ['sms', 'email', 'whatsapp', 'push', 'voice'];
const RECIPIENT_OPTS: Array<{ value: 'student' | 'instructor'; label: string }> = [
  { value: 'student',    label: 'Elev' },
  { value: 'instructor', label: 'Instruktör' },
];

// ─── Rule form ────────────────────────────────────────────────────────────────

function RuleForm({
  initial,
  onSave,
  onCancel,
  isNew,
}: {
  initial?: Partial<NotificationRule>;
  onSave:   (params: CreateRuleParams) => void;
  onCancel: () => void;
  isNew:    boolean;
}) {
  const [trigger,       setTrigger]       = useState<TriggerEvent>((initial?.trigger_event as TriggerEvent) ?? 'booking_confirmed');
  const [channel,       setChannel]       = useState<CommChannel>((initial?.channel as CommChannel) ?? 'sms');
  const [templateId,    setTemplateId]    = useState(initial?.template_id ?? '');
  const [recipientType, setRecipientType] = useState<'student' | 'instructor'>(initial?.recipient_type ?? 'student');
  const [enabled,       setEnabled]       = useState(initial?.enabled ?? false);

  const { data: templates = [] } = useCommTemplates(channel);
  const availableTemplates = templates.filter((t) => t.channel === channel && t.is_active);

  function handleSubmit() {
    if (!templateId) { toast({ title: 'Välj en mall', variant: 'destructive' }); return; }
    onSave({ trigger_event: trigger, channel, template_id: templateId, recipient_type: recipientType, enabled });
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        {isNew ? 'Lägg till notisregel' : 'Redigera notisregel'}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Utlösare</label>
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as TriggerEvent)}
            disabled={!isNew}
            className="w-full h-9 px-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none disabled:opacity-60"
          >
            {TRIGGER_EVENTS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Kanal</label>
          <select
            value={channel}
            onChange={(e) => { setChannel(e.target.value as CommChannel); setTemplateId(''); }}
            disabled={!isNew}
            className="w-full h-9 px-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none disabled:opacity-60"
          >
            {CHANNEL_OPTS.map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Mall</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full h-9 px-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none"
          >
            <option value="">— Välj mall —</option>
            {availableTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.key}</option>
            ))}
          </select>
          {availableTemplates.length === 0 && (
            <p className="text-[10px] text-amber-600">Inga aktiva mallar för {channel}. Skapa mall först.</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Mottagartyp</label>
          <select
            value={recipientType}
            onChange={(e) => setRecipientType(e.target.value as 'student' | 'instructor')}
            className="w-full h-9 px-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none"
          >
            {RECIPIENT_OPTS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
            enabled ? 'bg-primary' : 'bg-muted',
          )}
          role="switch"
          aria-checked={enabled}
        >
          <span className={cn(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-4' : 'translate-x-0',
          )} />
        </button>
        <span className="text-xs text-muted-foreground">{enabled ? 'Aktiv' : 'Inaktiv'}</span>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1" />Avbryt
        </Button>
        <Button size="sm" onClick={handleSubmit}>
          <Check className="w-3.5 h-3.5 mr-1" />Spara regel
        </Button>
      </div>
    </div>
  );
}

// ─── RuleRow ──────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule:     NotificationRule;
  onEdit:   (rule: NotificationRule) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const triggerLabel = TRIGGER_EVENTS.find((t) => t.value === rule.trigger_event)?.label ?? rule.trigger_event;
  const recipientLabel = rule.recipient_type === 'student' ? 'Elev' : 'Instruktör';

  return (
    <tr className="hover:bg-accent/10 transition-colors">
      <td className="px-4 py-3">
        <span className="text-xs font-medium text-foreground">{triggerLabel}</span>
      </td>
      <td className="px-4 py-3">
        <ChannelBadge channel={rule.channel as CommChannel} />
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-muted-foreground">
          {rule.template?.key ?? rule.template_id.slice(0, 8)}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-muted-foreground">{recipientLabel}</span>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => onToggle(rule.id, !rule.enabled)}
          className="flex items-center gap-1.5 text-xs"
          title={rule.enabled ? 'Inaktivera' : 'Aktivera'}
        >
          {rule.enabled
            ? <ToggleRight className="w-4 h-4 text-primary" />
            : <ToggleLeft  className="w-4 h-4 text-muted-foreground" />}
          <span className={rule.enabled ? 'text-primary' : 'text-muted-foreground'}>
            {rule.enabled ? 'Aktiv' : 'Inaktiv'}
          </span>
        </button>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(rule)}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Redigera"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(rule.id)}
            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Ta bort"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const _TZ = 'Europe/Stockholm';
const _DTF = new Intl.DateTimeFormat('sv-SE', { timeZone: _TZ, weekday: 'short', day: 'numeric', month: 'short' });
const _TF  = new Intl.DateTimeFormat('en-GB', { timeZone: _TZ, hour: '2-digit', minute: '2-digit', hour12: false });

function fmtDate(iso: string)  { return _DTF.format(new Date(iso)); }
function fmtTime(iso: string)  { return _TF.format(new Date(iso)); }
function reminderFiresAt(iso: string, offsetHours: number): string {
  return fmtTime(new Date(new Date(iso).getTime() - offsetHours * 3_600_000).toISOString());
}

// ─── ReminderHealthBanner ─────────────────────────────────────────────────────

const REMINDER_EVENTS: Array<{ event: string; label: string; offsetHours: number }> = [
  { event: 'booking_reminder_24h',      label: '24h påminnelse',  offsetHours: 24 },
  { event: 'booking_reminder_same_day', label: 'Samma dag',       offsetHours: 2  },
];

function ReminderHealthBanner({ rules }: { rules: NotificationRule[] }) {
  const rows = REMINDER_EVENTS.map(({ event, label }) => {
    const active   = rules.filter((r) => r.trigger_event === event && r.enabled);
    const inactive = rules.filter((r) => r.trigger_event === event && !r.enabled);
    return { event, label, active, inactive };
  });

  const anyActive = rows.some((r) => r.active.length > 0);

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-3',
      anyActive ? 'border-border bg-muted/20' : 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20',
    )}>
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-foreground">Påminnelsestatus</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map(({ event, label, active, inactive }) => (
          <div key={event} className="flex items-start gap-2">
            {active.length > 0
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{label}</p>
              {active.length > 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  Aktiv via {active.map((r) => r.channel.toUpperCase()).join(', ')}
                </p>
              ) : inactive.length > 0 ? (
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  Regel finns men är inaktiverad
                </p>
              ) : (
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  Ingen regel konfigurerad
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {!anyActive && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Elever får inga automatiska lektionspåminnelser. Lägg till och aktivera minst en påminnelseregel nedan.
        </p>
      )}
    </div>
  );
}

// ─── ReminderPreviewPanel ─────────────────────────────────────────────────────

function ReminderPreviewPanel({ rules }: { rules: NotificationRule[] }) {
  const { from, to } = useMemo(() => {
    const now = new Date();
    return {
      from: now.toISOString(),
      to:   new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    };
  }, []);

  const { data: bookingsData, isLoading: bookingsLoading } = useBookingList({
    status:   'confirmed',
    from,
    to,
    per_page: 100,
    sort_by:  'starts_at',
    sort_dir: 'asc',
  });

  const { data: studentsData } = useStudentList({ per_page: 200 });

  const studentMap = useMemo(
    () => Object.fromEntries(
      (studentsData?.data ?? []).map((s) => [s.id, `${s.first_name} ${s.last_name}`]),
    ),
    [studentsData],
  );

  const bookings = bookingsData?.data ?? [];

  // For each reminder event type, determine if there's an active rule
  const activeByEvent = useMemo(() => {
    const map: Record<string, NotificationRule[]> = {};
    for (const { event } of REMINDER_EVENTS) {
      map[event] = rules.filter((r) => r.trigger_event === event && r.enabled);
    }
    return map;
  }, [rules]);

  if (bookingsLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Inga bekräftade bokningar de närmaste 48 timmarna.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Elev</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Lektion</th>
              {REMINDER_EVENTS.map(({ event, label }) => (
                <th key={event} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bookings.map((b) => (
              <tr key={b.id} className="hover:bg-accent/10 transition-colors">
                <td className="px-4 py-2.5">
                  <span className="text-xs font-medium text-foreground">
                    {studentMap[b.student_id] ?? b.student_id.slice(0, 8) + '…'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-foreground capitalize">{fmtDate(b.starts_at)}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">kl. {fmtTime(b.starts_at)}</span>
                </td>
                {REMINDER_EVENTS.map(({ event, offsetHours }) => {
                  const active = (activeByEvent[event] ?? []);
                  return (
                    <td key={event} className="px-4 py-2.5">
                      {active.length > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          kl. {reminderFiresAt(b.starts_at, offsetHours)}
                          <span className="text-muted-foreground">
                            · {active.map((r) => r.channel.toUpperCase()).join('/')}
                          </span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                          <span className="text-muted-foreground/40">—</span>
                          <span className="text-[10px]">Inaktiv</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SnabbstartBanner ─────────────────────────────────────────────────────────

function SnabbstartBanner({ onSeeded }: { onSeeded: () => void }) {
  const seedDefaults = useSeedDefaults();

  function handleSeed() {
    seedDefaults.mutate(undefined, {
      onSuccess: (result) => {
        toast({
          title: 'Standardnotiser aktiverade',
          description: `${result.channels_added} kanaler + ${result.rules_added} regler skapade. Aktivera önskade regler nedan.`,
        });
        onSeeded();
      },
      onError: (e) => toast({
        title: 'Kunde inte skapa standardregler',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      }),
    });
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="w-4.5 h-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Snabbstart — standardnotiser</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Skapar 15 fördefinierade notisregler (SMS + e-post) för bokningsbekräftelse, påminnelser,
            fakturor och instruktörens dagsprogram. Alla regler skapas <strong>inaktiva</strong> — du aktiverar
            dem manuellt när du konfigurerat en kanal.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <Button size="sm" onClick={handleSeed} disabled={seedDefaults.isPending}>
          {seedDefaults.isPending
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <Zap className="w-3.5 h-3.5 mr-1.5" />}
          {seedDefaults.isPending ? 'Skapar…' : 'Skapa standardregler'}
        </Button>
        <p className="text-[10px] text-muted-foreground">Idempotent — säkert att köra flera gånger</p>
      </div>
    </div>
  );
}

// ─── NotificationRulesPage ────────────────────────────────────────────────────

export function NotificationRulesPage() {
  const [editing, setEditing] = useState<Partial<NotificationRule> | null>(null);
  const [isNew,   setIsNew]   = useState(false);

  const { data: rules = [], isLoading, refetch } = useNotificationRules();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();

  function handleSave(params: CreateRuleParams) {
    if (isNew || !editing?.id) {
      createRule.mutate(params, {
        onSuccess: () => { toast({ title: 'Regel skapad' }); setEditing(null); },
        onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
      });
    } else {
      updateRule.mutate(
        { id: editing.id, template_id: params.template_id, recipient_type: params.recipient_type, enabled: params.enabled },
        {
          onSuccess: () => { toast({ title: 'Regel uppdaterad' }); setEditing(null); },
          onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
        },
      );
    }
  }

  function handleToggle(id: string, enabled: boolean) {
    updateRule.mutate({ id, enabled }, {
      onSuccess: () => toast({ title: enabled ? 'Regel aktiverad' : 'Regel inaktiverad' }),
      onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
    });
  }

  function handleDelete(id: string) {
    deleteRule.mutate(id, {
      onSuccess: () => toast({ title: 'Regel borttagen' }),
      onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
    });
  }

  return (
    <PageLayout>
      <PageHeader
        title="Notisregler"
        description="Definiera vilka händelser som ska utlösa automatiska notiser per kanal och mottagartyp"
        breadcrumbs={[
          { label: 'Kommunikation', href: '/communication' },
          { label: 'Notisregler' },
        ]}
      />

      <PageContent>

        {/* Reminder health banner */}
        <ReminderHealthBanner rules={rules} />

        {/* Form */}
        {editing && (
          <RuleForm
            initial={editing}
            isNew={isNew}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        )}

        {/* Snabbstart — shown when no rules exist yet */}
        {!isLoading && rules.length === 0 && (
          <SnabbstartBanner onSeeded={() => void refetch()} />
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {rules.length} regler konfigurerade
          </p>
          <Button
            size="sm"
            onClick={() => { setEditing({}); setIsNew(true); }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Lägg till regel
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Utlösare</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Kanal</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Mall</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Mottagare</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 4 }, (_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }, (_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                      Inga notisregler konfigurerade ännu.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      onEdit={(r) => { setEditing(r); setIsNew(false); }}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-lg border border-border bg-muted/20 px-4 py-2.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Regler utlöses av <strong>communication-worker</strong> vid boknings- och fakturahändelser. Regler är inaktiva som standard — aktivera dem manuellt när kanalinställningar är konfigurerade.
          </span>
        </div>

        {/* Upcoming reminder preview */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Kommande lektionspåminnelser (48h)</h2>
            <span className="text-xs text-muted-foreground">— baserat på aktiva regler och bekräftade bokningar</span>
          </div>
          <ReminderPreviewPanel rules={rules} />
        </div>

      </PageContent>
    </PageLayout>
  );
}
