import { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, Check, Loader2, PenLine, Send, Star, Phone,
} from 'lucide-react';
import {
  useMarkAttendance, useAddBookingNote, useSetBookingFeedback,
  type BookingDetail, type ScheduleSlot,
} from '../hooks/useInstructorApp.js';
import { cn } from '@/lib/utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const BOOKING_STATUS: Record<string, { label: string; cls: string }> = {
  reserved:    { label: 'Reserverad', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  confirmed:   { label: 'Bekräftad',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  completed:   { label: 'Närvande',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  no_show:     { label: 'Uteblev',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  cancelled:   { label: 'Avbokad',    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  rescheduled: { label: 'Ombokas',    cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
};

const ACTIONABLE = new Set(['reserved', 'confirmed']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = BOOKING_STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ─── StarRatingInput ──────────────────────────────────────────────────────────

function StarRatingInput({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => {
        const active = (hovered ?? value ?? 0) >= i;
        return (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onChange(i)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                'w-5 h-5 transition-colors',
                active
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            'w-3.5 h-3.5',
            i <= rating
              ? 'fill-amber-400 text-amber-400'
              : 'fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700',
          )}
        />
      ))}
    </div>
  );
}

// ─── StudentRow ───────────────────────────────────────────────────────────────

export function StudentRow({ booking }: { booking: BookingDetail }) {
  const mark        = useMarkAttendance();
  const addNote     = useAddBookingNote();
  const setFeedback = useSetBookingFeedback();

  const [justCompleted, setJustCompleted] = useState(false);
  const [note,          setNote]          = useState('');
  const [noteSaved,     setNoteSaved]     = useState(false);
  const [rating,      setRating]    = useState<number | null>(booking.performance_rating ?? null);
  const [ratingSaved, setRatingSaved] = useState(
    booking.performance_rating !== null && booking.performance_rating > 0,
  );
  const [pendingNoShow, setPendingNoShow] = useState(false);

  useEffect(() => {
    if (!pendingNoShow) return;
    const t = setTimeout(() => setPendingNoShow(false), 4_000);
    return () => clearTimeout(t);
  }, [pendingNoShow]);

  const isActionable = ACTIONABLE.has(booking.status);
  const isCompleted  = booking.status === 'completed';
  const initials     = `${booking.student_first_name.charAt(0)}${booking.student_last_name.charAt(0)}`.toUpperCase();
  const showFeedback = justCompleted || isCompleted;

  function handleMarkCompleted() {
    mark.mutate(
      { bookingId: booking.id, status: 'completed' },
      { onSuccess: () => setJustCompleted(true) },
    );
  }

  function handleSaveRating(r: number) {
    setRating(r);
    setFeedback.mutate(
      { bookingId: booking.id, rating: r },
      {
        onSuccess: () => setRatingSaved(true),
        onError:   () => { alert('Kunde inte spara betyg. Försök igen.'); setRating(null); },
      },
    );
  }

  function handleSaveNote() {
    if (!note.trim()) return;
    addNote.mutate(
      { bookingId: booking.id, content: note.trim() },
      {
        onSuccess: () => setNoteSaved(true),
        onError:   () => alert('Kunde inte spara anteckning. Försök igen.'),
      },
    );
  }

  return (
    <div className="pt-3 space-y-2.5">
      {/* Student identity */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-purple-700 dark:text-purple-300">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {booking.student_first_name} {booking.student_last_name}
          </p>
          {booking.student_phone && (
            <a
              href={`tel:${booking.student_phone}`}
              className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline"
            >
              <Phone className="w-3 h-3" />
              {booking.student_phone}
            </a>
          )}
        </div>
        <StatusBadge status={booking.status} />
      </div>

      {/* Attendance actions */}
      {isActionable && (
        <div className="flex gap-2">
          <button
            onClick={handleMarkCompleted}
            disabled={mark.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold transition-colors"
          >
            {mark.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Närvande
          </button>
          {!pendingNoShow ? (
            <button
              onClick={() => setPendingNoShow(true)}
              disabled={mark.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 text-xs font-bold transition-colors"
            >
              Uteblev
            </button>
          ) : (
            <div className="flex-1 flex items-center gap-2 rounded-xl border-2 border-amber-300 dark:border-amber-700 px-2.5 py-1.5">
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 flex-1">Bekräfta?</span>
              <button
                onClick={() => { setPendingNoShow(false); mark.mutate({ bookingId: booking.id, status: 'no_show' }); }}
                disabled={mark.isPending}
                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[10px] font-bold rounded-lg transition-colors"
              >
                Ja
              </button>
              <button
                onClick={() => setPendingNoShow(false)}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-bold rounded-lg transition-colors"
              >
                Nej
              </button>
            </div>
          )}
        </div>
      )}

      {/* Completion indicator */}
      {(justCompleted || isCompleted) && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          Lektion genomförd
        </div>
      )}

      {/* Post-lesson star rating — only after completion */}
      {showFeedback && (
        <div className="pt-0.5">
          {!ratingSaved ? (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Betyg (valfritt)
              </p>
              <StarRatingInput value={rating} onChange={handleSaveRating} />
              {setFeedback.isPending && (
                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Sparar...
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <StarDisplay rating={rating!} />
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Betyg sparat</span>
              <button
                onClick={() => setRatingSaved(false)}
                className="ml-auto text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
              >
                Ändra
              </button>
            </div>
          )}
        </div>
      )}

      {/* Note textarea — always visible for active bookings */}
      {!['cancelled', 'rescheduled'].includes(booking.status) && (
        !noteSaved ? (
          <div className="space-y-2 pt-0.5">
            <div className="flex items-center gap-1.5">
              <PenLine className="w-3 h-3 text-gray-400" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Anteckning till eleven (valfritt)
              </p>
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="T.ex. bra framsteg med backning..."
              rows={2}
              className="w-full text-xs text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-gray-300 dark:placeholder:text-gray-600"
            />
            {note.trim().length > 0 && (
              <button
                onClick={handleSaveNote}
                disabled={addNote.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {addNote.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Spara anteckning
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic border-l-2 border-purple-300 dark:border-purple-700 pl-2 mt-1">
            "{note}"
          </p>
        )
      )}
    </div>
  );
}

// ─── SlotCard ─────────────────────────────────────────────────────────────────

export function SlotCard({ slot, dim }: { slot: ScheduleSlot; dim?: boolean }) {
  const now       = Date.now();
  const slotStart = new Date(slot.starts_at).getTime();
  const slotEnd   = new Date(slot.ends_at).getTime();
  const isNow     = now >= slotStart && now < slotEnd;
  const isPast    = now >= slotEnd;
  const isEmpty   = slot.bookings.length === 0;
  const hasActionable = slot.bookings.some(b => ACTIONABLE.has(b.status));
  // Auto-expand slots that are currently in progress
  const [expanded, setExpanded] = useState(isNow && !isEmpty);

  return (
    <div className={cn(
      'bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden transition-opacity',
      isNow
        ? 'border-purple-300 dark:border-purple-700 shadow-sm shadow-purple-100 dark:shadow-purple-900/20'
        : 'border-gray-100 dark:border-gray-800',
      dim && 'opacity-60',
    )}>
      {/* Slot header */}
      <button
        type="button"
        className="w-full flex items-center gap-4 p-4 text-left"
        onClick={() => !isEmpty && setExpanded(e => !e)}
      >
        {/* Time block */}
        <div className={cn(
          'shrink-0 rounded-xl px-3 py-2 text-center',
          isNow  ? 'bg-purple-600 text-white'
          : isPast ? 'bg-gray-100 dark:bg-gray-800'
          : 'bg-purple-50 dark:bg-purple-900/20',
        )}>
          <p className={cn(
            'text-base font-bold leading-none tabular-nums',
            isNow ? 'text-white' : isPast ? 'text-gray-500 dark:text-gray-400' : 'text-purple-700 dark:text-purple-300',
          )}>
            {formatTime(slot.starts_at)}
          </p>
          <p className={cn('text-[10px] mt-0.5', isNow ? 'text-purple-200' : 'text-gray-400')}>
            {formatTime(slot.ends_at)}
          </p>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {isNow && (
            <span className="inline-block mb-1 text-[10px] font-bold px-2 py-0.5 bg-purple-600 text-white rounded-full">
              PÅGÅR NU
            </span>
          )}
          {isEmpty ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Inga bokningar</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {slot.bookings[0]
                  ? `${slot.bookings[0].student_first_name} ${slot.bookings[0].student_last_name}`
                  : ''}
                {slot.bookings.length > 1 && (
                  <span className="text-gray-400 dark:text-gray-500 font-normal">
                    {' '}+{slot.bookings.length - 1} till
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {slot.current_bookings}/{slot.max_bookings} elever
                {slot.lesson_type_name ? ` · ${slot.lesson_type_name}` : ''}
              </p>
            </>
          )}
        </div>

        {/* Expand indicator */}
        {!isEmpty && (
          hasActionable
            ? <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
            : expanded
              ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
              : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {/* Expanded: student list */}
      {expanded && slot.bookings.length > 0 && (
        <div className="px-4 pb-4 divide-y divide-gray-50 dark:divide-gray-800">
          {slot.bookings.map(b => (
            <StudentRow key={b.id} booking={b} />
          ))}
        </div>
      )}
    </div>
  );
}
