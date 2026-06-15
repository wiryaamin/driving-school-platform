import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import { Button, DataTable } from '@platform/ui';
import { useActivityLogs } from '../hooks/useLogs.js';
import type { ActivityLogEntry } from '../hooks/useLogs.js';
import { cn } from '@/lib/utils.js';

function formatDatum(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Stockholm' });
    const time = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Stockholm' });
    return `${date} ${time}`;
  } catch { return iso; }
}

function buildColumns(): ColumnDef<ActivityLogEntry>[] {
  return [
    {
      id: 'datum',
      header: 'Datum',
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
          {formatDatum(row.original.datum)}
        </span>
      ),
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
