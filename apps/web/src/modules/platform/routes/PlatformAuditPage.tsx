import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ScrollText, Search, ChevronLeft, ChevronRight, Filter, AlertTriangle,
} from 'lucide-react';
import {
  Input, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformAuditLog } from '../hooks/usePlatformOpsCenter.js';
import type { AuditLogRow } from '../hooks/usePlatformOpsCenter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const ENTITY_TYPE_FILTERS = [
  { value: '',                    label: 'Alla typer' },
  { value: 'organizations',       label: 'Organisationer' },
  { value: 'platform_admins',     label: 'Plattformsadmins' },
  { value: 'user_role_assignments', label: 'Rolltilldelningar' },
  { value: 'memberships',         label: 'Medlemskap' },
  { value: 'students',            label: 'Elever' },
  { value: 'instructors',         label: 'Lärare' },
  { value: 'lesson_bookings',     label: 'Bokningar' },
  { value: 'lesson_slots',        label: 'Tider' },
  { value: 'lesson_packages',     label: 'Paket' },
  { value: 'invoices',            label: 'Fakturor' },
  { value: 'profiles',            label: 'Profiler' },
];

const OPERATION_FILTERS = [
  { value: '',       label: 'Alla åtgärder' },
  { value: 'INSERT', label: 'Skapad' },
  { value: 'UPDATE', label: 'Uppdaterad' },
  { value: 'DELETE', label: 'Raderad' },
];

// ─── Display maps ─────────────────────────────────────────────────────────────

const ENTITY_LABEL: Record<string, string> = {
  organizations:        'Organisationer',
  platform_admins:      'Plattformsadmin',
  user_role_assignments:'Rolltilldelning',
  memberships:          'Medlemskap',
  students:             'Elev',
  instructors:          'Lärare',
  lesson_bookings:      'Bokning',
  lesson_slots:         'Tid',
  lesson_packages:      'Paket',
  invoices:             'Faktura',
  profiles:             'Profil',
};

const OP_LABEL: Record<string, string> = {
  INSERT: 'Skapad',
  UPDATE: 'Uppdaterad',
  DELETE: 'Raderad',
};

const SEVERITY_CLASS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low:      'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Kritisk',
  high:     'Hög',
  medium:   'Medium',
  low:      'Låg',
};

