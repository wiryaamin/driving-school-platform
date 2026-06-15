import { useState, useMemo, type ReactNode } from 'react';
import { Check, X, AlertTriangle, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { Skeleton } from '@platform/ui';
import {
  useBookingList,
  useUpdateBookingStatus,
  useCancelBooking,
  BookingStatusBadge,
  type LessonBooking,
} from '@modules/scheduling/index.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { cn } from '@/lib/utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

type BokTab = 'inkommande' | 'pyramid' | 'godkanda' | 'installda' | 'avbokningar';

const TABS: { key: BokTab; label: string }[] = [
  { key: 'inkommande',  label: 'Inkommande' },
  { key: 'pyramid',     label: 'Bokbeställningar (Pyramid)' },
  { key: 'godkanda',    label: 'Godkända' },
  { key: 'installda',   label: 'Inställda' },
  { key: 'avbokningar', label: 'Avbokningar' },
];

// 3 years back → 1 year forward
const WIDE_FROM = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
const WIDE_TO   = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
const PAGE_SIZE = 25;

// ─── Formatters ───────────────────────────────────────────────────────────────

const _DF = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm', day: '2-digit', month: '2-digit', year: 'numeric',
});
const _TF = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hour12: false,
});

function fmtDate(iso: string): string { return _DF.format(new Date(iso)); }
function fmtDT(iso: string): string {
  const d = new Date(iso);
  return `${_DF.format(d)} ${_TF.format(d)}`;
}
function fmtSek(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency', currency: 'SEK', maximumFractionDigits: 0,
  }).format(n);
}

