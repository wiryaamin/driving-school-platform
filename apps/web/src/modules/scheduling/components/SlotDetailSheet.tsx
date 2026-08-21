import { useState, useMemo, useEffect } from 'react';
import {
  Clock, Users, UserX, CheckCircle, XCircle, CalendarCheck, ChevronDown, ChevronUp, Loader2, Bell,
  GraduationCap, ArrowLeftRight, ExternalLink, Car, FileText, Search, UserCheck, Phone, Mail,
  Ban, Trash2, Pencil, Copy, MapPin, Tag, CreditCard, Languages, History, UserSearch,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Badge, Separator, ScrollArea, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
  useUpdateBookingStatus, useUpdateSlotVehicle, useUpdateSlotNotes, useUpdateSlotInstructor,
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
              className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white border-0"
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
              onClick={() => onReschedule(booking.id, studentName, student)}
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
              onClick={() => onCancel(booking.id, booking.student_id)}
            >
              <XCircle className="w-3 h-3" />
              Avboka
            </Button>

            {/* Påminnelse SMS — only for confirmed bookings with a phone number */}
            {booking.status === 'confirmed' && student?.phone && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-900/40 dark:hover:bg-blue-950/20"
                disabled={reminderBusy}
                onClick={handleSendReminder}
              >
                {reminderBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                Påminnelse
              </Button>
            )}

            {/* Ring — direct tel: link */}
            {student?.phone && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
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
                variant="outline"
                className="h-7 text-xs gap-1"
                disabled={sendMessage.isPending}
                onClick={handleSendEmail}
              >
                {sendMessage.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                E-post
              </Button>
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
  slotId, instructorId, slotStatus, onNavigate,
}: {
  slotId:       string;
  instructorId: string;
  slotStatus:   string;
  onNavigate?:  ((path: string) => void) | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const { data: instructorsData } = useInstructorList({ per_page: 100 });
  const updateInstructor = useUpdateSlotInstructor();

  const instructors = (instructorsData?.data ?? []).filter(i => !i.deleted_at);
  const isTerminal  = TERMINAL_SLOT_STATUSES.has(slotStatus);

  function handleChange(newId: string) {
    if (!newId) return;
    updateInstructor.mutate(
      { id: slotId, instructor_id: newId },
      {
        onSuccess: () => { toast({ title: 'Instruktör uppdaterad' }); setEditing(false); },
        onError:   () => { toast({ title: 'Kunde inte uppdatera instruktör', variant: 'destructive' }); },
      },
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <GraduationCap className="w-3.5 h-3.5 shrink-0" />
        <select
          autoFocus
          value={instructorId}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setEditing(false)}
          disabled={updateInstructor.isPending}
          className="h-7 text-xs px-1.5 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          {instructors.map(i => (
            <option key={i.id} value={i.id}>
              {i.first_name} {i.last_name}
            </option>
          ))}
        </select>
        {updateInstructor.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <GraduationCap className="w-3.5 h-3.5 shrink-0" />
      <InstructorName id={instructorId} {...(onNavigate !== undefined ? { onNavigate } : {})} />
      {!isTerminal && (
        <PermissionGate permission={Permissions.SCHEDULING_SLOT_UPDATE}>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-0.5 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
          >
            Byt
          </button>
        </PermissionGate>
      )}
    </div>
  );
}

// ─── Vehicle row — display + inline change ────────────────────────────────────

