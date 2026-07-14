import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils.js';
import type { LessonSlot } from '@platform/types';
import type { Vehicle } from '@modules/resources/hooks/useVehicles.js';

// ─── Constants (shared with instructor grid) ──────────────────────────────────

const SV_DAYS   = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
const DAY_START_HOUR = 7;
const DAY_END_HOUR   = 19;
const TOTAL_HOURS    = DAY_END_HOUR - DAY_START_HOUR;
const HOUR_LABELS    = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
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

const _STO_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function toHHMM(isoStr: string): string {
  const parts = _STO_TIME.formatToParts(new Date(isoStr));
  const h = parts.find(p => p.type === 'hour')?.value   ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

function getWeekNumber(date: Date): number {
  const d      = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
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

function minutesFromDayStart(isoStr: string): number {
  const parts = _STO_TIME.formatToParts(new Date(isoStr));
  const h = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  return (h - DAY_START_HOUR) * 60 + m;
}

function slotTopPx(slot: LessonSlot, hourHeight: number): number {
  return (Math.max(0, minutesFromDayStart(slot.starts_at)) / 60) * hourHeight;
}

function slotHeightPx(slot: LessonSlot, hourHeight: number): number {
  const start = new Date(slot.starts_at).getTime();
  const end   = new Date(slot.ends_at).getTime();
  const mins  = Math.max((end - start) / 60000, 10);
  return Math.max((mins / 60) * hourHeight, 14);
}

function slotCls(slot: LessonSlot): string {
  if (slot.status === 'cancelled') return 'bg-muted/50 text-muted-foreground/40 opacity-50';
  if (slot.status === 'blocked')   return 'bg-red-500 hover:bg-red-600 text-white';
  if (
    slot.status === 'full' ||
    slot.status === 'in_progress' ||
    slot.current_bookings >= slot.max_bookings
  ) return 'bg-orange-400 hover:bg-orange-500 text-white';
  return 'bg-blue-500 hover:bg-blue-600 text-white';
}

// ─── Vehicle status chip ──────────────────────────────────────────────────────

const STATUS_CLS: Record<Vehicle['operational_status'], string> = {
  available:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  in_use:          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  maintenance:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  inspection_due:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  inactive:        'bg-muted text-muted-foreground',
  decommissioned:  'bg-muted text-muted-foreground opacity-50',
};

const STATUS_SV: Record<Vehicle['operational_status'], string> = {
  available:      'Tillgänglig',
  in_use:         'I bruk',
  maintenance:    'Service',
  inspection_due: 'Besiktning',
  inactive:       'Inaktiv',
  decommissioned: 'Avvecklad',
};

// ─── Slot map ─────────────────────────────────────────────────────────────────

function buildVehicleSlotMap(
  slots: LessonSlot[],
): Record<string, Record<string, LessonSlot[]>> {
  const map: Record<string, Record<string, LessonSlot[]>> = {};
  for (const s of slots) {
    if (!s.vehicle_id) continue;
    const dateStr = isoDate(new Date(s.starts_at));
    if (!map[s.vehicle_id]) map[s.vehicle_id] = {};
    const byDate = map[s.vehicle_id]!;
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr]!.push(s);
  }
  return map;
}

// ─── Hover card ───────────────────────────────────────────────────────────────

interface HoverAnchor {
  slot:         LessonSlot;
  vehicleLabel: string;
  lessonLabel:  string;
  rect:         DOMRect;
}

const CARD_W = 280;

function SlotHoverCard({
  anchor, onMouseEnter, onMouseLeave,
}: {
  anchor:       HoverAnchor;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { slot, vehicleLabel, lessonLabel, rect } = anchor;
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
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">FORDON</p>
          <p className="text-primary font-medium">{vehicleLabel}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">LEKTIONSTYP</p>
          <p className="text-foreground">{lessonLabel || '–'}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">DELTAGARE</p>
          <p className="text-foreground">{slot.current_bookings} / {slot.max_bookings}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── WeekBlock ────────────────────────────────────────────────────────────────

function WeekBlock({
  weekStart,
  vehicles,
  slotMap,
  showWeekends,
  lessonTypeMap,
  colWidth,
  hourHeight,
  onSlotClick,
  onCellHover,
  onCellHoverEnd,
  showVehicleHeaders,
}: {
  weekStart:          Date;
  vehicles:           Vehicle[];
  slotMap:            Record<string, Record<string, LessonSlot[]>>;
  showWeekends:       boolean;
  lessonTypeMap:      Record<string, string>;
  colWidth:           number;
  hourHeight:         number;
  onSlotClick:        (slot: LessonSlot) => void;
  onCellHover:        (slot: LessonSlot, vehicleLabel: string, lessonLabel: string, rect: DOMRect) => void;
  onCellHoverEnd:     () => void;
  showVehicleHeaders: boolean;
}) {
  const days     = getWeekDays(weekStart, showWeekends);
  const weekNum  = getWeekNumber(weekStart);
  const todayStr = isoDate(new Date());
  const totalH   = TOTAL_HOURS * hourHeight;
  const timeAxisW = 44;

  return (
    <div className="overflow-x-auto">
      <table
        className="border-collapse text-xs"
        style={{ tableLayout: 'fixed', minWidth: 'max-content' }}
      >
        <colgroup>
          <col style={{ width: `${timeAxisW}px`, minWidth: `${timeAxisW}px` }} />
          {vehicles.flatMap((_, vi) =>
            days.map((_, di) => (
              <col key={`${vi}-${di}`} style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }} />
            ))
          )}
        </colgroup>

        <thead className="sticky top-0 z-20">
          {/* Vehicle headers */}
          {showVehicleHeaders && (
            <tr className="bg-card">
              <th className="border border-border bg-muted/40 py-1.5 text-center align-middle">
                <span className="text-[10px] font-bold text-muted-foreground">v.{weekNum}</span>
              </th>
              {vehicles.map(v => (
                <th
                  key={v.id}
                  colSpan={days.length}
                  className="border border-border bg-card py-1.5 text-center font-semibold"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-foreground font-semibold">
                      {v.make} {v.model}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono text-muted-foreground">{v.registration_number}</span>
                      <span className={cn(
                        'text-[8px] font-semibold px-1 py-0.5 rounded leading-none',
                        STATUS_CLS[v.operational_status],
                      )}>
                        {STATUS_SV[v.operational_status]}
                      </span>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          )}

          {/* Day headers */}
          <tr className="bg-card">
            <th className="border border-border bg-muted/40 py-1 text-center align-middle">
              {!showVehicleHeaders && (
                <span className="text-[10px] font-bold text-muted-foreground">v.{weekNum}</span>
              )}
            </th>
            {vehicles.flatMap(v =>
              days.map(day => {
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                const today   = isoDate(day) === todayStr;
                return (
                  <th
                    key={`${v.id}-${isoDate(day)}`}
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
            )}
          </tr>
        </thead>

        <tbody>
          <tr>
            {/* Time axis */}
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

            {/* Vehicle × day cells */}
            {vehicles.flatMap(v =>
              days.map(day => {
                const dateStr  = isoDate(day);
                const daySlots = slotMap[v.id]?.[dateStr] ?? [];
                const weekend  = day.getDay() === 0 || day.getDay() === 6;
                const today    = dateStr === todayStr;
                const inactive = v.operational_status === 'inactive' || v.operational_status === 'decommissioned';

                return (
                  <td
                    key={`${v.id}-${dateStr}`}
                    className={cn(
                      'border border-border p-0 align-top',
                      weekend && 'bg-amber-50/40 dark:bg-amber-950/15',
                      today && !daySlots.length && 'bg-primary/5',
                      inactive && 'bg-muted/30',
                    )}
                    style={{ height: totalH }}
                  >
                    <div className="relative" style={{ height: totalH }}>

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

                      {daySlots.map(slot => {
                        const top      = slotTopPx(slot, hourHeight);
                        const height   = slotHeightPx(slot, hourHeight);
                        const startStr = toHHMM(slot.starts_at);
                        const endStr   = toHHMM(slot.ends_at);
                        const typeLabel = lessonTypeMap[slot.lesson_type_id] ?? '';
                        const vLabel    = `${v.make} ${v.model} (${v.registration_number})`;

                        return (
                          <button
                            key={slot.id}
                            style={{
                              position: 'absolute',
                              top:    top + 1,
                              height: Math.max(height - 2, 14),
                              left:   1,
                              right:  1,
                            }}
                            onClick={() => onSlotClick(slot)}
                            onMouseEnter={(e) => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              onCellHover(slot, vLabel, typeLabel || 'Körlektion', rect);
                            }}
                            onMouseLeave={onCellHoverEnd}
                            title={`${startStr} – ${endStr} · ${typeLabel || 'Körlektion'} · ${v.make} ${v.model}`}
                            className={cn(
                              'rounded text-left overflow-hidden transition-colors',
                              slotCls(slot),
                            )}
                          >
                            <div className="px-1 pt-0.5 h-full overflow-hidden flex flex-col">
                              <span className="block text-[9px] font-bold leading-tight whitespace-nowrap">
                                {startStr} –
                              </span>
                              {height >= 26 && (
                                <span className="block text-[8px] leading-tight truncate opacity-90">
                                  {typeLabel || `${slot.current_bookings}/${slot.max_bookings}`}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}

                    </div>
                  </td>
                );
              })
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── MultiVehicleGrid ─────────────────────────────────────────────────────────

export interface MultiVehicleGridProps {
  slots:         LessonSlot[];
  vehicles:      Vehicle[];
  weekStart:     Date;
  numWeeks:      number;
  showWeekends:  boolean;
  isLoading:     boolean;
  lessonTypeMap?: Record<string, string>;
  onSlotClick:   (slot: LessonSlot) => void;
}

export function MultiVehicleGrid({
  slots,
  vehicles,
  weekStart,
  numWeeks,
  showWeekends,
  isLoading,
  lessonTypeMap = {},
  onSlotClick,
}: MultiVehicleGridProps) {
  const slotMap = useMemo(() => buildVehicleSlotMap(slots), [slots]);

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

  // Hover card state
  const [hoverAnchor, setHoverAnchor] = useState<HoverAnchor | null>(null);
  const openTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (openTimerRef.current)  clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const handleCellHover = useCallback((
    slot: LessonSlot, vehicleLabel: string, lessonLabel: string, rect: DOMRect,
  ) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openTimerRef.current = setTimeout(() => {
      setHoverAnchor({ slot, vehicleLabel, lessonLabel, rect });
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
          <p className="text-sm text-muted-foreground">Laddar fordonsschema…</p>
        </div>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-1.5 text-center">
        <p className="text-sm text-muted-foreground">Inga aktiva fordon hittades.</p>
        <p className="text-xs text-muted-foreground/60">Lägg till fordon under Resurser → Fordon & Platser.</p>
      </div>
    );
  }

  const slotsWithVehicle = slots.filter(s => s.vehicle_id !== null);
  const hasAnyAssigned   = slotsWithVehicle.length > 0;

  return (
    <div className="overflow-hidden">
      {!hasAnyAssigned && (
        <div className="px-4 py-2.5 bg-amber-50/60 border-b border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-800/40">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Inga lektioner är kopplade till fordon denna period. Tilldela fordon när du skapar eller redigerar ett pass.
          </p>
        </div>
      )}

      {weekStarts.map((ws, idx) => (
        <WeekBlock
          key={ws.toISOString()}
          weekStart={ws}
          vehicles={vehicles}
          slotMap={slotMap}
          showWeekends={showWeekends}
          lessonTypeMap={lessonTypeMap}
          colWidth={colWidth}
          hourHeight={hourHeight}
          onSlotClick={onSlotClick}
          onCellHover={handleCellHover}
          onCellHoverEnd={handleCellHoverEnd}
          showVehicleHeaders={idx === 0}
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
