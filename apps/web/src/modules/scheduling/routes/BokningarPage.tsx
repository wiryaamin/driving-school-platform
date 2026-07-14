import { useState, useMemo, type ReactNode } from 'react';
import { Check, X, AlertTriangle, ChevronLeft, ChevronRight, Eye, RotateCcw } from 'lucide-react';
import {
  Skeleton, toast,
  Sheet, SheetContent, SheetHeader, SheetTitle,
  ScrollArea, Separator,
} from '@platform/ui';
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
import { useSendMessage } from '@modules/communication/hooks/useCommunication.js';
import { BookingMessageHistory } from '../components/BookingMessageHistory.js';
import { StudentBookingDialog } from '../components/StudentBookingDialog.js';
import { cn } from '@/lib/utils.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import type { Student } from '@platform/types';

// ─── Constants ────────────────────────────────────────────────────────────────

type BokTab = 'inkommande' | 'pyramid' | 'godkanda' | 'installda' | 'avbokningar';

const TABS: { key: BokTab; label: string }[] = [
  { key: 'inkommande',  label: 'Inkommande' },
  { key: 'pyramid',     label: 'Bokbeställningar (Pyramid)' },
  { key: 'godkanda',    label: 'Godkända' },
  { key: 'installda',   label: 'Inställda' },
  { key: 'avbokningar', label: 'Avbokningar' },
];

// 6 months back → 6 months forward — sufficient for operational workflows
const WIDE_FROM = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
const WIDE_TO   = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
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

function relativeTime(iso: string): string {
  const ms    = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1)  return 'nyligen';
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.floor(hours / 24);
  return `${days} dag${days !== 1 ? 'ar' : ''} sedan`;
}

function slaHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
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
  instructorMap:  Map<string, string>;
  studentMap:     Map<string, string>;
  lessonMap:      Map<string, string>;
  studentObjMap:  Map<string, Student>;
}

// ─── Tab: Inkommande (reserved) ───────────────────────────────────────────────

