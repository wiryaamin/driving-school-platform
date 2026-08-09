import { useRef, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type FullCalendar from '@fullcalendar/react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Users, CircleDot,
  BookOpen, List, CheckCircle, UserX, Loader2, GraduationCap, Rss,
} from 'lucide-react';
import { Skeleton, toast } from '@platform/ui';
import { useSession } from '@shared/hooks/useSession.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useStudentsBatch } from '@modules/students/hooks/useStudents.js';
import { useSlotList } from '../hooks/useSlots.js';
import { useBookingList } from '../hooks/useBookings.js';
import { useCalendarView } from '../hooks/useCalendarView.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useUpdateBookingStatus } from '../hooks/useSchedulingMutations.js';
import { SchedulingCalendar } from '../components/SchedulingCalendar.js';
import { SlotDetailSheet } from '../components/SlotDetailSheet.js';
import { SlotStatusBadge } from '../components/SlotStatusBadge.js';
import { BookingStatusBadge, isTerminalBookingStatus } from '../components/BookingStatusBadge.js';
import { slotToCalendarEvent, formatSlotTime, slotDurationMinutes } from '../lib/calendarUtils.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { cn } from '@/lib/utils.js';
import type { LessonSlot, LessonBooking, Student } from '@platform/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'agenda' | 'calendar';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }

