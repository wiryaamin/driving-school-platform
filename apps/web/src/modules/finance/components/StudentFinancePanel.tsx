import { Link } from 'react-router-dom';
import {
  Badge, Card, CardContent, CardHeader, CardTitle,
} from '@platform/ui';
import { Wallet, Package, FileText } from 'lucide-react';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useStudentWallet, useStudentPackages, useInvoiceList } from '../hooks/useFinance.js';
import { InvoiceStatusBadge } from './InvoiceStatusBadge.js';
import { formatCurrency, formatDate } from '../lib/financeUtils.js';

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

  return (
    <div className="space-y-2">
      {packages.slice(0, 3).map((pkg) => {
        const remaining = pkg.quantity_granted - pkg.quantity_consumed - pkg.quantity_expired;
        const pct = pkg.quantity_granted > 0
          ? Math.round(((pkg.quantity_consumed) / pkg.quantity_granted) * 100)
          : 0;
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
                <span>Utgår {formatDate(pkg.expires_at)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Recent invoices section ──────────────────────────────────────────────────

function RecentInvoicesSection({ studentId }: { studentId: string }) {
  const { data, isLoading } = useInvoiceList({ student_id: studentId, per_page: 5 });

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

  const invoices = data?.data ?? [];

  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">Inga fakturor</p>;
  }

  return (
    <div className="space-y-1.5">
      {invoices.map((inv) => (
        <div key={inv.id} className="flex items-center justify-between gap-2 py-1 border-b border-border last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <InvoiceStatusBadge status={inv.status} className="shrink-0" />
            <Link
              to={`/finance/invoices/${inv.id}`}
              className="text-sm text-primary hover:underline truncate"
            >
              {inv.invoice_number ?? 'Utkast'}
            </Link>
          </div>
          <span className="text-sm font-mono text-muted-foreground shrink-0">
            {formatCurrency(inv.total_amount, inv.currency)}
          </span>
        </div>
      ))}
      <Link
        to={`/finance/invoices?student_id=${studentId}`}
        className="text-xs text-primary hover:underline block pt-1"
      >
        Visa alla fakturor
      </Link>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
}

export function StudentFinancePanel({ studentId }: Props) {
  return (
    <>
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
            <RecentInvoicesSection studentId={studentId} />
          </CardContent>
        </Card>
      </PermissionGate>
    </>
  );
}
