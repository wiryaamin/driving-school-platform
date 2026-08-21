import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bell, Copy, Car, Search, Plus, SlidersHorizontal, RefreshCw, ChevronDown, Eye, EyeOff,
} from 'lucide-react';
import { PhoneLink } from '@shared/components/PhoneLink.js';
import type { ColumnDef } from '@platform/ui';
import {
  Button, Input, DataTable,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useStudentList, useOrgStudentTags, useStudentIdsByTag } from '../hooks/useStudents.js';
import type { Student, StudentStatus, PermitStage } from '../hooks/useStudents.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { StudentStatusBadge } from '../components/StudentStatusBadge.js';
import { StudentForm } from '../components/StudentForm.js';
import { StudentQuickActions } from '../components/StudentQuickActions.js';
import { cn } from '@/lib/utils.js';

// ─── Tab types ────────────────────────────────────────────────────────────────

type KundTab = 'alla' | 'aktiva' | 'nya' | 'vilande' | 'arkiverade' | 'filter';

const STATUS_TABS: { key: Exclude<KundTab, 'filter'>; label: string; status?: StudentStatus }[] = [
  { key: 'alla',       label: 'Alla'                          },
  { key: 'aktiva',     label: 'Aktiva',     status: 'active'  },
  { key: 'nya',        label: 'Nya',        status: 'lead'    },
  { key: 'vilande',    label: 'Pausade',    status: 'paused'  },
  { key: 'arkiverade', label: 'Arkiverade', status: 'archived'},
];

// A visually disabled select-like placeholder for a not-yet-implemented
// filter. Radix's real SelectTrigger requires a <Select> ancestor context
// even when `disabled` — rendering it standalone (as this used to) throws
// "SelectTrigger must be used within Select" and crashes the whole page.
function DisabledSelectPlaceholder({ placeholder, title }: { placeholder: string; title: string }) {
  return (
    <div
      role="button"
      aria-disabled="true"
      title={title}
      className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm cursor-not-allowed opacity-40"
    >
      <span>{placeholder}</span>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </div>
  );
}

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
  permitStage:            string;
  instructorId:           string;
  alderFran:              string;
  alderTill:              string;
  fritextSearch:          string;
  bokningFilter:          string;
  tagId:                  string;
}

const DEFAULT_FILTER: FilterDraft = {
  kundgrupp:              'alla',
  licenceCategoryHar:     '',
  licenceCategoryHarInte: '',
  permitStage:            '',
  instructorId:           '',
  alderFran:              '',
  alderTill:              '',
  fritextSearch:          '',
  bokningFilter:          '',
  tagId:                  '',
};

interface AppliedFilterQuery {
  status?:              StudentStatus;
  search?:              string;
  licence_category?:    string;
  not_licence_category?: string;
  permit_stage?:        PermitStage;
  instructor_id?:       string;
  age_from?:            number;
  age_to?:              number;
}

function filterToQuery(f: FilterDraft): AppliedFilterQuery {
  const q: AppliedFilterQuery = {};
  if (f.kundgrupp === 'aktiva')     q.status = 'active';
  if (f.kundgrupp === 'arkiverade') q.status = 'archived';
  if (f.kundgrupp === 'skuldsatta') q.status = 'active';
  if (f.fritextSearch)              q.search  = f.fritextSearch;
  if (f.licenceCategoryHar)         q.licence_category     = f.licenceCategoryHar;
  if (f.licenceCategoryHarInte)     q.not_licence_category = f.licenceCategoryHarInte;
  if (f.permitStage)                q.permit_stage         = f.permitStage as PermitStage;
  if (f.instructorId)               q.instructor_id        = f.instructorId;
  const from = parseInt(f.alderFran, 10);
  const to   = parseInt(f.alderTill, 10);
  if (f.alderFran && !isNaN(from)) q.age_from = from;
  if (f.alderTill && !isNaN(to))   q.age_to   = to;
  return q;
}

const PERMIT_STAGE_OPTIONS: { value: PermitStage; label: string }[] = [
  { value: 'not_started',           label: 'Ej påbörjad'           },
  { value: 'theory_study',          label: 'Teoristudier'           },
  { value: 'risk1_booked',          label: 'Risk 1 bokad'           },
  { value: 'risk1_completed',       label: 'Risk 1 genomförd'       },
  { value: 'risk2_booked',          label: 'Risk 2 bokad'           },
  { value: 'risk2_completed',       label: 'Risk 2 genomförd'       },
  { value: 'theory_exam_booked',    label: 'Teoriprov bokat'        },
  { value: 'theory_passed',         label: 'Teoriprov godkänt'      },
  { value: 'practical_exam_booked', label: 'Uppkörning bokad'       },
  { value: 'practical_passed',      label: 'Uppkörning godkänd'     },
  { value: 'licence_issued',        label: 'Körkort utfärdat'       },
];

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

