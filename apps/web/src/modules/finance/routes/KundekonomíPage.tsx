import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { supabase } from '@core/api/supabase.js';
import { Skeleton } from '@platform/ui';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type KundeTab = 'ofakturerade_foretag' | 'ofakturerade_elever' | 'obetalda' | 'betalda';

const TABS: { key: KundeTab; label: string }[] = [
  { key: 'ofakturerade_foretag',  label: 'Ofakturerade företag' },
  { key: 'ofakturerade_elever',   label: 'Ofakturerade elever' },
  { key: 'obetalda',              label: 'Obetalda fakturor' },
  { key: 'betalda',               label: 'Betald faktura' },
];

// ─── Invoice row shape ────────────────────────────────────────────────────────

interface InvoiceRow {
  id:             string;
  invoice_number: string | null;
  status:         string;
  issued_at:      string | null;
  due_date:       string | null;
  created_at:     string;
  total_amount:   number;
  student_id:     string | null;
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

const PAID_STATUSES   = ['paid'];
const UNPAID_STATUSES = ['draft', 'issued', 'overdue', 'partially_paid'];

async function fetchInvoices(statuses: string[]): Promise<InvoiceRow[]> {
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, issued_at, due_date, created_at, total_amount, student_id')
    .in('status', statuses)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as InvoiceRow[];
}

// ─── Date formatter ───────────────────────────────────────────────────────────

const FMT_DATE = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short' });
const SEK      = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return FMT_DATE.format(new Date(iso)); } catch { return '—'; }
}

// ─── Ofakturerade företag tab ─────────────────────────────────────────────────

function OfaktureradeForetagTab() {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Summary bar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-6 text-xs text-muted-foreground bg-muted/10">
        <span>Artikelrader: <span className="font-semibold text-foreground">0</span></span>
        <span>Ofakturerat belopp: <span className="font-semibold text-foreground">0,00</span></span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/10">
            {['Kund', 'Avtal', 'Obetalda fakturor', 'Obetalt fakturabelopp', 'Ej fakturerade kontorad', 'Ofakturerat belopp', 'Insättning'].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
              Inga ofakturerade artikelrader för företagskunder.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Ofakturerade elever tab ──────────────────────────────────────────────────

function OfaktureradaElevTab() {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center gap-6 text-xs text-muted-foreground bg-muted/10">
        <span>Artikelrader: <span className="font-semibold text-foreground">0</span></span>
        <span>Ofakturerat belopp: <span className="font-semibold text-foreground">0,00</span></span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/10">
            {['Elev', 'Behörighet', 'Obetalda fakturor', 'Obetalt fakturabelopp', 'Ej fakturerade kontorad', 'Ofakturerat belopp'].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
              Inga ofakturerade artikelrader för elever.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Invoice table (shared for obetalda + betalda) ────────────────────────────

function InvoiceTable({ statuses }: { statuses: string[] }) {
  const { data, isLoading } = useQuery({
    queryKey: ['kundekonomi-invoices', statuses],
    queryFn:  () => fetchInvoices(statuses),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Count summary */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs text-muted-foreground bg-muted/10">
        Antal: <span className="font-semibold text-foreground">{rows.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Typ</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Fakturanummer</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Förfall</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Datum</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Kund</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Fakturabelopp</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Senaste betalningen</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Inga fakturor hittades.
                </td>
              </tr>
            ) : (
              rows.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">
                      {inv.corporate_customer_id ? 'Billecta-faktura' : 'Faktura'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/finance/invoices/${inv.id}`}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      {inv.invoice_number ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-sm">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-2.5 text-sm">
                    {fmtDate(inv.issued_at ?? inv.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 text-sm">
                      <User className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Elev</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums font-medium">
                    {SEK.format(inv.total_amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <InvoiceStatusBadge status={inv.status as never} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── KundekonomíPage ──────────────────────────────────────────────────────────

export function KundekonomíPage() {
  const [activeTab, setActiveTab] = useState<KundeTab>('ofakturerade_foretag');

  return (
    <div className="space-y-5">

      {/* Header */}
      <h1 className="text-base font-semibold text-foreground">Kundekonomi</h1>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
              t.key === activeTab
                ? 'text-blue-600 border-b-2 border-blue-500 -mb-px'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'ofakturerade_foretag'  && <OfaktureradeForetagTab />}
      {activeTab === 'ofakturerade_elever'   && <OfaktureradaElevTab />}
      {activeTab === 'obetalda' && <InvoiceTable statuses={UNPAID_STATUSES} />}
      {activeTab === 'betalda'  && <InvoiceTable statuses={PAID_STATUSES} />}

    </div>
  );
}
