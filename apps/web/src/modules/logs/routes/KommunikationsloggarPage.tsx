import { useState, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import { Button, DataTable } from '@platform/ui';
import { formatDateShort, formatTime } from '@platform/utils';
import { useCommunicationLogs } from '../hooks/useLogs.js';
import type { CommunicationLogEntry } from '../hooks/useLogs.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Always Europe/Stockholm, regardless of the viewer's device timezone.

function DatumCell({ iso }: { iso: string }) {
  return (
    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
      {formatDateShort(iso)} <span className="text-muted-foreground/60">|</span> {formatTime(iso)}
    </span>
  );
}

function KanalBadge({ kanal, kanalRaw }: { kanal: string; kanalRaw: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      kanalRaw === 'sms'   && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      kanalRaw === 'email' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      kanalRaw === 'push'  && 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    )}>
      {kanal}
    </span>
  );
}

function StatusBadge({ status, statusRaw }: { status: string; statusRaw: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      statusRaw === 'sent'      && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      statusRaw === 'failed'    && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      statusRaw === 'pending'   && 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
      statusRaw === 'sending'   && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      statusRaw === 'cancelled' && 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    )}>
      {status}
    </span>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<CommunicationLogEntry>[] {
  return [
    {
      id: 'datum',
      header: 'Datum',
      cell: ({ row }) => <DatumCell iso={row.original.datum} />,
      size: 130,
      enableSorting: false,
    },
    {
      id: 'kanal',
      header: 'Kanal',
      cell: ({ row }) => <KanalBadge kanal={row.original.kanal} kanalRaw={row.original.kanal_raw} />,
      size: 80,
      enableSorting: false,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} statusRaw={row.original.status_raw} />,
      size: 100,
      enableSorting: false,
    },
    {
      id: 'amne',
      header: 'Ämne',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.amne}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'skickad_av',
      header: 'Skickad av',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.skickad_av}</span>
      ),
      size: 160,
      enableSorting: false,
    },
    {
      id: 'skickad_till',
      header: 'Skickad till',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
          {row.original.skickad_till}
        </span>
      ),
      size: 180,
      enableSorting: false,
    },
    {
      id: 'typ',
      header: 'Typ',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.typ}</span>
      ),
      size: 160,
      enableSorting: false,
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function KommunikationsloggarPage() {
  const [channel, setChannel] = useState('all');
  const { data, isLoading, error, refetch } = useCommunicationLogs({ channel: channel === 'all' ? undefined : channel, per_page: 50 });
  const records = data?.data ?? [];
  const columns = useMemo(() => buildColumns(), []);

  return (
    <div>
      {/* Channel filters */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: 'all',   label: 'Alla' },
          { key: 'sms',   label: 'SMS' },
          { key: 'email', label: 'E-post' },
          { key: 'push',  label: 'Push' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setChannel(f.key)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md font-medium transition-colors',
              channel === f.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto">
          <Button variant="ghost" size="icon" onClick={() => void refetch()} disabled={isLoading} title="Uppdatera">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-destructive">Det gick inte att hämta kommunikationsloggar.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Försök igen</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={records}
            isLoading={isLoading}
            emptyMessage="Inga kommunikationsloggar hittades."
            defaultPageSize={50}
          />
        </div>
      )}

      {data?.meta && (
        <p className="text-xs text-muted-foreground mt-2">
          Visar 1 till {records.length} av {data.meta.total} resultat
        </p>
      )}
    </div>
  );
}
