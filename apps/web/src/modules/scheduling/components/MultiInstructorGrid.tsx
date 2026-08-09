import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils.js';
import type { LessonSlot, Instructor, Student } from '@platform/types';
import { useBookingsForSlot } from '../hooks/useBookings.js';
import { useStudentsBatch } from '@modules/students/hooks/useStudents.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SV_DAYS = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];

const DAY_START_HOUR = 7;
const DAY_END_HOUR   = 19;
const TOTAL_HOURS    = DAY_END_HOUR - DAY_START_HOUR; // 12

// Hour labels for the time axis: "07:00" … "19:00"
const HOUR_LABELS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
  const h = DAY_START_HOUR + i;
  return `${String(h).padStart(2, '0')}:00`;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

// Sweden-first: always display slot times in Stockholm regardless of browser timezone.
const _STO_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm',
  hour:     '2-digit',
  minute:   '2-digit',
  hour12:   false,
});

function toHHMM(isoStr: string): string {
  const parts = _STO_TIME.formatToParts(new Date(isoStr));
  const h = parts.find(p => p.type === 'hour')?.value   ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getWeekDays(weekStart: Date, showWeekends: boolean): Date[] {
  const count = showWeekends ? 7 : 5;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

// Returns minutes elapsed since DAY_START_HOUR in Stockholm time.
function minutesFromDayStart(isoStr: string): number {
  const parts = _STO_TIME.formatToParts(new Date(isoStr));
  const h = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  return (h - DAY_START_HOUR) * 60 + m;
}

function slotTopPx(slot: LessonSlot, hourHeight: number): number {
  const minutes = Math.max(0, minutesFromDayStart(slot.starts_at));
  return (minutes / 60) * hourHeight;
}

function slotHeightPx(slot: LessonSlot, hourHeight: number): number {
  const start = new Date(slot.starts_at).getTime();
  const end   = new Date(slot.ends_at).getTime();
  const mins  = Math.max((end - start) / 60000, 10);
  return Math.max((mins / 60) * hourHeight, 14);
}

// ─── Slot colour ──────────────────────────────────────────────────────────────

// Soft green = free (any remaining capacity), soft purple = booked/full.
// blocked-by-staff keeps its own distinct solid purple so it doesn't read
// as a customer booking; cancelled stays muted. Only the free/booked pair
// was restyled to the Teoricentralen-matched pastel-card palette.
function slotCls(slot: LessonSlot): string {
  if (slot.status === 'cancelled') {
    return 'bg-muted/50 text-muted-foreground/40 opacity-50';
  }
  if (slot.status === 'blocked') {
    return 'bg-purple-500 hover:bg-purple-600 text-white';
  }
  if (isBookedSlot(slot)) {
    return 'bg-[#E8DCFF] border border-[#C7AEFF] text-[#5531A7] hover:bg-[#DECBFF] hover:border-[#B79AFF]';
  }
  // Open with any remaining capacity (0 or partial bookings) → free
  return 'bg-[#DFF4DF] border border-[#B7DDB7] text-[#2F6F36] hover:bg-[#D3EED3] hover:border-[#A2D0A2]';
}

function isBookedSlot(slot: LessonSlot): boolean {
  return (
    slot.status === 'full' ||
    slot.status === 'in_progress' ||
    slot.current_bookings >= slot.max_bookings
  );
}

// ─── Slot map ─────────────────────────────────────────────────────────────────

function buildSlotMap(slots: LessonSlot[]): Record<string, Record<string, LessonSlot[]>> {
  const map: Record<string, Record<string, LessonSlot[]>> = {};
  for (const s of slots) {
    const dateStr = isoDate(new Date(s.starts_at));
    if (!map[s.instructor_id]) map[s.instructor_id] = {};
    const byDate = map[s.instructor_id]!;
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr]!.push(s);
  }
  return map;
}

// ─── Hover card ───────────────────────────────────────────────────────────────

interface HoverAnchor {
  slot:           LessonSlot;
  instructorName: string;
  lessonTypeName: string;
  rect:           DOMRect;
}

function BookingNames({ slotId, hasBookings }: { slotId: string; hasBookings: boolean }) {
  const { data: bookingsData, isLoading } = useBookingsForSlot(hasBookings ? slotId : null);
  const bookings   = bookingsData?.data ?? [];
  const studentIds = useMemo(() => (bookingsData?.data ?? []).map(b => b.student_id), [bookingsData]);

  const { data: studentsRaw = [], isLoading: studentsLoading } = useStudentsBatch(studentIds);
  const studentMap = useMemo(
    (): Record<string, Student> => Object.fromEntries(studentsRaw.map(s => [s.id, s])),
    [studentsRaw],
  );

  if (!hasBookings) return <span className="text-muted-foreground">–</span>;
  if (isLoading || studentsLoading) {
    return <span className="text-muted-foreground/50 animate-pulse">laddar…</span>;
  }
  if (bookings.length === 0) return <span className="text-muted-foreground">–</span>;

  return (
    <div className="space-y-0.5">
      {bookings.map(b => {
        const s = studentMap[b.student_id];
        return (
          <p key={b.id} className="text-primary font-medium leading-snug">
            {s ? `${s.first_name} ${s.last_name}` : `${b.student_id.slice(0, 8)}…`}
          </p>
        );
      })}
    </div>
  );
}

const CARD_W = 300;

function SlotHoverCard({
  anchor,
  onMouseEnter,
  onMouseLeave,
}: {
  anchor:       HoverAnchor;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { slot, instructorName, lessonTypeName, rect } = anchor;
  const startTime = toHHMM(slot.starts_at);
  const endTime   = toHHMM(slot.ends_at);

  const showAbove = rect.bottom > window.innerHeight * 0.65;
  const left      = Math.min(Math.max(8, rect.left), window.innerWidth - CARD_W - 8);

  const posStyle: React.CSSProperties = showAbove
    ? { position: 'fixed', bottom: window.innerHeight - rect.top + 6, left, zIndex: 9999, width: CARD_W }
    : { position: 'fixed', top: rect.bottom + 6, left, zIndex: 9999, width: CARD_W };

  return createPortal(
    <div
      style={posStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="bg-card border border-border rounded-lg shadow-xl p-3 text-xs select-none"
    >
      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">TID</p>
          <p className="font-semibold text-foreground">{startTime} - {endTime}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">KUNDER</p>
          <BookingNames slotId={slot.id} hasBookings={slot.current_bookings > 0} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">NAMN</p>
          <p className="text-foreground">{lessonTypeName || '–'}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">LÄRARE</p>
          <p className="text-primary font-medium">{instructorName}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">DELTAGARE</p>
          <p className="text-foreground">{slot.current_bookings} / {slot.max_bookings}</p>
        </div>
        {slot.notes && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">ANTECKNINGAR</p>
            <p className="text-muted-foreground truncate">{slot.notes}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MultiInstructorGridProps {
  slots:           LessonSlot[];
  instructors:     Instructor[];
  weekStart:       Date;
  numWeeks:        number;
  showWeekends:    boolean;
  isLoading:       boolean;
  lessonTypeMap?:  Record<string, string>;
  onSlotClick:     (slot: LessonSlot) => void;
  groupByDay?:     boolean;
}

// ─── WeekBlock ────────────────────────────────────────────────────────────────

function WeekBlock({
  weekStart,
  instructors,
  slotMap,
  showWeekends,
  lessonTypeMap,
  colWidth,
  hourHeight,
  onSlotClick,
  onCellHover,
  onCellHoverEnd,
  showInstructorHeaders,
  groupByDay,
}: {
  weekStart:             Date;
  instructors:           Instructor[];
  slotMap:               Record<string, Record<string, LessonSlot[]>>;
  showWeekends:          boolean;
  lessonTypeMap:         Record<string, string>;
  colWidth:              number;
  hourHeight:            number;
  onSlotClick:           (slot: LessonSlot) => void;
  onCellHover:           (slot: LessonSlot, instructorName: string, lessonTypeName: string, rect: DOMRect) => void;
  onCellHoverEnd:        () => void;
  showInstructorHeaders: boolean;
  groupByDay?:           boolean;
}) {
  const days      = getWeekDays(weekStart, showWeekends);
  const weekNum   = getWeekNumber(weekStart);
  const todayStr  = isoDate(new Date());
  const totalH    = TOTAL_HOURS * hourHeight;
  const timeAxisW = 44;

  // Flat ordered list of {instr, day} pairs for colgroup + body cells.
  // groupByDay=false (default): instructors × days — each instructor owns a column group per week
  // groupByDay=true:            days × instructors — each day owns a column group per instructor
  const columnPairs = useMemo(
    () => groupByDay
      ? days.flatMap(day => instructors.map(instr => ({ day, instr })))
      : instructors.flatMap(instr => days.map(day => ({ day, instr }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupByDay, instructors, showWeekends, weekStart],
  );

  return (
    <div className="overflow-x-auto">
      <table
        className="border-collapse text-xs"
        style={{ tableLayout: 'fixed', minWidth: 'max-content' }}
      >
        <colgroup>
          <col style={{ width: `${timeAxisW}px`, minWidth: `${timeAxisW}px` }} />
          {columnPairs.map(({ day, instr }) => (
            <col
              key={`col-${instr.id}-${isoDate(day)}`}
              style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
            />
          ))}
        </colgroup>

        <thead className="sticky top-0 z-20">
          {/* Group headers row — instructor names (default) or day labels (groupByDay) */}
          {showInstructorHeaders && (
            <tr className="bg-card">
              <th className="border border-border bg-muted/40 py-1.5 text-center align-middle">
                <span className="text-[10px] font-bold text-muted-foreground">v.{weekNum}</span>
              </th>
              {groupByDay
                ? days.map(day => {
                    const weekend = day.getDay() === 0 || day.getDay() === 6;
                    const today   = isoDate(day) === todayStr;
                    return (
                      <th
                        key={`grp-${isoDate(day)}`}
                        colSpan={instructors.length}
                        className={cn(
                          'border border-border py-1.5 text-center font-semibold',
                          weekend && 'bg-amber-50/70 dark:bg-amber-950/20',
                          today   && 'bg-primary/10',
                        )}
                      >
                        <div className={cn(
                          'text-[10px] font-bold uppercase leading-none',
                          today ? 'text-primary' : 'text-muted-foreground',
                        )}>
                          {SV_DAYS[(day.getDay() + 6) % 7]}
                        </div>
                        <div className={cn(
                          'text-[10px] leading-tight mt-0.5',
                          today ? 'text-primary font-bold' : 'text-muted-foreground/70',
                        )}>
                          {day.getDate()}/{day.getMonth() + 1}
                        </div>
                      </th>
                    );
                  })
                : instructors.map(instr => (
                    <th
                      key={`grp-${instr.id}`}
                      colSpan={days.length}
                      className="border border-border bg-card py-1.5 text-center font-semibold"
                    >
                      <span className="text-xs text-foreground">{instr.first_name} {instr.last_name}</span>
                    </th>
                  ))
              }
            </tr>
          )}

          {/* Sub-headers row — day labels (default) or instructor initials (groupByDay) */}
          <tr className="bg-card">
            <th className="border border-border bg-muted/40 py-1 text-center align-middle">
              {!showInstructorHeaders && (
                <span className="text-[10px] font-bold text-muted-foreground">v.{weekNum}</span>
              )}
            </th>
            {groupByDay
              ? columnPairs.map(({ day, instr }) => {
                  const weekend = day.getDay() === 0 || day.getDay() === 6;
                  const today   = isoDate(day) === todayStr;
                  const initials = (instr.first_name.charAt(0) + instr.last_name.charAt(0)).toUpperCase();
                  return (
                    <th
                      key={`sub-${isoDate(day)}-${instr.id}`}
                      title={`${instr.first_name} ${instr.last_name}`}
                      className={cn(
                        'border border-border py-1 text-center align-middle',
                        weekend && 'bg-amber-50/70 dark:bg-amber-950/20',
                        today   && 'bg-primary/10',
                      )}
                    >
                      <div className={cn(
                        'text-[9px] font-bold leading-none',
                        today ? 'text-primary' : 'text-muted-foreground',
                      )}>
                        {initials}
                      </div>
                    </th>
                  );
                })
              : instructors.flatMap(instr =>
                  days.map(day => {
                    const weekend = day.getDay() === 0 || day.getDay() === 6;
                    const today   = isoDate(day) === todayStr;
                    return (
                      <th
                        key={`sub-${instr.id}-${isoDate(day)}`}
                        className={cn(
                          'border border-border py-1 text-center align-middle',
                          weekend && 'bg-amber-50/70 dark:bg-amber-950/20',
                          today   && 'bg-primary/10',
                        )}
                      >
                        <div className={cn(
                          'text-[10px] font-semibold uppercase leading-none',
                          today ? 'text-primary' : 'text-muted-foreground',
                        )}>
                          {SV_DAYS[(day.getDay() + 6) % 7]}
                        </div>
                        <div className={cn(
                          'text-[10px] leading-tight mt-0.5',
                          today ? 'text-primary font-bold' : 'text-muted-foreground/70',
                        )}>
                          {day.getDate()}/{day.getMonth() + 1}
                        </div>
                      </th>
                    );
                  })
                )
            }
          </tr>
        </thead>

        <tbody>
          <tr>
            {/* Time axis — sticky left, shows hour labels over grid lines */}
            <td
              className="border-r border-border p-0 align-top sticky left-0 z-10 bg-card"
              style={{ height: totalH }}
            >
              <div className="relative" style={{ height: totalH }}>
                {HOUR_LABELS.map((label, i) => (
                  <div
                    key={label}
                    style={{ position: 'absolute', top: i * hourHeight - 6, right: 4 }}
                    className="text-[10px] font-mono text-muted-foreground/70 leading-none select-none whitespace-nowrap"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </td>

            {/* Columns — proportional time layout, order determined by groupByDay */}
            {columnPairs.map(({ day, instr }) => {
              const dateStr  = isoDate(day);
              const daySlots = slotMap[instr.id]?.[dateStr] ?? [];
              const weekend  = day.getDay() === 0 || day.getDay() === 6;
              const today    = dateStr === todayStr;

              return (
                <td
                  key={`cell-${instr.id}-${dateStr}`}
                  className={cn(
                    'border border-border p-0 align-top',
                    weekend && 'bg-amber-50/40 dark:bg-amber-950/15',
                    today && !daySlots.length && 'bg-primary/5',
                  )}
                  style={{ height: totalH }}
                >
                  <div className="relative" style={{ height: totalH }}>

                    {/* Horizontal hour grid lines */}
                    {HOUR_LABELS.map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          'absolute left-0 right-0',
                          i === 0 ? 'border-t-0' : 'border-t border-border/30',
                        )}
                        style={{ top: i * hourHeight }}
                      />
                    ))}

                    {/* Slot cards — absolutely positioned by time */}
                    {daySlots.map(slot => {
                      const top      = slotTopPx(slot, hourHeight);
                      const height   = slotHeightPx(slot, hourHeight);
                      const startStr = toHHMM(slot.starts_at);
                      const endStr   = toHHMM(slot.ends_at);
                      const typeName = lessonTypeMap[slot.lesson_type_id ?? ''] ?? '';

                      return (
                        <button
                          key={slot.id}
                          style={{
                            position: 'absolute',
                            top:    top + 2,
                            height: Math.max(height - 4, 16),
                            left:   2,
                            right:  2,
                          }}
                          onClick={() => onSlotClick(slot)}
                          onMouseEnter={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            onCellHover(
                              slot,
                              `${instr.first_name} ${instr.last_name}`,
                              typeName || 'Vanlig körlektion',
                              rect,
                            );
                          }}
                          onMouseLeave={onCellHoverEnd}
                          title={`${startStr} – ${endStr} · ${typeName || 'Körlektion'} · ${slot.current_bookings}/${slot.max_bookings}`}
                          className={cn(
                            'rounded-md text-left overflow-hidden transition-colors',
                            slotCls(slot),
                          )}
                        >
                          <div className="p-[3px] h-full overflow-hidden flex flex-col justify-center gap-0">
                            {/* Time range */}
                            <span className="block text-[10px] font-semibold leading-[1.2] whitespace-nowrap text-left">
                              {startStr} –
                            </span>
                            {/* Lesson type (only when card is tall enough) */}
                            {height >= 28 && (
                              <span className="block text-[10px] leading-[1.2] truncate opacity-90 text-left">
                                {typeName || `${slot.current_bookings}/${slot.max_bookings}`}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}

                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── MultiInstructorGrid ──────────────────────────────────────────────────────

export function MultiInstructorGrid({
  slots,
  instructors,
  weekStart,
  numWeeks,
  showWeekends,
  isLoading,
  lessonTypeMap = {},
  onSlotClick,
  groupByDay = false,
}: MultiInstructorGridProps) {
  const slotMap = useMemo(() => buildSlotMap(slots), [slots]);

  // Wider columns and taller hour rows for 1-week; compact for 5-week
  const colWidth   = numWeeks === 1 ? 78 : 50;
  const hourHeight = numWeeks === 1 ? 54 : 40;

  const weekStarts = useMemo(
    () => Array.from({ length: numWeeks }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i * 7);
      return d;
    }),
    [weekStart, numWeeks],
  );

  // ── Hover card state ──────────────────────────────────────────────────────
  const [hoverAnchor, setHoverAnchor] = useState<HoverAnchor | null>(null);
  const openTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (openTimerRef.current)  clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const handleCellHover = useCallback((
    slot:           LessonSlot,
    instructorName: string,
    lessonTypeName: string,
    rect:           DOMRect,
  ) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openTimerRef.current = setTimeout(() => {
      setHoverAnchor({ slot, instructorName, lessonTypeName, rect });
    }, 140);
  }, []);

  const handleCellHoverEnd = useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    closeTimerRef.current = setTimeout(() => setHoverAnchor(null), 110);
  }, []);

  const handleCardMouseEnter = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const handleCardMouseLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setHoverAnchor(null), 110);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-56">
        <div className="flex flex-col items-center gap-2">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Laddar schema…</p>
        </div>
      </div>
    );
  }

  if (instructors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-1.5 text-center">
        <p className="text-sm text-muted-foreground">Inga instruktörer hittades.</p>
        <p className="text-xs text-muted-foreground/60">Lägg till instruktörer under Personal.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      {weekStarts.map((ws, idx) => (
        <WeekBlock
          key={ws.toISOString()}
          weekStart={ws}
          instructors={instructors}
          slotMap={slotMap}
          showWeekends={showWeekends}
          lessonTypeMap={lessonTypeMap}
          colWidth={colWidth}
          hourHeight={hourHeight}
          onSlotClick={onSlotClick}
          onCellHover={handleCellHover}
          onCellHoverEnd={handleCellHoverEnd}
          showInstructorHeaders={idx === 0}
          groupByDay={groupByDay}
        />
      ))}

      {hoverAnchor && (
        <SlotHoverCard
          anchor={hoverAnchor}
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
        />
      )}
    </div>
  );
}
