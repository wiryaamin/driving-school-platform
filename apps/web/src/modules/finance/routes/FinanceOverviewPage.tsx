import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@core/api/supabase.js';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePaymentList, useInvoiceList } from '../hooks/useFinance.js';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge.js';
import { PaymentMethodBadge } from '../components/PaymentStatusBadge.js';
import { formatCurrency, formatDate, formatDateTime } from '../lib/financeUtils.js';

// ─── Overview stats query ─────────────────────────────────────────────────────

interface OverviewStats {
  invoicedThisMonth: number;
  paidThisMonth:     number;
  outstanding:       number;
  overdueCount:      number;
}

function useOverviewStats() {
  return useQuery<OverviewStats>({
    queryKey: ['finance-overview-stats'],
    queryFn: async () => {
      const now        = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [invoicesRes, paymentsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('status, total_amount, outstanding_amount')
          .is('deleted_at', null),
        supabase
          .from('payments')
          .select('amount, status, paid_at, created_at')
          .eq('status', 'confirmed'),
      ]);

      const invoices = (invoicesRes.data ?? []) as Array<{ status: string; total_amount: number | null; outstanding_amount: number | null }>;
      const payments = (paymentsRes.data ?? []) as Array<{ amount: number | null; status: string; paid_at: string | null; created_at: string }>;

      const invoicedThisMonth = invoices
        .reduce((s, i) => s + (i.total_amount ?? 0), 0);

      const paidThisMonth = payments
        .filter((p) => (p.paid_at ?? p.created_at) >= monthStart)
        .reduce((s, p) => s + (p.amount ?? 0), 0);

      const outstanding = invoices
        .filter((i) => ['issued', 'overdue', 'partially_paid'].includes(i.status))
        .reduce((s, i) => s + (i.outstanding_amount ?? 0), 0);

      const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

      return { invoicedThisMonth, paidThisMonth, outstanding, overdueCount };
    },
    staleTime: 60_000,
  });
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title:     string;
  value:     string;
  sub?:      string | undefined;
  icon:      React.ComponentType<{ className?: string }>;
  iconClass: string;
  isLoading: boolean;
  accent?:   string | undefined;
}

