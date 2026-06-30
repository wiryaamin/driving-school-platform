import { useState } from 'react';
import {
  AlertTriangle,
  ChartBar,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Plus,
  RefreshCcw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useRevenueReport,
  useVatReport,
  useAgingReport,
  useWalletLiabilityReport,
  useOutstandingReport,
  useExportRuns,
  useChartOfAccounts,
  useStartExportRun,
  useUpsertChartEntry,
  type RevenuePeriodRow,
  type AgingBucket,
  type OutstandingInvoice,
  type AccountingExportRun,
  type ChartOfAccountEntry,
  type ExportRunFormat,
} from '../hooks/useFinancialReports.js';
import { formatCurrency, formatDate } from '../lib/financeUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEK = (n: number | null | undefined) =>
  n == null ? '–' : formatCurrency(n, 'SEK');

function today()      { return new Date().toISOString().slice(0, 10); }
function monthStart() { return today().slice(0, 8) + '01'; }

function ExportStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Väntar',     cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    running:   { label: 'Kör',        cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
    completed: { label: 'Klar',       cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
    failed:    { label: 'Misslyckad', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function pct(a: number, b: number) {
  if (!b) return '–';
  return `${((a / b) * 100).toFixed(1)} %`;
}

// ─── Revenue tab ─────────────────────────────────────────────────────────────

function RevenueTab() {
  const { data: rows = [], isLoading, refetch } = useRevenueReport();

  const totalInvoiced    = rows.reduce((s, r) => s + (r.total_invoiced    ?? 0), 0);
  const totalPaid        = rows.reduce((s, r) => s + (r.total_paid        ?? 0), 0);
  const totalOutstanding = rows.reduce((s, r) => s + (r.total_outstanding ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Intäkter per räkenskapsperiod.</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
          Uppdatera
        </Button>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total fakturerat</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold font-mono">{isLoading ? '…' : SEK(totalInvoiced)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total betalt</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold font-mono text-green-600">{isLoading ? '…' : SEK(totalPaid)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Utestående</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold font-mono text-amber-600">{isLoading ? '…' : SEK(totalOutstanding)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-11 bg-muted rounded animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <TrendingUp className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Ingen intäktsdata</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Period</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Datum</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Fakturor</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Fakturerat</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Betalt</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Utestående</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Betalkvot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row: RevenuePeriodRow, i) => (
                    <tr key={row.period_id ?? i} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">{row.period_name ?? '–'}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {formatDate(row.period_start)} – {formatDate(row.period_end)}
                      </td>
                      <td className="px-4 py-2.5 text-right">{row.invoice_count}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{SEK(row.total_invoiced)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-green-600">{SEK(row.total_paid)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-600">{SEK(row.total_outstanding)}</td>
                      <td className="px-4 py-2.5 text-right text-xs">{pct(row.total_paid, row.total_invoiced)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── VAT tab ──────────────────────────────────────────────────────────────────

function VatTab() {
  const [from, setFrom] = useState(monthStart());
  const [to,   setTo]   = useState(today());
  const [query, setQuery] = useState({ from: monthStart(), to: today() });

  const { data: rows = [], isLoading } = useVatReport(query.from, query.to);

  const totalOutput = rows.reduce((s, r) => s + (r.output_vat ?? 0), 0);
  const totalInput  = rows.reduce((s, r) => s + (r.input_vat  ?? 0), 0);
  const netVat      = totalOutput - totalInput;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Från</Label>
          <Input type="date" className="w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Till</Label>
          <Input type="date" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => setQuery({ from, to })}>
          Hämta rapport
        </Button>
      </div>

      {/* VAT summary bar */}
      {!isLoading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Utgående moms</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold font-mono">{SEK(totalOutput)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Ingående moms</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold font-mono">{SEK(totalInput)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Nettomoms (att betala)</CardTitle></CardHeader>
            <CardContent>
              <p className={`text-xl font-bold font-mono ${netVat > 0 ? 'text-red-600' : 'text-green-600'}`}>{SEK(netVat)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">{[1,2,3].map((i) => <div key={i} className="h-11 bg-muted rounded animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <ChartBar className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Välj period och hämta rapport</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Momssats</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Utgående moms</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Ingående moms</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Nettomoms</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-right font-mono">{Math.round((row.vat_rate ?? 0) * 100)} %</td>
                      <td className="px-4 py-2.5 text-right font-mono">{SEK(row.output_vat)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{SEK(row.input_vat)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold ${(row.net_vat ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{SEK(row.net_vat)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/10">
                  <tr>
                    <td className="px-4 py-2 text-right font-semibold">Totalt</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">{SEK(totalOutput)}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">{SEK(totalInput)}</td>
                    <td className={`px-4 py-2 text-right font-mono font-bold ${netVat > 0 ? 'text-red-600' : 'text-green-600'}`}>{SEK(netVat)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Aging tab ────────────────────────────────────────────────────────────────

function AgingTab() {
  const { data: buckets = [], isLoading, refetch } = useAgingReport();
  const [showOutstanding, setShowOutstanding] = useState(false);
  const { data: outstanding = [], isLoading: outLoading } = useOutstandingReport();

  const totalOutstanding = buckets.reduce((s, b) => s + (b.total_outstanding ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Åldersanalys av utestående fakturor.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowOutstanding(!showOutstanding)}>
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            {showOutstanding ? 'Dölj fakturor' : 'Visa fakturor'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            <RefreshCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Aging bar chart (visual) */}
      {!isLoading && buckets.length > 0 && (
        <div className="grid gap-2">
          {buckets.map((b: AgingBucket) => {
            const widthPct = totalOutstanding > 0 ? (b.total_outstanding / totalOutstanding) * 100 : 0;
            const isOverdue = b.bucket !== 'Ej förfallen' && b.bucket !== '0-30 dagar';
            return (
              <div key={b.bucket} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-xs text-muted-foreground text-right">{b.bucket}</span>
                <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isOverdue ? 'bg-red-400' : 'bg-green-400'}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-xs">{SEK(b.total_outstanding)}</span>
                <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">{b.invoice_count} st</span>
              </div>
            );
          })}
        </div>
      )}

      {isLoading && <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>}

      {/* Outstanding invoices detail */}
      {showOutstanding && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Utestående fakturor ({outstanding.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {outLoading ? (
              <div className="px-4 py-2 space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : outstanding.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Inga utestående fakturor.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Nr</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Kund</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Status</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Utestående</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Förfallodatum</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Dagar sen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {outstanding.map((inv: OutstandingInvoice) => (
                      <tr key={inv.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono text-xs">{inv.invoice_number ?? inv.id.slice(0, 8)}</td>
                        <td className="px-3 py-2 text-xs">{inv.customer_name ?? '–'}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{SEK(inv.outstanding)}</td>
                        <td className="px-3 py-2 text-right text-xs">{inv.due_date ? formatDate(inv.due_date) : '–'}</td>
                        <td className={`px-3 py-2 text-right text-xs font-semibold ${(inv.days_overdue ?? 0) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {inv.days_overdue != null ? `${inv.days_overdue} d` : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Wallet liability tab ─────────────────────────────────────────────────────

function WalletTab() {
  const { data: rows = [], isLoading, refetch } = useWalletLiabilityReport();

  const totalLiability = rows.reduce((s, r) => s + (r.total_liability ?? 0), 0);
  const totalCredits   = rows.reduce((s, r) => s + (r.total_credits   ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Outnyttjat saldo per lektionskategori (skuld mot elever).</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          <RefreshCcw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total skuld</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold font-mono text-red-600">{isLoading ? '…' : SEK(totalLiability)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Totalt kreditvärde (lektioner)</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{isLoading ? '…' : totalCredits}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <Wallet className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Ingen plånboksskuld</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Kategori</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Elever</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Krediter</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Skuld (kr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5">{row.lesson_category}</td>
                      <td className="px-4 py-2.5 text-right">{row.student_count}</td>
                      <td className="px-4 py-2.5 text-right">{row.total_credits}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-600">{SEK(row.total_liability)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/10">
                  <tr>
                    <td className="px-4 py-2 font-semibold" colSpan={2}>Totalt</td>
                    <td className="px-4 py-2 text-right font-semibold">{totalCredits}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-red-600">{SEK(totalLiability)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Export runs tab ──────────────────────────────────────────────────────────

function StartExportDialog({ onClose }: { onClose: () => void }) {
  const start = useStartExportRun();
  const [form, setForm] = useState({
    format:    'sie4' as ExportRunFormat,
    from_date: monthStart(),
    to_date:   today(),
  });

  async function handleStart() {
    if (!form.format || !form.from_date || !form.to_date) return;
    try {
      await start.mutateAsync(form);
      toast({ title: 'Exportkörning startad', description: `Format: ${form.format.toUpperCase()}` });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Starta exportkörning</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Format</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.format}
              onChange={(e) => setForm((f) => ({ ...f, format: e.target.value as ExportRunFormat }))}
            >
              <option value="sie4">SIE4 (bokföring)</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="xlsx">Excel (XLSX)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Från</Label>
              <Input type="date" value={form.from_date} onChange={(e) => setForm((f) => ({ ...f, from_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Till</Label>
              <Input type="date" value={form.to_date} onChange={(e) => setForm((f) => ({ ...f, to_date: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={!form.format || !form.from_date || !form.to_date || start.isPending} onClick={() => void handleStart()}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Starta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportsTab() {
  const [page,     setPage]     = useState(1);
  const [starting, setStarting] = useState(false);
  const { data, isLoading, refetch } = useExportRuns(page);
  const runs  = data?.data ?? [];
  const meta  = data?.meta;

  const completedCount = runs.filter((r) => r.status === 'completed').length;
  const pendingCount   = runs.filter((r) => r.status === 'pending' || r.status === 'running').length;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
              Uppdatera
            </Button>
            {meta && <span className="text-xs text-muted-foreground">{meta.total} körningar totalt</span>}
          </div>
          <PermissionGate permission={Permissions.FINANCE_EXPORT_RUN}>
            <Button size="sm" onClick={() => setStarting(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Ny exportkörning
            </Button>
          </PermissionGate>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Körningar totalt</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{isLoading ? '…' : (meta?.total ?? 0)}</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Klara</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{isLoading ? '…' : completedCount}</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Pågående</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-amber-600">{isLoading ? '…' : pendingCount}</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 py-3 space-y-2">{[1,2,3].map((i) => <div key={i} className="h-11 bg-muted rounded animate-pulse" />)}</div>
            ) : runs.length === 0 ? (
              <div className="py-10 text-center space-y-1">
                <Download className="w-7 h-7 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">Inga exportkörningar</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Format</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Period</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Poster</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Startad</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Klar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {runs.map((run: AccountingExportRun) => (
                      <tr key={run.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-xs font-mono uppercase">{run.format}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {formatDate(run.from_date)} – {formatDate(run.to_date)}
                        </td>
                        <td className="px-4 py-2.5"><ExportStatusBadge status={run.status} /></td>
                        <td className="px-4 py-2.5 text-right">{run.entry_count ?? '–'}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{run.started_at ? formatDate(run.started_at) : '–'}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{run.completed_at ? formatDate(run.completed_at) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {meta && meta.total > 25 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Sida {page}</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Föregående</Button>
              <Button size="sm" variant="outline" disabled={runs.length < 25} onClick={() => setPage((p) => p + 1)}>Nästa</Button>
            </div>
          </div>
        )}
      </div>
      {starting && <StartExportDialog onClose={() => setStarting(false)} />}
    </>
  );
}

// ─── Chart of accounts tab ────────────────────────────────────────────────────

function EditChartEntrySheet({ entry, onClose }: { entry: ChartOfAccountEntry; onClose: () => void }) {
  const upsert = useUpsertChartEntry();
  const [debit,  setDebit]  = useState(entry.account_debit);
  const [credit, setCredit] = useState(entry.account_credit);
  const [desc,   setDesc]   = useState(entry.description ?? '');

  async function handleSave() {
    try {
      await upsert.mutateAsync({
        event_type:    entry.event_type,
        account_debit: debit.trim(),
        account_credit: credit.trim(),
        description:   desc.trim() || undefined,
      });
      toast({ title: 'Kontoplan uppdaterad' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Redigera kontomappning</DialogTitle></DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Händelsetyp</Label>
            <p className="font-mono text-sm bg-muted/40 rounded-md px-3 py-2">{entry.event_type}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Debetkonto (BAS)</Label>
            <Input value={debit} onChange={(e) => setDebit(e.target.value)} placeholder="t.ex. 1510" />
          </div>
          <div className="space-y-1.5">
            <Label>Kreditkonto (BAS)</Label>
            <Input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="t.ex. 3001" />
          </div>
          <div className="space-y-1.5">
            <Label>Beskrivning (valfri)</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button disabled={!debit || !credit || upsert.isPending} onClick={() => void handleSave()}>Spara</Button>
            <Button variant="outline" onClick={onClose}>Avbryt</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChartTab() {
  const { data: entries = [], isLoading } = useChartOfAccounts();
  const [editing, setEditing] = useState<ChartOfAccountEntry | null>(null);

  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          BAS-kontomappningar för automatisk journalföring av affärshändelser.
        </p>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 py-3 space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : entries.length === 0 ? (
              <div className="py-10 text-center space-y-1">
                <BookOpen className="w-7 h-7 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">Kontoplan saknas</p>
                <p className="text-xs text-muted-foreground">Använd Inställningar → Frödata för att initiera BAS-kontoplanen.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Händelsetyp</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Debet</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Kredit</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Beskrivning</th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entries.map((entry: ChartOfAccountEntry) => (
                      <tr key={entry.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-mono text-xs">{entry.event_type}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">{entry.account_debit}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">{entry.account_credit}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{entry.description ?? '–'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <PermissionGate permission={Permissions.FINANCE_EXPORT_RUN}>
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditing(entry)}>
                              Redigera
                            </Button>
                          </PermissionGate>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
          <p>BAS 2020-kontoplanen är den rekommenderade standarden för svenska trafikskolor.</p>
        </div>
      </div>
      {editing && <EditChartEntrySheet entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ─── Warning banner for overdue ───────────────────────────────────────────────

function OverdueBanner() {
  const { data: outstanding = [] } = useOutstandingReport();
  const overdueCount = outstanding.filter((inv) => (inv.days_overdue ?? 0) > 0).length;

  if (overdueCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 text-sm">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <p className="text-amber-800 dark:text-amber-300">
        <strong>{overdueCount}</strong> förfallna fakturor med utestående belopp.
        Gå till fliken <strong>Åldersanalys</strong> för detaljer.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FinancialReportsPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Finansiella rapporter"
        description="Intäktsrapporter, momsöversikt, åldersanalys, exportkörningar och kontoplan"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Finansiella rapporter' },
        ]}
      />

      <PageContent>
        <PermissionGate permission={Permissions.FINANCE_REPORT_READ}>
          <div className="space-y-4">
            <OverdueBanner />

            <Tabs defaultValue="revenue">
              <TabsList className="flex-wrap">
                <TabsTrigger value="revenue">
                  <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                  Intäkter
                </TabsTrigger>
                <TabsTrigger value="vat">
                  <ChartBar className="w-3.5 h-3.5 mr-1.5" />
                  Moms
                </TabsTrigger>
                <TabsTrigger value="aging">
                  <Clock className="w-3.5 h-3.5 mr-1.5" />
                  Åldersanalys
                </TabsTrigger>
                <TabsTrigger value="wallet">
                  <Wallet className="w-3.5 h-3.5 mr-1.5" />
                  Plånboksskuld
                </TabsTrigger>
                <TabsTrigger value="exports">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Exportkörningar
                </TabsTrigger>
                <TabsTrigger value="chart">
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                  Kontoplan
                </TabsTrigger>
              </TabsList>

              <TabsContent value="revenue" className="mt-5"><RevenueTab /></TabsContent>
              <TabsContent value="vat"     className="mt-5"><VatTab /></TabsContent>
              <TabsContent value="aging"   className="mt-5"><AgingTab /></TabsContent>
              <TabsContent value="wallet"  className="mt-5"><WalletTab /></TabsContent>
              <TabsContent value="exports" className="mt-5"><ExportsTab /></TabsContent>
              <TabsContent value="chart"   className="mt-5"><ChartTab /></TabsContent>
            </Tabs>
          </div>
        </PermissionGate>
      </PageContent>
    </PageLayout>
  );
}
