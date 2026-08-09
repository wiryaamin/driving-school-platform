import { useEffect, useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Button, ScrollArea, Skeleton, Separator,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Label,
  toast,
} from '@platform/ui';
import { useSlotList } from '../hooks/useSlots.js';
import { useCreateBooking } from '../hooks/useSchedulingMutations.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { formatSlotDate, formatSlotTime, isSlotFull } from '../lib/calendarUtils.js';
import type { LessonSlot } from '@platform/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface StudentBookingDialogProps {
  open:        boolean;
  onClose:     () => void;
  studentId:   string;
  studentName: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StudentBookingDialog({ open, onClose, studentId, studentName }: StudentBookingDialogProps) {
  const [selected, setSelected]         = useState<LessonSlot | null>(null);
  const [lessonTypeId, setLessonTypeId] = useState('');

  // Memoized to the dialog's open transition, not recomputed every render —
  // an unmemoized `new Date()` here changes useSlotList's query key on every
  // render (its queryKey embeds the whole params object), which starts a
  // brand-new query each time instead of reusing/refetching the existing
  // one. That produces a real, observed infinite request loop (confirmed
  // live: a fresh /slots call roughly every second, skeleton never
  // resolving) — same failure mode useInstructorUpcomingSlots (useSlots.ts)
  // already documents and avoids with the same memoization technique.
  const { from, to } = useMemo(() => {
    const now = new Date();
    return { from: now.toISOString(), to: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString() };
    // open is a deliberate recompute trigger, not a referenced value — this
    // component stays mounted across opens (parent toggles `open`, doesn't
    // remount), so an empty dep array would freeze from/to at the first-ever
    // mount instead of refreshing the 90-day window on each new open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: slotsData, isLoading } = useSlotList(
    { status: 'open', from, to, per_page: 50, sort_by: 'starts_at', sort_dir: 'asc' },
    { enabled: open },
  );

  const { data: instructorsData } = useInstructorList({ per_page: 100 });

  const instructorMap = useMemo(
    () => Object.fromEntries((instructorsData?.data ?? []).map((i) => [i.id, `${i.first_name} ${i.last_name}`])),
    [instructorsData],
  );

  const createBooking = useCreateBooking();

  // Generic availability slot — no lesson type bound at creation, one must be
  // chosen at booking time (same rule as BookingDialog.tsx's staff calendar flow).
  const needsLessonType = !!selected && selected.lesson_type_id == null;
  const { data: lessonTypes, isLoading: lessonTypesLoading } = useLessonTypes({ enabled: open && needsLessonType });

  useEffect(() => {
    if (!open) { setSelected(null); setLessonTypeId(''); }
  }, [open]);

  useEffect(() => {
    setLessonTypeId('');
  }, [selected?.id]);

  const slots = (slotsData?.data ?? []).filter((s) => !isSlotFull(s));

  // Group slots by date (YYYY-MM-DD) for scannable date headers
  const slotsByDate = useMemo(() => {
    const groups = new Map<string, LessonSlot[]>();
    for (const slot of slots) {
      const dateKey = slot.starts_at.slice(0, 10);
      const group = groups.get(dateKey) ?? [];
      group.push(slot);
      groups.set(dateKey, group);
    }
    return groups;
  }, [slots]);

  function handleClose() {
    if (createBooking.isPending) return;
    onClose();
  }

  function handleConfirm() {
    if (!selected) return;
    if (needsLessonType && !lessonTypeId) return;
    createBooking.mutate(
      {
        slot_id: selected.id,
        student_id: studentId,
        ...(needsLessonType ? { lesson_type_id: lessonTypeId } : {}),
      },
      {
        onSuccess: () => {
          toast({
            title:       'Lektion bokad',
            description: `${studentName} har bokats in ${formatSlotDate(selected.starts_at)} kl. ${formatSlotTime(selected.starts_at)}`,
          });
          onClose();
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Försök igen';
          toast({ title: 'Bokning misslyckades', description: msg, variant: 'destructive' });
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Boka lektion</DialogTitle>
          <DialogDescription>
            Välj ett ledigt pass för <strong>{studentName}</strong>
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <ScrollArea className="h-72 rounded-md border">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <div className="flex items-center justify-center h-full py-10 text-sm text-muted-foreground">
              Inga lediga pass de närmaste 90 dagarna
            </div>
          ) : (
            <div className="p-1">
              {Array.from(slotsByDate.entries()).map(([dateKey, dateSlots]) => (
                <div key={dateKey}>
                  {/* Date section header */}
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground capitalize sticky top-0 bg-background/95 backdrop-blur-sm">
                    {new Date(dateKey + 'T12:00:00').toLocaleDateString('sv-SE', {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })}
                  </div>
                  {/* Slots for this date */}
                  {dateSlots.map((slot) => {
                    const instructorName = instructorMap[slot.instructor_id];
                    const remaining      = slot.max_bookings - slot.current_bookings;
                    const isSelected     = selected?.id === slot.id;
                    return (
                      <button
                        key={slot.id}
                        onClick={() => setSelected(slot)}
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

        {selected && (
          <p className="text-xs text-muted-foreground -mt-1">
            Valt:{' '}
            <span className="font-medium text-foreground capitalize">
              {formatSlotDate(selected.starts_at)} kl. {formatSlotTime(selected.starts_at)}
            </span>
          </p>
        )}

        {needsLessonType && (
          <div className="space-y-1.5">
            <Label>Lektionstyp *</Label>
            <Select value={lessonTypeId} onValueChange={setLessonTypeId} disabled={lessonTypesLoading}>
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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={createBooking.isPending}>
            Avbryt
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={createBooking.isPending || !selected || (needsLessonType && !lessonTypeId)}
          >
            {createBooking.isPending ? 'Bokar...' : 'Boka lektion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
