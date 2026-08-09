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

// green = free, red = booked/occupied (full or a lesson actively in
// progress), purple = blocked by staff (a different concept from a
// customer booking, kept visually distinct). Matches
// components/MultiInstructorGrid.tsx and MultiVehicleGrid.tsx's convention
// exactly — those two components render their own grid cells independently
// (not through slotToCalendarEvent) and previously disagreed with this
// config and each other (orange/amber for full, blue for open in one of
// them) — all three are now the same scheme.
export const SLOT_STATUS_CONFIG: Record<LessonSlotStatus, SlotStatusConfig> = {
  open:        { bg: '#16a34a',                    border: '#15803d',                   text: '#ffffff', label: 'Öppen',     dot: 'bg-green-500' },
  full:        { bg: '#dc2626',                    border: '#b91c1c',                   text: '#ffffff', label: 'Fullbokad', dot: 'bg-red-500' },
  in_progress: { bg: '#dc2626',                    border: '#b91c1c',                   text: '#ffffff', label: 'Pågår',     dot: 'bg-red-500' },
  completed:   { bg: 'rgba(107, 114, 128, 0.55)',  border: 'rgba(75, 85, 99, 0.5)',     text: '#ffffff', label: 'Slutförd',  dot: 'bg-gray-500' },
  cancelled:   { bg: 'rgba(107, 114, 128, 0.35)',  border: 'rgba(75, 85, 99, 0.3)',     text: '#ffffff', label: 'Avbokad',   dot: 'bg-gray-500' },
  blocked:     { bg: '#9333ea',                    border: '#7e22ce',                   text: '#ffffff', label: 'Blockerad', dot: 'bg-purple-500' },
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
