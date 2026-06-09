import type { InvoiceStatus, PaymentStatus, PaymentMethod, PackageStatus } from '@platform/types';

export function formatCurrency(amount: number, currency = 'SEK'): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short' }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  switch (status) {
    case 'draft':          return 'Utkast';
    case 'issued':         return 'Obetald';
    case 'paid':           return 'Betald';
    case 'partially_paid': return 'Delbetald';
    case 'void':           return 'Makulerad';
    case 'overdue':        return 'Förfallen';
    default:               return status;
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'pending':            return 'Behandlas';
    case 'confirmed':          return 'Bekräftad';
    case 'failed':             return 'Misslyckad';
    case 'refunded':           return 'Återbetald';
    case 'partially_refunded': return 'Delåterbetald';
    case 'void':               return 'Makulerad';
    default:                   return status;
  }
}

export function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'card':           return 'Kort';
    case 'bank_transfer':  return 'Banköverföring';
    case 'swish':          return 'Swish';
    case 'stripe':         return 'Stripe';
    case 'invoice_credit': return 'Kreditfaktura';
    case 'manual':         return 'Manuell';
    case 'other':          return 'Övrigt';
    default:               return method;
  }
}

export function packageStatusLabel(status: PackageStatus): string {
  switch (status) {
    case 'draft':        return 'Utkast';
    case 'active':       return 'Aktiv';
    case 'archived':     return 'Arkiverad';
    case 'discontinued': return 'Avslutad';
    default:             return status;
  }
}

export function isInvoiceOverdue(dueDate: string | null | undefined, status: InvoiceStatus): boolean {
  if (!dueDate || status === 'paid' || status === 'void') return false;
  return new Date(dueDate) < new Date();
}
