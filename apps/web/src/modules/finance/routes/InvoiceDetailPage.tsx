import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ChevronLeft, FileText, CreditCard, Receipt, Info, Plus, Tag, RotateCcw, BookOpen, Loader2, Building2,
} from 'lucide-react';
import { useStudent } from '@modules/students/hooks/useStudents.js';
import { useCorporateCustomer } from '@modules/corporate/hooks/useCorporateCustomers.js';
import {
  Button, Badge, Skeleton,
  Card, CardContent, CardHeader, CardTitle,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useInvoice, useIssueInvoice, useVoidInvoice, usePaymentList, useAddInvoiceLine,
  type Payment,
} from '../hooks/useFinance.js';
import { usePostInvoiceJournalEntry, usePostPaymentJournalEntry } from '../hooks/useLedger.js';
import {
  useDiscounts, useApplyDiscount, useRedeemCoupon, type DiscountDefinition,
} from '../hooks/useDiscounts.js';
import { RecordPaymentDialog } from '../components/RecordPaymentDialog.js';
import { RefundDialog } from '../components/RefundDialog.js';
import { useInvoiceRefunds } from '../hooks/useRefunds.js';
import type { RefundStatus, RefundType, RefundReasonCode } from '../hooks/useRefunds.js';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge.js';
import { PaymentStatusBadge, PaymentMethodBadge } from '../components/PaymentStatusBadge.js';
import { formatCurrency, formatDate, formatDateTime } from '../lib/financeUtils.js';

// ─── Detail page skeleton ─────────────────────────────────────────────────────

function InvoiceDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="h-4 bg-muted rounded animate-pulse w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-8 bg-muted rounded animate-pulse" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="h-4 bg-muted rounded animate-pulse w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-6 bg-muted rounded animate-pulse" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Detail row primitive ─────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground w-44 shrink-0">{label}</span>
      <span className="text-sm text-foreground">{value ?? '—'}</span>
    </div>
  );
}

// ─── Amount summary row ───────────────────────────────────────────────────────

function AmountRow({
  label, amount, currency, className = '',
}: { label: string; amount: number; currency: string; className?: string }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${className}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-medium">{formatCurrency(amount, currency)}</span>
    </div>
  );
}

// ─── Void confirm dialog ──────────────────────────────────────────────────────

interface VoidDialogProps {
  open:      boolean;
  onClose:   () => void;
  onConfirm: () => void;
  isPending: boolean;
}

