import { useState, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import { Button, DataTable } from '@platform/ui';
import { formatDateShort, formatTime } from '@platform/utils';
import { useBookingLogs } from '../hooks/useLogs.js';
import type { BookingLogEntry, BookingLogFilter } from '../hooks/useLogs.js';
import { cn } from '@/lib/utils.js';

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTERS: { key: BookingLogFilter; label: string }[] = [
  { key: 'all',       label: 'Visa alla'   },
  { key: 'booked',    label: 'Elevbokning' },
  { key: 'cancelled', label: 'Avbokningar' },
];

// ─── Status colour helper ─────────────────────────────────────────────────────

function rowClass(status: string): string {
  if (status === 'cancelled' || status === 'no_show') {
    return 'bg-rose-50 dark:bg-rose-950/20';
  }
  return '';
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function KallaBadge({ kalla }: { kalla: string }) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold',
      kalla === 'TC'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    )}>
      {kalla}
    </span>
  );
}

// ─── Date formatter ───────────────────────────────────────────────────────────
// Always Europe/Stockholm, regardless of the viewer's device timezone — see
// packages/utils/src/formatters/date.ts. Date and time are rendered as two
// visually distinct parts so the event time is readable without a detail view.

function DatumCell({ iso }: { iso: string }) {
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
      {formatDateShort(iso)} <span className="text-muted-foreground/60">|</span> {formatTime(iso)}
    </span>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<BookingLogEntry>[] {
  return [
    {
      id: 'kalla',
      header: 'Källa',
      cell: ({ row }) => <KallaBadge kalla={row.original.kalla} />,
      size: 56,
      enableSorting: false,
    },
    {
      id: 'datum',
      header: 'Datum',
      cell: ({ row }) => <DatumCell iso={row.original.datum} />,
      size: 140,
      enableSorting: false,
    },
    {
      id: 'handelse',
      header: 'Händelse',
      cell: ({ row }) => {
        const { handelse, status } = row.original;
        const isCancelled = status === 'cancelled' || status === 'no_show';
        return (
          <span className={cn('text-sm', isCancelled ? 'text-rose-600 dark:text-rose-400' : 'text-primary hover:underline cursor-pointer')}>
            {handelse}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      id: 'tillfalle',
      header: 'Tillfälle',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[260px] block">
          {row.original.tillfalle}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'larare',
      header: 'Lärare',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.larare}
        </span>
      ),
      size: 160,
      enableSorting: false,
    },
    {
      id: 'utford',
      header: 'Utförd',
      cell: ({ row }) => (
        <span className={cn(
          'text-sm',
          row.original.status === 'cancelled' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground',
        )}>
          {row.original.utford}
        </span>
      ),
      size: 120,
      enableSorting: false,
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BookingLogsPage() {
  const [filter, setFilter] = useState<BookingLogFilter>('all');

  const { data, isLoading, error, refetch } = useBookingLogs({ filter, per_page: 50 });
  const records = data?.data ?? [];
  const columns = useMemo(() => buildColumns(), []);

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-0 mb-4 border-b border-border">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              filter === f.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto pb-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refetch()}
            disabled={isLoading}
            title="Uppdatera"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-destructive">Det gick inte att hämta bokningsloggar.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Försök igen
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={records}
            isLoading={isLoading}
            emptyMessage="Inga bokningsloggar hittades."
            defaultPageSize={50}
            getRowClassName={(row) => rowClass(row.status)}
          />
        </div>
      )}
    </div>
  );
}
