import { useState } from 'react';
import { Download, FileText, Plus, RefreshCw } from 'lucide-react';
import {
  Button, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useSIE4List, useSIE4Detail, useGenerateSIE4 } from '../hooks/useSIE4.js';
import { useExportRuns } from '../hooks/useFinancialReports.js';
import { formatDate, formatDateTime } from '../lib/financeUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashShort(hash: string | null): string {
  if (!hash) return '—';
  return hash.slice(0, 12) + '…';
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).then(() =>
    toast({ title: 'Kopierat', description: 'Innehåll kopierat till urklipp.' })
  );
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── SIE4 detail sheet ────────────────────────────────────────────────────────

interface DetailSheetProps {
  id:       string | null;
  onClose:  () => void;
}

function SIE4DetailSheet({ id, onClose }: DetailSheetProps) {
  const { data, isLoading } = useSIE4Detail(id);

  const filename = data
    ? `SIE4_${data.from_date ?? 'export'}_${data.to_date ?? ''}.se`.replace(/\s/g, '_')
    : 'SIE4.se';

  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-full sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle>SIE4-exportdetaljer</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-5 bg-muted rounded w-3/4" />
              ))}
            </div>
          ) : !data ? (
            <p className="text-sm text-muted-foreground">Exporten hittades inte.</p>
          ) : (
            <>
              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Period</p>
                  <p className="font-medium">
                    {data.from_date ? formatDate(data.from_date) : '—'}
                    {' – '}
                    {data.to_date ? formatDate(data.to_date) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Räkenskapsår start</p>
                  <p className="font-medium">
                    {data.fiscal_year_start ? formatDate(data.fiscal_year_start) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Verifikationer</p>
                  <p className="font-medium font-mono">{data.voucher_count ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Transaktioner</p>
                  <p className="font-medium font-mono">{data.transaction_count ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Genererad</p>
                  <p className="font-medium">{formatDateTime(data.generated_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">SHA-256</p>
                  <p className="font-mono text-xs break-all">{data.content_hash ?? '—'}</p>
                </div>
              </div>

              {/* Content preview */}
              {data.content_text && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      SIE4-innehåll
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(data.content_text!)}
                      >
                        Kopiera
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadText(data.content_text!, filename)}
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Ladda ner
                      </Button>
                    </div>
                  </div>
                  <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre max-h-96 overflow-y-auto border border-border">
                    {data.content_text}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Generate dialog ──────────────────────────────────────────────────────────

interface GenerateDialogProps {
  open:    boolean;
  onClose: () => void;
}

function GenerateDialog({ open, onClose }: GenerateDialogProps) {
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const { data: runsResp, isLoading: runsLoading } = useExportRuns(1);
  const generate = useGenerateSIE4();

  const completedRuns = (runsResp?.data ?? []).filter(
    (r) => r.status === 'completed' && r.format === 'sie4',
  );

  function handleSubmit() {
    if (!selectedRunId) return;
    generate.mutate(
      { export_run_id: selectedRunId },
      {
        onSuccess: () => {
          toast({ title: 'SIE4 genererad', description: 'Filen har skapats och finns i listan nedan.' });
          setSelectedRunId('');
          onClose();
        },
        onError: (e) => {
          toast({ title: 'Fel', description: String(e), variant: 'destructive' });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSelectedRunId(''); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generera SIE4-fil</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Välj en slutförd exportkörning (format: SIE4) att generera bokföringsfil ifrån.
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Exportkörning</label>
            {runsLoading ? (
              <div className="h-9 bg-muted rounded animate-pulse" />
            ) : completedRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Inga slutförda SIE4-körningar hittades. Skapa en exportkörning med format SIE4 under
                Finansiella rapporter → Exportkörningar.
              </p>
            ) : (
              <Select value={selectedRunId} onValueChange={setSelectedRunId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj exportkörning…" />
                </SelectTrigger>
                <SelectContent>
                  {completedRuns.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {formatDate(run.from_date)} – {formatDate(run.to_date)}
                      {run.entry_count !== null && ` (${run.entry_count} poster)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedRunId || generate.isPending || completedRuns.length === 0}
          >
            {generate.isPending ? 'Genererar…' : 'Generera SIE4'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SIE4ExportsPage() {
  const [detailId, setDetailId]       = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  const { data: exports = [], isLoading, refetch, isFetching } = useSIE4List(50);

  return (
    <PageLayout>
      <PageHeader
        title="SIE4-exportfiler"
        description="Bokföringsfiler i SIE4-format för import till redovisningsprogram"
        breadcrumbs={[
          { label: 'Ekonomi', href: '/finance' },
          { label: 'SIE4-exportfiler' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
            <PermissionGate permission={Permissions.FINANCE_SIE4_RUN}>
              <Button size="sm" onClick={() => setShowGenerate(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Generera SIE4
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <PageContent>
        <SubscriptionGate feature="finance:sie4:export">
        <PermissionGate permission={Permissions.FINANCE_SIE4_READ}>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : exports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileText className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">Inga SIE4-filer genererade</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Generera en SIE4-fil från en slutförd exportkörning via knappen ovan.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Räkenskapsår</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Verif.</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Trans.</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">SHA-256</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Genererad</th>
                    <th className="text-right px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {exports.map((exp) => (
                    <tr
                      key={exp.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setDetailId(exp.id)}
                    >
                      <td className="px-4 py-3 font-medium">
                        {exp.from_date ? formatDate(exp.from_date) : '—'}
                        {' – '}
                        {exp.to_date ? formatDate(exp.to_date) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {exp.fiscal_year_start ? formatDate(exp.fiscal_year_start) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {exp.voucher_count ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {exp.transaction_count ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {hashShort(exp.content_hash)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(exp.generated_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="outline" className="text-xs">
                          SIE4
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PermissionGate>
        </SubscriptionGate>
      </PageContent>

      <SIE4DetailSheet id={detailId} onClose={() => setDetailId(null)} />
      <GenerateDialog open={showGenerate} onClose={() => setShowGenerate(false)} />
    </PageLayout>
  );
}
