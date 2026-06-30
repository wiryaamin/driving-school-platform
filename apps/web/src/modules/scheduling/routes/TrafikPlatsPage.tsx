import { useState, useMemo } from 'react';
import { Calendar, X } from 'lucide-react';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Button, Skeleton } from '@platform/ui';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useLocations, formatLocationAddress } from '../hooks/useLocations.js';
import { useSlotList } from '../hooks/useSlots.js';
import { SlotDetailSheet } from '../components/SlotDetailSheet.js';
import { BookingDialog } from '../components/BookingDialog.js';
import { cn } from '@/lib/utils.js';
import type { LessonSlot, LessonCategory, LessonType } from '@platform/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PER_PAGE = 25;

type PageTab = 'alla' | 'mina';

const CATEGORY_LABELS: Record<LessonCategory, string> = {
  risk1:        'Riskutbildning del 1',
  risk2:        'Riskutbildning del 2',
  driving:      'Körlektion',
  theory:       'Teori',
  simulator:    'Simulator',
  assessment:   'Bedömning',
  intensive:    'Intensivkurs',
  group_theory: 'Grupputbildning',
  other:        'Övrigt',
};

// Category display order
const CATEGORY_ORDER: LessonCategory[] = [
  'risk1', 'risk2', 'driving', 'theory', 'simulator', 'assessment', 'intensive', 'group_theory', 'other',
];

// Detect motorcycle lesson types by name (e.g. "Kombo Risk 1 MC", "Riskutbildning 2 MC")
function isMCType(name: string): boolean {
  const u = name.toUpperCase();
  return (
    / MC$/.test(u) ||
    / MC /.test(u) ||
    u.includes('MOTORCYKEL') ||
    u.includes('MOPED') ||
    /\bA1\b/.test(u) ||
    /\bA2\b/.test(u)
  );
}

// A flattened optgroup descriptor (risk1/risk2 each produce two sub-groups)
interface DropdownOptGroup {
  key:   string;
  label: string;
  types: LessonType[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function sixMonthsISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString();
}

const _STO_WEEKDAY_LONG = new Intl.DateTimeFormat('sv-SE', {
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDatum(startsAt: string, endsAt: string): string {
  try {
    const dateStr = capitalize(_STO_WEEKDAY_LONG.format(new Date(startsAt)));
    const from    = _STO_TIME.format(new Date(startsAt));
    const to      = _STO_TIME.format(new Date(endsAt));
    return `${dateStr} ${from} - ${to}`;
  } catch {
    return startsAt;
  }
}

// ─── Capacity helpers ─────────────────────────────────────────────────────────

function isFull(slot: LessonSlot): boolean {
  return slot.current_bookings >= slot.max_bookings;
}

function spotsLeft(slot: LessonSlot): number {
  return Math.max(0, slot.max_bookings - slot.current_bookings);
}

// ─── TrafikPlatsPage ──────────────────────────────────────────────────────────

export function TrafikPlatsPage() {
  const [selectedLtId, setSelectedLtId] = useState<string>('');
  const [selectedDate, setSelectedDate]  = useState<string>('');
  const [tab,          setTab]           = useState<PageTab>('alla');
  const [page,         setPage]          = useState(1);
  const [selectedSlot, setSelectedSlot]  = useState<LessonSlot | null>(null);
  const [sheetOpen,    setSheetOpen]     = useState(false);
  const [reserveOpen,  setReserveOpen]   = useState(false);

  // ── Reference data ────────────────────────────────────────────────────────
  const { data: lessonTypes = [] } = useLessonTypes();
  const { data: locations = [] }   = useLocations();

  const ltMap = useMemo(() => {
    const m: Record<string, { name: string; category: LessonCategory }> = {};
    for (const lt of lessonTypes) m[lt.id] = { name: lt.name, category: lt.category };
    return m;
  }, [lessonTypes]);

  const locationMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const loc of locations) m[loc.id] = formatLocationAddress(loc);
    return m;
  }, [locations]);

  // Lesson types grouped for the dropdown — risk1/risk2 split into MC vs Personbil sub-groups
  const groupedTypes = useMemo((): DropdownOptGroup[] => {
    const byCategory: Partial<Record<LessonCategory, LessonType[]>> = {};
    for (const lt of lessonTypes) {
      if (!byCategory[lt.category]) byCategory[lt.category] = [];
      byCategory[lt.category]!.push(lt);
    }

    const result: DropdownOptGroup[] = [];

    for (const cat of CATEGORY_ORDER) {
      const types = byCategory[cat];
      if (!types || types.length === 0) continue;

      if (cat === 'risk1' || cat === 'risk2') {
        const catLabel = cat === 'risk1' ? 'Riskutbildning del 1' : 'Riskutbildning del 2';
        const mcTypes  = types.filter(lt => isMCType(lt.name));
        const bilTypes = types.filter(lt => !isMCType(lt.name));
        if (mcTypes.length > 0) {
          result.push({ key: `${cat}-mc`,  label: `${catLabel} - Motorcykel (A1, A2, A)`, types: mcTypes });
        }
        if (bilTypes.length > 0) {
          result.push({ key: `${cat}-bil`, label: `${catLabel} - Personbil (B)`,           types: bilTypes });
        }
      } else {
        result.push({ key: cat, label: CATEGORY_LABELS[cat], types });
      }
    }

    return result;
  }, [lessonTypes]);

  // ── Slot query ────────────────────────────────────────────────────────────
  const fromDate = selectedDate
    ? new Date(selectedDate).toISOString()
    : new Date(todayISO()).toISOString();