// ─── Table primitives ─────────────────────────────────────────────────────────

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn(
      'px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground',
      'uppercase tracking-wide whitespace-nowrap',
      className,
    )}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn('px-3 py-2.5 text-sm', className)}>
      {children}
    </td>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <tbody>
      {Array.from({ length: 5 }, (_, i) => (
        <tr key={i} className="border-b border-border">
          {Array.from({ length: cols }, (_, j) => (
            <td key={j} className="px-3 py-2.5">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tbody>
      <tr>
        <td colSpan={cols} className="px-4 py-14 text-center">
          <p className="text-sm text-muted-foreground">{message}</p>
        </td>
      </tr>
    </tbody>
  );
}

function Pager({
  page, total, pageSize, onChange,
}: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/5">
      <span className="text-xs text-muted-foreground">
        {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} av {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs px-2 tabular-nums">{page} / {pages}</span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Shared lookup maps type ──────────────────────────────────────────────────

interface NameMaps {
  instructorMap: Map<string, string>;
  studentMap:    Map<string, string>;
  lessonMap:     Map<string, string>;
}

// ─── Tab: Inkommande (reserved) ───────────────────────────────────────────────

function InkommandaTab({
  bookings, isLoading, maps,
}: { bookings: LessonBooking[]; isLoading: boolean; maps: NameMaps }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const approve = useUpdateBookingStatus();
  const reject  = useCancelBooking();
  const cols    = 7;

  async function handleApprove(b: LessonBooking) {
    setPendingId(b.id);
    try {
      await approve.mutateAsync({ id: b.id, slot_id: b.slot_id, status: 'confirmed' });
    } finally {
      setPendingId(null);
    }
  }

  async function handleReject(b: LessonBooking) {
    setPendingId(b.id);
    try {
      await reject.mutateAsync({
        id: b.id,
        slot_id: b.slot_id,
        cancellation_reason:   'Nekad av administratör',
        cancellation_category: 'school_cancelled',
      });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="bg-muted/30 border-b border-border">
          <tr>
            <Th>Skapad</Th>
            <Th>Önskad tidpunkt</Th>
            <Th>Artikel</Th>
            <Th>Förfrågan</Th>
            <Th>Kund</Th>
            <Th>Lärare</Th>
            <Th>Val</Th>
          </tr>
        </thead>
        {isLoading ? (
          <TableSkeleton cols={cols} />
        ) : bookings.length === 0 ? (
          <EmptyRow cols={cols} message="Det finns inga obehandlade bokningsförfrågningar." />
        ) : (
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                <Td className="text-muted-foreground whitespace-nowrap">{fmtDate(b.created_at)}</Td>
                <Td className="whitespace-nowrap">{fmtDT(b.starts_at)}</Td>
                <Td className="text-muted-foreground">
                  {maps.lessonMap.get(b.lesson_type_id) ?? '—'}
                </Td>
                <Td>Online-bokning</Td>
                <Td>{maps.studentMap.get(b.student_id) ?? `#${b.student_id.slice(-6)}`}</Td>
                <Td>{maps.instructorMap.get(b.instructor_id) ?? `#${b.instructor_id.slice(-6)}`}</Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void handleApprove(b)}
                      disabled={pendingId === b.id}
                      title="Godkänn bokning"
                      className="p-1.5 rounded bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-950 dark:hover:bg-green-900 dark:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => void handleReject(b)}
                      disabled={pendingId === b.id}
                      title="Neka bokning"
                      className="p-1.5 rounded bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

// ─── Tab: Bokbeställningar (Pyramid / draft) ──────────────────────────────────

function PyramidTab({
  bookings, isLoading, maps,
}: { bookings: LessonBooking[]; isLoading: boolean; maps: NameMaps }) {
  const cols = 8;
  return (
    <div>
      {/* Pink integration warning */}
      <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-lg border border-pink-200 bg-pink-50 px-4 py-3 dark:border-pink-800/60 dark:bg-pink-950/30">
        <AlertTriangle className="w-4 h-4 text-pink-600 dark:text-pink-400 shrink-0 mt-0.5" />
        <p className="text-sm text-pink-800 dark:text-pink-300">
          Bokbeställningar från Pyramid-integrationen visas här. Aktivera Pyramid-koppling under
          Inställningar → Integrationer för att ta emot bokbeställningar automatiskt.
        </p>
      </div>

      <div className="overflow-x-auto mt-4">
        <table className="w-full border-collapse">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <Th>Skapad</Th>
              <Th>Tid</Th>
              <Th>Artikel</Th>
              <Th>Förfrågan</Th>
              <Th>Totalbelopp</Th>
              <Th>Kund</Th>
              <Th>Markerad som levererad av</Th>
              <Th>Val</Th>
            </tr>
          </thead>
          {isLoading ? (
            <TableSkeleton cols={cols} />
          ) : bookings.length === 0 ? (
            <EmptyRow cols={cols} message="Det finns inga bokbeställningar från Pyramid." />
          ) : (
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <Td className="text-muted-foreground whitespace-nowrap">{fmtDate(b.created_at)}</Td>
                  <Td className="whitespace-nowrap">{fmtDT(b.starts_at)}</Td>
                  <Td>{maps.lessonMap.get(b.lesson_type_id) ?? '—'}</Td>
                  <Td>Pyramid</Td>
                  <Td className="tabular-nums">{fmtSek(b.price_sek)}</Td>
                  <Td>{maps.studentMap.get(b.student_id) ?? `#${b.student_id.slice(-6)}`}</Td>
                  <Td className="text-muted-foreground">
                    {b.booked_by ? `#${b.booked_by.slice(-6)}` : '—'}
                  </Td>
                  <Td>
                    <button
                      title="Visa detaljer"
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Godkända (confirmed + completed) ────────────────────────────────────

function GodkandaTab({
  bookings, isLoading, maps,
}: { bookings: LessonBooking[]; isLoading: boolean; maps: NameMaps }) {
  const [page, setPage] = useState(1);
  const cols   = 10;
  const paged  = bookings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <Th>Skapad</Th>
              <Th>Tid</Th>
              <Th>Artikel</Th>
              <Th>Förfrågan</Th>
              <Th>Antal</Th>
              <Th>Pris</Th>
              <Th>Kund</Th>
              <Th>Lärare</Th>
              <Th>Status</Th>
              <Th>Val</Th>
            </tr>
          </thead>
          {isLoading ? (
            <TableSkeleton cols={cols} />
          ) : bookings.length === 0 ? (
            <EmptyRow cols={cols} message="Inga godkända bokningar hittades." />
          ) : (
            <tbody>
              {paged.map((b) => (
                <tr key={b.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <Td className="text-muted-foreground whitespace-nowrap">{fmtDate(b.created_at)}</Td>
                  <Td className="whitespace-nowrap">{fmtDT(b.starts_at)}</Td>
                  <Td>{maps.lessonMap.get(b.lesson_type_id) ?? '—'}</Td>
                  <Td>Online-bokning</Td>
                  <Td>1</Td>
                  <Td className="tabular-nums">{fmtSek(b.price_sek)}</Td>
                  <Td>{maps.studentMap.get(b.student_id) ?? `#${b.student_id.slice(-6)}`}</Td>
                  <Td>{maps.instructorMap.get(b.instructor_id) ?? `#${b.instructor_id.slice(-6)}`}</Td>
                  <Td><BookingStatusBadge status={b.status} /></Td>
                  <Td>
                    <button
                      title="Visa detaljer"
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      <Pager page={page} total={bookings.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}

// ─── Tab: Inställda (rescheduled) ─────────────────────────────────────────────

function InstalldaTab({
  bookings, isLoading, maps,
}: { bookings: LessonBooking[]; isLoading: boolean; maps: NameMaps }) {
  const cols = 9;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="bg-muted/30 border-b border-border">
          <tr>
            <Th>Skapad</Th>
            <Th>Tid</Th>
            <Th>Artikel</Th>
            <Th>Platform</Th>
            <Th>Antal</Th>
            <Th>Totalbelopp</Th>
            <Th>Kund</Th>
            <Th>Lärare</Th>
            <Th>Inställd av</Th>
          </tr>
        </thead>
        {isLoading ? (
          <TableSkeleton cols={cols} />
        ) : bookings.length === 0 ? (
          <EmptyRow cols={cols} message="Inga inställda bokningar hittades." />
        ) : (
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                <Td className="text-muted-foreground whitespace-nowrap">{fmtDate(b.created_at)}</Td>
                <Td className="whitespace-nowrap">{fmtDT(b.starts_at)}</Td>
                <Td>{maps.lessonMap.get(b.lesson_type_id) ?? '—'}</Td>
                <Td>Online</Td>
                <Td>1</Td>
                <Td className="tabular-nums">{fmtSek(b.price_sek)}</Td>
                <Td>{maps.studentMap.get(b.student_id) ?? `#${b.student_id.slice(-6)}`}</Td>
                <Td>{maps.instructorMap.get(b.instructor_id) ?? `#${b.instructor_id.slice(-6)}`}</Td>
                <Td className="text-muted-foreground">
                  {b.cancelled_by ? `#${b.cancelled_by.slice(-6)}` : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

// ─── Tab: Avbokningar (cancelled + no_show) ───────────────────────────────────

const CANCEL_CAT_LABEL: Record<string, string> = {
  student_request: 'Elevens begäran',
  school_cancelled: 'Avbokad av skolan',
  weather: 'Väder',
  vehicle_fault: 'Fordonsfel',
  instructor_sick: 'Lärare sjuk',
  other: 'Övrigt',
};

function AvbokningarTab({
  bookings, isLoading, maps,
}: { bookings: LessonBooking[]; isLoading: boolean; maps: NameMaps }) {
  const cols = 7;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="bg-muted/30 border-b border-border">
          <tr>
            <Th>Skapad</Th>
            <Th>Tid</Th>
            <Th>Artikel</Th>
            <Th>Kund</Th>
            <Th>Lärare</Th>
            <Th>Avbokad av</Th>
            <Th>Anledning</Th>
          </tr>
        </thead>
        {isLoading ? (
          <TableSkeleton cols={cols} />
        ) : bookings.length === 0 ? (
          <EmptyRow cols={cols} message="Inga avbokningar hittades." />
        ) : (
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                <Td className="text-muted-foreground whitespace-nowrap">{fmtDate(b.created_at)}</Td>
                <Td className="whitespace-nowrap">{fmtDT(b.starts_at)}</Td>
                <Td>{maps.lessonMap.get(b.lesson_type_id) ?? '—'}</Td>
                <Td>{maps.studentMap.get(b.student_id) ?? `#${b.student_id.slice(-6)}`}</Td>
                <Td>{maps.instructorMap.get(b.instructor_id) ?? `#${b.instructor_id.slice(-6)}`}</Td>
                <Td className="text-muted-foreground">
                  {b.cancelled_by ? `#${b.cancelled_by.slice(-6)}` : '—'}
                </Td>
                <Td className="text-muted-foreground text-xs">
                  {b.cancellation_category
                    ? (CANCEL_CAT_LABEL[b.cancellation_category] ?? b.cancellation_category)
                    : (b.cancellation_reason ?? '—')}
                </Td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function BokningarPage() {
  const [tab, setTab] = useState<BokTab>('inkommande');

  // ── Data fetching ────────────────────────────────────────────────────────────
  const allBookings = useBookingList({ from: WIDE_FROM, to: WIDE_TO, per_page: 500 });
  const instructors = useInstructorList({ per_page: 200 });
  const students    = useStudentList({ per_page: 500 });
  const lessonTypes = useLessonTypes();

  // ── Name lookup maps ─────────────────────────────────────────────────────────
  const instructorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of instructors.data?.data ?? []) {
      m.set(i.id, `${i.first_name} ${i.last_name}`);
    }
    return m;
  }, [instructors.data]);

  const studentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of students.data?.data ?? []) {
      m.set(s.id, `${s.first_name} ${s.last_name}`);
    }
    return m;
  }, [students.data]);

  const lessonMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const lt of lessonTypes.data ?? []) {
      m.set(lt.id, lt.name);
    }
    return m;
  }, [lessonTypes.data]);

  const maps: NameMaps = { instructorMap, studentMap, lessonMap };

  // ── Filter by status ─────────────────────────────────────────────────────────
  const all = allBookings.data?.data ?? [];
  const isLoading = allBookings.isLoading;

  const byTab = useMemo(() => ({
    inkommande:  all.filter((b) => b.status === 'reserved'),
    pyramid:     all.filter((b) => b.status === 'draft'),
    godkanda:    all.filter((b) => b.status === 'confirmed' || b.status === 'completed'),
    installda:   all.filter((b) => b.status === 'rescheduled'),
    avbokningar: all.filter((b) => b.status === 'cancelled' || b.status === 'no_show'),
  }), [all]);

  return (
    <div className="-m-4 md:-m-5">

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="bg-background border-b border-border px-4 md:px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Bokningar</h1>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────────── */}
      <div className="bg-background border-b border-border px-2 md:px-4 flex items-end overflow-x-auto">
        {TABS.map((t) => {
          const count = byTab[t.key].length;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3 md:px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 shrink-0',
                isActive
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {t.label}
              {!isLoading && count > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center text-[10px] font-semibold rounded-full',
                  'px-1.5 min-w-[18px] h-[18px]',
                  isActive
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-muted text-muted-foreground',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────────── */}
      <div className="bg-background mt-0">
        {tab === 'inkommande' && (
          <InkommandaTab
            bookings={byTab.inkommande}
            isLoading={isLoading}
            maps={maps}
          />
        )}
        {tab === 'pyramid' && (
          <PyramidTab
            bookings={byTab.pyramid}
            isLoading={isLoading}
            maps={maps}
          />
        )}
        {tab === 'godkanda' && (
          <GodkandaTab
            bookings={byTab.godkanda}
            isLoading={isLoading}
            maps={maps}
          />
        )}
        {tab === 'installda' && (
          <InstalldaTab
            bookings={byTab.installda}
            isLoading={isLoading}
            maps={maps}
          />
        )}
        {tab === 'avbokningar' && (
          <AvbokningarTab
            bookings={byTab.avbokningar}
            isLoading={isLoading}
            maps={maps}
          />
        )}
      </div>
    </div>
  );
}
