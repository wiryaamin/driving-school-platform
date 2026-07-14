import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Handshake, ChevronRight, ChevronLeft, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { Input, Skeleton, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { useDemoRequests } from '../hooks/useDemoRequests.js';
import { usePlatformAdminsDetail } from '../hooks/usePlatformOpsCenter.js';
import { DemoRequestDetailSheet } from '../components/DemoRequestDetailSheet.js';
import { STATUS_LABEL, STATUS_BADGE_CLASS, STATUS_FILTERS } from '../lib/demoRequestStatus.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

type SortField = 'created_at' | 'school_name' | 'municipality';
type SortDir   = 'asc' | 'desc';

// ─── Sort header button ───────────────────────────────────────────────────────

function SortHeader({
  label, field, currentField, currentDir, onSort,
}: {
  label: string; field: SortField;
  currentField: SortField; currentDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = currentField === field;
  const Icon   = active ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <Icon className={cn('w-3 h-3', active && 'text-primary')} />
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformDemoRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL-persisted state ────────────────────────────────────────────────────
  const qParam       = searchParams.get('q')      ?? '';
  const statusFilter  = searchParams.get('status') ?? '';
  const page          = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  // ── Local state ────────────────────────────────────────────────────────────
  const [localSearch, setLocalSearch] = useState(qParam);
  const [sortField, setSortField]     = useState<SortField>('created_at');
  const [sortDir, setSortDir]         = useState<SortDir>('desc');
  // Holds only the id, not a snapshot of the row — the sheet looks the row up
  // fresh from `requests` on every render, so it reflects mutations (status
  // change, assignment, notes) as soon as the query cache is invalidated
  // instead of showing stale data until the sheet is closed and reopened.
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocalSearch(qParam); }, [qParam]);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: requests, isLoading, error }      = useDemoRequests();
  const { data: admins }                          = usePlatformAdminsDetail();

  const adminMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of admins ?? []) {
      const name = [a.first_name, a.last_name].filter(Boolean).join(' ').trim();
      m[a.user_id] = name || a.email || 'Okänd admin';
    }
    return m;
  }, [admins]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = requests ?? [];
    if (statusFilter) r = r.filter(d => d.status === statusFilter);
    if (qParam.trim()) {
      const q = qParam.trim().toLowerCase();
      r = r.filter(d =>
        d.school_name.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        d.municipality.toLowerCase().includes(q),
      );
    }
    return r;
  }, [requests, statusFilter, qParam]);

  // ── Sort ───────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string = a.created_at;
      let bv: string = b.created_at;
      if (sortField === 'school_name')   { av = a.school_name;   bv = b.school_name; }
      if (sortField === 'municipality')  { av = a.municipality;  bv = b.municipality; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  // ── Paginate ───────────────────────────────────────────────────────────────
  const totalPages  = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated   = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showingFrom = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo   = Math.min(currentPage * PAGE_SIZE, sorted.length);

  const selectedRequest = useMemo(
    () => (requests ?? []).find(r => r.id === selectedId) ?? null,
    [requests, selectedId],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSearch(val: string) {
    setLocalSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (val) next.set('q', val); else next.delete('q');
        next.delete('page');
        return next;
      });
    }, 300);
  }

  function setFilter(value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('status', value); else next.delete('status');
      next.delete('page');
      return next;
    });
  }

  function setPage(p: number) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (p > 1) next.set('page', String(p)); else next.delete('page');
      return next;
    });
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  return (
    <PageLayout>
      <PageHeader
        title="Demoförfrågningar"
        description="Förfrågningar om personlig visning från den publika webbplatsen"
      />

      {/* Search + filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:flex-wrap">
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={localSearch}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Sök skola, kontaktperson, ort…"
            className="pl-9"
          />
        </div>

        <Select value={statusFilter || '__all__'} onValueChange={v => setFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-9 w-[180px] text-xs">
            <SelectValue placeholder="Alla statusar" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map(f => (
              <SelectItem key={f.value || '__all__'} value={f.value || '__all__'} className="text-xs">{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table card — a 7-column grid doesn't fit a phone screen, so mobile
          gets a stacked card layout per row and md+ gets the full grid;
          both branches render inside the same row button, toggled by
          `md:hidden` / `hidden md:grid` rather than hiding individual
          fixed-width columns (which would just get clipped, not reflow). */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="hidden md:grid grid-cols-[100px_1fr_150px_120px_130px_150px_28px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border items-center">
          <SortHeader label="Inkom"     field="created_at"  currentField={sortField} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="Trafikskola" field="school_name" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kontaktperson</p>
          <SortHeader label="Ort" field="municipality" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tilldelad</p>
          <span />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="md:hidden flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                </div>
                <div className="hidden md:grid grid-cols-[100px_1fr_150px_120px_130px_150px_28px] gap-3 px-4 py-3 items-center">
                  <Skeleton className="h-4 w-16" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                  <span />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-destructive">Kunde inte hämta demoförfrågningar</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && sorted.length === 0 && (
          <div className="px-4 py-12 text-center">
            <Handshake className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {(qParam || statusFilter) ? 'Inga demoförfrågningar matchar sökningen eller filtret' : 'Inga demoförfrågningar ännu'}
            </p>
          </div>
        )}

        {/* Rows */}
        {!isLoading && !error && paginated.length > 0 && (
          <div className="divide-y divide-border">
            {paginated.map(req => (
              <button
                key={req.id}
                type="button"
                onClick={() => setSelectedId(req.id)}
                className="w-full hover:bg-muted/30 transition-colors text-left"
              >
                {/* Mobile card */}
                <div className="md:hidden flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{req.school_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{req.name} · {req.municipality}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(req.created_at).toLocaleDateString('sv-SE')}
                    </p>
                  </div>
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
                    STATUS_BADGE_CLASS[req.status],
                  )}>
                    {STATUS_LABEL[req.status]}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>

                {/* Desktop grid */}
                <div className="hidden md:grid grid-cols-[100px_1fr_150px_120px_130px_150px_28px] gap-3 px-4 py-3 items-center">
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(req.created_at).toLocaleDateString('sv-SE')}
                  </p>

                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{req.school_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{req.email}</p>
                  </div>

                  <p className="text-sm text-foreground truncate">{req.name}</p>

                  <p className="text-xs text-muted-foreground truncate">{req.municipality}</p>

                  <div>
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                      STATUS_BADGE_CLASS[req.status],
                    )}>
                      {STATUS_LABEL[req.status]}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground truncate">
                    {req.assigned_to ? (adminMap[req.assigned_to] ?? 'Okänd admin') : '—'}
                  </p>

                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer: count + pagination */}
      {!isLoading && !error && sorted.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Visar {showingFrom}–{showingTo} av {sorted.length} demoförfrågning{sorted.length !== 1 ? 'ar' : ''}
            {statusFilter && <span className="text-primary"> (filtrerat)</span>}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground px-2 tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <DemoRequestDetailSheet
        open={!!selectedRequest}
        request={selectedRequest}
        admins={admins ?? []}
        onClose={() => setSelectedId(null)}
      />
    </PageLayout>
  );
}
