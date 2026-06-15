import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  Button, Input, Textarea, Label, ScrollArea, Skeleton,
  cn, toast,
} from '@platform/ui';
import type { LessonCategory } from '@platform/types';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useInstructorList } from '@modules/instructors/index.js';
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

function toIsoString(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

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

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2.5">
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
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
            startTime === t
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateSlotSheetProps {
  open:                 boolean;
  onOpenChange:         (open: boolean) => void;
  initialDate?:         Date | null;
  initialInstructorId?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateSlotSheet({
  open,
  onOpenChange,
  initialDate,
  initialInstructorId,
}: CreateSlotSheetProps) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [mode,         setMode]         = useState<'single' | 'recurring'>('single');
  const [lessonTypeId, setLessonTypeId] = useState('');
  const [instructorId, setInstructorId] = useState('');
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

  const lessonTypes = useMemo(() => lessonTypesRaw ?? [], [lessonTypesRaw]);
  const instructors = useMemo(
    () => (instructorsData?.data ?? []).filter(i => i.employment_type !== 'inactive'),
    [instructorsData],
  );

  const createSlot       = useCreateSlot();
  const createSlotsBatch = useCreateSlotsBatch();
  const isPending        = createSlot.isPending || createSlotsBatch.isPending;

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
    (mode === 'single' ? !!date : recurringDates.length > 0)
  );

  // Init/reset on open toggle
  useEffect(() => {
    if (open) {
      const d = initialDate ? initialDate.toISOString().slice(0, 10) : todayStr;
      setDate(d);
      setRecurringFrom(d);
      if (initialInstructorId) setInstructorId(initialInstructorId);
    } else {
      setMode('single');
      setLessonTypeId('');
      setInstructorId('');
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
          toast({
            title:       'Kunde inte skapa pass',
            description: err instanceof Error ? err.message : 'Försök igen.',
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
        toast({
          title:       'Kunde inte skapa pass',
          description: err instanceof Error ? err.message : 'Försök igen.',
          variant:     'destructive',
        });
      },
    });
  }

  const saveLabel = mode === 'recurring'
    ? (recurringDates.length > 0 ? `Schemalägg ${recurringDates.length} pass` : 'Schemalägg')
    : 'Schemalägg';

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!isPending) onOpenChange(o); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <SheetTitle className="text-base">Schemalägg pass</SheetTitle>
        </SheetHeader>

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

        <ScrollArea className="flex-1">
          <div className="px-6 py-5 space-y-6">

            {/* ── Lektionsmall ─────────────────────────────────────────────── */}
            <div>
              <SectionHeader>Lektionsmall</SectionHeader>
              {ltLoading ? (
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <Skeleton key={n} className="h-[72px] w-[106px] rounded-lg flex-shrink-0" />
                  ))}
                </div>
              ) : ltError ? (
                <p className="text-sm text-destructive">
                  Kunde inte ladda lektionstyper. Kontrollera behörigheter och försök igen.
                </p>
              ) : lessonTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Inga aktiva lektionstyper konfigurerade. Kontakta systemadministratören.
                </p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                  {lessonTypes.map(lt => {
                    const isSelected = lessonTypeId === lt.id;
                    return (
                      <button
                        key={lt.id}
                        type="button"
                        onClick={() => setLessonTypeId(lt.id)}
                        className={cn(
                          'flex-shrink-0 w-[106px] rounded-lg border-2 overflow-hidden text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'border-primary ring-1 ring-primary/20'
                            : 'border-border hover:border-primary/40',
                        )}
                      >
                        <div className={cn('h-[3px]', CATEGORY_BAR[lt.category])} />
                        <div className={cn('p-2.5 transition-colors', isSelected ? CATEGORY_SELECTED_BG[lt.category] : '')}>
                          <div className="text-xs font-semibold text-foreground leading-tight line-clamp-2">
                            {lt.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {lt.default_duration_minutes} min
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {CATEGORY_LABELS[lt.category]}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Lärare ──────────────────────────────────────────────────── */}
            <div>
              <SectionHeader>Lärare</SectionHeader>
              {instrLoading ? (
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4].map(n => (
                    <Skeleton key={n} className="h-9 w-9 rounded-full flex-shrink-0" />
                  ))}
                </div>
              ) : instructors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga aktiva lärare tillgängliga.</p>
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
                        className={cn(
                          'flex-shrink-0 flex items-center justify-center gap-1.5 h-9 rounded-full border font-medium text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary px-3'
                            : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent w-9',
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

            {/* ── Tid (single) ─────────────────────────────────────────────── */}
            {mode === 'single' && (
              <div>
                <SectionHeader>Tid</SectionHeader>
                <div className="space-y-4">

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Datum</Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-44"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Starttid</Label>
                    <TimePills startTime={startTime} onSelect={setStartTime} />
                    {!(STANDARD_TIMES as readonly string[]).includes(startTime) && (
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-28 mt-1"
                      />
                    )}
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="slot-end-time" className="text-xs text-muted-foreground">
                        Sluttid
                        {lessonTypeId && (
                          <span className="ml-1 opacity-50">· auto</span>
                        )}
                      </Label>
                      <Input
                        id="slot-end-time"
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-28"
                      />
                    </div>
                    {durationLabel && (
                      <span className="pb-2 text-xs text-muted-foreground">{durationLabel}</span>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* ── Schema (recurring) ──────────────────────────────────────── */}
            {mode === 'recurring' && (
              <div>
                <SectionHeader>Schema</SectionHeader>
                <div className="space-y-4">

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Veckodagar</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map(wd => (
                        <button
                          key={wd.value}
                          type="button"
                          onClick={() => toggleRecurringDay(wd.value)}
                          className={cn(
                            'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                            recurringDays.includes(wd.value)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent',
                          )}
                        >
                          {wd.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Starttid</Label>
                    <TimePills startTime={startTime} onSelect={setStartTime} />
                    {!(STANDARD_TIMES as readonly string[]).includes(startTime) && (
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-28 mt-1"
                      />
                    )}
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Sluttid
                        {lessonTypeId && <span className="ml-1 opacity-50">· auto</span>}
                      </Label>
                      <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-28"
                      />
                    </div>
                    {durationLabel && (
                      <span className="pb-2 text-xs text-muted-foreground">{durationLabel}</span>
                    )}
                  </div>

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
                      />
                    </div>
                  </div>

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
                <div className="px-3.5 py-3 text-xs text-muted-foreground/70">
                  {!lessonTypeId
                    ? 'Välj lektionsmall för att komponera passet'
                    : !instructorId
                    ? 'Välj lärare'
                    : mode === 'recurring' && recurringDates.length === 0
                    ? 'Välj veckodagar och datumintervall'
                    : 'Kontrollera tid — sluttid måste vara efter starttid'}
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
                <div className="mt-3 pl-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Antal platser</Label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMaxBookings(v => Math.max(1, v - 1))}
                        className="h-8 w-8 rounded border border-input flex items-center justify-center text-sm hover:bg-accent transition-colors"
                        aria-label="Minska"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm font-medium tabular-nums">
                        {maxBookings}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMaxBookings(v => Math.min(12, v + 1))}
                        className="h-8 w-8 rounded border border-input flex items-center justify-center text-sm hover:bg-accent transition-colors"
                        aria-label="Öka"
                      >
                        +
                      </button>
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

      </SheetContent>
    </Sheet>
  );
}
