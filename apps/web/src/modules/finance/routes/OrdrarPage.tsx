import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingBag, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Skeleton } from '@platform/ui';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge.js';
import { cn } from '@/lib/utils.js';
import type { Invoice } from '../hooks/useFinance.js';
import {
  useOrderList,
  orderStatusLabel,
  orderStatusColor,
  type OrderStatus,
  type OrderListItem,
} from '@modules/orders/hooks/useOrders.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrdrarTab = 'kassaordrar' | 'varukorgar' | 'ehandel';

type OrderStatusFilter = 'all' | 'draft' | 'issued' | 'paid' | 'partially_paid' | 'overdue' | 'void';

const STATUS_OPTIONS: { value: OrderStatusFilter; label: string }[] = [
  { value: 'all',            label: 'Visa alla' },
  { value: 'draft',          label: 'Utkast' },
  { value: 'issued',         label: 'Obetald' },
  { value: 'paid',           label: 'Betald' },
  { value: 'partially_paid', label: 'Delbetald' },
  { value: 'overdue',        label: 'Förfallen' },
  { value: 'void',           label: 'Makulerad' },
];

const TABS: { key: OrdrarTab; label: string }[] = [
  { key: 'ehandel',     label: 'E-handelsordrar' },
  { key: 'varukorgar',  label: 'Varukorgar' },
  { key: 'kassaordrar', label: 'Kassaordrar' },
];

type EcomStatusFilter = OrderStatus | 'all';

const ECOM_STATUS_OPTIONS: { value: EcomStatusFilter; label: string }[] = [
  { value: 'all',             label: 'Visa alla' },
  { value: 'draft',           label: 'Utkast' },
  { value: 'pending_payment', label: 'Väntar betalning' },
  { value: 'paid',            label: 'Betald' },
  { value: 'partially_paid',  label: 'Delvis betald' },
  { value: 'cancelled',       label: 'Avbokad' },
  { value: 'refunded',        label: 'Återbetald' },
];

// ─── Data ─────────────────────────────────────────────────────────────────────

async function fetchAllInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Invoice[];
}

function useOrdrar() {
  return useQuery({
    queryKey: ['ordrar', 'invoices'],
    queryFn:  fetchAllInvoices,
    staleTime: 2 * 60_000,
  });
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const SEK      = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function fmtSek(n: number) { return SEK.format(n); }
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '–';
  try { return DATE_FMT.format(new Date(iso)); } catch { return iso; }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}

// ─── Ecom Filter Bar ──────────────────────────────────────────────────────────

