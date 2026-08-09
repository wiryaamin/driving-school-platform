import { Badge } from '@platform/ui';
import type { LessonSlotStatus } from '@platform/types';
import { SLOT_STATUS_CONFIG } from '../lib/calendarUtils.js';

// ─── SlotStatusBadge ──────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_VARIANT: Record<LessonSlotStatus, BadgeVariant> = {
  open:        'default',
  full:        'secondary',
  in_progress: 'default',
  completed:   'secondary',
  cancelled:   'destructive',
  blocked:     'outline',
};

// green = free, red = booked/occupied, purple = blocked by staff — matches
// lib/calendarUtils.ts's SLOT_STATUS_CONFIG exactly.
const STATUS_CLASS: Partial<Record<LessonSlotStatus, string>> = {
  open:        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent',
  full:        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-transparent',
  in_progress: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-transparent',
  completed:   'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400 border-transparent',
  cancelled:   'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400 border-transparent',
  blocked:     'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-transparent',
};

interface SlotStatusBadgeProps {
  status: LessonSlotStatus;
}

export function SlotStatusBadge({ status }: SlotStatusBadgeProps) {
  const config = SLOT_STATUS_CONFIG[status];
  const variant = STATUS_VARIANT[status];
  const className = STATUS_CLASS[status];

  if (className) {
    return <Badge variant={variant} className={className}>{config.label}</Badge>;
  }
  return <Badge variant={variant}>{config.label}</Badge>;
}

export function slotStatusLabel(status: LessonSlotStatus): string {
  return SLOT_STATUS_CONFIG[status]?.label ?? status;
}

// ─── Status options for select inputs ────────────────────────────────────────

export const SLOT_STATUS_OPTIONS: { value: LessonSlotStatus; label: string }[] = [
  { value: 'open',        label: 'Öppen' },
  { value: 'full',        label: 'Fullbokad' },
  { value: 'in_progress', label: 'Pågår' },
  { value: 'completed',   label: 'Slutförd' },
  { value: 'cancelled',   label: 'Avbokad' },
  { value: 'blocked',     label: 'Blockerad' },
];