function InkommandaTab({
  bookings, isLoading, maps,
}: { bookings: LessonBooking[]; isLoading: boolean; maps: NameMaps }) {
  const [pendingId,       setPendingId]       = useState<string | null>(null);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const approve = useUpdateBookingStatus();
  const reject  = useCancelBooking();
  const sendSms = useSendMessage();
  const cols    = 7;

  async function handleApprove(b: LessonBooking) {
    setPendingId(b.id);
    try {
      await approve.mutateAsync({ id: b.id, slot_id: b.slot_id, status: 'confirmed' });
      const studentName = maps.studentMap.get(b.student_id) ?? '';
      toast({
        title:       'Bokning bekräftad',
        description: studentName ? `${studentName} · ${fmtDT(b.starts_at)}` : undefined,
      });
      // SMS notification — fire-and-forget if phone is available
      const student = maps.studentObjMap.get(b.student_id);
      if (student?.phone) {
        sendSms.mutate({
          channel:           'sms',
          recipient_type:    'student',
          recipient_id:      student.id,
          recipient_address: student.phone,
          body:              `Hej ${student.first_name}, din körlektion ${fmtDT(b.starts_at)} är nu bekräftad. Vi ses!`,
          metadata:          { event: 'booking_confirmed', manual: true },
        });
      }
    } catch (err) {
      toast({
        title:       'Bekräftning misslyckades',
        description: err instanceof Error ? err.message : 'Försök igen',
        variant:     'destructive',
      });
    } finally {
      setPendingId(null);
    }
  }

  async function handleReject(b: LessonBooking) {
    setConfirmRejectId(null);
    setPendingId(b.id);
    try {
      await reject.mutateAsync({
        id: b.id,
        slot_id: b.slot_id,
        cancellation_reason:   'Nekad av administratör',
        cancellation_category: 'school_cancelled',
      });
      const studentName = maps.studentMap.get(b.student_id) ?? '';
      toast({
        title:       'Bokningsförfrågan nekad',
        description: studentName || undefined,
      });
      // SMS notification — fire-and-forget if phone is available
      const student = maps.studentObjMap.get(b.student_id);
      if (student?.phone) {
        sendSms.mutate({
          channel:           'sms',
          recipient_type:    'student',
          recipient_id:      student.id,
          recipient_address: student.phone,
          body:              `Hej ${student.first_name}, tyvärr kan vi inte bekräfta din bokningsförfrågan för ${fmtDT(b.starts_at)}. Kontakta oss för att hitta ett nytt alternativ.`,
          metadata:          { event: 'booking_rejected', manual: true },
        });
      }
    } catch (err) {
      toast({
        title:       'Åtgärd misslyckades',
        description: err instanceof Error ? err.message : 'Försök igen',
        variant:     'destructive',
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
                <Td className="text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {slaHours(b.created_at) >= 48 ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Väntat >48 tim" />
                    ) : slaHours(b.created_at) >= 24 ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Väntat >24 tim" />
                    ) : null}
                    <span>{fmtDate(b.created_at)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{relativeTime(b.created_at)}</div>
                </Td>
                <Td className="whitespace-nowrap">{fmtDT(b.starts_at)}</Td>
                <Td className="text-muted-foreground">
                  {maps.lessonMap.get(b.lesson_type_id) ?? '—'}
                </Td>
                <Td>
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                    b.booked_by && b.booked_by !== b.student_id
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
                  )}>
                    {b.booked_by && b.booked_by !== b.student_id ? 'Admin-skapad' : 'Elev-begäran'}
                  </span>
                </Td>
                <Td>{maps.studentMap.get(b.student_id) ?? `#${b.student_id.slice(-6)}`}</Td>
                <Td>{maps.instructorMap.get(b.instructor_id) ?? `#${b.instructor_id.slice(-6)}`}</Td>
                <Td>
                  <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
                    {confirmRejectId === b.id ? (
                      /* Inline rejection confirmation — prevents accidental rejects */
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => void handleReject(b)}
                          disabled={pendingId === b.id}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          Neka
                        </button>
                        <button
                          onClick={() => setConfirmRejectId(null)}
                          className="px-2 py-1 rounded text-[11px] border border-border hover:bg-accent transition-colors"
                        >
                          Avbryt
                        </button>
                      </div>
                    ) : (
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
                          onClick={() => setConfirmRejectId(b.id)}
                          disabled={pendingId === b.id}
                          title="Neka bokning"
                          className="p-1.5 rounded bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </PermissionGate>
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
  bookings, isLoading, maps, onDetail,
}: { bookings: LessonBooking[]; isLoading: boolean; maps: NameMaps; onDetail: (b: LessonBooking) => void }) {
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
                      onClick={() => onDetail(b)}
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
  const [page, setPage] = useState(1);
  const cols  = 9;
  const paged = bookings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <Th>Skapad</Th>
              <Th>Tid</Th>
              <Th>Artikel</Th>
              <Th>Plattform</Th>
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
              {paged.map((b) => (
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
      <Pager page={page} total={bookings.length} pageSize={PAGE_SIZE} onChange={setPage} />
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
  bookings, isLoading, maps, onRebook,
}: { bookings: LessonBooking[]; isLoading: boolean; maps: NameMaps; onRebook: (b: LessonBooking) => void }) {
  const [page, setPage] = useState(1);
  const cols  = 8;
  const paged = bookings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const noShowCount    = bookings.filter((b) => b.status === 'no_show').length;
  const cancelledCount = bookings.filter((b) => b.status === 'cancelled').length;
  const catCounts: Record<string, number> = {};
  for (const b of bookings) {
    const cat = b.cancellation_category ?? 'other';
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
  }
  const topCatEntry = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
  const topCatLabel = topCatEntry ? (CANCEL_CAT_LABEL[topCatEntry[0]] ?? topCatEntry[0]) : null;

  return (
    <div>
      {!isLoading && bookings.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 px-4 md:px-6 py-2.5 bg-muted/20 border-b border-border text-xs text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{cancelledCount}</span> avbokade
          </span>
          {noShowCount > 0 && (
            <span>
              <span className="font-semibold text-amber-700 dark:text-amber-400">{noShowCount}</span> uteblivna
            </span>
          )}
          {topCatLabel && (
            <span>
              Vanligaste: <span className="font-medium text-foreground">{topCatLabel}</span>
            </span>
          )}
        </div>
      )}
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
              <Th>Åtgärd</Th>
            </tr>
          </thead>
          {isLoading ? (
            <TableSkeleton cols={cols} />
          ) : bookings.length === 0 ? (
            <EmptyRow cols={cols} message="Inga avbokningar hittades." />
          ) : (
            <tbody>
              {paged.map((b) => (
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
                  <Td>
                    <button
                      onClick={() => onRebook(b)}
                      title="Boka ny lektion för denna kund"
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Ny bokning
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

// ─── Booking detail sheet ─────────────────────────────────────────────────────

function TimelineRow({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', dot)} />
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

function BookingDetailContent({
  booking, maps,
}: {
  booking: LessonBooking;
  maps:    NameMaps;
}) {
  const studentName    = maps.studentMap.get(booking.student_id)    ?? `#${booking.student_id.slice(-6)}`;
  const instructorName = maps.instructorMap.get(booking.instructor_id) ?? `#${booking.instructor_id.slice(-6)}`;
  const lessonName     = maps.lessonMap.get(booking.lesson_type_id) ?? null;
  const cancelLabel    = booking.cancellation_category
    ? (CANCEL_CAT_LABEL[booking.cancellation_category] ?? booking.cancellation_category)
    : (booking.cancellation_reason ?? null);

  return (
    <div className="px-5 py-4 space-y-5">
      <div className="space-y-1">
        <BookingStatusBadge status={booking.status} />
        <p className="text-base font-semibold text-foreground mt-1.5">{studentName}</p>
        <p className="text-xs text-muted-foreground">{fmtDT(booking.starts_at)} · {instructorName}</p>
        {lessonName && <p className="text-xs text-muted-foreground">{lessonName}</p>}
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bokningshistorik</h3>
        <TimelineRow dot="bg-muted-foreground/40" label="Förfrågan skapad" value={fmtDT(booking.created_at)} />
        <TimelineRow dot="bg-primary/60"           label="Lektionstid"     value={fmtDT(booking.starts_at)} />
        {cancelLabel && (
          <TimelineRow dot="bg-destructive" label="Avbokning" value={cancelLabel} />
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notiser</h3>
        <BookingMessageHistory studentId={booking.student_id} maxCount={5} />
      </div>
    </div>
  );
}

// ─── SLA banner ───────────────────────────────────────────────────────────────

function SlaBanner({ bookings }: { bookings: LessonBooking[] }) {
  const over48 = bookings.filter((b) => slaHours(b.created_at) >= 48).length;
  const over24 = bookings.filter((b) => slaHours(b.created_at) >= 24 && slaHours(b.created_at) < 48).length;
  if (over48 === 0 && over24 === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 md:px-6 py-2 bg-muted/30 border-b border-border text-xs">
      {over48 > 0 && (
        <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {over48} {over48 === 1 ? 'förfrågan' : 'förfrågningar'} väntat &gt;48 tim
        </span>
      )}
      {over24 > 0 && (
        <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          {over24} {over24 === 1 ? 'förfrågan' : 'förfrågningar'} väntat &gt;24 tim
        </span>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function BokningarPage() {
  const [tab,           setTab]           = useState<BokTab>('inkommande');
  const [detailBooking, setDetailBooking] = useState<LessonBooking | null>(null);
  const [rebookStudent, setRebookStudent] = useState<{ studentId: string; studentName: string } | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const allBookings = useBookingList({ from: WIDE_FROM, to: WIDE_TO, per_page: 200 });
  const instructors = useInstructorList({ per_page: 200 });
  const students    = useStudentList({ per_page: 200 });
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

  const studentObjMap = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of students.data?.data ?? []) {
      m.set(s.id, s);
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

  const maps: NameMaps = { instructorMap, studentMap, lessonMap, studentObjMap };

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

      {/* ── Pending bookings attention banner ─────────────────────────────────── */}
      {!isLoading && byTab.inkommande.length > 0 && tab !== 'inkommande' && (
        <div
          className="flex items-center justify-between px-4 md:px-6 py-2.5 bg-amber-50 border-b border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/60 cursor-pointer"
          onClick={() => setTab('inkommande')}
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {byTab.inkommande.length === 1
                ? '1 bokningsförfrågan väntar på svar'
                : `${byTab.inkommande.length} bokningsförfrågningar väntar på svar`}
            </span>
          </div>
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1 shrink-0">
            Granska nu <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      )}

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
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {t.label}
              {!isLoading && count > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center text-[10px] font-semibold rounded-full',
                  'px-1.5 min-w-[18px] h-[18px]',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Truncation notice (>200 bookings in window) ───────────────────────── */}
      {!isLoading && (allBookings.data?.meta?.total ?? 0) > 200 && (
        <div className="flex items-center gap-2 px-4 md:px-6 py-2 bg-blue-50 border-b border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/60">
          <AlertTriangle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="text-xs text-blue-800 dark:text-blue-300">
            Visar 200 av {allBookings.data!.meta.total} bokningar. Använd datumfilter i passöversikten för att söka äldre poster.
          </span>
        </div>
      )}

      {/* ── Tab content ───────────────────────────────────────────────────────── */}
      <div className="bg-background mt-0">
        {tab === 'inkommande' && (
          <>
            <SlaBanner bookings={byTab.inkommande} />
            <InkommandaTab
              bookings={byTab.inkommande}
              isLoading={isLoading}
              maps={maps}
            />
          </>
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
            onDetail={setDetailBooking}
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
            onRebook={(b) => {
              const name = maps.studentMap.get(b.student_id) ?? '';
              setRebookStudent({ studentId: b.student_id, studentName: name });
            }}
          />
        )}
      </div>

      {/* ── Booking detail sheet ──────────────────────────────────────────────── */}
      <Sheet open={detailBooking !== null} onOpenChange={(o) => { if (!o) setDetailBooking(null); }}>
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
            <SheetTitle>Bokningsdetaljer</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1">
            {detailBooking && (
              <BookingDetailContent booking={detailBooking} maps={maps} />
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ── Rebook dialog (from Avbokningar tab) ─────────────────────────────── */}
      <StudentBookingDialog
        open={rebookStudent !== null}
        onClose={() => setRebookStudent(null)}
        studentId={rebookStudent?.studentId ?? ''}
        studentName={rebookStudent?.studentName ?? ''}
      />
    </div>
  );
}
