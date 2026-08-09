import { useState, useMemo } from 'react';
import { GraduationCap, Users, MapPin, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { Skeleton } from '@platform/ui';
import { useSlotList } from '../hooks/useSlots.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useLocations, formatLocationAddress } from '../hooks/useLocations.js';
import { SlotDetailSheet } from '../components/SlotDetailSheet.js';
import { GroupEnrollmentSheet } from '../components/GroupEnrollmentSheet.js';
import { cn } from '@/lib/utils.js';
import type { LessonSlot, LessonCategory } from '@platform/types';

// ─── Constants ────────────────────────────────────────────────────────────────

// Group course categories — shown on this page
const GROUP_CATEGORIES: LessonCategory[] = ['risk1', 'risk2', 'intensive', 'group_theory'];

const CATEGORY_META: Record<LessonCategory, { label: string; color: string; dot: string }> = {
  risk1:        { label: 'Riskutbildning del 1', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',       dot: 'bg-red-400'    },
  risk2:        { label: 'Riskutbildning del 2', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-400' },
  intensive:    { label: 'Intensivkurs',          color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', dot: 'bg-purple-400' },
  group_theory: { label: 'Grupputbildning',       color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',   dot: 'bg-blue-400'   },
  // non-group (won't appear but needed for type)
  driving:   { label: 'Körlektion',   color: '', dot: '' },
  theory:    { label: 'Teori',        color: '', dot: '' },
  simulator: { label: 'Simulator',    color: '', dot: '' },
  assessment:{ label: 'Bedömning',    color: '', dot: '' },
  other:     { label: 'Övrigt',       color: '', dot: '' },
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const _STO_LONG = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  weekday:  'long',
  day:      'numeric',
  month:    'long',
  year:     'numeric',
});

const _STO_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  hour:     '2-digit',
  minute:   '2-digit',
  hour12:   false,
});

function formatDatum(startsAt: string): string {
  const d = new Date(startsAt);
  const s = _STO_LONG.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatTid(startsAt: string, endsAt: string): string {
  return `${_STO_TIME.format(new Date(startsAt))}–${_STO_TIME.format(new Date(endsAt))}`;
}

// ─── Session card ─────────────────────────────────────────────────────────────

interface SessionCardProps {
  slot:          LessonSlot;
  ltName:        string;
  category:      LessonCategory;
  instructorName: string;
  locationStr:   string;
  onViewDetail:  (slot: LessonSlot) => void;
  onReserve:     (slot: LessonSlot) => void;
}

function SessionCard({
  slot, ltName, category, instructorName, locationStr, onViewDetail, onReserve,
}: SessionCardProps) {
  const meta       = CATEGORY_META[category];
  const isFull     = slot.current_bookings >= slot.max_bookings;
  const remaining  = Math.max(0, slot.max_bookings - slot.current_bookings);
  const fillPct    = slot.max_bookings > 0
    ? Math.round((slot.current_bookings / slot.max_bookings) * 100)
    : 0;

  return (
    <div className={cn(
      'rounded-xl border bg-card transition-colors',
      isFull ? 'border-red-200 dark:border-red-800/40' : 'border-border hover:border-primary/30',
    )}>
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                meta.color,
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                {meta.label}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-foreground">{ltName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDatum(slot.starts_at)}</p>
            <p className="text-xs text-muted-foreground">{formatTid(slot.starts_at, slot.ends_at)}</p>
          </div>

          {/* Capacity donut-like display */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <div className={cn(
              'text-lg font-bold tabular-nums',
              isFull ? 'text-red-600 dark:text-red-400' : 'text-foreground',
            )}>
              {slot.current_bookings}/{slot.max_bookings}
            </div>
            <div className="text-[10px] text-muted-foreground">platser</div>
          </div>
        </div>

        {/* Fill bar */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              fillPct >= 100 ? 'bg-red-500' : fillPct >= 75 ? 'bg-amber-500' : 'bg-green-500',
            )}
            style={{ width: `${Math.min(fillPct, 100)}%` }}
          />
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {instructorName && (
            <span className="flex items-center gap-1">
              <GraduationCap className="w-3 h-3" />
              {instructorName}
            </span>
          )}
          {locationStr && locationStr !== '–' && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {locationStr}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onReserve(slot)}
            disabled={isFull}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              isFull
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {isFull ? 'Fullbokad' : `Boka plats (${remaining} kvar)`}
          </button>
          <button
            onClick={() => onViewDetail(slot)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Detaljer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category section with collapsible ────────────────────────────────────────

interface CategorySectionProps {
  category:      LessonCategory;
  slots:         LessonSlot[];
  ltMap:         Record<string, { name: string; category: LessonCategory }>;
  instructorMap: Record<string, string>;
  locationMap:   Record<string, string>;
  onViewDetail:  (slot: LessonSlot) => void;
  onReserve:     (slot: LessonSlot) => void;
}

function CategorySection({
  category, slots, ltMap, instructorMap, locationMap, onViewDetail, onReserve,
}: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const meta      = CATEGORY_META[category];
  const fullCount = slots.filter(s => s.current_bookings >= s.max_bookings).length;

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-accent/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{meta.label}</span>
          <span className="text-xs text-muted-foreground">
            {slots.length} tillfällen
            {fullCount > 0 && ` · ${fullCount} fullbokade`}
          </span>
        </div>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronUp   className="w-4 h-4 text-muted-foreground" />
        }
      </button>

      {!collapsed && (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {slots.map(slot => {
            const lt  = ltMap[slot.lesson_type_id ?? ''];
            return (
              <SessionCard
                key={slot.id}
                slot={slot}
                ltName={lt?.name ?? '–'}
                category={category}
                instructorName={instructorMap[slot.instructor_id] ?? ''}
                locationStr={slot.location_id ? (locationMap[slot.location_id] ?? '–') : ''}
                onViewDetail={onViewDetail}
                onReserve={onReserve}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── KursoverSiktPage ─────────────────────────────────────────────────────────

export function KursoverSiktPage() {
  const [showPast, setShowPast]     = useState(false);
  const [detailSlot, setDetailSlot] = useState<LessonSlot | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reserveSlot, setReserveSlot] = useState<LessonSlot | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);

  // Date window: today → 6 months forward (or past 2 months if showPast)
  const now    = new Date();
  const fromDt = showPast ? new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) : now;
  const toDt   = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);

  const fromISO = fromDt.toISOString();
  const toISO   = toDt.toISOString();

  // ── Reference data ────────────────────────────────────────────────────────
  const { data: lessonTypes = []  } = useLessonTypes();
  const { data: instructorsData   } = useInstructorList({ per_page: 100 });
  const { data: locations = []    } = useLocations();

  const ltMap = useMemo(() => {
    const m: Record<string, { name: string; category: LessonCategory }> = {};
    for (const lt of lessonTypes) m[lt.id] = { name: lt.name, category: lt.category };
    return m;
  }, [lessonTypes]);

  const instructorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of instructorsData?.data ?? []) m[i.id] = `${i.first_name} ${i.last_name}`;
    return m;
  }, [instructorsData]);

  const locationMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of locations) m[l.id] = formatLocationAddress(l);
    return m;
  }, [locations]);

  // ── Slot query ────────────────────────────────────────────────────────────
  const { data: slotsData, isLoading } = useSlotList({
    per_page: 300,
    sort_by:  'starts_at',
    sort_dir: 'asc',
    from:     fromISO,
    to:       toISO,
  });

  const allSlots = slotsData?.data ?? [];

  // Filter to group categories only
  const groupSlots = useMemo(
    () => allSlots.filter(s => GROUP_CATEGORIES.includes(ltMap[s.lesson_type_id ?? '']?.category ?? 'other' as LessonCategory)),
    [allSlots, ltMap],
  );

  // Group by category
  const byCategory = useMemo(() => {
    const map = new Map<LessonCategory, LessonSlot[]>();
    for (const cat of GROUP_CATEGORIES) map.set(cat, []);
    for (const slot of groupSlots) {
      const cat = ltMap[slot.lesson_type_id ?? '']?.category ?? 'other';
      if (GROUP_CATEGORIES.includes(cat as LessonCategory)) {
        map.get(cat as LessonCategory)!.push(slot);
      }
    }
    return map;
  }, [groupSlots, ltMap]);

  const totalSessions = groupSlots.length;
  const totalFull     = groupSlots.filter(s => s.current_bookings >= s.max_bookings).length;
  const totalBooked   = groupSlots.reduce((a, s) => a + s.current_bookings, 0);
  const totalCap      = groupSlots.reduce((a, s) => a + s.max_bookings, 0);

  function handleViewDetail(slot: LessonSlot) {
    setDetailSlot(slot);
    setDetailOpen(true);
  }

  function handleReserve(slot: LessonSlot) {
    setReserveSlot(slot);
    setReserveOpen(true);
  }

  return (
    <>
      <div className="space-y-5 pb-8">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Kursöversikt</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Grupputbildningar — Riskutbildning, intensivkurser och teori
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPast}
              onChange={e => setShowPast(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-primary"
            />
            Visa även historiska
          </label>
        </div>

        {/* ── Summary band ──────────────────────────────────────────────────── */}
        {!isLoading && totalSessions > 0 && (
          <div className="flex flex-wrap gap-4 px-4 py-2.5 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{totalSessions}</span> tillfällen totalt
            </span>
            <span>
              <span className="font-semibold text-foreground">{totalBooked}</span> av{' '}
              <span className="font-semibold text-foreground">{totalCap}</span> platser bokade
            </span>
            {totalFull > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium">
                {totalFull} fullbokade
              </span>
            )}
          </div>
        )}

        {/* ── Content ───────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <Skeleton className="h-5 w-48 rounded" />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[1, 2, 3].map(j => <Skeleton key={j} className="h-40 rounded-xl" />)}
                </div>
              </div>
            ))}
          </div>
        ) : totalSessions === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <CalendarDays className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm font-medium text-foreground">Inga grupptillfällen hittades</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Skapa pass av typen Riskutbildning, Intensivkurs eller Grupputbildning för att de ska visas här.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {GROUP_CATEGORIES.map(cat => {
              const catSlots = byCategory.get(cat) ?? [];
              if (catSlots.length === 0) return null;
              return (
                <CategorySection
                  key={cat}
                  category={cat}
                  slots={catSlots}
                  ltMap={ltMap}
                  instructorMap={instructorMap}
                  locationMap={locationMap}
                  onViewDetail={handleViewDetail}
                  onReserve={handleReserve}
                />
              );
            })}
          </div>
        )}
      </div>

      <SlotDetailSheet slot={detailSlot} open={detailOpen} onOpenChange={setDetailOpen} />

      <GroupEnrollmentSheet
        open={reserveOpen}
        onOpenChange={(o) => { if (!o) { setReserveOpen(false); } }}
        slot={reserveSlot}
        lessonTypeName={reserveSlot ? ltMap[reserveSlot.lesson_type_id ?? '']?.name : undefined}
        onSuccess={() => { setReserveOpen(false); setReserveSlot(null); }}
      />
    </>
  );
}
