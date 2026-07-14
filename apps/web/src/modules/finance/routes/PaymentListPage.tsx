import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { ColumnDef } from '@platform/ui';
import {
  Button,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DataTable, DataTableColumnHeader,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { usePaymentList } from '../hooks/useFinance.js';
import type { Payment } from '../hooks/useFinance.js';
import { PaymentStatusBadge, PaymentMethodBadge, PAYMENT_STATUS_OPTIONS, PAYMENT_METHOD_OPTIONS } from '../components/PaymentStatusBadge.js';
import { formatCurrency, formatDateTime } from '../lib/financeUtils.js';

// ─── Column definitions ───────────────────────────────────────────────────────

function buildColumns(): ColumnDef<Payment>[] {
  return [
    {
      id:          'amount',
      header:      ({ column }) => <DataTableColumnHeader column={column} title="Belopp" />,
      accessorKey: 'amount',
      cell:        ({ row }) => (
        <span className="text-sm font-mono font-medium">
          {formatCurrency(row.original.amount, row.original.currency)}
        </span>
      ),
    },
    {
      id:     'payment_method',
      header: 'Betalningssätt',
      cell:   ({ row }) => <PaymentMethodBadge method={row.original.payment_method} />,
    },
    {
      id:     'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorKey: 'status',
      cell:   ({ row }) => <PaymentStatusBadge status={row.original.status} />,
    },
    {
      id:     'paid_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Datum" />,
      accessorFn: (row) => row.paid_at ?? row.created_at,
      cell:   ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.original.paid_at ?? row.original.created_at)}
        </span>
      ),
    },
    {
      id:     'invoice',
      header: 'Faktura',
      cell:   ({ row }) => (
        <Link
          to={`/finance/invoices/${row.original.invoice_id}`}
          className="text-xs text-primary hover:underline"
        >
          Visa faktura
        </Link>
      ),
    },
    {
      id:     'reference',
      header: 'Referens',
      cell:   ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.original.provider_reference ?? '—'}
        </span>
      ),
    },
  ];
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  statusFilter:        string;
  onStatusFilterChange:(v: string) => void;
  methodFilter:        string;
  onMethodFilterChange:(v: string) => void;
}

function PaymentTableToolbar({
  statusFilter, onStatusFilterChange,
  methodFilter, onMethodFilterChange,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Alla statusar" />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={methodFilter} onValueChange={onMethodFilterChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Alla sätt" />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_METHOD_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PaymentListPage() {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');

  const { data, isLoading, error } = usePaymentList({
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(methodFilter !== 'all' ? { method: methodFilter } : {}),
    per_page: 50,
  });

  const payments = data?.data ?? [];
  const total    = data?.meta.total ?? 0;

  const totalPaid = useMemo(
    () => payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0),
    [payments],
  );

  const columns = useMemo(() => buildColumns(), []);

  return (
    <PermissionGate permission={Permissions.FINANCE_PAYMENT_READ}>
    <PageLayout>
      <PageHeader
        title="Betalningar"
        {...(total > 0 ? { description: `${total} betalningar totalt` } : {})}
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi' },
          { label: 'Betalningar' },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/finance/invoices')}
          >
            Fakturor
          </Button>
        }
      />

      <PageContent>
        {error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-destructive">Det gick inte att hämta betalningar.</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Försök igen
            </Button>
          </div>
        ) : (
          <>
            {/* Summary */}
            {!isLoading && payments.length > 0 && (
              <div className="flex flex-wrap gap-4 mb-4 p-4 bg-muted/30 rounded-lg">
                <div className="text-sm">
                  <p className="text-muted-foreground">Bekräftade betalningar</p>
                  <p className="text-lg font-semibold font-mono mt-0.5">
                    {formatCurrency(totalPaid, 'SEK')}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-muted-foreground">Antal</p>
                  <p className="text-lg font-semibold mt-0.5">{total}</p>
                </div>
              </div>
            )}

            <DataTable
              columns={columns}
              data={payments}
              isLoading={isLoading}
              emptyMessage="Inga betalningar registrerade. Betalningar registreras automatiskt när en faktura betalas."
              defaultPageSize={25}
              toolbar={
                <PaymentTableToolbar
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  methodFilter={methodFilter}
                  onMethodFilterChange={setMethodFilter}
                />
              }
            />
          </>
        )}
      </PageContent>
    </PageLayout>
    </PermissionGate>
  );
}
