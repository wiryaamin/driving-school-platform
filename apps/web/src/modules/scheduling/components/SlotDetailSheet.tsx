import { useState, useMemo, useEffect } from 'react';
import { Clock, Users, UserX, CheckCircle, XCircle, CalendarCheck, ChevronDown, ChevronUp, Loader2, Bell, GraduationCap, ArrowLeftRight, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  Button, Badge, Separator, ScrollArea, Skeleton,
} from '@platform/ui';
import { toast } from '@platform/ui';
import type { LessonSlot, LessonBooking, BookingStatus, Student } from '@platform/types';
import { useStudentsBatch } from '@modules/students/hooks/useStudents.js';
import { useInstructor } from '@modules/instructors/index.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useBookingsForSlot } from '../hooks/useBookings.js';
import { useWaitlistForSlot } from '../hooks/useWaitlist.js';
import { useUpdateBookingStatus } from '../hooks/useSchedulingMutations.js';
import { SlotStatusBadge } from './SlotStatusBadge.js';
import { BookingStatusBadge, isTerminalBookingStatus } from './BookingStatusBadge.js';
import { CancelBookingDialog } from './CancelBookingDialog.js';
import { BookingDialog } from './BookingDialog.js';
import { RescheduleBookingDialog } from './RescheduleBookingDialog.js';
import { formatSlotDate, formatSlotTime, formatCapacity, slotDurationMinutes, isSlotFull } from '../lib/calendarUtils.js';

// ─── Student name — clickable link to student detail ─────────────────────────

function StudentName({
  id, student, isLoading, onNavigate,
}: {
  id: string;
  student?: Student;
  isLoading: boolean;
  onNavigate?: (path: string) => void;
}) {
  if (isLoading) return <Skeleton className="h-4 w-28 inline-block" />;
  if (!student) return <span className="font-mono text-xs text-muted-foreground">{id.slice(0, 8)}…</span>;
  const name = `${student.first_name} ${student.last_name}`;
  if (!onNavigate) return <span className="font-medium">{name}</span>;
  return (
    <button
      type="button"
      onClick={() => onNavigate(`/students/${id}`)}
      className="font-medium text-primary hover:underline inline-flex items-center gap-1"
    >
      {name}
      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
    </button>
  );
}

// ─── Instructor name — clickable link to instructor detail ───────────────────

function InstructorName({ id, onNavigate }: { id: string; onNavigate?: (path: string) => void }) {
  const { data: instructor, isLoading } = useInstructor(id);
  if (isLoading) return <Skeleton className="h-4 w-28 inline-block" />;
  if (!instructor) return <span className="font-mono text-xs text-muted-foreground">{id.slice(0, 8)}…</span>;
  const name = `${instructor.first_name} ${instructor.last_name}`;
  if (!onNavigate) return <span className="font-medium">{name}</span>;
  return (
    <button
      type="button"
      onClick={() => onNavigate(`/instructors/${id}`)}
      className="font-medium text-primary hover:underline"
    >
      {name}
    </button>
  );
}

// ─── Booking row ──────────────────────────────────────────────────────────────

interface BookingRowProps {
  booking:         LessonBooking;
  slotId:          string;
  onCancel:        (id: string) => void;
  onReschedule:    (id: string, studentName: string) => void;
  onNavigate:      (path: string) => void;
  student?:        Student;
  studentsLoading: boolean;
}

