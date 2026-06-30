import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Label,
} from '@platform/ui';
import { toast } from '@platform/ui';
import type { CancellationCategory, Student } from '@platform/types';
import { useCancelBooking } from '../hooks/useSchedulingMutations.js';

// ─── Cancellation category Swedish labels ─────────────────────────────────────

const CANCELLATION_CATEGORIES: { value: CancellationCategory; label: string }[] = [
  { value: 'student_request',  label: 'Elevens önskemål' },
  { value: 'school_cancelled', label: 'Skolan avbokade' },
  { value: 'weather',          label: 'Väderproblem' },
  { value: 'vehicle_fault',    label: 'Fordonsfel' },
  { value: 'instructor_sick',  label: 'Instruktören sjuk' },
  { value: 'other',            label: 'Övrigt' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface CancelBookingDialogProps {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  bookingId:     string | null;
  slotId:        string;
  student?:      Student | null | undefined;
  slotLabel?:    string | undefined;
  slotStartsAt?: string | undefined;
  onSuccess?:    (() => void) | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CancelBookingDialog({
  open,
  onOpenChange,
  bookingId,
  slotId,
  onSuccess,
}: CancelBookingDialogProps) {
  const [category, setCategory] = useState<CancellationCategory | ''>('');
  const [reason, setReason]     = useState('');

  const cancelMutation = useCancelBooking();

  function handleClose() {
    if (cancelMutation.isPending) return;
    setCategory('');
    setReason('');
    onOpenChange(false);
  }

  function handleConfirm() {
    if (!bookingId) return;

    cancelMutation.mutate(
      {
        id:      bookingId,
        slot_id: slotId,
        ...(category !== '' ? { cancellation_category: category } : {}),
        ...(reason.trim()   ? { cancellation_reason:   reason.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Bokning avbokad' });
          handleClose();
          onSuccess?.();
        },
        onError: (err) => {
          toast({
            title:       'Avbokning misslyckades',
            description: err instanceof Error ? err.message : 'Försök igen',
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
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            Avboka lektion
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-category">Orsak</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as CancellationCategory)}
            >
              <SelectTrigger id="cancel-category">
                <SelectValue placeholder="Välj orsak..." />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_CATEGORIES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Kommentar (valfritt)</Label>
            <Textarea
              id="cancel-reason"
              placeholder="Valfri kommentar..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={2000}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={cancelMutation.isPending}
          >
            Avbryt
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={cancelMutation.isPending || !bookingId}
          >
            {cancelMutation.isPending ? 'Avbokar...' : 'Avboka lektion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