function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatAgendaDate(dateStr: string): string {
  const s = new Date(`${dateStr}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ icon: Icon, label, value, color, loading }: {
  icon:    React.ElementType;
  label:   string;
  value:   number | string;
  color:   string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card text-xs font-medium">
      <Icon className={cn('w-3.5 h-3.5 shrink-0', color)} />
      <span className="text-muted-foreground">{label}</span>
      {loading
        ? <span className="w-5 h-3 bg-muted animate-pulse rounded" />
        : <span className="font-bold text-foreground">{value}</span>
      }
    </div>
  );
}

// ─── Booking row inside Agenda cards ─────────────────────────────────────────

function AgendaBookingRow({
  booking, slotId, student, studentsLoading,
}: {
  booking:         LessonBooking;
  slotId:          string;
  student?:        Student | undefined;
  studentsLoading: boolean;
}) {
  const updateStatus = useUpdateBookingStatus();
  const terminal     = isTerminalBookingStatus(booking.status);
  const busy         = updateStatus.isPending;

  const studentName = student
    ? `${student.first_name} ${student.last_name}`
    : null;

  function handleAttendance(status: 'completed' | 'no_show') {
    updateStatus.mutate(
      { id: booking.id, slot_id: slotId, status },
      {
        onSuccess: () => toast({
          title: status === 'completed' ? 'Närvaro registrerad' : 'Uteblivande registrerat',
        }),
        onError: (err) => toast({
          title:       'Åtgärd misslyckades',
          description: err instanceof Error ? err.message : undefined,
          variant:     'destructive',
        }),
      },
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/40 last:border-0">
      {/* Student info */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          {studentsLoading ? (
            <Skeleton className="h-4 w-28 rounded" />
          ) : studentName ? (
            <p className="text-sm font-medium text-foreground truncate">{studentName}</p>
          ) : (
            <p className="text-xs font-mono text-muted-foreground">{booking.student_id.slice(0, 8)}…</p>
          )}
          {terminal && (
            <div className="mt-0.5">
              <BookingStatusBadge status={booking.status} />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {booking.status === 'confirmed' && !terminal ? (
        <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleAttendance('completed')}
              disabled={busy}
              title="Registrera närvaro"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              <span className="hidden sm:inline">Närvaro</span>
            </button>
            <button
              onClick={() => handleAttendance('no_show')}
              disabled={busy}
              title="Registrera uteblivande"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
              <span className="hidden sm:inline">Uteblev</span>
            </button>
          </div>
        </PermissionGate>
      ) : !terminal ? (
        <BookingStatusBadge status={booking.status} />
      ) : null}
    </div>
  );
}

// ─── Agenda view ──────────────────────────────────────────────────────────────

interface AgendaViewProps {
  instructorId:  string;
  lessonTypeMap: Record<string, string>;
  onSlotClick:   (slot: LessonSlot) => void;
}

function AgendaView({ instructorId, lessonTypeMap, onSlotClick }: AgendaViewProps) {
  const [date, setDate] = useState(todayStr());
  const isToday = date === todayStr();

  // Use local midnight → UTC so Swedish timezone works correctly
  const dayStart = useMemo(() => new Date(`${date}T00:00:00`).toISOString(), [date]);
  const dayEnd   = useMemo(() => new Date(`${date}T23:59:59.999`).toISOString(), [date]);

  const {
    data: slotsData, isLoading: slotsLoading, isError: slotsError, refetch,
  } = useSlotList({
    instructor_id: instructorId,
    from:          dayStart,
    to:            dayEnd,
    per_page:      50,
    sort_by:       'starts_at',
    sort_dir:      'asc',
  });

  const {
    data: bookingsData, isLoading: bookingsLoading,
  } = useBookingList({
    instructor_id: instructorId,
    from:          dayStart,
    to:            dayEnd,
    per_page:      100,
  });

  const slots    = slotsData?.data    ?? [];
  const bookings = bookingsData?.data ?? [];

  // Group bookings by slot_id (exclude cancelled)
  const bookingsBySlot = useMemo(() => {
    const map = new Map<string, LessonBooking[]>();
    for (const b of bookings) {
      if (b.status === 'cancelled') continue;
      const arr = map.get(b.slot_id) ?? [];
      arr.push(b);
      map.set(b.slot_id, arr);
    }
    return map;
  }, [bookings]);

  // Batch-fetch all student names in a single request
  const allStudentIds = useMemo(
    () => [...new Set(bookings.filter(b => b.status !== 'cancelled').map(b => b.student_id))],
    [bookings],
  );
  const { data: studentsData, isLoading: studentsLoading } = useStudentsBatch(allStudentIds);
  const studentMap = useMemo((): Record<string, Student> => {
    if (!studentsData) return {};
    return Object.fromEntries(studentsData.map(s => [s.id, s]));
  }, [studentsData]);

  const loading = slotsLoading || bookingsLoading;

  if (slotsError) {
    return (
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
        <span>Det gick inte att hämta schema.</span>
        <button
          onClick={() => void refetch()}
          className="ml-4 text-xs font-medium underline underline-offset-2 hover:no-underline"
        >
          Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {/* Date navigator */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setDate(todayStr())}
          disabled={isToday}
          className="px-3 py-1 text-xs font-medium rounded border border-border bg-background hover:bg-accent disabled:opacity-40 disabled:cursor-default transition-colors"
        >
          Idag
        </button>
        <button
          onClick={() => setDate(shiftDay(date, -1))}
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
          aria-label="Föregående dag"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => setDate(shiftDay(date, +1))}
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
          aria-label="Nästa dag"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground capitalize ml-1">
          {formatAgendaDate(date)}
        </span>
      </div>

      {/* Slot cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <Skeleton className="h-4 w-1/3 rounded" />
              <Skeleton className="h-3.5 w-full rounded" />
              <Skeleton className="h-3.5 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <CalendarDays className="w-10 h-10 text-muted-foreground/20" />
          <p className="text-sm font-medium text-foreground">
            {isToday ? 'Inga pass idag' : 'Inga pass detta datum'}
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {isToday
              ? 'Du har inga schemalagda lektioner idag.'
              : 'Inga schemalagda lektioner på det valda datumet.'}
          </p>
        </div>
      ) : (
        slots.map((slot) => {
          const slotBookings = bookingsBySlot.get(slot.id) ?? [];
          const startLabel   = formatSlotTime(slot.starts_at);
          const endLabel     = formatSlotTime(slot.ends_at);
          const duration     = slotDurationMinutes(slot);
          const typeName     = lessonTypeMap[slot.lesson_type_id ?? ''] ?? 'Pass';

          return (
            <div
              key={slot.id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* Slot header — tappable to open full detail sheet */}
              <button
                type="button"
                onClick={() => onSlotClick(slot)}
                className="w-full flex items-start justify-between gap-3 px-4 py-3 border-b border-border hover:bg-muted/20 active:bg-muted/30 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground tabular-nums">
                    {startLabel}–{endLabel}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {duration} min
                    </span>
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <GraduationCap className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">{typeName}</span>
                    <span className="text-muted-foreground/40 text-xs">·</span>
                    <Users className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      {slot.current_bookings}/{slot.max_bookings} bokningar
                    </span>
                  </div>
                </div>
                <SlotStatusBadge status={slot.status} />
              </button>

              {/* Booking rows */}
              <div className="px-4">
                {slotBookings.length > 0 ? (
                  slotBookings.map((booking) => (
                    <AgendaBookingRow
                      key={booking.id}
                      booking={booking}
                      slotId={slot.id}
                      student={studentMap[booking.student_id]}
                      studentsLoading={studentsLoading}
                    />
                  ))
                ) : (
                  <p className="py-3 text-xs text-muted-foreground italic">Inga bokningar på detta pass</p>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── MySchedulePage ───────────────────────────────────────────────────────────

export function MySchedulePage() {
  const calendarRef = useRef<FullCalendar>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('agenda');

  const { user, profile } = useSession();

  // ── Instructors ──────────────────────────────────────────────────────────
  const { data: instructorsData, isLoading: instructorsLoading } = useInstructorList({ per_page: 100 });
  const instructors = instructorsData?.data ?? [];

  const linkedInstructor = useMemo(
    () => instructors.find((i) => i.user_id === user?.id) ?? null,
    [instructors, user?.id],
  );

  const [overrideId, setOverrideId] = useState<string | null>(null);
  const activeInstructor = overrideId
    ? (instructors.find((i) => i.id === overrideId) ?? linkedInstructor)
    : linkedInstructor;

  // ── Lesson types (for agenda label lookup) ────────────────────────────────
  const { data: lessonTypesRaw = [] } = useLessonTypes();
  const lessonTypeMap = useMemo(
    () => Object.fromEntries(lessonTypesRaw.map((lt) => [lt.id, lt.name])),
    [lessonTypesRaw],
  );

  // ── Calendar view state ───────────────────────────────────────────────────
  const { initialView, currentTitle, dateRange, handleDatesSet } = useCalendarView();

  const instructorMap = useMemo(
    () => activeInstructor
      ? { [activeInstructor.id]: `${activeInstructor.first_name} ${activeInstructor.last_name}` }
      : {},
    [activeInstructor],
  );

  // ── Slot query — only active in calendar mode ─────────────────────────────
  const { data: slotsData, isLoading: slotsLoading } = useSlotList(
    {
      instructor_id: activeInstructor?.id,
      per_page:      200,
      sort_by:       'starts_at',
      sort_dir:      'asc',
      ...(dateRange.from ? { from: dateRange.from } : {}),
      ...(dateRange.to   ? { to:   dateRange.to   } : {}),
    },
    {
      enabled: viewMode === 'calendar' && Boolean(activeInstructor?.id) && Boolean(dateRange.from),
    },
  );

  const slots  = slotsData?.data ?? [];
  const events = useMemo(() => slots.map(slotToCalendarEvent), [slots]);

  const totalSlots  = slots.length;
  const bookedSlots = slots.filter((s) => s.current_bookings > 0).length;
  const openSlots   = slots.filter((s) => s.status === 'open' && s.current_bookings < s.max_bookings).length;

  // ── Slot detail sheet ─────────────────────────────────────────────────────
  const [selectedSlot, setSelectedSlot] = useState<LessonSlot | null>(null);
  const [sheetOpen,    setSheetOpen]    = useState(false);

  function handleSlotClick(slot: LessonSlot) {
    setSelectedSlot(slot);
    setSheetOpen(true);
  }

  // ── Calendar navigation ───────────────────────────────────────────────────
  function handlePrev()  { calendarRef.current?.getApi().prev(); }
  function handleNext()  { calendarRef.current?.getApi().next(); }
  function handleToday() { calendarRef.current?.getApi().today(); }

  const showInstructorSelector = !instructorsLoading && !linkedInstructor;
  const displayName = activeInstructor
    ? `${activeInstructor.first_name}s schema`
    : ([profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Mitt schema');

  return (
    <>
      <div className="flex flex-col h-full min-h-0 -mx-6 -mt-4">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card shrink-0">

          {/* Title + admin selector */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <CalendarDays className="w-4 h-4 text-primary shrink-0" />
            <h1 className="text-sm font-semibold text-foreground truncate">
              {instructorsLoading ? 'Mitt schema' : displayName}
            </h1>
            {showInstructorSelector && instructors.length > 0 && (
              <PermissionGate permission={Permissions.SCHEDULING_READ}>
                <select
                  value={overrideId ?? ''}
                  onChange={(e) => setOverrideId(e.target.value || null)}
                  className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="">Välj instruktör</option>
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.first_name} {i.last_name}
                    </option>
                  ))}
                </select>
              </PermissionGate>
            )}
          </div>

          {/* Right: stats + view toggle */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {viewMode === 'calendar' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <StatChip icon={BookOpen}  label="Pass"   value={totalSlots}  color="text-primary"   loading={slotsLoading} />
                <StatChip icon={Users}     label="Bokade" value={bookedSlots} color="text-red-500"   loading={slotsLoading} />
                <StatChip icon={CircleDot} label="Lediga" value={openSlots}   color="text-green-500" loading={slotsLoading} />
              </div>
            )}

            {/* iCal subscription link */}
            <Link
              to="/schedule/ical"
              title="Kalenderabonnemang"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Rss className="w-3 h-3" />
              Prenumerera
            </Link>

            {/* View toggle */}
            <div className="flex items-center rounded border border-input bg-background p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode('agenda')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                  viewMode === 'agenda'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <List className="w-3 h-3" />
                Dagslista
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                  viewMode === 'calendar'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <CalendarDays className="w-3 h-3" />
                Kalender
              </button>
            </div>
          </div>
        </div>

        {/* ── Calendar nav bar (calendar mode only) ─────────────────────── */}
        {viewMode === 'calendar' && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0">
            <button
              onClick={handleToday}
              className="px-3 py-1 text-xs font-medium rounded border border-border bg-background hover:bg-accent transition-colors"
            >
              Idag
            </button>
            <button
              onClick={handlePrev}
              className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
              aria-label="Föregående"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
              aria-label="Nästa"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-foreground ml-1 capitalize">
              {currentTitle || displayName}
            </span>
          </div>
        )}

        {/* ── Content ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {instructorsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : !activeInstructor ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">Inget schema kopplat</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Ditt konto är inte kopplat till en instruktör.
                {instructors.length > 0 && ' Välj en instruktör ovan för att visa schema.'}
              </p>
            </div>
          ) : viewMode === 'agenda' ? (
            <AgendaView
              instructorId={activeInstructor.id}
              lessonTypeMap={lessonTypeMap}
              onSlotClick={handleSlotClick}
            />
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <SchedulingCalendar
                calendarRef={calendarRef}
                events={events}
                initialView={initialView}
                onDatesSet={handleDatesSet}
                onSlotClick={handleSlotClick}
                isLoading={slotsLoading}
                instructorMap={instructorMap}
              />
            </div>
          )}
        </div>
      </div>

      <SlotDetailSheet slot={selectedSlot} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
