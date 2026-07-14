import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight, Send, Calendar, Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast } from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useSendMessage, useCommTemplates, useChannelConfigs } from '../hooks/useCommunication.js';
import { ChannelIcon, CHANNEL_META } from '../components/ChannelIcon.js';
import type { CommChannel } from '../hooks/useCommunication.js';

const ALL_CHANNELS: CommChannel[] = ['sms', 'email', 'whatsapp', 'push', 'voice'];

// ─── ComposeMessagePage ───────────────────────────────────────────────────────

export function ComposeMessagePage() {
  const navigate = useNavigate();
  const send     = useSendMessage();

  const { data: configs = [] } = useChannelConfigs();
  const configMap = Object.fromEntries(configs.map((c) => [c.channel, c]));

  const [channel,    setChannel]    = useState<CommChannel>('sms');
  const [recipType,  setRecipType]  = useState<'student' | 'instructor' | 'manual'>('manual');
  const [address,    setAddress]    = useState('');
  const [subject,    setSubject]    = useState('');
  const [body,       setBody]       = useState('');
  const [templateId, setTemplateId] = useState('');
  const [scheduled,  setScheduled]  = useState('');

  const { data: templates = [] } = useCommTemplates(channel);
  const charLimit = channel === 'sms' ? 160 : undefined;

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    setBody(tpl.body_text);
    if (tpl.subject) setSubject(tpl.subject);
  }

  function handleSend(scheduleAt?: string) {
    if (!address.trim()) { toast({ title: 'Ange mottagaradress', variant: 'destructive' }); return; }
    if (!body.trim())    { toast({ title: 'Ange meddelandetext', variant: 'destructive' }); return; }

    send.mutate(
      {
        channel,
        recipient_type:   recipType,
        recipient_address: address.trim(),
        subject:           subject.trim() || undefined,
        body:              body.trim(),
        template_id:       templateId || undefined,
        scheduled_at:      scheduleAt,
      },
      {
        onSuccess: () => {
          toast({ title: scheduleAt ? 'Meddelande schemalagt' : 'Meddelande skickat' });
          navigate('/communication/log');
        },
        onError: (e) => {
          toast({ title: 'Fel vid sändning', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        },
      },
    );
  }

  const channelCfg = configMap[channel];
  const isEnabled  = channelCfg?.enabled ?? false;

  return (
    <div className="max-w-2xl space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/communication" className="hover:text-foreground">Kommunikation</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">Nytt meddelande</span>
      </div>

      <SubscriptionGate feature="communication:templates:manage">

      {/* Channel selector */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Välj kanal</h2>
        <div className="grid grid-cols-5 gap-2">
          {ALL_CHANNELS.map((ch) => {
            const meta = CHANNEL_META[ch];
            const cfg  = configMap[ch];
            const active = channel === ch;
            return (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-2.5 rounded-lg border transition-all',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-accent/20',
                )}
              >
                <ChannelIcon channel={ch} size="md" />
                <span className={cn('text-[10px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
                  {meta.label}
                </span>
                {cfg && !cfg.enabled && (
                  <span className="text-[8px] text-muted-foreground/50">Inaktiv</span>
                )}
              </button>
            );
          })}
        </div>
        {!isEnabled && channel !== 'push' && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 rounded-md">
            <span>⚠</span>
            <span>
              {CHANNEL_META[channel].label} är inte aktiverat.{' '}
              <Link to="/communication/settings" className="underline">Konfigurera kanalen</Link> för att skicka.
            </span>
          </div>
        )}
      </div>

      {/* Recipient */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Mottagare</h2>

        <div className="flex gap-1.5">
          {(['student', 'instructor', 'manual'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setRecipType(t)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
                recipType === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {t === 'student' ? 'Elev' : t === 'instructor' ? 'Instruktör' : 'Manuell'}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
            {channel === 'email' ? <Mail className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
            {channel === 'email' ? 'E-postadress' : channel === 'push' ? 'Device token' : 'Telefonnummer'}
          </label>
          <input
            type={channel === 'email' ? 'email' : 'text'}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={channel === 'email' ? 'namn@exempel.se' : channel === 'push' ? 'Firebase device token' : '+46 70 000 00 00'}
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Message content */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Meddelande</h2>
          {templates.length > 0 && (
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="h-7 text-xs px-2 border border-border rounded bg-background text-muted-foreground focus:outline-none"
            >
              <option value="">Välj mall…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.key}</option>
              ))}
            </select>
          )}
        </div>

        {/* Subject (email only) */}
        {channel === 'email' && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Ämne</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ämnesrad…"
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        )}

        {/* Body */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Meddelande</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={charLimit}
            rows={channel === 'email' ? 8 : 4}
            placeholder="Skriv ditt meddelande här…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {charLimit && (
            <p className={cn('text-xs', body.length > charLimit * 0.9 ? 'text-amber-600' : 'text-muted-foreground')}>
              {body.length}/{charLimit} tecken{body.length > charLimit ? ' — delas upp i flera SMS' : ''}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Variabler: <code className="bg-muted px-1 rounded">{'{förnamn}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{datum}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{tid}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{trafikskola}'}</code>
          </p>
        </div>
      </div>

      {/* Schedule */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          Schemalägg (valfritt)
        </h2>
        <input
          type="datetime-local"
          value={scheduled}
          onChange={(e) => setScheduled(e.target.value)}
          className="h-9 text-sm border border-border rounded-md px-3 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {scheduled && (
          <p className="text-xs text-muted-foreground">
            Skickas {new Date(scheduled).toLocaleString('sv-SE')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end">
        <Button variant="outline" onClick={() => navigate('/communication')}>Avbryt</Button>
        <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
          <>
            {scheduled && (
              <Button
                variant="outline"
                onClick={() => handleSend(new Date(scheduled).toISOString())}
                disabled={send.isPending}
              >
                <Calendar className="w-4 h-4 mr-1.5" />
                Schemalägg
              </Button>
            )}
            <Button
              className="bg-green-500 hover:bg-green-600 text-white"
              onClick={() => handleSend()}
              disabled={send.isPending}
            >
              <Send className="w-4 h-4 mr-1.5" />
              {send.isPending ? 'Skickar…' : 'Skicka nu'}
            </Button>
          </>
        </PermissionGate>
      </div>
      </SubscriptionGate>
    </div>
  );
}
