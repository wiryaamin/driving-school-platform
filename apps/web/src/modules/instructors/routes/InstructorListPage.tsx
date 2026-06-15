import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, X,
  Users, AlertCircle, Award, BookOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import {
  Button, Input, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DataTable, DataTableColumnHeader,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useInstructorList } from '../hooks/useInstructors.js';
import type { Instructor, InstructorEmploymentType } from '../hooks/useInstructors.js';
import {
  InstructorStatusBadge, instructorStatusLabel, INSTRUCTOR_STATUS_OPTIONS,
} from '../components/InstructorStatusBadge.js';
import { InstructorQuickActions } from '../components/InstructorQuickActions.js';
import { InstructorForm } from '../components/InstructorForm.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_TYPES: InstructorEmploymentType[] = ['employed', 'contractor', 'external'];

function isActiveInstructor(i: Instructor): boolean {
  return ACTIVE_TYPES.includes(i.employment_type);
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ─── Chip primitive ───────────────────────────────────────────────────────────

type ChipVariant = 'neutral' | 'active' | 'positive' | 'warning' | 'caution';
const CHIP_CLS: Record<ChipVariant, string> = {
  neutral:  'bg-background border-border text-muted-foreground',
  active:   'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-900/40 dark:text-blue-400',
  positive: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-900/40 dark:text-green-400',
  warning:  'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-900/40 dark:text-amber-400',
  caution:  'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-900/40 dark:text-orange-400',
};
function Chip({ icon: Icon, label, variant = 'neutral' }: {
  icon: LucideIcon; label: string; variant?: ChipVariant;
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${CHIP_CLS[variant]}`}>
      <Icon className="w-3 h-3" />{label}
    </div>
  );
}

// ─── InstructorOverviewBar ────────────────────────────────────────────────────

function InstructorOverviewBar({
  activeCount, onLeaveCount, missingAdiCount, expiredAdiCount, isLoading,
}: {
  activeCount: number; onLeaveCount: number;
  missingAdiCount: number; expiredAdiCount: number;
  isLoading: boolean;
}) {
  if (isLoading) return (
    <div className="flex gap-2 flex-wrap">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-7 w-28 rounded-full bg-muted animate-pulse" />
      ))}
    </div>
  );
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip icon={Users}       label={`${activeCount} aktiva lärare`}          variant="positive" />
      <Chip icon={AlertCircle} label={`${onLeaveCount} tjänstlediga`}           variant={onLeaveCount    > 0 ? 'warning' : 'neutral'} />
      <Chip icon={BookOpen}    label={`${missingAdiCount} saknar ADI`}          variant={missingAdiCount > 0 ? 'caution' : 'neutral'} />
      <Chip icon={Award}       label={`${expiredAdiCount} utgångna behörighet`} variant={expiredAdiCount > 0 ? 'caution' : 'neutral'} />
    </div>
  );
}

// ─── AttentionSection ─────────────────────────────────────────────────────────

function AttentionSection({
  icon: Icon, title, instructors, emptyLabel, getSubtitle,
}: {
  icon: LucideIcon;
  title: string;
  instructors: Instructor[];
  emptyLabel: string;
  getSubtitle: (i: Instructor) => string;
}) {
  const navigate = useNavigate();
  const shown    = instructors.slice(0, 5);
  const overflow = instructors.length - 5;

  return (
    <div>
      <div className="px-3.5 py-2 flex items-center gap-1.5 bg-muted/30 border-b border-border">
        <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1 truncate">{title}</span>
        {instructors.length > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground shrink-0">
            {instructors.length}
          </span>
        )}
      </div>
      {instructors.length === 0 ? (
        <div className="px-3.5 py-2.5 text-[10px] text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="divide-y divide-border">
          {shown.map(i => (
            <button
              key={i.id}
              className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-accent/50 text-left transition-colors"
              onClick={() => navigate(`/instructors/${i.id}`)}
            >
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-primary uppercase">
                  {i.first_name.slice(0, 1)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">
                  {i.first_name} {i.last_name}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight truncate">
                  {getSubtitle(i)}
                </p>
              </div>
            </button>
          ))}
          {overflow > 0 && (
            <div className="px-3.5 py-1.5 text-[10px] text-muted-foreground text-center">
              +{overflow} fler
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── InstructorAttentionPanel ─────────────────────────────────────────────────

function InstructorAttentionPanel({
  onLeave, expiredAdi, missingAdi, isLoading,
}: {
  onLeave: Instructor[]; expiredAdi: Instructor[]; missingAdi: Instructor[]; isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Behöver uppmärksamhet</h3>
      </div>
      {isLoading ? (
        <div className="divide-y divide-border">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="px-3.5 py-2.5 flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-muted rounded animate-pulse w-28" />
                <div className="h-2 bg-muted rounded animate-pulse w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          <AttentionSection
            icon={AlertCircle}
            title="Tjänstlediga"
            instructors={onLeave}
            emptyLabel="Inga lärare är tjänstlediga"
            getSubtitle={i => instructorStatusLabel(i.employment_type)}
          />
          <AttentionSection
            icon={Award}
            title="Utgångna ADI"
            instructors={expiredAdi}
            emptyLabel="Inga utgångna ADI-behörigheter"
            getSubtitle={i =>
              i.adi_valid_until ? `Utgick ${formatShortDate(i.adi_valid_until)}` : '—'
            }
          />
          <AttentionSection
            icon={BookOpen}
            title="Saknar ADI"
            instructors={missingAdi}
            emptyLabel="Alla aktiva lärare har ADI-nummer"
            getSubtitle={i => instructorStatusLabel(i.employment_type)}
          />
        </div>
      )}
    </div>
  );
}

// ─── InstructorCategoryPanel ──────────────────────────────────────────────────

function InstructorCategoryPanel({
  categoryDistribution, isLoading,
}: {
  categoryDistribution: [string, number][];
  isLoading: boolean;
}) {
  if (!isLoading && categoryDistribution.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-1.5">
        <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Behörighetstäckning</h3>
      </div>
      <div className="px-3.5 py-1 divide-y divide-border">
        {isLoading ? (
          [0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="h-3 bg-muted rounded animate-pulse w-20" />
              <div className="h-3 bg-muted rounded animate-pulse w-12" />
            </div>
          ))
        ) : (
          categoryDistribution.map(([cat, count]) => (
            <div key={cat} className="flex items-center justify-between py-2">
              <span className="text-xs font-mono font-semibold text-foreground">{cat}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {count} {count === 1 ? 'lärare' : 'lärare'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

function buildColumns(onEdit: (i: Instructor) => void): ColumnDef<Instructor>[] {
  return [
    {
      id:         'name',
      accessorFn: (row) => `${row.first_name} ${row.last_name}`,
      header:     ({ column }) => <DataTableColumnHeader column={column} title="Lärare" />,
      cell:       ({ row }) => {
        const i = row.original;
        return (
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">
              {i.first_name} {i.last_name}
            </div>
            {i.email && (
              <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                {i.email}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id:     'teaching_categories',
      header: 'Kategorier',
      cell:   ({ row }) => {
        const cats = row.original.teaching_categories;
        if (cats.length === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {cats.slice(0, 4).map((cat) => (
              <Badge key={cat} variant="outline" className="font-mono text-xs px-1.5">
                {cat}
              </Badge>
            ))}
            {cats.length > 4 && (
              <Badge variant="outline" className="text-xs px-1.5 text-muted-foreground">
                +{cats.length - 4}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'employment_type',
      header:      ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell:        ({ row }) => <InstructorStatusBadge status={row.original.employment_type} />,
    },
    {
      accessorKey: 'adi_number',
      header:      'ADI-nummer',
      cell:        ({ row }) => (
        <span className="text-sm font-mono text-muted-foreground">
          {row.original.adi_number ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'phone',
      header:      'Telefon',
      cell:        ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.phone ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'max_lessons_per_day',
      header:      'Max/dag',
      cell:        ({ row }) => {
        const max = row.original.max_lessons_per_day;
        return (
          <span className="text-sm text-muted-foreground">
            {max != null ? `${max} lekt.` : '—'}
          </span>
        );
      },
    },
    {
      id:            'actions',
      header:        '',
      cell:          ({ row }) => (
        <InstructorQuickActions instructor={row.original} onEdit={onEdit} />
      ),
      enableSorting: false,
      enableHiding:  false,
    },
  ];
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  search:               string;
  onSearchChange:       (v: string) => void;
  statusFilter:         InstructorEmploymentType | undefined;
  onStatusFilterChange: (v: InstructorEmploymentType | undefined) => void;
}

function InstructorTableToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap w-full">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Sök på namn eller e-post..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-8"
        />
        {search && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onSearchChange('')}
            aria-label="Rensa sökning"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <Select
        value={statusFilter ?? 'all'}
        onValueChange={(v) =>
          onStatusFilterChange(v === 'all' ? undefined : (v as InstructorEmploymentType))
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Alla statusar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla statusar</SelectItem>
          {INSTRUCTOR_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function InstructorListPage() {
  const navigate = useNavigate();

  const [search,          setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter,    setStatusFilter]   = useState<InstructorEmploymentType | undefined>();
  const [formOpen,        setFormOpen]       = useState(false);
  const [editInstructor,  setEditInstructor] = useState<Instructor | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Paginated table query — respects search + status filter
  const { data, isLoading, error } = useInstructorList({
    ...(debouncedSearch ? { search: debouncedSearch }       : {}),
    ...(statusFilter    ? { employment_type: statusFilter } : {}),
  });

  // Coordination query — unfiltered, wider fetch for overview + panels
  const { data: coordData, isLoading: coordLoading } = useInstructorList({ per_page: 100 });

  const instructors = data?.data ?? [];
  const total       = data?.meta.total ?? 0;

  // Derived coordination data
  const coordInstructors = coordData?.data ?? [];

  const activeInstructors = useMemo(
    () => coordInstructors.filter(isActiveInstructor),
    [coordInstructors],
  );

  const onLeaveInstructors = useMemo(
    () => coordInstructors.filter(i => i.employment_type === 'on_leave'),
    [coordInstructors],
  );

  const expiredAdiInstructors = useMemo(() => {
    const now = Date.now();
    return activeInstructors.filter(
      i => i.adi_valid_until !== null && new Date(i.adi_valid_until).getTime() < now,
    );
  }, [activeInstructors]);

  const missingAdiInstructors = useMemo(
    () => activeInstructors.filter(i => !i.adi_number),
    [activeInstructors],
  );

  const categoryDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of activeInstructors) {
      for (const cat of i.teaching_categories) {
        map[cat] = (map[cat] ?? 0) + 1;
      }
    }
    return Object.entries(map)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 6) as [string, number][];
  }, [activeInstructors]);

  const handleEdit = useCallback((instructor: Instructor) => {
    setEditInstructor(instructor);
    setFormOpen(true);
  }, []);

  const columns = useMemo(() => buildColumns(handleEdit), [handleEdit]);

  function handleCreate() {
    setEditInstructor(null);
    setFormOpen(true);
  }

  function handleFormSuccess(instructor: Instructor) {
    setFormOpen(false);
    setEditInstructor(null);
    if (editInstructor === null) {
      navigate(`/instructors/${instructor.id}`);
    }
  }

  const descriptionText = isLoading
    ? 'Laddar...'
    : total > 0
    ? `${total} lärare totalt`
    : '';

  return (
    <PageLayout>
      <PageHeader
        title="Lärare"
        {...(descriptionText ? { description: descriptionText } : {})}
        breadcrumbs={[{ label: 'Hem' }, { label: 'Lärare' }]}
        actions={
          <PermissionGate permission={Permissions.INSTRUCTORS_CREATE}>
            <Button onClick={handleCreate} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Skapa lärare
            </Button>
          </PermissionGate>
        }
      />

      <PageContent className="!space-y-4">
        <InstructorOverviewBar
          activeCount={activeInstructors.length}
          onLeaveCount={onLeaveInstructors.length}
          missingAdiCount={missingAdiInstructors.length}
          expiredAdiCount={expiredAdiInstructors.length}
          isLoading={coordLoading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_272px] gap-4 items-start">
          {/* Left: instructor list */}
          <div className="min-w-0">
            {error ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <p className="text-sm text-destructive">Det gick inte att hämta lärarlistan.</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Försök igen
                </Button>
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={instructors}
                isLoading={isLoading}
                emptyMessage="Inga lärare hittades. Skapa en ny lärare för att komma igång."
                defaultPageSize={20}
                onRowClick={(instructor) => navigate(`/instructors/${instructor.id}`)}
                toolbar={
                  <InstructorTableToolbar
                    search={search}
                    onSearchChange={setSearch}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                  />
                }
              />
            )}
          </div>

          {/* Right: coordination panels */}
          <div className="space-y-3">
            <InstructorAttentionPanel
              onLeave={onLeaveInstructors}
              expiredAdi={expiredAdiInstructors}
              missingAdi={missingAdiInstructors}
              isLoading={coordLoading}
            />
            <InstructorCategoryPanel
              categoryDistribution={categoryDistribution}
              isLoading={coordLoading}
            />
          </div>
        </div>
      </PageContent>

      <InstructorForm
        open={formOpen}
        onOpenChange={setFormOpen}
        instructor={editInstructor}
        onSuccess={handleFormSuccess}
      />
    </PageLayout>
  );
}
