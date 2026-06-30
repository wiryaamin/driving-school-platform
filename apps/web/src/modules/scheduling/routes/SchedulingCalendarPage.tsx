import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import type FullCalendar from '@fullcalendar/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from '@platform/ui';
import { SchedulingCalendar } from '../components/SchedulingCalendar.js';
import { SlotDetailSheet } from '../components/SlotDetailSheet.js';
import { BookingDialog } from '../components/BookingDialog.js';
import { CreateSlotSheet } from '../components/CreateSlotSheet.js';
import { MultiInstructorGrid } from '../components/MultiInstructorGrid.js';
import { SchedulingActionToolbar } from '../components/SchedulingActionToolbar.js';
import { SubstituteInstructorDialog } from '../components/SubstituteInstructorDialog.js';
import { HittaLedigTidDialog } from '../components/HittaLedigTidDialog.js';
import { useCalendarView } from '../hooks/useCalendarView.js';
import { useSlotList } from '../hooks/useSlots.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useUpdateSlotTiming } from '../hooks/useSchedulingMutations.js';
import { slotToCalendarEvent } from '../lib/calendarUtils.js';
import { cn } from '@/lib/utils.js';
import type { LessonSlot } from '@platform/types';
import type { SlotDropInfo } from '../components/SchedulingCalendar.js';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function addWeeks(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(d.getDate() + n * 7);
  return result;
}

function formatWeekTitle(weekStart: Date, numWeeks: number): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + (numWeeks === 1 ? 6 : numWeeks * 7 - 1));
  const startFmt = weekStart.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
  const endFmt   = weekEnd.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${startFmt} – ${endFmt}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SchemaTab  = 'bokningsschema' | 'resursschema';
type GridView   = 'dag' | 'vecka' | '5veckor';


// ─── Filter Row ───────────────────────────────────────────────────────────────

