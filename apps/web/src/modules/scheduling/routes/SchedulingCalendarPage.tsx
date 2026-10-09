import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import type FullCalendar from '@fullcalendar/react';
import { ChevronLeft, ChevronRight, ChevronDown, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  toast,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { SchedulingCalendar } from '../components/SchedulingCalendar.js';
import { SlotDetailSheet } from '../components/SlotDetailSheet.js';
import { CreateSlotSheet } from '../components/CreateSlotSheet.js';
import { MultiInstructorGrid } from '../components/MultiInstructorGrid.js';
import { MultiVehicleGrid } from '../components/MultiVehicleGrid.js';
import { SchedulingActionToolbar } from '../components/SchedulingActionToolbar.js';
import { useVehicles } from '@modules/resources/hooks/useVehicles.js';
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

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ─── Veckosammanfattning + teckenförklaring ───────────────────────────────────
// Samma färger som passkorten i MultiInstructorGrid (ledig = grön, bokad = lila,
// blockerad = mörklila).

function WeekSummaryBar({ slots, weekStart, numWeeks }: { slots: LessonSlot[]; weekStart: Date; numWeeks: number }) {
  // The grid query reaches past the last shown day, so count only the days on screen.
  const rangeStart = weekStart.getTime();
  const rangeEnd   = addWeeks(weekStart, numWeeks).getTime();
  const active  = slots.filter((s) => {
    const t = new Date(s.starts_at).getTime();
    return s.status !== 'cancelled' && t >= rangeStart && t < rangeEnd;
  });
  const blocked = active.filter((s) => s.status === 'blocked').length;
  const booked  = active.filter((s) => s.status !== 'blocked' && (s.status === 'full' || s.status === 'in_progress' || s.current_bookings >= s.max_bookings)).length;
  const free    = active.length - blocked - booked;
  const week    = isoWeekNumber(weekStart);
  const weekLabel = numWeeks > 1 ? `Vecka ${week}–${isoWeekNumber(addWeeks(weekStart, numWeeks - 1))}` : `Vecka ${week}`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 pb-2 text-xs">
      <span className="font-semibold text-foreground">{weekLabel}</span>
      <span className="text-muted-foreground tabular-nums">{active.length} pass · {booked} bokade · {free} lediga{blocked > 0 ? ` · ${blocked} blockerade` : ''}</span>
      <span className="flex items-center gap-3 ml-auto text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#DFF4DF] border border-[#B7DDB7]" />Ledig</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#E8DCFF] border border-[#C7AEFF]" />Bokad</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-500" />Blockerad</span>
      </span>
    </div>
  );
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
  lessonTypes = [],
  selectedLessonTypeId = '',
  onLessonTypeChange,
  vehicles = [],
  selectedVehicleId = '',
  onVehicleChange,
  groupByDay,
  onGroupByDayChange,
}: {
  filterDate:            string;
  showWeekends:          boolean;
  onFilterDateChange:    (d: string) => void;
  onShowWeekendsChange:  (v: boolean) => void;
  lessonTypes?:          { id: string; name: string }[];
  selectedLessonTypeId?: string;
  onLessonTypeChange?:   (id: string) => void;
  vehicles?:             { id: string; registration_number: string; make: string; model: string }[];
  selectedVehicleId?:    string;
  onVehicleChange?:      (id: string) => void;
  groupByDay?:           boolean;
  onGroupByDayChange?:   (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col shrink-0 border-b border-border bg-muted/20">

      {/* Row 2: group filters + date picker + checkboxes */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-border/40">

        {/* Filtrera på lektionstyp */}
        {onLessonTypeChange && (
        <div className="relative shrink-0">
          <select
            value={selectedLessonTypeId}
            onChange={(e) => onLessonTypeChange?.(e.target.value)}
            className="h-7 text-[11px] border border-border rounded pl-2 pr-6 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer min-w-[180px]"
          >
            <option value="">Alla lektionstyper</option>
            {lessonTypes.map((lt) => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
        )}

        {/* Välj datum */}
        <div className="relative flex items-center gap-1.5 shrink-0">
          <svg className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => onFilterDateChange(e.target.value)}
            placeholder="Välj datum"
            className="h-7 text-[11px] border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
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

        {/* Checkboxes (right) */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          {onGroupByDayChange && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={groupByDay ?? false}
              onChange={(e) => onGroupByDayChange?.(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-primary"
            />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">Gruppera personal per dag</span>
          </label>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showWeekends}
              onChange={(e) => onShowWeekendsChange(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-primary"
            />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">Visa helger</span>
          </label>
        </div>
      </div>

      {/* Row 3: resource search */}
      {onVehicleChange && (
      <div className="flex items-center px-3 py-1.5">
        <div className="relative shrink-0">
          <select
            value={selectedVehicleId}
            onChange={(e) => onVehicleChange?.(e.target.value)}
            className="h-7 text-[11px] border border-border rounded pl-2 pr-6 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer min-w-[152px]"
          >
            <option value="">Alla fordon</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.registration_number} · {v.make} {v.model}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
      </div>
      )}
    </div>
  );
}

// ─── Lärarfilter (flera lärare) ───────────────────────────────────────────────

const INSTRUCTOR_FILTER_STORAGE_KEY = 'tc.schema.instructorFilter';

function InstructorFilterMenu({
  instructors,
  selectedIds,
  onChange,
}: {
  instructors: { id: string; name: string }[];
  selectedIds: string[];
  onChange:    (ids: string[]) => void;
}) {
  const selected = new Set(selectedIds);
  const label = selectedIds.length === 0
    ? 'Alla lärare'
    : selectedIds.length === 1
      ? instructors.find((i) => i.id === selectedIds[0])?.name ?? '1 lärare'
      : `${selectedIds.length} lärare`;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(instructors.filter((i) => next.has(i.id)).map((i) => i.id));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors max-w-[180px]',
            selectedIds.length > 0
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-background hover:bg-accent text-foreground',
          )}
          aria-label="Filtrera på lärare"
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel className="text-xs">Visa lärare</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={selectedIds.length === 0}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={() => onChange([])}
          className="text-sm"
        >
          Alla lärare
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {instructors.map((i) => (
          <DropdownMenuCheckboxItem
            key={i.id}
            checked={selected.has(i.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(i.id)}
            className="text-sm"
          >
            {i.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  filter,
}: {
  title:         string;
  view:          GridView;
  onPrev:        () => void;
  onNext:        () => void;
  onToday:       () => void;
  onViewChange:  (v: GridView) => void;
  onCreateSlot:  () => void;
  filter?:       React.ReactNode;
}) {
  const VIEWS: { value: GridView; label: string }[] = [
    { value: 'dag',     label: 'Dag'     },
    { value: 'vecka',   label: 'Vecka'   },
    { value: '5veckor', label: '5 veckor' },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card">
      {/* Left: nav */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={onPrev}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          aria-label="Föregående"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onToday}
          className="px-3 py-1 text-xs font-medium rounded border border-border bg-background hover:bg-accent transition-colors"
        >
          Idag
        </button>
        <button
          onClick={onNext}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          aria-label="Nästa"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {filter && <div className="ml-1">{filter}</div>}
        <span className="text-sm font-semibold text-foreground ml-2">{title}</span>
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

// ResursschemaTab is rendered inline inside SchedulingCalendarPage
// so it can share weekStart, gridView, gridSlots, lessonTypeMap, vehicles, etc.

// ─── SchedulingCalendarPage ───────────────────────────────────────────────────

// Schemainställningar (Settings → Schema → Schemainställningar) — organizations.settings.schema.
// {start_time,end_time} become the calendar's visible time range; show_weekends seeds the
// existing weekend-visibility toggle's initial value (applied once, so it never clobbers a
// manual toggle made later in the session).
function useSchemaDisplaySettings() {
  const { organization } = useSession();
  const orgId = organization?.id;
  return useQuery<{ start_time: string; end_time: string; show_weekends: boolean } | null>({
    queryKey: ['org-settings-schema-display', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      const settings = (data as unknown as { settings: Record<string, unknown> } | null)?.settings ?? {};
      const s = (settings['schema'] as Record<string, unknown> | undefined) ?? {};
      return {
        start_time:    typeof s['start_time']      === 'string'  ? s['start_time']      : '06:00:00',
        end_time:      typeof s['end_time']        === 'string'  ? s['end_time']        : '22:00:00',
        show_weekends: typeof s['show_weekends']   === 'boolean' ? s['show_weekends']   : true,
      };
    },
    enabled:   !!orgId,
    staleTime: 60_000,
  });
}

export function SchedulingCalendarPage() {
  const navigate      = useNavigate();
  const [searchParams] = useSearchParams();
  const calendarRef = useRef<FullCalendar>(null);
  const { data: schemaDisplay } = useSchemaDisplaySettings();
  const appliedSchemaDefault = useRef(false);

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
  const [showWeekends,             setShowWeekends]             = useState(true);
  const [filterDate,               setFilterDate]               = useState('');
  const [selectedLessonTypeFilter, setSelectedLessonTypeFilter] = useState('');
  const [selectedVehicleFilter,    setSelectedVehicleFilter]    = useState('');
  const [groupByDay,               setGroupByDay]               = useState(false);

  useEffect(() => {
    if (!schemaDisplay || appliedSchemaDefault.current) return;
    appliedSchemaDefault.current = true;
    setShowWeekends(schemaDisplay.show_weekends);
  }, [schemaDisplay]);

  // ── Sheet / dialog state ─────────────────────────────────────────────────
  const [selectedSlot,    setSelectedSlot]    = useState<LessonSlot | null>(null);
  const [sheetOpen,       setSheetOpen]       = useState(false);
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

  // Ett enda lärarfilter (flera val) för dag-, vecka- och 5-veckorsvyn.
  // Tom lista = alla lärare. Valet sparas per webbläsare.
  const selectedInstructorId = selectedInstructorIds.length === 1 ? selectedInstructorIds[0]! : null;
  const selectedInstructorSet = useMemo(() => new Set(selectedInstructorIds), [selectedInstructorIds]);
  const restoredInstructorFilter = useRef(false);

  // ── Lesson types ─────────────────────────────────────────────────────────────
  const { data: lessonTypes = [] } = useLessonTypes();

  // Category → compact Swedish label shown on slot cards in the grid.
  // Matches the visual convention in the reference ("Vanlig" for driving, "Risk 1" etc.).
  const CATEGORY_LABEL: Record<string, string> = {
    driving:      'Vanlig',
    theory:       'Teori',
    risk1:        'Risk 1',
    risk2:        'Risk 2',
    simulator:    'Simul.',
    group_theory: 'Grupp',
    intensive:    'Intensiv',
    assessment:   'Prov',
  };

  const lessonTypeMap = useMemo(
    () => Object.fromEntries(
      lessonTypes.map((lt) => [
        lt.id,
        CATEGORY_LABEL[lt.category] ?? (lt.name.length > 7 ? lt.name.slice(0, 7) : lt.name),
      ])
    ),
    [lessonTypes],
  );

  // ── Vehicles ─────────────────────────────────────────────────────────────
  const { data: vehiclesRaw = [], isLoading: vehiclesLoading } = useVehicles();
  const vehicles = useMemo(
    () => vehiclesRaw.filter(
      v => v.operational_status !== 'decommissioned' && v.operational_status !== 'inactive',
    ),
    [vehiclesRaw],
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

  useEffect(() => {
    if (restoredInstructorFilter.current || instructors.length === 0) return;
    restoredInstructorFilter.current = true;
    try {
      const raw = window.localStorage.getItem(INSTRUCTOR_FILTER_STORAGE_KEY);
      const ids = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(ids)) {
        const valid = ids.filter((x): x is string => typeof x === 'string' && instructors.some((i) => i.id === x));
        if (valid.length > 0) setSelectedInstructorIds(valid);
      }
    } catch { /* ignore unavailable storage */ }
  }, [instructors, setSelectedInstructorIds]);

  const handleInstructorFilterChange = useCallback((ids: string[]) => {
    setSelectedInstructorIds(ids);
    try { window.localStorage.setItem(INSTRUCTOR_FILTER_STORAGE_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  }, [setSelectedInstructorIds]);

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
    ...(selectedInstructorId       ? { instructor_id:   selectedInstructorId       } : {}),
    ...(selectedLessonTypeFilter   ? { lesson_type_id:  selectedLessonTypeFilter   } : {}),
  });

  const updateSlotTiming = useUpdateSlotTiming();

  const fcEvents = useMemo(
    () => (fcSlotsData?.data ?? [])
      .filter((s) => selectedInstructorSet.size <= 1 || (s.instructor_id !== null && selectedInstructorSet.has(s.instructor_id)))
      .map(slotToCalendarEvent),
    [fcSlotsData, selectedInstructorSet],
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
    // Every slot click opens the full operational command card (SlotDetailSheet) —
    // it already surfaces "Boka lektion" as its primary action for empty slots,
    // plus the matching-students/block/duplicate/delete actions a receptionist
    // needs, which the old direct-to-BookingDialog shortcut never exposed.
    setSelectedSlot(slot);
    setSheetOpen(true);
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

  const filteredInstructors = useMemo(
    () => selectedInstructorSet.size > 0
      ? instructors.filter((i) => selectedInstructorSet.has(i.id))
      : instructors,
    [instructors, selectedInstructorSet],
  );

  const filteredGridSlots = useMemo(() => {
    let result = gridSlots;
    if (selectedInstructorSet.size > 0) result = result.filter((s) => s.instructor_id !== null && selectedInstructorSet.has(s.instructor_id));
    if (selectedLessonTypeFilter) result = result.filter((s) => s.lesson_type_id === selectedLessonTypeFilter);
    return result;
  }, [gridSlots, selectedInstructorSet, selectedLessonTypeFilter]);

  const instructorFilter = (
    <InstructorFilterMenu
      instructors={instructorFilterOptions}
      selectedIds={selectedInstructorIds}
      onChange={handleInstructorFilterChange}
    />
  );

  const filteredVehicles = useMemo(
    () => selectedVehicleFilter
      ? vehicles.filter((v) => v.id === selectedVehicleFilter)
      : vehicles,
    [vehicles, selectedVehicleFilter],
  );

  // ── Sub-tabs ──────────────────────────────────────────────────────────────
  const TABS: { key: SchemaTab; label: string }[] = [
    { key: 'bokningsschema', label: 'Bokningsschema' },
    { key: 'resursschema',   label: 'Resursschema'   },
  ];

  return (
    <PermissionGate permission={Permissions.SCHEDULING_READ}>
      <div className="flex flex-col h-full min-h-0">

        {/* Sub-tabs (Bokningsschema | Resursschema) */}
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
            </button>
          ))}
        </div>

        {/* ─── Resursschema ────────────────────────────────────────────────── */}
        {activeTab === 'resursschema' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Reuse the same filter row and nav as Bokningsschema */}
            <FilterRow
              filterDate={filterDate}
              showWeekends={showWeekends}
              onFilterDateChange={(d) => {
                setFilterDate(d);
                if (d) {
                  const date = new Date(d + 'T12:00:00');
                  if (!isNaN(date.getTime())) setWeekStart(getMonday(date));
                }
              }}
              onShowWeekendsChange={setShowWeekends}
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleFilter}
              onVehicleChange={setSelectedVehicleFilter}
            />
            <GridNavBar
              title={gridTitle}
              view={gridView}
              onPrev={handleGridPrev}
              onNext={handleGridNext}
              onToday={handleGridToday}
              onViewChange={handleGridViewChange}
              onCreateSlot={() => setCreateSlotOpen(true)}
            />
            <div className="flex-1 overflow-auto px-4 py-3">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <MultiVehicleGrid
                  slots={filteredGridSlots}
                  vehicles={filteredVehicles}
                  weekStart={weekStart}
                  numWeeks={numWeeks}
                  showWeekends={showWeekends}
                  isLoading={gridLoading || vehiclesLoading}
                  lessonTypeMap={lessonTypeMap}
                  onSlotClick={handleSlotClick}
                />
              </div>
            </div>
          </div>
        )}

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
              lessonTypes={lessonTypes}
              selectedLessonTypeId={selectedLessonTypeFilter}
              onLessonTypeChange={setSelectedLessonTypeFilter}
              groupByDay={groupByDay}
              onGroupByDayChange={setGroupByDay}
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
              filter={instructorFilter}
            />

            {/* Calendar content */}
            <div className="flex-1 overflow-auto px-4 py-3">

              {gridView === 'dag' ? (
                /* ── Day view: FullCalendar ──────────────────────────────── */
                <div className="space-y-3">
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
                      slotMinTime={schemaDisplay?.start_time ?? '06:00:00'}
                      slotMaxTime={schemaDisplay?.end_time ?? '22:00:00'}
                      weekends={showWeekends}
                    />
                  </div>
                </div>
              ) : (
                /* ── Week / 5-week view: multi-instructor grid ───────────── */
                <>
                <WeekSummaryBar slots={filteredGridSlots} weekStart={weekStart} numWeeks={numWeeks} />
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <MultiInstructorGrid
                    slots={filteredGridSlots}
                    instructors={filteredInstructors}
                    weekStart={weekStart}
                    numWeeks={numWeeks}
                    showWeekends={showWeekends}
                    isLoading={gridLoading}
                    lessonTypeMap={lessonTypeMap}
                    onSlotClick={handleSlotClick}
                    groupByDay={groupByDay}
                  />
                </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sheets / Dialogs */}
      <SlotDetailSheet slot={selectedSlot} open={sheetOpen} onOpenChange={setSheetOpen} />

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
    </PermissionGate>
  );
}