function VehicleRow({ slotId, vehicleId }: { slotId: string; vehicleId: string | null }) {
  const [editing, setEditing] = useState(false);
  const { data: vehicles = [] } = useVehicles();
  const updateVehicle = useUpdateSlotVehicle();

  const current = vehicles.find(v => v.id === vehicleId) ?? null;
  const available = vehicles.filter(v => v.operational_status === 'available' || v.id === vehicleId);

  function handleChange(newId: string) {
    updateVehicle.mutate(
      { id: slotId, vehicle_id: newId || null },
      {
        onSuccess: () => { toast({ title: newId ? 'Fordon tilldelat' : 'Fordon borttaget' }); setEditing(false); },
        onError:   () => { toast({ title: 'Kunde inte uppdatera fordon', variant: 'destructive' }); },
      },
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Car className="w-3.5 h-3.5 shrink-0" />
        <select
          autoFocus
          value={vehicleId ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setEditing(false)}
          disabled={updateVehicle.isPending}
          className="h-7 text-xs px-1.5 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="">— Inget fordon —</option>
          {available.map(v => (
            <option key={v.id} value={v.id}>
              {v.registration_number} · {v.make} {v.model} ({v.transmission === 'automatic' ? 'A' : 'M'})
            </option>
          ))}
        </select>
        {updateVehicle.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Car className="w-3.5 h-3.5 shrink-0" />
      {current ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-medium text-foreground hover:text-primary transition-colors"
        >
          {current.registration_number} · {current.make} {current.model}
          <span className="ml-1 text-muted-foreground font-normal">
            ({current.transmission === 'automatic' ? 'Automat' : 'Manuell'})
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="italic hover:text-foreground transition-colors"
        >
          Inget fordon tilldelat
        </button>
      )}
    </div>
  );
}

// ─── Lesson type — name, category, duration, price ────────────────────────────

function LessonTypeRow({ lessonTypeId }: { lessonTypeId: string | null }) {
  const { data: lessonTypes, isLoading } = useLessonTypes();

  if (lessonTypeId == null) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Tag className="w-3.5 h-3.5 shrink-0" />
        <span className="italic">Ingen förvald lektionstyp — tillgängligt för valfri bokning</span>
      </div>
    );
  }

  const lessonType = lessonTypes?.find(lt => lt.id === lessonTypeId);

  if (!lessonType) {
    if (isLoading) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Tag className="w-3.5 h-3.5 shrink-0" />
          <Skeleton className="h-4 w-24 inline-block" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Tag className="w-3.5 h-3.5 shrink-0" />
        <span className="italic">Okänd lektionstyp</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
      <Tag className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium text-foreground">{lessonType.name}</span>
      <Badge variant="outline" className="text-[10px] font-normal py-0">
        {CATEGORY_LABELS[lessonType.category] ?? lessonType.category}
      </Badge>
      {lessonType.pricing_sek != null && (
        <span className="text-muted-foreground">{lessonType.pricing_sek.toLocaleString('sv-SE')} kr</span>
      )}
    </div>
  );
}

// ─── Branch / meeting location ─────────────────────────────────────────────────

function BranchRow({ locationId }: { locationId: string | null }) {
  const { data: locations = [] } = useLocations();
  if (!locationId) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 italic">
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        Ingen filial/mötesplats angiven
      </div>
    );
  }
  const location = locations.find(l => l.id === locationId);
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <MapPin className="w-3.5 h-3.5 shrink-0" />
      {location ? (
        <span className="font-medium text-foreground">
          {location.name}
          <span className="ml-1 font-normal text-muted-foreground">— {formatLocationAddress(location)}</span>
        </span>
      ) : (
        <span className="font-mono text-[10px]">{locationId.slice(0, 8)}…</span>
      )}
    </div>
  );
}

// ─── Licence categories the assigned instructor may teach ────────────────────

