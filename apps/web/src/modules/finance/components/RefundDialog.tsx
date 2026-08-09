import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RotateCcw } from 'lucide-react';
import {
  Button, Label, Input, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import type { Invoice, Payment } from '@platform/types';
import { formatCurrency, formatDate } from '../lib/financeUtils.js';
import { useProcessRefund, type RefundType, type RefundReasonCode } from '../hooks/useRefunds.js';

// Credits are always reversed into the same lesson_category they were
// granted under (process_refund requires credit_category whenever
// credit_qty > 0). Look it up from the invoice's own package rather than
// asking the user to pick it — the invoice already unambiguously determines
// it via student_package_id, and the two-tier refund_type/reason_code form
// is already asking enough of the user.
function usePackageLessonCategory(studentPackageId: string | null | undefined) {
  return useQuery({
    queryKey: ['refund-package-category', studentPackageId ?? ''],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_packages')
        .select('package_offerings!offering_id(lesson_category)')
        .eq('id', studentPackageId as string)
        .single();
      if (error) throw error;
      const row = data as unknown as { package_offerings: { lesson_category: string } | null } | null;
      return row?.package_offerings?.lesson_category ?? null;
    },
    enabled: Boolean(studentPackageId),
    staleTime: 5 * 60_000,
  });
}

// Radix's <Select.Item> forbids an empty-string value (reserved to mean
// "cleared, show placeholder"), so "let the system pick" needs a non-empty
// sentinel here — paymentId state itself still stores '' for that case,
// exactly as before; this sentinel never leaves the Select's value pair.
const AUTO_PAYMENT_VALUE = '__auto__';

// ─── Label maps ───────────────────────────────────────────────────────────────

const REFUND_TYPE_LABELS: Record<RefundType, string> = {
  full:         'Full återbetalning (belopp + krediter)',
  partial:      'Delåterbetalning',
  credit_only:  'Enbart kreditreversal',
  payment_only: 'Enbart monetär återbetalning',
};

const REASON_LABELS: Record<RefundReasonCode, string> = {
  duplicate_payment:    'Dubbel betalning',
  student_cancellation: 'Elevavbokning',
  administrative_error: 'Administrativt fel',
  service_failure:      'Tjänsten levererades ej',
  goodwill:             'Goodwill',
  fraud_prevention:     'Bedrägerihantering',
  partial_adjustment:   'Prisjustering / delleverans',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  invoice:  Pick<Invoice, 'id' | 'invoice_number' | 'total_amount' | 'outstanding_amount' | 'student_id' | 'currency' | 'student_package_id'> | null;
  payments: Payment[];
  open:     boolean;
  onClose:  () => void;
}

