import { useState, useMemo } from 'react';
import { Users, Search, X, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Input, ScrollArea, Skeleton, toast,
  cn,
} from '@platform/ui';
import type { LessonSlot } from '@platform/types';
import type { Student } from '@modules/students/hooks/useStudents.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import { useStudentsBatch } from '@modules/students/hooks/useStudents.js';
import { useBookingsForSlot } from '../hooks/useBookings.js';
import { useCreateBooking } from '../hooks/useSchedulingMutations.js';
import { slotKeys } from '../hooks/useSlots.js';
import { bookingKeys } from '../hooks/useBookings.js';
import { useQueryClient } from '@tanstack/react-query';

// ─── Date/time helpers ────────────────────────────────────────────────────────

const _STO = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  weekday:  'long', day: 'numeric', month: 'long',
});
const _TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function slotDateStr(slot: LessonSlot): string {
  const s = _STO.format(new Date(slot.starts_at));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function slotTimeStr(slot: LessonSlot): string {
  return `${_TIME.format(new Date(slot.starts_at))}–${_TIME.format(new Date(slot.ends_at))}`;
}

// ─── StudentRow ───────────────────────────────────────────────────────────────

function StudentRow({
  student, selected, alreadyBooked, onToggle,
}: {
  student:       Student;
  selected:      boolean;
  alreadyBooked: boolean;
  onToggle:      () => void;
}) {
  return (
    <button
      type="button"
      disabled={alreadyBooked}
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
        alreadyBooked
          ? 'opacity-50 cursor-not-allowed bg-muted/20'
          : selected
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : 'hover:bg-accent/50',
      )}
    >
      <div className={cn(
        'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0',
        alreadyBooked
          ? 'border-green-400 bg-green-400'
          : selected
          ? 'border-primary bg-primary'
          : 'border-border bg-background',
      )}>
        {(selected || alreadyBooked) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {student.first_name} {student.last_name}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {student.email ?? '–'}
          {alreadyBooked && <span className="ml-1 text-green-600 font-semibold">· Redan bokad</span>}
        </p>
      </div>
    </button>
  );
}

// ─── GroupEnrollmentSheet ─────────────────────────────────────────────────────

export interface GroupEnrollmentSheetProps {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  slot:          LessonSlot | null;
  lessonTypeName?: string | undefined;
  onSuccess?:    () => void;
}

