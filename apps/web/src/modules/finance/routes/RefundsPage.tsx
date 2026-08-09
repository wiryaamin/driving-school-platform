import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertCircle, RotateCcw, CheckCircle2, Clock, XCircle, Filter, BookOpen } from 'lucide-react';
import {
  Button,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Badge,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { formatCurrency, formatDate, formatDateTime } from '../lib/financeUtils.js';
import { useRefunds, type Refund, type RefundStatus, type RefundType, type RefundReasonCode } from '../hooks/useRefunds.js';
import { usePostRefundJournalEntry } from '../hooks/useLedger.js';

// ─── Label maps ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RefundStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:    { label: 'Väntar',     color: 'bg-gray-100 text-gray-600',     icon: Clock        },
  processing: { label: 'Behandlas',  color: 'bg-blue-100 text-blue-700',     icon: Loader2      },
  completed:  { label: 'Genomförd',  color: 'bg-green-100 text-green-700',   icon: CheckCircle2 },
  failed:     { label: 'Misslyckad', color: 'bg-red-100 text-red-700',       icon: XCircle      },
  cancelled:  { label: 'Avbruten',   color: 'bg-gray-100 text-gray-500',     icon: XCircle      },
};

const TYPE_LABELS: Record<RefundType, string> = {
  full:         'Full återbetalning',
  partial:      'Delåterbetalning',
  credit_only:  'Kreditreversal',
  payment_only: 'Monetär återbetalning',
};

const REASON_LABELS: Record<RefundReasonCode, string> = {
  duplicate_payment:    'Dubbel betalning',
  student_cancellation: 'Elevavbokning',
  administrative_error: 'Administrativt fel',
  service_failure:      'Tjänsten levererades ej',
  goodwill:             'Goodwill',
  fraud_prevention:     'Bedrägerihantering',
  partial_adjustment:   'Prisjustering',
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-600', icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Refund row ───────────────────────────────────────────────────────────────

function RefundRow({ refund }: { refund: Refund }) {
  const hasMonetary = refund.refund_amount > 0;
  const hasCredits  = refund.credit_quantity > 0;
  const canPost     = refund.refund_status === 'completed' && hasMonetary;

  const [posted, setPosted] = useState(false);
  const postEntry = usePostRefundJournalEntry();

  async function handlePost() {
    try {
      await postEntry.mutateAsync(refund.id);
      setPosted(true);
      toast({ title: 'Bokfört i huvudboken', description: 'Verifikat skapat för återbetalningen.' });
    } catch (e) {
      toast({ title: 'Kunde inte bokföra', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <div className="flex items-start gap-4 px-5 py-4 border-b last:border-0 hover:bg-muted/20 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <RotateCcw className="w-4 h-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <RefundStatusBadge status={refund.refund_status} />
          <span className="text-xs text-muted-foreground">{TYPE_LABELS[refund.refund_type] ?? refund.refund_type}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{REASON_LABELS[refund.reason_code] ?? refund.reason_code}</span>
        </div>

        <div className="flex items-center gap-4 text-sm flex-wrap">
          {hasMonetary && (
            <span className="font-mono font-semibold text-red-600 dark:text-red-400">
              −{formatCurrency(refund.refund_amount)}
            </span>
          )}
          {hasCredits && (
            <Badge variant="outline" className="text-xs">
              {refund.credit_quantity} kredit{refund.credit_quantity !== 1 ? 'er' : ''} återförda
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <Link
            to={`/finance/invoices/${refund.invoice_id}`}
            className="hover:text-primary hover:underline transition-colors"
          >
            Faktura →
          </Link>
          {refund.notes && <span className="italic truncate max-w-[240px]">{refund.notes}</span>}
          {refund.failed_reason && (
            <span className="text-red-600 dark:text-red-400">Fel: {refund.failed_reason}</span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0 space-y-1.5">
        <p className="text-xs text-muted-foreground">
          {formatDate(refund.processed_at ?? refund.created_at)}
        </p>
        {refund.processed_at && refund.refund_status === 'completed' && (
          <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
            {formatDateTime(refund.processed_at)}
          </p>
        )}
        {canPost && (
          <PermissionGate permission={Permissions.FINANCE_LEDGER_MANAGE}>
            {posted ? (
              <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">
                Bokförd
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={postEntry.isPending}
                onClick={() => void handlePost()}
              >
                {postEntry.isPending
                  ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  : <BookOpen className="w-3 h-3 mr-1" />}
                Bokför
              </Button>
            )}
          </PermissionGate>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function RefundsPage() {
  const [statusFilter, setStatusFilter] = useState<RefundStatus | 'all'>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useRefunds({
    status:   statusFilter,
    page,
    per_page: 25,
  });

  const refunds    = data?.data ?? [];
  const total      = data?.meta.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  const stats = {
    completed: refunds.filter(r => r.refund_status === 'completed').length,
    pending:   refunds.filter(r => r.refund_status === 'pending' || r.refund_status === 'processing').length,
    totalRefunded: refunds
      .filter(r => r.refund_status === 'completed')
      .reduce((s, r) => s + r.refund_amount, 0),
  };

  return (
    <PageLayout>
      <PageHeader
        title="Återbetalningar"
        description="Historik och status för alla återbetalningar"
        breadcrumbs={[{ label: 'Hem' }, { label: 'Ekonomi', href: '/finance' }, { label: 'Återbetalningar' }]}
      />

      <PageContent>
        <PermissionGate
          permission={Permissions.FINANCE_REFUND_READ}
          fallback={
            <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Du saknar behörighet att se återbetalningar (finance:refund:read).</p>
            </div>
          }
        >
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Totalt återbetalt',  value: formatCurrency(stats.totalRefunded), icon: RotateCcw,   color: 'text-red-600'   },
              { label: 'Genomförda',          value: String(stats.completed),             icon: CheckCircle2, color: 'text-green-600' },
              { label: 'Väntar/Behandlas',   value: String(stats.pending),              icon: Clock,        color: stats.pending > 0 ? 'text-amber-600' : 'text-muted-foreground' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v as RefundStatus | 'all'); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla statusar</SelectItem>
                {(Object.entries(STATUS_CONFIG) as [RefundStatus, (typeof STATUS_CONFIG)[RefundStatus]][]).map(([v, c]) => (
                  <SelectItem key={v} value={v}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {total > 0 && (
              <p className="text-sm text-muted-foreground ml-auto">{total} återbetalning{total !== 1 ? 'ar' : ''}</p>
            )}
          </div>

          {/* List */}
          {isError ? (
            <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Kunde inte hämta återbetalningar.</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Hämtar återbetalningar…</span>
            </div>
          ) : refunds.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
                <RotateCcw className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold">Inga återbetalningar</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {statusFilter !== 'all'
                    ? `Inga återbetalningar med status "${STATUS_CONFIG[statusFilter]?.label ?? statusFilter}".`
                    : 'Återbetalningar initieras från en elevs fakturavy.'}
                </p>
              </div>
              <Link
                to="/finance/invoices"
                className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border bg-background hover:bg-accent transition-colors"
              >
                Gå till fakturor
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              {refunds.map(r => <RefundRow key={r.id} refund={r} />)}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Föregående
              </Button>
              <span className="text-sm text-muted-foreground">Sida {page} av {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Nästa
              </Button>
            </div>
          )}
        </PermissionGate>
      </PageContent>
    </PageLayout>
  );
}
