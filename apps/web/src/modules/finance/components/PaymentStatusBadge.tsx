import { Badge } from '@platform/ui';
import type { PaymentStatus, PaymentMethod } from '../hooks/useFinance.js';
import { paymentStatusLabel, paymentMethodLabel } from '../lib/financeUtils.js';

// ─── Payment status badge ─────────────────────────────────────────────────────

interface StatusConfig { label: string; className: string }

const PAYMENT_STATUS_MAP: Record<PaymentStatus, StatusConfig> = {
  pending:            { label: 'Behandlas',      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-transparent' },
  confirmed:          { label: 'Bekräftad',      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent' },
  failed:             { label: 'Misslyckad',     className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-transparent' },
  refunded:           { label: 'Återbetald',     className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-transparent' },
  partially_refunded: { label: 'Delåterbetald',  className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-transparent' },
  void:               { label: 'Makulerad',      className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 border-transparent' },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const cfg = PAYMENT_STATUS_MAP[status] ?? { label: paymentStatusLabel(status), className: '' };
  return (
    <Badge variant="default" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

// ─── Payment method badge ─────────────────────────────────────────────────────

const PAYMENT_METHOD_MAP: Partial<Record<PaymentMethod, string>> = {
  swish:          'bg-green-50 text-green-700 dark:bg-green-900/20 border-transparent',
  card:           'bg-blue-50 text-blue-700 dark:bg-blue-900/20 border-transparent',
  bank_transfer:  'bg-purple-50 text-purple-700 dark:bg-purple-900/20 border-transparent',
};

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const className = PAYMENT_METHOD_MAP[method] ?? '';
  return (
    <Badge variant="outline" className={className}>
      {paymentMethodLabel(method)}
    </Badge>
  );
}

export const PAYMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all',                label: 'Alla statusar' },
  { value: 'pending',            label: 'Behandlas' },
  { value: 'confirmed',          label: 'Bekräftad' },
  { value: 'failed',             label: 'Misslyckad' },
  { value: 'refunded',           label: 'Återbetald' },
  { value: 'void',               label: 'Makulerad' },
];

export const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'all',           label: 'Alla sätt' },
  { value: 'card',          label: 'Kort' },
  { value: 'bank_transfer', label: 'Banköverföring' },
  { value: 'swish',         label: 'Swish' },
  { value: 'stripe',        label: 'Stripe' },
  { value: 'manual',        label: 'Manuell' },
  { value: 'invoice_credit',label: 'Kreditfaktura' },
];
