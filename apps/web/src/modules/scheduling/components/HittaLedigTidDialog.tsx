import { useState, useMemo, useEffect } from 'react';
import { Search, ArrowLeft, ChevronRight, Clock, User } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, ScrollArea, Skeleton, Separator,
  toast,
} from '@platform/ui';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useSlotList } from '../hooks/useSlots.js';
import { useCreateBooking } from '../hooks/useSchedulingMutations.js';
import { formatSlotDate, formatSlotTime, isSlotFull } from '../lib/calendarUtils.js';
import type { LessonSlot } from '@platform/types';
import type { Student } from '@platform/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'student' | 'slots';

interface HittaLedigTidDialogProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HittaLedigTidDialog({ open, onOpenChange }: HittaLedigTidDialogProps) {
  const [step,               setStep]               = useState<Step>('student');
  const [studentSearch,      setStudentSearch]      = useState('');
  const [selectedStudent,    setSelectedStudent]    = useState<Student | null>(null);
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [selectedSlot,       setSelectedSlot]       = useState<LessonSlot | null>(null);

  // Fixed time window — 60 days from dialog mount
  const { from, to } = useMemo(() => {
    const now = new Date();
    return {
      from: now.toISOString(),
      to:   new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: studentsData, isLoading: studentsLoading } = useStudentList(
    { search: studentSearch || undefined, status: 'active', per_page: 20 },
    { enabled: open && step === 'student' },
  );

  const { data: instructorsData } = useInstructorList({ per_page: 100 });

  const { data: slotsData, isLoading: slotsLoading } = useSlotList(
    {
      status:   'open',
      from,
      to,
      per_page: 100,
      sort_by:  'starts_at',
      sort_dir: 'asc',
      ...(selectedInstructor ? { instructor_id: selectedInstructor } : {}),
    },
    { enabled: open && step === 'slots' },
  );

  const createBooking = useCreateBooking();

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('student');
      setStudentSearch('');
      setSelectedStudent(null);
      setSelectedInstructor('');
      setSelectedSlot(null);
    }
  }, [open]);

  const students    = studentsData?.data ?? [];
  const instructors = instructorsData?.data ?? [];

  const instructorMap = useMemo(
    () => Object.fromEntries(instructors.map((i) => [i.id, `${i.first_name} ${i.last_name}`])),
    [instructors],
  );

  const slots = useMemo(
    () => (slotsData?.data ?? []).filter((s) => !isSlotFull(s)),
    [slotsData],
  );

  const slotsByDate = useMemo(() => {
    const groups = new Map<string, LessonSlot[]>();
    for (const slot of slots) {
      const key = slot.starts_at.slice(0, 10);
      const arr = groups.get(key) ?? [];
      arr.push(slot);
      groups.set(key, arr);
    }
    return groups;
  }, [slots]);

  function handleSelectStudent(student: Student) {
    setSelectedStudent(student);
    setStep('slots');
  }

  function handleBack() {
    setStep('student');
    setSelectedSlot(null);
  }

  function handleBook() {
    if (!selectedSlot || !selectedStudent) return;
    createBooking.mutate(
      { slot_id: selectedSlot.id, student_id: selectedStudent.id },
      {
        onSuccess: () => {
          toast({
            title:       'Lektion bokad',
            description: `${selectedStudent.first_name} ${selectedStudent.last_name} · ${formatSlotDate(selectedSlot.starts_at)} kl. ${formatSlotTime(selectedSlot.starts_at)}`,
          });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title:       'Bokning misslyckades',
            description: err instanceof Error ? err.message : 'Försök igen',
            variant:     'destructive',
          });
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            {step === 'student' ? 'Hitta ledig tid' : 'Välj ledig tid'}
          </DialogTitle>
        </DialogHeader>

        <Separator />

        {/* ── Step 1: Student search ── */}
        {step === 'student' && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Sök elev — namn eller telefon..."
                className="w-full pl-9 pr-3 h-9 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <ScrollArea className="h-64 rounded-md border">
              {studentsLoading ? (
                <div className="p-3 space-y-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
                </div>
              ) : students.length === 0 ? (
                <div className="flex items-center justify-center h-full py-10 text-sm text-muted-foreground">
                  {studentSearch ? 'Inga elever hittades' : 'Börja skriva för att söka elev'}
                </div>
              ) : (
                <div className="p-1">
                  {students.map((student) => (
                    <button
                      key={student.id}
                      onClick={() => handleSelectStudent(student)}
                      className="w-full text-left px-3 py-2.5 rounded text-sm hover:bg-accent transition-colors mb-0.5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {student.first_name} {student.last_name}
                          </p>
                          {student.phone && (
                            <p className="text-xs text-muted-foreground">{student.phone}</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Stäng</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: Slot selection ── */}
        {step === 'slots' && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">
                  {selectedStudent!.first_name} {selectedStudent!.last_name}
                </span>
              </div>
              <select
                value={selectedInstructor}
                onChange={(e) => { setSelectedInstructor(e.target.value); setSelectedSlot(null); }}
                className="h-8 text-xs px-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 shrink-0 max-w-[160px]"
              >
                <option value="">Alla instruktörer</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>{i.first_name} {i.last_name}</option>
                ))}
              </select>
            </div>

            <ScrollArea className="h-64 rounded-md border">
              {slotsLoading ? (
                <div className="p-3 space-y-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}
                </div>
              ) : slots.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 gap-2 text-center">
                  <p className="text-sm text-muted-foreground">
                    Inga lediga tider de närmaste 60 dagarna
                  </p>
                  {selectedInstructor && (
                    <button
                      onClick={() => { setSelectedInstructor(''); setSelectedSlot(null); }}
                      className="text-xs text-primary hover:underline"
                    >
                      Visa alla instruktörer
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-1">
                  {Array.from(slotsByDate.entries()).map(([dateKey, dateSlots]) => (
                    <div key={dateKey}>
                      <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground capitalize sticky top-0 bg-background/95 backdrop-blur-sm">
                        {new Date(dateKey + 'T12:00:00').toLocaleDateString('sv-SE', {
                          weekday: 'long', day: 'numeric', month: 'long',
                        })}
                      </div>
                      {dateSlots.map((slot) => {
                        const instructorName = instructorMap[slot.instructor_id];
                        const remaining      = slot.max_bookings - slot.current_bookings;
                        const isSelected     = selectedSlot?.id === slot.id;
                        return (
                          <button
                            key={slot.id}
                            onClick={() => setSelectedSlot(slot)}
                            className={[
                              'w-full text-left px-3 py-2 rounded text-sm transition-colors mb-0.5',
                              'flex items-center justify-between gap-2',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-accent text-foreground',
                            ].join(' ')}
                          >
                            <div>
                              <span className="font-medium">
                                {formatSlotTime(slot.starts_at)}–{formatSlotTime(slot.ends_at)}
                              </span>
                              {instructorName && (
                                <span className={`ml-2 text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                  · {instructorName.split(' ').at(-1) ?? instructorName}
                                </span>
                              )}
                            </div>
                            <span className={[
                              'text-xs shrink-0 tabular-nums',
                              isSelected
                                ? 'text-primary-foreground/70'
                                : remaining === 1
                                  ? 'text-amber-600 dark:text-amber-400 font-medium'
                                  : 'text-muted-foreground',
                            ].join(' ')}>
                              {remaining} {remaining === 1 ? 'plats' : 'platser'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {selectedSlot && (
              <p className="text-xs text-muted-foreground -mt-1">
                Valt:{' '}
                <span className="font-medium text-foreground capitalize">
                  {formatSlotDate(selectedSlot.starts_at)} kl. {formatSlotTime(selectedSlot.starts_at)}
                </span>
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleBack} disabled={createBooking.isPending}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Byt elev
              </Button>
              <Button onClick={handleBook} disabled={createBooking.isPending || !selectedSlot}>
                {createBooking.isPending ? 'Bokar...' : 'Boka lektion'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
