import { useState, useMemo, useEffect } from 'react';
import {
  Clock, Users, UserX, CheckCircle, XCircle, CalendarCheck, ChevronDown, ChevronUp, Loader2, Bell,
  GraduationCap, ArrowLeftRight, ExternalLink, FileText, Search, UserCheck, Phone, Mail,
  Ban, Trash2, Pencil, Copy, CreditCard, Languages, History, UserSearch, Car, MapPin, IdCard, BookOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Badge, Separator, ScrollArea, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Input,
} from '@platform/ui';
import { toast } from '@platform/ui';
import type { LessonSlot, LessonBooking, BookingStatus, Student, LessonCategory } from '@platform/types';
import { useStudentsBatch, useStudentList } from '@modules/students/hooks/useStudents.js';
import { useInstructor, useInstructorList } from '@modules/instructors/index.js';
import { useStudentPackages } from '@modules/finance/hooks/usePackages.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useBookingsForSlot } from '../hooks/useBookings.js';
import { useWaitlistForSlot, useAddToWaitlist, usePromoteFromWaitlist } from '../hooks/useWaitlist.js';
import {
  useUpdateBookingStatus, useUpdateSlotVehicle, useUpdateSlotLocation, useUpdateSlotLessonType,
  useUpdateSlotNotes, useUpdateSlotInstructor,
  useUpdateSlotCapacity, useUpdateSlotStatus, useDeleteSlot, useUpdateSlotTiming,
} from '../hooks/useSchedulingMutations.js';
import { useVehicles } from '@modules/resources/index.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useLocations, formatLocationAddress } from '../hooks/useLocations.js';
import { useSendMessage } from '@modules/communication/hooks/useCommunication.js';
import { SlotStatusBadge } from './SlotStatusBadge.js';
import { BookingStatusBadge, isTerminalBookingStatus } from './BookingStatusBadge.js';
import { BookingMessageHistory } from './BookingMessageHistory.js';
import { CancelBookingDialog } from './CancelBookingDialog.js';
import { BookingDialog } from './BookingDialog.js';
import { RescheduleBookingDialog } from './RescheduleBookingDialog.js';
import { CreateSlotSheet } from './CreateSlotSheet.js';
import { formatSlotDate, formatSlotTime, formatCapacity, slotDurationMinutes, isSlotFull } from '../lib/calendarUtils.js';

// ─── Lesson category labels (Swedish) — mirrors CreateSlotSheet's own map ─────

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

const PERMIT_STAGE_LABELS: Record<string, string> = {
  not_started:          'Ej påbörjad',
  theory_study:         'Teoristudier',
  risk1_booked:         'Risk 1 bokad',
  risk1_completed:      'Risk 1 genomförd',
  risk2_booked:         'Risk 2 bokad',
  risk2_completed:      'Risk 2 genomförd',
  theory_exam_booked:   'Teoriprov bokat',
  theory_passed:        'Teoriprov godkänt',
  practical_exam_booked:'Uppkörning bokad',
  practical_passed:     'Uppkörning godkänd',
  licence_issued:       'Körkort utfärdat',
};

// Scheduling — Admin-Friendly Booking: platform default/floor, no maximum.
// Mirrors supabase/functions/slots/index.ts (validateDuration) and the
// lesson_slots/lesson_bookings DB CHECK constraints — one rule enforced in
// three places for defence in depth, not three different rules.
const MIN_LESSON_DURATION_MINUTES  = 40;
const DURATION_GRANULARITY_MINUTES = 5;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Student name — clickable link to student detail ─────────────────────────

