import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Clock, User, CheckCircle, Loader2, AlertCircle, Bell, X, Check, MapPin, Car, Star } from 'lucide-react';
import {
  usePortalSlots, usePortalCreateBooking, usePortalLessonTypes,
  usePortalJoinWaitlist, usePortalMyWaitlist, usePortalLeaveWaitlist,
  usePortalHistory,
  type PortalSlot, type PortalLessonType,
} from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';

// ─── Smart suggestion preferences ────────────────────────────────────────────

interface SlotPreferences {
  preferredHour:       number | null;  // Most common lesson start hour
  preferredInstructor: string | null;  // Full name of most booked instructor
}

function usePortalPreferences(): SlotPreferences | null {
  const { data: history } = usePortalHistory();
  return useMemo(() => {
    const completed = (history ?? []).filter(h => h.status === 'completed');
    if (completed.length < 3) return null;

    const hourCounts:       Record<number, number> = {};
    const instructorCounts: Record<string, number> = {};

    for (const h of completed) {
      const hour = new Date(h.starts_at).getHours();
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;

      const name = [h.instructor_first_name, h.instructor_last_name].filter(Boolean).join(' ');
      if (name) instructorCounts[name] = (instructorCounts[name] ?? 0) + 1;
    }

    const preferredHour = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

    const preferredInstructor = Object.entries(instructorCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

    return {
      preferredHour:       preferredHour !== null ? Number(preferredHour) : null,
      preferredInstructor: preferredInstructor ?? null,
    };
  }, [history]);
}

function isPreferredSlot(slot: PortalSlot, prefs: SlotPreferences | null): boolean {
  if (!prefs) return false;
  const slotHour    = new Date(slot.starts_at).getHours();
  const instructor  = [slot.instructor_first_name, slot.instructor_last_name].filter(Boolean).join(' ');
  const hourMatch   = prefs.preferredHour !== null && Math.abs(slotHour - prefs.preferredHour) <= 1;
  const instrMatch  = Boolean(prefs.preferredInstructor && instructor === prefs.preferredInstructor);
  return hourMatch || instrMatch;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function getMondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay(); // 0=Sun, 1=Mon…6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}

function getWeekDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i));
}

function dayLetter(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`)
    .toLocaleDateString('sv-SE', { weekday: 'narrow' })
    .toUpperCase();
}

function dayNum(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00`).getDate();
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
}

function slotDuration(starts_at: string, ends_at: string): number {
  return Math.round((new Date(ends_at).getTime() - new Date(starts_at).getTime()) / 60_000);
}

// ─── Week strip ───────────────────────────────────────────────────────────────