function LicenceCategoriesRow({ instructorId }: { instructorId: string }) {
  const { data: instructor } = useInstructor(instructorId);
  if (!instructor || instructor.teaching_categories.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
      <GraduationCap className="w-3.5 h-3.5 shrink-0" />
      <span>Behörighet:</span>
      {instructor.teaching_categories.map(cat => (
        <Badge key={cat} variant="outline" className="text-[10px] font-normal py-0">{cat}</Badge>
      ))}
    </div>
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

function SessionNotesRow({ slotId, notes }: { slotId: string; notes: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const updateNotes = useUpdateSlotNotes();

  function startEdit() { setDraft(notes ?? ''); setEditing(true); }
  function cancel()    { setEditing(false); }
  function save() {
    updateNotes.mutate(
      { id: slotId, notes: draft.trim() || null },
      {
        onSuccess: () => { toast({ title: 'Anteckning sparad' }); setEditing(false); },
        onError:   () => { toast({ title: 'Kunde inte spara anteckning', variant: 'destructive' }); },
      },
    );
  }

  if (editing) {
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

  return (
    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      {notes ? (
        <div className="flex-1 min-w-0">
          <p className="text-foreground whitespace-pre-line break-words leading-relaxed">{notes}</p>
          <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
            <button
              type="button"
              onClick={startEdit}
              className="mt-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors"
            >
              Redigera
            </button>
          </PermissionGate>
        </div>
      ) : (
        <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
          <button type="button" onClick={startEdit} className="italic hover:text-foreground transition-colors">
            Lägg till anteckning...
          </button>
        </PermissionGate>
      )}
    </div>
  );
}

// ─── Edit slot — inline time + capacity editor ("Redigera pass") ─────────────

function EditSlotPanel({
  slot, onClose,
}: {
  slot:    LessonSlot;
  onClose: () => void;
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

    const tasks: Promise<unknown>[] = [];
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
      .then(() => { toast({ title: 'Pass uppdaterat' }); onClose(); })
      .catch((err) => toast({
        title:       'Kunde inte uppdatera passet',
        description: err instanceof Error ? err.message : 'Försök igen',
        variant:     'destructive',
      }));
  }

  return (
    <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Starttid</label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Sluttid</label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground block mb-1">Antal platser</label>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setCapacity(v => Math.max(1, v - 1))} disabled={capacity <= 1}>−</Button>
          <span className="w-6 text-center text-xs font-medium tabular-nums">{capacity}</span>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setCapacity(v => Math.min(50, v + 1))} disabled={capacity >= 50}>+</Button>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" className="h-7 text-xs" disabled={busy || endTime <= startTime} onClick={handleSave}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Spara'}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onClose}>
          Avbryt
        </Button>
        {endTime <= startTime && <span className="text-[10px] text-destructive">Sluttid måste vara efter starttid</span>}
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

export function SlotDetailSheet({ slot, open, onOpenChange }: SlotDetailSheetProps) {
  const navigate = useNavigate();
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

  const updateStatus = useUpdateSlotStatus();
  const deleteSlot   = useDeleteSlot();

  function handleNavigate(path: string) {
    onOpenChange(false);
    navigate(path);
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
        onSuccess: () => toast({ title: 'Tiden blockerad' }),
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
        onSuccess: () => toast({ title: 'Tiden öppnad igen' }),
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
              <SlotStatusBadge status={slot.status} />
            </div>
          </DialogHeader>

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
                    <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40">
                      Fullbokad
                    </Badge>
                  )}
                </div>

                {/* Lesson type */}
                <LessonTypeRow lessonTypeId={slot.lesson_type_id} />

                {/* Instructor */}
                <InstructorRow
                  slotId={slot.id}
                  instructorId={slot.instructor_id}
                  slotStatus={slot.status}
                  onNavigate={handleNavigate}
                />

                {/* Licence categories this instructor may teach */}
                <LicenceCategoriesRow instructorId={slot.instructor_id} />

                {/* Vehicle */}
                <VehicleRow slotId={slot.id} vehicleId={slot.vehicle_id} />

                {/* Branch / meeting location */}
                <BranchRow locationId={slot.location_id} />

                {/* Session notes */}
                <SessionNotesRow slotId={slot.id} notes={slot.notes} />

                {/* Edit slot — time + capacity */}
                {!TERMINAL_SLOT_STATUSES.has(slot.status) && (
                  <PermissionGate permission={Permissions.SCHEDULING_SLOT_UPDATE}>
                    {editSlotOpen ? (
                      <EditSlotPanel slot={slot} onClose={() => setEditSlotOpen(false)} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditSlotOpen(true)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 shrink-0" />
                        Redigera tid & platser
                      </button>
                    )}
                  </PermissionGate>
                )}

                {/* Timing detail + operational history */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono">{slot.starts_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                  <History className="w-3 h-3 shrink-0" />
                  <span>
                    Skapat {formatTimestamp(slot.created_at)}
                    {slot.updated_at !== slot.created_at && ` · Ändrat ${formatTimestamp(slot.updated_at)}`}
                  </span>
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

              <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 flex-1"
                  onClick={() => setDuplicateSheetOpen(true)}
                >
                  <Copy className="w-3 h-3" />
                  Kopiera
                </Button>
              </PermissionGate>

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
