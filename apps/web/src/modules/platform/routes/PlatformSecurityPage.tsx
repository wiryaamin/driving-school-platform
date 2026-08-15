import { useState, useMemo } from 'react';
import { ShieldAlert, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { formatDateShort, formatTime } from '@platform/utils';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformSecurityEvents } from '../hooks/usePlatformOpsCenter.js';
import type { SecurityEvent } from '../hooks/usePlatformOpsCenter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const SEVERITY_FILTERS = [
  { value: '',         label: 'Alla allvarlighetsnivåer' },
  { value: 'critical', label: 'Kritisk' },
  { value: 'high',     label: 'Hög' },
  { value: 'medium',   label: 'Medium' },
  { value: 'low',      label: 'Låg' },
];

const ENTITY_TYPE_FILTERS = [
  { value: '',                      label: 'Alla typer' },
  { value: 'platform_admins',       label: 'Plattformsadmins' },
  { value: 'user_role_assignments', label: 'Rolltilldelningar' },
  { value: 'memberships',           label: 'Medlemskap' },
  { value: 'organizations',         label: 'Organisationer' },
];

// ─── Display maps ─────────────────────────────────────────────────────────────

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

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-gray-400',
};

const ENTITY_LABEL: Record<string, string> = {
  platform_admins:       'Plattformsadmin',
  user_role_assignments: 'Rolltilldelning',
  memberships:           'Medlemskap',
  organizations:         'Organisation',
};

const OP_LABEL: Record<string, string> = {
  INSERT: 'Skapad',
  UPDATE: 'Uppdaterad',
  DELETE: 'Raderad',
};