export function GroupEnrollmentSheet({
  open, onOpenChange, slot, lessonTypeName, onSuccess,
}: GroupEnrollmentSheetProps) {
  const [search,      setSearch]      = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [enrolling,   setEnrolling]   = useState(false);
  const [results,     setResults]     = useState<{ id: string; name: string; ok: boolean }[]>([]);

  const qc = useQueryClient();
  const createBooking = useCreateBooking();

  // Student search
  const { data: studentsData, isLoading: studentsLoading } = useStudentList(
    { search: search.trim() || undefined, per_page: 30 },
    { enabled: search.trim().length > 0 },
  );

  // Already-enrolled bookings for this slot
  const { data: existingBookingsData, isLoading: bookingsLoading } = useBookingsForSlot(slot?.id ?? null);
  const existingBookings = existingBookingsData?.data ?? [];

  const enrolledStudentIds = useMemo(
    () => new Set(
      existingBookings
        .filter(b => b.status !== 'cancelled')
        .map(b => b.student_id)
        .filter(Boolean) as string[],
    ),
    [existingBookings],
  );

  // Batch-fetch names for enrolled students
  const enrolledIdList = useMemo(() => [...enrolledStudentIds], [enrolledStudentIds]);
  const { data: enrolledStudentsData } = useStudentsBatch(enrolledIdList);
  const enrolledStudentMap = useMemo((): Record<string, Student> => {
    if (!enrolledStudentsData) return {};
    return Object.fromEntries(enrolledStudentsData.map(s => [s.id, s]));
  }, [enrolledStudentsData]);

  const students = studentsData?.data ?? [];
  const remaining = slot ? Math.max(0, slot.max_bookings - slot.current_bookings) : 0;
  const isFull    = remaining === 0;

  function toggleStudent(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleEnroll() {
    if (!slot || selectedIds.size === 0) return;
    setEnrolling(true);
    setResults([]);

    const ids = [...selectedIds];
    const settled = await Promise.allSettled(
      ids.map(studentId => createBooking.mutateAsync({ slot_id: slot.id, student_id: studentId })),
    );

    const summary = settled.map((r, i) => ({
      id:   ids[i]!,
      name: students.find(s => s.id === ids[i])?.first_name ?? ids[i]!,
      ok:   r.status === 'fulfilled',
    }));

    setResults(summary);
    setEnrolling(false);
    setSelectedIds(new Set());

    // Invalidate slot + bookings cache
    void qc.invalidateQueries({ queryKey: slotKeys.detail(slot.id) });
    void qc.invalidateQueries({ queryKey: bookingKeys.bySlot(slot.id) });
    void qc.invalidateQueries({ queryKey: slotKeys.lists() });

    const okCount   = summary.filter(s => s.ok).length;
    const failCount = summary.length - okCount;

    if (okCount > 0) {
      toast({ title: `${okCount} elev${okCount !== 1 ? 'er' : ''} bokade` });
    }
    if (failCount > 0) {
      toast({
        title: `${failCount} misslyckades`,
        description: 'Kontrollera att eleverna inte redan är bokade.',
        variant: 'destructive',
      });
    }

    if (okCount > 0) onSuccess?.();
  }

  function handleClose() {
    setSearch('');
    setSelectedIds(new Set());
    setResults([]);
    onOpenChange(false);
  }

  if (!slot) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-muted-foreground" />
            Gruppinskrivning
          </DialogTitle>
          {/* Slot summary */}
          <div className="mt-1 space-y-0.5">
            <p className="text-sm font-medium text-foreground">{lessonTypeName ?? '–'}</p>
            <p className="text-xs text-muted-foreground">
              {slotDateStr(slot)} · {slotTimeStr(slot)}
            </p>
            <div className="flex items-center gap-3 text-xs mt-1">
              <span className={cn(
                'font-semibold',
                isFull ? 'text-red-600' : 'text-foreground',
              )}>
                {slot.current_bookings}/{slot.max_bookings} platser
              </span>
              {!isFull && (
                <span className="text-muted-foreground">{remaining} kvar</span>
              )}
              {isFull && (
                <span className="text-red-600 font-medium">Fullbokad</span>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 space-y-4">

            {/* Enrollment results */}
            {results.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground mb-2">Resultat</p>
                {results.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    {r.ok
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      : <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    }
                    <span className={r.ok ? 'text-foreground' : 'text-red-600'}>{r.name}</span>
                    <span className="text-muted-foreground">{r.ok ? 'bokad' : 'misslyckades'}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Current bookings list */}
            {bookingsLoading ? (
              <Skeleton className="h-8 rounded" />
            ) : enrolledStudentIds.size > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                  Redan inskrivna ({enrolledStudentIds.size})
                </p>
                <div className="space-y-0.5">
                  {existingBookings
                    .filter(b => b.status !== 'cancelled' && b.student_id)
                    .map(b => {
                      const s = enrolledStudentMap[b.student_id];
                      const name = s ? `${s.first_name} ${s.last_name}` : b.student_id;
                      return (
                        <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-950/20 rounded text-xs text-green-700 dark:text-green-400">
                          <CheckCircle className="w-3 h-3 shrink-0" />
                          {name}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Search */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Sök och lägg till elever</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Sök på namn eller e-post..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Search results */}
            {search.trim().length > 0 && (
              <div className="space-y-0.5">
                {studentsLoading ? (
                  [1, 2, 3].map(i => <Skeleton key={i} className="h-11 rounded-lg" />)
                ) : students.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Inga elever hittades</p>
                ) : (
                  students.map(s => (
                    <StudentRow
                      key={s.id}
                      student={s}
                      selected={selectedIds.has(s.id)}
                      alreadyBooked={enrolledStudentIds.has(s.id)}
                      onToggle={() => toggleStudent(s.id)}
                    />
                  ))
                )}
              </div>
            )}

            {search.trim().length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                Skriv ett namn eller e-post för att söka efter elever
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
          {selectedIds.size > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {selectedIds.size} elev{selectedIds.size !== 1 ? 'er' : ''} vald{selectedIds.size !== 1 ? 'a' : ''}
            </p>
          )}
          <Button
            className="w-full"
            disabled={selectedIds.size === 0 || enrolling || isFull}
            onClick={() => { void handleEnroll(); }}
          >
            {enrolling
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Bokar...</>
              : `Boka ${selectedIds.size > 0 ? `${selectedIds.size} elev${selectedIds.size !== 1 ? 'er' : ''}` : 'valda elever'}`
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
