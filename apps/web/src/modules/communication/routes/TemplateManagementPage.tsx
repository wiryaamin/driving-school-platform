import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, X, Check, Info } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useCommTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  type CommTemplate,
  type CommChannel,
} from '../hooks/useCommunication.js';
import { ChannelBadge } from '../components/ChannelIcon.js';
import { applyTemplateVars } from '../lib/templatePreview.js';

// ─── Channel filter ───────────────────────────────────────────────────────────

const CHANNELS: Array<{ value: CommChannel | 'all'; label: string }> = [
  { value: 'all',      label: 'Alla kanaler' },
  { value: 'sms',      label: 'SMS' },
  { value: 'email',    label: 'E-post' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push',     label: 'Push' },
  { value: 'voice',    label: 'AI Röst' },
];

// ─── Template editor form ─────────────────────────────────────────────────────

function TemplateEditorForm({
  initial,
  onSave,
  onCancel,
  isNew,
}: {
  initial?:  Partial<CommTemplate>;
  onSave:    (data: { key: string; channel: CommChannel; subject: string; body_text: string; variables: string[] }) => void;
  onCancel:  () => void;
  isNew:     boolean;
}) {
  const [key,      setKey]      = useState(initial?.key      ?? '');
  const [channel,  setChannel]  = useState<CommChannel>(initial?.channel as CommChannel ?? 'sms');
  const [subject,  setSubject]  = useState(initial?.subject  ?? '');
  const [bodyText, setBodyText] = useState(initial?.body_text ?? '');
  const [vars,     setVars]     = useState((initial?.variables ?? []).join(', '));
  const [preview,  setPreview]  = useState(false);

  const SAMPLE_VARS: Record<string, string> = {
    förnamn: 'Anna', datum: '15 dec 2026', tid: '09:00',
    trafikskola: 'Stockholms Trafikskola', fakturanr: 'INV-1042',
    belopp: '1 500', förfallodatum: '31 dec 2026', betalsätt: 'Bankgiro 123-4567',
    loginlänk: 'https://app.example.se',
  };
  const previewBody = applyTemplateVars(bodyText, SAMPLE_VARS);

  function handleSubmit() {
    if (!key.trim())      { toast({ title: 'Mallnyckel saknas', variant: 'destructive' }); return; }
    if (!bodyText.trim()) { toast({ title: 'Meddelandetext saknas', variant: 'destructive' }); return; }
    const variables = vars.split(',').map((v) => v.trim()).filter(Boolean);
    onSave({ key: key.trim(), channel, subject: subject.trim(), body_text: bodyText.trim(), variables });
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        {isNew ? 'Skapa anpassad mall' : 'Redigera mall'}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Mallnyckel</label>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="booking.confirmed"
            disabled={!isNew}
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Kanal</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as CommChannel)}
            disabled={!isNew}
            className="w-full h-9 px-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none disabled:opacity-60"
          >
            {CHANNELS.filter((c) => c.value !== 'all').map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {channel === 'email' && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Ämnesrad</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Bokningsbekräftelse – {datum} kl {tid}"
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">Meddelandetext</label>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {preview ? 'Dölj förhandsvisning' : 'Förhandsvisning'}
          </button>
        </div>
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={5}
          placeholder={'Hej {förnamn}! Din körlektion {datum} kl {tid} är bekräftad. / {trafikskola}'}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {preview && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground whitespace-pre-wrap">
            {previewBody}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Variabler: {'{förnamn}'} {'{datum}'} {'{tid}'} {'{trafikskola}'} {'{fakturanr}'} {'{belopp}'} {'{förfallodatum}'}
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Variabler (kommaseparerade)</label>
        <input
          type="text"
          value={vars}
          onChange={(e) => setVars(e.target.value)}
          placeholder="förnamn, datum, tid, trafikskola"
          className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1" />Avbryt
        </Button>
        <Button size="sm" onClick={handleSubmit}>
          <Check className="w-3.5 h-3.5 mr-1" />Spara mall
        </Button>
      </div>
    </div>
  );
}

// ─── TemplateRow ──────────────────────────────────────────────────────────────

function TemplateRow({
  tpl,
  onEdit,
  onDelete,
}: {
  tpl:      CommTemplate;
  onEdit:   (tpl: CommTemplate) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isSystem = tpl.organization_id === null;

  return (
    <>
      <tr
        className="hover:bg-accent/20 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <ChannelBadge channel={tpl.channel as CommChannel} />
        </td>
        <td className="px-4 py-3">
          <span className="text-sm font-mono text-foreground">{tpl.key}</span>
          <span className="ml-2 text-[10px] text-muted-foreground">{tpl.locale}</span>
        </td>
        <td className="px-4 py-3 max-w-xs">
          <span className="text-xs text-muted-foreground truncate block">
            {tpl.body_text.slice(0, 60)}{tpl.body_text.length > 60 ? '…' : ''}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full font-semibold',
            isSystem
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
          )}>
            {isSystem ? 'System' : 'Anpassad'}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            {!isSystem && (
              <>
                <button
                  onClick={() => onEdit(tpl)}
                  className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Redigera"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(tpl.id)}
                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Inaktivera"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {isSystem && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit({ ...tpl, id: '', organization_id: 'override' }); }}
                className="px-2 py-1 text-[10px] border border-primary/30 text-primary rounded hover:bg-primary/5 transition-colors"
                title="Skapa org-specifik override"
              >
                Anpassa
              </button>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td colSpan={5} className="px-4 py-3">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="col-span-2">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Meddelandetext</p>
                <p className="text-foreground whitespace-pre-wrap font-mono text-[11px]">{tpl.body_text}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Variabler</p>
                <div className="flex flex-wrap gap-1">
                  {(tpl.variables ?? []).map((v) => (
                    <code key={v} className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{`{${v}}`}</code>
                  ))}
                </div>
                {tpl.subject && (
                  <>
                    <p className="font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-1">Ämnesrad</p>
                    <p className="text-foreground">{tpl.subject}</p>
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── TemplateManagementPage ───────────────────────────────────────────────────

export function TemplateManagementPage() {
  const [channelFilter, setChannelFilter] = useState<CommChannel | 'all'>('all');
  const [editing,       setEditing]       = useState<Partial<CommTemplate> | null>(null);
  const [isNew,         setIsNew]         = useState(false);

  const { data: templates = [], isLoading } = useCommTemplates(channelFilter === 'all' ? undefined : channelFilter);
  const createTpl  = useCreateTemplate();
  const updateTpl  = useUpdateTemplate();
  const deleteTpl  = useDeleteTemplate();

  function handleSave(formData: { key: string; channel: CommChannel; subject: string; body_text: string; variables: string[] }) {
    if (isNew || !editing?.id) {
      createTpl.mutate(formData, {
        onSuccess: () => { toast({ title: 'Mall skapad' }); setEditing(null); },
        onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
      });
    } else {
      updateTpl.mutate(
        { id: editing.id, subject: formData.subject || null, body_text: formData.body_text, variables: formData.variables },
        {
          onSuccess: () => { toast({ title: 'Mall uppdaterad' }); setEditing(null); },
          onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
        },
      );
    }
  }

  function handleDelete(id: string) {
    deleteTpl.mutate(id, {
      onSuccess: () => toast({ title: 'Mall inaktiverad' }),
      onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
    });
  }

  return (
    <PageLayout>
      <PageHeader
        title="Notismallar"
        description="Hantera meddelandemallar per kanal. Systemmallar kan överskridas med anpassade versioner."
        breadcrumbs={[
          { label: 'Kommunikation', href: '/communication' },
          { label: 'Notismallar' },
        ]}
      />

      <PageContent>

        {/* New template editor */}
        {editing && (
          <TemplateEditorForm
            initial={editing}
            isNew={isNew}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        )}

        {/* Channel filter + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {CHANNELS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setChannelFilter(c.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                channelFilter === c.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {c.label}
            </button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => { setEditing({}); setIsNew(true); }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Ny anpassad mall
          </Button>
        </div>

        {/* Template table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Kanal</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Nyckel</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Förhandsvisning</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Typ</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }, (_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : templates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                      Inga mallar hittades.
                    </td>
                  </tr>
                ) : (
                  templates.map((tpl) => (
                    <TemplateRow
                      key={tpl.id}
                      tpl={tpl}
                      onEdit={(t) => { setEditing(t); setIsNew(!t.id || t.organization_id === 'override'); }}
                      onDelete={handleDelete}
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
            <strong>System</strong>-mallar är plattformens standardmallar (på svenska). Klicka <em>Anpassa</em> för att skapa en org-specifik version som ersätter systemstandarden.
          </span>
        </div>

      </PageContent>
    </PageLayout>
  );
}
