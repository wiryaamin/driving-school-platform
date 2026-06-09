import { Badge } from '@platform/ui';
import type { InvoiceStatus } from '../hooks/useFinance.js';
import { invoiceStatusLabel } from '../lib/financeUtils.js';

interface StatusConfig {
  label:     string;
  className: string;
}

const STATUS_MAP: Record<InvoiceStatus, StatusConfig> = {
  draft:          { label: 'Utkast',    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-transparent' },
  issued:         { label: 'Obetald',   className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-transparent' },
  paid:           { label: 'Betald',    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent' },
  partially_paid: { label: 'Delbetald', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-transparent' },
  void:           { label: 'Makulerad', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 border-transparent line-through' },
  overdue:        { label: 'Förfallen', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-transparent' },
};

interface Props {
  status: InvoiceStatus;
  className?: string;
}

export function InvoiceStatusBadge({ status, className }: Props) {
  const cfg = STATUS_MAP[status] ?? { label: invoiceStatusLabel(status), className: '' };
  return (
    <Badge variant="default" className={`${cfg.className} ${className ?? ''}`}>
      {cfg.label}
    </Badge>
  );
}

export const INVOICE_STATUS_OPTIONS: { value: InvoiceStatus | 'all'; label: string }[] = [
  { value: 'all',           label: 'Alla statusar' },
  { value: 'draft',         label: 'Utkast' },
  { value: 'issued',        label: 'Obetald' },
  { value: 'paid',          label: 'Betald' },
  { value: 'partially_paid',label: 'Delbetald' },
  { value: 'overdue',       label: 'Förfallen' },
  { value: 'void',          label: 'Makulerad' },
];