const OP_CLASS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformSecurityPage() {
  const [severityFilter, setSeverityFilter]   = useState('');
  const [entityFilter, setEntityFilter]       = useState('');
  const [page, setPage]                       = useState(1);

  const { data: events, isLoading, error } = usePlatformSecurityEvents(200);

  function handleSeverityChange(value: string) {
    setSeverityFilter(value === '__all__' ? '' : value);
    setPage(1);
  }
  function handleEntityChange(value: string) {
    setEntityFilter(value === '__all__' ? '' : value);
    setPage(1);
  }

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const items = events ?? [];
    return items.filter(ev => {
      if (severityFilter && ev.severity !== severityFilter) return false;
      if (entityFilter  && ev.entity_type !== entityFilter) return false;
      return true;
    });
  }, [events, severityFilter, entityFilter]);

  // ── Paginate ───────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageItems  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ── Severity summary ───────────────────────────────────────────────────────
  const summary = useMemo(() => ({
    critical: (events ?? []).filter(e => e.severity === 'critical').length,
    high:     (events ?? []).filter(e => e.severity === 'high').length,
    medium:   (events ?? []).filter(e => e.severity === 'medium').length,
    low:      (events ?? []).filter(e => e.severity === 'low').length,
  }), [events]);

  // Always Europe/Stockholm, regardless of the viewer's device timezone —
  // the previous inline formatter used the browser's local timezone.
  function fmtTs(ts: string) {
    return `${formatDateShort(ts)} ${formatTime(ts)}`;
  }

  function describeEvent(ev: SecurityEvent): string {
    const op = OP_LABEL[ev.operation] ?? ev.operation.toLowerCase();
    const entity = ENTITY_LABEL[ev.entity_type] ?? ev.entity_type;
    if (ev.entity_type === 'platform_admins') return `Plattformsadmin ${op.toLowerCase()}`;
    if (ev.entity_type === 'user_role_assignments') return `Rolltilldelning ${op.toLowerCase()}`;
    if (ev.entity_type === 'memberships') return `Medlemskap ${op.toLowerCase()}`;
    if (ev.entity_type === 'organizations' && ev.changed_fields?.includes('status')) {
      return `Organisationsstatus ändrad → ${(ev.new_values?.['status'] as string | undefined) ?? '?'}`;
    }
    if (ev.entity_type === 'organizations' && ev.changed_fields?.includes('subscription_status')) {
      return `Prenumerationsstatus → ${(ev.new_values?.['subscription_status'] as string | undefined) ?? '?'}`;
    }
    if (ev.entity_type === 'organizations' && ev.changed_fields?.includes('subscription_tier')) {
      return `Abonnemangsnivå ändrad → ${(ev.new_values?.['subscription_tier'] as string | undefined) ?? '?'}`;
    }
    return `${entity} ${op.toLowerCase()}`;
  }

  const skeletonRows = Array.from({ length: 8 });

  return (
    <PageLayout>
      <PageHeader
        title="Säkerhetshändelser"
        description="Roll- och behörighetsändringar samt organisationsstatus­händelser"
      />

      {/* Severity summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['critical', 'high', 'medium', 'low'] as const).map(sev => (
            <button
              key={sev}
              type="button"
              onClick={() => { setSeverityFilter(severityFilter === sev ? '' : sev); setPage(1); }}
              className={cn(
                'rounded-xl border p-3 text-left transition-all',
                severityFilter === sev
                  ? 'ring-2 ring-primary border-primary'
                  : 'border-border bg-card hover:bg-muted/40',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn('w-2 h-2 rounded-full', SEVERITY_DOT[sev])} />
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                  SEVERITY_CLASS[sev],
                )}>
                  {SEVERITY_LABEL[sev]}
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{summary[sev]}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={severityFilter} onValueChange={handleSeverityChange}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Alla allvarlighetsnivåer" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_FILTERS.map(f => (
              <SelectItem key={f.value || '__all__'} value={f.value || '__all__'}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={handleEntityChange}>
          <SelectTrigger className="w-full sm:w-48">
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
      </div>

      {/* Error */}
      {!isLoading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 py-12 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive/60" />
          <p className="text-sm font-medium text-destructive">Kunde inte hämta säkerhetshändelser</p>
          <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : 'Okänt fel'}</p>
        </div>
      )}

      {/* Table */}
      {!error && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Allvarlighet</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Tidpunkt</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Händelse</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Aktör</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Organisation</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Åtgärd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && skeletonRows.map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

                {!isLoading && pageItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-14 text-center">
                      <ShieldAlert className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Inga säkerhetshändelser matchar filtren</p>
                    </td>
                  </tr>
                )}

                {!isLoading && pageItems.map((ev: SecurityEvent) => (
                  <tr
                    key={ev.id}
                    className={cn(
                      'hover:bg-muted/40 transition-colors',
                      ev.severity === 'critical' && 'bg-red-50/40 dark:bg-red-950/10',
                    )}
                  >
                    {/* Severity */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className={cn('w-2 h-2 rounded-full shrink-0', SEVERITY_DOT[ev.severity])} />
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                          SEVERITY_CLASS[ev.severity] ?? 'bg-muted text-muted-foreground',
                        )}>
                          {SEVERITY_LABEL[ev.severity] ?? ev.severity}
                        </span>
                      </div>
                    </td>

                    {/* Timestamp */}
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                      {fmtTs(ev.occurred_at)}
                    </td>

                    {/* Event description */}
                    <td className="px-3 py-3 text-xs font-medium text-foreground max-w-[220px]">
                      <span className="block truncate">{describeEvent(ev)}</span>
                    </td>

                    {/* Actor */}
                    <td className="px-3 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[160px]">
                      <span className="truncate block">{ev.actor_email ?? '—'}</span>
                    </td>

                    {/* Organisation */}
                    <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell max-w-[140px]">
                      <span className="truncate block">{ev.org_name ?? '—'}</span>
                    </td>

                    {/* Operation */}
                    <td className="px-3 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                        OP_CLASS[ev.operation] ?? 'bg-muted text-muted-foreground',
                      )}>
                        {OP_LABEL[ev.operation] ?? ev.operation}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} av {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-foreground px-2 tabular-nums">{currentPage} / {totalPages}</span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(p => p + 1)}
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
