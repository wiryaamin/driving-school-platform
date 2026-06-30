import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge, Card, CardContent, CardHeader, CardTitle, Button,
} from '@platform/ui';
import { Wallet, Package, FileText, CreditCard, AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import type { Invoice, Payment } from '@platform/types';
import {
  useStudentWallet, useStudentPackages,
  useInvoiceList, usePaymentList,
} from '../hooks/useFinance.js';
import { useStudentRefunds } from '../hooks/useRefunds.js';
import { InvoiceStatusBadge } from './InvoiceStatusBadge.js';
import { PaymentStatusBadge } from './PaymentStatusBadge.js';
import { RefundDialog } from './RefundDialog.js';
import {
  formatCurrency, formatDate,
  paymentMethodLabel, isInvoiceOverdue,
} from '../lib/financeUtils.js';

// ─── Outstanding banner ───────────────────────────────────────────────────────

function OutstandingBanner({
  total, hasOverdue, unpaidCount,
}: { total: number; hasOverdue: boolean; unpaidCount: number }) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border px-4 py-3',
      hasOverdue
        ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/50'
        : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50',
    )}>
      <AlertTriangle className={cn(
        'w-4 h-4 shrink-0',
        hasOverdue ? 'text-red-500' : 'text-amber-500',
      )} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-semibold',
          hasOverdue
            ? 'text-red-700 dark:text-red-400'
            : 'text-amber-700 dark:text-amber-400',
        )}>
          Utestående belopp
        </p>
        <p className="text-xs text-muted-foreground">
          {unpaidCount} obetald{unpaidCount !== 1 ? 'a' : ''} faktura{unpaidCount !== 1 ? 'r' : ''}
          {hasOverdue && ' — varav förfallen'}
        </p>
      </div>
      <span className={cn(
        'font-mono font-bold text-base tabular-nums shrink-0',
        hasOverdue
          ? 'text-red-700 dark:text-red-400'
          : 'text-amber-700 dark:text-amber-400',
      )}>
        {formatCurrency(total)}
      </span>
    </div>
  );
}

// ─── Wallet section ───────────────────────────────────────────────────────────

