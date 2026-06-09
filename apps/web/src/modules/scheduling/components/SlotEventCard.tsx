import type { LessonSlot } from '@platform/types';
import { formatCapacity, isSlotFull } from '../lib/calendarUtils.js';

// ─── SlotEventCard ────────────────────────────────────────────────────────────
//
// Rendered inside each FullCalendar event container.
// Container background is already colored by the event's backgroundColor prop.
// This component renders white text content on top.

interface SlotEventCardProps {
  slot: LessonSlot;
}

export function SlotEventCard({ slot }: SlotEventCardProps) {
  const full = isSlotFull(slot);
  const capacity = formatCapacity(slot.current_bookings, slot.max_bookings);

  return (
    <div className="px-1 py-0.5 overflow-hidden h-full flex flex-col gap-0.5 select-none">
      {/* Capacity chip */}
      <div className="flex items-center gap-1 min-w-0">
        <span className={`
          inline-flex items-center rounded text-[10px] font-semibold px-1 shrink-0
          ${full
            ? 'bg-white/30 text-white'
            : 'bg-white/20 text-white'}
        `}>
          {capacity}
        </span>
        {full && (
          <span className="text-[10px] text-white/90 font-medium truncate">
            Fullbokad
          </span>
        )}
      </div>
      {/* Notes — shown if space allows */}
      {slot.notes && (
        <p className="text-[10px] text-white/80 leading-tight truncate hidden sm:block">
          {slot.notes}
        </p>
      )}
    </div>
  );
}