const OP_CLASS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformAuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const entityType  = searchParams.get('entity_type') ?? '';
  const operation   = searchParams.get('operation')   ?? '';
  const dateFrom    = searchParams.get('date_from')   ?? '';
  const dateTo      = searchParams.get('date_to')     ?? '';
  const pageParam   = parseInt(searchParams.get('page') ?? '1', 10);
  const orgIdFilter = searchParams.get('org_id') ?? '';   // set programmatically from support

  const [localActor, setLocalActor] = useState(searchParams.get('actor_email') ?? '');
  const actorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actorEmail, setActorEmail] = useState(searchParams.get('actor_email') ?? '');

  const page   = Math.max(1, pageParam);
  const offset = (page - 1) * PAGE_SIZE;

  const filters: Parameters<typeof usePlatformAuditLog>[0] = { limit: PAGE_SIZE, offset };
  if (orgIdFilter) filters.orgId      = orgIdFilter;
  if (actorEmail)  filters.actorEmail = actorEmail;
  if (entityType)  filters.entityType = entityType;
  if (operation)   filters.operation  = operation;
  if (dateFrom)    filters.dateFrom   = dateFrom;
  if (dateTo)      filters.dateTo     = dateTo;

  const { data, isLoading, error } = usePlatformAuditLog(filters);

  const total     = data?.total ?? 0;
  const rows      = data?.rows  ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => () => { if (actorTimer.current) clearTimeout(actorTimer.current); }, []);

  function handleActorSearch(value: string) {
    setLocalActor(value);
    if (actorTimer.current) clearTimeout(actorTimer.current);
    actorTimer.current = setTimeout(() => {
      setActorEmail(value.trim());
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (value.trim()) { next.set('actor_email', value.trim()); } else { next.delete('actor_email'); }
        next.set('page', '1');
        return next;
      });
    }, 400);
  }

  function handleEntityChange(value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value && value !== '__all__') { next.set('entity_type', value); } else { next.delete('entity_type'); }
      next.set('page', '1');
      return next;
    });
  }

  function handleOperationChange(value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value && value !== '__all__') { next.set('operation', value); } else { next.delete('operation'); }
      next.set('page', '1');
      return next;
    });
  }

  function handleDateFromChange(value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) { next.set('date_from', value); } else { next.delete('date_from'); }
      next.set('page', '1');
      return next;
    });
  }

  function handleDateToChange(value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) { next.set('date_to', value); } else { next.delete('date_to'); }
      next.set('page', '1');
      return next;
    });
  }

  function handlePageChange(p: number) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    });
  }

  function fmtTimestamp(ts: string) {
    const d = new Date(ts);
    return `${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function truncateId(id: string | null) {
    if (!id) return '—';
    return id.length > 8 ? `${id.slice(0, 8)}…` : id;
  }

  const skeletonRows = Array.from({ length: 8 });

  return (
    <PageLayout>
      <PageHeader
        title="Granskningslogg"
        description={isLoading ? undefined : `${total.toLocaleString('sv-SE')} händelser`}
      />

      {/* ── Filters ── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Filter className="w-3.5 h-3.5" />
          Filter
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Actor email */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Aktör e-post…"
              value={localActor}
              onChange={e => handleActorSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Entity type */}
          <Select value={entityType} onValueChange={handleEntityChange}>
            <SelectTrigger>
              <SelectValue placeholder="Alla typer" />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPE_FILTERS.map(f => (
                <SelectItem key={f.value || '__all__'} value={f.value || '__all__'}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Operation */}
          <Select value={operation} onValueChange={handleOperationChange}>
            <SelectTrigger>
              <SelectValue placeholder="Alla åtgärder" />
            </SelectTrigger>
            <SelectContent>
              {OPERATION_FILTERS.map(f => (
                <SelectItem key={f.value || '__all__'} value={f.value || '__all__'}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date from */}
          <div className="flex gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={e => handleDateFromChange(e.target.value)}
              className="flex-1"
              title="Från datum"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={e => handleDateToChange(e.target.value)}
              className="flex-1"
              title="Till datum"
            />
          </div>
        </div>
        {orgIdFilter && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Filtrerat på organisation: <code className="font-mono text-[10px]">{orgIdFilter}</code>
          </p>
        )}
      </div>

      {/* ── Error ── */}
      {!isLoading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 py-12 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive/60" />
          <p className="text-sm font-medium text-destructive">Kunde inte hämta granskningslogg</p>
          <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : 'Okänt fel'}</p>
        </div>
      )}

      {/* ── Table ── */}
      {!error && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Tidpunkt</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aktör</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Organisation</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Typ</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Objekt</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Åtgärd</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Utfall</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Allvarlighet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && skeletonRows.map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-14 text-center">
                      <ScrollText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Inga händelser matchar filtren</p>
                    </td>
                  </tr>
                )}

                {!isLoading && rows.map((row: AuditLogRow) => (
                  <tr key={row.id} className="hover:bg-muted/40 transition-colors">
                    {/* Timestamp */}
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                      {fmtTimestamp(row.occurred_at)}
                    </td>

                    {/* Actor */}
                    <td className="px-3 py-3 text-xs max-w-[160px]">
                      <span className="truncate block text-foreground">
                        {row.actor_email ?? '—'}
                      </span>
                    </td>

                    {/* Organisation */}
                    <td className="px-3 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[140px]">
                      <span className="truncate block">{row.org_name ?? '—'}</span>
                    </td>

                    {/* Entity type */}
                    <td className="px-3 py-3">
                      <span className="text-xs text-foreground font-medium">
                        {ENTITY_LABEL[row.entity_type] ?? row.entity_type}
                      </span>
                    </td>

                    {/* Object ID */}
                    <td className="px-3 py-3 text-xs text-muted-foreground font-mono hidden lg:table-cell">
                      {truncateId(row.entity_id)}
                    </td>

                    {/* Operation */}
                    <td className="px-3 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                        OP_CLASS[row.operation] ?? 'bg-muted text-muted-foreground',
                      )}>
                        {OP_LABEL[row.operation] ?? row.operation}
                      </span>
                    </td>

                    {/* Outcome */}
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Lyckades
                      </span>
                    </td>

                    {/* Severity */}
                    <td className="px-3 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                        SEVERITY_CLASS[row.severity] ?? 'bg-muted text-muted-foreground',
                      )}>
                        {SEVERITY_LABEL[row.severity] ?? row.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} av {total.toLocaleString('sv-SE')}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                  className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-foreground px-2 tabular-nums">{page} / {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