function WeekStrip({
  mondayStr,
  selectedDay,
  todayStr,
  slotsByDay,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  onToday,
}: {
  mondayStr:   string;
  selectedDay: string;
  todayStr:    string;
  slotsByDay:  Map<string, number>;
  onSelectDay: (d: string) => void;
  onPrevWeek:  () => void;
  onNextWeek:  () => void;
  onToday:     () => void;
}) {
  const weekDates = getWeekDates(mondayStr);
  const sundayStr = addDays(mondayStr, 6);
  const fromD     = new Date(`${mondayStr}T12:00:00`);
  const toD       = new Date(`${sundayStr}T12:00:00`);
  const sameMonth = fromD.getMonth() === toD.getMonth();
  const weekLabel = sameMonth
    ? `${fromD.getDate()}–${toD.getDate()} ${fromD.toLocaleDateString('sv-SE', { month: 'short' })}`
    : `${fromD.getDate()} ${fromD.toLocaleDateString('sv-SE', { month: 'short' })} – ${toD.getDate()} ${toD.toLocaleDateString('sv-SE', { month: 'short' })}`;

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
      {/* Week navigation header */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-1">
        <button
          onClick={onToday}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Idag
        </button>
        <button
          onClick={onPrevWeek}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-300 text-center">
          {weekLabel}
        </p>
        <button
          onClick={onNextWeek}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day strip */}
      <div className="grid grid-cols-7 px-2 pb-2 gap-0.5">
        {weekDates.map(d => {
          const isSelected = d === selectedDay;
          const isToday    = d === todayStr;
          const hasSlots   = (slotsByDay.get(d) ?? 0) > 0;

          return (
            <button
              key={d}
              onClick={() => onSelectDay(d)}
              className="flex flex-col items-center gap-0.5 py-1 rounded-xl transition-colors"
            >
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-wide',
                isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500',
              )}>
                {dayLetter(d)}
              </span>
              <span className={cn(
                'w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-colors',
                isSelected
                  ? 'bg-blue-600 text-white'
                  : isToday
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  : 'text-gray-700 dark:text-gray-300',
              )}>
                {dayNum(d)}
              </span>
              <span className={cn(
                'w-1 h-1 rounded-full transition-colors',
                hasSlots ? 'bg-blue-400 dark:bg-blue-500' : 'bg-transparent',
              )} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Lesson type filter chips ─────────────────────────────────────────────────

function LessonTypeChips({
  types,
  selected,
  onChange,
}: {
  types:    PortalLessonType[];
  selected: string | null;
  onChange: (name: string | null) => void;
}) {
  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto">
      <button
        onClick={() => onChange(null)}
        className={cn(
          'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors',
          selected === null
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
        )}
      >
        Alla
      </button>
      {types.map(lt => (
        <button
          key={lt.id}
          onClick={() => onChange(lt.name)}
          className={cn(
            'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors',
            selected === lt.name
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
          )}
        >
          {lt.name}
        </button>
      ))}
    </div>
  );
}

// ─── My waitlist section ──────────────────────────────────────────────────────

function MyWaitlistSection() {
  const { data: entries }  = usePortalMyWaitlist();
  const leaveWaitlist      = usePortalLeaveWaitlist();
  const [leavingId, setLeavingId] = useState<string | null>(null);

  const active = (entries ?? []).filter(e => e.status === 'waiting' || e.status === 'notified');
  if (!active.length) return null;

  function handleLeave(id: string) {
    setLeavingId(id);
    leaveWaitlist.mutate(id, {
      onSettled: () => setLeavingId(null),
    });
  }

  return (
    <div className="px-4 pb-6">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
        Mina väntelistor
      </h2>
      <div className="space-y-2">
        {active.map(entry => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 p-3.5 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-800/60"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Bell className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                {entry.lesson_type_name ?? 'Okänd lektionstyp'}
              </span>
            </div>
            <button
              onClick={() => handleLeave(entry.id)}
              disabled={leavingId === entry.id}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 transition-colors"
            >
              {leavingId === entry.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <X className="w-3.5 h-3.5" />
              }
              Lämna
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Slot card ────────────────────────────────────────────────────────────────

function SlotCard({
  slot, onConfirm, booked, isPreferred,
}: {
  slot:        PortalSlot;
  onConfirm:   (slot: PortalSlot) => void;
  booked:      boolean;
  isPreferred: boolean;
}) {
  const duration   = slotDuration(slot.starts_at, slot.ends_at);
  const spotsLeft  = slot.max_bookings - slot.current_bookings;
  const instructor = [slot.instructor_first_name, slot.instructor_last_name].filter(Boolean).join(' ') || 'Instruktör';

  return (
    <div className={cn(
      'bg-white dark:bg-gray-900 rounded-2xl border p-4 flex items-start gap-4',
      isPreferred
        ? 'border-violet-200 dark:border-violet-800/60'
        : 'border-gray-100 dark:border-gray-800',
    )}>
      {/* Time column */}
      <div className="shrink-0 text-center">
        <p className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">
          {formatTime(slot.starts_at)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {formatTime(slot.ends_at)}
        </p>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{instructor}</p>
          {isPreferred && (
            <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full">
              <Star className="w-2.5 h-2.5 fill-current" />
              Passar dig
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {duration} min
          </span>
          {slot.lesson_type_name && (
            <span>{slot.lesson_type_name}</span>
          )}
          <span className={cn(spotsLeft === 1 ? 'text-amber-500' : 'text-gray-400')}>
            {spotsLeft} {spotsLeft === 1 ? 'plats kvar' : 'platser kvar'}
          </span>
        </div>
        {(slot.location_name ?? slot.vehicle_label) && (
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mt-1">
            {slot.location_name && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                {slot.location_name}
              </span>
            )}
            {slot.vehicle_label && (
              <span className="flex items-center gap-1 truncate">
                <Car className="w-3 h-3 shrink-0" />
                {slot.vehicle_label}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action */}
      {booked ? (
        <div className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-600 dark:text-green-400 text-sm font-semibold">
          <CheckCircle className="w-4 h-4" />
          Bokad
        </div>
      ) : (
        <button
          onClick={() => onConfirm(slot)}
          className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Boka
        </button>
      )}
    </div>
  );
}

// ─── Booking confirm sheet ────────────────────────────────────────────────────

function BookingConfirmSheet({
  slot, lessonTypes, onClose, onConfirm, isPending,
}: {
  slot:        PortalSlot;
  lessonTypes: PortalLessonType[];
  onClose:     () => void;
  onConfirm:   (chosenLessonTypeId?: string) => void;
  isPending:   boolean;
}) {
  const instructor = [slot.instructor_first_name, slot.instructor_last_name].filter(Boolean).join(' ') || 'Instruktör';
  const duration   = slotDuration(slot.starts_at, slot.ends_at);
  // A generic-availability slot has no fixed type — the student must pick
  // one here before confirming, same requirement staff already have via
  // BookingDialog for the equivalent staff-side slot.
  const needsType = slot.lesson_type_name === null;
  const [chosenTypeId, setChosenTypeId] = useState<string>('');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Bekräfta bokning</h2>
        <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 px-4 py-6 space-y-4">
        <div className="p-5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800 space-y-3">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">Datum</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 capitalize">
                {formatDate(slot.starts_at.slice(0, 10))}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">Tid</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {formatTime(slot.starts_at)}–{formatTime(slot.ends_at)}
                <span className="font-normal text-gray-500 dark:text-gray-400 ml-1">({duration} min)</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">Instruktör</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{instructor}</p>
            </div>
          </div>
          {slot.location_name && (
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">Plats</p>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{slot.location_name}</p>
              </div>
            </div>
          )}
          {slot.vehicle_label && (
            <div className="flex items-center gap-3">
              <Car className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">Fordon</p>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{slot.vehicle_label}</p>
              </div>
            </div>
          )}
          {slot.lesson_type_name && (
            <div className="pt-1 border-t border-blue-100 dark:border-blue-800">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{slot.lesson_type_name}</p>
            </div>
          )}
        </div>

        {needsType && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Lektionstyp *
            </label>
            <select
              value={chosenTypeId}
              onChange={(e) => setChosenTypeId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            >
              <option value="">Välj lektionstyp…</option>
              {lessonTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="px-4 pb-6 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
        <button
          onClick={() => onConfirm(needsType ? chosenTypeId : undefined)}
          disabled={isPending || (needsType && !chosenTypeId)}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Bekräfta bokning
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

// ─── Waitlist sheet ───────────────────────────────────────────────────────────

function WaitlistSheet({ onClose }: { onClose: () => void }) {
  const { data: lessonTypes, isLoading: typesLoading } = usePortalLessonTypes();
  const { data: myWaitlist } = usePortalMyWaitlist();
  const joinWaitlist = usePortalJoinWaitlist();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const activeEntryIds = new Set((myWaitlist ?? []).map(e => e.lesson_type_id));

  function handleJoin() {
    if (!selectedType) return;
    joinWaitlist.mutate(
      { lesson_type_id: selectedType },
      {
        onSuccess: () => setSuccess(true),
        onError:   (e) => alert(e instanceof Error ? e.message : 'Kunde inte läggas till på väntelistan.'),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Väntelistan</h2>
        <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {success ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Du är nu på väntelistan!</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
            Vi meddelar dig när en ledig tid öppnar för den valda lektionstypen.
          </p>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl transition-colors"
          >
            Stäng
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Välj vilken typ av lektion du vill vänta på. Du meddelas när en ledig tid öppnar.
            </p>

            {typesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}
              </div>
            ) : !lessonTypes || lessonTypes.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                Inga lektionstyper hittades. Kontakta skolan.
              </p>
            ) : (
              <div className="space-y-2">
                {lessonTypes.map(lt => {
                  const alreadyOn = activeEntryIds.has(lt.id);
                  return (
                    <button
                      key={lt.id}
                      onClick={() => !alreadyOn && setSelectedType(lt.id)}
                      disabled={alreadyOn}
                      className={cn(
                        'w-full text-left flex items-center justify-between gap-3 p-4 rounded-2xl border-2 transition-all',
                        alreadyOn
                          ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 opacity-70 cursor-default'
                          : selectedType === lt.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-200',
                      )}
                    >
                      <span className={cn(
                        'text-sm font-semibold',
                        alreadyOn ? 'text-green-700 dark:text-green-400' : 'text-gray-800 dark:text-gray-200',
                      )}>
                        {lt.name}
                      </span>
                      {alreadyOn && (
                        <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full shrink-0">
                          Redan på listan
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 pb-6 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={handleJoin}
              disabled={!selectedType || joinWaitlist.isPending}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              {joinWaitlist.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              Skriv upp mig
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── StudentPortalBokaPage ────────────────────────────────────────────────────

export function StudentPortalBokaPage() {
  const [mondayStr,    setMondayStr]   = useState(() => getMondayOf(toDateStr(new Date())));
  const [selectedDay,  setSelectedDay] = useState(() => toDateStr(new Date()));
  const [typeFilter,   setTypeFilter]  = useState<string | null>(null);
  const [booked,       setBooked]      = useState<string | null>(null);
  const [pendingSlot,  setPendingSlot] = useState<PortalSlot | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);

  const todayStr  = toDateStr(new Date());
  const sundayStr = useMemo(() => addDays(mondayStr, 6), [mondayStr]);

  // Fetch the full week; filter client-side to selected day + lesson type
  const weekFromDt = useMemo(() => new Date(`${mondayStr}T00:00:00`).toISOString(), [mondayStr]);
  const weekToDt   = useMemo(() => new Date(`${sundayStr}T23:59:59`).toISOString(), [sundayStr]);

  const { data: slots, isLoading, isError } = usePortalSlots(weekFromDt, weekToDt);
  const createBooking = usePortalCreateBooking();
  const { data: lessonTypes } = usePortalLessonTypes();
  const preferences = usePortalPreferences();

  // Build per-day slot count for the week strip dots
  const slotsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of (slots ?? [])) {
      const day = s.starts_at.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return map;
  }, [slots]);

  const daySlots = useMemo(
    () => (slots ?? []).filter(s => s.starts_at.startsWith(selectedDay)),
    [slots, selectedDay],
  );

  // "Alla" must mean all — generic-availability slots (lesson_type_name
  // null) used to be hidden under "Alla" because there was no unambiguous
  // type to book them as, which made "Alla" show FEWER results than any
  // specific tab and made real availability invisible whenever an org's
  // slots were mostly type-less (e.g. freshly auto-provisioned instructor
  // availability). Generic slots are now shown everywhere; which type the
  // booking is for is resolved in BookingConfirmSheet instead of by hiding
  // the slot until a tab happens to disambiguate it.
  const filteredSlots = useMemo(
    () => typeFilter ? daySlots.filter(s => s.lesson_type_name === typeFilter || s.lesson_type_name === null) : daySlots,
    [daySlots, typeFilter],
  );

  function handlePrevWeek() {
    const m = addDays(mondayStr, -7);
    setMondayStr(m);
    setSelectedDay(m);
  }

  function handleNextWeek() {
    const m = addDays(mondayStr, 7);
    setMondayStr(m);
    setSelectedDay(m);
  }

  function handleToday() {
    const today = toDateStr(new Date());
    setMondayStr(getMondayOf(today));
    setSelectedDay(today);
  }

  function handleConfirmBooking(chosenLessonTypeId?: string) {
    if (!pendingSlot) return;
    const slotId = pendingSlot.id;
    // Generic slots (lesson_type_name null) need an explicit type to book
    // as — BookingConfirmSheet collects it directly when needed rather
    // than inferring it from whichever tab happens to be active, since
    // generic slots are now visible under every tab including "Alla".
    const lessonTypeId = pendingSlot.lesson_type_name === null ? chosenLessonTypeId : undefined;
    createBooking.mutate({ slotId, ...(lessonTypeId ? { lessonTypeId } : {}) }, {
      onSuccess: () => {
        setBooked(slotId);
        setPendingSlot(null);
      },
      onError: (err) => {
        setPendingSlot(null);
        alert(err instanceof Error ? err.message : 'Bokning misslyckades. Försök igen.');
      },
    });
  }

  return (
    <div className="max-w-lg mx-auto">
      <WeekStrip
        mondayStr={mondayStr}
        selectedDay={selectedDay}
        todayStr={todayStr}
        slotsByDay={slotsByDay}
        onSelectDay={setSelectedDay}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
      />

      {showWaitlist && <WaitlistSheet onClose={() => setShowWaitlist(false)} />}
      {pendingSlot && (
        <BookingConfirmSheet
          slot={pendingSlot}
          lessonTypes={lessonTypes ?? []}
          onClose={() => setPendingSlot(null)}
          onConfirm={handleConfirmBooking}
          isPending={createBooking.isPending}
        />
      )}

      {(lessonTypes ?? []).length > 0 && (
        <LessonTypeChips
          types={lessonTypes ?? []}
          selected={typeFilter}
          onChange={setTypeFilter}
        />
      )}

      <div className="px-4 py-4 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          {formatDate(selectedDay)}
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/40">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">Kunde inte hämta lediga pass. Försök igen.</p>
          </div>
        ) : filteredSlots.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center gap-3">
            <CalendarDays className="w-12 h-12 text-gray-200 dark:text-gray-700" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">
              Inga lediga pass {typeFilter ? 'för detta filter' : 'denna dag'}
            </p>
            {typeFilter ? (
              <button
                onClick={() => setTypeFilter(null)}
                className="text-sm text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                Visa alla lektionstyper
              </button>
            ) : (
              <>
                <p className="text-sm text-gray-400 dark:text-gray-500">Prova ett annat datum.</p>
                <button
                  onClick={() => setShowWaitlist(true)}
                  className="mt-2 flex items-center gap-2 px-4 py-2.5 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-600 dark:text-blue-400 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <Bell className="w-4 h-4" />
                  Skriv upp mig på väntelistan
                </button>
              </>
            )}
          </div>
        ) : (
          filteredSlots.map(slot => (
            <SlotCard
              key={slot.id}
              slot={slot}
              onConfirm={setPendingSlot}
              booked={booked === slot.id}
              isPreferred={isPreferredSlot(slot, preferences)}
            />
          ))
        )}
      </div>

      <MyWaitlistSection />
    </div>
  );
}