function BookingRow({ booking, slotId, onCancel, onReschedule, onNavigate, student, studentsLoading }: BookingRowProps) {
  const updateStatus = useUpdateBookingStatus();
  const terminal     = isTerminalBookingStatus(booking.status);
  const studentName  = student ? `${student.first_name} ${student.last_name}` : '';

  function handleStatus(status: BookingStatus) {
    updateStatus.mutate(
      { id: booking.id, slot_id: slotId, status },
      {
        onSuccess: () => toast({ title: statusToastLabel(status) }),
        onError:   (err) => toast({
          title:       'Åtgärd misslyckades',
          description: err instanceof Error ? err.message : 'Försök igen',
          variant:     'destructive',
        }),
      }
    );
  }

  const busy = updateStatus.isPending;

  return (
    <div className="flex flex-col gap-2 py-3 border-b border-border last:border-0">
      {/* Student + status row */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <span className="text-sm truncate">
            <StudentName
              id={booking.student_id}
              student={student}
              isLoading={studentsLoading}
              onNavigate={onNavigate}
            />
          </span>
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>

      {/* Attendance row — prominent for confirmed bookings */}
      {booking.status === 'confirmed' && !terminal && (
        <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
          <div className="ml-9 flex items-center gap-1.5 p-2 bg-muted/40 rounded-lg border border-border">
            <span className="text-xs text-muted-foreground mr-1">Närvaro:</span>
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white border-0"
              disabled={busy}
              onClick={() => handleStatus('completed')}
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              Närvaro
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/20"
              disabled={busy}
              onClick={() => handleStatus('no_show')}
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
              Uteblev
            </Button>
          </div>
        </PermissionGate>
      )}

      {/* Secondary actions */}
      {!terminal && (
        <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
          <div className="flex flex-wrap gap-1.5 ml-9">
            {/* Bekräfta — draft or reserved */}
            {(booking.status === 'draft' || booking.status === 'reserved') && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                disabled={busy}
                onClick={() => handleStatus('confirmed')}
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarCheck className="w-3 h-3" />}
                Bekräfta
              </Button>
            )}

            {/* Omboka — available for all non-terminal bookings */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              disabled={busy}
              onClick={() => onReschedule(booking.id, studentName)}
            >
              <ArrowLeftRight className="w-3 h-3" />
              Omboka
            </Button>

            {/* Avboka */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={busy}
              onClick={() => onCancel(booking.id)}
            >
              <XCircle className="w-3 h-3" />
              Avboka
            </Button>
          </div>
        </PermissionGate>
      )}
    </div>
  );
}

function statusToastLabel(status: BookingStatus): string {
  switch (status) {
    case 'confirmed': return 'Bokning bekräftad';
    case 'completed': return 'Närvaro registrerad';
    case 'no_show':   return 'Uteblivande registrerat';
    default:          return 'Status uppdaterad';
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlotDetailSheetProps {
  slot:         LessonSlot | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SlotDetailSheet({ slot, open, onOpenChange }: SlotDetailSheetProps) {
  const navigate = useNavigate();
  const [bookingDialogOpen,     setBookingDialogOpen]     = useState(false);
  const [cancelBookingId,       setCancelBookingId]       = useState<string | null>(null);
  const [cancelDialogOpen,      setCancelDialogOpen]      = useState(false);
  const [rescheduleBookingId,   setRescheduleBookingId]   = useState<string | null>(null);
  const [rescheduleStudentName, setRescheduleStudentName] = useState('');
  const [rescheduleDialogOpen,  setRescheduleDialogOpen]  = useState(false);
  const [waitlistExpanded,      setWaitlistExpanded]      = useState(false);

  function handleNavigate(path: string) {
    onOpenChange(false);
    navigate(path);
  }

  // Reset all internal dialog state when the sheet closes or a different slot is opened.
  // Prevents cancel/reschedule dialogs from a previous slot leaking into the next one.
  useEffect(() => {
    if (!open) {
      setBookingDialogOpen(false);
      setCancelBookingId(null);
      setCancelDialogOpen(false);
      setRescheduleBookingId(null);
      setRescheduleStudentName('');
      setRescheduleDialogOpen(false);
      setWaitlistExpanded(false);
    }
  }, [open]);

  useEffect(() => {
    setBookingDialogOpen(false);
    setCancelBookingId(null);
    setCancelDialogOpen(false);
    setRescheduleBookingId(null);
    setRescheduleStudentName('');
    setRescheduleDialogOpen(false);
    setWaitlistExpanded(false);
  }, [slot?.id]);

  const { data: bookingsData, isLoading: bookingsLoading } = useBookingsForSlot(slot?.id ?? null);
  const { data: waitlistData }                              = useWaitlistForSlot(slot?.id ?? null);

  const bookings      = bookingsData?.data ?? [];
  const waitlistItems = waitlistData ?? [];
  const waitingCount  = waitlistItems.length;
  const full          = slot ? isSlotFull(slot) : false;

  // Auto-expand waitlist when it's small enough to read at a glance
  useEffect(() => {
    if (waitingCount > 0 && waitingCount <= 4) {
      setWaitlistExpanded(true);
    }
  }, [waitingCount]);

  // Collect all unique student IDs from bookings + waitlist, then batch-fetch in one request.
  const allStudentIds = useMemo(
    () => [...new Set([
      ...bookings.map(b => b.student_id),
      ...waitlistItems.map(e => e.student_id),
    ])],
    [bookingsData, waitlistData],
  );

  const { data: studentsData, isLoading: studentsLoading } = useStudentsBatch(allStudentIds);

  const studentMap = useMemo((): Record<string, Student> => {
    if (!studentsData) return {};
    return Object.fromEntries(studentsData.map(s => [s.id, s]));
  }, [studentsData]);

  function openCancel(bookingId: string) {
    setCancelBookingId(bookingId);
    setCancelDialogOpen(true);
  }

  function openReschedule(bookingId: string, studentName: string) {
    setRescheduleBookingId(bookingId);
    setRescheduleStudentName(studentName);
    setRescheduleDialogOpen(true);
  }

  if (!slot) return null;

  const duration   = slotDurationMinutes(slot);
  const dateLabel  = formatSlotDate(slot.starts_at);
  const startLabel = formatSlotTime(slot.starts_at);
  const endLabel   = formatSlotTime(slot.ends_at);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">
          {/* Header */}
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <SheetTitle className="text-left capitalize">{dateLabel} · {startLabel}–{endLabel}</SheetTitle>
              <SlotStatusBadge status={slot.status} />
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-5 py-4 space-y-5">

              {/* ── Slot Info ─────────────────────────────────────── */}
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <p className="text-xl font-bold text-foreground tracking-tight">
                    {startLabel}–{endLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">{duration} min</p>
                </div>

                {/* Capacity bar */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="w-4 h-4 shrink-0" />
                    <span>
                      {formatCapacity(slot.current_bookings, slot.max_bookings)} bokningar
                    </span>
                  </div>
                  {full && (
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40">
                      Fullbokad
                    </Badge>
                  )}
                </div>

                {/* Instructor */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                  <InstructorName id={slot.instructor_id} onNavigate={handleNavigate} />
                </div>

                {/* Timing detail */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono">{slot.starts_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
              </div>

              <Separator />

              {/* ── Bookings ──────────────────────────────────────── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Bokningar ({slot.current_bookings}/{slot.max_bookings})
                  </h3>
                </div>

                {bookingsLoading ? (
                  <div className="space-y-3 py-2">
                    {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
                  </div>
                ) : bookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3">
                    Inga bokningar för detta pass.
                  </p>
                ) : (
                  <div>
                    {bookings.map((booking) => (
                      <BookingRow
                        key={booking.id}
                        booking={booking}
                        slotId={slot.id}
                        onCancel={openCancel}
                        onReschedule={openReschedule}
                        onNavigate={handleNavigate}
                        student={studentMap[booking.student_id]}
                        studentsLoading={studentsLoading}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── Waitlist ──────────────────────────────────────── */}
              {waitingCount > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <button
                      className="flex items-center justify-between w-full text-left group"
                      onClick={() => setWaitlistExpanded((v) => !v)}
                    >
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        Väntelista
                        <Badge variant="outline" className="text-xs font-normal">
                          {waitingCount}
                        </Badge>
                      </h3>
                      {waitlistExpanded
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>

                    {waitlistExpanded && (
                      <div className="space-y-0.5">
                        {waitlistItems.map((entry, idx) => (
                          <div
                            key={entry.id}
                            className="flex items-center gap-2 text-sm py-1.5"
                          >
                            <span className="w-5 text-xs font-mono text-muted-foreground/50 shrink-0 text-right">
                              {idx + 1}.
                            </span>
                            <span className="flex-1 min-w-0">
                              <StudentName
                                id={entry.student_id}
                                student={studentMap[entry.student_id]}
                                isLoading={studentsLoading}
                                onNavigate={handleNavigate}
                              />
                            </span>
                            {/* Notified indicator */}
                            {entry.notified_at && (
                              <Bell
                                className="w-3 h-3 text-blue-400 shrink-0"
                                aria-label="Notifierad"
                                title="Eleven har notifierats om ledig plats"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>
          </ScrollArea>

          {/* Footer action */}
          {!full && slot.status === 'open' ? (
            <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
              <div className="px-5 py-4 border-t border-border">
                <Button
                  className="w-full"
                  onClick={() => setBookingDialogOpen(true)}
                >
                  Boka lektion
                </Button>
              </div>
            </PermissionGate>
          ) : (
            <div className="px-5 py-4 border-t border-border">
              <p className="text-xs text-center text-muted-foreground">
                {full
                  ? 'Fullbokad – inga lediga platser.'
                  : slot.status === 'in_progress'
                  ? 'Lektion pågår – bokningsändringar hanteras av instruktören.'
                  : slot.status === 'completed'
                  ? 'Lektionen är avslutad.'
                  : slot.status === 'cancelled'
                  ? 'Passet är avbokat.'
                  : slot.status === 'blocked'
                  ? 'Passet är blockerat.'
                  : 'Passet är inte öppet för bokning.'}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Nested: create booking */}
      <BookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        slot={slot}
        onSuccess={() => setBookingDialogOpen(false)}
      />

      {/* Nested: cancel booking */}
      <CancelBookingDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        bookingId={cancelBookingId}
        slotId={slot.id}
        onSuccess={() => {
          setCancelDialogOpen(false);
          setCancelBookingId(null);
        }}
      />

      {/* Nested: reschedule booking */}
      <RescheduleBookingDialog
        open={rescheduleDialogOpen}
        onOpenChange={setRescheduleDialogOpen}
        bookingId={rescheduleBookingId}
        currentSlotId={slot.id}
        studentName={rescheduleStudentName}
        onSuccess={() => {
          setRescheduleDialogOpen(false);
          setRescheduleBookingId(null);
          setRescheduleStudentName('');
        }}
      />
    </>
  );
}
