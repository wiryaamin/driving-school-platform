import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Car, AlertTriangle, Check, CalendarX2, Users2, Minus, Plus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Input, Textarea, Label, ScrollArea, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  cn, toast,
} from '@platform/ui';
import type { LessonCategory } from '@platform/types';
import { stockholmToUtcIso } from '@platform/utils';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useVehicles } from '@modules/resources/index.js';
import { useSlotList } from '../hooks/useSlots.js';
import { useCreateSlot, useCreateSlotsBatch } from '../hooks/useSchedulingMutations.js';
import type { CreateSlotInput } from '../hooks/useSchedulingMutations.js';
import { formatSlotDate } from '../lib/calendarUtils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const STANDARD_TIMES = ['07:00', '08:30', '10:00', '12:00', '13:30', '15:00', '16:30'] as const;

const CATEGORY_LABELS: Record<LessonCategory, string> = {
  driving:      'Körning',
  theory:       'Teori',
  risk1:        'Risk 1',
  risk2:        'Risk 2',
  simulator:    'Simulator',
  assessment:   'Bedömning',
  intensive:    'Intensiv',
  group_theory: 'Gruppteori',
  other:        'Övrigt',
};

const CATEGORY_BAR: Record<LessonCategory, string> = {
  driving:      'bg-blue-500',
  theory:       'bg-violet-500',
  risk1:        'bg-amber-500',
  risk2:        'bg-amber-600',
  simulator:    'bg-teal-500',
  assessment:   'bg-yellow-500',
  intensive:    'bg-red-500',
  group_theory: 'bg-violet-400',
  other:        'bg-gray-400',
};

const CATEGORY_SELECTED_BG: Record<LessonCategory, string> = {
  driving:      'bg-blue-50 dark:bg-blue-950/40',
  theory:       'bg-violet-50 dark:bg-violet-950/40',
  risk1:        'bg-amber-50 dark:bg-amber-950/40',
  risk2:        'bg-amber-50 dark:bg-amber-950/40',
  simulator:    'bg-teal-50 dark:bg-teal-950/40',
  assessment:   'bg-yellow-50 dark:bg-yellow-950/40',
  intensive:    'bg-red-50 dark:bg-red-950/40',
  group_theory: 'bg-violet-50 dark:bg-violet-950/40',
  other:        'bg-gray-50 dark:bg-gray-900/40',
};

