import { Badge } from '@platform/ui';
import type { BookingStatus } from '@platform/types';

// ─── Status config ────────────────────────────────────────────────────────────

interface BookingStatusConfig {
  label:     string;
  className: string;
  pending?:  boolean;
}

export const BOOKING_STATUS_CONFIG: Record<BookingStatus, BookingStatusConfig> = {
  draft:       { label: 'Utkast',     className: 'bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400 border-transparent' },
  reserved:    { label: 'Reserverad', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-transparent', pending: true },
  confirmed:   { label: 'Bekräftad', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-transparent' },
  completed:   { label: 'Närvade',   className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-transparent' },
  cancelled:   { label: 'Avbokad',   className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-transparent' },
  no_show:     { label: 'Uteblev',   className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-transparent' },
  rescheduled: { label: 'Ombokas',   className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-transparent' },
};

export function bookingStatusLabel(status: BookingStatus): string {
  return BOOKING_STATUS_CONFIG[status]?.label ?? status;
}

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return ['completed', 'cancelled', 'no_show', 'rescheduled'].includes(status);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface BookingStatusBadgeProps {
  status: BookingStatus;
}

export function BookingStatusBadge({ status }: BookingStatusBadgeProps) {
  const config = BOOKING_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.pending && (
        <span className="relative flex w-1.5 h-1.5 mr-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
        </span>
      )}
      {config.label}
    </Badge>
  );
}
