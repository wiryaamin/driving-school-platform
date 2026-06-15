import { useState, useMemo } from 'react';
import { Link2, CalendarPlus, Copy, FileDown, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Search, Clock, FileText, CreditCard, User, Eye } from 'lucide-react';
import { Skeleton } from '@platform/ui';
import { useSlotList } from '../hooks/useSlots.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { SlotDetailSheet } from '../components/SlotDetailSheet.js';
import { cn } from '@/lib/utils.js';
import type { LessonSlot } from '@platform/types';

// ─── Formatters (Stockholm time) ──────────────────────────────────────────────

const _STO_DATE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  weekday:  'long',
  day:      'numeric',
  month:    'long',
  year:     'numeric',
});

const _STO_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm',
  hour:     '2-digit',
  minute:   '2-digit',
  hour12:   false,
});

function formatDatum(startsAt: string, endsAt: string): string {
  const start    = new Date(startsAt);
  const end      = new Date(endsAt);
  const raw      = _STO_DATE.format(start);
  const dateStr  = raw.charAt(0).toUpperCase() + raw.slice(1);
  const startStr = _STO_TIME.format(start);
  const endStr   = _STO_TIME.format(end);
  return `${dateStr} ${startStr} - ${endStr}`;
}

function getWeekNum(isoStr: string): number {
  const d      = new Date(isoStr);
  const utc    = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusDot(slot: LessonSlot): string {
  if (slot.status === 'cancelled' || slot.status === 'blocked') return 'bg-gray-300';
  if (slot.status === 'in_progress') return 'bg-blue-400';
  if (slot.current_bookings >= slot.max_bookings || slot.status === 'full') return 'bg-red-400';
  if (slot.current_bookings > 0) return 'bg-amber-400';
  return 'bg-green-500';
}

function rowHighlight(slot: LessonSlot): string {
  if (slot.current_bookings >= slot.max_bookings || slot.status === 'full') {
    return 'bg-red-50 dark:bg-red-950/20';
  }
  return '';
}

// ─── Sort header cell ─────────────────────────────────────────────────────────

function SortTh({
  label,
  field,
  current,
  dir,
  onClick,
}: {
  label:   string;
  field:   string;
  current: string;
  dir:     'asc' | 'desc';
  onClick: (f: string) => void;
}) {
  const active = current === field;
  return (
    <th
      className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground whitespace-nowrap"
      onClick={() => onClick(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? (dir === 'asc'
              ? <ChevronUp   className="w-3 h-3 text-primary" />
              : <ChevronDown className="w-3 h-3 text-primary" />)
          : <ChevronUp className="w-3 h-3 opacity-20" />
        }
      </span>
    </th>
  );
}

// ─── Action toolbar (matching Bokningsschema) ─────────────────────────────────

function ActionToolbar() {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-muted/40 border-b border-border">
      <div className="flex items-center gap-1">
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
          <Search className="w-3 h-3" />
          Sök efter kund
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
          <User className="w-3 h-3" />
          Ingen kund vald
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
          <Eye className="w-3 h-3" />
          Ingen kund vald
        </button>
      </div>
      <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
      <div className="flex items-center gap-1">
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
          <Clock className="w-3 h-3" />
          Hitta ledig tid
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
          <FileText className="w-3 h-3" />
          Bokningar
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
          <CreditCard className="w-3 h-3" />
          Kassa
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
          <User className="w-3 h-3" />
          Kundkort
        </button>
      </div>
    </div>
  );
}

// ─── BookingListPage ──────────────────────────────────────────────────────────

const PER_PAGE = 25;

type SortField = 'starts_at' | 'lesson_type' | 'instructor' | 'bookings';

export function BookingListPage() {
  // ── Filters ────────────────────────────────────────────────────────────────
  const [instructorFilter, setInstructorFilter] = useState('');
  const [fromDate, setFromDate]                 = useState('');
  const [toDate,   setToDate]                   = useState('');
  const [page,     setPage]                     = useState(1);
  const [sortField, setSortField]               = useState<SortField>('starts_at');
  const [sortDir,   setSortDir]                 = useState<'asc' | 'desc'>('asc');

  // ── Detail sheet ───────────────────────────────────────────────────────────
  const [selectedSlot, setSelectedSlot] = useState<LessonSlot | null>(null);
  const [sheetOpen, setSheetOpen]       = useState(false);

  // ── Reference data ─────────────────────────────────────────────────────────
  const { data: instructorsData } = useInstructorList({ per_page: 100 });
  const instructors = instructorsData?.data ?? [];

  const { data: lessonTypes = [] } = useLessonTypes();

  const instructorMap = useMemo(
    () => Object.fromEntries(instructors.map(i => [i.id, i])),
    [instructors],
  );
  const lessonTypeMap = useMemo(
    () => Object.fromEntries(lessonTypes.map(lt => [lt.id, lt])),
    [lessonTypes],
  );

  // ── Default date range: today → +6 months ─────────────────────────────────
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const defaultTo = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, []);

  const apiFrom = fromDate ? `${fromDate}T00:00:00.000Z` : defaultFrom;
  const apiTo   = toDate   ? `${toDate}T23:59:59.999Z`   : defaultTo;

  // ── Slots query ────────────────────────────────────────────────────────────
  const apiSortBy  = sortField === 'starts_at' ? 'starts_at' : 'starts_at';
  const apiSortDir = sortDir;

  const { data: slotsData, isLoading } = useSlotList({
    page,
    per_page: PER_PAGE,
    sort_by:  apiSortBy,
    sort_dir: apiSortDir,
    from:     apiFrom,
    to:       apiTo,
    ...(instructorFilter ? { instructor_id: instructorFilter } : {}),
  });

  const rawSlots = slotsData?.data ?? [];
  const meta     = slotsData?.meta;

  // ── Client-side sort for computed columns ──────────────────────────────────
  const slots = useMemo(() => {
    if (sortField === 'starts_at') return rawSlots; // already sorted by API
    return [...rawSlots].sort((a, b) => {
      let va = '';
      let vb = '';
      if (sortField === 'lesson_type') {
        va = lessonTypeMap[a.lesson_type_id]?.name ?? '';
        vb = lessonTypeMap[b.lesson_type_id]?.name ?? '';
      } else if (sortField === 'instructor') {
        va = instructorMap[a.instructor_id]?.first_name ?? '';
        vb = instructorMap[b.instructor_id]?.first_name ?? '';
      } else if (sortField === 'bookings') {
        return sortDir === 'asc'
          ? a.current_bookings - b.current_bookings
          : b.current_bookings - a.current_bookings;
      }
      const cmp = va.localeCompare(vb, 'sv');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rawSlots, sortField, sortDir, lessonTypeMap, instructorMap]);

  // ── Pagination numbers ─────────────────────────────────────────────────────
  const total      = meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const fromRow    = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const toRow      = Math.min(page * PER_PAGE, total);

  function handleSort(field: string) {
    const f = field as SortField;
    if (sortField === f) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(f);
      setSortDir('asc');
    }
    setPage(1);
  }

  function handleSlotClick(slot: LessonSlot) {
    setSelectedSlot(slot);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="flex flex-col h-full min-h-0 -mx-6 -mt-4">

        {/* Action toolbar */}
        <ActionToolbar />

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border shrink-0">
          {/* Personalgrupp */}
          <select
            value={instructorFilter}
            onChange={(e) => { setInstructorFilter(e.target.value); setPage(1); }}
            className="h-7 text-xs border border-border rounded px-2 bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="">Filtrera på personalgrupp</option>
            {instructors.map(i => (
              <option key={i.id} value={i.id}>{i.first_name} {i.last_name}</option>
            ))}
          </select>

          {/* Tidmallsgrupp (placeholder) */}
          <select className="h-7 text-xs border border-border rounded px-2 bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40">
            <option>Filtrera på tidmallsgrupp</option>
          </select>

          {/* Startdatum */}
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input
              type="date"
              value={fromDate}
              placeholder="Startdatum"
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>

          {/* Slutdatum */}
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input
              type="date"
              value={toDate}
              placeholder="Slutdatum"
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>

          {/* Clear filters */}
          {(instructorFilter || fromDate || toDate) && (
            <button
              onClick={() => { setInstructorFilter(''); setFromDate(''); setToDate(''); setPage(1); }}
              className="h-7 px-2 text-xs text-muted-foreground border border-border rounded hover:bg-accent transition-colors"
            >
              Rensa filter
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead className="sticky top-0 z-10 bg-card border-b-2 border-border">
              <tr>
                {/* Status indicator column */}
                <th className="w-5 px-1 py-2.5" />
                {/* Checkbox */}
                <th className="w-8 px-2 py-2.5">
                  <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary" />
                </th>
                <SortTh label="Internt namn"       field="lesson_type"  current={sortField} dir={sortDir} onClick={handleSort} />
                <SortTh label="Vecka"              field="starts_at"    current={sortField} dir={sortDir} onClick={handleSort} />
                <SortTh label="Datum"              field="starts_at"    current={sortField} dir={sortDir} onClick={handleSort} />
                <SortTh label="Lärare"             field="instructor"   current={sortField} dir={sortDir} onClick={handleSort} />
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Bokningar
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Transportstyrelsen
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Anteckningar
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Åtgärd
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="w-5 py-3" />
                    <td className="px-2 py-3"><Skeleton className="h-3.5 w-3.5" /></td>
                    <td className="px-3 py-3"><Skeleton className="h-3.5 w-28" /></td>
                    <td className="px-3 py-3"><Skeleton className="h-3.5 w-8"  /></td>
                    <td className="px-3 py-3"><Skeleton className="h-3.5 w-52" /></td>
                    <td className="px-3 py-3"><Skeleton className="h-3.5 w-16" /></td>
                    <td className="px-3 py-3"><Skeleton className="h-3.5 w-10" /></td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                  </tr>
                ))
              ) : slots.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-sm text-muted-foreground">
                    Inga pass hittades för valt filter.
                  </td>
                </tr>
              ) : (
                slots.map((slot) => {
                  const instructor  = instructorMap[slot.instructor_id];
                  const lessonType  = lessonTypeMap[slot.lesson_type_id];
                  const isFull      = slot.current_bookings >= slot.max_bookings || slot.status === 'full';
                  const hasBookings = slot.current_bookings > 0;

                  return (
                    <tr
                      key={slot.id}
                      className={cn(
                        'border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors group',
                        rowHighlight(slot),
                      )}
                      onClick={() => handleSlotClick(slot)}
                    >
                      {/* Color status bar */}
                      <td className="py-0 px-0 w-5">
                        <div className={cn('w-1.5 h-full min-h-[40px]', statusDot(slot))} />
                      </td>

                      {/* Checkbox */}
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary" />
                      </td>

                      {/* Internt namn */}
                      <td className="px-3 py-3 font-medium text-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {lessonType?.name ?? '–'}
                          <Link2 className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary/60 transition-colors shrink-0" />
                        </span>
                      </td>

                      {/* Vecka */}
                      <td className="px-3 py-3 text-muted-foreground font-mono">
                        {getWeekNum(slot.starts_at)}
                      </td>

                      {/* Datum */}
                      <td className="px-3 py-3 text-foreground/80 whitespace-nowrap">
                        {formatDatum(slot.starts_at, slot.ends_at)}
                      </td>

                      {/* Lärare */}
                      <td className="px-3 py-3 text-foreground/80 whitespace-nowrap">
                        {instructor?.first_name ?? '–'}
                      </td>

                      {/* Bokningar */}
                      <td className="px-3 py-3">
                        <span className={cn(
                          'font-semibold',
                          isFull   ? 'text-red-600 dark:text-red-400' :
                          hasBookings ? 'text-amber-600 dark:text-amber-400' :
                          'text-muted-foreground',
                        )}>
                          {slot.current_bookings} / {slot.max_bookings}
                        </span>
                      </td>

                      {/* Transportstyrelsen */}
                      <td className="px-3 py-3 text-muted-foreground/30 text-[10px]">
                        –
                      </td>

                      {/* Anteckningar */}
                      <td className="px-3 py-3 text-muted-foreground">
                        {slot.notes ? (
                          <span className="text-xs truncate max-w-[120px] block">{slot.notes}</span>
                        ) : (
                          isFull && (
                            <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors"
                                title="Lägg till i kalender"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors"
                                title="Kopiera"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors"
                                title="Exportera"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          )
                        )}
                      </td>

                      {/* Åtgärd */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <span className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleSlotClick(slot)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium border border-border bg-background hover:bg-accent hover:text-foreground text-muted-foreground transition-colors"
                          >
                            Visa
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card shrink-0">
          <span className="text-xs text-muted-foreground">
            {total === 0
              ? 'Inga resultat'
              : `Visar ${fromRow} till ${toRow} av ${total} resultat`
            }
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded border border-border bg-background hover:bg-accent disabled:opacity-40 disabled:cursor-default transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === '…' ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={cn(
                      'w-7 h-7 rounded border text-xs font-medium transition-colors',
                      page === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border bg-background hover:bg-accent text-muted-foreground',
                    )}
                  >
                    {p}
                  </button>
                )
              )
            }
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded border border-border bg-background hover:bg-accent disabled:opacity-40 disabled:cursor-default transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <SlotDetailSheet slot={selectedSlot} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
