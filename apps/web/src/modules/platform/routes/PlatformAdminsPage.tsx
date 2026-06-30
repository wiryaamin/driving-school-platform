import { useState, useMemo, useRef, useEffect } from 'react';
import {
  ShieldCheck, Search, CheckCircle, XCircle, Shield,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Input, Skeleton, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformAdminsDetail } from '../hooks/usePlatformOpsCenter.js';
import type { PlatformAdminDetail } from '../hooks/usePlatformOpsCenter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const ROLE_FILTERS = [
  { value: '',                    label: 'Alla roller' },
  { value: 'platform_superadmin', label: 'Super Admin' },
  { value: 'platform_admin',      label: 'Platform Admin' },
  { value: 'platform_support',    label: 'Support' },
  { value: 'platform_billing',    label: 'Billing' },
  { value: 'platform_read_only',  label: 'Read Only' },
];

const STATUS_FILTERS = [
  { value: '',     label: 'Alla statusar' },
  { value: 'true', label: 'Aktiv' },
  { value: 'false', label: 'Inaktiv' },
];

// ─── Display maps ─────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  platform_superadmin: 'Super Admin',
  platform_admin:      'Platform Admin',
  platform_support:    'Support',
  platform_billing:    'Billing',
  platform_read_only:  'Read Only',
};

const ROLE_CLASS: Record<string, string> = {
  platform_superadmin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  platform_admin:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  platform_support:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  platform_billing:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  platform_read_only:  'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type SortField = 'name' | 'role' | 'is_active' | 'last_sign_in_at' | 'granted_at';
type SortDir   = 'asc' | 'desc';

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

export function PlatformAdminsPage() {
  const [localSearch, setLocalSearch] = useState('');
  const [roleFilter, setRoleFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField]     = useState<SortField>('granted_at');
  const [sortDir, setSortDir]         = useState<SortDir>('asc');
  const [page, setPage]               = useState(1);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQ, setSearchQ]         = useState('');

  const { data: allAdmins, isLoading, error } = usePlatformAdminsDetail();

  // Debounce search → searchQ
  function handleSearch(value: string) {
    setLocalSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchQ(value.trim().toLowerCase());
      setPage(1);
    }, 300);
  }
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  function handleRoleChange(value: string) {
    setRoleFilter(value === '__all__' ? '' : value);
    setPage(1);
  }
  function handleStatusChange(value: string) {
    setStatusFilter(value === '__all__' ? '' : value);
    setPage(1);
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const items = allAdmins ?? [];
    return items.filter(a => {
      if (roleFilter && a.role !== roleFilter) return false;
      if (statusFilter !== '') {
        const want = statusFilter === 'true';
        if (a.is_active !== want) return false;
      }
      if (searchQ) {
        const fullName = `${a.first_name ?? ''} ${a.last_name ?? ''} ${a.email ?? ''}`.toLowerCase();
        if (!fullName.includes(searchQ)) return false;
      }
      return true;
    });
  }, [allAdmins, roleFilter, statusFilter, searchQ]);

  // ── Sort ──────────────────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string = '';
      let bv: string = '';
      if (sortField === 'name') {
        av = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
        bv = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim();
      } else if (sortField === 'role') {
        av = a.role; bv = b.role;
      } else if (sortField === 'is_active') {
        av = String(a.is_active); bv = String(b.is_active);
      } else if (sortField === 'last_sign_in_at') {
        av = a.last_sign_in_at ?? ''; bv = b.last_sign_in_at ?? '';
      } else {
        av = a.granted_at; bv = b.granted_at;
      }
      const cmp = av.localeCompare(bv, 'sv');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  // ── Paginate ──────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageItems  = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ─── Error state ──────────────────────────────────────────────────────────

  if (!isLoading && error) {
    return (
      <PageLayout>
        <PageHeader title="Plattformsadministratörer" description="Användare med plattformsadmin-behörighet" />
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 py-16 flex flex-col items-center gap-3 text-center">
          <ShieldCheck className="w-10 h-10 text-destructive/60" />
          <p className="text-sm font-medium text-destructive">Kunde inte hämta administratörer</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {error instanceof Error ? error.message : 'Okänt fel'}
          </p>
        </div>
      </PageLayout>
    );
  }

  const skeletonRows = Array.from({ length: 6 });

  return (
    <PageLayout>
      <PageHeader
        title="Plattformsadministratörer"
        description={isLoading ? undefined : `${(allAdmins ?? []).length} administratörer totalt`}
      />

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Sök namn eller e-post…"
            value={localSearch}
            onChange={e => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={roleFilter} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Alla roller" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTERS.map(f => (
              <SelectItem key={f.value || '__all__'} value={f.value || '__all__'}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Alla statusar" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map(f => (
              <SelectItem key={f.value || '__all__'} value={f.value || '__all__'}>
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
                <SortHeader label="Namn"         field="name"            currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">E-post</th>
                <SortHeader label="Roll"         field="role"            currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Status"        field="is_active"       currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">MFA</th>
                <SortHeader label="Senaste inlogg" field="last_sign_in_at" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Beviljad"      field="granted_at"      currentField={sortField} currentDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && skeletonRows.map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))}

              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-14 text-center">
                    <ShieldCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Inga administratörer matchar filtren</p>
                  </td>
                </tr>
              )}

              {!isLoading && pageItems.map((admin: PlatformAdminDetail) => {
                const displayName = [admin.first_name, admin.last_name].filter(Boolean).join(' ') || '—';
                return (
                  <tr key={admin.id} className="hover:bg-muted/40 transition-colors">
                    {/* Name */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Shield className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{displayName}</span>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-3 py-3 text-xs text-muted-foreground max-w-[200px]">
                      <span className="truncate block">{admin.email ?? '—'}</span>
                    </td>

                    {/* Role */}
                    <td className="px-3 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                        ROLE_CLASS[admin.role] ?? 'bg-muted text-muted-foreground',
                      )}>
                        {ROLE_LABEL[admin.role] ?? admin.role}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3">
                      {admin.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="w-3 h-3" />
                          Aktiv
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400">
                          <XCircle className="w-3 h-3" />
                          Inaktiv
                        </span>
                      )}
                    </td>

                    {/* MFA */}
                    <td className="px-3 py-3">
                      {admin.mfa_enabled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <CheckCircle className="w-3 h-3" />
                          Aktiv
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Last login */}
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {admin.last_sign_in_at
                        ? new Date(admin.last_sign_in_at).toLocaleDateString('sv-SE')
                        : '—'}
                    </td>

                    {/* Granted at */}
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(admin.granted_at).toLocaleDateString('sv-SE')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && sorted.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} av {sorted.length}
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

      {/* ── Role summary ── */}
      {!isLoading && (allAdmins ?? []).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(ROLE_LABEL).map(([role, label]) => {
            const count = (allAdmins ?? []).filter(a => a.role === role && a.is_active).length;
            return (
              <div key={role} className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{count}</p>
              </div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
