import { useState } from 'react';
import { Clock, Users, UserX, CheckCircle, XCircle, CalendarCheck, ChevronDown, ChevronUp, Loader2, Bell, GraduationCap } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  Button, Badge, Separator, ScrollArea, Skeleton,
} from '@platform/ui';
import { toast } from '@platform/ui';
import type { LessonSlot, BookingStatus } from '@platform/types';
import type { LessonBooking } from '@platform/types';
import { useStudent } from '@modules/students/hooks/useStudents.js';
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
import { formatSlotDate, formatSlotTime, formatCapacity, slotDurationMinutes, isSlotFull } from '../lib/calendarUtils.js';

// ─── Student name (single-student fetch, cached by React Query) ───────────────

function StudentName({ id }: { id: string }) {
  const { data: student, isLoading } = useStudent(id);
  if (isLoading) return <Skeleton className="h-4 w-28 inline-block" />;
  if (!student)  return <span className="font-mono text-xs text-muted-foreground">{id.slice(0, 8)}…</span>;
  return <span className="font-medium">{student.first_name} {student.last_name}</span>;
}

// ─── Instructor name (single-instructor fetch, cached by React Query) ─────────

function InstructorName({ id }: { id: string }) {
  const { data: instructor, isLoading } = useInstructor(id);
  if (isLoading) return <Skeleton className="h-4 w-28 inline-block" />;
  if (!instructor) return <span className="font-mono text-xs text-muted-foreground">{id.slice(0, 8)}…</span>;
  return <span className="font-medium">{instructor.first_name} {instructor.last_name}</span>;
}

// ─── Booking row ──────────────────────────────────────────────────────────────

interface BookingRowProps {
  booking:  LessonBooking;
  slotId:   string;
  onCancel: (id: string) => void;
}

function BookingRow({ booking, slotId, onCancel }: BookingRowProps) {
  const updateStatus = useUpdateBookingStatus();
  const terminal     = isTerminalBookingStatus(booking.status);

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
            <StudentName id={booking.student_id} />
          </span>
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>

      {/* Action buttons — only for non-terminal bookings */}
      {!terminal && (
        <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
          <div className="flex flex-wrap gap-1.5 ml-9">
            {/* Bekräfta — draft or reserved */}
            {(booking.status === 'draft' || booking.status === 'reserved') && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                disabled={busy}
                onClick={() => handleStatus('confirmed')}
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarCheck className="w-3 h-3" />}
                Bekräfta
              </Button>
            )}

            {/* Närvaro — confirmed only */}
            {booking.status === 'confirmed' && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-900/40 dark:hover:bg-green-900/20"
                disabled={busy}
                onClick={() => handleStatus('completed')}
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                Närvaro
              </Button>
            )}

            {/* Uteblev — confirmed only */}
            {booking.status === 'confirmed' && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1 text-amber-700 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-900/40 dark:hover:bg-amber-900/20"
                disabled={busy}
                onClick={() => handleStatus('no_show')}
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                Uteblev
              </Button>
            )}

            {/* Avboka */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
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
  const [bookingDialogOpen, setBookingDialogOpen]   = useState(false);
  const [cancelBookingId,   setCancelBookingId]     = useState<string | null>(null);
  const [cancelDialogOpen,  setCancelDialogOpen]    = useState(false);
  const [waitlistExpanded,  setWaitlistExpanded]    = useState(false);

  const { data: bookingsData, isLoading: bookingsLoading } = useBookingsForSlot(slot?.id ?? null);
  const { data: waitlistData }                              = useWaitlistForSlot(slot?.id ?? null);

  const bookings      = bookingsData?.data ?? [];
  const waitlistItems = waitlistData ?? [];
  const waitingCount  = waitlistItems.length;
  const full          = slot ? isSlotFull(slot) : false;

  function openCancel(bookingId: string) {
    setCancelBookingId(bookingId);
    setCancelDialogOpen(true);
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
            <SheetTitle className="text-left capitalize">{dateLabel} · {startLabel}–{endLabel}</SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-5 py-4 space-y-5">

              {/* ── Slot Info ─────────────────────────────────────── */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-semibold text-foreground capitalize">{dateLabel}</p>
                    <p className="text-xl font-bold text-foreground tracking-tight">
                      {startLabel}–{endLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">{duration} min</p>
                  </div>
                  <SlotStatusBadge status={slot.status} />
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
                  <InstructorName id={slot.instructor_id} />
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
                            <span className="flex-1 min-w-0 text-muted-foreground">
                              <StudentName id={entry.student_id} />
                            </span>
                            {/* Notified indicator */}
                            {entry.notified_at && (
                              <Bell
                                className="w-3 h-3 text-blue-400 shrink-0"
                                aria-label="Notifierad"
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
          {!full && slot.status === 'open' && (
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
    </>
  );
}