export function RefundDialog({ invoice, payments, open, onClose }: Props) {
  const processRefund = useProcessRefund();
  const packageCategory = usePackageLessonCategory(open ? invoice?.student_package_id : null);

  const [refundType,   setRefundType]   = useState<RefundType>('partial');
  const [reasonCode,   setReasonCode]   = useState<RefundReasonCode>('administrative_error');
  const [refundAmount, setRefundAmount] = useState('');
  const [creditQty,    setCreditQty]    = useState('0');
  const [paymentId,    setPaymentId]    = useState('');
  const [notes,        setNotes]        = useState('');

  const confirmedPayments = payments.filter(p => p.status === 'confirmed');
  const paidAmount = confirmedPayments.reduce((s, p) => s + p.amount, 0);

  const showAmount  = refundType === 'full' || refundType === 'partial' || refundType === 'payment_only';
  const showCredits = refundType === 'full' || refundType === 'partial' || refundType === 'credit_only';

  function reset() {
    setRefundType('partial'); setReasonCode('administrative_error');
    setRefundAmount(''); setCreditQty('0'); setPaymentId(''); setNotes('');
  }

  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!invoice) return;

    const amount = parseFloat(refundAmount) || 0;
    const qty    = parseInt(creditQty, 10) || 0;

    if (refundType === 'full') {
      // full means all paid amount + all credits — backend handles the math
    } else if (refundType !== 'credit_only' && amount === 0) {
      toast({ title: 'Ange återbetalningsbelopp', variant: 'destructive' });
      return;
    } else if (refundType !== 'payment_only' && showCredits && amount === 0 && qty === 0) {
      toast({ title: 'Ange belopp eller antal krediter att återbetala', variant: 'destructive' });
      return;
    }

    if (showAmount && amount > paidAmount) {
      toast({ title: `Belopp (${formatCurrency(amount)}) överstiger betalt belopp (${formatCurrency(paidAmount)})`, variant: 'destructive' });
      return;
    }

    // process_refund requires credit_category whenever credit_qty > 0 — it
    // reverses credits into that exact category. Resolved from the invoice's
    // own package, not asked of the user (see usePackageLessonCategory above).
    if (showCredits && qty > 0 && !packageCategory.data) {
      toast({
        title: 'Kunde inte avgöra lektionskategori',
        description: invoice.student_package_id
          ? 'Kontrollera att paketet fortfarande finns kvar.'
          : 'Fakturan är inte kopplad till ett paket — krediter kan inte återföras.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await processRefund.mutateAsync({
        invoice_id:      invoice.id,
        refund_type:     refundType,
        reason_code:     reasonCode,
        refund_amount:   showAmount  ? amount : undefined,
        credit_qty:      showCredits ? qty    : undefined,
        credit_category: showCredits && qty > 0 ? packageCategory.data ?? undefined : undefined,
        payment_id:      paymentId || undefined,
        notes:           notes     || undefined,
      });
      toast({ title: 'Återbetalning registrerad', description: `${formatCurrency(amount)} återbetalas till eleven.` });
      handleClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Okänt fel';
      const label = msg.includes('OVER_REFUND')            ? 'Återbetalningsbeloppet överstiger tillgängligt belopp.'
                  : msg.includes('INVOICE_NOT_REFUNDABLE') ? 'Fakturan är inte i ett återbetalningsbart tillstånd.'
                  : msg.includes('PERIOD_LOCKED')          ? 'Bokföringsperioden är låst.'
                  : msg.includes('NO_PAYMENT')             ? 'Ingen bekräftad betalning hittades på fakturan.'
                  : msg;
      toast({ title: 'Återbetalning misslyckades', description: label, variant: 'destructive' });
    }
  }

  const canSubmit = Boolean(invoice) && !processRefund.isPending;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Återbetala — {invoice?.invoice_number ?? 'Faktura'}
          </DialogTitle>
        </DialogHeader>

        {invoice && (
          <div className="space-y-4">
            {/* Invoice summary */}
            <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Totalt fakturerat</p>
                <p className="font-mono font-semibold">{formatCurrency(invoice.total_amount, invoice.currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Betalt (bekräftat)</p>
                <p className="font-mono font-semibold text-green-600">{formatCurrency(paidAmount, invoice.currency)}</p>
              </div>
              {confirmedPayments.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">
                    {confirmedPayments.length} betalning{confirmedPayments.length !== 1 ? 'ar' : ''} · Senaste: {formatDate(confirmedPayments[0]?.paid_at ?? confirmedPayments[0]?.created_at)}
                  </p>
                </div>
              )}
            </div>

            {/* Refund type */}
            <div className="space-y-1.5">
              <Label>Återbetalningstyp <span className="text-destructive">*</span></Label>
              <Select value={refundType} onValueChange={v => setRefundType(v as RefundType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(REFUND_TYPE_LABELS) as [RefundType, string][]).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label>Orsak <span className="text-destructive">*</span></Label>
              <Select value={reasonCode} onValueChange={v => setReasonCode(v as RefundReasonCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(REASON_LABELS) as [RefundReasonCode, string][]).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount + credits */}
            <div className="grid grid-cols-2 gap-3">
              {showAmount && (
                <div className="space-y-1.5">
                  <Label>
                    Belopp (kr)
                    {refundType !== 'full' && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max={paidAmount}
                    step="0.01"
                    value={refundAmount}
                    onChange={e => setRefundAmount(e.target.value)}
                    placeholder={refundType === 'full' ? `${paidAmount.toFixed(2)}` : '0.00'}
                    disabled={refundType === 'full'}
                  />
                  {refundType === 'full' && (
                    <p className="text-xs text-muted-foreground">Hela betalda beloppet återbetalas.</p>
                  )}
                </div>
              )}
              {showCredits && (
                <div className="space-y-1.5">
                  <Label>Antal krediter</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={creditQty}
                    onChange={e => setCreditQty(e.target.value)}
                    disabled={refundType === 'full'}
                  />
                  {refundType === 'full' && (
                    <p className="text-xs text-muted-foreground">Alla utestående krediter återförs.</p>
                  )}
                </div>
              )}
            </div>

            {/* Payment selector */}
            {confirmedPayments.length > 1 && showAmount && (
              <div className="space-y-1.5">
                <Label>Specifik betalning (valfritt)</Label>
                <Select
                  value={paymentId || AUTO_PAYMENT_VALUE}
                  onValueChange={(v) => setPaymentId(v === AUTO_PAYMENT_VALUE ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Automatiskt val…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_PAYMENT_VALUE}>Automatiskt val</SelectItem>
                    {confirmedPayments.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {formatCurrency(p.amount, p.currency)} — {formatDate(p.paid_at ?? p.created_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Anteckning</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="resize-none h-20"
                placeholder="Beskriv skälet (visas i revisorsspår)…"
              />
            </div>

            {/* Warning */}
            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 dark:bg-amber-950/20 dark:border-amber-900/40">
              Återbetalningen är omedelbart oåterkallelig och skapar en kreditnotering i bokföringen.
            </p>

          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Avbryt</Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {processRefund.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RotateCcw className="w-4 h-4 mr-1.5" />
            }
            Bekräfta återbetalning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
