import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, MessageSquare, UserX } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Skeleton,
} from '@platform/ui';
import { toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useSendMessage } from '@modules/communication/hooks/useCommunication.js';
import { useReassignInstructorSlots } from '../hooks/useSchedulingMutations.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d  = new Date();
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ─── Affected students query ───────────────────────────────────────────────────

interface AffectedStudent {
  id:         string;
  first_name: string;
  last_name:  string;
  phone:      string | null;
}

async function fetchAffectedStudents(
  toInstructorId: string,
  fromDate:        string,
  toDate:          string,
): Promise<AffectedStudent[]> {
  const fromTs = `${fromDate}T00:00:00`;
  const toTs   = `${toDate}T23:59:59`;

  // Step 1: slot IDs now belonging to the substitute instructor in the date range
  const { data: slotsRaw, error: slotErr } = await supabase
    .from('lesson_slots')
    .select('id')
    .eq('instructor_id', toInstructorId)
    .gte('starts_at', fromTs)
    .lte('starts_at', toTs)
    .is('deleted_at', null);

  const slots = slotsRaw as Array<{ id: string }> | null;

  if (slotErr) throw new Error(slotErr.message);
  if (!slots?.length) return [];

  const slotIds = slots.map((s) => s.id);

  // Step 2: active bookings for those slots with embedded student data
  const { data: bookings, error: bookErr } = await supabase
    .from('lesson_bookings')
    .select('student_id, students ( id, first_name, last_name, phone )')
    .in('slot_id', slotIds)
    .in('status', ['confirmed', 'reserved'])
    .is('deleted_at', null);

  if (bookErr) throw new Error(bookErr.message);

  // Deduplicate by student ID
  const seen   = new Set<string>();
  const result: AffectedStudent[] = [];
  for (const b of bookings ?? []) {
    const st = (b as unknown as { students: AffectedStudent | null }).students;
    if (!st || seen.has(st.id)) continue;
    seen.add(st.id);
    result.push({ id: st.id, first_name: st.first_name, last_name: st.last_name, phone: st.phone });
  }
  return result;
}

// ─── Preview query ─────────────────────────────────────────────────────────────

function useReassignPreview(fromInstructorId: string, fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['reassign-preview', fromInstructorId, fromDate, toDate],
    queryFn: async () => {
      const fromTs = `${fromDate}T00:00:00`;
      const toTs   = `${toDate}T23:59:59`;
      const { count, error } = await supabase
        .from('lesson_slots')
        .select('id', { count: 'exact', head: true })
        .eq('instructor_id', fromInstructorId)
        .gte('starts_at', fromTs)
        .lte('starts_at', toTs)
        .is('deleted_at', null)
        .not('status', 'in', '(completed,cancelled,blocked)');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: Boolean(fromInstructorId && fromDate && toDate && fromDate <= toDate),
    staleTime: 0,
  });
}

// ─── SubstituteInstructorDialog ───────────────────────────────────────────────

interface SubstituteInstructorDialogProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
}

interface NotifyCtx {
  count:   number;
  toName:  string;
  toId:    string;
  fromDate: string;
  toDate:   string;
}

