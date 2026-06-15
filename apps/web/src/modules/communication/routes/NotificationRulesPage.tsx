import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, Info, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useNotificationRules,
  useCommTemplates,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  type NotificationRule,
  type CommChannel,
  type CreateRuleParams,
} from '../hooks/useCommunication.js';
import { ChannelBadge } from '../components/ChannelIcon.js';

// ─── Trigger event definitions ────────────────────────────────────────────────

const TRIGGER_EVENTS = [
  { value: 'booking_confirmed',  label: 'Bokning bekräftad' },
  { value: 'booking_cancelled',  label: 'Bokning avbokad' },
  { value: 'booking_reminder',   label: 'Bokningspåminnelse (24h)' },
  { value: 'invoice_created',    label: 'Faktura skapad' },
  { value: 'invoice_due',        label: 'Faktura förfaller' },
  { value: 'invoice_overdue',    label: 'Faktura försenad' },
  { value: 'student_created',    label: 'Ny elev registrerad' },
  { value: 'permit_expiring',    label: 'Tillstånd utgår snart' },
  { value: 'exam_scheduled',     label: 'Prov bokat' },
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

// ─── NotificationRulesPage ────────────────────────────────────────────────────

export function NotificationRulesPage() {
  const [editing, setEditing] = useState<Partial<NotificationRule> | null>(null);
  const [isNew,   setIsNew]   = useState(false);

  const { data: rules = [], isLoading } = useNotificationRules();
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

        {/* Form */}
        {editing && (
          <RuleForm
            initial={editing}
            isNew={isNew}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
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

      </PageContent>
    </PageLayout>
  );
}
