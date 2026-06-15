import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronRight, Building2, RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import { Button, Input, DataTable } from '@platform/ui';
import { useCorporateList } from '../hooks/useCorporateCustomers.js';
import type { CorporateCustomer, CorporateCustomerStatus } from '../hooks/useCorporateCustomers.js';
import { cn } from '@/lib/utils.js';
import { CorporateCreateDialog } from './CorporateCreatePage.js';

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type CorpTab = 'alla' | 'aktiva' | 'arkiverade';

const TABS: { key: CorpTab; label: string; status?: CorporateCustomerStatus }[] = [
  { key: 'alla',       label: 'Alla'                          },
  { key: 'aktiva',     label: 'Aktiva',     status: 'active'  },
  { key: 'arkiverade', label: 'Arkiverade', status: 'archived' },
];

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<CorporateCustomer>[] {
  return [
    {
      id: 'company',
      header: 'Företagsnamn',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="w-3 h-3 text-primary" />
          </div>
          <span className="text-sm font-medium text-foreground">{row.original.company_name}</span>
        </div>
      ),
    },
    {
      id: 'org_number',
      header: 'Orgnummer',
      cell: ({ row }) => (
        <span className="text-sm font-mono text-muted-foreground">
          {row.original.org_number ?? '—'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'city',
      header: 'Stad',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.city ?? '—'}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'contact',
      header: 'Kontaktperson',
      cell: ({ row }) => {
        const { contact_first_name: f, contact_last_name: l } = row.original;
        if (!f && !l) return <span className="text-muted-foreground/40">—</span>;
        return <span className="text-sm text-foreground">{[f, l].filter(Boolean).join(' ')}</span>;
      },
      enableSorting: false,
    },
    {
      id: 'contact_email',
      header: 'E-post',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {row.original.contact_email ?? '—'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'contact_phone',
      header: 'Telefon',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.contact_phone ?? '—'}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status;
        return (
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
            s === 'active'   && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            s === 'paused'   && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            s === 'archived' && 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
          )}>
            {s === 'active' ? 'Aktiv' : s === 'paused' ? 'Vilande' : 'Arkiverad'}
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

export function CorporateListPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab]   = useState<CorpTab>('alla');
  const [search, setSearch]         = useState('');
  const [debSearch, setDebSearch]   = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const currentTab = TABS.find((t) => t.key === activeTab);

  const query = {
    ...(currentTab?.status !== undefined ? { status: currentTab.status } : {}),
    ...(debSearch ? { search: debSearch } : {}),
  };

  const { data, isLoading, error, refetch } = useCorporateList(query);
  const records = data?.data ?? [];
  const columns = useMemo(() => buildColumns(), []);

  function handleTabChange(tab: CorpTab) {
    setActiveTab(tab);
    setSearch('');
    setDebSearch('');
  }

  return (
    <div className="max-w-screen-2xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between pb-3">
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Hem</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">
            {activeTab === 'alla' ? 'Alla företagskunder'
              : `${currentTab?.label ?? ''} företagskunder`}
          </span>
        </nav>
        <button className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Tab bar */}
      <div className="flex items-end border-b border-border mb-4">
        {TABS.map((tab) => (
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
        <div className="ml-auto pb-1">
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="border-0 bg-green-600 text-white hover:bg-green-700"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Ny företagskund
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Sök på företagsnamn, orgnummer eller e-post..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setDebSearch(search)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setDebSearch(search)}>Sök</Button>
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
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Försök igen
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={records}
            isLoading={isLoading}
            emptyMessage="Inga företagskunder hittades."
            defaultPageSize={25}
            onRowClick={(row) => navigate(`/corporate/${row.id}`)}
          />
        </div>
      )}

      {/* Create dialog */}
      <CorporateCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(id) => navigate(`/corporate/${id}`)}
      />
    </div>
  );
}