const WEEKDAYS = [
  { value: 1, label: 'Mån' },
  { value: 2, label: 'Tis' },
  { value: 3, label: 'Ons' },
  { value: 4, label: 'Tor' },
  { value: 5, label: 'Fre' },
  { value: 6, label: 'Lör' },
  { value: 0, label: 'Sön' },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addMinutesToTime(time: string, minutes: number): string {
  const parts = time.split(':');
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Anchored to Europe/Stockholm (the org's operating timezone), not the
// viewer's device timezone — see @platform/utils's stockholmToUtcIso for why:
// every downstream display (calendar, booking details, etc.) already
// formats stored UTC instants back out as Stockholm time, so the picked
// wall-clock time must be converted in on that same, single, authoritative
// timezone to stay consistent regardless of what timezone the browser itself
// happens to be running in.
const toIsoString = stockholmToUtcIso;

function generateRecurringDates(from: string, to: string, weekdays: readonly number[]): string[] {
  const dates: string[] = [];
  const current = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (current <= end && dates.length < 20) {
    if (weekdays.includes(current.getDay())) {
      dates.push(current.toISOString().slice(0, 10));
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Scheduling — Admin-Friendly Booking: platform default/floor. No maximum.
// Mirrored in supabase/functions/slots/index.ts (validateDuration) and the
// lesson_slots/lesson_bookings DB CHECK constraints — this is the same rule
// enforced in three places for defence in depth, not three different rules.
const MIN_LESSON_DURATION_MINUTES = 40;

function computeDurationMinutes(start: string, end: string): number {
  const sp = start.split(':');
  const ep = end.split(':');
  return (Number(ep[0] ?? 0) * 60 + Number(ep[1] ?? 0)) - (Number(sp[0] ?? 0) * 60 + Number(sp[1] ?? 0));
}

function formatDurationLabel(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} t ${m} min` : `${h} tim`;
}

function formatDisplayDate(dateStr: string): string {
  const s = new Date(`${dateStr}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatShortDate(dateStr: string): string {
  const s = new Date(`${dateStr}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getInitials(firstName: string, lastName: string): string {
  return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2.5">
      {children}
      {required && <span className="text-destructive normal-case" aria-hidden="true">*</span>}
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1 text-[11px] font-medium text-destructive mt-1">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      {children}
    </p>
  );
}

function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-border bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
      <span className="shrink-0 text-muted-foreground/60">{icon}</span>
      {children}
    </div>
  );
}

function TimePills({
  startTime,
  onSelect,
}: {
  startTime: string;
  onSelect:  (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STANDARD_TIMES.map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onSelect(t)}
          aria-pressed={startTime === t}
          className={cn(
            'px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            startTime === t
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary/30',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

// Native <input type="time"> renders per browser/OS locale (12h AM/PM on some
// systems) and only accepts input via small per-segment clicks/arrow keys —
// confirmed live as genuinely hard to operate for some users. Two plain
// dropdowns are unambiguous, always 24h, and always directly clickable —
// same underlying "HH:MM" string value/state either way.
function TimeSelect({
  id,
  value,
  onChange,
  invalid,
}: {
  id?:      string;
  value:    string;
  onChange: (t: string) => void;
  invalid?: boolean;
}) {
  const [h, m] = value ? value.split(':') : ['', ''];
  const hourProps   = h ? { value: h } : {};
  const minuteProps = m ? { value: m } : {};

  return (
    <div id={id} className="flex items-center gap-1">
      <Select {...hourProps} onValueChange={(nh) => onChange(`${nh}:${m || '00'}`)}>
        <SelectTrigger className={cn('w-[70px]', invalid && 'border-destructive focus:ring-destructive')}>
          <SelectValue placeholder="Tim" />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map(hh => <SelectItem key={hh} value={hh}>{hh}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select {...minuteProps} onValueChange={(nm) => onChange(`${h || '00'}:${nm}`)}>
        <SelectTrigger className={cn('w-[70px]', invalid && 'border-destructive focus:ring-destructive')}>
          <SelectValue placeholder="Min" />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map(mm => <SelectItem key={mm} value={mm}>{mm}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateSlotSheetProps {
  open:                  boolean;
  onOpenChange:          (open: boolean) => void;
  initialDate?:          Date | null;
  initialInstructorId?:  string | null;
  initialLessonTypeId?:  string | null;
  initialVehicleId?:     string | null;
  initialStartTime?:     string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateSlotSheet({
  open,
  onOpenChange,
  initialDate,
  initialInstructorId,
  initialLessonTypeId,
  initialVehicleId,
  initialStartTime,
}: CreateSlotSheetProps) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [mode,         setMode]         = useState<'single' | 'recurring'>('single');
  const [lessonTypeId, setLessonTypeId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [vehicleId,    setVehicleId]    = useState('');
  const [date,         setDate]         = useState(todayStr);
  const [startTime,    setStartTime]    = useState('08:30');
  const [endTime,      setEndTime]      = useState('');
  const [maxBookings,  setMaxBookings]  = useState(1);
  const [notes,        setNotes]        = useState('');
  const [showCapacity, setShowCapacity] = useState(false);

  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringFrom, setRecurringFrom] = useState(todayStr);
  const [recurringTo,   setRecurringTo]   = useState('');

  const { data: lessonTypesRaw, isLoading: ltLoading, error: ltError } = useLessonTypes({ enabled: open });
  const { data: instructorsData, isLoading: instrLoading } = useInstructorList(
    { per_page: 100 },
    { enabled: open },
  );
  const { data: vehiclesRaw } = useVehicles();

  const lessonTypes = useMemo(() => lessonTypesRaw ?? [], [lessonTypesRaw]);
  const instructors = useMemo(
    () => (instructorsData?.data ?? []).filter(i => i.employment_type !== 'inactive'),
    [instructorsData],
  );
  const vehicles = useMemo(
    () => (vehiclesRaw ?? []).filter(v => v.operational_status === 'available'),
    [vehiclesRaw],
  );

  const createSlot       = useCreateSlot();
  const createSlotsBatch = useCreateSlotsBatch();
  const isPending        = createSlot.isPending || createSlotsBatch.isPending;

  // ── Vehicle conflict detection ─────────────────────────────────────────────
  // Only check when single mode has all fields needed to determine a time window.
  const conflictCheckDate = mode === 'single' && vehicleId && date && startTime && endTime && endTime > startTime
    ? date
    : null;

  const { data: vehicleConflictSlots } = useSlotList(
    { vehicle_id: vehicleId, from: conflictCheckDate ?? undefined, to: conflictCheckDate ?? undefined, per_page: 50 },
    { enabled: conflictCheckDate !== null },
  );

  const vehicleConflict = useMemo(() => {
    if (!conflictCheckDate || !vehicleId || !startTime || !endTime || !vehicleConflictSlots) return null;
    const wantStart = toIsoString(date, startTime);
    const wantEnd   = toIsoString(date, endTime);
    return (vehicleConflictSlots.data ?? []).find(s =>
      s.vehicle_id === vehicleId &&
      s.starts_at < wantEnd &&
      s.ends_at   > wantStart &&
      s.deleted_at === null,
    ) ?? null;
  }, [conflictCheckDate, vehicleId, startTime, endTime, vehicleConflictSlots, date]);

  const selectedLessonType = useMemo(
    () => lessonTypes.find(t => t.id === lessonTypeId) ?? null,
    [lessonTypes, lessonTypeId],
  );
  const selectedInstructor = useMemo(
    () => instructors.find(i => i.id === instructorId) ?? null,
    [instructors, instructorId],
  );

  const durationLabel = useMemo(() => {
    if (!startTime || !endTime || endTime <= startTime) return '';
    return formatDurationLabel(computeDurationMinutes(startTime, endTime));
  }, [startTime, endTime]);

  const recurringDates = useMemo(() => {
    if (mode !== 'recurring' || recurringDays.length === 0 || !recurringFrom || !recurringTo) return [];
    return generateRecurringDates(recurringFrom, recurringTo, recurringDays);
  }, [mode, recurringDays, recurringFrom, recurringTo]);

  const previewReady = !!(
    lessonTypeId && instructorId && startTime && endTime && endTime > startTime &&
    computeDurationMinutes(startTime, endTime) >= MIN_LESSON_DURATION_MINUTES &&
    (mode === 'single' ? !!date : recurringDates.length > 0)
  );

  // All unmet requirements at once — shown as a checklist so the user never has
  // to fix one thing, resubmit, and discover another blocker one at a time.
  const missingRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!lessonTypeId) missing.push('Välj en lektionsmall');
    if (!instructorId) missing.push('Välj en lärare');
    if (!startTime || !endTime) missing.push('Ange start- och sluttid');
    else if (endTime <= startTime) missing.push('Sluttid måste vara efter starttid');
    // Scheduling — Admin-Friendly Booking: platform rule (mirrors the backend
    // CHECK constraint / slots/index.ts validateDuration) — minimum 40
    // minutes, 5-minute granularity, no maximum. The start/end time pickers
    // already only offer 5-minute increments, so this only ever fires for
    // the under-40-minutes case.
    else if (computeDurationMinutes(startTime, endTime) < MIN_LESSON_DURATION_MINUTES) {
      missing.push(`Lektionslängden måste vara minst ${MIN_LESSON_DURATION_MINUTES} minuter`);
    }
    if (mode === 'single') {
      if (!date) missing.push('Välj ett datum');
    } else {
      if (recurringDays.length === 0) missing.push('Välj minst en veckodag');
      if (!recurringFrom || !recurringTo) missing.push('Ange start- och slutdatum för perioden');
      else if (recurringTo < recurringFrom) missing.push('Slutdatum måste vara efter startdatum');
    }
    return missing;
  }, [lessonTypeId, instructorId, startTime, endTime, mode, date, recurringDays, recurringFrom, recurringTo]);

  // Init/reset on open toggle
  useEffect(() => {
    if (open) {
      const d = initialDate ? initialDate.toISOString().slice(0, 10) : todayStr;
      setDate(d);
      setRecurringFrom(d);
      if (initialInstructorId) setInstructorId(initialInstructorId);
      if (initialLessonTypeId) setLessonTypeId(initialLessonTypeId);
      if (initialVehicleId) setVehicleId(initialVehicleId);
      if (initialStartTime) setStartTime(initialStartTime);
    } else {
      setMode('single');
      setLessonTypeId('');
      setInstructorId('');
      setVehicleId('');
      setDate(todayStr);
      setStartTime('08:30');
      setEndTime('');
      setMaxBookings(1);
      setNotes('');
      setShowCapacity(false);
      setRecurringDays([]);
      setRecurringFrom(todayStr);
      setRecurringTo('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-fill end time + capacity from lesson type
  useEffect(() => {
    if (!selectedLessonType) return;
    setEndTime(addMinutesToTime(startTime, selectedLessonType.default_duration_minutes));
    setMaxBookings(selectedLessonType.max_students_per_slot);
  }, [lessonTypeId, startTime, selectedLessonType]);

  function toggleRecurringDay(day: number) {
    setRecurringDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  function canSave(): boolean {
    if (!lessonTypeId || !instructorId) return false;
    if (!startTime || !endTime || endTime <= startTime) return false;
    if (mode === 'single') return !!date;
    if (recurringDays.length === 0 || !recurringFrom || !recurringTo) return false;
    return recurringTo >= recurringFrom;
  }

  function buildSingleInput(): CreateSlotInput {
    return {
      instructor_id:  instructorId,
      lesson_type_id: lessonTypeId,
      starts_at:      toIsoString(date, startTime),
      ends_at:        toIsoString(date, endTime),
      max_bookings:   maxBookings,
      ...(vehicleId ? { vehicle_id: vehicleId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
  }

  function buildBatchInputs(): CreateSlotInput[] {
    return recurringDates.map(d => ({
      instructor_id:  instructorId,
      lesson_type_id: lessonTypeId,
      starts_at:      toIsoString(d, startTime),
      ends_at:        toIsoString(d, endTime),
      max_bookings:   maxBookings,
      ...(vehicleId ? { vehicle_id: vehicleId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }));
  }

  function handleSave() {
    if (!canSave() || isPending) return;

    if (mode === 'single') {
      createSlot.mutate(buildSingleInput(), {
        onSuccess: (slot) => {
          toast({ title: 'Pass skapat', description: `${formatSlotDate(slot.starts_at)} · ${startTime}–${endTime}` });
          onOpenChange(false);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : '';
          toast({
            title:       msg.startsWith('Fordonet') ? 'Fordon ej tillgängligt' : 'Kunde inte skapa pass',
            description: msg || 'Försök igen.',
            variant:     'destructive',
          });
        },
      });
      return;
    }

    const inputs = buildBatchInputs();
    if (inputs.length === 0) {
      toast({ title: 'Inga datum matchar', description: 'Välj veckodagar inom datumintervallet.', variant: 'destructive' });
      return;
    }

    createSlotsBatch.mutate(inputs, {
      onSuccess: ({ succeeded, failed, errors }) => {
        if (failed === 0) {
          toast({ title: `${succeeded} pass skapades` });
        } else {
          toast({
            title:       `${succeeded}/${succeeded + failed} pass skapades`,
            description: errors[0] ?? `${failed} konflikter kunde inte skapas.`,
            variant:     'destructive',
          });
        }
        onOpenChange(false);
      },
      onError: (err) => {
        toast({
          title:       'Batchskapandet misslyckades',
          description: err instanceof Error ? err.message : 'Försök igen.',
          variant:     'destructive',
        });
      },
    });
  }

  function handleSaveAndContinue() {
    if (!canSave() || isPending || mode !== 'single') return;
    createSlot.mutate(buildSingleInput(), {
      onSuccess: (slot) => {
        toast({ title: 'Pass skapat', description: `${formatSlotDate(slot.starts_at)} · ${startTime}–${endTime}` });
        setDate(todayStr);
        setStartTime('08:30');
        if (selectedLessonType) {
          setEndTime(addMinutesToTime('08:30', selectedLessonType.default_duration_minutes));
        } else {
          setEndTime('');
        }
      },
      onError: (err) => {
        const msg = err instanceof Error ? err.message : '';
        toast({
          title:       msg.startsWith('Fordonet') ? 'Fordon ej tillgängligt' : 'Kunde inte skapa pass',
          description: msg || 'Försök igen.',
          variant:     'destructive',
        });
      },
    });
  }

  const saveLabel = mode === 'recurring'
    ? (recurringDates.length > 0 ? `Schemalägg ${recurringDates.length} pass` : 'Schemalägg')
    : 'Schemalägg';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-base">Schemalägg pass</DialogTitle>
        </DialogHeader>

        {/* ── Mode switch ─────────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-b border-border shrink-0">
          <div className="flex rounded-lg border border-input bg-muted/30 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={cn(
                'flex-1 flex items-center justify-center py-1.5 text-xs font-medium rounded transition-colors',
                mode === 'single'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Enstaka pass
            </button>
            <button
              type="button"
              onClick={() => setMode('recurring')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors',
                mode === 'recurring'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <RefreshCw className="w-3 h-3" />
              Återkommande
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5 space-y-6">

            {/* ── Lektionsmall ─────────────────────────────────────────────── */}
            <div>
              <SectionHeader required>Lektionsmall</SectionHeader>
              {ltLoading ? (
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <Skeleton key={n} className="h-[76px] w-[112px] rounded-lg flex-shrink-0" />
                  ))}
                </div>
              ) : ltError ? (
                <EmptyState icon={<AlertTriangle className="w-4 h-4" />}>
                  Kunde inte ladda lektionstyper. Kontrollera behörigheter och försök igen.
                </EmptyState>
              ) : lessonTypes.length === 0 ? (
                <EmptyState icon={<CalendarX2 className="w-4 h-4" />}>
                  Inga aktiva lektionstyper konfigurerade. Kontakta systemadministratören.
                </EmptyState>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {lessonTypes.map(lt => {
                    const isSelected = lessonTypeId === lt.id;
                    return (
                      <button
                        key={lt.id}
                        type="button"
                        onClick={() => setLessonTypeId(lt.id)}
                        aria-pressed={isSelected}
                        className={cn(
                          'relative flex-shrink-0 w-[112px] rounded-lg border overflow-hidden text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'border-primary ring-1 ring-primary/30 shadow-sm'
                            : 'border-border hover:border-primary/40 hover:shadow-sm',
                        )}
                      >
                        <div className={cn('h-[3px]', CATEGORY_BAR[lt.category])} />
                        <div className={cn('p-2.5 transition-colors', isSelected ? CATEGORY_SELECTED_BG[lt.category] : '')}>
                          <div className="text-xs font-semibold text-foreground leading-tight line-clamp-2 pr-3">
                            {lt.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1.5">
                            {lt.default_duration_minutes} min
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {CATEGORY_LABELS[lt.category]}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground">
                            <Check className="w-2.5 h-2.5" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Lärare ──────────────────────────────────────────────────── */}
            <div>
              <SectionHeader required>Lärare</SectionHeader>
              {instrLoading ? (
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4].map(n => (
                    <Skeleton key={n} className="h-9 w-9 rounded-full flex-shrink-0" />
                  ))}
                </div>
              ) : instructors.length === 0 ? (
                <EmptyState icon={<Users2 className="w-4 h-4" />}>
                  Inga aktiva lärare tillgängliga.
                </EmptyState>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {instructors.map(i => {
                    const isSelected = instructorId === i.id;
                    const initials   = getInitials(i.first_name, i.last_name);
                    return (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => setInstructorId(isSelected ? '' : i.id)}
                        title={`${i.first_name} ${i.last_name}`}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex-shrink-0 flex items-center justify-center gap-1.5 h-9 rounded-full border font-medium text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary px-3 shadow-sm'
                            : 'border-input bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary/30 w-9',
                        )}
                      >
                        <span>{initials}</span>
                        {isSelected && (
                          <span className="whitespace-nowrap">{i.last_name}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Fordon (valfritt) ────────────────────────────────────────── */}
            {vehicles.length > 0 && (
              <div>
                <SectionHeader>Fordon <span className="normal-case font-normal opacity-60">(valfritt)</span></SectionHeader>
                <div className="flex flex-wrap gap-1.5">
                  {vehicles.map(v => {
                    const isSelected = vehicleId === v.id;
                    const label = `${v.registration_number} · ${v.make} ${v.model}`;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVehicleId(isSelected ? '' : v.id)}
                        title={label}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'border-input bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary/30',
                        )}
                      >
                        <Car className="w-3 h-3 shrink-0" />
                        <span>{v.registration_number}</span>
                        {isSelected && (
                          <span className="text-primary-foreground/70">{v.transmission === 'automatic' ? 'A' : 'M'}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {vehicleId && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {vehicles.find(v => v.id === vehicleId)?.transmission === 'automatic' ? 'Automat' : 'Manuell'} ·{' '}
                    {vehicles.find(v => v.id === vehicleId)?.make}{' '}
                    {vehicles.find(v => v.id === vehicleId)?.model}
                  </p>
                )}
                {vehicleConflict && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-2.5 py-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>
                      Fordonet är redan bokat{' '}
                      {new Date(vehicleConflict.starts_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                      –
                      {new Date(vehicleConflict.ends_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Tid (single) ─────────────────────────────────────────────── */}
            {mode === 'single' && (
              <div>
                <SectionHeader required>Tid</SectionHeader>
                <div className="space-y-4">

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Datum</Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full max-w-[200px]"
                    />
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="slot-start-time" className="text-xs text-muted-foreground">Starttid</Label>
                      <TimePills startTime={startTime} onSelect={setStartTime} />
                      <div className="mt-1.5">
                        <TimeSelect id="slot-start-time" value={startTime} onChange={setStartTime} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="slot-end-time" className="text-xs text-muted-foreground">
                        Sluttid
                        {lessonTypeId && (
                          <span className="ml-1 opacity-50">· auto</span>
                        )}
                      </Label>
                      <TimeSelect
                        id="slot-end-time"
                        value={endTime}
                        onChange={setEndTime}
                        invalid={!!endTime && endTime <= startTime}
                      />
                    </div>
                    {durationLabel && (
                      <span className="mb-1.5 px-2 py-1 text-xs font-medium text-muted-foreground bg-muted/50 rounded-full">
                        {durationLabel}
                      </span>
                    )}
                  </div>
                  {endTime && endTime <= startTime && (
                    <FieldError>Sluttid måste vara efter starttid.</FieldError>
                  )}

                </div>
              </div>
            )}

            {/* ── Schema (recurring) ──────────────────────────────────────── */}
            {mode === 'recurring' && (
              <div>
                <SectionHeader required>Schema</SectionHeader>
                <div className="space-y-4">

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Veckodagar</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map(wd => (
                        <button
                          key={wd.value}
                          type="button"
                          onClick={() => toggleRecurringDay(wd.value)}
                          aria-pressed={recurringDays.includes(wd.value)}
                          className={cn(
                            'px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            recurringDays.includes(wd.value)
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'border-input bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary/30',
                          )}
                        >
                          {wd.label}
                        </button>
                      ))}
                    </div>
                    {recurringDays.length === 0 && (
                      <FieldError>Välj minst en veckodag.</FieldError>
                    )}
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="slot-recurring-start-time" className="text-xs text-muted-foreground">Starttid</Label>
                      <TimePills startTime={startTime} onSelect={setStartTime} />
                      <div className="mt-1.5">
                        <TimeSelect id="slot-recurring-start-time" value={startTime} onChange={setStartTime} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Sluttid
                        {lessonTypeId && <span className="ml-1 opacity-50">· auto</span>}
                      </Label>
                      <TimeSelect
                        value={endTime}
                        onChange={setEndTime}
                        invalid={!!endTime && endTime <= startTime}
                      />
                    </div>
                    {durationLabel && (
                      <span className="mb-1.5 px-2 py-1 text-xs font-medium text-muted-foreground bg-muted/50 rounded-full">
                        {durationLabel}
                      </span>
                    )}
                  </div>
                  {endTime && endTime <= startTime && (
                    <FieldError>Sluttid måste vara efter starttid.</FieldError>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Från</Label>
                      <Input
                        type="date"
                        value={recurringFrom}
                        min={todayStr}
                        onChange={(e) => setRecurringFrom(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Till</Label>
                      <Input
                        type="date"
                        value={recurringTo}
                        min={recurringFrom || todayStr}
                        onChange={(e) => setRecurringTo(e.target.value)}
                        className={cn(recurringTo && recurringTo < recurringFrom && 'border-destructive focus-visible:ring-destructive')}
                      />
                    </div>
                  </div>
                  {recurringTo && recurringTo < recurringFrom && (
                    <FieldError>Slutdatum måste vara efter startdatum.</FieldError>
                  )}

                </div>
              </div>
            )}

            {/* ── Förhandsgranskning ───────────────────────────────────────── */}
            <div className={cn(
              'rounded-lg border transition-colors',
              previewReady
                ? 'bg-muted/40 border-border'
                : 'bg-muted/20 border-dashed border-border/60',
            )}>
              {previewReady && selectedLessonType && selectedInstructor ? (
                <div className="p-3.5">
                  <div className="flex items-start gap-2.5">
                    <div className={cn('w-1 rounded-full self-stretch shrink-0 min-h-[1.25rem]', CATEGORY_BAR[selectedLessonType.category])} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground leading-tight">
                        {selectedLessonType.name}
                        <span className="font-normal text-muted-foreground ml-1.5">
                          · {selectedInstructor.first_name} {selectedInstructor.last_name}
                        </span>
                      </div>

                      {mode === 'single' && date && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDisplayDate(date)} · {startTime}–{endTime} · {maxBookings} plats{maxBookings !== 1 ? 'er' : ''}
                        </div>
                      )}

                      {mode === 'recurring' && recurringDates.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {recurringDates.slice(0, 5).map(d => (
                            <div key={d} className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                              {formatShortDate(d)} · {startTime}–{endTime}
                            </div>
                          ))}
                          {recurringDates.length > 5 && (
                            <div className="text-xs text-muted-foreground ml-2.5">
                              + {recurringDates.length - 5} till
                            </div>
                          )}
                          <div className="mt-1.5 text-xs font-medium text-foreground">
                            {recurringDates.length} pass
                            {recurringDates.length === 20 && ' · max per omgång'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-3.5 py-3">
                  <p className="text-xs font-medium text-muted-foreground/80 mb-1.5">
                    Fyll i markerade (*) fält ovan innan passet kan schemaläggas:
                  </p>
                  <ul className="space-y-1">
                    {missingRequirements.map(item => (
                      <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* ── Kapacitet & anteckningar ─────────────────────────────────── */}
            <div>
              <button
                type="button"
                onClick={() => setShowCapacity(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {showCapacity
                  ? <ChevronUp className="w-3.5 h-3.5" />
                  : <ChevronDown className="w-3.5 h-3.5" />}
                Kapacitet & anteckningar
              </button>

              {showCapacity && (
                <div className="mt-3 pl-5 space-y-4 border-l-2 border-border/60">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Antal platser</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setMaxBookings(v => Math.max(1, v - 1))}
                        disabled={maxBookings <= 1}
                        className="h-8 w-8"
                        aria-label="Minska antal platser"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">
                        {maxBookings}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setMaxBookings(v => Math.min(12, v + 1))}
                        disabled={maxBookings >= 12}
                        className="h-8 w-8"
                        aria-label="Öka antal platser"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="slot-notes" className="text-xs text-muted-foreground">
                      Anteckningar
                      <span className="ml-1 opacity-50">(valfritt)</span>
                    </Label>
                    <Textarea
                      id="slot-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Intern anteckning om passet..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>
        </ScrollArea>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-border shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="shrink-0"
            >
              Avbryt
            </Button>
            <div className="flex-1" />
            {mode === 'single' && (
              <Button
                variant="outline"
                onClick={handleSaveAndContinue}
                disabled={!canSave() || isPending}
                className="shrink-0 text-xs"
              >
                {isPending ? 'Skapar...' : 'Skapa & fortsätt'}
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!canSave() || isPending}
              className="shrink-0"
            >
              {isPending
                ? (mode === 'recurring' ? 'Skapar pass...' : 'Skapar...')
                : saveLabel}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