function EcomFilterBar({
  status,
  search,
  onStatusChange,
  onSearchChange,
}: {
  status:         EcomStatusFilter;
  search:         string;
  onStatusChange: (v: EcomStatusFilter) => void;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative shrink-0">
        <select
          value={status}
          onChange={e => onStatusChange(e.target.value as EcomStatusFilter)}
          className="h-9 text-sm border border-border rounded-md pl-3 pr-8 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
        >
          {ECOM_STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
      <div className="relative flex-1 min-w-[280px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Sök på ordernummer, elevnamn eller e-post..."
          className="w-full h-9 pl-8 pr-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
    </div>
  );
}

// ─── Ecom Orders Table ────────────────────────────────────────────────────────

function EcomOrdersTable({
  orders,
  isLoading,
}: {
  orders:    OrderListItem[];
  isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ordernr</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Elev</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Paket</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kampanj</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total inkl moms</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {[...Array(8)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="flex flex-col items-center gap-2 py-14 text-center">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Det finns inga e-handelsordrar att visa.</p>
                  </div>
                </td>
              </tr>
            ) : (
              orders.map(order => (
                <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    #{order.order_number}
                  </td>
                  <td className="px-4 py-3">
                    {(order.student_first_name != null || order.student_last_name != null) ? (
                      <>
                        <div className="text-sm font-medium text-foreground">
                          {`${order.student_first_name ?? ''} ${order.student_last_name ?? ''}`.trim()}
                        </div>
                        {order.student_email != null && (
                          <div className="text-xs text-muted-foreground">{order.student_email}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">{order.student_email ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{order.package_name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{order.campaign_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {fmtSek(order.total_amount_incl_vat)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', orderStatusColor(order.status))}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {fmtDate(order.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/orders/${order.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Visa →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Ecom Pagination ──────────────────────────────────────────────────────────

function EcomPagination({
  page,
  total,
  perPage,
  onChange,
}: {
  page:     number;
  total:    number;
  perPage:  number;
  onChange: (p: number) => void;
}) {
  const lastPage = Math.ceil(total / perPage);
  if (lastPage <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{total} ordrar totalt</span>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-40 hover:bg-muted/50 transition-colors"
        >
          ← Föregående
        </button>
        <span className="px-2 py-1.5 text-muted-foreground">Sida {page} / {lastPage}</span>
        <button
          disabled={page >= lastPage}
          onClick={() => onChange(page + 1)}
          className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-40 hover:bg-muted/50 transition-colors"
        >
          Nästa →
        </button>
      </div>
    </div>
  );
}

// ─── Orders Table ─────────────────────────────────────────────────────────────

function OrdersTable({
  invoices,
  isLoading,
  emptyText,
}: {
  invoices: Invoice[];
  isLoading: boolean;
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ordernr</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totalt</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Betalt</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kvar</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center gap-2 py-14 text-center">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{emptyText}</p>
                  </div>
                </td>
              </tr>
            ) : (
              invoices.map(inv => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {inv.invoice_number ?? <span className="italic text-muted-foreground/50">–</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {fmtDate(inv.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {fmtSek(inv.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-700 dark:text-green-400">
                    {fmtSek(inv.paid_amount)}
                  </td>
                  <td className={cn(
                    'px-4 py-3 text-right tabular-nums font-semibold',
                    inv.outstanding_amount > 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {fmtSek(inv.outstanding_amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer summary */}
      {!isLoading && invoices.length > 0 && (
        <div className="border-t border-border px-4 py-3 bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{invoices.length} ordrar</span>
          <span className="text-sm font-semibold text-foreground">
            Totalt: {fmtSek(invoices.reduce((s, i) => s + i.total_amount, 0))}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── OrdrarPage ───────────────────────────────────────────────────────────────

export function OrdrarPage() {
  const [activeTab,    setActiveTab]    = useState<OrdrarTab>('kassaordrar');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [search,       setSearch]       = useState('');

  // E-handelsordrar tab state
  const [ecomStatus, setEcomStatus] = useState<EcomStatusFilter>('all');
  const [ecomSearch, setEcomSearch] = useState('');
  const [ecomPage,   setEcomPage]   = useState(1);

  const { data: ecomData, isLoading: ecomLoading } = useOrderList({
    status:   ecomStatus !== 'all' ? ecomStatus : undefined,
    search:   ecomSearch || undefined,
    page:     ecomPage,
    per_page: 25,
  });
  const ecomOrders = ecomData?.data ?? [];
  const ecomTotal  = ecomData?.meta?.total ?? 0;

  const { data: allInvoices = [], isLoading } = useOrdrar();

  // Kassaordrar = all invoices (POS + manual) filtered client-side
  const kassaordrar = useMemo(() => {
    let list = allInvoices;
    if (statusFilter !== 'all') list = list.filter(i => i.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i =>
        (i.invoice_number ?? '').toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allInvoices, statusFilter, search]);

  // 30-day stats (for Varukorgar / e-commerce)
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d;
  }, []);
  const recent = useMemo(
    () => allInvoices.filter(i => new Date(i.created_at) >= thirtyDaysAgo),
    [allInvoices, thirtyDaysAgo]
  );
  const paidRecent = recent.filter(i => i.status === 'paid');
  const convRate   = recent.length > 0 ? Math.round((paidRecent.length / recent.length) * 100) : 0;

  const breadcrumbTitle =
    activeTab === 'kassaordrar' ? 'Kassaordrar'
    : activeTab === 'varukorgar' ? 'Aktuella varukorgar'
    : 'E-handelsordrar';

  return (
    <PageLayout>
      <PageHeader
        title="Ordrar"
        breadcrumbs={[{ label: 'Ordrar' }, { label: breadcrumbTitle }]}
      />

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="border-b border-border -mt-2">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                setSearch(''); setStatusFilter('all');
                setEcomSearch(''); setEcomStatus('all'); setEcomPage(1);
              }}
              className={cn(
                'px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/60'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Kassaordrar ─────────────────────────────────────────────────── */}
      {activeTab === 'kassaordrar' && (
        <>
          <FilterBar
            statusFilter={statusFilter}
            search={search}
            onStatusChange={setStatusFilter}
            onSearchChange={setSearch}
          />
          <OrdersTable
            invoices={kassaordrar}
            isLoading={isLoading}
            emptyText="Det finns inga ordrar att visa just nu."
          />
        </>
      )}

      {/* ── Varukorgar ──────────────────────────────────────────────────── */}
      {activeTab === 'varukorgar' && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-primary">Statistik senaste 30 dagarna</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
            ) : (
              <>
                <StatCard label="Skapade varukorgar"  value={`${recent.length} st`} />
                <StatCard label="Vidare till kassa"   value={`${recent.filter(i => i.status !== 'draft').length} st`} />
                <StatCard label="Betalda varukorgar"  value={`${paidRecent.length} st`} />
                <StatCard label="Konverteringsgrad"   value={`${convRate}%`} />
              </>
            )}
          </div>

          {!isLoading && recent.length === 0 && (
            <div className="rounded-lg border border-border bg-card flex flex-col items-center gap-2 py-14 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Inga varukorgar de senaste 30 dagarna.</p>
            </div>
          )}
        </div>
      )}

      {/* ── E-handelsordrar ─────────────────────────────────────────────── */}
      {activeTab === 'ehandel' && (
        <>
          <EcomFilterBar
            status={ecomStatus}
            search={ecomSearch}
            onStatusChange={(s) => { setEcomStatus(s); setEcomPage(1); }}
            onSearchChange={(s) => { setEcomSearch(s); setEcomPage(1); }}
          />
          <EcomOrdersTable orders={ecomOrders} isLoading={ecomLoading} />
          <EcomPagination page={ecomPage} total={ecomTotal} perPage={25} onChange={setEcomPage} />
        </>
      )}
    </PageLayout>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  statusFilter,
  search,
  onStatusChange,
  onSearchChange,
  placeholder = 'Sök efter siffrorna på ordernummer, förnamn, efternamn, e-post, personnummer eller telefonnummer',
}: {
  statusFilter:    OrderStatusFilter;
  search:          string;
  onStatusChange:  (v: OrderStatusFilter) => void;
  onSearchChange:  (v: string) => void;
  placeholder?:    string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative shrink-0">
        <select
          value={statusFilter}
          onChange={e => onStatusChange(e.target.value as OrderStatusFilter)}
          className="h-9 text-sm border border-border rounded-md pl-3 pr-8 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>

      <div className="relative flex-1 min-w-[280px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-9 pl-8 pr-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
    </div>
  );
}
