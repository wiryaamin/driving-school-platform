import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import { Button, DataTable } from '@platform/ui';
import { formatDateShort, formatTime } from '@platform/utils';
import { useActivityLogs } from '../hooks/useLogs.js';
import type { ActivityLogEntry } from '../hooks/useLogs.js';
import { cn } from '@/lib/utils.js';

// Always Europe/Stockholm, regardless of the viewer's device timezone.
function DatumCell({ iso }: { iso: string }) {
  return (
    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
      {formatDateShort(iso)} <span className="text-muted-foreground/60">|</span> {formatTime(iso)}
    </span>
  );
}

function buildColumns(): ColumnDef<ActivityLogEntry>[] {
  return [
    {
      id: 'datum',
      header: 'Datum',
      cell: ({ row }) => <DatumCell iso={row.original.datum} />,
      size: 150,
      enableSorting: false,
    },
    {
      id: 'kund',
      header: 'Kund',
      cell: ({ row }) => (
        <span className="text-sm text-primary font-medium">{row.original.kund}</span>
      ),
      size: 180,
      enableSorting: false,
    },
    {
      id: 'email',
      header: 'E-post',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {row.original.email}
        </span>
      ),
      size: 200,
      enableSorting: false,
    },
    {
      id: 'typ',
      header: 'Typ',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.typ}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'entity',
      header: 'Objekt',
      cell: ({ row }) => {
        const { entity_type, entity_id } = row.original;
        if (!entity_type) return <span className="text-sm text-muted-foreground/40">—</span>;
        return (
          <span className="text-xs text-muted-foreground">
            {entity_type}
            {entity_id ? <span className="text-muted-foreground/50"> · {entity_id.slice(0, 8)}…</span> : null}
          </span>
        );
      },
      size: 180,
      enableSorting: false,
    },
  ];
}

export function AktivitetsloggarPage() {
  const { data, isLoading, error, refetch } = useActivityLogs({ per_page: 50 });
  const records = data?.data ?? [];
  const columns = useMemo(() => buildColumns(), []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">
          Visar alla aktiviteter i plattformen
        </p>
        <Button variant="ghost" size="icon" onClick={() => void refetch()} disabled={isLoading} title="Uppdatera">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-destructive">Det gick inte att hämta aktivitetsloggar.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Försök igen</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={records}
            isLoading={isLoading}
            emptyMessage="Inga aktivitetsloggar hittades."
            defaultPageSize={50}
          />
        </div>
      )}

      {data?.meta && (
        <p className="text-xs text-muted-foreground mt-2">
          Visar {records.length} av {data.meta.total} resultat
        </p>
      )}
    </div>
  );
}