function WalletSection({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentWallet(studentId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-4 bg-muted rounded animate-pulse w-16" />
            <div className="h-5 bg-muted rounded animate-pulse w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.balances.length === 0) {
    return <p className="text-sm text-muted-foreground">Inga krediter registrerade</p>;
  }

  return (
    <div className="space-y-1.5">
      {data.balances.map((b) => (
        <div key={b.lesson_category} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-mono uppercase text-xs tracking-wide">
            {b.lesson_category}
          </span>
          <Badge variant="outline" className="font-mono font-semibold">
            {b.balance} kredit{b.balance !== 1 ? 'er' : ''}
          </Badge>
        </div>
      ))}
      <div className="flex items-center justify-between text-sm pt-1 border-t border-border mt-2">
        <span className="text-muted-foreground">Totalt</span>
        <span className="font-semibold">{data.total_credits} krediter</span>
      </div>
    </div>
  );
}

// ─── Packages section ─────────────────────────────────────────────────────────

function PackagesSection({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentPackages(studentId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <div className="h-4 bg-muted rounded animate-pulse w-28" />
              <div className="h-4 bg-muted rounded animate-pulse w-14" />
            </div>
            <div className="h-1.5 bg-muted rounded-full animate-pulse" />
            <div className="h-3 bg-muted rounded animate-pulse w-36" />
          </div>
        ))}
      </div>
    );
  }

  const packages = data?.data ?? [];

  if (packages.length === 0) {
    return <p className="text-sm text-muted-foreground">Inga aktiva paket</p>;
  }

  const now = Date.now();

  return (
    <div className="space-y-3">
      {packages.slice(0, 3).map((pkg) => {
        const remaining = pkg.quantity_granted - pkg.quantity_consumed - pkg.quantity_expired;
        const pct = pkg.quantity_granted > 0
          ? Math.round((pkg.quantity_consumed / pkg.quantity_granted) * 100)
          : 0;
        const daysUntilExpiry = pkg.expires_at
          ? Math.ceil((new Date(pkg.expires_at).getTime() - now) / 86_400_000)
          : null;
        const expiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry > 0;

        return (
          <div key={pkg.id} className="text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-foreground font-medium truncate max-w-[180px]">
                {pkg.quantity_granted} lektioner
              </span>
              <span className="text-xs text-muted-foreground">{pct}% använt</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{remaining} kvar av {pkg.quantity_granted}</span>
              {pkg.expires_at && (
                <span className={cn(expiringSoon && 'text-amber-600 dark:text-amber-400 font-medium')}>
                  {expiringSoon
                    ? `Utgår om ${daysUntilExpiry} dag${daysUntilExpiry !== 1 ? 'ar' : ''}`
                    : `Utgår ${formatDate(pkg.expires_at)}`}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Invoice section ──────────────────────────────────────────────────────────

function InvoicesSection({
  invoices, isLoading, totalCount, studentId, payments: _payments, onRefund,
}: {
  invoices:   Invoice[];
  isLoading:  boolean;
  totalCount: number;
  studentId:  string;
  payments:   Payment[];
  onRefund:   (invoice: Invoice) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <div className="h-5 bg-muted rounded animate-pulse w-14" />
              <div className="h-4 bg-muted rounded animate-pulse w-20" />
            </div>
            <div className="h-4 bg-muted rounded animate-pulse w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">Inga fakturor</p>;
  }

  const refundableStatuses = new Set(['paid', 'partially_paid']);

  return (
    <div className="space-y-0">
      {invoices.slice(0, 5).map((inv) => {
        const overdue         = isInvoiceOverdue(inv.due_date, inv.status);
        const showOutstanding = inv.outstanding_amount > 0 && inv.outstanding_amount < inv.total_amount;
        const canRefund       = refundableStatuses.has(inv.status);

        return (
          <div
            key={inv.id}
            className={cn(
              'py-2 border-b border-border last:border-0',
              overdue && 'bg-red-50/50 dark:bg-red-950/10 -mx-1 px-1 rounded',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <InvoiceStatusBadge status={inv.status} className="shrink-0" />
                <Link
                  to={`/finance/invoices/${inv.id}`}
                  className="text-sm text-primary hover:underline truncate"
                >
                  {inv.invoice_number ?? 'Utkast'}
                </Link>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-mono text-muted-foreground">
                  {formatCurrency(inv.total_amount, inv.currency)}
                </span>
                {canRefund && (
                  <PermissionGate permission={Permissions.FINANCE_REFUND_CREATE}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => onRefund(inv)}
                      title="Återbetala"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  </PermissionGate>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>
                {inv.due_date
                  ? <>Förfall {formatDate(inv.due_date)}{overdue && <span className="text-red-500 font-medium ml-1">— förfallen</span>}</>
                  : 'Inget förfallodatum'}
              </span>
              {showOutstanding && (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Kvar: {formatCurrency(inv.outstanding_amount, inv.currency)}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {totalCount > 5 && (
        <Link
          to={`/finance/invoices?student_id=${studentId}`}
          className="text-xs text-primary hover:underline block pt-2"
        >
          Visa alla {totalCount} fakturor
        </Link>
      )}
      {totalCount <= 5 && totalCount > 0 && (
        <Link
          to={`/finance/invoices?student_id=${studentId}`}
          className="text-xs text-primary hover:underline block pt-2"
        >
          Visa alla fakturor
        </Link>
      )}
    </div>
  );
}

// ─── Payments section ─────────────────────────────────────────────────────────

function RecentPaymentsSection({ studentId }: { studentId: string }) {
  const { data, isLoading } = usePaymentList({ student_id: studentId, per_page: 5 });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <div className="h-5 bg-muted rounded animate-pulse w-16" />
              <div className="h-4 bg-muted rounded animate-pulse w-16" />
            </div>
            <div className="h-4 bg-muted rounded animate-pulse w-16" />
          </div>
        ))}
      </div>
    );
  }

  const payments: Payment[] = data?.data ?? [];

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">Inga registrerade betalningar</p>;
  }

  return (
    <div className="space-y-0">
      {payments.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <PaymentStatusBadge status={p.status} />
            <span className="text-xs text-muted-foreground">{paymentMethodLabel(p.payment_method)}</span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-sm font-mono">{formatCurrency(p.amount, p.currency)}</span>
            <p className="text-[10px] text-muted-foreground">{formatDate(p.paid_at ?? p.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Refunds history section ──────────────────────────────────────────────────

function RefundsSection({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentRefunds(studentId);
  const refunds = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <div className="h-4 bg-muted rounded animate-pulse w-28" />
            <div className="h-4 bg-muted rounded animate-pulse w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (refunds.length === 0) {
    return <p className="text-sm text-muted-foreground">Inga återbetalningar registrerade</p>;
  }

  return (
    <div className="space-y-0">
      {refunds.slice(0, 5).map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0 text-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                r.refund_status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : r.refund_status === 'failed'  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                :                                 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
              )}>
                {r.refund_status === 'completed' ? 'Genomförd' : r.refund_status === 'failed' ? 'Misslyckad' : 'Väntar'}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                {r.notes ?? (r.reason_code === 'student_cancellation' ? 'Elevavbokning' : r.reason_code)}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            {r.refund_amount > 0 && (
              <p className="font-mono font-semibold text-red-600 dark:text-red-400 text-xs">
                −{formatCurrency(r.refund_amount)}
              </p>
            )}
            {r.credit_quantity > 0 && (
              <p className="text-[10px] text-muted-foreground">{r.credit_quantity} kred.</p>
            )}
            <p className="text-[10px] text-muted-foreground">{formatDate(r.processed_at ?? r.created_at)}</p>
          </div>
        </div>
      ))}
      {(data?.meta.total ?? 0) > 5 && (
        <Link to="/finance/refunds" className="text-xs text-primary hover:underline block pt-2">
          Visa alla återbetalningar →
        </Link>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
}

export function StudentFinancePanel({ studentId }: Props) {
  const invoiceQuery    = useInvoiceList({ student_id: studentId, status: 'all', per_page: 25 });
  const paymentsQuery   = usePaymentList({ student_id: studentId, per_page: 50 });
  const invoices        = invoiceQuery.data?.data ?? [];
  const totalInvoices   = invoiceQuery.data?.meta.total ?? 0;
  const allPayments: Payment[] = paymentsQuery.data?.data ?? [];

  const unpaid           = invoices.filter((i) => i.status === 'issued' || i.status === 'overdue' || i.status === 'partially_paid');
  const totalOutstanding = unpaid.reduce((s, i) => s + i.outstanding_amount, 0);
  const hasOverdue       = unpaid.some((i) => i.status === 'overdue');

  const [refundInvoice, setRefundInvoice] = useState<Invoice | null>(null);
  const refundPayments = refundInvoice
    ? allPayments.filter(p => p.invoice_id === refundInvoice.id)
    : [];

  return (
    <div className="space-y-4">

      <PermissionGate permission={Permissions.FINANCE_INVOICE_READ}>
        {!invoiceQuery.isLoading && totalOutstanding > 0 && (
          <OutstandingBanner
            total={totalOutstanding}
            hasOverdue={hasOverdue}
            unpaidCount={unpaid.length}
          />
        )}
      </PermissionGate>

      <PermissionGate permission={Permissions.FINANCE_PAYMENT_READ}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              Kredit & saldo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WalletSection studentId={studentId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              Aktiva paket
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PackagesSection studentId={studentId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              Senaste betalningar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecentPaymentsSection studentId={studentId} />
          </CardContent>
        </Card>
      </PermissionGate>

      <PermissionGate permission={Permissions.FINANCE_INVOICE_READ}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Fakturor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InvoicesSection
              invoices={invoices}
              isLoading={invoiceQuery.isLoading}
              totalCount={totalInvoices}
              studentId={studentId}
              payments={allPayments}
              onRefund={setRefundInvoice}
            />
          </CardContent>
        </Card>
      </PermissionGate>

      <PermissionGate permission={Permissions.FINANCE_REFUND_READ}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
              Återbetalningar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RefundsSection studentId={studentId} />
          </CardContent>
        </Card>
      </PermissionGate>

      <RefundDialog
        invoice={refundInvoice}
        payments={refundPayments}
        open={refundInvoice !== null}
        onClose={() => setRefundInvoice(null)}
      />

    </div>
  );
}
