import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Button, ScrollArea, Skeleton, Separator,
  toast,
} from '@platform/ui';
import { useSlotList } from '../hooks/useSlots.js';
import { useCreateBooking } from '../hooks/useSchedulingMutations.js';
import { formatSlotDate, formatSlotTime, formatCapacity, isSlotFull } from '../lib/calendarUtils.js';
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
  const [selected, setSelected] = useState<LessonSlot | null>(null);

  const now  = new Date();
  const from = now.toISOString();
  const to   = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: slotsData, isLoading } = useSlotList(
    { status: 'open', from, to, per_page: 50, sort_by: 'starts_at', sort_dir: 'asc' },
    { enabled: open },
  );

  const createBooking = useCreateBooking();

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  const slots = (slotsData?.data ?? []).filter((s) => !isSlotFull(s));

  function handleClose() {
    if (createBooking.isPending) return;
    onClose();
  }

  function handleConfirm() {
    if (!selected) return;
    createBooking.mutate(
      { slot_id: selected.id, student_id: studentId },
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
              {slots.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => setSelected(slot)}
                  className={`
                    w-full text-left px-3 py-2.5 rounded text-sm transition-colors mb-0.5
                    ${selected?.id === slot.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent text-foreground'}
                  `}
                >
                  <div className="font-medium capitalize">
                    {formatSlotDate(slot.starts_at)}
                  </div>
                  <div className={`text-xs mt-0.5 ${selected?.id === slot.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {formatSlotTime(slot.starts_at)}–{formatSlotTime(slot.ends_at)}
                    {' · '}
                    {formatCapacity(slot.current_bookings, slot.max_bookings)} platser
                  </div>
                </button>
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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={createBooking.isPending}>
            Avbryt
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={createBooking.isPending || !selected}
          >
            {createBooking.isPending ? 'Bokar...' : 'Boka lektion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
