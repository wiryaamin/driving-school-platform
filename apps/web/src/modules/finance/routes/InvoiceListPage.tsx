import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, Plus } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import {
  Button, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DataTable, DataTableColumnHeader,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useInvoiceList, useVoidInvoice } from '../hooks/useFinance.js';
import type { Invoice, InvoiceStatus } from '../hooks/useFinance.js';
import { InvoiceStatusBadge, INVOICE_STATUS_OPTIONS } from '../components/InvoiceStatusBadge.js';
import { InvoiceQuickActions } from '../components/InvoiceQuickActions.js';
import { CreateInvoiceSheet } from '../components/CreateInvoiceSheet.js';
import { formatCurrency, formatDate } from '../lib/financeUtils.js';

// ─── Column definitions ───────────────────────────────────────────────────────

function buildColumns(
  onVoid: (invoice: Invoice) => void,
): ColumnDef<Invoice>[] {
  return [
    {
      id:     'invoice_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fakturanr" />,
      accessorFn: (row) => row.invoice_number ?? '',
      cell: ({ row }) => {
        const inv = row.original;
        return (
          <span className={`text-sm font-mono ${!inv.invoice_number ? 'text-muted-foreground italic' : 'text-foreground font-medium'}`}>
            {inv.invoice_number ?? 'Utkast'}
          </span>
        );
      },
    },
    {
      id:     'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Belopp" />,
      accessorKey: 'total_amount',
      cell: ({ row }) => (
        <span className="text-sm font-mono font-medium">
          {formatCurrency(row.original.total_amount, row.original.currency)}
        </span>
      ),
    },
    {
      id:     'outstanding_amount',
      header: 'Utestående',
      cell: ({ row }) => {
        const inv = row.original;
        if (inv.status === 'paid') return <span className="text-sm text-muted-foreground">—</span>;
        return (
          <span className={`text-sm font-mono ${inv.outstanding_amount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
            {formatCurrency(inv.outstanding_amount, inv.currency)}
          </span>
        );
      },
    },
    {
      id:          'status',
      accessorKey: 'status',
      header:      ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell:        ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
    },
    {
      id:     'due_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Förfaller" />,
      accessorFn: (row) => row.due_date ?? '',
      cell: ({ row }) => {
        const inv = row.original;
        const isOverdue = inv.due_date && inv.status !== 'paid' && inv.status !== 'void'
          && new Date(inv.due_date) < new Date();
        return (
          <span className={`text-sm ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            {formatDate(inv.due_date)}
          </span>
        );
      },
    },
    {
      id:     'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Skapad" />,
      accessorKey: 'created_at',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id:            'vat_amount',
      header:        'Moms',
      cell:          ({ row }) => (
        <span className="text-sm text-muted-foreground font-mono">
          {formatCurrency(row.original.vat_amount, row.original.currency)}
        </span>
      ),
    },
    {
      id:            'actions',
      header:        '',
      cell:          ({ row }) => (
        <InvoiceQuickActions invoice={row.original} onVoid={onVoid} />
      ),
      enableSorting:  false,
      enableHiding:   false,
    },
  ];
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  search:               string;
  onSearchChange:       (v: string) => void;
  statusFilter:         InvoiceStatus | 'all';
  onStatusFilterChange: (v: InvoiceStatus | 'all') => void;
}

function InvoiceTableToolbar({ search, onSearchChange, statusFilter, onStatusFilterChange }: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap w-full">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Sök fakturanummer..."
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
        value={statusFilter}
        onValueChange={(v) => onStatusFilterChange(v as InvoiceStatus | 'all')}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Alla statusar" />
        </SelectTrigger>
        <SelectContent>
          {INVOICE_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Void confirm dialog ──────────────────────────────────────────────────────

interface VoidDialogProps {
  invoice:   Invoice | null;
  open:      boolean;
  onClose:   () => void;
  onConfirm: (id: string) => void;
  isPending: boolean;
}

function VoidConfirmDialog({ invoice, open, onClose, onConfirm, isPending }: VoidDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Makulera faktura</DialogTitle>
          <DialogDescription>
            Är du säker på att du vill makulera faktura{' '}
            <strong>{invoice?.invoice_number ?? 'utkast'}</strong>?
            Denna åtgärd kan inte ångras.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Avbryt
          </Button>
          <PermissionGate permission={Permissions.FINANCE_INVOICE_VOID}>
            <Button
              variant="destructive"
              onClick={() => { if (invoice) onConfirm(invoice.id); }}
              disabled={isPending}
            >
              {isPending ? 'Makulerar...' : 'Makulera faktura'}
            </Button>
          </PermissionGate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function InvoiceListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const studentIdFilter = searchParams.get('student_id') ?? undefined;

  const [search,          setSearch]          = useState('');
  const [statusFilter,    setStatusFilter]    = useState<InvoiceStatus | 'all'>('all');
  const [voidTarget,      setVoidTarget]      = useState<Invoice | null>(null);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  const { data, isLoading, error, refetch } = useInvoiceList({
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(studentIdFilter ? { student_id: studentIdFilter } : {}),
    per_page: 50,
  });

  const voidMutation = useVoidInvoice();

  const invoices = data?.data ?? [];
  const total    = data?.meta.total ?? 0;

  const filteredInvoices = useMemo(() => {
    if (!search) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((inv) =>
      (inv.invoice_number ?? '').toLowerCase().includes(q)
    );
  }, [invoices, search]);

  const handleVoid = useCallback((invoice: Invoice) => {
    setVoidTarget(invoice);
  }, []);

  const handleVoidConfirm = useCallback((id: string) => {
    voidMutation.mutate({ id }, {
      onSuccess: () => setVoidTarget(null),
      onError: (err) => toast({
        title:       'Makuleringen misslyckades',
        description: err instanceof Error ? err.message : 'Försök igen eller kontakta support.',
        variant:     'destructive',
      }),
    });
  }, [voidMutation]);

  const columns = useMemo(() => buildColumns(handleVoid), [handleVoid]);

  return (
    <PermissionGate permission={Permissions.FINANCE_INVOICE_READ}>
    <PageLayout>
      <PageHeader
        title="Fakturor"
        {...(total > 0
          ? { description: studentIdFilter ? `Filtrerat per elev · ${total} fakturor` : `${total} fakturor totalt` }
          : {})}
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi' },
          { label: 'Fakturor' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/finance/payments')}
            >
              Betalningar
            </Button>
            <PermissionGate permission={Permissions.FINANCE_INVOICE_CREATE}>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setCreateSheetOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Ny faktura
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <PageContent>
        {error ? (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            <span>Det gick inte att hämta fakturalistan.</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Försök igen
            </Button>
          </div>
        ) : (
          <>
            {/* Summary badges */}
            {!isLoading && invoices.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {(['draft', 'overdue', 'issued', 'paid'] as const).map((s) => {
                  const count = invoices.filter((i) => i.status === s).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity"
                    >
                      <InvoiceStatusBadge status={s} />
                      <span className="text-muted-foreground">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <DataTable
              columns={columns}
              data={filteredInvoices}
              isLoading={isLoading}
              emptyMessage="Inga fakturor hittades. Klicka på 'Ny faktura' för att skapa din första faktura."
              defaultPageSize={25}
              onRowClick={(invoice) => navigate(`/finance/invoices/${invoice.id}`)}
              toolbar={
                <InvoiceTableToolbar
                  search={search}
                  onSearchChange={setSearch}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                />
              }
            />
          </>
        )}
      </PageContent>

      <VoidConfirmDialog
        invoice={voidTarget}
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoidConfirm}
        isPending={voidMutation.isPending}
      />

      <CreateInvoiceSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
      />
    </PageLayout>
    </PermissionGate>
  );
}
