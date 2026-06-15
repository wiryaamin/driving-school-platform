import { useRef, useMemo, useState, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import { ChevronLeft, ChevronRight, Search, Clock, FileText, CreditCard, User, Eye } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from '@platform/ui';
import { SchedulingCalendar } from '../components/SchedulingCalendar.js';
import { SlotDetailSheet } from '../components/SlotDetailSheet.js';
import { BookingDialog } from '../components/BookingDialog.js';
import { CreateSlotSheet } from '../components/CreateSlotSheet.js';
import { MultiInstructorGrid } from '../components/MultiInstructorGrid.js';
import { useCalendarView, type CalendarViewType } from '../hooks/useCalendarView.js';
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

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SchemaTab  = 'bokningsschema' | 'resursschema';
type GridView   = 'dag' | 'vecka' | '5veckor';

// ─── Action Toolbar ───────────────────────────────────────────────────────────

function ActionToolbar({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-muted/40 border-b border-border">

      {/* Customer search area */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onNavigate('/students')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Search className="w-3 h-3" />
          Sök efter kund
        </button>
        <button
          disabled
          title="Välj en kund för att se kundkortet"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs text-muted-foreground/40 cursor-not-allowed"
        >
          <User className="w-3 h-3" />
          Ingen kund vald
        </button>
        <button
          disabled
          title="Välj en kund för att visa visningsläge"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs text-muted-foreground/40 cursor-not-allowed"
        >
          <Eye className="w-3 h-3" />
          Ingen kund vald
        </button>
      </div>

      <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button
          disabled
          title="Kommer snart — sök efter lediga tider per körkortskategori"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground/40 cursor-not-allowed"
        >
          <Clock className="w-3 h-3" />
          Hitta ledig tid
          <span className="ml-1 text-[9px] font-semibold bg-muted px-1 py-0.5 rounded text-muted-foreground">Snart</span>
        </button>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          onClick={() => onNavigate('/scheduling/list')}
        >
          <FileText className="w-3 h-3" />
          Bokningar
        </button>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          onClick={() => onNavigate('/finance/cash')}
        >
          <CreditCard className="w-3 h-3" />
          Kassa
        </button>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          onClick={() => onNavigate('/students')}
        >
          <User className="w-3 h-3" />
          Kundkort
        </button>
      </div>
    </div>
  );
}

// ─── Filter Row ───────────────────────────────────────────────────────────────

function FilterRow({
  filterDate,
  showWeekends,
  groupPerDay,
  onFilterDateChange,
  onShowWeekendsChange,
  onGroupPerDayChange,
}: {
  filterDate:           string;
  showWeekends:         boolean;
  groupPerDay:          boolean;
  onFilterDateChange:   (d: string) => void;
  onShowWeekendsChange: (v: boolean) => void;
  onGroupPerDayChange:  (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-muted/20 border-b border-border">

      {/* Personalgrupp */}
      <select className="h-7 text-xs border border-border rounded px-2 bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40">
        <option>Filtrera på personalgrupp</option>
      </select>

      {/* Tidmallsgrupp */}
      <select className="h-7 text-xs border border-border rounded px-2 bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40">
        <option>Filtrera på tidmallsgrupp</option>
      </select>

      {/* Resurs search */}
      <select className="h-7 text-xs border border-border rounded px-2 bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40">
        <option>Sök efter resurs</option>
      </select>

      {/* Date filter */}
      <div className="relative flex items-center">
        <span className="text-muted-foreground/50 mr-1.5 text-xs">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => onFilterDateChange(e.target.value)}
          className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        {filterDate && (
          <button
            onClick={() => onFilterDateChange('')}
            className="ml-1 text-muted-foreground/50 hover:text-muted-foreground"
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
            checked={groupPerDay}
            onChange={(e) => onGroupPerDayChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-primary"
          />
          <span className="text-xs text-muted-foreground">Gruppera personal per dag</span>
        </label>
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
  const [filterDate, setFilterDate] = useState('');
  const [view, setView]             = useState<GridView>('vecka');
  const [weekStart, setWeekStart]   = useState(() => getMonday(new Date()));

  function handlePrev()  { setWeekStart((w) => addWeeks(w, view === '5veckor' ? -5 : -1)); }
  function handleNext()  { setWeekStart((w) => addWeeks(w, view === '5veckor' ?  5 :  1)); }
  function handleToday() { setWeekStart(getMonday(new Date())); }

  const title = view === 'dag'
    ? new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : formatWeekTitle(weekStart, view === '5veckor' ? 5 : 1);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-card">
        {/* Resource search */}
        <select className="h-7 text-xs border border-border rounded px-2 bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40">
          <option>Sök efter resurser</option>
        </select>

        {/* Date filter */}
        <div className="relative flex items-center">
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            placeholder="Välj datum"
            className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {filterDate && (
            <button onClick={() => setFilterDate('')} className="ml-1 text-muted-foreground/50 hover:text-muted-foreground">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Nav bar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-1">
          <button onClick={handleToday} className="px-3 py-1 text-xs font-medium rounded border border-border bg-background hover:bg-accent transition-colors">Idag</button>
          <button onClick={handlePrev} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={handleNext} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronRight className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-foreground ml-1">{title}</span>
        </div>
        <div className="flex items-center rounded border border-input bg-background p-0.5 gap-0.5">
          {(['dag', 'vecka', '5veckor'] as GridView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {v === 'dag' ? 'Dag' : v === 'vecka' ? 'Vecka' : '5 veckor'}
            </button>
          ))}
        </div>
      </div>

      {/* Empty time grid */}
      <div className="overflow-auto">
        <table className="border-collapse w-full text-xs">
          <thead>
            <tr className="bg-card">
              <th className="border border-border px-2 py-1 w-16 text-left text-muted-foreground font-medium">
                {view !== 'dag' && `v. ${Math.ceil((weekStart.getDate() + 6) / 7)}`}
              </th>
            </tr>
          </thead>
          <tbody>
            {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'].map((t) => (
              <tr key={t}>
                <td className="border border-border px-2 py-2 w-16 text-right font-mono text-muted-foreground text-[10px]">{t}</td>
                <td className="border border-border h-8 bg-muted/5" />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-center py-10 space-y-2">
          <p className="text-sm text-muted-foreground">Resursschema under implementation</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">Schemalägg fordon, simulatorer och lokaler. Koppla resurser till lektioner och se konflikter i realtid.</p>
          <span className="inline-block text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">Kommer snart</span>
        </div>
      </div>
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
  const [groupPerDay,  setGroupPerDay]  = useState(false);
  const [filterDate,   setFilterDate]   = useState('');

  // ── Sheet / dialog state ─────────────────────────────────────────────────
  const [selectedSlot,   setSelectedSlot]   = useState<LessonSlot | null>(null);
  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [quickBookSlot,  setQuickBookSlot]  = useState<LessonSlot | null>(null);
  const [quickBookOpen,  setQuickBookOpen]  = useState(false);
  const [createSlotOpen, setCreateSlotOpen] = useState(false);

  // ── FullCalendar (Dag view) state ────────────────────────────────────────
  const {
    initialView,
    currentView,
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
  const { data: fcSlotsData, isLoading: fcLoading, error: fcError } = useSlotList({
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
  function handleFCViewChange(view: CalendarViewType) {
    calendarRef.current?.getApi().changeView(view);
  }

  // ── View change ───────────────────────────────────────────────────────────
  function handleGridViewChange(v: GridView) {
    setGridView(v);
    if (v === 'dag') {
      // Switch to FullCalendar day view
      setTimeout(() => calendarRef.current?.getApi().changeView('timeGridDay'), 50);
    }
  }

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
            <ActionToolbar onNavigate={navigate} />

            {/* Filter row */}
            <FilterRow
              filterDate={filterDate}
              showWeekends={showWeekends}
              groupPerDay={groupPerDay}
              onFilterDateChange={setFilterDate}
              onShowWeekendsChange={setShowWeekends}
              onGroupPerDayChange={setGroupPerDay}
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
                    <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-4 py-3">
                      Det gick inte att hämta schemat.
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
    </>
  );
}
