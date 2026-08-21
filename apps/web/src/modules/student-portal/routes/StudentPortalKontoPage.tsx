import { useState, useEffect, useRef } from 'react';
import {
  User, Mail, Phone, AlertCircle, FileText, CheckCircle, Clock,
  AlertTriangle, Smartphone, Bell, Download, Printer, X, CreditCard,
  Loader2, Package,
} from 'lucide-react';
import {
  usePortalBalance, usePortalMe, usePortalOrg,
  usePortalRecordSwishInitiated, usePortalCreateStripeCheckout, usePortalCreateNetsCheckout,
  usePortalPaymentRequest, usePortalPackages, useUpdateNotificationPrefs,
} from '../hooks/useStudentPortal.js';
import { usePortalSession } from './StudentPortalLayout.js';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSek(sek: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(sek);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked, onChange, label, description,
}: {
  checked:     boolean;
  onChange:    (v: boolean) => void;
  label:       string;
  description?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 py-3 text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
        {description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className={cn(
        'relative shrink-0 w-11 h-6 rounded-full transition-colors',
        checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
      )}>
        <span className={cn(
          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )} />
      </div>
    </button>
  );
}

// ─── Invoice status ───────────────────────────────────────────────────────────

type InvoiceData = {
  id:             string;
  invoice_number: string | null;
  total_sek:      number;
  status:         string;
  issued_at:      string;
  due_date:       string | null;
};

const INVOICE_STATUS: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  draft:           { label: 'Utkast',        cls: 'text-gray-400',   Icon: Clock          },
  issued:          { label: 'Obetald',       cls: 'text-amber-600',  Icon: AlertTriangle  },
  paid:            { label: 'Betald',        cls: 'text-green-600',  Icon: CheckCircle    },
  partially_paid:  { label: 'Delvis betald', cls: 'text-amber-600',  Icon: AlertTriangle  },
  overdue:         { label: 'Förfallen',     cls: 'text-red-600',    Icon: AlertTriangle  },
  void:            { label: 'Makulerad',     cls: 'text-gray-400',   Icon: Clock          },
};

// ─── Invoice detail sheet ─────────────────────────────────────────────────────

