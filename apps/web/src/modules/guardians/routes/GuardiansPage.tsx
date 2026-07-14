import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, HeartHandshake, ChevronRight, RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import { Button, Input, DataTable } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PhoneLink } from '@shared/components/PhoneLink.js';
import { useAllGuardians } from '../hooks/useGuardians.js';
import type { GuardianListItem } from '../hooks/useGuardians.js';

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<GuardianListItem>[] {
  return [
    {
      id: 'name',
      header: 'Namn',
      cell: ({ row }) => {
        const g = row.original;
        return (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <HeartHandshake className="w-3 h-3 text-primary" />
            </div>
            <span className="text-sm font-medium text-foreground">
              {g.first_name} {g.last_name}
            </span>
          </div>
        );
      },
    },
    {
      id: 'relation',
      header: 'Relation',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.relation ?? '—'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'email',
      header: 'E-post',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {row.original.email}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'phone',
      header: 'Telefon',
      cell: ({ row }) => {
        const phone = row.original.phone;
        if (!phone) return <span className="text-sm text-muted-foreground/40">—</span>;
        return <PhoneLink phone={phone} />;
      },
      enableSorting: false,
    },
    {
      id: 'can_pay',
      header: 'Betalning',
      cell: ({ row }) => (
        <span className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
          row.original.can_pay
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
        )}>
          {row.original.can_pay ? 'Kan betala' : 'Ej betalare'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'student',
      header: 'Elev',
      cell: ({ row }) => {
        const s = row.original.students;
        if (!s) return <span className="text-muted-foreground/40 text-sm">—</span>;
        return (
          <span className="text-sm text-foreground">
            {s.first_name} {s.last_name}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      id: 'arrow',
      header: '',
      cell: () => <ChevronRight className="w-4 h-4 text-muted-foreground/40" />,
      enableSorting: false,
      enableHiding: false,
      size: 36,
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function GuardiansPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch } = useAllGuardians();

  const filtered = useMemo(() => {
    const all = data ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((g) => {
      const fullName  = `${g.first_name} ${g.last_name}`.toLowerCase();
      const student   = g.students ? `${g.students.first_name} ${g.students.last_name}`.toLowerCase() : '';
      return (
        fullName.includes(q) ||
        g.email.toLowerCase().includes(q) ||
        (g.phone ?? '').toLowerCase().includes(q) ||
        (g.relation ?? '').toLowerCase().includes(q) ||
        student.includes(q)
      );
    });
  }, [data, search]);

  const columns = useMemo(() => buildColumns(), []);

  return (
    <div className="max-w-screen-2xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between pb-3">
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Hem</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">Vårdnadshavare</span>
        </nav>
      </div>

      {/* Search + refresh */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Sök på namn, e-post, telefon, elev..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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

      {/* Table */}
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-destructive">Det gick inte att hämta listan.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Försök igen
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            emptyMessage="Inga vårdnadshavare hittades."
            defaultPageSize={25}
            onRowClick={(row) => {
              if (row.students?.id) {
                navigate(`/students/${row.students.id}`);
              }
            }}
          />
        </div>
      )}

    </div>
  );
}
