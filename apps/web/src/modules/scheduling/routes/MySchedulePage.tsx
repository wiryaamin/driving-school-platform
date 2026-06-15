import { useRef, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import { ChevronLeft, ChevronRight, CalendarDays, Users, CircleDot, BookOpen } from 'lucide-react';
import { Skeleton } from '@platform/ui';
import { useSession } from '@shared/hooks/useSession.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useSlotList } from '../hooks/useSlots.js';
import { useCalendarView } from '../hooks/useCalendarView.js';
import { SchedulingCalendar } from '../components/SchedulingCalendar.js';
import { SlotDetailSheet } from '../components/SlotDetailSheet.js';
import { slotToCalendarEvent } from '../lib/calendarUtils.js';
import { cn } from '@/lib/utils.js';
import type { LessonSlot } from '@platform/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtWeekTitle(title: string): string {
  return title;
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({
  icon: Icon,
  label,
  value,
  color,
  loading,
}: {
  icon:    React.ElementType;
  label:   string;
  value:   number | string;
  color:   string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-xs font-medium">
      <Icon className={cn('w-3.5 h-3.5', color)} />
      <span className="text-muted-foreground">{label}</span>
      {loading
        ? <span className="w-4 h-3 bg-muted animate-pulse rounded" />
        : <span className="font-bold text-foreground">{value}</span>
      }
    </div>
  );
}

// ─── MySchedulePage ───────────────────────────────────────────────────────────

export function MySchedulePage() {
  const calendarRef = useRef<FullCalendar>(null);

  const { user, profile } = useSession();

  // ── Instructors ──────────────────────────────────────────────────────────
  const { data: instructorsData, isLoading: instructorsLoading } = useInstructorList({ per_page: 100 });
  const instructors = instructorsData?.data ?? [];

  // Instructor linked to the current user account
  const linkedInstructor = useMemo(
    () => instructors.find(i => i.user_id === user?.id) ?? null,
    [instructors, user?.id],
  );

  // Allow admin to override to any instructor for viewing
  const [overrideId, setOverrideId] = useState<string | null>(null);

  const activeInstructor = overrideId
    ? (instructors.find(i => i.id === overrideId) ?? linkedInstructor)
    : linkedInstructor;

  // ── Calendar view state ───────────────────────────────────────────────────
  const { initialView, currentTitle, dateRange, handleDatesSet } = useCalendarView();

  const instructorMap = useMemo(
    () => activeInstructor
      ? { [activeInstructor.id]: `${activeInstructor.first_name} ${activeInstructor.last_name}` }
      : {},
    [activeInstructor],
  );

  // ── Slot query for the visible range ─────────────────────────────────────
  const { data: slotsData, isLoading: slotsLoading } = useSlotList(
    {
      instructor_id: activeInstructor?.id,
      per_page:      200,
      sort_by:       'starts_at',
      sort_dir:      'asc',
      ...(dateRange.from ? { from: dateRange.from } : {}),
      ...(dateRange.to   ? { to:   dateRange.to   } : {}),
    },
    { enabled: Boolean(activeInstructor?.id) && Boolean(dateRange.from) },
  );

  const slots  = slotsData?.data ?? [];
  const events = useMemo(() => slots.map(slotToCalendarEvent), [slots]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalSlots  = slots.length;
  const bookedSlots = slots.filter(s => s.current_bookings > 0).length;
  const openSlots   = slots.filter(s => s.status === 'open' && s.current_bookings < s.max_bookings).length;

  // ── Slot detail sheet ─────────────────────────────────────────────────────
  const [selectedSlot, setSelectedSlot] = useState<LessonSlot | null>(null);
  const [sheetOpen,    setSheetOpen]    = useState(false);

  function handleSlotClick(slot: LessonSlot) {
    setSelectedSlot(slot);
    setSheetOpen(true);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function handlePrev()  { calendarRef.current?.getApi().prev(); }
  function handleNext()  { calendarRef.current?.getApi().next(); }
  function handleToday() { calendarRef.current?.getApi().today(); }

  // ── No-instructor fallback ────────────────────────────────────────────────
  const showInstructorSelector = !instructorsLoading && !linkedInstructor;

  const displayName = activeInstructor
    ? `${activeInstructor.first_name} ${activeInstructor.last_name}`
    : (profile ? `${profile.first_name} ${profile.last_name}` : 'Mitt schema');

  return (
    <>
      <div className="flex flex-col h-full min-h-0 -mx-6 -mt-4">

        {/* ── Header bar ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-semibold text-foreground">
              {instructorsLoading
                ? 'Mitt schema'
                : linkedInstructor
                  ? `${linkedInstructor.first_name}s schema`
                  : 'Mitt schema'
              }
            </h1>
            {/* Admin instructor override selector */}
            {showInstructorSelector && instructors.length > 0 && (
              <select
                value={overrideId ?? ''}
                onChange={(e) => setOverrideId(e.target.value || null)}
                className="ml-2 h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="">Välj instruktör</option>
                {instructors.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.first_name} {i.last_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Stats chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatChip icon={BookOpen}   label="Pass"    value={totalSlots}  color="text-primary"     loading={slotsLoading} />
            <StatChip icon={Users}      label="Bokade"  value={bookedSlots} color="text-red-500"     loading={slotsLoading} />
            <StatChip icon={CircleDot}  label="Lediga"  value={openSlots}   color="text-green-500"   loading={slotsLoading} />
          </div>
        </div>

        {/* ── Calendar nav bar ──────────────────────────────────────────── */}
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
            aria-label="Föregående vecka"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNext}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
            aria-label="Nästa vecka"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-foreground ml-1 capitalize">
            {currentTitle || fmtWeekTitle(displayName)}
          </span>
        </div>

        {/* ── Calendar content ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {instructorsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded" />
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

      {/* Slot detail sheet */}
      <SlotDetailSheet slot={selectedSlot} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
