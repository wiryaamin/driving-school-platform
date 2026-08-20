import { useState, useMemo } from 'react';
import { CalendarDays, Clock, ChevronDown, ChevronUp, X, RefreshCw, Loader2, AlertCircle, CalendarPlus, MessageSquare, Star, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  usePortalBookings, usePortalSlots, usePortalCancelBooking, usePortalRescheduleBooking,
  usePortalHistory,
  type PortalBooking, type PortalSlot, type PortalHistoryItem,
} from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm',
  }).replace(/^./, c => c.toUpperCase());
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  reserved:    { label: 'Reserverad',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  confirmed:   { label: 'Bekräftad',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  completed:   { label: 'Genomförd',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  cancelled:   { label: 'Avbokad',     cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  no_show:     { label: 'Uteblev',     cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  rescheduled: { label: 'Ombokas',     cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

const TERMINAL            = new Set(['completed', 'cancelled', 'no_show', 'rescheduled']);
const CANCEL_CUTOFF_MS    = 24 * 60 * 60 * 1000; // 24 h

// ─── Reschedule sheet ─────────────────────────────────────────────────────────

function RescheduleSheet({
  booking, onClose,
}: {
  booking: PortalBooking; onClose: () => void;
}) {
  // Computed once per mount (this sheet mounts fresh every time it opens,
  // via `{showResch && <RescheduleSheet .../>}` in the parent) — recomputing
  // fresh Date objects on every render would change usePortalSlots' query
  // key every render, causing an unbounded refetch loop (the slot list never
  // stops "loading"). Same fix already applied to the staff-facing
  // RescheduleBookingDialog for the identical reason.
  const { fromDt, toDt } = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      fromDt: tomorrow.toISOString(),
      toDt:   new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
  }, []);

  const { data: slots, isLoading } = usePortalSlots(fromDt, toDt);
  const reschedule = usePortalRescheduleBooking();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  function handleReschedule() {
    if (!selectedSlot) return;
    reschedule.mutate(
      { bookingId: booking.id, newSlotId: selectedSlot },
      {
        onSuccess: () => onClose(),
        onError:   (e) => alert(e instanceof Error ? e.message : 'Ombokningfel, försök igen.'),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Boka om lektion</h2>
        <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Original booking info */}
      <div className="mx-4 mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 text-sm">
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">Nuvarande bokning</p>
        <p className="text-gray-500 dark:text-gray-400 capitalize">{formatDateFull(booking.starts_at)}</p>
        <p className="text-gray-500 dark:text-gray-400">{formatTime(booking.starts_at)}–{formatTime(booking.ends_at)}</p>
      </div>

      {/* Slot picker */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Välj nytt pass (nästa 30 dagar)
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : !slots || slots.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">
            Inga lediga pass de närmaste 30 dagarna.
          </p>
        ) : (
          slots.map((slot: PortalSlot) => (
            <button
              key={slot.id}
              onClick={() => setSelectedSlot(slot.id)}
              className={cn(
                'w-full text-left flex items-start gap-3 p-4 rounded-2xl border-2 transition-all',
                selectedSlot === slot.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-200',
              )}
            >
              <CalendarDays className={cn('w-5 h-5 mt-0.5 shrink-0', selectedSlot === slot.id ? 'text-blue-600' : 'text-gray-400')} />
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">
                  {new Date(slot.starts_at).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTime(slot.starts_at)}–{formatTime(slot.ends_at)}
                  {slot.instructor_first_name ? ` · ${slot.instructor_first_name} ${slot.instructor_last_name ?? ''}` : ''}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Confirm */}
      <div className="px-4 pb-6 pt-3 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={handleReschedule}
          disabled={!selectedSlot || reschedule.isPending}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          {reschedule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Bekräfta ombokning
        </button>
      </div>
    </div>
  );
}

// ─── Cancel sheet ─────────────────────────────────────────────────────────────

function CancelSheet({
  booking, onClose,
}: {
  booking: PortalBooking; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const cancel = usePortalCancelBooking();
  const canSubmit = reason.trim().length >= 5 && !cancel.isPending;

  function handleSubmit() {
    cancel.mutate(
      { bookingId: booking.id, reason: reason.trim() },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Avboka lektion</h2>
        <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Lektion att avboka</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">{formatDateFull(booking.starts_at)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatTime(booking.starts_at)}–{formatTime(booking.ends_at)}</p>
          {booking.lesson_type_name && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{booking.lesson_type_name}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Anledning till avbokning
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="T.ex. sjuk, reseplaner..."
            rows={3}
            className="w-full text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-red-300 placeholder:text-gray-300 dark:placeholder:text-gray-600"
          />
          <p className="text-[11px] text-gray-400 dark:text-gray-500">Minst 5 tecken krävs.</p>
        </div>

        {cancel.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">Avbokning misslyckades. Försök igen.</p>
        )}
      </div>

      <div className="px-4 pb-6 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          {cancel.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          Avboka lektion
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({ booking }: { booking: PortalBooking }) {
  const [expanded,        setExpanded]        = useState(false);
  const [showResch,       setShowResch]       = useState(false);
  const [showCancelSheet, setShowCancelSheet] = useState(false);

  const isTerminal      = TERMINAL.has(booking.status);
  const startsAt        = new Date(booking.starts_at).getTime();
  const isUpcoming      = !isTerminal && startsAt > Date.now();
  const canSelfService  = isUpcoming && (startsAt - Date.now()) > CANCEL_CUTOFF_MS;
  const instructor      = [booking.instructor_first_name, booking.instructor_last_name].filter(Boolean).join(' ') || null;

  return (
    <>
      <div className={cn(
        'bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden',
        isTerminal ? 'border-gray-100 dark:border-gray-800' : 'border-gray-200 dark:border-gray-700',
      )}>
        <div
          className="flex items-start gap-4 p-4 cursor-pointer select-none"
          onClick={() => !isTerminal && setExpanded(e => !e)}
        >
          {/* Date block */}
          <div className={cn(
            'shrink-0 rounded-xl p-2.5 text-center min-w-[48px]',
            booking.status === 'completed'
              ? 'bg-emerald-50 dark:bg-emerald-900/20'
              : isTerminal
              ? 'bg-gray-50 dark:bg-gray-800'
              : 'bg-blue-50 dark:bg-blue-900/20',
          )}>
            <p className={cn(
              'text-lg font-bold leading-none',
              booking.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400'
              : isTerminal ? 'text-gray-400'
              : 'text-blue-600 dark:text-blue-400',
            )}>
              {new Date(booking.starts_at).toLocaleDateString('sv-SE', { day: 'numeric', timeZone: 'Europe/Stockholm' })}
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-0.5">
              {new Date(booking.starts_at).toLocaleDateString('sv-SE', { month: 'short', timeZone: 'Europe/Stockholm' })}
            </p>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <StatusBadge status={booking.status} />
              {booking.lesson_type_name && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{booking.lesson_type_name}</span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatTime(booking.starts_at)}–{formatTime(booking.ends_at)}
            </p>
            {instructor && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{instructor}</p>
            )}
          </div>

          {!isTerminal && (
            expanded
              ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
              : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
          )}
        </div>

        {/* Expanded actions */}
        {expanded && isUpcoming && (
          <div className="px-4 pb-4 pt-0 border-t border-gray-50 dark:border-gray-800">
            {(booking.location_name || booking.vehicle_label) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-gray-500 dark:text-gray-400">
                {booking.location_name && <span>{booking.location_name}</span>}
                {booking.vehicle_label && <span>{booking.vehicle_label}</span>}
              </div>
            )}
            {canSelfService ? (
              <div className="flex gap-2 pt-3">
                <button
                  onClick={() => setShowResch(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-600 dark:text-blue-400 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Boka om
                </button>
                <button
                  onClick={() => setShowCancelSheet(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Avboka
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/60">
                <Lock className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
                  Avbokning ej möjlig — lektionen börjar om mindre än 24 timmar. Kontakta skolan om du behöver avboka.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showResch && (
        <RescheduleSheet booking={booking} onClose={() => setShowResch(false)} />
      )}
      {showCancelSheet && (
        <CancelSheet booking={booking} onClose={() => setShowCancelSheet(false)} />
      )}
    </>
  );
}

// ─── History card (past lessons with notes) ───────────────────────────────────

const HISTORY_STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Genomförd', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  no_show:   { label: 'Uteblev',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  cancelled: { label: 'Avbokad',   cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            'w-3 h-3',
            i <= rating
              ? 'fill-amber-400 text-amber-400'
              : 'fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700',
          )}
        />
      ))}
    </div>
  );
}

function HistoryCard({ item }: { item: PortalHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = HISTORY_STATUS[item.status] ?? HISTORY_STATUS['cancelled']!;
  const instructor = [item.instructor_first_name, item.instructor_last_name].filter(Boolean).join(' ') || null;
  const hasNotes = Boolean(item.instructor_notes) || item.notes.length > 0;
  const hasRating = item.performance_rating !== null && item.performance_rating > 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div
        className={cn('flex items-start gap-4 p-4', hasNotes && 'cursor-pointer select-none')}
        onClick={() => hasNotes && setExpanded(e => !e)}
      >
        {/* Date block */}
        <div className={cn(
          'shrink-0 rounded-xl p-2.5 text-center min-w-[48px]',
          item.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-gray-800',
        )}>
          <p className={cn(
            'text-lg font-bold leading-none',
            item.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400',
          )}>
            {new Date(item.starts_at).toLocaleDateString('sv-SE', { day: 'numeric', timeZone: 'Europe/Stockholm' })}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-0.5">
            {new Date(item.starts_at).toLocaleDateString('sv-SE', { month: 'short', timeZone: 'Europe/Stockholm' })}
          </p>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.cls)}>{cfg.label}</span>
            {item.lesson_type_name && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{item.lesson_type_name}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {formatTime(item.starts_at)}–{formatTime(item.ends_at)}
          </p>
          {instructor && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{instructor}</p>
          )}
          {hasRating && !expanded && (
            <div className="mt-1.5">
              <StarRating rating={item.performance_rating!} />
            </div>
          )}
        </div>

        {hasNotes && (
          expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
            : (
              <div className="flex items-center gap-1.5 shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </div>
            )
        )}
      </div>

      {/* Expanded notes */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-50 dark:border-gray-800 space-y-3">
          {hasRating && (
            <div className="pt-3 flex items-center gap-2">
              <StarRating rating={item.performance_rating!} />
              <span className="text-xs text-gray-500 dark:text-gray-400">Instruktörens bedömning</span>
            </div>
          )}
          {item.instructor_notes && (
            <div className={cn('pt-3', hasRating && 'pt-0')}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                Instruktörens anteckning
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {item.instructor_notes}
              </p>
            </div>
          )}
          {item.notes.map((n, i) => (
            <div key={i} className={cn(i === 0 && !item.instructor_notes && !hasRating && 'pt-3')}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                Anteckning
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{n.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── StudentPortalBokningarPage ───────────────────────────────────────────────

type HistoryFilter = 'all' | 'completed' | 'no_show';

const HISTORY_CHIPS: { key: HistoryFilter; label: string }[] = [
  { key: 'all',       label: 'Alla'       },
  { key: 'completed', label: 'Genomförd'  },
  { key: 'no_show',   label: 'Uteblev'   },
];

export function StudentPortalBokningarPage() {
  const { data: bookings, isLoading: bookingsLoading, isError: bookingsError } = usePortalBookings();
  const { data: history,  isLoading: historyLoading,  isError: historyError  } = usePortalHistory();
  const [tab,           setTab]           = useState<'upcoming' | 'past'>('upcoming');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  const now = Date.now();

  const upcoming = useMemo(
    () => (bookings ?? [])
      .filter(b => !TERMINAL.has(b.status) && new Date(b.starts_at).getTime() > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [bookings, now],
  );

  const sortedHistory = useMemo(
    () => (history ?? []).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    [history],
  );

  const filteredHistory = useMemo(
    () => historyFilter === 'all' ? sortedHistory : sortedHistory.filter(h => h.status === historyFilter),
    [sortedHistory, historyFilter],
  );

  const isLoading = tab === 'upcoming' ? bookingsLoading : historyLoading;
  const isError   = tab === 'upcoming' ? bookingsError   : historyError;

  return (
    <div className="max-w-lg mx-auto">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
        {(['upcoming', 'past'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-3.5 text-sm font-semibold transition-colors border-b-2',
              tab === t
                ? 'text-blue-600 dark:text-blue-400 border-blue-500'
                : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-800',
            )}
          >
            {t === 'upcoming' ? `Kommande (${upcoming.length})` : `Historik (${sortedHistory.length})`}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">Kunde inte hämta bokningar.</p>
          </div>
        ) : tab === 'upcoming' ? (
          upcoming.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center gap-3">
              <Clock className="w-12 h-12 text-gray-200 dark:text-gray-700" />
              <p className="font-semibold text-gray-500 dark:text-gray-400">Inga kommande bokningar</p>
              <Link
                to="/portal/boka"
                className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
              >
                <CalendarPlus className="w-4 h-4" />
                Boka din första lektion
              </Link>
            </div>
          ) : (
            upcoming.map(b => <BookingCard key={b.id} booking={b} />)
          )
        ) : (
          <>
            {/* History filter chips */}
            {sortedHistory.length > 0 && (
              <div className="flex gap-2 -mx-1 overflow-x-auto pb-1">
                {HISTORY_CHIPS.map(chip => (
                  <button
                    key={chip.key}
                    onClick={() => setHistoryFilter(chip.key)}
                    className={cn(
                      'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors',
                      historyFilter === chip.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                    )}
                  >
                    {chip.label}
                    {chip.key === 'all' && (
                      <span className="ml-1.5 text-[10px] opacity-70">{sortedHistory.length}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center py-14 text-center gap-3">
                <Clock className="w-12 h-12 text-gray-200 dark:text-gray-700" />
                <p className="font-semibold text-gray-500 dark:text-gray-400">
                  {historyFilter === 'all' ? 'Ingen historik än' : 'Inga lektioner i denna kategori'}
                </p>
                {historyFilter !== 'all' && (
                  <button
                    onClick={() => setHistoryFilter('all')}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Visa alla
                  </button>
                )}
              </div>
            ) : (
              filteredHistory.map(item => <HistoryCard key={item.id} item={item} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
