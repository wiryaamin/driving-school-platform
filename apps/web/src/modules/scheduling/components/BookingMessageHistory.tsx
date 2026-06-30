import { Skeleton } from '@platform/ui';
import { useStudentMessages } from '@modules/communication/hooks/useCommunication.js';
import { ChannelBadge, StatusBadge } from '@modules/communication/index.js';

function relTime(iso: string): string {
  const ms    = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(ms / 60_000);
  if (mins < 1)   return 'nyss';
  if (mins < 60)  return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} tim`;
  const days  = Math.floor(hours / 24);
  return `${days} dag${days !== 1 ? 'ar' : ''}`;
}

interface Props {
  studentId: string;
  maxCount?: number;
}

export function BookingMessageHistory({ studentId, maxCount = 5 }: Props) {
  const { data, isLoading } = useStudentMessages(studentId);
  const messages = (data?.data ?? []).slice(0, maxCount);

  if (isLoading) {
    return (
      <div className="space-y-1.5 py-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }

  if (messages.length === 0) {
    return <p className="text-xs text-muted-foreground py-1">Inga notiser skickade</p>;
  }

  return (
    <div className="space-y-1.5 py-1">
      {messages.map((msg) => (
        <div key={msg.id} className="flex items-center gap-1.5 min-w-0">
          <ChannelBadge channel={msg.channel} />
          <StatusBadge status={msg.status} />
          <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
            {msg.body.slice(0, 45)}{msg.body.length > 45 ? '…' : ''}
          </span>
          <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">
            {relTime(msg.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