function KpiCard({ title, value, sub, icon: Icon, iconClass, isLoading, accent }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${iconClass}`} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 bg-muted rounded animate-pulse w-28 mt-1" />
        ) : (
          <div className={`text-2xl font-bold font-mono ${accent ?? ''}`}>{value}</div>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Recent payments section ──────────────────────────────────────────────────

function RecentPaymentsSection() {
  const { data, isLoading } = usePaymentList({ per_page: 8 });
  const payments = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Senaste betalningar</CardTitle>
          <Link to="/finance/payments" className="text-xs text-primary hover:underline">
            Visa alla
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 py-3 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-5 bg-muted rounded animate-pulse w-16" />
                  <div className="h-4 bg-muted rounded animate-pulse w-20" />
                </div>
                <div className="h-4 bg-muted rounded animate-pulse w-16" />
              </div>
            ))}
          </div>
        ) : payments.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Inga betalningar registrerade.</p>
        ) : (
          <div className="divide-y divide-border">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-6 py-3 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <PaymentMethodBadge method={p.payment_method} />
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(p.paid_at ?? p.created_at)}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <Link
                    to={`/finance/invoices/${p.invoice_id}`}
                    className="text-sm font-mono font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {formatCurrency(p.amount, p.currency)}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Overdue invoices section ─────────────────────────────────────────────────

function OverdueSection() {
  const { data, isLoading } = useInvoiceList({ status: 'overdue', per_page: 5 });
  const invoices = data?.data ?? [];
  const total    = data?.meta.total ?? 0;

  if (!isLoading && invoices.length === 0) return null;

  return (
    <Card className="border-red-200 dark:border-red-900/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Förfallna fakturor
          </CardTitle>
          {total > 5 && (
            <Link
              to="/finance/invoices?status=overdue"
              className="text-xs text-primary hover:underline"
            >
              Visa alla {total}
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 py-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                to={`/finance/invoices/${inv.id}`}
                className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {inv.invoice_number ?? 'Utkast'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Förföll {formatDate(inv.due_date)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-semibold text-destructive">
                    {formatCurrency(inv.outstanding_amount, inv.currency)}
                  </p>
                  <InvoiceStatusBadge status={inv.status} className="mt-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recent invoices section ──────────────────────────────────────────────────

function RecentInvoicesSection() {
  const { data, isLoading } = useInvoiceList({ per_page: 6 });
  const invoices = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Senaste fakturor</CardTitle>
          <Link to="/finance/invoices" className="text-xs text-primary hover:underline">
            Visa alla
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 py-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-5 bg-muted rounded animate-pulse w-14" />
                  <div className="h-4 bg-muted rounded animate-pulse w-24" />
                </div>
                <div className="h-4 bg-muted rounded animate-pulse w-16" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Inga fakturor skapade.</p>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                to={`/finance/invoices/${inv.id}`}
                className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <InvoiceStatusBadge status={inv.status} />
                  <span className="text-sm text-foreground truncate">
                    {inv.invoice_number ?? 'Utkast'}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-medium text-muted-foreground">
                    {formatCurrency(inv.total_amount, inv.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(inv.created_at)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FinanceOverviewPage() {
  const { data: stats, isLoading: statsLoading } = useOverviewStats();

  const monthLabel = useMemo(() => {
    return new Date().toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  }, []);

  return (
    <PageLayout>
      <PageHeader
        title="Ekonomiöversikt"
        description={`Översikt för ${monthLabel}`}
        breadcrumbs={[{ label: 'Hem' }, { label: 'Ekonomi' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/finance/invoices"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Fakturor
            </Link>
            <Link
              to="/finance/payments"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Betalningar
            </Link>
            <Link
              to="/finance/reconciliation"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Bankavstämning
            </Link>
            <Link
              to="/finance/payroll"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Lönehantering
            </Link>
            <Link
              to="/finance/refunds"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Återbetalningar
            </Link>
            <Link
              to="/finance/discounts"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Rabatter
            </Link>
            <Link
              to="/finance/close"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Periodstängning
            </Link>
            <Link
              to="/finance/dunning"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Inkasso
            </Link>
            <Link
              to="/finance/assets"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Anläggningstillgångar
            </Link>
            <Link
              to="/finance/vat"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Momsperioder
            </Link>
            <Link
              to="/finance/ledger"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Journalboken
            </Link>
            <Link
              to="/finance/accruals"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Periodiseringar
            </Link>
            <Link
              to="/finance/settings"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Inställningar
            </Link>
            <Link
              to="/finance/packages"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Paketkatalog
            </Link>
            <Link
              to="/finance/regulatory"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Regulatoriska exporter
            </Link>
            <Link
              to="/finance/financial-reports"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Finansiella rapporter
            </Link>
            <Link
              to="/finance/sie4"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              SIE4-exportfiler
            </Link>
            <Link
              to="/finance/wallet"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Plånbok
            </Link>
            <Link
              to="/finance/replay"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Ledger Replay
            </Link>
          </div>
        }
      />

      <PageContent>
        <div className="space-y-6">

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Fakturerat totalt"
              value={formatCurrency(stats?.invoicedThisMonth ?? 0)}
              sub="Alla fakturor (exkl. makulerade)"
              icon={TrendingUp}
              iconClass="text-blue-500"
              isLoading={statsLoading}
            />
            <KpiCard
              title="Inbetalt denna månad"
              value={formatCurrency(stats?.paidThisMonth ?? 0)}
              sub={`Bekräftade betalningar ${monthLabel}`}
              icon={CheckCircle2}
              iconClass="text-green-500"
              isLoading={statsLoading}
            />
            <KpiCard
              title="Utestående"
              value={formatCurrency(stats?.outstanding ?? 0)}
              sub="Skickade + förfallna + delbetalda"
              icon={Clock}
              iconClass="text-amber-500"
              isLoading={statsLoading}
              accent={stats && stats.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
            />
            <KpiCard
              title="Förfallna fakturor"
              value={String(stats?.overdueCount ?? 0)}
              sub="Kräver omedelbar åtgärd"
              icon={AlertTriangle}
              iconClass="text-destructive"
              isLoading={statsLoading}
              accent={stats && stats.overdueCount > 0 ? 'text-destructive' : undefined}
            />
          </div>

          {/* Overdue alert — only shown when there are overdue invoices */}
          <OverdueSection />

          {/* Two-column activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentPaymentsSection />
            <RecentInvoicesSection />
          </div>

        </div>
      </PageContent>
    </PageLayout>
  );
}
