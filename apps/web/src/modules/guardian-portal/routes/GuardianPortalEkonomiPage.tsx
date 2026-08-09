import { useState } from 'react';
import { CreditCard, AlertCircle, CheckCircle2, Clock, Lock, Package, Phone, Mail, Loader2 } from 'lucide-react';
import {
  useGuardianMe, useGuardianBalance, useGuardianProgress,
  useGuardianRequestCheckout, getStoredGuardianSession,
} from '../hooks/useGuardianPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#2D5BE3';

function formatSEK(n: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'overdue') {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">Förfallen</span>;
  }
  if (status === 'paid') {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">Betald</span>;
  }
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Obetald</span>;
}

// ─── Pay now ──────────────────────────────────────────────────────────────────
// Creates a real Stripe Checkout session for this invoice (guardian-portal's
// own POST /payments/stripe/checkout, mirroring the already-working
// student-portal flow) and redirects to it. Closes the gap flagged in the
// Business Workflow Execution Audit (2026-08-07): the Ekonomi tab's can_pay
// gate existed but nothing behind it let a guardian actually pay — every
// invoice dead-ended to "kontakta skolan för betalning".
function PayNowButton({ invoiceId }: { invoiceId: string }) {
  const checkout = useGuardianRequestCheckout();
  const [error, setError] = useState<string | null>(null);
  const isDemo = getStoredGuardianSession()?.token === 'demo';

  function handleClick() {
    setError(null);
    checkout.mutate(invoiceId, {
      onSuccess: (result) => { window.location.href = result.session_url; },
      onError:   (e) => setError(e instanceof Error ? e.message : 'Betalning misslyckades. Försök igen.'),
    });
  }

  if (isDemo) return null;

  return (
    <div className="pt-1">
      <button
        onClick={handleClick}
        disabled={checkout.isPending}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-70"
        style={{ backgroundColor: BRAND }}
      >
        {checkout.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
        Betala nu med kort
      </button>
      {error && <p className="text-xs text-red-600 mt-1.5 text-center">{error}</p>}
    </div>
  );
}

export function GuardianPortalEkonomiPage() {
  const { data: me }       = useGuardianMe();
  const { data: progress } = useGuardianProgress();
  const { data: balance, isLoading, isError } = useGuardianBalance();

  const canPay = me?.guardian.can_pay ?? true;

  if (!canPay) {
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: BRAND }}>Ekonomi</p>
        <div className="flex items-center gap-3 p-5 bg-gray-50 rounded-2xl border border-gray-200">
          <Lock className="w-5 h-5 text-gray-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-700">Ingen behörighet</p>
            <p className="text-xs text-gray-500 mt-0.5">Du har inte åtkomst till betalningsinformation.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (isError || !balance) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        <p className="text-sm text-red-600">Kunde inte hämta kontoinformation.</p>
      </div>
    );
  }

  const hasDebt    = balance.invoices.length > 0;
  const totalOwed  = balance.invoices.reduce((s, inv) => s + inv.amount_sek, 0);
  const creditPct  = balance.balance.total_paid_sek > 0
    ? Math.min(Math.round((balance.balance.credit_used_sek / balance.balance.total_paid_sek) * 100), 100)
    : 0;

  return (
    <div className="space-y-6">

      {/* Summary */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>Ekonomisk sammanfattning</p>
        <div className={cn(
          'rounded-2xl p-5 space-y-4 border',
          hasDebt ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200',
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center',
              hasDebt ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600',
            )}>
              {hasDebt ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            </div>
            <span className={cn('text-sm font-semibold', hasDebt ? 'text-amber-800' : 'text-green-800')}>
              {hasDebt ? 'Obetalt saldo' : 'Allt är betalt'}
            </span>
          </div>

          {hasDebt && (
            <div>
              <p className="text-2xl font-bold text-amber-700">{formatSEK(totalOwed)}</p>
              <p className="text-xs text-amber-600 mt-0.5">att betala — kontakta skolan för betalning</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Totalt betalt</p>
              <p className="text-sm font-bold text-gray-900">{formatSEK(balance.balance.total_paid_sek)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Kvar på saldo</p>
              <p className="text-sm font-bold text-gray-900">{formatSEK(balance.balance.balance_sek)}</p>
            </div>
          </div>

          {/* Credit usage bar */}
          {balance.balance.total_paid_sek > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-black/10">
              <div className="flex justify-between text-xs">
                <span className={hasDebt ? 'text-amber-700' : 'text-green-700'}>Kredit förbrukad</span>
                <span className={cn('font-semibold', hasDebt ? 'text-amber-900' : 'text-green-900')}>
                  {formatSEK(balance.balance.credit_used_sek)} av {formatSEK(balance.balance.total_paid_sek)}
                </span>
              </div>
              <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    creditPct >= 90 ? 'bg-red-400' : creditPct >= 70 ? 'bg-amber-400' : 'bg-green-400',
                  )}
                  style={{ width: `${Math.max(creditPct, 2)}%` }}
                />
              </div>
              <p className={cn('text-[10px] text-right', hasDebt ? 'text-amber-700' : 'text-green-700')}>
                {creditPct}% av krediten förbrukad
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lesson summary */}
      {progress && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>Lektionsöversikt</p>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{progress.completed_count}</p>
                <p className="text-xs text-gray-500 mt-0.5">Genomförda</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{progress.upcoming_count}</p>
                <p className="text-xs text-gray-500 mt-0.5">Kommande</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Package tracking */}
      {balance.packages.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>Lektionspaket</p>
          <div className="space-y-2">
            {balance.packages.map(pkg => {
              const pct = pkg.quantity_granted > 0
                ? Math.round((pkg.quantity_consumed / pkg.quantity_granted) * 100)
                : 0;
              return (
                <div key={pkg.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-purple-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{pkg.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {pkg.quantity_consumed} av {pkg.quantity_granted} lektioner använda
                      </p>
                      {pkg.expires_at && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          Gäller till {formatDate(pkg.expires_at)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold text-gray-900 tabular-nums">{pkg.quantity_remaining}</p>
                      <p className="text-[10px] text-gray-400">kvar</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-green-400',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>{pct}% använt</span>
                      <span>{pkg.quantity_remaining} lektioner kvar</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoices */}
      {balance.invoices.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>Fakturor</p>
          <div className="space-y-3">
            {balance.invoices.map(inv => (
              <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Faktura #{inv.invoice_number}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 shrink-0" />
                      Förfaller {formatDate(inv.due_date)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-gray-900">{formatSEK(inv.amount_sek)}</p>
                    <div className="mt-0.5"><StatusBadge status={inv.status} /></div>
                  </div>
                </div>

                {/* Payment guidance */}
                <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    Betalningsinformation
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">OCR-referens</span>
                    <span className="font-mono font-semibold text-gray-900">
                      {inv.invoice_number}
                    </span>
                  </div>
                  {me?.organization.phone && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Telefon</span>
                      <a
                        href={`tel:${me.organization.phone}`}
                        className="text-blue-600 flex items-center gap-1 hover:underline"
                      >
                        <Phone className="w-3 h-3" />
                        {me.organization.phone}
                      </a>
                    </div>
                  )}
                  {me?.organization.email && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">E-post</span>
                      <a
                        href={`mailto:${me.organization.email}`}
                        className="text-blue-600 flex items-center gap-1 hover:underline"
                      >
                        <Mail className="w-3 h-3" />
                        {me.organization.email}
                      </a>
                    </div>
                  )}
                  {!me?.organization.phone && !me?.organization.email && (
                    <p className="text-xs text-gray-500">Kontakta trafikskolan för att reglera betalning.</p>
                  )}
                </div>

                {(inv.status === 'issued' || inv.status === 'overdue') && (
                  <PayNowButton invoiceId={inv.id} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
