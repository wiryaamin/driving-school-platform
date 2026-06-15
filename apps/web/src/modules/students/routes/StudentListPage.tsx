import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Copy, Car, ChevronRight, Search, Plus, SlidersHorizontal, RefreshCw,
} from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import {
  Button, Input, DataTable,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useStudentList } from '../hooks/useStudents.js';
import type { Student, StudentStatus } from '../hooks/useStudents.js';
import { StudentStatusBadge } from '../components/StudentStatusBadge.js';
import { StudentForm } from '../components/StudentForm.js';
import { cn } from '@/lib/utils.js';

// ─── Tab types ────────────────────────────────────────────────────────────────

type KundTab = 'alla' | 'aktiva' | 'nya' | 'vilande' | 'arkiverade' | 'filter';

const STATUS_TABS: { key: Exclude<KundTab, 'filter'>; label: string; status?: StudentStatus }[] = [
  { key: 'alla',       label: 'Alla'                          },
  { key: 'aktiva',     label: 'Aktiva',     status: 'active'  },
  { key: 'nya',        label: 'Nya',        status: 'lead'    },
  { key: 'vilande',    label: 'Vilande',    status: 'paused'  },
  { key: 'arkiverade', label: 'Arkiverade', status: 'archived'},
];

// ─── Filter types ─────────────────────────────────────────────────────────────

type KundGrupp =
  | 'alla'
  | 'aktiva'
  | 'skuldsatta'
  | 'arkiverade'
  | 'utan_transaktioner'
  | 'saldo_kvar'
  | 'kommande_bokningar';

interface FilterDraft {
  kundgrupp:              KundGrupp;
  licenceCategoryHar:     string;
  licenceCategoryHarInte: string;
  alderFran:              string;
  alderTill:              string;
  fritextSearch:          string;
  bokningFilter:          string;
}

const DEFAULT_FILTER: FilterDraft = {
  kundgrupp:              'alla',
  licenceCategoryHar:     '',
  licenceCategoryHarInte: '',
  alderFran:              '',
  alderTill:              '',
  fritextSearch:          '',
  bokningFilter:          '',
};

interface AppliedFilterQuery {
  status?:           StudentStatus;
  search?:           string;
  licence_category?: string;
}

function filterToQuery(f: FilterDraft): AppliedFilterQuery {
  const q: AppliedFilterQuery = {};
  if (f.kundgrupp === 'aktiva')     q.status = 'active';
  if (f.kundgrupp === 'arkiverade') q.status = 'archived';
  if (f.kundgrupp === 'skuldsatta') q.status = 'active';
  if (f.fritextSearch)              q.search  = f.fritextSearch;
  if (f.licenceCategoryHar)         q.licence_category = f.licenceCategoryHar;
  return q;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  const years = now.getFullYear() - birth.getFullYear() -
    (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate()) ? 1 : 0);
  return `${years} år`;
}

function formatPersonnummer(student: Student): string {
  if (!student.personnummer_last4) return '—';
  if (student.date_of_birth) {
    const dob = student.date_of_birth.replace(/-/g, '');
    return `${dob}-${student.personnummer_last4}`;
  }
  return `······-${student.personnummer_last4}`;
}

function formatLicenceCategory(cat: string): string {
  if (!cat) return '—';
  const lower = cat.toLowerCase();
  if (lower.includes('automat') || lower.includes('_auto')) {
    return cat.replace(/_?automat/i, '').replace(/_?auto/i, '').trim() + ' (automat)';
  }
  if (lower.includes('manuell') || lower.includes('manual')) {
    return cat.replace(/_?manuell/i, '').replace(/_?manual/i, '').trim() + ' (manuell)';
  }
  return cat.toUpperCase();
}

function formatActivityDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

// ─── Column definitions ───────────────────────────────────────────────────────