  const { data: slotsData, isLoading } = useSlotList({
    ...(selectedLtId ? { lesson_type_id: selectedLtId } : {}),
    from:     fromDate,
    to:       sixMonthsISO(),
    per_page: 200,
    sort_by:  'starts_at',
    sort_dir: 'asc',
  });

  const allSlots = slotsData?.data ?? [];

  // Tab filtering: "Mina reservationer" = slots with at least one booking
  const tabFiltered = useMemo(() => {
    if (tab === 'mina') return allSlots.filter(s => s.current_bookings > 0);
    return allSlots;
  }, [allSlots, tab]);

  // Client-side pagination
  const totalFiltered = tabFiltered.length;
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / PER_PAGE));
  const pageSlots     = tabFiltered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function handleTabChange(newTab: PageTab) {
    setTab(newTab);
    setPage(1);
  }

  function handleDateChange(val: string) {
    setSelectedDate(val);
    setPage(1);
  }

  function handleLtChange(val: string) {
    setSelectedLtId(val);
    setPage(1);
  }

  function handleSlotClick(slot: LessonSlot) {
    setSelectedSlot(slot);
    setSheetOpen(true);
  }

  return (
    <>
      <PageLayout>
        <PageHeader
          title="Trafikövningsplatser"
          breadcrumbs={[{ label: 'Trafikövningsplatser' }]}
        />

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tidmall grouped select */}
          <div className="relative min-w-[260px] max-w-sm flex-1">
            <select
              value={selectedLtId}
              onChange={e => handleLtChange(e.target.value)}
              className="w-full h-9 text-sm border border-border rounded-md px-3 pr-8 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
            >
              <option value="">Välj tidmall</option>
              {groupedTypes.map(({ key, label, types }) => (
                <optgroup key={key} label={label}>
                  {types.map(lt => (
                    <option key={lt.id} value={lt.id}>{lt.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>

          {/* Date picker */}
          <div className="relative flex items-center gap-1">
            <Calendar className="absolute left-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => handleDateChange(e.target.value)}
              className="h-9 pl-8 pr-8 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {selectedDate && (
              <button
                onClick={() => handleDateChange('')}
                className="absolute right-2 text-muted-foreground hover:text-foreground"
                aria-label="Rensa datum"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="border-b border-border">
          <div className="flex gap-0">
            {([
              { key: 'alla', label: 'Alla tider' },
              { key: 'mina', label: 'Mina reservationer' },
            ] as { key: PageTab; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  tab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/60'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Utbildning</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plats</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bokade platser</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Obokade platser</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : pageSlots.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center">
                      <p className="text-sm text-muted-foreground">Inga tider hittades.</p>
                    </td>
                  </tr>
                ) : (
                  pageSlots.map(slot => {
                    const full         = isFull(slot);
                    const remaining    = spotsLeft(slot);
                    const ltInfo       = ltMap[slot.lesson_type_id];
                    const locationStr  = slot.location_id ? (locationMap[slot.location_id] ?? '–') : '–';
                    const datum        = formatDatum(slot.starts_at, slot.ends_at);

                    return (
                      <tr
                        key={slot.id}
                        className={cn(
                          'border-b border-border last:border-0 transition-colors',
                          full
                            ? 'bg-red-50/60 hover:bg-red-50 dark:bg-red-950/20'
                            : 'hover:bg-muted/30'
                        )}
                      >
                        {/* Datum */}
                        <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                          {datum}
                        </td>

                        {/* Utbildning */}
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {ltInfo?.name ?? '–'}
                        </td>

                        {/* Plats */}
                        <td className="px-4 py-3 text-muted-foreground">
                          {locationStr}
                        </td>

                        {/* Bokade platser */}
                        <td className="px-4 py-3">
                          <span className={cn(
                            'font-medium',
                            full ? 'text-red-600' : 'text-foreground'
                          )}>
                            {slot.current_bookings} / {slot.max_bookings}
                          </span>
                        </td>

                        {/* Obokade platser */}
                        <td className="px-4 py-3">
                          {full ? (
                            <span className="text-sm font-semibold text-red-600">Fullt reserverad</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {remaining} st kvar
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-3 text-xs text-primary border-primary/40 hover:bg-primary/5"
                              disabled={full}
                              onClick={(e) => { e.stopPropagation(); setSelectedSlot(slot); setReserveOpen(true); }}
                            >
                              Reservera
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-3 text-xs bg-green-500 hover:bg-green-600 text-white border-0"
                              onClick={(e) => { e.stopPropagation(); handleSlotClick(slot); }}
                            >
                              Visa
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ────────────────────────────────────────────────── */}
          {!isLoading && totalFiltered > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <span className="text-xs text-muted-foreground">
                Visar {Math.min((page - 1) * PER_PAGE + 1, totalFiltered)} till {Math.min(page * PER_PAGE, totalFiltered)} av {totalFiltered} resultat
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-7 h-7 flex items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ‹
                </button>
                {/* Page number chips */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  if (p < 1 || p > totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'w-7 h-7 flex items-center justify-center rounded border text-xs transition-colors',
                        p === page
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:bg-accent'
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="w-7 h-7 flex items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      </PageLayout>

      <SlotDetailSheet slot={selectedSlot} open={sheetOpen} onOpenChange={setSheetOpen} />

      <BookingDialog
        open={reserveOpen}
        onOpenChange={(o) => { if (!o) { setReserveOpen(false); } }}
        slot={selectedSlot}
        onSuccess={() => { setReserveOpen(false); }}
      />
    </>
  );
}