function VoidConfirmDialog({ open, onClose, onConfirm, isPending }: VoidDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Makulera faktura</DialogTitle>
          <DialogDescription>
            Är du säker på att du vill makulera denna faktura? Åtgärden kan inte ångras.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Avbryt</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Makulerar...' : 'Makulera faktura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add line item dialog (draft invoices only) ───────────────────────────────

const LINE_TYPES = ['lesson', 'package', 'fee', 'discount', 'tax', 'other'] as const;
const LINE_TYPE_LABELS: Record<typeof LINE_TYPES[number], string> = {
  lesson: 'Lektion', package: 'Paket', fee: 'Avgift', discount: 'Rabatt', tax: 'Skatt', other: 'Övrigt',
};
const VAT_RATES = [
  { value: 0.25, label: '25%' },
  { value: 0.12, label: '12%' },
  { value: 0.06, label: '6%' },
  { value: 0,    label: '0%' },
];

const addLineSchema = z.object({
  line_type:   z.enum(LINE_TYPES),
  description: z.string().min(1, 'Beskrivning krävs'),
  quantity:    z.coerce.number().min(0.001, 'Antal > 0'),
  unit_price:  z.coerce.number().min(0, 'Pris ≥ 0'),
  vat_rate:    z.coerce.number().min(0).max(1),
});

type AddLineValues = z.infer<typeof addLineSchema>;

interface AddLineDialogProps {
  open:      boolean;
  onClose:   () => void;
  invoiceId: string;
  currency:  string;
}

function AddLineDialog({ open, onClose, invoiceId, currency }: AddLineDialogProps) {
  const addLine = useAddInvoiceLine();

  const form = useForm<AddLineValues>({
    resolver: zodResolver(addLineSchema),
    defaultValues: { line_type: 'lesson', description: '', quantity: 1, unit_price: 0, vat_rate: 0.25 },
  });

  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  async function handleSubmit(values: AddLineValues) {
    try {
      await addLine.mutateAsync({ invoiceId, ...values });
      toast({ title: 'Rad tillagd' });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Försök igen';
      toast({ title: 'Kunde inte lägga till rad', description: msg, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till fakturarad</DialogTitle>
          <DialogDescription>Läggs till på utkastet. Totalsumman uppdateras automatiskt.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="line_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typ</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LINE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{LINE_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vat_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moms</FormLabel>
                    <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {VAT_RATES.map((r) => (
                          <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beskrivning</FormLabel>
                  <FormControl>
                    <Input placeholder="T.ex. Körlektion 45 min" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Antal</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.001" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>À-pris ({currency})</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={addLine.isPending}>
                Avbryt
              </Button>
              <Button type="submit" disabled={addLine.isPending}>
                {addLine.isPending ? 'Sparar...' : 'Lägg till rad'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Refund label maps ────────────────────────────────────────────────────────

const REFUND_TYPE_LABELS: Record<RefundType, string> = {
  full:         'Full återbetalning',
  partial:      'Delåterbetalning',
  credit_only:  'Kreditreversal',
  payment_only: 'Monetär återbetalning',
};

const REFUND_REASON_LABELS: Record<RefundReasonCode, string> = {
  duplicate_payment:    'Dubbel betalning',
  student_cancellation: 'Elevavbokning',
  administrative_error: 'Administrativt fel',
  service_failure:      'Tjänsten levererades ej',
  goodwill:             'Goodwill',
  fraud_prevention:     'Bedrägerihantering',
  partial_adjustment:   'Prisjustering',
};

const REFUND_STATUS_STYLES: Record<RefundStatus, string> = {
  pending:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled:  'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  pending:    'Väntar',
  processing: 'Behandlas',
  completed:  'Genomförd',
  failed:     'Misslyckad',
  cancelled:  'Avbruten',
};

// ─── Apply discount / redeem coupon dialog (draft invoices only) ──────────────

interface ApplyDiscountDialogProps {
  open:      boolean;
  onClose:   () => void;
  invoiceId: string;
  studentId: string;
}

function discountValueLabel(d: DiscountDefinition): string {
  if (d.discount_type === 'percentage') return `${(d.discount_value * 100).toFixed(0)}%`;
  return `${d.discount_value} ${d.currency}`;
}

function ApplyDiscountDialog({ open, onClose, invoiceId, studentId }: ApplyDiscountDialogProps) {
  const [mode,               setMode]               = useState<'discount' | 'coupon'>('discount');
  const [selectedDiscountId, setSelectedDiscountId] = useState('');
  const [couponCode,         setCouponCode]         = useState('');

  const { data: discountData, isLoading: discountsLoading } = useDiscounts({ is_active: true, per_page: 50 });
  const discounts = discountData?.data ?? [];

  const applyMutation  = useApplyDiscount(selectedDiscountId);
  const redeemMutation = useRedeemCoupon();

  useEffect(() => {
    if (!open) {
      setMode('discount');
      setSelectedDiscountId('');
      setCouponCode('');
    }
  }, [open]);

  async function handleApply() {
    if (!selectedDiscountId) return;
    try {
      await applyMutation.mutateAsync({ invoice_id: invoiceId });
      toast({ title: 'Rabatt applicerad' });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Försök igen';
      toast({ title: 'Kunde inte applicera rabatt', description: msg, variant: 'destructive' });
    }
  }

  async function handleRedeem() {
    if (!couponCode.trim()) return;
    try {
      await redeemMutation.mutateAsync({
        invoice_id:  invoiceId,
        coupon_code: couponCode.trim().toUpperCase(),
        student_id:  studentId,
      });
      toast({ title: 'Kupong inlöst' });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Försök igen';
      toast({ title: 'Kunde inte lösa in kupong', description: msg, variant: 'destructive' });
    }
  }

  const isBusy = applyMutation.isPending || redeemMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Applicera rabatt</DialogTitle>
          <DialogDescription>Välj en rabattdefinition eller lös in en kupongkod på fakturautkastet.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 border-b border-border pb-3">
          {(['discount', 'coupon'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                mode === m
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'discount' ? 'Välj rabatt' : 'Lös in kupong'}
            </button>
          ))}
        </div>

        {mode === 'discount' ? (
          <div className="py-1">
            {discountsLoading ? (
              <div className="h-9 bg-muted rounded animate-pulse" />
            ) : discounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga aktiva rabatter hittades.</p>
            ) : (
              <Select value={selectedDiscountId} onValueChange={setSelectedDiscountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj rabatt..." />
                </SelectTrigger>
                <SelectContent>
                  {discounts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} — {discountValueLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : (
          <div className="py-1">
            <Input
              placeholder="T.ex. SOMMAR25"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isBusy}>Avbryt</Button>
          {mode === 'discount' ? (
            <Button onClick={handleApply} disabled={!selectedDiscountId || isBusy}>
              {applyMutation.isPending ? 'Applicerar...' : 'Applicera rabatt'}
            </Button>
          ) : (
            <Button onClick={handleRedeem} disabled={!couponCode.trim() || isBusy}>
              {redeemMutation.isPending ? 'Löser in...' : 'Lös in kupong'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Payment row (with ledger-posting action) ─────────────────────────────────

const POSTABLE_PAYMENT_STATUSES = new Set(['confirmed', 'refunded', 'partially_refunded']);

function PaymentRow({ payment }: { payment: Payment }) {
  const [posted, setPosted] = useState(false);
  const postEntry = usePostPaymentJournalEntry();
  const canPost = POSTABLE_PAYMENT_STATUSES.has(payment.status);

  async function handlePost() {
    try {
      await postEntry.mutateAsync(payment.id);
      setPosted(true);
      toast({ title: 'Bokfört i huvudboken', description: 'Verifikat skapat för betalningen.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Försök igen';
      toast({ title: 'Kunde inte bokföra', description: msg, variant: 'destructive' });
    }
  }

  return (
    <TableRow>
      <TableCell>
        <PaymentMethodBadge method={payment.payment_method} />
      </TableCell>
      <TableCell>
        <PaymentStatusBadge status={payment.status} />
      </TableCell>
      <TableCell className="text-right text-sm font-mono font-medium">
        {formatCurrency(payment.amount, payment.currency)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDateTime(payment.paid_at ?? payment.created_at)}
      </TableCell>
      <TableCell className="text-right">
        {canPost && (
          <PermissionGate permission={Permissions.FINANCE_LEDGER_MANAGE}>
            {posted ? (
              <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">
                Bokförd
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={postEntry.isPending}
                onClick={() => void handlePost()}
              >
                {postEntry.isPending
                  ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  : <BookOpen className="w-3 h-3 mr-1" />}
                Bokför
              </Button>
            )}
          </PermissionGate>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── Student name with link ───────────────────────────────────────────────────

function StudentLink({ id }: { id: string }) {
  const { data: student, isLoading } = useStudent(id);
  if (isLoading) return <Skeleton className="h-4 w-28 inline-block" />;
  if (!student)  return <Link to={`/students/${id}`} className="text-primary hover:underline font-mono text-xs">{id.slice(0, 8)}…</Link>;
  return (
    <Link to={`/students/${id}`} className="text-primary hover:underline">
      {student.first_name} {student.last_name}
    </Link>
  );
}

// ─── Corporate billing recipient ───────────────────────────────────────────────
// When corporate_customer_id is set, the company — not the student — is who
// this invoice must actually be sent to. Shown as its own prominent card,
// not buried as a line inside "Kopplad till", since a school reading this
// page needs to know who to address the invoice to before anything else.

function CorporateBillingCard({ corporateCustomerId }: { corporateCustomerId: string }) {
  const { data: company, isLoading } = useCorporateCustomer(corporateCustomerId);

  if (isLoading) return <Skeleton className="h-24 w-full rounded-lg" />;
  if (!company)  return null;

  const addressLine = [company.address_line1, [company.postal_code, company.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');

  return (
    <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-300">
          <Building2 className="w-4 h-4" />
          Faktureras företag
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        <DetailRow
          label="Företag"
          value={<Link to={`/corporate/${company.id}`} className="text-primary hover:underline font-medium">{company.company_name}</Link>}
        />
        {company.org_number && <DetailRow label="Org.nr" value={company.org_number} />}
        {addressLine && <DetailRow label="Adress" value={addressLine} />}
        {company.invoice_text && (
          <div className="pt-2 mt-2 border-t border-border/60 text-xs text-muted-foreground whitespace-pre-wrap">
            {company.invoice_text}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function InvoiceDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [voidOpen,       setVoidOpen]       = useState(false);
  const [addLineOpen,    setAddLineOpen]    = useState(false);
  const [paymentOpen,    setPaymentOpen]    = useState(false);
  const [discountOpen,   setDiscountOpen]   = useState(false);
  const [refundOpen,     setRefundOpen]     = useState(false);
  const [invoicePosted,  setInvoicePosted]  = useState(false);

  const { data, isLoading, error } = useInvoice(id ?? null);
  const { data: paymentData }      = usePaymentList(
    id ? { invoice_id: id } : {},
  );
  const { data: refundData }       = useInvoiceRefunds(id ?? null);

  const issueMutation = useIssueInvoice();
  const voidMutation  = useVoidInvoice();
  const postInvoiceEntry = usePostInvoiceJournalEntry();

  if (isLoading) {
    return (
      <PageLayout>
        <PageHeader
          title="Laddar faktura..."
          breadcrumbs={[{ label: 'Hem' }, { label: 'Ekonomi' }, { label: 'Fakturor', href: '/finance/invoices' }]}
        />
        <PageContent>
          <InvoiceDetailSkeleton />
        </PageContent>
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <p className="text-sm text-muted-foreground">
            {error ? 'Det gick inte att hämta fakturan.' : 'Fakturan hittades inte.'}
          </p>
          <Button variant="outline" onClick={() => navigate('/finance/invoices')}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Tillbaka till fakturor
          </Button>
        </div>
      </PageLayout>
    );
  }

  const { invoice, line_items } = data;
  const payments      = paymentData?.data ?? [];
  const refunds       = refundData?.data ?? [];
  const invoiceTitle  = invoice.invoice_number ?? 'Fakturautkast';
  const isDraft       = invoice.status === 'draft';
  const canVoid       = invoice.status !== 'void' && invoice.status !== 'paid';
  const isPayable     = invoice.status === 'issued' || invoice.status === 'partially_paid' || invoice.status === 'overdue';
  const isRefundable  = invoice.status === 'paid' || invoice.status === 'partially_paid';
  const isPostable    = ['issued', 'paid', 'partially_paid', 'overdue'].includes(invoice.status);

  async function handlePostInvoice() {
    if (!id) return;
    try {
      await postInvoiceEntry.mutateAsync(id);
      setInvoicePosted(true);
      toast({ title: 'Bokfört i huvudboken', description: 'Verifikat skapat för fakturan.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Försök igen';
      toast({ title: 'Kunde inte bokföra', description: msg, variant: 'destructive' });
    }
  }

  function handleIssue() {
    if (!id) return;
    issueMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: 'Faktura skickad', description: 'Fakturan har fått ett fakturanummer och är nu utskickad.' });
      },
      onError: (e) => {
        const msg = e instanceof Error ? e.message : 'Försök igen';
        toast({ title: 'Kunde inte skicka faktura', description: msg, variant: 'destructive' });
      },
    });
  }

  function handleVoid() {
    if (!id) return;
    voidMutation.mutate({ id }, {
      onSuccess: () => {
        setVoidOpen(false);
        toast({ title: 'Faktura makulerad' });
      },
      onError: (e) => {
        const msg = e instanceof Error ? e.message : 'Försök igen';
        toast({ title: 'Kunde inte makulera faktura', description: msg, variant: 'destructive' });
      },
    });
  }

  return (
    <PermissionGate permission={Permissions.FINANCE_INVOICE_READ}>
    <PageLayout>
      <PageHeader
        title={invoiceTitle}
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi' },
          { label: 'Fakturor', href: '/finance/invoices' },
          { label: invoiceTitle },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {isPayable && (
              <PermissionGate permission={Permissions.FINANCE_PAYMENT_CREATE}>
                <Button
                  size="sm"
                  onClick={() => setPaymentOpen(true)}
                >
                  Registrera betalning
                </Button>
              </PermissionGate>
            )}
            {isRefundable && (
              <PermissionGate permission={Permissions.FINANCE_REFUND_CREATE}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRefundOpen(true)}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Återbetala
                </Button>
              </PermissionGate>
            )}
            {isDraft && (
              <PermissionGate permission={Permissions.FINANCE_DISCOUNT_ASSIGN}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDiscountOpen(true)}
                >
                  <Tag className="w-3.5 h-3.5 mr-1.5" />
                  Applicera rabatt
                </Button>
              </PermissionGate>
            )}
            {isDraft && (
              <PermissionGate permission={Permissions.FINANCE_INVOICE_APPROVE}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleIssue}
                  disabled={issueMutation.isPending || line_items.length === 0}
                  title={line_items.length === 0 ? 'Lägg till minst en rad innan du skickar' : undefined}
                >
                  {issueMutation.isPending ? 'Skickar...' : 'Skicka faktura'}
                </Button>
              </PermissionGate>
            )}
            {canVoid && (
              <PermissionGate permission={Permissions.FINANCE_INVOICE_VOID}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVoidOpen(true)}
                >
                  Makulera
                </Button>
              </PermissionGate>
            )}
            {isPostable && (
              <PermissionGate permission={Permissions.FINANCE_LEDGER_MANAGE}>
                {invoicePosted ? (
                  <Badge variant="outline" className="text-xs text-green-700 border-green-300">
                    Bokförd
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={postInvoiceEntry.isPending}
                    onClick={() => void handlePostInvoice()}
                  >
                    {postInvoiceEntry.isPending
                      ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      : <BookOpen className="w-3.5 h-3.5 mr-1.5" />}
                    Bokför faktura
                  </Button>
                )}
              </PermissionGate>
            )}
          </div>
        }
      />

      <PageContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Left column ────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Invoice header */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Fakturauppgifter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow
                  label="Status"
                  value={<InvoiceStatusBadge status={invoice.status} />}
                />
                <DetailRow
                  label="Fakturanummer"
                  value={
                    invoice.invoice_number
                      ? <span className="font-mono font-medium">{invoice.invoice_number}</span>
                      : <Badge variant="outline" className="text-muted-foreground">Ej utskickad</Badge>
                  }
                />
                <DetailRow label="Valuta"       value={invoice.currency} />
                <DetailRow label="Utskickad"    value={formatDateTime(invoice.issued_at)} />
                <DetailRow label="Förfallodatum" value={formatDate(invoice.due_date)} />
                <DetailRow label="Betald"        value={formatDateTime(invoice.paid_at)} />
                {invoice.void_at && (
                  <DetailRow
                    label="Makulerad"
                    value={
                      <div>
                        <span>{formatDateTime(invoice.void_at)}</span>
                        {invoice.void_reason && (
                          <p className="text-xs text-muted-foreground mt-0.5">{invoice.void_reason}</p>
                        )}
                      </div>
                    }
                  />
                )}
                {invoice.notes && (
                  <DetailRow label="Anteckning" value={invoice.notes} />
                )}
              </CardContent>
            </Card>

            {/* Line items */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-muted-foreground" />
                    Fakturarader
                  </CardTitle>
                  {isDraft && (
                    <PermissionGate permission={Permissions.FINANCE_INVOICE_CREATE}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setAddLineOpen(true)}
                      >
                        <Plus className="w-3 h-3" />
                        Lägg till rad
                      </Button>
                    </PermissionGate>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {line_items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-sm text-muted-foreground px-6">
                    <span>Inga rader på fakturan.</span>
                    {isDraft && (
                      <span className="text-xs">Lägg till minst en rad för att kunna skicka fakturan.</span>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Beskrivning</TableHead>
                        <TableHead className="text-right">Antal</TableHead>
                        <TableHead className="text-right">À-pris</TableHead>
                        <TableHead className="text-right">Moms</TableHead>
                        <TableHead className="text-right">Summa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {line_items.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="text-sm">{line.description}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {line.quantity}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {formatCurrency(line.unit_price, invoice.currency)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {(line.vat_rate * 100).toFixed(0)}%
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono font-medium">
                            {formatCurrency(line.line_total, invoice.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Payments */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  Betalningar
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {payments.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground px-6">
                    Inga betalningar registrerade.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Betalningssätt</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Belopp</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead className="text-right">Bokföring</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <PaymentRow key={payment.id} payment={payment} />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Refunds — shown only when refunds exist on this invoice */}
            {refunds.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-muted-foreground" />
                    Återbetalningar
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Typ</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Orsak</TableHead>
                        <TableHead className="text-right">Belopp</TableHead>
                        <TableHead>Datum</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {refunds.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">
                            {REFUND_TYPE_LABELS[r.refund_type] ?? r.refund_type}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${REFUND_STATUS_STYLES[r.refund_status] ?? ''}`}>
                              {REFUND_STATUS_LABELS[r.refund_status] ?? r.refund_status}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {REFUND_REASON_LABELS[r.reason_code] ?? r.reason_code}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {r.refund_amount > 0 && (
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                −{formatCurrency(r.refund_amount, invoice.currency)}
                              </span>
                            )}
                            {r.credit_quantity > 0 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {r.credit_quantity} kr.
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(r.processed_at ?? r.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right column ───────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Amount summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Belopp</CardTitle>
              </CardHeader>
              <CardContent>
                <AmountRow label="Netto" amount={invoice.subtotal_amount} currency={invoice.currency} />
                <AmountRow label="Moms"  amount={invoice.vat_amount}      currency={invoice.currency} />
                <Separator className="my-2" />
                <AmountRow
                  label="Totalt"
                  amount={invoice.total_amount}
                  currency={invoice.currency}
                  className="font-semibold"
                />
                {invoice.paid_amount > 0 && (
                  <>
                    <AmountRow label="Betalt" amount={invoice.paid_amount} currency={invoice.currency} />
                    <AmountRow
                      label="Kvar att betala"
                      amount={invoice.outstanding_amount}
                      currency={invoice.currency}
                      className={invoice.outstanding_amount > 0 ? 'text-amber-600 dark:text-amber-400' : ''}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {invoice.corporate_customer_id && (
              <CorporateBillingCard corporateCustomerId={invoice.corporate_customer_id} />
            )}

            {/* Student link */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  Kopplad till
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow
                  label={invoice.corporate_customer_id ? 'Elev (lektionen avser)' : 'Elev'}
                  value={<StudentLink id={invoice.student_id} />}
                />
                <DetailRow label="Skapad"     value={formatDateTime(invoice.created_at)} />
                <DetailRow label="Uppdaterad" value={formatDateTime(invoice.updated_at)} />
              </CardContent>
            </Card>

          </div>
        </div>
      </PageContent>

      <VoidConfirmDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={handleVoid}
        isPending={voidMutation.isPending}
      />

      {isDraft && id && (
        <AddLineDialog
          open={addLineOpen}
          onClose={() => setAddLineOpen(false)}
          invoiceId={id}
          currency={invoice.currency}
        />
      )}

      {isDraft && id && (
        <ApplyDiscountDialog
          open={discountOpen}
          onClose={() => setDiscountOpen(false)}
          invoiceId={id}
          studentId={invoice.student_id}
        />
      )}

      {isPayable && id && (
        <RecordPaymentDialog
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          invoiceId={id}
          outstandingAmount={invoice.outstanding_amount}
          currency={invoice.currency}
        />
      )}

      {isRefundable && (
        <RefundDialog
          invoice={invoice}
          payments={payments}
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
        />
      )}
    </PageLayout>
    </PermissionGate>
  );
}
