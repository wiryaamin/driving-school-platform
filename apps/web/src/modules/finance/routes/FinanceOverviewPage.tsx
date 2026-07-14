import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, AlertTriangle, Clock, CheckCircle2,
  BookOpen, Percent, Lock, Download, Landmark, Users, BarChart3, Settings,
  Plug2, Building2, CalendarClock, ShieldCheck, History,
  Smartphone, BadgePercent, BellRing, Gift, CircleDollarSign, Wallet,
} from 'lucide-react';
import { supabase } from '@core/api/supabase.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePaymentList, useInvoiceList } from '../hooks/useFinance.js';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge.js';
import { PaymentMethodBadge } from '../components/PaymentStatusBadge.js';
import { formatCurrency, formatDate, formatDateTime } from '../lib/financeUtils.js';

// ─── Overview stats query ─────────────────────────────────────────────────────

interface OverviewStats {
  totalInvoiced: number;
  paidThisMonth: number;
  outstanding:   number;
  overdueCount:  number;
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
          .is('void_at', null),
        supabase
          .from('payments')
          .select('amount, status, paid_at, created_at')
          .eq('status', 'confirmed'),
      ]);

      const invoices = (invoicesRes.data ?? []) as Array<{ status: string; total_amount: number | null; outstanding_amount: number | null }>;
      const payments = (paymentsRes.data ?? []) as Array<{ amount: number | null; status: string; paid_at: string | null; created_at: string }>;

      const totalInvoiced = invoices
        .reduce((s, i) => s + (i.total_amount ?? 0), 0);

      const paidThisMonth = payments
        .filter((p) => (p.paid_at ?? p.created_at) >= monthStart)
        .reduce((s, p) => s + (p.amount ?? 0), 0);

      const outstanding = invoices
        .filter((i) => ['issued', 'overdue', 'partially_paid'].includes(i.status))
        .reduce((s, i) => s + (i.outstanding_amount ?? 0), 0);

      const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

      return { totalInvoiced, paidThisMonth, outstanding, overdueCount };
    },
    staleTime: 60_000,
  });
}

// ─── Finance shortcuts section ────────────────────────────────────────────────

interface ShortcutItem {
  icon:  React.ComponentType<{ className?: string }>;
  label: string;
  sub:   string;
  href:  string;
}

const FINANCE_SHORTCUTS: ShortcutItem[] = [
  { icon: BookOpen,     label: 'Journalboken',           sub: 'Dubbelbokhållning & verifikat',  href: '/finance/ledger' },
  { icon: Percent,      label: 'Momsperioder',           sub: 'Momsredovisning & låsning',      href: '/finance/vat' },
  { icon: Lock,         label: 'Periodstängning',        sub: 'Mjuk/hård stängning & bokslut',  href: '/finance/close' },
  { icon: Download,     label: 'SIE4-exportfiler',       sub: 'Bokföringsfiler (SHA-256)',      href: '/finance/sie4' },
  { icon: Landmark,     label: 'Bankavstämning',         sub: 'Importera kontoutdrag',          href: '/finance/reconciliation' },
  { icon: Users,        label: 'Lönehantering',          sub: 'Löner & arbetsgivaravgift',      href: '/finance/payroll' },
  { icon: BarChart3,    label: 'Rapporter',              sub: 'Finansiella rapporter & BAS',    href: '/finance/financial-reports' },
  { icon: Settings,     label: 'Inställningar',          sub: 'Svenska kontoinst. & OCR-ref.',  href: '/finance/settings' },
  { icon: Plug2,        label: 'Fortnox',                sub: 'Bokföringsintegration',          href: '/finance/fortnox' },
  { icon: Building2,    label: 'Anläggningstillgångar',  sub: 'Avskrivningar & inventarier',    href: '/finance/assets' },
  { icon: CalendarClock,label: 'Periodiseringar',        sub: 'Förutbetalda & upplupna poster', href: '/finance/accruals' },
  { icon: ShieldCheck,  label: 'Myndighetsexporter',     sub: 'Regulatoriska exportfiler',      href: '/finance/regulatory' },
  { icon: History,      label: 'Journalreplay',          sub: 'Verifiera bokföringshistorik',   href: '/finance/replay' },
];

const PAYMENT_SHORTCUTS: ShortcutItem[] = [
  { icon: Smartphone,       label: 'Betalningsbegäran', sub: 'Swish- & betalningsförfrågningar', href: '/finance/requests' },
  { icon: BadgePercent,     label: 'Rabatter',          sub: 'Rabattkoder & kampanjer',           href: '/finance/discounts' },
  { icon: BellRing,         label: 'Påminnelser',       sub: 'Betalningspåminnelser & inkasso',   href: '/finance/dunning' },
  { icon: Gift,             label: 'Presentkort',       sub: 'Sälj & hantera presentkort',        href: '/finance/gift-cards' },
  { icon: CircleDollarSign, label: 'Kundekonomi',       sub: 'Kundsaldon & reskontra',             href: '/finance/kundekonomi' },
  { icon: Wallet,           label: 'Plånbok',           sub: 'Elevernas tillgodohavanden',         href: '/finance/wallet' },
];

function FinanceShortcutsSection({ title, items }: { title: string; items: ShortcutItem[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              to={s.href}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-accent/50 hover:border-primary/30 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.sub}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
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
    <PermissionGate permission={Permissions.FINANCE_INVOICE_READ}>
    <PageLayout>
      <PageHeader
        title="Ekonomiöversikt"
        description={`Ekonomi och bokföring — ${monthLabel}`}
        breadcrumbs={[{ label: 'Hem' }, { label: 'Ekonomi' }]}
      />

      <PageContent>
        <div className="space-y-6">

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Fakturerat totalt"
              value={formatCurrency(stats?.totalInvoiced ?? 0)}
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

          {/* Finance shortcuts */}
          <FinanceShortcutsSection title="Bokföring & Redovisning" items={FINANCE_SHORTCUTS} />
          <FinanceShortcutsSection title="Betalningar & Kundhantering" items={PAYMENT_SHORTCUTS} />

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
    </PermissionGate>
  );
}