// Default, pre-reveal display: birthdate stays visible, the four identifying
// digits are masked. Mirrors formatPersonnummer's own fallbacks exactly.
function formatPersonnummerMasked(student: Student): string {
  if (!student.personnummer_last4) return '—';
  if (student.date_of_birth) {
    const dob = student.date_of_birth.replace(/-/g, '');
    return `${dob}-****`;
  }
  return '······-****';
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

function buildColumns(
  onEdit: (s: Student) => void,
  revealedIds: Set<string>,
  onToggleReveal: (id: string) => void,
): ColumnDef<Student>[] {
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
        const isRevealed = revealedIds.has(row.original.id);
        const hasValue = !!row.original.personnummer_last4;
        const display = isRevealed ? formatPersonnummer(row.original) : formatPersonnummerMasked(row.original);
        return (
          <PermissionGate permission={Permissions.STUDENTS_PII_READ}>
            <div className="flex items-center gap-1.5 font-mono text-xs group/cell">
              <span className="text-foreground">{display}</span>
              {hasValue && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleReveal(row.original.id); }}
                  className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  title={isRevealed ? 'Dölj personnummer' : 'Visa personnummer'}
                >
                  {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              )}
              {isRevealed && hasValue && (
                <button
                  onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(formatPersonnummer(row.original)); }}
                  className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  title="Kopiera personnummer"
                >
                  <Copy className="w-3 h-3" />
                </button>
              )}
            </div>
          </PermissionGate>
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
        return <PhoneLink phone={phone} />;
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
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <StudentQuickActions student={row.original} onEdit={onEdit} />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
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

interface FilterPanelProps {
  draft:    FilterDraft;
  onChange: (draft: FilterDraft) => void;
  onApply:  () => void;
}

function FilterPanel({ draft, onChange, onApply }: FilterPanelProps) {
  function set<K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  const { data: instructorsData } = useInstructorList({ per_page: 100 });
  const { data: orgTags } = useOrgStudentTags();
  const allInstructors = instructorsData?.data ?? [];

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
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          <span className="mr-1 text-muted-foreground">2.</span> Filtrera efter behörighet
        </h3>
        <div className="space-y-2">
          {/* Har */}
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-sm text-muted-foreground">Har</span>
            <div className="w-[180px]">
              <DisabledSelectPlaceholder
                placeholder="Aktuell"
                title="Statusfilter under implementation — filtrera på aktiv/utgången behörighet"
              />
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
            <div className="w-[180px]">
              <DisabledSelectPlaceholder
                placeholder="Aktuell"
                title="Statusfilter under implementation — filtrera på aktiv/utgången behörighet"
              />
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

      {/* ── 3. Filtrera efter utbildningssteg och ansvarig lärare ───────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          <span className="mr-1 text-muted-foreground">3.</span> Filtrera efter utbildningssteg och lärare
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={draft.permitStage || 'ALL'}
            onValueChange={(v) => set('permitStage', v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="w-[220px] text-sm">
              <SelectValue placeholder="Alla utbildningssteg" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Alla utbildningssteg</SelectItem>
              {PERMIT_STAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={draft.instructorId || 'ALL'}
            onValueChange={(v) => set('instructorId', v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="w-[220px] text-sm">
              <SelectValue placeholder="Alla lärare" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Alla lärare</SelectItem>
              {allInstructors.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.first_name} {i.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* ── 4. Filtrera efter födelsedatum ────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          <span className="mr-1 text-muted-foreground">4.</span> Filtrera efter födelsedatum
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
          <span className="mr-1 text-muted-foreground">5.</span> Sök på namn, e-postadress, adress osv.
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
          <span className="mr-1 text-muted-foreground">6.</span> Filtrera efter bokningar
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

      {/* ── 7. Filtrera efter tagg ────────────────────────────────────────── */}
      {(orgTags ?? []).length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            <span className="mr-1 text-muted-foreground">7.</span> Filtrera efter tagg
          </h3>
          <Select
            value={draft.tagId || 'ALL'}
            onValueChange={(v) => set('tagId', v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="w-[220px] text-sm">
              <SelectValue placeholder="Alla taggar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Alla taggar</SelectItem>
              {(orgTags ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    {t.color && (
                      <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ backgroundColor: t.color }} />
                    )}
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      )}

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

  const [searchParams, setSearchParams] = useSearchParams();

  // Deep link from StudentDashboardPage's "Ny kund" — opens the create form
  // directly instead of just landing on the list.
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setEditStudent(null);
      setFormOpen(true);
      setSearchParams((prev) => {
        prev.delete('create');
        return prev;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Tag filter: post-filter current page against students assigned to the selected tag
  const activeTagId = isFilterTab ? (appliedFilter.tagId || null) : null;
  const { data: tagStudentIds } = useStudentIdsByTag(activeTagId);
  const tagIdSet = useMemo(
    () => tagStudentIds ? new Set(tagStudentIds) : null,
    [tagStudentIds],
  );

  const students = useMemo(() => {
    const raw = data?.data ?? [];
    if (!activeTagId || !tagIdSet) return raw;
    return raw.filter((s) => tagIdSet.has(s.id));
  }, [data, activeTagId, tagIdSet]);

  // Ephemeral, per-mount only — never persisted (no localStorage/query param),
  // so a refresh or navigating away and back always returns to the masked default.
  const [revealedPnrIds, setRevealedPnrIds] = useState<Set<string>>(new Set());
  const toggleReveal = (id: string) => {
    setRevealedPnrIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const columns = useMemo(
    () => buildColumns((s) => { setEditStudent(s); setFormOpen(true); }, revealedPnrIds, toggleReveal),
    [revealedPnrIds],
  );

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
