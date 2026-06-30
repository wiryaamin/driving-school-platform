import { MessageSquare, Mail, Bell, Mic } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import type { CommChannel } from '../hooks/useCommunication.js';

const CHANNEL_META: Record<CommChannel, {
  Icon:  typeof MessageSquare;
  label: string;
  bg:    string;
  text:  string;
}> = {
  sms:       { Icon: MessageSquare, label: 'SMS',       bg: 'bg-blue-100',   text: 'text-blue-600 dark:text-blue-400' },
  email:     { Icon: Mail,          label: 'E-post',    bg: 'bg-violet-100', text: 'text-violet-600 dark:text-violet-400' },
  whatsapp:  { Icon: MessageSquare, label: 'WhatsApp',  bg: 'bg-green-100',  text: 'text-green-600 dark:text-green-400' },
  push:      { Icon: Bell,          label: 'Push',      bg: 'bg-amber-100',  text: 'text-amber-600 dark:text-amber-400' },
  voice:     { Icon: Mic,           label: 'AI Röst',   bg: 'bg-pink-100',   text: 'text-pink-600 dark:text-pink-400' },
};

export function ChannelIcon({
  channel,
  size = 'md',
  showLabel = false,
}: {
  channel:    CommChannel;
  size?:      'sm' | 'md' | 'lg';
  showLabel?: boolean;
}) {
  const meta = CHANNEL_META[channel];
  const iconSize = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
  const boxSize  = size === 'sm' ? 'w-6 h-6'  : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('rounded-lg flex items-center justify-center shrink-0', meta.bg, boxSize)}>
        <meta.Icon className={cn(iconSize, meta.text)} />
      </span>
      {showLabel && (
        <span className="text-xs font-medium text-foreground">{meta.label}</span>
      )}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: CommChannel }) {
  const meta = CHANNEL_META[channel];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold',
      meta.bg, meta.text,
    )}>
      <meta.Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    queued:    { label: 'I kö',      cls: 'bg-muted text-muted-foreground' },
    sending:   { label: 'Skickar',   cls: 'bg-blue-100 text-blue-700' },
    sent:      { label: 'Skickat',   cls: 'bg-emerald-100 text-emerald-700' },
    delivered: { label: 'Levererat', cls: 'bg-emerald-100 text-emerald-700 font-bold' },
    failed:    { label: 'Misslyckades', cls: 'bg-red-100 text-red-700' },
    bounced:   { label: 'Bounced',   cls: 'bg-orange-100 text-orange-700' },
    cancelled: { label: 'Avbröts',   cls: 'bg-muted text-muted-foreground/60' },
  };
  const c = cfg[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', c.cls)}>
      {c.label}
    </span>
  );
}

export { CHANNEL_META };
