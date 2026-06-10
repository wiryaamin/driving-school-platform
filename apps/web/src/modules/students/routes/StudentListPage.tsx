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
import { useStudentList } from '../hooks/useStudents.js';
import type { Student, StudentStatus } from '../hooks/useStudents.js';
import { StudentStatusBadge, PermitStageBadge, STUDENT_STATUS_OPTIONS } from '../components/StudentStatusBadge.js';
import { StudentQuickActions } from '../components/StudentQuickActions.js';
import { StudentForm } from '../components/StudentForm.js';

// ─── Column definitions ───────────────────────────────────────────────────────

function buildColumns(
  onEdit: (s: Student) => void
): ColumnDef<Student>[] {
  return [
    {
      id: 'name',
      accessorFn: (row) => `${row.first_name} ${row.last_name}`,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Elev" />
      ),
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">
              {s.first_name} {s.last_name}
            </div>
            {s.personnummer_last4 && (
              <div className="text-xs text-muted-foreground font-mono">
                ******-{s.personnummer_last4}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="E-post" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {row.original.email ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Telefon',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.phone ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'target_licence_category',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Behörighet" />
      ),
      cell: ({ row }) => {
        const cat = row.original.target_licence_category;
        return cat
          ? <Badge variant="outline" className="font-mono">{cat}</Badge>
          : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: 'permit_stage',
      header: 'Utbildningssteg',
      cell: ({ row }) => <PermitStageBadge stage={row.original.permit_stage} />,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => <StudentStatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <StudentQuickActions student={row.original} onEdit={onEdit} />
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

// ─── Toolbar component ────────────────────────────────────────────────────────

interface ToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: StudentStatus | undefined;
  onStatusFilterChange: (v: StudentStatus | undefined) => void;
}

function StudentTableToolbar({
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
        onValueChange={(v) => onStatusFilterChange(v === 'all' ? undefined : (v as StudentStatus))}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Alla statusar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla statusar</SelectItem>
          {STUDENT_STATUS_OPTIONS.map((opt) => (
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

export function StudentListPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudentStatus | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error } = useStudentList({
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(statusFilter    ? { status: statusFilter }    : {}),
  });

  const students = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  const handleEdit = useCallback((student: Student) => {
    setEditStudent(student);
    setFormOpen(true);
  }, []);

  const columns = useMemo(() => buildColumns(handleEdit), [handleEdit]);

  function handleCreate() {
    setEditStudent(null);
    setFormOpen(true);
  }

  function handleFormSuccess(student: Student) {
    setFormOpen(false);
    setEditStudent(null);
    // Navigate to detail page on create
    if (editStudent === null) {
      navigate(`/students/${student.id}`);
    }
  }

  return (
    <PageLayout>
      <PageHeader
        title="Elever"
        {...(() => {
          const desc = isLoading
            ? 'Laddar...'
            : total > 0
            ? `${total} elev${total !== 1 ? 'er' : ''} totalt`
            : '';
          return desc ? { description: desc } : {};
        })()}
        breadcrumbs={[{ label: 'Hem' }, { label: 'Elever' }]}
        actions={
          <PermissionGate permission={Permissions.STUDENTS_CREATE}>
            <Button onClick={handleCreate} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Skapa elev
            </Button>
          </PermissionGate>
        }
      />

      <PageContent>
        {error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-destructive">
              Det gick inte att hämta elevlistan.
            </p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Försök igen
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={students}
            isLoading={isLoading}
            emptyMessage="Inga elever hittades. Skapa en ny elev för att komma igång."
            defaultPageSize={20}
            onRowClick={(student) => navigate(`/students/${student.id}`)}
            toolbar={
              <StudentTableToolbar
                search={search}
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            }
          />
        )}
      </PageContent>

      <StudentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        student={editStudent}
        onSuccess={handleFormSuccess}
      />
    </PageLayout>
  );
}
