import { useState, useMemo } from 'react';
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

const ENTITY_TYPE_OPTIONS = [
  { value: '',           label: 'Alla typer' },
  { value: 'student',    label: 'Elever' },
  { value: 'instructor', label: 'Lärare' },
  { value: 'guardian',   label: 'Vårdnadshavare' },
  { value: 'vehicle',    label: 'Fordon' },
  { value: 'booking',    label: 'Bokningar' },
];

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
      header: 'Användare',
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
      header: 'Vad hände',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.typ}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'entity',
      header: 'Objekt',
      cell: ({ row }) => {
        const { entity_id, modul } = row.original;
        return (
          <span className="text-xs text-muted-foreground">
            {modul}
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
  const [entityType, setEntityType] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [selected,   setSelected]   = useState<ActivityLogEntry | null>(null);

  const { data, isLoading, error, refetch } = useActivityLogs({
    per_page:    50,
    entity_type: entityType || undefined,
    date_from:   dateFrom || undefined,
    date_to:     dateTo || undefined,
  });
  const records = data?.data ?? [];
  const columns = useMemo(() => buildColumns(), []);

  return (
    <div>
      {/* Filters — same "Filtrera" card pattern as the other Loggar tabs */}
      <div className="bg-card border border-border rounded-lg p-4 mb-5">
        <p className="text-sm font-semibold text-primary mb-3">Filtrera</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Typ</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {ENTITY_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 lg:col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">Datum</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full text-sm border border-border rounded-md px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full text-sm border border-border rounded-md px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">
          Visar aktivitet i din organisation
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
            onRowClick={(row) => setSelected(row.id === selected?.id ? null : row)}
            getRowClassName={(row) => (row.id === selected?.id ? 'bg-muted/40' : '')}
          />
        </div>
      )}

      {data?.meta && (
        <p className="text-xs text-muted-foreground mt-2">
          Visar {records.length} av {data.meta.total} resultat
        </p>
      )}

      {/* Detail — same below-table pattern as Ändringslogg, no raw metadata */}
      {selected && (
        <div className="mt-4 bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-primary">{selected.typ}</p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Stäng
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-0.5">Användare</p>
              <p className="text-foreground">{selected.kund !== '—' ? selected.kund : (selected.email !== '—' ? selected.email : '—')}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Datum</p>
              <p className="text-foreground font-mono">
                {formatDateShort(selected.datum)} {formatTime(selected.datum)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Objekt</p>
              <p className="text-foreground">{selected.modul}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Identifierare</p>
              <p className="text-foreground font-mono">{selected.entity_id ? `${selected.entity_id.slice(0, 8)}…` : '—'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
