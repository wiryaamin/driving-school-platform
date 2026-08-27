import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useOrderList,
  orderStatusLabel,
  orderStatusColor,
  formatOrderPrice,
  type OrderStatus,
  type OrderListItem,
} from '../hooks/useOrders.js';

const STATUS_TABS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all',             label: 'Alla' },
  { value: 'draft',           label: 'Utkast' },
  { value: 'pending_payment', label: 'Väntar' },
  { value: 'paid',            label: 'Betalda' },
  { value: 'partially_paid',  label: 'Delvis' },
  { value: 'cancelled',       label: 'Avbokade' },
  { value: 'refunded',        label: 'Återbetalda' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function studentName(order: OrderListItem): string {
  if (order.student_first_name != null || order.student_last_name != null) {
    return [order.student_first_name, order.student_last_name].filter(Boolean).join(' ');
  }
  return '—';
}

export function OrderListPage() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);

  const { data, isLoading, isError } = useOrderList({
    status:   statusFilter,
    search:   search || undefined,
    page,
    per_page: 25,
  });

  const orders = data?.data  ?? [];
  const meta   = data?.meta;
  const total  = meta?.total ?? 0;
  const pages  = meta != null ? Math.ceil(total / meta.per_page) : 1;

  function handleStatusChange(s: OrderStatus | 'all') {
    setStatusFilter(s);
    setPage(1);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  return (
    <PermissionGate permission={Permissions.ORDERS_READ}>
    <PageLayout>
      <PageHeader
        title="Ordrar"
        description={total > 0 ? `${total} ordrar` : isLoading ? 'Laddar…' : 'Inga ordrar'}
      />
      <PageContent>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-sm flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Sök elev, e-post eller paket…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Sök
          </button>
        </form>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleStatusChange(tab.value)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              statusFilter === tab.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isError ? (
        <div className="text-center py-12 text-red-500 text-sm">Kunde inte ladda orders.</div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Inga orders hittades</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Order</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Elev</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Paket</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Belopp</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Datum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-500">
                        #{String(order.order_number).padStart(4, '0')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{studentName(order)}</div>
                      {order.student_email != null && (
                        <div className="text-xs text-gray-400">{order.student_email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-gray-700">{order.package_name ?? '—'}</span>
                      {order.campaign_name != null && (
                        <div className="text-xs text-blue-600">{order.campaign_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatOrderPrice(order.total_amount_incl_vat, order.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusColor(order.status)}`}>
                        {orderStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/orders/${order.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                      >
                        Visa
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Visar {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} av {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  {page} / {pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </PageContent>
    </PageLayout>
    </PermissionGate>
  );
}
