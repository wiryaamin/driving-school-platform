import { useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Label,
} from '@platform/ui';
import { toast } from '@platform/ui';
import type { CancellationCategory, Student } from '@platform/types';
import { useCancelBooking } from '../hooks/useSchedulingMutations.js';
import { useCancellationDeadlineHours } from '../hooks/useCancellationPolicy.js';
import { useSession } from '@shared/hooks/useSession.js';

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
  slotStartsAt,
  onSuccess,
}: CancelBookingDialogProps) {
  const [category, setCategory] = useState<CancellationCategory | ''>('');
  const [reason, setReason]     = useState('');

  const cancelMutation = useCancelBooking();

  // F3 V1 — informational only; the backend is the real enforcement point.
  // Only 'student_request' is subject to the deadline (mirrors handleCancel).
  const { organization } = useSession();
  const { data: deadlineHours } = useCancellationDeadlineHours(organization?.id);
  const isLate = Boolean(
    category === 'student_request' &&
    slotStartsAt &&
    deadlineHours !== undefined &&
    (new Date(slotStartsAt).getTime() - Date.now()) <= deadlineHours * 3_600_000
  );

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
        onSuccess: (data) => {
          toast({ title: 'Bokning avbokad' });
          if (data.credit_reversal_failed) {
            toast({
              title:       'Kredit kunde inte återställas automatiskt',
              description: 'Bokningen är avbokad, men elevens paketkredit kunde inte återställas. Kontrollera elevens paket manuellt.',
              variant:     'destructive',
            });
          } else if (data.credit_forfeited) {
            toast({
              title:       'Lektionskredit återställdes inte',
              description: 'Avbokningen skedde inom avbokningsfristen, så eleven behåller inte krediten för denna lektion.',
            });
          }
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
            <Label htmlFor="cancel-category">Orsak (valfritt)</Label>
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

          {isLate && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5">
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                Sen avbokning — inom {deadlineHours} timmar från lektionsstart. Elevens lektionskredit återställs inte.
              </p>
            </div>
          )}
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
