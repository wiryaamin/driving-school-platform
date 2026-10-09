import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, X, Check, Info, CheckCircle2, AlertTriangle, Clock, Zap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast, Skeleton } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useNotificationRules,
  useCommTemplates,
  useCreateRule,
  useUpdateRule,
  useChannelConfigs,
  useSeedDefaults,
  type NotificationRule,
  type CommChannel,
  type CreateRuleParams,
} from '../hooks/useCommunication.js';
import { templateLabel } from '../lib/templateLabels.js';
import { TRIGGER_EVENTS, UNDISPATCHED_EVENTS, CORE_STUDENT_EVENTS, type TriggerEvent } from '../lib/eventLabels.js';
import { useBookingList } from '@modules/scheduling/hooks/useBookings.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';

// ─── Trigger event definitions ────────────────────────────────────────────────

const CHANNEL_LABELS: Record<CommChannel, string> = {
  sms: 'SMS', email: 'E-post', whatsapp: 'WhatsApp', push: 'Appnotis', voice: 'Röstsamtal',
};
const CHANNEL_OPTS: CommChannel[] = ['sms', 'email', 'whatsapp', 'push', 'voice'];
const RECIPIENT_OPTS: Array<{ value: 'student' | 'instructor' | 'admin'; label: string }> = [
  { value: 'student',    label: 'Elev' },
  { value: 'instructor', label: 'Lärare' },
  { value: 'admin',      label: 'Kontoägare' },
];
const RECIPIENT_GROUPS: Array<{ value: NotificationRule['recipient_type']; label: string; hint: string }> = [
  { value: 'student',    label: 'Till eleven',          hint: 'Utskick som eleven får om sina lektioner och sin ekonomi.' },
  { value: 'guardian',   label: 'Till vårdnadshavare',  hint: 'Kopior till vårdnadshavare som är kopplade till eleven.' },
  { value: 'instructor', label: 'Till läraren',         hint: 'Besked till den lärare som har lektionen.' },
  { value: 'admin',      label: 'Till kontoägaren',     hint: 'Aviseringar till skolans administratörer.' },
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
  const [recipientType, setRecipientType] = useState<NotificationRule['recipient_type']>(initial?.recipient_type ?? 'student');
  const [enabled,       setEnabled]       = useState(initial?.enabled ?? false);

  const { data: templates = [] } = useCommTemplates(channel);
  const availableTemplates = templates.filter((t) => t.channel === channel && t.is_active);

  function handleSubmit() {
    if (!templateId) { toast({ title: 'Välj en mall', variant: 'destructive' }); return; }
    onSave({ trigger_event: trigger, channel, template_id: templateId, recipient_type: recipientType === 'guardian' ? 'student' : recipientType, enabled });
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
              <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
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
              <option key={t.id} value={t.id}>{templateLabel(t)}</option>
            ))}
          </select>
          {availableTemplates.length === 0 && (
            <p className="text-[10px] text-amber-600">Inga aktiva mallar för {CHANNEL_LABELS[channel]}. Skapa en mall först.</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Mottagartyp</label>
          <select
            value={recipientType}
            onChange={(e) => setRecipientType(e.target.value as NotificationRule['recipient_type'])}
            disabled={!isNew}
            className="w-full h-9 px-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none"
          >
            {(recipientType === 'guardian' ? [...RECIPIENT_OPTS, { value: 'guardian' as const, label: 'Vårdnadshavare' }] : RECIPIENT_OPTS).map((r) => (
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
        <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
          <Button size="sm" onClick={handleSubmit}>
            <Check className="w-3.5 h-3.5 mr-1" />Spara regel
          </Button>
        </PermissionGate>
      </div>
    </div>
  );
}

// ─── EventRuleMatrix ──────────────────────────────────────────────────────────
// One row per business event, one switch per channel. The same event used to be
// listed once per channel × recipient, which read as duplicated rules.

const MATRIX_CHANNELS: CommChannel[] = ['sms', 'email', 'push'];

function EventRuleMatrix({
  rules,
  recipient,
  title,
  hint,
  onToggle,
  onEdit,
  disabledChannels,
}: {
  rules:            NotificationRule[];
  recipient:        NotificationRule['recipient_type'];
  title:            string;
  hint:             string;
  onToggle:         (id: string, enabled: boolean) => void;
  onEdit:           (rule: NotificationRule) => void;
  disabledChannels: Set<CommChannel>;
}) {
  const scoped = rules.filter((r) => r.recipient_type === recipient && !UNDISPATCHED_EVENTS.has(r.trigger_event));
  if (scoped.length === 0) return null;
  const events = TRIGGER_EVENTS.map((t) => t.value).filter((ev) => scoped.some((r) => r.trigger_event === ev));
  const channels = MATRIX_CHANNELS.filter((ch) => scoped.some((r) => r.channel === ch))
    .concat(scoped.some((r) => !MATRIX_CHANNELS.includes(r.channel)) ? (['whatsapp'] as CommChannel[]) : []);

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Utskick</th>
              {channels.map((ch) => (
                <th key={ch} className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground w-28">{CHANNEL_LABELS[ch]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((ev) => {
              const label = TRIGGER_EVENTS.find((t) => t.value === ev)?.label ?? ev;
              return (
                <tr key={ev} className="hover:bg-accent/10">
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground">{label}</td>
                  {channels.map((ch) => {
                    const rule = scoped.find((r) => r.trigger_event === ev && r.channel === ch);
                    if (!rule) return <td key={ch} className="px-4 py-2.5 text-center text-xs text-muted-foreground/50">—</td>;
                    const off = disabledChannels.has(ch);
                    return (
                      <td key={ch} className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <PermissionGate
                            permission={Permissions.COMMUNICATIONS_CREATE}
                            fallback={<span className={cn('text-xs', rule.enabled ? 'text-primary' : 'text-muted-foreground')}>{rule.enabled ? 'På' : 'Av'}</span>}
                          >
                            <button
                              type="button"
                              role="switch"
                              aria-checked={rule.enabled}
                              aria-label={`${label} via ${CHANNEL_LABELS[ch]}`}
                              onClick={() => onToggle(rule.id, !rule.enabled)}
                              title={off ? `${CHANNEL_LABELS[ch]} är avstängt för skolan — inga ${CHANNEL_LABELS[ch]} skickas` : undefined}
                              className={cn(
                                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                                rule.enabled ? (off ? 'bg-primary/40' : 'bg-primary') : 'bg-muted-foreground/30',
                              )}
                            >
                              <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', rule.enabled ? 'translate-x-4' : 'translate-x-0')} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onEdit(rule)}
                              className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent"
                              title="Byt mall"
                              aria-label={`Byt mall för ${label} via ${CHANNEL_LABELS[ch]}`}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </PermissionGate>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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
          <p className="text-sm font-semibold text-foreground">Kom igång med automatiska utskick</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Skapar skolans standardutskick för bokningar, påminnelser, fakturor och lärarens dagsschema.
            Bekräftelser och påminnelser till eleven slås på direkt — övriga kan du slå på när du vill.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
          <Button size="sm" onClick={handleSeed} disabled={seedDefaults.isPending}>
            {seedDefaults.isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Zap className="w-3.5 h-3.5 mr-1.5" />}
            {seedDefaults.isPending ? 'Skapar…' : 'Skapa standardutskick'}
          </Button>
        </PermissionGate>
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
  const { data: channelConfigs = [] } = useChannelConfigs();
  const disabledChannels = useMemo(
    () => new Set<CommChannel>(channelConfigs.filter((c) => !c.enabled && (c.channel === 'sms' || c.channel === 'email')).map((c) => c.channel)),
    [channelConfigs],
  );
  const coreMissing = useMemo(
    () => rules.filter((r) => r.recipient_type === 'student' && !r.enabled
      && (r.channel === 'sms' || r.channel === 'email')
      && (CORE_STUDENT_EVENTS as readonly string[]).includes(r.trigger_event)),
    [rules],
  );

  async function handleEnableCore() {
    try {
      for (const r of coreMissing) await updateRule.mutateAsync({ id: r.id, enabled: true });
      toast({ title: 'Rekommenderade utskick påslagna' });
    } catch (e) {
      toast({ title: 'Kunde inte slå på alla utskick', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  }

  function handleSave(params: CreateRuleParams) {
    if (isNew || !editing?.id) {
      createRule.mutate(params, {
        onSuccess: () => { toast({ title: 'Regel skapad' }); setEditing(null); },
        onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
      });
    } else {
      updateRule.mutate(
        // Only the template and on/off change on edit — event, channel and
        // recipient identify the rule and stay as they are.
        { id: editing.id, template_id: params.template_id, enabled: params.enabled },
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
      <SubscriptionGate feature="communication:templates:manage">

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

        {/* Recommended core messages — on by default for new schools, one click for older ones */}
        {!isLoading && coreMissing.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Rekommenderade utskick är inte påslagna</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bekräftelse vid bokning, avbokning och flytt samt påminnelse dagen före lektionen — via SMS och e-post.
                Du kan stänga av enskilda utskick när du vill.
              </p>
            </div>
            <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
              <Button size="sm" onClick={handleEnableCore} disabled={updateRule.isPending}>
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Slå på rekommenderade utskick
              </Button>
            </PermissionGate>
          </div>
        )}

        {/* Channel switched off for the whole school → rules on that channel send nothing */}
        {disabledChannels.size > 0 && rules.some((r) => r.enabled && disabledChannels.has(r.channel)) && (
          <div className="flex items-start gap-2 text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300 px-4 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {[...disabledChannels].map((c) => CHANNEL_LABELS[c]).join(' och ')} är avstängt för skolan, så påslagna utskick via
              {disabledChannels.size > 1 ? ' dessa kanaler' : ' den kanalen'} skickas inte. Slå på kanalen under{' '}
              <Link to="/communication/settings" className="font-medium underline underline-offset-2">Kanaler</Link>.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end">
          <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
            <Button size="sm" variant="outline" onClick={() => { setEditing({}); setIsNew(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Lägg till eget utskick
            </Button>
          </PermissionGate>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        ) : rules.length === 0 ? null : (
          RECIPIENT_GROUPS.map((g) => (
            <EventRuleMatrix
              key={g.value}
              rules={rules}
              recipient={g.value}
              title={g.label}
              hint={g.hint}
              onToggle={handleToggle}
              onEdit={(r) => { setEditing(r); setIsNew(false); }}
              disabledChannels={disabledChannels}
            />
          ))
        )}

        <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-lg border border-border bg-muted/20 px-4 py-2.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Utskicken skickas automatiskt när något händer med en bokning eller faktura. Texterna ändrar du under{' '}
            <Link to="/communication/templates" className="font-medium underline underline-offset-2">Mallar</Link>.
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

      </SubscriptionGate>
      </PageContent>
    </PageLayout>
  );
}
