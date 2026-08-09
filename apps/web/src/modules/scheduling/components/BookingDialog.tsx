import { useState, useEffect } from 'react';
import { Search, UserCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, ScrollArea, Skeleton, Separator,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Label,
} from '@platform/ui';
import { toast } from '@platform/ui';
import type { LessonSlot } from '@platform/types';
import type { Student } from '@modules/students/hooks/useStudents.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import { useCreateBooking } from '../hooks/useSchedulingMutations.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { formatSlotDate, formatSlotTime, formatCapacity, isSlotFull } from '../lib/calendarUtils.js';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BookingDialogProps {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  slot:            LessonSlot | null;
  onSuccess?:      () => void;
  // "Hitta matchande elever" from the empty-slot command card — pre-filters
  // the search to students training for this licence category, instead of
  // the full student list.
  matchCategory?:  string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BookingDialog({ open, onOpenChange, slot, onSuccess, matchCategory }: BookingDialogProps) {
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebounced]   = useState('');
  const [selectedStudent, setSelected]    = useState<Student | null>(null);
  const [matchOnly, setMatchOnly]         = useState(!!matchCategory);
  const [lessonTypeId, setLessonTypeId]   = useState('');

  // Generic availability slot — no lesson type bound at creation, one must be
  // chosen at booking time (auto-generated instructor working-hours slots).
  const needsLessonType = !!slot && slot.lesson_type_id == null;

  const { data: lessonTypes, isLoading: lessonTypesLoading } = useLessonTypes({ enabled: open && needsLessonType });

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setSearch('');
      setDebounced('');
      setSelected(null);
      setLessonTypeId('');
    } else {
      setMatchOnly(!!matchCategory);
    }
  }, [open, matchCategory]);

  const { data: studentsData, isLoading: studentsLoading } = useStudentList(
    {
      per_page: 50,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(matchOnly && matchCategory ? { licence_category: matchCategory } : {}),
    },
    { enabled: open },
  );

  const createBooking = useCreateBooking();

  const students    = studentsData?.data ?? [];
  const isFull      = slot ? isSlotFull(slot) : false;
  const isPending   = createBooking.isPending;

  function handleClose() {
    if (isPending) return;
    onOpenChange(false);
  }

  function handleConfirm(status?: 'confirmed' | 'reserved') {
    if (!slot || !selectedStudent) return;
    if (needsLessonType && !lessonTypeId) return;

    createBooking.mutate(
      {
        slot_id: slot.id,
        student_id: selectedStudent.id,
        ...(status ? { status } : {}),
        ...(needsLessonType ? { lesson_type_id: lessonTypeId } : {}),
      },
      {
        onSuccess: () => {
          toast(
            status === 'reserved'
              ? { title: 'Plats reserverad', description: `Reserverad åt ${selectedStudent.first_name} ${selectedStudent.last_name} i ca 30 min.` }
              : { title: 'Lektion bokad', description: `${selectedStudent.first_name} ${selectedStudent.last_name} har bokats in.` }
          );
          handleClose();
          onSuccess?.();
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : '';
          toast({
            title:       msg.startsWith('Eleven saknar') ? 'Otillräckliga lektionstillgodokvitton' : 'Bokning misslyckades',
            description: msg || 'Försök igen.',
            variant:     'destructive',
          });
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Boka lektion</DialogTitle>
        </DialogHeader>

        {slot && (
          <div className="bg-muted/40 rounded-md px-3 py-2.5 text-sm space-y-0.5">
            <div className="font-medium text-foreground capitalize">
              {formatSlotDate(slot.starts_at)}
            </div>
            <div className="text-muted-foreground">
              {formatSlotTime(slot.starts_at)}–{formatSlotTime(slot.ends_at)}
              {' · '}
              {formatCapacity(slot.current_bookings, slot.max_bookings)} platser
            </div>
          </div>
        )}

        {isFull && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Passet är fullbokat. Ny bokning är inte möjlig.
          </p>
        )}

        {needsLessonType && (
          <div className="space-y-1.5">
            <Label>Lektionstyp *</Label>
            <Select value={lessonTypeId} onValueChange={setLessonTypeId} disabled={isFull || lessonTypesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={lessonTypesLoading ? 'Laddar...' : 'Välj lektionstyp...'} />
              </SelectTrigger>
              <SelectContent>
                {(lessonTypes ?? []).map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Detta pass har ingen förvald lektionstyp — ange vilken typ av lektion som bokas.
            </p>
          </div>
        )}

        <Separator />

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Sök elev..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              disabled={isFull}
              autoFocus
            />
          </div>

          {matchCategory && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={matchOnly}
                onChange={(e) => setMatchOnly(e.target.checked)}
                className="w-3.5 h-3.5 accent-primary"
              />
              Visa endast elever som tränar för behörighet {matchCategory}
            </label>
          )}

          <ScrollArea className="h-44 sm:h-52 rounded-md border">
            {studentsLoading ? (
              <div className="p-3 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded" />
                ))}
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
                    className={`
                      w-full text-left px-3 py-2 rounded text-sm transition-colors
                      flex items-center gap-2
                      ${selectedStudent?.id === student.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent text-foreground'}
                    `}
                  >
                    {selectedStudent?.id === student.id && (
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="font-medium">
                      {student.first_name} {student.last_name}
                    </span>
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
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Avbryt
          </Button>
          <Button
            variant="outline"
            onClick={() => handleConfirm('reserved')}
            disabled={isPending || !selectedStudent || isFull || (needsLessonType && !lessonTypeId)}
            title="Håller platsen i ca 30 minuter utan att slutgiltigt boka"
          >
            {isPending ? 'Reserverar...' : 'Reservera'}
          </Button>
          <Button
            onClick={() => handleConfirm('confirmed')}
            disabled={isPending || !selectedStudent || isFull || (needsLessonType && !lessonTypeId)}
          >
            {isPending ? 'Bokar...' : 'Boka lektion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
