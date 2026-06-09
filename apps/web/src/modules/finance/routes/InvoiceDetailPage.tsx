import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, FileText, CreditCard, Receipt, Info,
} from 'lucide-react';
import {
  Button, Badge,
  Card, CardContent, CardHeader, CardTitle,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
  Separator,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useInvoice, useIssueInvoice, useVoidInvoice, usePaymentList } from '../hooks/useFinance.js';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge.js';
import { PaymentStatusBadge, PaymentMethodBadge } from '../components/PaymentStatusBadge.js';
import { formatCurrency, formatDate, formatDateTime } from '../lib/financeUtils.js';

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export function InvoiceDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [voidOpen, setVoidOpen] = useState(false);

  const { data, isLoading, error } = useInvoice(id ?? null);
  const { data: paymentData }      = usePaymentList(
    id ? { invoice_id: id } : {},
  );

  const issueMutation = useIssueInvoice();
  const voidMutation  = useVoidInvoice();

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-32 text-muted-foreground text-sm">
          Laddar faktura...
        </div>
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
  const payments = paymentData?.data ?? [];
  const invoiceTitle = invoice.invoice_number ?? 'Fakturautkast';
  const isDraft   = invoice.status === 'draft';
  const canVoid   = invoice.status !== 'void' && invoice.status !== 'paid';

  function handleIssue() {
    if (!id) return;
    issueMutation.mutate(id);
  }

  function handleVoid() {
    if (!id) return;
    voidMutation.mutate({ id }, { onSuccess: () => setVoidOpen(false) });
  }

  return (
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
            {isDraft && (
              <PermissionGate permission={Permissions.FINANCE_INVOICE_UPDATE}>
                <Button
                  size="sm"
                  onClick={handleIssue}
                  disabled={issueMutation.isPending}
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
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-muted-foreground" />
                  Fakturarader
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {line_items.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground px-6">
                    Inga rader på fakturan.
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right column ───────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Amount summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Belopp</CardTitle>
              </CardHeader>
              <CardContent>
                <AmountRow label="Netto"      amount={invoice.subtotal_amount}   currency={invoice.currency} />
                <AmountRow label="Moms (25%)" amount={invoice.vat_amount}        currency={invoice.currency} />
                <Separator className="my-2" />
                <AmountRow
                  label="Totalt"
                  amount={invoice.total_amount}
                  currency={invoice.currency}
                  className="font-semibold"
                />
                {invoice.paid_amount > 0 && (
                  <>
                    <AmountRow label="Betalt"     amount={invoice.paid_amount}        currency={invoice.currency} />
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
                  label="Elev"
                  value={
                    <Link
                      to={`/students/${invoice.student_id}`}
                      className="text-primary hover:underline font-mono text-xs"
                    >
                      {invoice.student_id.slice(0, 8)}…
                    </Link>
                  }
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
    </PageLayout>
  );
}
