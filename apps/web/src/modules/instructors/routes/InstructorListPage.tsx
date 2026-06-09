import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
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
import { InstructorStatusBadge, INSTRUCTOR_STATUS_OPTIONS } from '../components/InstructorStatusBadge.js';
import { InstructorQuickActions } from '../components/InstructorQuickActions.js';
import { InstructorForm } from '../components/InstructorForm.js';

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
      id:             'actions',
      header:         '',
      cell:           ({ row }) => (
        <InstructorQuickActions instructor={row.original} onEdit={onEdit} />
      ),
      enableSorting:  false,
      enableHiding:   false,
    },
  ];
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  search:              string;
  onSearchChange:      (v: string) => void;
  statusFilter:        InstructorEmploymentType | undefined;
  onStatusFilterChange:(v: InstructorEmploymentType | undefined) => void;
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

  const [search,         setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter,   setStatusFilter]   = useState<InstructorEmploymentType | undefined>();
  const [formOpen,       setFormOpen]       = useState(false);
  const [editInstructor, setEditInstructor] = useState<Instructor | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error } = useInstructorList({
    ...(debouncedSearch ? { search: debouncedSearch }        : {}),
    ...(statusFilter    ? { employment_type: statusFilter }  : {}),
  });

  const instructors = data?.data ?? [];
  const total       = data?.meta.total ?? 0;

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

  return (
    <PageLayout>
      <PageHeader
        title="Lärare"
        {...(() => {
          const desc = isLoading
            ? 'Laddar...'
            : total > 0
            ? `${total} lärare totalt`
            : '';
          return desc ? { description: desc } : {};
        })()}
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

      <PageContent>
        {error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-destructive">
              Det gick inte att hämta lärarlistan.
            </p>
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
