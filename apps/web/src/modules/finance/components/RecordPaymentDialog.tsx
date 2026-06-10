import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button,
  Separator,
  toast,
} from '@platform/ui';
import { useRecordPayment } from '../hooks/useFinance.js';
import { formatCurrency } from '../lib/financeUtils.js';
import type { PaymentMethod } from '../hooks/useFinance.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'swish',          label: 'Swish' },
  { value: 'bank_transfer',  label: 'Banköverföring' },
  { value: 'card',           label: 'Kort' },
  { value: 'manual',         label: 'Manuell' },
  { value: 'invoice_credit', label: 'Kreditfaktura' },
];

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  amount:             z.coerce.number().min(0.01, 'Belopp måste vara större än 0'),
  payment_method:     z.enum(['swish', 'bank_transfer', 'card', 'manual', 'invoice_credit']),
  provider_reference: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface RecordPaymentDialogProps {
  open:              boolean;
  onClose:           () => void;
  invoiceId:         string;
  outstandingAmount: number;
  currency:          string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecordPaymentDialog({
  open, onClose, invoiceId, outstandingAmount, currency,
}: RecordPaymentDialogProps) {
  const recordPayment = useRecordPayment();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount:             outstandingAmount > 0 ? outstandingAmount : 0,
      payment_method:     'swish',
      provider_reference: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        amount:             outstandingAmount > 0 ? outstandingAmount : 0,
        payment_method:     'swish',
        provider_reference: '',
      });
    }
  }, [open, outstandingAmount, form]);

  const watchedAmount = form.watch('amount');
  const isOverAmount  = Number(watchedAmount) > outstandingAmount && outstandingAmount > 0;

  async function handleSubmit(values: FormValues) {
    try {
      await recordPayment.mutateAsync({
        invoice_id:          invoiceId,
        amount:              values.amount,
        payment_method:      values.payment_method as PaymentMethod,
        provider_reference:  values.provider_reference || null,
      });
      toast({
        title:       'Betalning registrerad',
        description: `${formatCurrency(values.amount, currency)} har registrerats.`,
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Försök igen';
      toast({ title: 'Kunde inte registrera betalning', description: msg, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrera betalning</DialogTitle>
          <DialogDescription>
            Utestående: <strong>{formatCurrency(outstandingAmount, currency)}</strong>
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Belopp ({currency})</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0.01" {...field} />
                  </FormControl>
                  {isOverAmount && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Beloppet överstiger utestående saldo — är det korrekt?
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Betalningssätt</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="provider_reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Referens{' '}
                    <span className="text-muted-foreground font-normal">(valfri)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="T.ex. Swish-referens eller OCR-nummer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={recordPayment.isPending}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={recordPayment.isPending}>
                {recordPayment.isPending ? 'Registrerar...' : 'Registrera betalning'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
