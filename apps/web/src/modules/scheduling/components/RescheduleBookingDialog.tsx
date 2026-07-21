import { useState, useEffect, useMemo } from 'react';
import { CalendarRange } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, ScrollArea, Skeleton, Separator,
  toast,
} from '@platform/ui';
import type { LessonSlot, Student } from '@platform/types';
import { useSlotList } from '../hooks/useSlots.js';
import { useRescheduleBooking } from '../hooks/useSchedulingMutations.js';
import { formatSlotDate, formatSlotTime, formatCapacity, isSlotFull } from '../lib/calendarUtils.js';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RescheduleBookingDialogProps {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  bookingId:     string | null;
  currentSlotId: string;
  studentName:   string;
  student?:      Student | null | undefined;
  onSuccess?:    (() => void) | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RescheduleBookingDialog({
  open,
  onOpenChange,
  bookingId,
  currentSlotId,
  studentName,
  onSuccess,
}: RescheduleBookingDialogProps) {
  const [selectedSlot, setSelectedSlot] = useState<LessonSlot | null>(null);

  // Computed once per dialog open, not on every render — from/to feed the
  // query key, and fresh Date objects on every render would change that key
  // every render, causing an unbounded refetch loop.
  //
  // `open` is intentionally listed as a dependency even though it's never
  // read inside the callback below — it's a deliberate recompute trigger,
  // not an input value. This component is always mounted by its parent
  // (SlotDetailSheet.tsx renders it unconditionally, toggling only the
  // `open` prop), so it never remounts between dialog opens; a `[]`
  // dependency array would freeze `from`/`to` at whatever moment the parent
  // sheet first mounted, silently shrinking the 90-day lookahead window for
  // every reschedule attempted in a long-lived session (a sheet left open
  // for review before rescheduling is normal usage here, not an edge case).
  const { from, to } = useMemo(() => {
    const now = new Date();
    return {
      from: now.toISOString(),
      to:   new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: slotsData, isLoading } = useSlotList(
    { status: 'open', from, to, per_page: 50, sort_by: 'starts_at', sort_dir: 'asc' },
    { enabled: open },
  );

  const reschedule = useRescheduleBooking();

  useEffect(() => {
    if (!open) setSelectedSlot(null);
  }, [open]);

  // Exclude the current slot; also guard against race-condition where a slot filled between fetch and click
  const slots = (slotsData?.data ?? []).filter(
    (s) => s.id !== currentSlotId && !isSlotFull(s),
  );

  const isPending = reschedule.isPending;

  function handleClose() {
    if (isPending) return;
    onOpenChange(false);
  }

  function handleConfirm() {
    if (!bookingId || !selectedSlot) return;

    reschedule.mutate(
      { id: bookingId, slot_id: currentSlotId, new_slot_id: selectedSlot.id },
      {
        onSuccess: () => {
          toast({
            title:       'Lektion ombokad',
            description: `${studentName} har flyttats till ${formatSlotDate(selectedSlot.starts_at)} kl. ${formatSlotTime(selectedSlot.starts_at)}.`,
          });
          handleClose();
          onSuccess?.();
        },
        onError: (err) => {
          toast({
            title:       'Ombokning misslyckades',
            description: err instanceof Error ? err.message : 'Försök igen',
            variant:     'destructive',
          });
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Omboka lektion</DialogTitle>
          <DialogDescription>
            Välj ett nytt pass för <strong>{studentName}</strong>
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <ScrollArea className="h-64 rounded-md border">
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
              {slots.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlot(slot)}
                  className={`
                    w-full text-left px-3 py-2.5 rounded text-sm transition-colors mb-0.5
                    ${selectedSlot?.id === slot.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent text-foreground'}
                  `}
                >
                  <div className="flex items-center gap-2">
                    <CalendarRange className={`w-3.5 h-3.5 shrink-0 ${
                      selectedSlot?.id === slot.id ? 'opacity-70' : 'opacity-40'
                    }`} />
                    <div className="min-w-0">
                      <div className="font-medium capitalize truncate">
                        {formatSlotDate(slot.starts_at)}
                      </div>
                      <div className={`text-xs mt-0.5 flex items-center gap-1.5 ${
                        selectedSlot?.id === slot.id ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}>
                        <span>{formatSlotTime(slot.starts_at)}–{formatSlotTime(slot.ends_at)}</span>
                        <span>·</span>
                        <span>{formatCapacity(slot.current_bookings, slot.max_bookings)} platser</span>
                      </div>
                    </div>
                  </div>
                </button>
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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Avbryt
          </Button>
          <Button onClick={handleConfirm} disabled={isPending || !selectedSlot}>
            {isPending ? 'Ombokar...' : 'Bekräfta ombokning'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
