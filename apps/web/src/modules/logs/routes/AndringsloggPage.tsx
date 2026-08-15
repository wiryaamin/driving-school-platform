import { useState, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import { Button, DataTable } from '@platform/ui';
import { formatDateShort, formatTime } from '@platform/utils';
import { useTenantAuditLog } from '../hooks/useLogs.js';
import type { AuditLogEntry } from '../hooks/useLogs.js';
import { cn } from '@/lib/utils.js';

/**
 * Ändringslogg — the tenant-scoped audit tab inside the existing Loggar
 * workspace (audit_logs). Deliberately built with the same conventions as
 * its sibling tabs in this same module (DataTable, a "Filtrera" card matching
 * MissadeUtbildningsloggarPage, and the DatumCell split date|time rendering
 * already established for Bokningsloggar/Kommunikationsloggar/Aktivitetsloggar)
 * rather than introducing a new visual language.
 */

// Always Europe/Stockholm, regardless of the viewer's device timezone — same
// shared formatter already used across the rest of Loggar (see commit 46ad024).
function DatumCell({ iso }: { iso: string }) {
  return (
    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
      {formatDateShort(iso)} <span className="text-muted-foreground/60">|</span> {formatTime(iso)}
    </span>
  );
}

const ENTITY_TYPE_OPTIONS = [
  { value: '',                     label: 'Alla typer' },
  { value: 'students',             label: 'Elever' },
  { value: 'instructors',          label: 'Lärare' },
  { value: 'vehicles',             label: 'Fordon' },
  { value: 'lesson_bookings',      label: 'Bokningar' },
  { value: 'invoices',             label: 'Fakturor' },
  { value: 'payments',             label: 'Betalningar' },
  { value: 'memberships',          label: 'Medlemskap' },
  { value: 'membership_roles',     label: 'Rolltilldelningar' },
  { value: 'organizations',        label: 'Organisation' },
  { value: 'student_documents',    label: 'Dokument' },
  { value: 'regulatory_workflows', label: 'Myndighetsärenden' },
];

const OPERATION_OPTIONS = [
  { value: '',       label: 'Alla åtgärder' },
  { value: 'INSERT', label: 'Skapad' },
  { value: 'UPDATE', label: 'Uppdaterad' },
  { value: 'DELETE', label: 'Raderad' },
];

function fieldLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nej';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<AuditLogEntry>[] {
  return [
    {
      id: 'datum',
      header: 'Datum',
      cell: ({ row }) => <DatumCell iso={row.original.datum} />,
      size: 150,
      enableSorting: false,
    },
    {
      id: 'handelse',
      header: 'Händelse',
      cell: ({ row }) => (
        <span className="text-sm text-primary hover:underline cursor-pointer">
          {row.original.handelse}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'anvandare',
      header: 'Användare',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {row.original.anvandare}
        </span>
      ),
      size: 200,
      enableSorting: false,
    },
    {
      id: 'modul',
      header: 'Modul',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.modul}</span>
      ),
      size: 140,
      enableSorting: false,
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AndringsloggPage() {
  const [entityType, setEntityType] = useState('');
  const [operation,  setOperation]  = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [selected,   setSelected]   = useState<AuditLogEntry | null>(null);

  const { data, isLoading, error, refetch } = useTenantAuditLog({
    entity_type: entityType || undefined,
    operation:   operation || undefined,
    actor_email: actorEmail || undefined,
    date_from:   dateFrom || undefined,
    date_to:     dateTo || undefined,
    per_page:    50,
  });

  const records = data?.data ?? [];
  const columns = useMemo(() => buildColumns(), []);

  return (
    <div>
      {/* Filters — same "Filtrera" card pattern as Missade utbildningsloggar */}
      <div className="bg-card border border-border rounded-lg p-4 mb-5">
        <p className="text-sm font-semibold text-primary mb-3">Filtrera</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Åtgärd</label>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {OPERATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Användare</label>
            <input
              type="text"
              value={actorEmail}
              onChange={(e) => setActorEmail(e.target.value)}
              placeholder="E-post…"
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
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

      {/* Refresh — same header row pattern as Bokningsloggar/Aktivitetsloggar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">
          Visar ändringar i din organisation
        </p>
        <Button variant="ghost" size="icon" onClick={() => void refetch()} disabled={isLoading} title="Uppdatera">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Table */}
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-destructive">Det gick inte att hämta ändringsloggen.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Försök igen</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={records}
            isLoading={isLoading}
            emptyMessage="Inga ändringar hittades."
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

      {/* Detail — appears below the table when a row is selected, matching
          the app's existing "click item, see detail underneath" pattern
          (e.g. DeliveryLogPage) rather than a new modal/sheet design. */}
      {selected && (
        <div className="mt-4 bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-primary">{selected.handelse}</p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Stäng
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
            <div>
              <p className="text-muted-foreground mb-0.5">Användare</p>
              <p className="text-foreground">{selected.anvandare}</p>
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

          {selected.changed_fields && selected.changed_fields.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium pb-1 pr-4">Fält</th>
                  <th className="text-left font-medium pb-1 pr-4">Tidigare värde</th>
                  <th className="text-left font-medium pb-1">Nytt värde</th>
                </tr>
              </thead>
              <tbody>
                {selected.changed_fields.map((f) => (
                  <tr key={f} className="border-t border-border/60">
                    <td className="py-1.5 pr-4 text-foreground capitalize whitespace-nowrap">{fieldLabel(f)}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground max-w-[280px] truncate">
                      {formatValue(selected.old_values?.[f])}
                    </td>
                    <td className="py-1.5 text-foreground max-w-[280px] truncate">
                      {formatValue(selected.new_values?.[f])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground">Inga fältändringar registrerade för denna post.</p>
          )}
        </div>
      )}
    </div>
  );
}
