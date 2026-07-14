import { useState, useMemo, useRef, useEffect, useTransition } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, CreditCard, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  Input, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformSubscriptions } from '../hooks/usePlatformSubscriptions.js';
import type { PlatformSubscription } from '../hooks/usePlatformSubscriptions.js';
import { TIER_LABEL } from '../lib/tierDisplay.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortField = 'org_name' | 'subscription_tier' | 'subscription_status' | 'student_count' | 'member_count' | 'created_at';
type SortDir   = 'asc' | 'desc';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const TIER_FILTERS = [
  { value: '',             label: 'Alla nivåer' },
  { value: 'trial',        label: 'Trial' },
  { value: 'starter',      label: 'Starter' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise',   label: 'Enterprise' },
];

const SUB_STATUS_FILTERS = [
  { value: '',          label: 'Alla statusar' },
  { value: 'trialing',  label: 'Testperiod' },
  { value: 'active',    label: 'Aktiv' },
  { value: 'past_due',  label: 'Förfallen' },
  { value: 'cancelled', label: 'Avslutad' },
  { value: 'suspended', label: 'Suspenderad' },
];

// ─── Display maps ─────────────────────────────────────────────────────────────

const TIER_CLASS: Record<string, string> = {
  trial:        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  starter:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  professional: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  enterprise:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const SUB_STATUS_LABEL: Record<string, string> = {
  trialing:  'Testperiod',
  active:    'Aktiv',
  past_due:  'Förfallen',
  cancelled: 'Avslutad',
  suspended: 'Suspenderad',
};

const SUB_STATUS_CLASS: Record<string, string> = {
  active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  trialing:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  past_due:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const ORG_STATUS_CLASS: Record<string, string> = {
  active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  terminated:'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
};

const ORG_STATUS_LABEL: Record<string, string> = {
  active:    'Aktiv',
  suspended: 'Suspenderad',
  terminated:'Avslutad',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortHeader({
  label, field, currentField, currentDir, onSort,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = currentField === field;
  const Icon   = active ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <Icon className={cn('w-3.5 h-3.5', active ? 'text-primary' : 'text-muted-foreground/50')} />
      </span>
    </th>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformSubscriptionsPage() {
  const navigate        = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();

  const qParam     = searchParams.get('q')      ?? '';
  const tierParam  = searchParams.get('tier')   ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const pageParam  = parseInt(searchParams.get('page') ?? '1', 10);
  const sortField  = (searchParams.get('sort')  ?? 'org_name') as SortField;
  const sortDir    = (searchParams.get('dir')   ?? 'asc') as SortDir;

  const [localSearch, setLocalSearch] = useState(qParam);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync localSearch when URL q changes externally
  useEffect(() => { setLocalSearch(qParam); }, [qParam]);

  // Clear pending debounce on unmount
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const { data: allSubs, isLoading, error } = usePlatformSubscriptions();

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const items = allSubs ?? [];
    return items.filter(s => {
      if (tierParam   && s.subscription_tier   !== tierParam)   return false;
      if (statusParam && s.subscription_status !== statusParam) return false;
      if (qParam.trim()) {
        const q = qParam.trim().toLowerCase();
        const hay = `${s.org_name} ${s.org_slug}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allSubs, qParam, tierParam, statusParam]);

  // ── Sort ──────────────────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      if (sortField === 'org_name')            { av = a.org_name;            bv = b.org_name; }
      if (sortField === 'subscription_tier')   { av = a.subscription_tier;   bv = b.subscription_tier; }
      if (sortField === 'subscription_status') { av = a.subscription_status; bv = b.subscription_status; }
      if (sortField === 'student_count')       { av = a.student_count;       bv = b.student_count; }
      if (sortField === 'member_count')        { av = a.member_count;        bv = b.member_count; }
      if (sortField === 'created_at')          { av = a.created_at;          bv = b.created_at; }

      if (av === bv) return 0;
      const cmp = typeof av === 'string'
        ? av.localeCompare(bv as string, 'sv')
        : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  // ── Paginate ──────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page       = Math.min(Math.max(1, pageParam), totalPages);
  const pageItems  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSearch(value: string) {
    setLocalSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      startTransition(() => {
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          if (value.trim()) { next.set('q', value.trim()); } else { next.delete('q'); }
          next.set('page', '1');
          return next;
        });
      });
    }, 300);
  }

  function handleTierChange(value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value && value !== '__all__') { next.set('tier', value); } else { next.delete('tier'); }
      next.set('page', '1');
      return next;
    });
  }

  function handleStatusChange(value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value && value !== '__all__') { next.set('status', value); } else { next.delete('status'); }
      next.set('page', '1');
      return next;
    });
  }

  function handleSort(field: SortField) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (sortField === field) {
        next.set('dir', sortDir === 'asc' ? 'desc' : 'asc');
      } else {
        next.set('sort', field);
        next.set('dir', 'asc');
      }
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

  function handleRowClick(orgId: string) {
    navigate(`/platform/subscriptions/${orgId}`);
  }

  // ─── Empty / error state ──────────────────────────────────────────────────

  if (!isLoading && error) {
    return (
      <PageLayout>
        <PageHeader title="Prenumerationer" description="Hantera abonnemang per organisation" />
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 py-16 flex flex-col items-center gap-3 text-center">
          <CreditCard className="w-10 h-10 text-destructive/60" />
          <p className="text-sm font-medium text-destructive">Kunde inte hämta prenumerationer</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {error instanceof Error ? error.message : 'Okänt fel'}
          </p>
        </div>
      </PageLayout>
    );
  }

  // ─── Skeleton table ───────────────────────────────────────────────────────

  const skeletonRows = Array.from({ length: 8 });

  return (
    <PageLayout>
      <PageHeader
        title="Prenumerationer"
        description={
          isLoading
            ? undefined
            : `${(allSubs ?? []).length} organisationer totalt`
        }
      />

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Sök organisation…"
            value={localSearch}
            onChange={e => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={tierParam} onValueChange={handleTierChange}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Alla nivåer" />
          </SelectTrigger>
          <SelectContent>
            {TIER_FILTERS.map(f => (
              <SelectItem key={f.value} value={f.value || '__all__'}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusParam} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Alla statusar" />
          </SelectTrigger>
          <SelectContent>
            {SUB_STATUS_FILTERS.map(f => (
              <SelectItem key={f.value} value={f.value || '__all__'}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <SortHeader label="Organisation"   field="org_name"            currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Plan"           field="subscription_tier"   currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Status"         field="subscription_status" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                  Trial slutar
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap hidden md:table-cell">
                  Max. användare
                </th>
                <SortHeader label="Elever"   field="student_count" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Användare" field="member_count"  currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Skapad"   field="created_at"    currentField={sortField} currentDir={sortDir} onSort={handleSort} />
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

              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-14 text-center">
                    <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Inga prenumerationer matchar filtren</p>
                  </td>
                </tr>
              )}

              {!isLoading && pageItems.map((sub: PlatformSubscription) => (
                <tr
                  key={sub.org_id}
                  className="hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => handleRowClick(sub.org_id)}
                >
                  {/* Organisation */}
                  <td className="px-3 py-3 max-w-[200px]">
                    <p className="text-sm font-medium text-foreground truncate">{sub.org_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{sub.org_slug}</p>
                  </td>

                  {/* Plan */}
                  <td className="px-3 py-3">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                      TIER_CLASS[sub.subscription_tier] ?? 'bg-muted text-muted-foreground',
                    )}>
                      {TIER_LABEL[sub.subscription_tier] ?? sub.subscription_tier}
                    </span>
                  </td>

                  {/* Subscription Status */}
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit',
                        SUB_STATUS_CLASS[sub.subscription_status] ?? 'bg-muted text-muted-foreground',
                      )}>
                        {SUB_STATUS_LABEL[sub.subscription_status] ?? sub.subscription_status}
                      </span>
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium w-fit',
                        ORG_STATUS_CLASS[sub.org_status] ?? 'bg-muted text-muted-foreground',
                      )}>
                        {ORG_STATUS_LABEL[sub.org_status] ?? sub.org_status}
                      </span>
                    </div>
                  </td>

                  {/* Trial End */}
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {sub.trial_ends_at
                      ? new Date(sub.trial_ends_at).toLocaleDateString('sv-SE')
                      : '—'}
                  </td>

                  {/* Max Users */}
                  <td className="px-3 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {sub.max_users}
                  </td>

                  {/* Students */}
                  <td className="px-3 py-3 text-sm font-medium text-foreground tabular-nums">
                    {sub.student_count}
                  </td>

                  {/* Members */}
                  <td className="px-3 py-3 text-sm font-medium text-foreground tabular-nums">
                    {sub.member_count}
                    {sub.member_count >= sub.max_users && (
                      <span className="ml-1 text-[9px] text-destructive font-semibold">MAX</span>
                    )}
                  </td>

                  {/* Created */}
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(sub.created_at).toLocaleDateString('sv-SE')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!isLoading && sorted.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} av {sorted.length}
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
    </PageLayout>
  );
}