function InvoiceDetailSheet({
  invoice,
  orgName,
  onClose,
}: {
  invoice: InvoiceData;
  orgName: string;
  onClose: () => void;
}) {
  const cfg = INVOICE_STATUS[invoice.status] ?? { label: invoice.status, cls: 'text-gray-400', Icon: Clock };
  const { Icon } = cfg;
  const number = invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Faktura {number}</h2>
        <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Invoice body */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Amount block */}
        <div className="text-center py-6">
          <p className="text-4xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatSek(invoice.total_sek)}
          </p>
          <div className={cn('flex items-center justify-center gap-1.5 mt-2', cfg.cls)}>
            <Icon className="w-4 h-4" />
            <span className="text-sm font-semibold">{cfg.label}</span>
          </div>
        </div>

        {/* Details */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          {[
            { label: 'Fakturanummer', value: number },
            { label: 'Från',         value: orgName },
            { label: 'Utfärdad',     value: formatDate(invoice.issued_at) },
            { label: 'Förfaller',    value: formatDate(invoice.due_date) },
          ].map(row => (
            <div
              key={row.label}
              className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
            >
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">{row.label}</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{row.value}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
          Kontakta {orgName} om du har frågor om denna faktura.
        </p>
      </div>

      {/* Print button */}
      <div className="px-4 pb-6 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
        <button
          onClick={() => window.print()}
          className="w-full py-3.5 bg-gray-800 hover:bg-gray-900 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          <Printer className="w-4 h-4" />
          Skriv ut / Spara som PDF
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Stäng
        </button>
      </div>
    </div>
  );
}

// ─── Invoice row ──────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice, onDownload,
}: {
  invoice:    InvoiceData;
  onDownload: () => void;
}) {
  const cfg = INVOICE_STATUS[invoice.status] ?? { label: invoice.status, cls: 'text-gray-400', Icon: Clock };
  const { Icon } = cfg;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <div className={cn('shrink-0', cfg.cls)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {formatDate(invoice.issued_at)}
          {invoice.due_date ? ` · Förfaller ${formatDate(invoice.due_date)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatSek(invoice.total_sek)}
          </p>
          <p className={cn('text-[10px] font-semibold', cfg.cls)}>{cfg.label}</p>
        </div>
        <button
          onClick={onDownload}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Visa faktura"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Swish payment section ────────────────────────────────────────────────────

function buildSwishUrl(swishNumber: string, amountSek: number, invoiceNumber: string | null): string {
  const payload = {
    version: 1,
    payee:   { value: swishNumber.replace(/\D/g, ''), editable: false },
    amount:  { value: Math.round(amountSek), editable: false },
    message: { value: `Faktura ${invoiceNumber ?? ''}`.trim(), editable: true },
  };
  return `swish://payment?data=${encodeURIComponent(JSON.stringify(payload))}`;
}

function SwishSection({
  swishNum,
  unpaidInvs,
}: {
  swishNum:   string;
  unpaidInvs: InvoiceData[];
}) {
  const recordSwish = usePortalRecordSwishInitiated();

  function handleSwishClick(inv: InvoiceData) {
    // Fire-and-forget — record intent, then open deeplink
    recordSwish.mutate(inv.id);
    window.location.href = buildSwishUrl(swishNum, inv.total_sek, inv.invoice_number);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50 dark:border-gray-800">
        <Smartphone className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Betala med Swish</h2>
      </div>
      <div className="px-5 py-4 space-y-3">
        {unpaidInvs.slice(0, 3).map(inv => (
          <button
            key={inv.id}
            onClick={() => handleSwishClick(inv)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#6AB5A1]/10 border border-[#6AB5A1]/30 hover:bg-[#6AB5A1]/20 active:scale-[0.99] transition-all text-left"
          >
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {inv.invoice_number ?? `#${inv.id.slice(0, 8)}`}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {inv.status === 'overdue' ? 'Förfallen — ' : ''}{formatSek(inv.total_sek)}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <circle cx="12" cy="12" r="11" stroke="#6AB5A1" strokeWidth="2" />
                <path d="M7 12.5c0-2.485 2.015-4.5 4.5-4.5a4.5 4.5 0 0 1 3.75 2" stroke="#6AB5A1" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M17 11.5c0 2.485-2.015 4.5-4.5 4.5a4.5 4.5 0 0 1-3.75-2" stroke="#6AB5A1" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-xs font-semibold text-[#4a9e8a]">Öppna Swish</span>
            </div>
          </button>
        ))}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
          Tryck för att öppna Swish-appen med ifyllt belopp
        </p>
      </div>
    </div>
  );
}

// ─── Stripe card payment section ──────────────────────────────────────────────

function StripeSection({ unpaidInvs }: { unpaidInvs: InvoiceData[] }) {
  const createCheckout                    = usePortalCreateStripeCheckout();
  const [loadingInvoiceId, setLoadingId]  = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  async function handleCardPay(inv: InvoiceData) {
    setLoadingId(inv.id);
    setError(null);
    try {
      const result = await createCheckout.mutateAsync(inv.id);
      // Redirect to Stripe Checkout page
      window.location.href = result.session_url;
    } catch (e) {
      setError((e as Error).message ?? 'Betalning misslyckades. Försök igen.');
      setLoadingId(null);
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50 dark:border-gray-800">
        <CreditCard className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Betala med kort</h2>
      </div>
      <div className="px-5 py-4 space-y-3">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        {unpaidInvs.slice(0, 3).map(inv => {
          const isLoading = loadingInvoiceId === inv.id;
          return (
            <button
              key={inv.id}
              onClick={() => void handleCardPay(inv)}
              disabled={loadingInvoiceId !== null}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-left"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {inv.invoice_number ?? `#${inv.id.slice(0, 8)}`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {inv.status === 'overdue' ? 'Förfallen — ' : ''}{formatSek(inv.total_sek)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isLoading
                  ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  : <CreditCard className="w-4 h-4 text-blue-500" />
                }
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {isLoading ? 'Öppnar...' : 'Betala'}
                </span>
              </div>
            </button>
          );
        })}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
          Säker kortbetalning via Stripe · Visa, Mastercard
        </p>
      </div>
    </div>
  );
}

// ─── Nets card payment section ─────────────────────────────────────────────────

function NetsSection({ unpaidInvs }: { unpaidInvs: InvoiceData[] }) {
  const createCheckout                    = usePortalCreateNetsCheckout();
  const [loadingInvoiceId, setLoadingId]  = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  async function handleCardPay(inv: InvoiceData) {
    setLoadingId(inv.id);
    setError(null);
    try {
      const result = await createCheckout.mutateAsync(inv.id);
      // Redirect to Nets hosted payment page
      window.location.href = result.session_url;
    } catch (e) {
      setError((e as Error).message ?? 'Betalning misslyckades. Försök igen.');
      setLoadingId(null);
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50 dark:border-gray-800">
        <CreditCard className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Betala med kort (Nets)</h2>
      </div>
      <div className="px-5 py-4 space-y-3">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        {unpaidInvs.slice(0, 3).map(inv => {
          const isLoading = loadingInvoiceId === inv.id;
          return (
            <button
              key={inv.id}
              onClick={() => void handleCardPay(inv)}
              disabled={loadingInvoiceId !== null}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-left"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {inv.invoice_number ?? `#${inv.id.slice(0, 8)}`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {inv.status === 'overdue' ? 'Förfallen — ' : ''}{formatSek(inv.total_sek)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isLoading
                  ? <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                  : <CreditCard className="w-4 h-4 text-purple-500" />
                }
                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                  {isLoading ? 'Öppnar...' : 'Betala'}
                </span>
              </div>
            </button>
          );
        })}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
          Säker kortbetalning via Nets Easy
        </p>
      </div>
    </div>
  );
}

// ─── Payment return banner (shown when returning from Stripe) ─────────────────

function PaymentReturnBanner() {
  const searchParams   = new URLSearchParams(window.location.search);
  const paymentStatus  = searchParams.get('payment');
  const prId           = searchParams.get('req');
  const qc             = useQueryClient();
  const [show, setShow] = useState(Boolean(paymentStatus));

  // Poll payment request status if we have an ID (catches success before webhook fires)
  const { data: pr } = usePortalPaymentRequest(
    paymentStatus === 'success' ? (prId ?? null) : null,
  );

  // When payment_request confirms completed, refresh the balance
  const balanceRefreshed = useRef(false);
  useEffect(() => {
    if (pr?.status === 'completed' && !balanceRefreshed.current) {
      balanceRefreshed.current = true;
      void qc.invalidateQueries({ queryKey: ['portal', 'balance'] });
    }
  }, [pr?.status, qc]);

  // Clean up URL params without triggering navigation
  useEffect(() => {
    if (paymentStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      url.searchParams.delete('req');
      window.history.replaceState({}, '', url.toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null;

  if (paymentStatus === 'success') {
    const isConfirmed = pr?.status === 'completed';
    return (
      <div className={cn(
        'rounded-2xl border p-4 flex items-start gap-3',
        isConfirmed
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      )}>
        {isConfirmed
          ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          : <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 animate-spin" />
        }
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', isConfirmed ? 'text-green-800 dark:text-green-300' : 'text-blue-800 dark:text-blue-300')}>
            {isConfirmed ? 'Betalning bekräftad!' : 'Betalning mottagen — behandlas...'}
          </p>
          <p className={cn('text-xs mt-0.5', isConfirmed ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400')}>
            {isConfirmed
              ? 'Fakturan är nu markerad som betald.'
              : 'Kortet debiterades. Bekräftelse skickas när bokföringen är klar (max 1 min).'}
          </p>
        </div>
        <button
          onClick={() => setShow(false)}
          className="p-1 rounded-lg text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (paymentStatus === 'cancelled') {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Betalning avbruten</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Ingen debitering skedde. Du kan försöka igen nedan.</p>
        </div>
        <button
          onClick={() => setShow(false)}
          className="p-1 rounded-lg text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
}

// ─── StudentPortalKontoPage ───────────────────────────────────────────────────

export function StudentPortalKontoPage() {
  const session = usePortalSession();
  const { data: me,       isLoading: meLoading   } = usePortalMe();
  const { data: balance,  isLoading: balLoading  } = usePortalBalance();
  const { data: packages                         } = usePortalPackages();
  const { data: org }                               = usePortalOrg();

  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const updatePrefs = useUpdateNotificationPrefs();

  const isLoading = meLoading || balLoading;
  const student   = me;

  const hasDebt    = (balance?.outstanding_sek ?? 0) > 0;
  const swishNum   = org?.swish_number ?? null;
  const unpaidInvs = balance?.recent_invoices.filter(inv => inv.status === 'issued' || inv.status === 'overdue' || inv.status === 'partially_paid') ?? [];

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Mitt konto</h1>

      {/* Payment return banner (Stripe success/cancel) */}
      <PaymentReturnBanner />

      {/* Profile card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 dark:text-gray-100 text-lg">{session.student_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{session.organization_name}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-3/4" />
          </div>
        ) : (
          <div className="space-y-2">
            {student?.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="truncate">{student.email}</span>
              </div>
            )}
            {student?.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                <span>{student.phone}</span>
              </div>
            )}
            {student?.target_licence_category && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                  {student.target_licence_category.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Balance card */}
      <div className={cn(
        'rounded-2xl border p-5',
        hasDebt
          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
          : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
      )}>
        <div className="flex items-start gap-3">
          {hasDebt
            ? <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            : <CheckCircle  className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          }
          <div>
            <p className={cn('font-bold text-lg tabular-nums', hasDebt ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300')}>
              {balLoading ? '…' : formatSek(balance?.outstanding_sek ?? 0)}
            </p>
            <p className={cn('text-sm', hasDebt ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400')}>
              {hasDebt ? 'Utestående belopp' : 'Inga utestående belopp'}
            </p>
          </div>
        </div>
      </div>

      {/* Lesson packages */}
      {packages && packages.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50 dark:border-gray-800">
            <Package className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Dina paket</h2>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {packages.map(pkg => {
              const pct = pkg.quantity_granted > 0
                ? Math.round((pkg.quantity_consumed / pkg.quantity_granted) * 100)
                : 0;
              const isExhausted = pkg.quantity_remaining <= 0;
              const isExpired   = pkg.expires_at ? new Date(pkg.expires_at) < new Date() : false;
              return (
                <div key={pkg.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{pkg.name}</p>
                      {pkg.category && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">{pkg.category}</p>
                      )}
                    </div>
                    <span className={cn(
                      'text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0',
                      isExhausted || isExpired
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                        : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                    )}>
                      {isExhausted ? 'Förbrukad' : isExpired ? 'Utgånget' : `${pkg.quantity_remaining} kvar`}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', isExhausted ? 'bg-gray-300' : 'bg-blue-500')}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    {pkg.quantity_consumed} av {pkg.quantity_granted} lektioner genomförda
                    {pkg.expires_at && ` · Giltig till ${formatDate(pkg.expires_at)}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoices */}
      {!balLoading && balance && balance.recent_invoices.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50 dark:border-gray-800">
            <FileText className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Senaste fakturor</h2>
          </div>
          <div className="px-5">
            {balance.recent_invoices.map(inv => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                onDownload={() => setSelectedInvoice(inv)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Payment options — shown only when there are unpaid invoices */}
      {!balLoading && hasDebt && unpaidInvs.length > 0 && (
        <>
          {swishNum && (
            <SwishSection swishNum={swishNum} unpaidInvs={unpaidInvs} />
          )}
          <StripeSection unpaidInvs={unpaidInvs} />
          <NetsSection unpaidInvs={unpaidInvs} />
        </>
      )}

      {/* Contact school */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-900/50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Behöver du hjälp?</p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Kontakta {session.organization_name} direkt om du har frågor om din utbildning eller ekonomi.
            </p>
            {org?.contact_phone && (
              <a
                href={`tel:${org.contact_phone}`}
                className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline"
              >
                <Phone className="w-4 h-4 shrink-0" />
                {org.contact_phone}
              </a>
            )}
            {org?.contact_email && (
              <a
                href={`mailto:${org.contact_email}`}
                className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline min-w-0"
              >
                <Mail className="w-4 h-4 shrink-0" />
                <span className="truncate">{org.contact_email}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Notification preferences */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50 dark:border-gray-800">
          <Bell className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Aviseringar</h2>
        </div>
        <div className="px-5 divide-y divide-gray-50 dark:divide-gray-800">
          <Toggle
            checked={student?.communication_opt_in_email ?? true}
            onChange={v => updatePrefs.mutate({ communication_opt_in_email: v })}
            label="E-postnotiser"
            description="Bokningsbekräftelser och påminnelser via e-post"
          />
          <Toggle
            checked={student?.communication_opt_in_sms ?? true}
            onChange={v => updatePrefs.mutate({ communication_opt_in_sms: v })}
            label="SMS-notiser"
            description="Kräver att skolan har aktiverat SMS-utskick"
          />
        </div>
      </div>

      {/* Invoice detail sheet */}
      {selectedInvoice && (
        <InvoiceDetailSheet
          invoice={selectedInvoice}
          orgName={session.organization_name}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