export function SubstituteInstructorDialog({ open, onOpenChange }: SubstituteInstructorDialogProps) {
  const today = todayISO();

  // ── Form state (step 1) ──────────────────────────────────────────────────
  const [fromInstructorId, setFromInstructorId] = useState('');
  const [toInstructorId,   setToInstructorId]   = useState('');
  const [fromDate,         setFromDate]         = useState(today);
  const [toDate,           setToDate]           = useState(today);
  const [confirmed,        setConfirmed]        = useState(false);

  // ── Notify state (step 2) ────────────────────────────────────────────────
  const [step,        setStep]        = useState<'form' | 'notify'>('form');
  const [notifyCtx,   setNotifyCtx]   = useState<NotifyCtx | null>(null);
  const [notifyMsg,   setNotifyMsg]   = useState('');
  const [notifyBusy,  setNotifyBusy]  = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: instructorsData, isLoading: instructorsLoading } = useInstructorList({ per_page: 100 });
  const instructors       = instructorsData?.data ?? [];
  const activeInstructors = instructors.filter((i) => !i.deleted_at);

  const { data: previewCount, isLoading: previewing } = useReassignPreview(
    fromInstructorId, fromDate, toDate,
  );

  const { data: affectedStudents = [], isLoading: affectedLoading } = useQuery({
    queryKey: ['substitute-affected', notifyCtx?.toId, notifyCtx?.fromDate, notifyCtx?.toDate],
    queryFn:  () => fetchAffectedStudents(notifyCtx!.toId, notifyCtx!.fromDate, notifyCtx!.toDate),
    enabled:  step === 'notify' && Boolean(notifyCtx),
    staleTime: 0,
  });

  const studentsWithPhone = affectedStudents.filter((s) => Boolean(s.phone));

  const reassign    = useReassignInstructorSlots();
  const sendMessage = useSendMessage();

  const canPreview = Boolean(fromInstructorId && fromDate && toDate && fromDate <= toDate);
  const canSubmit  = canPreview && Boolean(toInstructorId) && fromInstructorId !== toInstructorId;

  const fromName = activeInstructors.find((i) => i.id === fromInstructorId);
  const toName   = activeInstructors.find((i) => i.id === toInstructorId);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleReset() {
    setFromInstructorId('');
    setToInstructorId('');
    setFromDate(today);
    setToDate(today);
    setConfirmed(false);
    setStep('form');
    setNotifyCtx(null);
    setNotifyMsg('');
    setNotifyBusy(false);
  }

  function handleClose() {
    handleReset();
    onOpenChange(false);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const toNameStr = toName ? `${toName.first_name} ${toName.last_name}` : '';
    reassign.mutate(
      { fromInstructorId, toInstructorId, fromDate, toDate },
      {
        onSuccess: (result) => {
          // Transition to notification step
          setNotifyCtx({ count: result.count, toName: toNameStr, toId: toInstructorId, fromDate, toDate });
          setNotifyMsg(
            `Hej {namn}, din körlektion i perioden ${fromDate}–${toDate} har fått en ny instruktör: ${toNameStr}. Kontakta oss om du har frågor.`,
          );
          setStep('notify');
        },
        onError: (err) => {
          toast({
            title:       'Omfördelning misslyckades',
            description: err instanceof Error ? err.message : 'Försök igen',
            variant:     'destructive',
          });
        },
      },
    );
  }

  async function handleNotifyAll() {
    if (!studentsWithPhone.length || !notifyMsg.trim()) return;
    setNotifyBusy(true);
    try {
      const results = await Promise.allSettled(
        studentsWithPhone.map((s) =>
          sendMessage.mutateAsync({
            channel:           'sms',
            recipient_type:    'student',
            recipient_id:      s.id,
            recipient_address: s.phone!,
            body:              notifyMsg.replace(/\{namn\}/g, s.first_name),
            metadata:          { event: 'instructor_substituted', manual: true },
          }),
        ),
      );
      const sent   = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      toast({
        title:       `${sent} SMS skickade`,
        description: failed > 0 ? `${failed} misslyckades` : undefined,
      });
      handleClose();
    } finally {
      setNotifyBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md flex flex-col p-0 gap-0 max-h-[90vh]">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <UserX className="w-4 h-4 text-amber-500" />
            {step === 'form' ? 'Sjukvikariera — omfördela pass' : 'Meddela berörda elever'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Form ───────────────────────────────────────────────── */}
        {step === 'form' && (
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            {/* Warning */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/60">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                Alla öppna och bekräftade pass inom datumintervallet omfördelas till den valda vikarie-läraren.
                Avslutade och avbokade pass påverkas inte.
              </p>
            </div>

            {/* From instructor */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Sjuk lärare</label>
              {instructorsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <select
                  value={fromInstructorId}
                  onChange={(e) => { setFromInstructorId(e.target.value); setConfirmed(false); }}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Välj sjuk lärare…</option>
                  {activeInstructors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.first_name} {i.last_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Från datum</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setConfirmed(false); }}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Till datum</label>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(e) => { setToDate(e.target.value); setConfirmed(false); }}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Preview */}
            {canPreview && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                {previewing ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Räknar pass…
                  </div>
                ) : (
                  <p className="text-sm">
                    <span className="font-semibold text-foreground text-lg tabular-nums">{previewCount ?? 0}</span>
                    <span className="text-muted-foreground ml-2">
                      pass berörs{previewCount === 0 ? ' (inga pass att omfördela)' : ''}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Arrow → to instructor */}
            {(previewCount ?? 0) > 0 && (
              <>
                <div className="flex items-center justify-center gap-3 py-1">
                  <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                    {fromName ? `${fromName.first_name} ${fromName.last_name}` : '…'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-primary font-medium truncate max-w-[120px]">
                    {toName ? `${toName.first_name} ${toName.last_name}` : 'vikarie'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Vikarie-lärare</label>
                  {instructorsLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <select
                      value={toInstructorId}
                      onChange={(e) => { setToInstructorId(e.target.value); setConfirmed(false); }}
                      className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="">Välj vikarie…</option>
                      {activeInstructors
                        .filter((i) => i.id !== fromInstructorId)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.first_name} {i.last_name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                {/* Confirm checkbox */}
                {toInstructorId && (
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 rounded accent-primary"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      Jag bekräftar att {previewCount} pass ska omfördelas från{' '}
                      <strong className="text-foreground">{fromName?.first_name} {fromName?.last_name}</strong>{' '}
                      till{' '}
                      <strong className="text-foreground">{toName?.first_name} {toName?.last_name}</strong>.
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Step 2: Notify students ─────────────────────────────────────── */}
        {step === 'notify' && notifyCtx && (
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            {/* Success banner */}
            <div className="flex items-center gap-2.5 p-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/60">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                <strong>{notifyCtx.count}</strong> pass omfördelade till{' '}
                <strong>{notifyCtx.toName}</strong>.
              </p>
            </div>

            {/* Affected students status */}
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Meddela berörda elever via SMS?</p>
              {affectedLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Hämtar elevlista…
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {studentsWithPhone.length > 0
                    ? `${studentsWithPhone.length} elev${studentsWithPhone.length !== 1 ? 'er' : ''} med telefonnummer hittade.`
                    : 'Inga elever med bekräftade bokningar eller telefonnummer hittades.'}
                  {affectedStudents.length - studentsWithPhone.length > 0 &&
                    ` (${affectedStudents.length - studentsWithPhone.length} saknar nummer)`}
                </p>
              )}
            </div>

            {/* Editable message */}
            {studentsWithPhone.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" />
                  SMS-meddelande
                </label>
                <textarea
                  value={notifyMsg}
                  onChange={(e) => setNotifyMsg(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-[10px] text-muted-foreground">
                  <code className="bg-muted px-1 rounded">{'{namn}'}</code> ersätts med elevens förnamn.
                  {` · ${notifyMsg.length}/160 tecken`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {step === 'form' ? (
          <div className="px-5 py-4 border-t border-border flex items-center gap-3">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Avbryt
            </Button>
            <Button
              className="flex-1"
              disabled={!canSubmit || !confirmed || reassign.isPending || (previewCount ?? 0) === 0}
              onClick={handleSubmit}
            >
              {reassign.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                  Omfördelar…
                </>
              ) : (
                'Omfördela pass'
              )}
            </Button>
          </div>
        ) : (
          <div className="px-5 py-4 border-t border-border flex items-center gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={notifyBusy}
            >
              {studentsWithPhone.length > 0 ? 'Hoppa över' : 'Stäng'}
            </Button>
            {studentsWithPhone.length > 0 && (
              <Button
                className="flex-1"
                disabled={notifyBusy || affectedLoading || !notifyMsg.trim()}
                onClick={() => void handleNotifyAll()}
              >
                {notifyBusy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                    Skickar…
                  </>
                ) : (
                  `Skicka SMS till ${studentsWithPhone.length} elever`
                )}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
