import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  FileText,
  Lock,
  Plus,
  ShieldCheck,
  XCircle,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useAgiExports,
  useAgiExport,
  useAgiExportLines,
  useVerifyAgiIntegrity,
  useAuditExports,
  useComplianceDashboard,
  useGenerateAgiExport,
  useLockAgiExport,
  useGenerateAuditExport,
  type AgiExport,
  type AgiExportStatus,
  type AuditExportType,
  type RegulatoryAuditExport,
} from '../hooks/useRegulatoryExports.js';
import { usePayrollRuns } from '../hooks/usePayroll.js';
import { useFinancialPeriods } from '../hooks/useReconciliation.js';
import { formatCurrency, formatDate, formatDateTime } from '../lib/financeUtils.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const SEK = (n: number) => formatCurrency(n, 'SEK');

function AgiStatusBadge({ status }: { status: AgiExportStatus }) {
  const map: Record<AgiExportStatus, { label: string; cls: string }> = {
    draft:     { label: 'Utkast',     cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    submitted: { label: 'Inlämnad',   cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
    locked:    { label: 'Låst',       cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

const AUDIT_TYPE_LABELS: Record<string, string> = {
  vat:     'Moms',
  income:  'Inkomst',
  payroll: 'Lön',
  full:    'Fullständig',
};
function auditTypeLabel(t: string): string {
  return AUDIT_TYPE_LABELS[t] ?? t;
}

function HashBadge({ hash }: { hash: string | null }) {
  if (!hash) return <span className="text-xs text-muted-foreground">–</span>;
  return (
    <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px] inline-block">
      {hash.slice(0, 12)}…
    </span>
  );
}

// ─── AGI Detail Sheet ─────────────────────────────────────────────────────────

function VerifySection({ agiId }: { agiId: string }) {
  const [run, setRun] = useState(false);
  const { data, isLoading, refetch } = useVerifyAgiIntegrity(run ? agiId : null);

  async function doVerify() {
    setRun(true);
    if (run) void refetch();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SHA-256 integritet</p>
        <Button size="sm" variant="outline" disabled={isLoading} onClick={() => void doVerify()}>
          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
          Verifiera
        </Button>
      </div>
      {data && (
        <div className={`rounded-lg border p-3 text-sm ${data.is_valid ? 'border-green-300 bg-green-50 dark:bg-green-950/20' : 'border-red-300 bg-red-50 dark:bg-red-950/20'}`}>
          <div className="flex items-center gap-2 font-medium">
            {data.is_valid
              ? <CheckCircle2 className="w-4 h-4 text-green-600" />
              : <XCircle className="w-4 h-4 text-red-600" />}
            {data.is_valid ? 'Hash stämmer' : 'Hash-avvikelse'}
          </div>
          {!data.is_valid && data.mismatch_reason && (
            <p className="mt-1 text-xs text-red-700 dark:text-red-400">{data.mismatch_reason}</p>
          )}
          <p className="mt-1 font-mono text-[10px] text-muted-foreground break-all">{data.computed_hash}</p>
        </div>
      )}
    </div>
  );
}

function LockAgiDialog({ agi, onClose }: { agi: AgiExport; onClose: () => void }) {
  const lock    = useLockAgiExport(agi.id);
  const [receipt, setReceipt] = useState('');

  async function handleLock() {
    try {
      await lock.mutateAsync({ receipt: receipt.trim() || undefined });
      toast({ title: 'AGI-export låst', description: 'Deklarationen är markerad som inlämnad och kan inte ändras.' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Lås AGI-export</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-amber-800 dark:text-amber-300">
              Låsning är oåterkalleligt. AGI-exporten markeras som inlämnad till Skatteverket.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Kvittoreferens från Skatteverket (valfri)</Label>
            <Input
              placeholder="t.ex. AGI-2024-01-XXXX"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button variant="destructive" disabled={lock.isPending} onClick={() => void handleLock()}>
            <Lock className="w-3.5 h-3.5 mr-1.5" />
            Lås export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgiDetailSheet({ agiId, onClose }: { agiId: string; onClose: () => void }) {
  const { data: agi, isLoading } = useAgiExport(agiId);
  const { data: lines = [], isLoading: linesLoading } = useAgiExportLines(agiId);
  const [locking, setLocking] = useState(false);

  return (
    <>
      <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="w-[640px] sm:w-[700px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>AGI-export detaljer</SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="mt-6 space-y-3">{[1,2,3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : agi ? (
            <div className="mt-4 space-y-5">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Deklarationsmånad</p>
                  <p className="text-xl font-bold">{agi.declaration_month?.slice(0, 7) ?? '–'}</p>
                </div>
                <AgiStatusBadge status={agi.status} />
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Anställda</p>
                  <p className="text-2xl font-bold">{agi.total_employees}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Bruttolön totalt</p>
                  <p className="text-xl font-bold font-mono">{SEK(agi.total_gross)}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Källskatt totalt</p>
                  <p className="text-xl font-bold font-mono">{SEK(agi.total_tax)}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Arbetsgivaravgifter</p>
                  <p className="text-xl font-bold font-mono">{SEK(agi.total_employer_contributions)}</p>
                </div>
              </div>

              {/* Metadata */}
              <div className="text-xs space-y-1 text-muted-foreground border-t pt-3">
                <div className="flex justify-between"><span>SHA-256</span><HashBadge hash={agi.sha256_hash} /></div>
                {agi.locked_at && <div className="flex justify-between"><span>Låst</span><span>{formatDateTime(agi.locked_at)}</span></div>}
                {agi.receipt   && <div className="flex justify-between"><span>Kvitto</span><span className="font-mono">{agi.receipt}</span></div>}
                {agi.notes     && <div className="flex justify-between"><span>Anteckningar</span><span>{agi.notes}</span></div>}
              </div>

              {/* Integrity verification */}
              <VerifySection agiId={agiId} />

              {/* Employee lines */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Anställningsrader ({lines.length})</p>
                {linesLoading ? (
                  <div className="h-20 bg-muted rounded animate-pulse" />
                ) : lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Inga rader</p>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Namn</th>
                          <th className="text-right px-3 py-2 font-medium">Brutto</th>
                          <th className="text-right px-3 py-2 font-medium">Skatt</th>
                          <th className="text-right px-3 py-2 font-medium">Arbetsgivare</th>
                          <th className="text-right px-3 py-2 font-medium">Netto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {lines.map((line) => (
                          <tr key={line.id} className="hover:bg-muted/20">
                            <td className="px-3 py-1.5">
                              {line.first_name} {line.last_name}
                              {line.personnummer && <span className="ml-1 text-muted-foreground">({line.personnummer})</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">{SEK(line.gross_salary)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{SEK(line.income_tax_withheld)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{SEK(line.employer_contributions)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{SEK(line.net_salary)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Lock action */}
              {agi.status !== 'locked' && (
                <PermissionGate permission={Permissions.FINANCE_AGI_MANAGE}>
                  <Button variant="destructive" className="w-full" onClick={() => setLocking(true)}>
                    <Lock className="w-3.5 h-3.5 mr-1.5" />
                    Markera som inlämnad (lås)
                  </Button>
                </PermissionGate>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
      {locking && agi && <LockAgiDialog agi={agi} onClose={() => setLocking(false)} />}
    </>
  );
}

// ─── Generate AGI dialog ──────────────────────────────────────────────────────

function GenerateAgiDialog({ onClose }: { onClose: () => void }) {
  const generate = useGenerateAgiExport();
  const { data: runsData, isLoading: runsLoading } = usePayrollRuns();
  const runs = runsData ?? [];
  const postedRuns = runs.filter((r) => r.status === 'posted');

  const [payrollRunId, setPayrollRunId] = useState('');
  const [notes,        setNotes]        = useState('');

  async function handleGenerate() {
    if (!payrollRunId) return;
    try {
      const result = await generate.mutateAsync({ payroll_run_id: payrollRunId, notes: notes.trim() || undefined });
      toast({ title: 'AGI-export genererad', description: `Export-ID: ${result.id.slice(0, 8)}…` });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generera AGI-export</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <Label>Lönekörning</Label>
            {runsLoading ? (
              <div className="h-9 bg-muted rounded animate-pulse" />
            ) : (
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={payrollRunId}
                onChange={(e) => setPayrollRunId(e.target.value)}
              >
                <option value="">Välj lönekörning…</option>
                {postedRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.pay_period_start ?? r.id.slice(0, 8)} — {formatDate(r.pay_date ?? r.created_at)}
                  </option>
                ))}
              </select>
            )}
            {!runsLoading && postedRuns.length === 0 && (
              <p className="text-xs text-muted-foreground">Inga bokförda lönekörningar hittades.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Anteckningar (valfri)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={!payrollRunId || generate.isPending} onClick={() => void handleGenerate()}>
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Generera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AGI tab ──────────────────────────────────────────────────────────────────

function AgiTab() {
  const [statusFilter, setStatusFilter] = useState<AgiExportStatus | ''>('');
  const [generating,   setGenerating]   = useState(false);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);

  const { data, isLoading } = useAgiExports(
    statusFilter ? { status: statusFilter } : {},
  );
  const exports = data?.data ?? [];
  const total   = data?.total ?? 0;

  const draftCount  = exports.filter((e) => e.status === 'draft').length;
  const lockedCount = exports.filter((e) => e.status === 'locked').length;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AgiExportStatus | '')}
            >
              <option value="">Alla statusar</option>
              <option value="draft">Utkast</option>
              <option value="submitted">Inlämnad</option>
              <option value="locked">Låst</option>
            </select>
            {total > 0 && <span className="text-xs text-muted-foreground">{total} export{total !== 1 ? 'er' : ''}</span>}
          </div>
          <PermissionGate permission={Permissions.FINANCE_AGI_MANAGE}>
            <Button size="sm" onClick={() => setGenerating(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Ny AGI-export
            </Button>
          </PermissionGate>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Totalt</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{isLoading ? '…' : total}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Utkast</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-amber-600">{isLoading ? '…' : draftCount}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Låsta</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-green-600">{isLoading ? '…' : lockedCount}</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 py-3 space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : exports.length === 0 ? (
              <div className="py-12 text-center space-y-1">
                <FileText className="w-7 h-7 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">Inga AGI-exporter</p>
                <p className="text-xs text-muted-foreground">Generera från en bokförd lönekörning.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Deklarationsmånad</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Anst.</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Brutto</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Skatt</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">SHA-256</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Skapad</th>
                      <th className="w-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {exports.map((exp: AgiExport) => (
                      <tr
                        key={exp.id}
                        className="hover:bg-muted/20 cursor-pointer"
                        onClick={() => setSelectedId(exp.id)}
                      >
                        <td className="px-4 py-2.5 font-mono font-medium">{exp.declaration_month?.slice(0, 7) ?? '–'}</td>
                        <td className="px-4 py-2.5"><AgiStatusBadge status={exp.status} /></td>
                        <td className="px-4 py-2.5 text-right">{exp.total_employees}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{SEK(exp.total_gross)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{SEK(exp.total_tax)}</td>
                        <td className="px-4 py-2.5"><HashBadge hash={exp.sha256_hash} /></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(exp.created_at)}</td>
                        <td className="px-4 py-2.5"><ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {generating && <GenerateAgiDialog onClose={() => setGenerating(false)} />}
      {selectedId && <AgiDetailSheet agiId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}

// ─── Generate audit export dialog ─────────────────────────────────────────────

function GenerateAuditDialog({ onClose }: { onClose: () => void }) {
  const generate = useGenerateAuditExport();
  const { data: periods = [] } = useFinancialPeriods();

  const [periodId,    setPeriodId]    = useState('');
  const [exportType,  setExportType]  = useState<AuditExportType>('full');
  const [notes,       setNotes]       = useState('');

  async function handleGenerate() {
    if (!periodId) return;
    try {
      const result = await generate.mutateAsync({
        period_id:   periodId,
        export_type: exportType,
        notes:       notes.trim() || undefined,
      });
      toast({ title: 'Revisionsexport genererad', description: `Export-ID: ${result.id.slice(0, 8)}…` });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generera revisionsexport</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <Label>Räkenskapsperiod</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">Välj period…</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Exporttyp</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={exportType}
              onChange={(e) => setExportType(e.target.value as AuditExportType)}
            >
              <option value="full">Fullständig</option>
              <option value="vat">Moms (VAT)</option>
              <option value="income">Inkomst</option>
              <option value="payroll">Lön</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Anteckningar (valfri)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={!periodId || generate.isPending} onClick={() => void handleGenerate()}>
            <FileCheck className="w-3.5 h-3.5 mr-1.5" />
            Generera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Audit exports tab ────────────────────────────────────────────────────────

function AuditTab() {
  const [typeFilter, setTypeFilter] = useState<AuditExportType | ''>('');
  const [generating, setGenerating] = useState(false);

  const { data, isLoading } = useAuditExports(typeFilter ? { export_type: typeFilter } : {});
  const exports = data?.data ?? [];
  const total   = data?.total ?? 0;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as AuditExportType | '')}
            >
              <option value="">Alla typer</option>
              <option value="full">Fullständig</option>
              <option value="vat">Moms</option>
              <option value="income">Inkomst</option>
              <option value="payroll">Lön</option>
            </select>
            {total > 0 && <span className="text-xs text-muted-foreground">{total} export{total !== 1 ? 'er' : ''}</span>}
          </div>
          <PermissionGate permission={Permissions.FINANCE_AGI_MANAGE}>
            <Button size="sm" onClick={() => setGenerating(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Ny revisionsexport
            </Button>
          </PermissionGate>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 py-3 space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : exports.length === 0 ? (
              <div className="py-12 text-center space-y-1">
                <FileCheck className="w-7 h-7 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">Inga revisionsexporter</p>
                <p className="text-xs text-muted-foreground">Generera en export för revision eller myndighetsrapportering.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Datum</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Typ</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Storlek</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">SHA-256</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Skapad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {exports.map((exp: RegulatoryAuditExport) => (
                      <tr key={exp.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-mono">{formatDate(exp.export_date)}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-xs">{auditTypeLabel(exp.export_type)}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{exp.status}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                          {exp.payload_size_bytes != null ? `${(exp.payload_size_bytes / 1024).toFixed(1)} KB` : '–'}
                        </td>
                        <td className="px-4 py-2.5"><HashBadge hash={exp.sha256_hash} /></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(exp.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {generating && <GenerateAuditDialog onClose={() => setGenerating(false)} />}
    </>
  );
}

// ─── Compliance dashboard tab ─────────────────────────────────────────────────

function KpiTile({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${warn ? 'text-red-600' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ComplianceTab() {
  const { data: cmp, isLoading, refetch } = useComplianceDashboard();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Regulatorisk efterlevnadsstatus för organisationen.</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Uppdatera</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map((i) => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : cmp ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile label="Väntande lönekörningar" value={cmp.pending_payroll_runs ?? 0} warn={(cmp.pending_payroll_runs ?? 0) > 0} />
            <KpiTile label="Öppna momsperioder"      value={cmp.open_vat_periods      ?? 0} />
            <KpiTile label="Försenade deklarationer" value={cmp.overdue_declarations   ?? 0} warn={(cmp.overdue_declarations ?? 0) > 0} />
            <KpiTile
              label="Efterlevnadspoäng"
              value={cmp.compliance_score != null ? `${Math.round(Number(cmp.compliance_score))} %` : '–'}
              warn={cmp.compliance_score != null && Number(cmp.compliance_score) < 80}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Senaste AGI-inlämning</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm font-mono">
                  {cmp.last_agi_submission ? formatDate(String(cmp.last_agi_submission)) : '–'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Senaste momsrapport</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm font-mono">
                  {cmp.last_vat_submission ? formatDate(String(cmp.last_vat_submission)) : '–'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Extra fields from compliance view */}
          {Object.keys(cmp)
            .filter((k) => !['organization_id','pending_payroll_runs','open_vat_periods','overdue_declarations','compliance_score','last_agi_submission','last_vat_submission'].includes(k))
            .length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Ytterligare status</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
                  {Object.entries(cmp)
                    .filter(([k]) => !['organization_id','pending_payroll_runs','open_vat_periods','overdue_declarations','compliance_score','last_agi_submission','last_vat_submission'].includes(k))
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-mono">{String(v ?? '–')}</dd>
                      </div>
                    ))}
                </dl>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="py-12 text-center space-y-1">
          <ShieldCheck className="w-7 h-7 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Ingen efterlevnadsdata</p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function RegulatoryExportsPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Regulatoriska exporter"
        description="AGI-deklarationer, revisionsexporter och regelefterlevnadsstatus"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Regulatoriska exporter' },
        ]}
      />

      <PageContent>
        <PermissionGate permission={Permissions.FINANCE_AGI_READ}>
          <Tabs defaultValue="agi">
            <TabsList>
              <TabsTrigger value="agi">
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                AGI-deklarationer
              </TabsTrigger>
              <TabsTrigger value="audit">
                <FileCheck className="w-3.5 h-3.5 mr-1.5" />
                Revisionsexporter
              </TabsTrigger>
              <TabsTrigger value="compliance">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                Efterlevnad
              </TabsTrigger>
            </TabsList>

            <TabsContent value="agi" className="mt-5">
              <AgiTab />
            </TabsContent>
            <TabsContent value="audit" className="mt-5">
              <AuditTab />
            </TabsContent>
            <TabsContent value="compliance" className="mt-5">
              <ComplianceTab />
            </TabsContent>
          </Tabs>
        </PermissionGate>
      </PageContent>
    </PageLayout>
  );
}
