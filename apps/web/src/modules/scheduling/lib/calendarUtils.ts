import type { EventInput } from '@fullcalendar/core';
import type { LessonSlot, LessonSlotStatus } from '@platform/types';

// ─── Status → color + Swedish label ──────────────────────────────────────────

export interface SlotStatusConfig {
  bg: string;
  border: string;
  text: string;
  label: string;
  dot: string; // Tailwind bg class for badge dot
}

export const SLOT_STATUS_CONFIG: Record<LessonSlotStatus, SlotStatusConfig> = {
  open:        { bg: '#16a34a',                    border: '#15803d',                   text: '#ffffff', label: 'Öppen',     dot: 'bg-green-500' },
  full:        { bg: '#d97706',                    border: '#b45309',                   text: '#ffffff', label: 'Fullbokad', dot: 'bg-amber-500' },
  in_progress: { bg: '#2563eb',                    border: '#3b82f6',                   text: '#ffffff', label: 'Pågår',     dot: 'bg-blue-500' },
  completed:   { bg: 'rgba(107, 114, 128, 0.55)',  border: 'rgba(75, 85, 99, 0.5)',     text: '#ffffff', label: 'Slutförd',  dot: 'bg-gray-500' },
  cancelled:   { bg: 'rgba(220, 38, 38, 0.45)',    border: 'rgba(185, 28, 28, 0.4)',    text: '#ffffff', label: 'Avbokad',   dot: 'bg-red-500' },
  blocked:     { bg: 'rgba(55, 65, 81, 0.45)',     border: 'rgba(31, 41, 55, 0.4)',     text: '#d1d5db', label: 'Blockerad', dot: 'bg-gray-700' },
};

export function getSlotStatusConfig(status: LessonSlotStatus): SlotStatusConfig {
  return SLOT_STATUS_CONFIG[status] ?? SLOT_STATUS_CONFIG.open;
}

// ─── LessonSlot → FullCalendar EventInput ────────────────────────────────────

export function slotToCalendarEvent(slot: LessonSlot): EventInput {
  const config = getSlotStatusConfig(slot.status);
  return {
    id: slot.id,
    title: '',
    start: slot.starts_at,
    end: slot.ends_at,
    backgroundColor: config.bg,
    borderColor: config.border,
    textColor: config.text,
    extendedProps: { type: 'slot', slot },
  };
}

// ─── Capacity helpers ─────────────────────────────────────────────────────────

export function formatCapacity(current: number, max: number): string {
  return `${current}/${max}`;
}

export function isSlotFull(slot: LessonSlot): boolean {
  return slot.current_bookings >= slot.max_bookings;
}

// ─── Date/time formatting (Stockholm timezone, Swedish locale) ────────────────

export function formatSlotDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('sv-SE', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    timeZone: 'Europe/Stockholm',
  });
}

export function formatSlotTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('sv-SE', {
    hour:     '2-digit',
    minute:   '2-digit',
    timeZone: 'Europe/Stockholm',
  });
}

export function slotDurationMinutes(slot: LessonSlot): number {
  return Math.round(
    (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60_000
  );
}