function StudentName({
  id, student, isLoading, onNavigate,
}: {
  id: string;
  student?: Student | undefined;
  isLoading: boolean;
  onNavigate?: ((path: string) => void) | undefined;
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

// ─── Booking row ──────────────────────────────────────────────────────────────

interface BookingRowProps {
  booking:         LessonBooking;
  slotId:          string;
  slotLabel:       string;
  onCancel:        (id: string, studentId: string) => void;
  onReschedule:    (id: string, studentName: string, student: Student | undefined) => void;
  onNavigate:      (path: string) => void;
  student?:        Student | undefined;
  studentsLoading: boolean;
}

function BookingRow({ booking, slotId, slotLabel, onCancel, onReschedule, onNavigate, student, studentsLoading }: BookingRowProps) {
  const updateStatus  = useUpdateBookingStatus();
  const sendMessage   = useSendMessage();
  const [showMessages, setShowMessages] = useState(false);
  const terminal      = isTerminalBookingStatus(booking.status);
  const studentName   = student ? `${student.first_name} ${student.last_name}` : '';
  const reminderBusy  = sendMessage.isPending;
  // F4 correctness rule: "Uteblev" (no-show) is a completed-lesson outcome —
  // it must not be an available action for a lesson that hasn't happened
  // yet. The backend enforces this too (bookings/index.ts handleUpdate), so
  // this is UX clarity, not the only guard.
  const lessonHasStarted = new Date(booking.starts_at).getTime() <= Date.now();

  function handleSendReminder() {
    if (!student?.phone) return;
    const body = `Hej ${student.first_name}, påminnelse om din körlektion ${slotLabel}. Vi ser fram emot att träffa dig!`;
    sendMessage.mutate(
      {
        channel:           'sms',
        recipient_type:    'student',
        recipient_id:      student.id,
        recipient_address: student.phone,
        body,
        metadata: { event: 'booking_reminder_manual', manual: true },
      },
      {
        onSuccess: () => toast({ title: `Påminnelse skickad till ${student.first_name}` }),
        onError:   (err) => toast({ title: 'Kunde inte skicka påminnelse', description: err instanceof Error ? err.message : undefined, variant: 'destructive' }),
      }
    );
  }

  function handleSendEmail() {
    if (!student?.email) return;
    const subject = `Din körlektion ${slotLabel}`;
    const body = `Hej ${student.first_name},\n\nDetta är en bekräftelse på din körlektion ${slotLabel}.\n\nVälkommen!`;
    sendMessage.mutate(
      {
        channel:           'email',
        recipient_type:    'student',
        recipient_id:      student.id,
        recipient_address: student.email,
        subject,
        body,
        metadata: { event: 'booking_email_manual', manual: true },
      },
      {
        onSuccess: () => toast({ title: `E-post skickat till ${student.first_name}` }),
        onError:   (err) => toast({ title: 'Kunde inte skicka e-post', description: err instanceof Error ? err.message : undefined, variant: 'destructive' }),
      }
    );
  }

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

      {/* Package credits, permit stage, preferred language */}
      <StudentOperationalInfo studentId={booking.student_id} student={student} />

      {/* Attendance row — prominent for confirmed bookings */}
      {booking.status === 'confirmed' && !terminal && (
        <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
          <div className="ml-9 flex items-center gap-1.5 p-2 bg-muted/40 rounded-lg border border-border">
            <span className="text-xs text-muted-foreground mr-1">Närvaro:</span>
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-action hover:bg-action-hover text-action-foreground border-0"
              disabled={busy}
              onClick={() => handleStatus('completed')}
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              Närvaro
            </Button>
            {lessonHasStarted ? (
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
            ) : (
              // F4: "Uteblev" records a completed lesson's outcome — it isn't
              // an available action until the lesson has actually started.
              <span className="text-xs text-muted-foreground italic">
                Uteblev tillgängligt efter lektionens starttid
              </span>
            )}
          </div>
        </PermissionGate>
      )}

      {/* Actions — "Vad vill du göra?" */}
      {!terminal && (
        <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
          <div className="ml-9 space-y-2 rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 dark:border-rose-900/40 dark:bg-rose-950/10">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Vad vill du göra?
            </p>

            {/* Primary operational actions — Bekräfta/Omboka/Avboka */}
            <div className="flex flex-wrap gap-1.5">
              {/* Bekräfta — draft or reserved */}
              {(booking.status === 'draft' || booking.status === 'reserved') && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1 bg-action hover:bg-action-hover text-action-foreground border-0"
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
                className="h-8 text-xs gap-1"
                disabled={busy}
                onClick={() => onReschedule(booking.id, studentName, student)}
              >
                <ArrowLeftRight className="w-3 h-3" />
                Omboka
              </Button>

              {/* Avboka */}
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                disabled={busy}
                onClick={() => onCancel(booking.id, booking.student_id)}
              >
                <XCircle className="w-3 h-3" />
                Avboka
              </Button>
            </div>

            {/* Communication actions — Ring/E-post/Påminnelse, visually lighter */}
            {(student?.phone || student?.email || (booking.status === 'confirmed' && student?.phone)) && (
              <div className="flex flex-wrap gap-1.5">
                {/* Ring — direct tel: link */}
                {student?.phone && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground" asChild>
                    <a href={`tel:${student.phone}`}>
                      <Phone className="w-3 h-3" />
                      Ring
                    </a>
                  </Button>
                )}

                {/* Skicka e-post */}
                {student?.email && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    disabled={sendMessage.isPending}
                    onClick={handleSendEmail}
                  >
                    {sendMessage.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                    E-post
                  </Button>
                )}

                {/* Påminnelse SMS — only for confirmed bookings with a phone number */}
                {booking.status === 'confirmed' && student?.phone && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-blue-600 dark:text-blue-400"
                    disabled={reminderBusy}
                    onClick={handleSendReminder}
                  >
                    {reminderBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                    Påminnelse
                  </Button>
                )}
              </div>
            )}
          </div>
        </PermissionGate>
      )}

      {/* Notification history — lazy, toggle per booking */}
      <div className="ml-9">
        <button
          type="button"
          onClick={() => setShowMessages((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <Bell className="w-2.5 h-2.5" />
          <span>{showMessages ? 'Dölj notiser' : 'Notiser'}</span>
          {showMessages ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
        </button>
        {showMessages && (
          <div className="mt-1.5 border-t border-border/50 pt-1.5">
            <BookingMessageHistory studentId={booking.student_id} maxCount={3} />
          </div>
        )}
      </div>

      {/* Operational history — booked/modified timestamps */}
      <div className="ml-9 flex items-center gap-1 text-[10px] text-muted-foreground/50">
        <History className="w-2.5 h-2.5" />
        <span>
          Bokad {formatTimestamp(booking.created_at)}
          {booking.updated_at !== booking.created_at && ` · Ändrad ${formatTimestamp(booking.updated_at)}`}
        </span>
      </div>
    </div>
  );
}

// ─── Terminal slot statuses — no edits allowed ────────────────────────────────

const TERMINAL_SLOT_STATUSES = new Set(['completed', 'cancelled', 'blocked']);

// ─── Instructor row — display + inline change ─────────────────────────────────

function InstructorRow({
  slotId, instructorId, slotStatus, onNavigate, onSlotUpdated,
}: {
  slotId:       string;
  instructorId: string;
  slotStatus:   string;
  onNavigate?:  ((path: string) => void) | undefined;
  onSlotUpdated: (slot: LessonSlot) => void;
}) {
  const [reassigning, setReassigning] = useState(false);
  const { data: instructorsData }     = useInstructorList({ per_page: 100 });
  const { data: instructor, isLoading } = useInstructor(instructorId);
  const updateInstructor = useUpdateSlotInstructor();

  const instructors = (instructorsData?.data ?? []).filter(i => !i.deleted_at);
  const isTerminal  = TERMINAL_SLOT_STATUSES.has(slotStatus);

  function handleChange(newId: string) {
    if (!newId || newId === instructorId) { setReassigning(false); return; }
    updateInstructor.mutate(
      { id: slotId, instructor_id: newId },
      {
        onSuccess: (updated) => { toast({ title: 'Instruktör uppdaterad' }); setReassigning(false); onSlotUpdated(updated); },
        onError:   (err) => { toast({ title: 'Kunde inte uppdatera instruktör', description: err instanceof Error ? err.message : 'Försök igen', variant: 'destructive' }); },
      },
    );
  }

  if (reassigning) {
    return (
      <div className="flex items-center gap-1.5">
        <Select value={instructorId} onValueChange={handleChange} disabled={updateInstructor.isPending}>
          <SelectTrigger className="h-8 text-sm flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {instructors.map(i => (
              <SelectItem key={i.id} value={i.id}>{i.first_name} {i.last_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {updateInstructor.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs shrink-0" disabled={updateInstructor.isPending} onClick={() => setReassigning(false)}>
          Avbryt
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {isLoading ? (
        <Skeleton className="h-5 w-28" />
      ) : (
        <span className="text-base font-semibold text-foreground">
          {instructor ? `${instructor.first_name} ${instructor.last_name}` : instructorId.slice(0, 8) + '…'}
        </span>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => onNavigate?.(`/instructors/${instructorId}`)}
        >
          Visa lärare
          <ExternalLink className="w-3 h-3" />
        </Button>
        {!isTerminal && (
          <PermissionGate permission={Permissions.SCHEDULING_SLOT_UPDATE}>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => setReassigning(true)}
            >
              <ArrowLeftRight className="w-3 h-3" />
              Byt lärare
            </Button>
          </PermissionGate>
        )}
      </div>
    </div>
  );
}

// ─── Shared detail-field shell — icon + uppercase caption + value, matching
// the People (Elev/Lärare) card pattern above it ─────────────────────────────

function DetailField({
  icon: Icon, label, children,
}: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}

// ─── Vehicle — display + inline change ─────────────────────────────────────────

function VehicleRow({
  slotId, vehicleId, onSlotUpdated,
}: { slotId: string; vehicleId: string | null; onSlotUpdated: (slot: LessonSlot) => void }) {
  const { data: vehicles = [] } = useVehicles();
  const updateVehicle = useUpdateSlotVehicle();

  const available = vehicles.filter(v => v.operational_status === 'available' || v.id === vehicleId);

  function handleChange(newId: string) {
    updateVehicle.mutate(
      { id: slotId, vehicle_id: newId || null },
      {
        onSuccess: (updated) => { toast({ title: newId ? 'Fordon tilldelat' : 'Fordon borttaget' }); onSlotUpdated(updated); },
        onError:   (err) => toast({ title: 'Kunde inte uppdatera fordon', description: err instanceof Error ? err.message : 'Försök igen', variant: 'destructive' }),
      },
    );
  }

  return (
    <DetailField icon={Car} label="Fordon">
      <div className="flex items-center gap-1.5">
        <Select value={vehicleId ?? ''} onValueChange={handleChange} disabled={updateVehicle.isPending}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Inte tilldelat" />
          </SelectTrigger>
          <SelectContent>
            {available.map(v => (
              <SelectItem key={v.id} value={v.id}>
                {v.registration_number} · {v.make} {v.model} ({v.transmission === 'automatic' ? 'Automat' : 'Manuell'})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {updateVehicle.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      </div>
    </DetailField>
  );
}

// ─── Lesson type — display + change (backend already accepts lesson_type_id
// on PATCH /slots/:id — no un-assign, matching the API's own constraint) ──────

function LessonTypeRow({
  slotId, lessonTypeId, onSlotUpdated,
}: { slotId: string; lessonTypeId: string | null; onSlotUpdated: (slot: LessonSlot) => void }) {
  const { data: lessonTypes, isLoading } = useLessonTypes();
  const updateLessonType = useUpdateSlotLessonType();

  function handleChange(newId: string) {
    if (!newId || newId === lessonTypeId) return;
    updateLessonType.mutate(
      { id: slotId, lesson_type_id: newId },
      {
        onSuccess: (updated) => { toast({ title: 'Lektionstyp uppdaterad' }); onSlotUpdated(updated); },
        onError:   (err) => toast({ title: 'Kunde inte uppdatera lektionstyp', description: err instanceof Error ? err.message : 'Försök igen', variant: 'destructive' }),
      },
    );
  }

  if (isLoading) {
    return (
      <DetailField icon={BookOpen} label="Lektion">
        <Skeleton className="h-8 w-full" />
      </DetailField>
    );
  }

  const current = lessonTypes?.find(lt => lt.id === lessonTypeId);

  return (
    <DetailField icon={BookOpen} label="Lektion">
      <div className="flex items-center gap-1.5">
        <Select value={lessonTypeId ?? ''} onValueChange={handleChange} disabled={updateLessonType.isPending}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Valfri lektionstyp" />
          </SelectTrigger>
          <SelectContent>
            {(lessonTypes ?? []).map(lt => (
              <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {updateLessonType.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      </div>
      {current && (
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          <Badge variant="outline" className="text-[10px] font-normal py-0">
            {CATEGORY_LABELS[current.category] ?? current.category}
          </Badge>
          {current.pricing_sek != null && (
            <span className="text-xs text-muted-foreground">{current.pricing_sek.toLocaleString('sv-SE')} kr</span>
          )}
        </div>
      )}
    </DetailField>
  );
}

// ─── Branch / meeting location — display + change ─────────────────────────────

function BranchRow({
  slotId, locationId, onSlotUpdated,
}: { slotId: string; locationId: string | null; onSlotUpdated: (slot: LessonSlot) => void }) {
  const { data: locations = [] } = useLocations();
  const updateLocation = useUpdateSlotLocation();

  function handleChange(newId: string) {
    updateLocation.mutate(
      { id: slotId, location_id: newId || null },
      {
        onSuccess: (updated) => { toast({ title: newId ? 'Plats tilldelad' : 'Plats borttagen' }); onSlotUpdated(updated); },
        onError:   (err) => toast({ title: 'Kunde inte uppdatera plats', description: err instanceof Error ? err.message : 'Försök igen', variant: 'destructive' }),
      },
    );
  }

  return (
    <DetailField icon={MapPin} label="Plats">
      <div className="flex items-center gap-1.5">
        <Select value={locationId ?? ''} onValueChange={handleChange} disabled={updateLocation.isPending}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Inte vald" />
          </SelectTrigger>
          <SelectContent>
            {locations.map(l => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
                <span className="block text-xs text-muted-foreground font-normal">{formatLocationAddress(l)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {updateLocation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      </div>
    </DetailField>
  );
}

// ─── Licence categories the assigned instructor may teach ────────────────────

function LicenceCategoriesRow({ instructorId }: { instructorId: string }) {
  const { data: instructor } = useInstructor(instructorId);
  if (!instructor || instructor.teaching_categories.length === 0) return null;
  return (
    <DetailField icon={IdCard} label="Körkortsbehörighet">
      <div className="flex items-center gap-1 flex-wrap">
        {instructor.teaching_categories.map(cat => (
          <Badge key={cat} variant="outline" className="text-[10px] font-normal py-0">{cat}</Badge>
        ))}
      </div>
    </DetailField>
  );
}

// ─── Duration — inline change, keeps start time fixed, moves end time ────────
// Complements EditSlotPanel's free-form "Ändra tid och plats" (start + end
// time both editable) with the common single-field case shown directly in
// the details grid: change just the length, same rule (>=40 min, 5-min
// steps) enforced by update_slot_timing_with_booking_sync via useUpdateSlotTiming.

function DurationRow({
  slot, onOpenFullEditor, onSlotUpdated,
}: { slot: LessonSlot; onOpenFullEditor: () => void; onSlotUpdated: (slot: LessonSlot) => void }) {
  const updateTiming = useUpdateSlotTiming();
  const duration = slotDurationMinutes(slot);
  const isTerminal = TERMINAL_SLOT_STATUSES.has(slot.status);

  const durationOptions = useMemo(() => {
    const opts = new Set<number>();
    for (let m = MIN_LESSON_DURATION_MINUTES; m <= 240; m += DURATION_GRANULARITY_MINUTES) opts.add(m);
    opts.add(duration);
    return Array.from(opts).sort((a, b) => a - b);
  }, [duration]);

  function handleChange(newDuration: number) {
    if (newDuration === duration) return;
    // Real Date arithmetic, not string slicing + a manual %24 hour wrap —
    // the previous version reused the same calendar day for the computed
    // end time, so extending a late-evening slot's duration past midnight
    // produced an ends_at *earlier* than starts_at (wrong day), which the
    // backend correctly rejects — surfacing as an opaque "non-2xx" error
    // with no indication of why. new Date(...) + milliseconds naturally
    // carries the day forward.
    const newEndsAt = new Date(new Date(slot.starts_at).getTime() + newDuration * 60_000).toISOString();

    updateTiming.mutate(
      { id: slot.id, starts_at: slot.starts_at, ends_at: newEndsAt },
      {
        onSuccess: (updated) => { toast({ title: 'Längd uppdaterad' }); onSlotUpdated(updated); },
        onError:   (err) => toast({
          title:       'Kunde inte uppdatera längd',
          description: err instanceof Error ? err.message : 'Försök igen',
          variant:     'destructive',
        }),
      },
    );
  }

  if (isTerminal) {
    return (
      <DetailField icon={Clock} label="Längd">
        <span className="text-sm text-foreground">{duration} min</span>
      </DetailField>
    );
  }

  return (
    <DetailField icon={Clock} label="Längd">
      <div className="flex items-center gap-1.5">
        <Select value={String(duration)} onValueChange={(v) => handleChange(Number(v))} disabled={updateTiming.isPending}>
          <SelectTrigger className="h-8 text-sm w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {durationOptions.map(m => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}
          </SelectContent>
        </Select>
        {updateTiming.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      </div>
      <PermissionGate permission={Permissions.SCHEDULING_SLOT_UPDATE}>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-1.5 -ml-1.5 mt-0.5 text-muted-foreground" onClick={onOpenFullEditor}>
          <Pencil className="w-3 h-3" />
          Ändra tid och längd
        </Button>
      </PermissionGate>
    </DetailField>
  );
}

// ─── Student operational summary — package credits, permit stage, language ───

function StudentOperationalInfo({ studentId, student }: { studentId: string; student: Student | undefined }) {
  const { data: packagesData } = useStudentPackages(studentId);
  const activePackages = (packagesData?.data ?? []).filter(p => p.status === 'active');
  const remainingCredits = activePackages.reduce((sum, p) => sum + p.quantity_remaining, 0);

  if (!student) return null;

  return (
    <div className="ml-9 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {activePackages.length > 0 && (
        <span className="flex items-center gap-1">
          <CreditCard className="w-3 h-3" />
          {remainingCredits} lektion{remainingCredits !== 1 ? 'er' : ''} kvar
        </span>
      )}
      {student.permit_stage && student.permit_stage !== 'not_started' && (
        <span className="flex items-center gap-1">
          <GraduationCap className="w-3 h-3" />
          {PERMIT_STAGE_LABELS[student.permit_stage] ?? student.permit_stage}
        </span>
      )}
      {student.preferred_language && student.preferred_language !== 'sv' && (
        <span className="flex items-center gap-1">
          <Languages className="w-3 h-3" />
          {student.preferred_language}
        </span>
      )}
    </div>
  );
}

// ─── Session notes — add / edit instructor note on the slot ──────────────────

function SessionNotesRow({
  slotId, notes, open, onOpenChange, onSlotUpdated,
}: {
  slotId: string; notes: string | null; open: boolean; onOpenChange: (open: boolean) => void;
  onSlotUpdated: (slot: LessonSlot) => void;
}) {
  const [draft, setDraft] = useState('');
  const updateNotes = useUpdateSlotNotes();

  // Re-seed the draft from the current note whenever the editor is opened —
  // it can be opened either from here (Redigera) or externally (the "Lägg
  // till anteckning" tile in Fler alternativ), so seeding can't live inside
  // a single local "start edit" handler.
  useEffect(() => {
    if (open) setDraft(notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-seed on open, not on every keystroke-driven notes change
  }, [open]);

  function cancel() { onOpenChange(false); }
  function save() {
    updateNotes.mutate(
      { id: slotId, notes: draft.trim() || null },
      {
        onSuccess: (updated) => { toast({ title: 'Anteckning sparad' }); onOpenChange(false); onSlotUpdated(updated); },
        onError:   (err) => { toast({ title: 'Kunde inte spara anteckning', description: err instanceof Error ? err.message : 'Försök igen', variant: 'destructive' }); },
      },
    );
  }

  if (open) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs">
          <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground text-xs">Lektionsanteckning</span>
        </div>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Skriv en anteckning om lektionen..."
          className="w-full px-2.5 py-1.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-7 text-xs" disabled={updateNotes.isPending} onClick={save}>
            {updateNotes.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Spara'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancel} disabled={updateNotes.isPending}>
            Avbryt
          </Button>
        </div>
      </div>
    );
  }

  if (!notes) return null;

  return (
    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-foreground whitespace-pre-line break-words leading-relaxed">{notes}</p>
        <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-6 px-1.5 text-[10px] gap-1 text-muted-foreground"
            onClick={() => onOpenChange(true)}
          >
            <Pencil className="w-2.5 h-2.5" />
            Redigera
          </Button>
        </PermissionGate>
      </div>
    </div>
  );
}

// ─── Edit slot — inline time + capacity editor ("Redigera pass") ─────────────

function EditSlotPanel({
  slot, onClose, onSlotUpdated,
}: {
  slot:    LessonSlot;
  onClose: () => void;
  onSlotUpdated: (slot: LessonSlot) => void;
}) {
  const toLocalTime = (iso: string) => iso.slice(11, 16);
  const [startTime, setStartTime] = useState(() => toLocalTime(slot.starts_at));
  const [endTime,   setEndTime]   = useState(() => toLocalTime(slot.ends_at));
  const [capacity,  setCapacity]  = useState(slot.max_bookings);

  const updateTiming   = useUpdateSlotTiming();
  const updateCapacity = useUpdateSlotCapacity();
  const busy = updateTiming.isPending || updateCapacity.isPending;

  function handleSave() {
    const dateStr = slot.starts_at.slice(0, 10);
    const newStartsAt = `${dateStr}T${startTime}:00`;
    const newEndsAt   = `${dateStr}T${endTime}:00`;
    const timeChanged = newStartsAt !== slot.starts_at.slice(0, 16) + ':00' || startTime !== toLocalTime(slot.starts_at) || endTime !== toLocalTime(slot.ends_at);
    const capacityChanged = capacity !== slot.max_bookings;

    const tasks: Promise<LessonSlot | undefined>[] = [];
    if (timeChanged) {
      tasks.push(new Promise((resolve, reject) => {
        updateTiming.mutate({ id: slot.id, starts_at: newStartsAt, ends_at: newEndsAt }, { onSuccess: resolve, onError: reject });
      }));
    }
    if (capacityChanged) {
      tasks.push(new Promise((resolve, reject) => {
        updateCapacity.mutate({ id: slot.id, max_bookings: capacity }, { onSuccess: resolve, onError: reject });
      }));
    }
    if (tasks.length === 0) { onClose(); return; }

    Promise.all(tasks)
      .then((results) => {
        toast({ title: 'Pass uppdaterat' });
        // Each response only reflects what its own endpoint changed — merge
        // in order so both a timing and a capacity change (rare, but both
        // can be edited in the same "Spara") both end up applied.
        const merged = results.reduce<LessonSlot>((acc, r) => (r ? { ...acc, ...r } : acc), slot);
        onSlotUpdated(merged);
        onClose();
      })
      .catch((err) => toast({
        title:       'Kunde inte uppdatera passet',
        description: err instanceof Error ? err.message : 'Försök igen',
        variant:     'destructive',
      }));
  }

  // Scheduling — Admin-Friendly Booking: same platform rule as CreateSlotSheet
  // (minimum 40 minutes, 5-minute granularity, no maximum) — mirrors the
  // backend's validateDuration()/DB CHECK constraints so the admin sees a
  // clear message here instead of the request failing after "Spara".
  const editDurationMinutes = (() => {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (Number(eh) * 60 + Number(em)) - (Number(sh) * 60 + Number(sm));
  })();
  const durationTooShort = endTime > startTime && editDurationMinutes < MIN_LESSON_DURATION_MINUTES;
  const durationInvalid  = endTime > startTime && editDurationMinutes % DURATION_GRANULARITY_MINUTES !== 0;

  return (
    <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Starttid</label>
          <Input type="time" step={DURATION_GRANULARITY_MINUTES * 60} value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Sluttid</label>
          <Input type="time" step={DURATION_GRANULARITY_MINUTES * 60} value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      {endTime > startTime && !durationTooShort && !durationInvalid && (
        <p className="text-[10px] text-muted-foreground">Längd: {editDurationMinutes} min</p>
      )}
      <div>
        <label className="text-[10px] text-muted-foreground block mb-1">Antal platser</label>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setCapacity(v => Math.max(1, v - 1))} disabled={capacity <= 1}>−</Button>
          <span className="w-6 text-center text-xs font-medium tabular-nums">{capacity}</span>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setCapacity(v => Math.min(50, v + 1))} disabled={capacity >= 50}>+</Button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button size="sm" className="h-7 text-xs" disabled={busy || endTime <= startTime || durationTooShort || durationInvalid} onClick={handleSave}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Spara'}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onClose}>
          Avbryt
        </Button>
        {endTime <= startTime && <span className="text-[10px] text-destructive">Sluttid måste vara efter starttid</span>}
        {durationTooShort && <span className="text-[10px] text-destructive">Lektionslängden måste vara minst {MIN_LESSON_DURATION_MINUTES} minuter</span>}
        {durationInvalid && <span className="text-[10px] text-destructive">Lektionslängden måste anges i steg om {DURATION_GRANULARITY_MINUTES} minuter</span>}
      </div>
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

// ─── Promote waitlist entry → booking ─────────────────────────────────────────

function PromoteWaitlistButton({ entry, slotId }: {
  entry: { id: string; student_id: string };
  slotId: string;
}) {
  const promote = usePromoteFromWaitlist();
  return (
    <Button
      size="sm"
      className="h-6 text-[10px] gap-1 px-2 shrink-0"
      disabled={promote.isPending}
      onClick={() =>
        promote.mutate(
          { waitlistEntryId: entry.id, slotId, studentId: entry.student_id },
          {
            onSuccess: () => toast({ title: 'Elev inbokad från väntelistan' }),
            onError:   () => toast({ title: 'Kunde inte boka in', variant: 'destructive' }),
          },
        )
      }
    >
      {promote.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarCheck className="w-3 h-3" />}
      Boka in
    </Button>
  );
}

// ─── Add student to waitlist dialog ───────────────────────────────────────────

function AddToWaitlistDialog({
  open, onOpenChange, slot,
}: {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  slot:         LessonSlot;
}) {
  const [search, setSearch]             = useState('');
  const [debouncedSearch, setDebounced] = useState('');
  const [selectedStudent, setSelected]  = useState<Student | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) { setSearch(''); setDebounced(''); setSelected(null); }
  }, [open]);

  const { data: studentsData, isLoading: studentsLoading } = useStudentList(
    { per_page: 50, ...(debouncedSearch ? { search: debouncedSearch } : {}) },
    { enabled: open },
  );

  const addToWaitlist = useAddToWaitlist();
  const students = studentsData?.data ?? [];

  function handleClose() {
    if (addToWaitlist.isPending) return;
    onOpenChange(false);
  }

  function handleConfirm() {
    if (!selectedStudent) return;
    addToWaitlist.mutate(
      { slot_id: slot.id, student_id: selectedStudent.id },
      {
        onSuccess: () => {
          toast({
            title:       'Elev tillagd på väntelistan',
            description: `${selectedStudent.first_name} ${selectedStudent.last_name} är nu på väntelistan.`,
          });
          handleClose();
        },
        onError: (err) => {
          toast({
            title:       'Kunde inte lägga till på väntelistan',
            description: err instanceof Error ? err.message : 'Försök igen',
            variant:     'destructive',
          });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till på väntelistan</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/40 rounded-md px-3 py-2 text-sm text-muted-foreground">
          {formatSlotDate(slot.starts_at)} · {formatSlotTime(slot.starts_at)}–{formatSlotTime(slot.ends_at)}
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Sök elev..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <ScrollArea className="h-44 sm:h-52 rounded-md border">
            {studentsLoading ? (
              <div className="p-3 space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded" />)}
              </div>
            ) : students.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
                Inga elever hittades
              </div>
            ) : (
              <div className="p-1">
                {students.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelected(student)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2 ${
                      selectedStudent?.id === student.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent text-foreground'
                    }`}
                  >
                    {selectedStudent?.id === student.id && <UserCheck className="w-3.5 h-3.5 shrink-0" />}
                    <span className="font-medium">{student.first_name} {student.last_name}</span>
                    {student.personnummer_last4 && (
                      <span className={`text-xs font-mono ${
                        selectedStudent?.id === student.id ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}>
                        ****{student.personnummer_last4}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {selectedStudent && (
            <p className="text-xs text-muted-foreground">
              Vald: <span className="font-medium text-foreground">{selectedStudent.first_name} {selectedStudent.last_name}</span>
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={addToWaitlist.isPending}>
            Avbryt
          </Button>
          <Button onClick={handleConfirm} disabled={addToWaitlist.isPending || !selectedStudent}>
            {addToWaitlist.isPending ? 'Lägger till...' : 'Lägg till på väntelistan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlotDetailSheetProps {
  slot:         LessonSlot | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SlotDetailSheet({ slot: slotProp, open, onOpenChange }: SlotDetailSheetProps) {
  const navigate = useNavigate();

  // `slotProp` is a plain prop — a one-time snapshot the caller captured at
  // click time (e.g. SchedulingCalendarPage's selectedSlot state), not a
  // live query. Every field-level mutation below (vehicle/location/lesson
  // type/duration/instructor/capacity/notes) already invalidates the
  // *cache* on success — but nothing ever told THIS open sheet to re-render
  // with fresher data, so a Select's own onValueChange could fire a real,
  // successful PATCH and the trigger would still show the old value: the
  // mutation worked, the UI just never reflected it. Track a local, live
  // copy seeded from the prop and fed by each mutation's own response
  // (every one of them already returns the full updated LessonSlot) via
  // onSlotUpdated, and render from `slot` (defined below) instead of the
  // raw prop everywhere a mutable field is shown.
  const [liveSlot, setLiveSlot] = useState<LessonSlot | null>(slotProp);
  useEffect(() => {
    setLiveSlot(slotProp);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reset only when a *different* slot (by id) opens, not on every re-render with the same slot
  }, [slotProp?.id]);
  // A field can also change from elsewhere (slotProp.updated_at moves
  // forward) while the same slot stays open — take the newer one without
  // discarding an in-flight local update that hasn't round-tripped yet.
  useEffect(() => {
    if (slotProp && liveSlot && slotProp.id === liveSlot.id && slotProp.updated_at > liveSlot.updated_at) {
      setLiveSlot(slotProp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only reacts to the prop moving forward, not to liveSlot's own updates
  }, [slotProp]);

  // Every reference to `slot` below this point (including in functions
  // defined above this line — they close over it and only run after render
  // completes) resolves to this live, mutation-fed value.
  const slot = liveSlot ?? slotProp;

  function handleSlotUpdated(updated: LessonSlot) {
    setLiveSlot(updated);
  }

  const [bookingDialogOpen,     setBookingDialogOpen]     = useState(false);
  const [matchDialogOpen,       setMatchDialogOpen]       = useState(false);
  const [cancelBookingId,       setCancelBookingId]       = useState<string | null>(null);
  const [cancelStudentId,       setCancelStudentId]       = useState<string | null>(null);
  const [cancelDialogOpen,      setCancelDialogOpen]      = useState(false);
  const [rescheduleBookingId,   setRescheduleBookingId]   = useState<string | null>(null);
  const [rescheduleStudentName, setRescheduleStudentName] = useState('');
  const [rescheduleStudent,     setRescheduleStudent]     = useState<Student | null>(null);
  const [rescheduleDialogOpen,  setRescheduleDialogOpen]  = useState(false);
  const [waitlistExpanded,      setWaitlistExpanded]      = useState(false);
  const [addWaitlistDialogOpen, setAddWaitlistDialogOpen] = useState(false);
  const [editSlotOpen,          setEditSlotOpen]          = useState(false);
  const [duplicateSheetOpen,    setDuplicateSheetOpen]    = useState(false);
  const [deleteConfirmOpen,     setDeleteConfirmOpen]     = useState(false);
  const [moreOptionsOpen,       setMoreOptionsOpen]       = useState(false);
  const [moreInfoOpen,          setMoreInfoOpen]          = useState(false);
  const [noteEditorOpen,        setNoteEditorOpen]        = useState(false);
  const [notifierOpen,          setNotifierOpen]          = useState(false);

  const updateStatus = useUpdateSlotStatus();
  const deleteSlot   = useDeleteSlot();

  function handleNavigate(path: string) {
    onOpenChange(false);
    navigate(path);
  }

  function openFullEditor() {
    setMoreOptionsOpen(true);
    setEditSlotOpen(true);
  }

  function resetLocalDialogState() {
    setBookingDialogOpen(false);
    setMatchDialogOpen(false);
    setCancelBookingId(null);
    setCancelStudentId(null);
    setCancelDialogOpen(false);
    setRescheduleBookingId(null);
    setRescheduleStudentName('');
    setRescheduleStudent(null);
    setRescheduleDialogOpen(false);
    setWaitlistExpanded(false);
    setAddWaitlistDialogOpen(false);
    setEditSlotOpen(false);
    setDuplicateSheetOpen(false);
    setDeleteConfirmOpen(false);
    setMoreOptionsOpen(false);
    setMoreInfoOpen(false);
    setNoteEditorOpen(false);
    setNotifierOpen(false);
  }

  // Reset all internal dialog state when the sheet closes or a different slot is opened.
  // Prevents cancel/reschedule dialogs from a previous slot leaking into the next one.
  useEffect(() => {
    if (!open) resetLocalDialogState();
  }, [open]);

  useEffect(() => {
    resetLocalDialogState();
  }, [slot?.id]);

  function handleBlock() {
    if (!slot) return;
    updateStatus.mutate(
      { id: slot.id, status: 'blocked' },
      {
        onSuccess: (updated) => { toast({ title: 'Tiden blockerad' }); handleSlotUpdated(updated); },
        onError:   (err) => toast({
          title:       'Kunde inte blockera tiden',
          description: err instanceof Error ? err.message : 'Försök igen',
          variant:     'destructive',
        }),
      },
    );
  }

  function handleUnblock() {
    if (!slot) return;
    updateStatus.mutate(
      { id: slot.id, status: 'open' },
      {
        onSuccess: (updated) => { toast({ title: 'Tiden öppnad igen' }); handleSlotUpdated(updated); },
        onError:   (err) => toast({
          title:       'Kunde inte öppna tiden',
          description: err instanceof Error ? err.message : 'Försök igen',
          variant:     'destructive',
        }),
      },
    );
  }

  function handleDelete() {
    if (!slot) return;
    deleteSlot.mutate(slot.id, {
      onSuccess: () => {
        toast({ title: 'Passet borttaget' });
        setDeleteConfirmOpen(false);
        onOpenChange(false);
      },
      onError: (err) => toast({
        title:       'Kunde inte ta bort passet',
        description: err instanceof Error ? err.message : 'Försök igen',
        variant:     'destructive',
      }),
    });
  }

  const { data: bookingsData, isLoading: bookingsLoading } = useBookingsForSlot(slot?.id ?? null);
  const { data: waitlistData }                              = useWaitlistForSlot(slot?.id ?? null);
  const { data: assignedInstructor }                        = useInstructor(slot?.instructor_id ?? null);
  const matchCategory = assignedInstructor?.teaching_categories[0] ?? null;

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
      ...(bookingsData?.data ?? []).map(b => b.student_id),
      ...(waitlistData ?? []).map(e => e.student_id),
    ])],
    [bookingsData, waitlistData],
  );

  const { data: studentsData, isLoading: studentsLoading } = useStudentsBatch(allStudentIds);

  const studentMap = useMemo((): Record<string, Student> => {
    if (!studentsData) return {};
    return Object.fromEntries(studentsData.map(s => [s.id, s]));
  }, [studentsData]);

  function openCancel(bookingId: string, studentId: string) {
    setCancelBookingId(bookingId);
    setCancelStudentId(studentId);
    setCancelDialogOpen(true);
  }

  function openReschedule(bookingId: string, studentName: string, student?: Student) {
    setRescheduleBookingId(bookingId);
    setRescheduleStudentName(studentName);
    setRescheduleStudent(student ?? null);
    setRescheduleDialogOpen(true);
  }

  if (!slot) return null;

  const duration   = slotDurationMinutes(slot);
  const dateLabel  = formatSlotDate(slot.starts_at);
  const startLabel = formatSlotTime(slot.starts_at);
  const endLabel   = formatSlotTime(slot.ends_at);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full sm:max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="text-left capitalize">{dateLabel} · {startLabel}–{endLabel}</DialogTitle>
              <div className="flex items-center gap-2 shrink-0">
                {!TERMINAL_SLOT_STATUSES.has(slot.status) && (
                  <PermissionGate permission={Permissions.SCHEDULING_SLOT_UPDATE}>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openFullEditor}>
                      <Pencil className="w-3 h-3" />
                      Redigera
                    </Button>
                  </PermissionGate>
                )}
                <SlotStatusBadge status={slot.status} />
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="px-5 py-4 space-y-5">

              {/* ── Layer 1: Lesson identity ──────────────────────── */}
              <div className="space-y-1.5">
                <p className="text-2xl font-bold text-foreground tracking-tight flex items-center flex-wrap gap-2">
                  {startLabel}–{endLabel}
                  <Badge variant="outline" className="text-xs font-medium align-middle">{duration} min</Badge>
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {formatCapacity(slot.current_bookings, slot.max_bookings)} bokningar
                  </span>
                  {full && (
                    <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40">
                      Fullbokad
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              {/* ── Layer 2: People — elev prominent, receptionist manages their booking ── */}
              <div className={`grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20 ${bookings.length === 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {bookings.length === 1 && (
                  <div className="min-w-0 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Elev</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-semibold">
                        <StudentName
                          id={bookings[0]!.student_id}
                          student={studentMap[bookings[0]!.student_id]}
                          isLoading={studentsLoading}
                        />
                      </span>
                      <BookingStatusBadge status={bookings[0]!.status} />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleNavigate(`/students/${bookings[0]!.student_id}`)}
                    >
                      Visa elev
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Lärare</p>
                  <InstructorRow
                    slotId={slot.id}
                    instructorId={slot.instructor_id}
                    slotStatus={slot.status}
                    onNavigate={handleNavigate}
                    onSlotUpdated={handleSlotUpdated}
                  />
                </div>
              </div>

              <Separator />

              {/* ── Layer 3: Lesson / operational details ─────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/10">
                <LessonTypeRow slotId={slot.id} lessonTypeId={slot.lesson_type_id} onSlotUpdated={handleSlotUpdated} />
                <BranchRow slotId={slot.id} locationId={slot.location_id} onSlotUpdated={handleSlotUpdated} />
                <LicenceCategoriesRow instructorId={slot.instructor_id} />
                <DurationRow slot={slot} onOpenFullEditor={openFullEditor} onSlotUpdated={handleSlotUpdated} />
                <VehicleRow slotId={slot.id} vehicleId={slot.vehicle_id} onSlotUpdated={handleSlotUpdated} />
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
                        slotLabel={`${dateLabel} kl. ${startLabel}`}
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

              <Separator />

              {/* ── Fler alternativ — less frequently used actions ─── */}
              <div className="space-y-2">
                <button
                  type="button"
                  className="flex items-center justify-between w-full text-left"
                  onClick={() => setMoreOptionsOpen((v) => !v)}
                >
                  <h3 className="text-sm font-semibold text-foreground">Fler alternativ</h3>
                  {moreOptionsOpen
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {moreOptionsOpen && (
                  <div className="space-y-3 pt-1 rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/40 dark:bg-violet-950/10">
                    {editSlotOpen && !TERMINAL_SLOT_STATUSES.has(slot.status) && (
                      <PermissionGate permission={Permissions.SCHEDULING_SLOT_UPDATE}>
                        <EditSlotPanel slot={slot} onClose={() => setEditSlotOpen(false)} onSlotUpdated={handleSlotUpdated} />
                      </PermissionGate>
                    )}

                    {!editSlotOpen && (
                      <div className="grid grid-cols-2 gap-2">
                        {!TERMINAL_SLOT_STATUSES.has(slot.status) && (
                          <PermissionGate permission={Permissions.SCHEDULING_SLOT_UPDATE}>
                            <button
                              type="button"
                              onClick={() => setEditSlotOpen(true)}
                              className="flex flex-col items-center gap-1 rounded-md border border-border bg-background px-2 py-3 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors"
                            >
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-xs font-medium text-foreground">Ändra tid och plats</span>
                            </button>
                          </PermissionGate>
                        )}

                        <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
                          <button
                            type="button"
                            onClick={() => setNoteEditorOpen((v) => !v)}
                            className="flex flex-col items-center gap-1 rounded-md border border-border bg-background px-2 py-3 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors"
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">Lägg till anteckning</span>
                          </button>
                        </PermissionGate>

                        {bookings.length === 1 && (
                          <button
                            type="button"
                            onClick={() => setNotifierOpen((v) => !v)}
                            className="flex flex-col items-center gap-1 rounded-md border border-border bg-background px-2 py-3 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors"
                          >
                            <Bell className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">Notiser</span>
                          </button>
                        )}

                        <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
                          <button
                            type="button"
                            onClick={() => setDuplicateSheetOpen(true)}
                            className="flex flex-col items-center gap-1 rounded-md border border-border bg-background px-2 py-3 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors"
                          >
                            <Copy className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">Kopiera bokning</span>
                          </button>
                        </PermissionGate>
                      </div>
                    )}

                    <SessionNotesRow
                      slotId={slot.id}
                      notes={slot.notes}
                      open={noteEditorOpen}
                      onOpenChange={setNoteEditorOpen}
                      onSlotUpdated={handleSlotUpdated}
                    />

                    {notifierOpen && bookings.length === 1 && (
                      <div className="rounded-md border border-border bg-background p-2">
                        <BookingMessageHistory studentId={bookings[0]!.student_id} maxCount={5} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Bokningsinformation — technical/audit details, de-emphasised ── */}
              <div className="space-y-2">
                <button
                  type="button"
                  className="flex items-center justify-between w-full text-left"
                  onClick={() => setMoreInfoOpen((v) => !v)}
                >
                  <h3 className="text-xs font-medium text-muted-foreground">Bokningsinformation</h3>
                  {moreInfoOpen
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {moreInfoOpen && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="font-mono">{slot.starts_at.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                      <History className="w-3 h-3 shrink-0" />
                      <span>
                        Skapat {formatTimestamp(slot.created_at)}
                        {slot.updated_at !== slot.created_at && ` · Ändrat ${formatTimestamp(slot.updated_at)}`}
                      </span>
                    </div>
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
                              />
                            )}
                            {/* Promote to booking when slot has capacity */}
                            {!full && (
                              <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
                                <PromoteWaitlistButton entry={entry} slotId={slot.id} />
                              </PermissionGate>
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

          {/* Footer actions — operational command bar */}
          <div className="px-5 py-4 border-t border-border space-y-2.5">

            {slot.status === 'blocked' && (
              <p className="text-xs text-center text-muted-foreground">Passet är blockerat och inte öppet för bokning.</p>
            )}
            {slot.status === 'in_progress' && (
              <p className="text-xs text-center text-muted-foreground">Lektion pågår – bokningsändringar hanteras av instruktören.</p>
            )}
            {slot.status === 'completed' && (
              <p className="text-xs text-center text-muted-foreground">Lektionen är avslutad.</p>
            )}
            {slot.status === 'cancelled' && (
              <p className="text-xs text-center text-muted-foreground">Passet är avbokat.</p>
            )}
            {full && slot.status === 'open' && (
              <p className="text-xs text-center text-muted-foreground">Fullbokad – inga lediga platser.</p>
            )}

            {/* Primary action */}
            {slot.status === 'open' && !full && (
              <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
                <Button className="w-full" onClick={() => setBookingDialogOpen(true)}>
                  Boka lektion
                </Button>
              </PermissionGate>
            )}
            {slot.status === 'open' && full && (
              <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
                <Button variant="outline" className="w-full" onClick={() => setAddWaitlistDialogOpen(true)}>
                  Lägg till på väntelista
                </Button>
              </PermissionGate>
            )}
            {slot.status === 'blocked' && (
              <PermissionGate permission={Permissions.SCHEDULING_SLOT_UPDATE}>
                <Button className="w-full" disabled={updateStatus.isPending} onClick={handleUnblock}>
                  {updateStatus.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Öppna igen'}
                </Button>
              </PermissionGate>
            )}

            {/* Secondary operational actions */}
            <div className="flex flex-wrap gap-1.5">
              {slot.status === 'open' && !full && (
                <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 flex-1"
                    onClick={() => setMatchDialogOpen(true)}
                  >
                    <UserSearch className="w-3 h-3" />
                    Hitta elever
                  </Button>
                </PermissionGate>
              )}

              {slot.status === 'open' && slot.current_bookings === 0 && (
                <PermissionGate permission={Permissions.SCHEDULING_SLOT_UPDATE}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 flex-1"
                    disabled={updateStatus.isPending}
                    onClick={handleBlock}
                  >
                    {updateStatus.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                    Blockera
                  </Button>
                </PermissionGate>
              )}

              {/* Kopiera moved to "Fler alternativ" above — same handler (setDuplicateSheetOpen), not duplicated. */}

              {!TERMINAL_SLOT_STATUSES.has(slot.status) && slot.current_bookings === 0 && (
                <PermissionGate permission={Permissions.SCHEDULING_SLOT_DELETE}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="w-3 h-3" />
                    Ta bort
                  </Button>
                </PermissionGate>
              )}
            </div>

            {deleteConfirmOpen && (
              <div className="flex items-center gap-2 p-2 rounded-lg border border-destructive/30 bg-destructive/5">
                <span className="text-xs text-foreground flex-1">Ta bort detta pass?</span>
                <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={deleteSlot.isPending} onClick={handleDelete}>
                  {deleteSlot.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ja, ta bort'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={deleteSlot.isPending} onClick={() => setDeleteConfirmOpen(false)}>
                  Avbryt
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested: create booking */}
      <BookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        slot={slot}
        onSuccess={() => setBookingDialogOpen(false)}
      />

      {/* Nested: find matching students — same dialog, pre-filtered by instructor's licence category */}
      <BookingDialog
        open={matchDialogOpen}
        onOpenChange={setMatchDialogOpen}
        slot={slot}
        matchCategory={matchCategory}
        onSuccess={() => setMatchDialogOpen(false)}
      />

      {/* Nested: duplicate slot — same instructor/vehicle/lesson type, new time */}
      <CreateSlotSheet
        open={duplicateSheetOpen}
        onOpenChange={setDuplicateSheetOpen}
        initialDate={new Date(`${slot.starts_at.slice(0, 10)}T12:00:00`)}
        initialInstructorId={slot.instructor_id}
        initialLessonTypeId={slot.lesson_type_id}
        initialVehicleId={slot.vehicle_id}
      />

      {/* Nested: cancel booking */}
      <CancelBookingDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        bookingId={cancelBookingId}
        slotId={slot.id}
        student={cancelStudentId ? (studentMap[cancelStudentId] ?? null) : null}
        slotLabel={`${dateLabel} kl ${startLabel}`}
        slotStartsAt={slot.starts_at}
        onSuccess={() => {
          setCancelDialogOpen(false);
          setCancelBookingId(null);
          setCancelStudentId(null);
        }}
      />

      {/* Nested: reschedule booking */}
      <RescheduleBookingDialog
        open={rescheduleDialogOpen}
        onOpenChange={setRescheduleDialogOpen}
        bookingId={rescheduleBookingId}
        currentSlotId={slot.id}
        studentName={rescheduleStudentName}
        student={rescheduleStudent}
        onSuccess={() => {
          setRescheduleDialogOpen(false);
          setRescheduleBookingId(null);
          setRescheduleStudentName('');
          setRescheduleStudent(null);
        }}
      />

      {/* Nested: add to waitlist (shown when slot is full) */}
      <AddToWaitlistDialog
        open={addWaitlistDialogOpen}
        onOpenChange={setAddWaitlistDialogOpen}
        slot={slot}
      />
    </>
  );
}