function FilterRow({
  filterDate,
  showWeekends,
  onFilterDateChange,
  onShowWeekendsChange,
}: {
  filterDate:           string;
  showWeekends:         boolean;
  onFilterDateChange:   (d: string) => void;
  onShowWeekendsChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-muted/20 border-b border-border">

      {/* Date filter */}
      <div className="relative flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => onFilterDateChange(e.target.value)}
          className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        {filterDate && (
          <button
            onClick={() => onFilterDateChange('')}
            className="text-muted-foreground/50 hover:text-muted-foreground"
            aria-label="Rensa datum"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showWeekends}
            onChange={(e) => onShowWeekendsChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-primary"
          />
          <span className="text-xs text-muted-foreground">Visa helger</span>
        </label>
      </div>
    </div>
  );
}

// ─── Grid Navigation Bar ──────────────────────────────────────────────────────

function GridNavBar({
  title,
  view,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onCreateSlot,
}: {
  title:         string;
  view:          GridView;
  onPrev:        () => void;
  onNext:        () => void;
  onToday:       () => void;
  onViewChange:  (v: GridView) => void;
  onCreateSlot:  () => void;
}) {
  const VIEWS: { value: GridView; label: string }[] = [
    { value: 'dag',     label: 'Dag'     },
    { value: 'vecka',   label: 'Vecka'   },
    { value: '5veckor', label: '5 veckor' },
  ];

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-card">
      {/* Left: nav */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToday}
          className="px-3 py-1 text-xs font-medium rounded border border-border bg-background hover:bg-accent transition-colors"
        >
          Idag
        </button>
        <button
          onClick={onPrev}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          aria-label="Föregående"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onNext}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          aria-label="Nästa"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground ml-1 capitalize">{title}</span>
      </div>

      {/* Right: create + view switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={onCreateSlot}
          className="px-3 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Nytt pass
        </button>
        <div className="flex items-center rounded border border-input bg-background p-0.5 gap-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => onViewChange(v.value)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                view === v.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Resursschema Tab ─────────────────────────────────────────────────────────

function ResursschemaTab() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 gap-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        <svg className="w-7 h-7 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">Resursschema</p>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          Schemalägg fordon, simulatorer och lokaler. Koppla resurser till lektioner och se konflikter i realtid.
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
        Kommer snart
      </span>
    </div>
  );
}

// ─── SchedulingCalendarPage ───────────────────────────────────────────────────

export function SchedulingCalendarPage() {
  const navigate      = useNavigate();
  const [searchParams] = useSearchParams();
  const calendarRef = useRef<FullCalendar>(null);

  // ── Tab & view state ─────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState<SchemaTab>('bokningsschema');
  const [gridView,     setGridView]     = useState<GridView>('vecka');
  const [weekStart,    setWeekStart]    = useState(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const d = new Date(dateParam + 'T12:00:00');
      if (!isNaN(d.getTime())) return getMonday(d);
    }
    return getMonday(new Date());
  });
  const [showWeekends, setShowWeekends] = useState(true);
  const [filterDate,   setFilterDate]   = useState('');

  // ── Sheet / dialog state ─────────────────────────────────────────────────
  const [selectedSlot,    setSelectedSlot]    = useState<LessonSlot | null>(null);
  const [sheetOpen,       setSheetOpen]       = useState(false);
  const [quickBookSlot,   setQuickBookSlot]   = useState<LessonSlot | null>(null);
  const [quickBookOpen,   setQuickBookOpen]   = useState(false);
  const [createSlotOpen,  setCreateSlotOpen]  = useState(false);
  const [substituteOpen,      setSubstituteOpen]      = useState(false);
  const [hittaLedigTidOpen,   setHittaLedigTidOpen]   = useState(false);

  // ── FullCalendar (Dag view) state ────────────────────────────────────────
  const {
    initialView,
    currentTitle,
    dateRange,
    selectedInstructorIds,
    setSelectedInstructorIds,
    handleDatesSet,
  } = useCalendarView();

  const selectedInstructorId = selectedInstructorIds[0] ?? null;

  // ── Lesson types ─────────────────────────────────────────────────────────────
  const { data: lessonTypes = [] } = useLessonTypes();
  const lessonTypeMap = useMemo(
    () => Object.fromEntries(
      lessonTypes.map((lt) => [lt.id, lt.name.length > 7 ? lt.name.slice(0, 7) : lt.name])
    ),
    [lessonTypes],
  );

  // ── Instructors ──────────────────────────────────────────────────────────
  const { data: instructorsData } = useInstructorList({ per_page: 50 });
  const instructors = useMemo(
    () => (instructorsData?.data ?? []).filter((i) => i.employment_type !== 'inactive' && !i.deleted_at),
    [instructorsData],
  );

  const instructorMap = useMemo(
    () => Object.fromEntries(instructors.map((i) => [i.id, `${i.first_name} ${i.last_name}`])),
    [instructors],
  );

  // ── Grid date range ──────────────────────────────────────────────────────
  const numWeeks = gridView === '5veckor' ? 5 : 1;

  // Use start-of-day local time for the range boundaries so slots stored in UTC
  // that start at 06:00 UTC (08:00 Swedish) are not accidentally excluded.
  const gridFrom = useMemo(() => {
    const d = new Date(weekStart);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [weekStart]);

  const gridTo = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + numWeeks * 7);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [weekStart, numWeeks]);

  // ── Slot queries ─────────────────────────────────────────────────────────
  // Multi-instructor grid: fetch ALL instructors' slots for the grid range
  const { data: gridSlotsData, isLoading: gridLoading } = useSlotList({
    per_page: 500,
    sort_by:  'starts_at',
    sort_dir: 'asc',
    from:     gridFrom,
    to:       gridTo,
  });

  // FullCalendar day view: fetch filtered slots
  const { data: fcSlotsData, isLoading: fcLoading, error: fcError, refetch: fcRefetch } = useSlotList({
    per_page: 100,
    sort_by:  'starts_at',
    sort_dir: 'asc',
    ...(dateRange.from         ? { from:         dateRange.from         } : {}),
    ...(dateRange.to           ? { to:            dateRange.to           } : {}),
    ...(selectedInstructorId   ? { instructor_id: selectedInstructorId   } : {}),
  });

  const updateSlotTiming = useUpdateSlotTiming();

  const fcEvents = useMemo(
    () => (fcSlotsData?.data ?? []).map(slotToCalendarEvent),
    [fcSlotsData],
  );

  const gridSlots = useMemo(
    () => gridSlotsData?.data ?? [],
    [gridSlotsData],
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleGridPrev  = useCallback(() => setWeekStart((w) => addWeeks(w, numWeeks === 5 ? -5 : -1)), [numWeeks]);
  const handleGridNext  = useCallback(() => setWeekStart((w) => addWeeks(w, numWeeks === 5 ?  5 :  1)), [numWeeks]);
  const handleGridToday = useCallback(() => setWeekStart(getMonday(new Date())), []);

  function handleFCPrev()  { calendarRef.current?.getApi().prev(); }
  function handleFCNext()  { calendarRef.current?.getApi().next(); }
  function handleFCToday() { calendarRef.current?.getApi().today(); }
  // ── View change ───────────────────────────────────────────────────────────
  // When switching to day-view we need FullCalendar to be rendered before calling
  // its API. useEffect fires after the render cycle, replacing the fragile setTimeout.
  function handleGridViewChange(v: GridView) {
    setGridView(v);
  }

  useEffect(() => {
    if (gridView === 'dag') {
      calendarRef.current?.getApi().changeView('timeGridDay');
    }
  }, [gridView]);

  // ── Slot interaction ──────────────────────────────────────────────────────
  function handleSlotClick(slot: LessonSlot) {
    setSelectedSlot(slot);
    if (slot.status === 'open' && slot.current_bookings === 0) {
      setQuickBookSlot(slot);
      setQuickBookOpen(true);
    } else {
      setSheetOpen(true);
    }
  }

  function handleSlotDrop({ slot, newStart, newEnd, revert }: SlotDropInfo) {
    updateSlotTiming.mutate(
      { id: slot.id, starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() },
      {
        onSuccess: () => { toast({ title: 'Pass flyttat' }); },
        onError:   (err) => {
          revert();
          toast({
            title:       'Flytt misslyckades',
            description: err instanceof Error ? err.message : 'Kontrollera tillgänglighet.',
            variant:     'destructive',
          });
        },
      },
    );
  }

  const gridTitle = gridView === 'dag'
    ? new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
    : formatWeekTitle(weekStart, numWeeks);

  const instructorFilterOptions = useMemo(
    () => instructors.map((i) => ({ id: i.id, name: `${i.first_name} ${i.last_name}` })),
    [instructors],
  );

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const TABS: { key: SchemaTab; label: string; comingSoon?: boolean }[] = [
    { key: 'bokningsschema', label: 'Bokningsschema' },
    { key: 'resursschema',   label: 'Resursschema',  comingSoon: true },
  ];

  return (
    <>
      <div className="flex flex-col h-full min-h-0 -mx-6 -mt-4">

        {/* Tab bar */}
        <div className="flex items-end border-b border-border px-4 bg-card shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
              )}
            >
              {tab.label}
              {tab.comingSoon && (
                <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded leading-none dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                  Snart
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ─── Resursschema ───────────────────────────────────────────────── */}
        {activeTab === 'resursschema' && <ResursschemaTab />}

        {/* ─── Bokningsschema ──────────────────────────────────────────────── */}
        {activeTab === 'bokningsschema' && (
          <div className="flex flex-col flex-1 min-h-0">

            {/* Action toolbar */}
            <SchedulingActionToolbar
              onNavigate={navigate}
              onHittaLedigTid={() => setHittaLedigTidOpen(true)}
              onSubstitute={() => setSubstituteOpen(true)}
            />

            {/* Filter row */}
            <FilterRow
              filterDate={filterDate}
              showWeekends={showWeekends}
              onFilterDateChange={(d) => {
                setFilterDate(d);
                if (d) {
                  const date = new Date(d + 'T12:00:00');
                  if (!isNaN(date.getTime())) {
                    setWeekStart(getMonday(date));
                    if (gridView === 'dag') {
                      calendarRef.current?.getApi().gotoDate(date);
                    }
                  }
                }
              }}
              onShowWeekendsChange={setShowWeekends}
            />

            {/* Navigation bar */}
            <GridNavBar
              title={gridView === 'dag' ? currentTitle || gridTitle : gridTitle}
              view={gridView}
              onPrev={gridView === 'dag' ? handleFCPrev : handleGridPrev}
              onNext={gridView === 'dag' ? handleFCNext : handleGridNext}
              onToday={gridView === 'dag' ? handleFCToday : handleGridToday}
              onViewChange={handleGridViewChange}
              onCreateSlot={() => setCreateSlotOpen(true)}
            />

            {/* Calendar content */}
            <div className="flex-1 overflow-auto px-4 py-3">

              {gridView === 'dag' ? (
                /* ── Day view: FullCalendar ──────────────────────────────── */
                <div className="space-y-3">
                  {/* Instructor pills */}
                  {instructorFilterOptions.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                      <button
                        onClick={() => setSelectedInstructorIds([])}
                        className={cn(
                          'shrink-0 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                          !selectedInstructorId
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent',
                        )}
                      >
                        Alla lärare
                      </button>
                      {instructorFilterOptions.map((i) => (
                        <button
                          key={i.id}
                          onClick={() => setSelectedInstructorIds([i.id])}
                          className={cn(
                            'shrink-0 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                            selectedInstructorId === i.id
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent',
                          )}
                        >
                          {i.name.split(' ').pop()}
                        </button>
                      ))}
                    </div>
                  )}

                  {fcError && (
                    <div className="flex items-center justify-between text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-4 py-3">
                      <span>Det gick inte att hämta schemat.</span>
                      <button
                        onClick={() => void fcRefetch()}
                        className="ml-4 shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline"
                      >
                        Försök igen
                      </button>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <SchedulingCalendar
                      calendarRef={calendarRef}
                      events={fcEvents}
                      initialView={initialView}
                      onDatesSet={handleDatesSet}
                      onSlotClick={handleSlotClick}
                      onSlotDrop={handleSlotDrop}
                      isLoading={fcLoading}
                      instructorMap={instructorMap}
                    />
                  </div>
                </div>
              ) : (
                /* ── Week / 5-week view: multi-instructor grid ───────────── */
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <MultiInstructorGrid
                    slots={gridSlots}
                    instructors={instructors}
                    weekStart={weekStart}
                    numWeeks={numWeeks}
                    showWeekends={showWeekends}
                    isLoading={gridLoading}
                    lessonTypeMap={lessonTypeMap}
                    onSlotClick={handleSlotClick}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sheets / Dialogs */}
      <SlotDetailSheet slot={selectedSlot} open={sheetOpen} onOpenChange={setSheetOpen} />

      <BookingDialog
        open={quickBookOpen}
        onOpenChange={(open) => {
          setQuickBookOpen(open);
          if (!open) setQuickBookSlot(null);
        }}
        slot={quickBookSlot}
        onSuccess={() => { setQuickBookOpen(false); setQuickBookSlot(null); }}
      />

      <CreateSlotSheet
        open={createSlotOpen}
        onOpenChange={setCreateSlotOpen}
        initialDate={gridView === 'dag'
          ? (dateRange.from ? new Date(dateRange.from) : null)
          : weekStart
        }
        initialInstructorId={selectedInstructorId}
      />

      <SubstituteInstructorDialog
        open={substituteOpen}
        onOpenChange={setSubstituteOpen}
      />

      <HittaLedigTidDialog
        open={hittaLedigTidOpen}
        onOpenChange={setHittaLedigTidOpen}
      />
    </>
  );
}
