import { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import {
  Button, Label, Input, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  toast,
} from '@platform/ui';
import type { Invoice, Payment } from '@platform/types';
import { formatCurrency, formatDate } from '../lib/financeUtils.js';
import { useProcessRefund, type RefundType, type RefundReasonCode } from '../hooks/useRefunds.js';

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
  invoice:  Pick<Invoice, 'id' | 'invoice_number' | 'total_amount' | 'outstanding_amount' | 'student_id' | 'currency'> | null;
  payments: Payment[];
  open:     boolean;
  onClose:  () => void;
}

export function RefundDialog({ invoice, payments, open, onClose }: Props) {
  const processRefund = useProcessRefund();

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

    try {
      await processRefund.mutateAsync({
        invoice_id:     invoice.id,
        refund_type:    refundType,
        reason_code:    reasonCode,
        refund_amount:  showAmount  ? amount : undefined,
        credit_qty:     showCredits ? qty    : undefined,
        payment_id:     paymentId || undefined,
        notes:          notes     || undefined,
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
                <Select value={paymentId} onValueChange={setPaymentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Automatiskt val…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Automatiskt val</SelectItem>
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