function buildColumns(): ColumnDef<Student>[] {
  return [
    {
      id: 'bell',
      header: '',
      cell: () => <Bell className="w-3.5 h-3.5 text-muted-foreground/40" />,
      enableSorting: false,
      enableHiding: false,
      size: 32,
    },
    {
      id: 'namn',
      accessorFn: (row) => `${row.first_name} ${row.last_name}`,
      header: 'Namn',
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground whitespace-nowrap block">
            {row.original.first_name} {row.original.last_name}
          </span>
          {row.original.date_of_birth && (
            <span className="text-[10px] text-muted-foreground">
              {calcAge(row.original.date_of_birth).split(',')[0]}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StudentStatusBadge status={row.original.status} />,
      enableSorting: false,
    },
    {
      id: 'personnummer',
      header: 'Personnummer',
      cell: ({ row }) => {
        const pnr = formatPersonnummer(row.original);
        return (
          <div className="flex items-center gap-1.5 font-mono text-xs group/cell">
            <span className="text-foreground">{pnr}</span>
            {row.original.personnummer_last4 && (
              <button
                onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(pnr); }}
                className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                title="Kopiera personnummer"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      id: 'behorighet',
      header: 'Behörighet',
      cell: ({ row }) => {
        const cat = row.original.target_licence_category;
        if (!cat) return <span className="text-muted-foreground/50">—</span>;
        return (
          <div className="flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            <span className="text-xs text-muted-foreground">{formatLicenceCategory(cat)}</span>
          </div>
        );
      },
      enableSorting: false,
    },
    {
      id: 'epost',
      accessorKey: 'email',
      header: 'E-post',
      cell: ({ row }) => {
        const email = row.original.email;
        if (!email) return <span className="text-sm text-muted-foreground/40">—</span>;
        return (
          <a
            href={`mailto:${email}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-primary hover:underline truncate max-w-[180px] block"
            title={email}
          >
            {email}
          </a>
        );
      },
    },
    {
      id: 'telefonnummer',
      accessorKey: 'phone',
      header: 'Telefon',
      cell: ({ row }) => {
        const phone = row.original.phone;
        if (!phone) return <span className="text-sm text-muted-foreground/40">—</span>;
        return (
          <a
            href={`tel:${phone}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-primary hover:underline whitespace-nowrap"
          >
            {phone}
          </a>
        );
      },
    },
    {
      id: 'stad',
      accessorKey: 'city',
      header: 'Stad',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {row.original.city ?? '—'}
        </span>
      ),
    },
    {
      id: 'aktivitet',
      header: 'Inskriven',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatActivityDate(row.original.enrolled_at)}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'arrow',
      header: '',
      cell: () => <ChevronRight className="w-4 h-4 text-muted-foreground/40" />,
      enableSorting: false,
      enableHiding: false,
      size: 32,
    },
  ];
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

const KUNDGRUPP_OPTIONS: { value: KundGrupp; label: string }[] = [
  { value: 'alla',                label: 'Alla' },
  { value: 'aktiva',              label: 'Aktiva' },
  { value: 'skuldsatta',          label: 'Skuldsatta' },
  { value: 'arkiverade',          label: 'Arkiverade' },
  { value: 'utan_transaktioner',  label: 'Utan transaktioner (saldo)' },
  { value: 'saldo_kvar',          label: 'Saldo kvar' },
  { value: 'kommande_bokningar',  label: 'Kunder utan körkortstillstånd, men med kommande bokningar' },
];

const LICENCE_CATEGORIES = [
  'B', 'B (automat)', 'A', 'A2', 'A1', 'AM', 'C', 'CE', 'D', 'DE', 'BE',
];

const BEHORIGHETSSTATUS = [
  { value: 'aktuell',  label: 'Aktuell behörighet' },
  { value: 'kommande', label: 'Kommande behörighet' },
];

interface FilterPanelProps {
  draft:    FilterDraft;
  onChange: (draft: FilterDraft) => void;
  onApply:  () => void;
}

function FilterPanel({ draft, onChange, onApply }: FilterPanelProps) {
  function set<K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div className="space-y-6 pb-6">

      {/* ── 1. Välj kundgrupp ─────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          <span className="mr-1 text-muted-foreground">1.</span> Välj kundgrupp
        </h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2.5">
          {KUNDGRUPP_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="kundgrupp"
                value={opt.value}
                checked={draft.kundgrupp === opt.value}
                onChange={() => set('kundgrupp', opt.value)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm text-foreground">{opt.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ── 2. Filtrera efter behörighet ──────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="mr-1 text-muted-foreground">2.</span> Filtrera efter behörighet
          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
            Statusfilter kommer snart
          </span>
        </h3>
        <div className="space-y-2">
          {/* Har */}
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-sm text-muted-foreground">Har</span>
            <div
              title="Statusfilter under implementation — filtrera på aktiv/utgången behörighet"
              className="w-[180px]"
            >
              <SelectTrigger disabled className="w-full text-sm opacity-40 cursor-not-allowed">
                <SelectValue placeholder="Aktuell" />
              </SelectTrigger>
            </div>
            <Select
              value={draft.licenceCategoryHar || 'ALL'}
              onValueChange={(v) => set('licenceCategoryHar', v === 'ALL' ? '' : v)}
            >
              <SelectTrigger className="w-[220px] text-sm">
                <SelectValue placeholder="Filtrera efter behörighet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Alla behörigheter</SelectItem>
                {LICENCE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Har inte */}
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-sm text-muted-foreground">Har inte</span>
            <div
              title="Statusfilter under implementation — filtrera på aktiv/utgången behörighet"
              className="w-[180px]"
            >
              <SelectTrigger disabled className="w-full text-sm opacity-40 cursor-not-allowed">
                <SelectValue placeholder="Aktuell" />
              </SelectTrigger>
            </div>
            <Select
              value={draft.licenceCategoryHarInte || 'ALL'}
              onValueChange={(v) => set('licenceCategoryHarInte', v === 'ALL' ? '' : v)}
            >
              <SelectTrigger className="w-[220px] text-sm">
                <SelectValue placeholder="Filtrera efter behörighet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Alla behörigheter</SelectItem>
                {LICENCE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── 4. Filtrera efter födelsedatum ────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          <span className="mr-1 text-muted-foreground">3.</span> Filtrera efter födelsedatum
        </h3>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            placeholder="Välj ålder från"
            value={draft.alderFran}
            onChange={(e) => set('alderFran', e.target.value)}
            className="w-[160px] text-sm"
            min={16}
            max={100}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            placeholder="Välj ålder till"
            value={draft.alderTill}
            onChange={(e) => set('alderTill', e.target.value)}
            className="w-[160px] text-sm"
            min={16}
            max={100}
          />
        </div>
      </section>

      {/* ── 5. Sök på namn, e-postadress osv. ────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          <span className="mr-1 text-muted-foreground">4.</span> Sök på namn, e-postadress, adress osv.
        </h3>
        <Input
          placeholder="Sök efter kunder genom personnummer, förnamn, efternamn, e-post eller telefonnummer"
          value={draft.fritextSearch}
          onChange={(e) => set('fritextSearch', e.target.value)}
          className="max-w-xl text-sm"
          onKeyDown={(e) => e.key === 'Enter' && onApply()}
        />
      </section>

      {/* ── 6. Filtrera efter bokningar ───────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          <span className="mr-1 text-muted-foreground">5.</span> Filtrera efter bokningar
        </h3>
        <Select
          value={draft.bokningFilter || 'ignorera'}
          onValueChange={(v) => set('bokningFilter', v === 'ignorera' ? '' : v)}
        >
          <SelectTrigger className="w-[220px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ignorera">Ignorera bokningar</SelectItem>
            <SelectItem value="har_kommande">Har kommande bokningar</SelectItem>
            <SelectItem value="har_inga">Har inga kommande bokningar</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {/* Apply */}
      <div>
        <Button onClick={onApply} className="px-8">
          Filtrera
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StudentListPage() {
  const navigate = useNavigate();

  const [activeTab,       setActiveTab]       = useState<KundTab>('alla');
  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [formOpen,        setFormOpen]        = useState(false);
  const [editStudent,     setEditStudent]     = useState<Student | null>(null);

  // Filter state — draft (form) vs applied (query)
  const [filterDraft,    setFilterDraft]    = useState<FilterDraft>(DEFAULT_FILTER);
  const [appliedFilter,  setAppliedFilter]  = useState<FilterDraft>(DEFAULT_FILTER);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  function handleTabChange(tab: KundTab) {
    setActiveTab(tab);
    setSearch('');
    setDebouncedSearch('');
  }

  function handleApplyFilter() {
    setAppliedFilter(filterDraft);
  }

  const isFilterTab = activeTab === 'filter';
  const currentStatusTab = STATUS_TABS.find((t) => t.key === activeTab);

  // Build query: use status tab params OR applied filter params
  const query = isFilterTab
    ? filterToQuery(appliedFilter)
    : {
        ...(currentStatusTab?.status !== undefined ? { status: currentStatusTab.status } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      };

  const { data, isLoading, error, refetch } = useStudentList(query);
  const students = data?.data ?? [];

  const columns = useMemo(() => buildColumns(), []);

  function handleCreate() {
    setEditStudent(null);
    setFormOpen(true);
  }

  function handleFormSuccess(student: Student) {
    setFormOpen(false);
    setEditStudent(null);
    if (editStudent === null) navigate(`/students/${student.id}`);
  }

  // Breadcrumb label
  const breadcrumbLabel = isFilterTab
    ? 'Filtrera kunder'
    : activeTab === 'alla'
    ? 'Alla kunder'
    : `${currentStatusTab?.label ?? ''} kunder`;

  return (
    <div className="max-w-screen-2xl mx-auto">

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3">
        <nav className="flex items-center gap-1.5 text-sm" aria-label="Brödsmulor">
          <span className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">
            Hem
          </span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">{breadcrumbLabel}</span>
        </nav>
        <button className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* ── Tab bar + Ny kund ──────────────────────────────────────────────── */}
      <div className="flex items-end border-b border-border mb-4">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
            )}
          >
            {tab.label}
          </button>
        ))}

        {/* Filter tab */}
        <button
          onClick={() => handleTabChange('filter')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            isFilterTab
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter
        </button>

        <div className="ml-auto pb-1">
          <PermissionGate permission={Permissions.STUDENTS_CREATE}>
            <Button
              onClick={handleCreate}
              size="sm"
              className="border-0 bg-green-600 text-white hover:bg-green-700"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Ny kund
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* ── Filter panel (only on filter tab) ─────────────────────────────── */}
      {isFilterTab && (
        <FilterPanel
          draft={filterDraft}
          onChange={setFilterDraft}
          onApply={handleApplyFilter}
        />
      )}

      {/* ── Search bar (only on non-filter tabs) ──────────────────────────── */}
      {!isFilterTab && (
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Sök efter kunder genom personnummer, förnamn, efternamn, e-post eller telefonnummer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setDebouncedSearch(search)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => setDebouncedSearch(search)}>Sök</Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refetch()}
            title="Uppdatera listan"
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      )}

      {/* ── Result count ───────────────────────────────────────────────────── */}
      {!isFilterTab && !isLoading && data && (
        <p className="text-xs text-muted-foreground mb-2">
          {data.meta.total === 0
            ? 'Inga kunder hittades'
            : `${data.meta.total} ${data.meta.total === 1 ? 'kund' : 'kunder'}`}
          {debouncedSearch ? ` · söker efter "${debouncedSearch}"` : ''}
        </p>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-destructive">Det gick inte att hämta kundlistan.</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Försök igen
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={students}
            isLoading={isLoading}
            emptyMessage={
              isFilterTab
                ? 'Inga kunder matchar filtret. Justera filtren och klicka Filtrera.'
                : activeTab === 'alla'
                ? 'Inga kunder hittades.'
                : `Inga ${currentStatusTab?.label.toLowerCase() ?? ''} kunder hittades.`
            }
            defaultPageSize={25}
            onRowClick={(student) => navigate(`/students/${student.id}`)}
          />
        </div>
      )}

      {/* ── Form ───────────────────────────────────────────────────────────── */}
      <StudentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        student={editStudent}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
