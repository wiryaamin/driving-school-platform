import type { LessonSlot } from '@platform/types';
import { formatCapacity, isSlotFull } from '../lib/calendarUtils.js';

// ─── SlotEventCard ────────────────────────────────────────────────────────────
//
// Rendered inside each FullCalendar event container.
// Container background is already colored by the event's backgroundColor prop.
// This component renders white text content on top.

interface SlotEventCardProps {
  slot:           LessonSlot;
  instructorName?: string;
}

export function SlotEventCard({ slot, instructorName }: SlotEventCardProps) {
  const full       = isSlotFull(slot);
  const capacity   = formatCapacity(slot.current_bookings, slot.max_bookings);
  const lastName   = instructorName ? instructorName.split(' ').pop() : null;
  const isTerminal = slot.status === 'cancelled' || slot.status === 'completed' || slot.status === 'blocked';

  return (
    <div className="px-1 py-0.5 overflow-hidden h-full flex flex-col gap-0.5 select-none">
      {/* Capacity chip + status label */}
      <div className="flex items-center gap-1 min-w-0">
        <span className={`
          inline-flex items-center rounded text-[10px] font-semibold px-1 shrink-0
          ${full ? 'bg-white/30 text-white' : 'bg-white/20 text-white'}
        `}>
          {capacity}
        </span>
        {full && (
          <span className="text-[10px] text-white/90 font-medium truncate">Fullbokad</span>
        )}
        {!full && slot.status === 'open' && slot.current_bookings === 0 && (
          <span className="text-[10px] text-white/85 font-semibold truncate">+ Boka</span>
        )}
        {!full && slot.status === 'open' && slot.current_bookings > 0 && (
          <span className="text-[10px] text-white/75 truncate">Ledig</span>
        )}
        {slot.status === 'completed' && (
          <span className="text-[10px] text-white/70 font-medium truncate">Slutförd</span>
        )}
        {slot.status === 'cancelled' && (
          <span className="text-[10px] text-white/70 font-medium truncate">Avbokad</span>
        )}
      </div>

      {/* Live indicator — shown only while lesson is in progress */}
      {slot.status === 'in_progress' && (
        <div className="flex items-center gap-1 min-w-0">
          <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-white/90 shrink-0" />
          <span className="text-[10px] text-white/90 font-semibold truncate">Pågår nu</span>
        </div>
      )}

      {/* Instructor last name */}
      {lastName && (
        <p className="text-[10px] text-white/85 leading-tight truncate">{lastName}</p>
      )}

      {/* Notes — only when no instructor name */}
      {slot.notes && !lastName && (
        <p className="text-[10px] text-white/80 leading-tight truncate hidden sm:block">
          {slot.notes}
        </p>
      )}

      {/* Occupancy fill bar — visual booking density for active slots */}
      {!isTerminal && slot.max_bookings > 0 && (
        <div className="mt-auto h-[3px] bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/70 rounded-full"
            style={{ width: `${Math.min((slot.current_bookings / slot.max_bookings) * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
