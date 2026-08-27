import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Plus, RefreshCw, Upload, Loader2 } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import {
  Button, Input, DataTable, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, toast,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { usePermissions } from '@core/rbac/hooks.js';
import {
  useRegulatoryWorkflows, useCreateRegulatoryWorkflow, useUpdateRegulatoryWorkflow,
  useWorkflowDocuments, useUploadWorkflowDocument, useWorkflowAuditHistory,
  WORKFLOW_TYPE_LABEL, WORKFLOW_TYPE_AGENCY, WORKFLOW_TYPE_PORTAL_URL, STATUS_LABEL,
} from '../hooks/useRegulatoryWorkflows.js';
import type { WorkflowAuditEntry } from '../hooks/useRegulatoryWorkflows.js';

const AUDIT_OPERATION_LABEL: Record<WorkflowAuditEntry['operation'], string> = {
  INSERT: 'Skapad', UPDATE: 'Ändrad', DELETE: 'Borttagen', RESTORE: 'Återställd',
};
import type {
  RegulatoryWorkflow, RegulatoryWorkflowType, RegulatoryWorkflowStatus,
  CreateRegulatoryWorkflowInput,
} from '../hooks/useRegulatoryWorkflows.js';

// Guided, manual-workflow tracking for Transportstyrelsen/Trafikverket
// processes that have no sanctioned API (see docs/INTEGRATION_CONFIGURATION_GUIDE.md
// §4.12) — staff launch the real government portal, then record what
// happened here so regulatory work never silently gets lost.

const STATUS_CLS: Record<RegulatoryWorkflowStatus, string> = {
  not_started: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  submitted:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  confirmed:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  expired:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function isOverdue(w: RegulatoryWorkflow): boolean {
  if (!w.due_date || w.status === 'confirmed' || w.status === 'rejected') return false;
  return new Date(`${w.due_date}T00:00:00`) < new Date(new Date().toDateString());
}

const inputCls = 'w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';
const selectCls = inputCls + ' appearance-none';

function buildColumns(): ColumnDef<RegulatoryWorkflow>[] {
  return [
    {
      id: 'title',
      header: 'Ärende',
      cell: ({ row }) => {
        const w = row.original;
        return (
          <div>
            <div className="text-sm font-medium text-foreground">{w.title}</div>
            <div className="text-xs text-muted-foreground">
              {WORKFLOW_TYPE_LABEL[w.workflow_type]}
              {WORKFLOW_TYPE_AGENCY[w.workflow_type] ? ` · ${WORKFLOW_TYPE_AGENCY[w.workflow_type]}` : ''}
            </div>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CLS[row.original.status])}>
          {STATUS_LABEL[row.original.status]}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'due_date',
      header: 'Förfallodatum',
      cell: ({ row }) => {
        const w = row.original;
        if (!w.due_date) return <span className="text-sm text-muted-foreground/40">—</span>;
        const overdue = isOverdue(w);
        return (
          <span className={cn('text-sm', overdue ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
            {new Date(`${w.due_date}T00:00:00`).toLocaleDateString('sv-SE')}
            {overdue ? ' (försenad)' : ''}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      id: 'reference',
      header: 'Bekräftelsenummer',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground font-mono">{row.original.external_reference ?? '—'}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'portal',
      header: '',
      cell: ({ row }) => {
        const url = WORKFLOW_TYPE_PORTAL_URL[row.original.workflow_type];
        if (!url) return null;
        return (
          <a
            href={url} target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            title="Öppna officiell portal"
          >
            <ExternalLink className="w-3 h-3" /> Öppna portal
          </a>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

// ─── Create dialog ──────────────────────────────────────────────────────────

const EMPTY_CREATE: CreateRegulatoryWorkflowInput = {
  workflow_type: 'risk_education_report',
  title: '',
};

function CreateWorkflowDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<CreateRegulatoryWorkflowInput>(EMPTY_CREATE);
  const create = useCreateRegulatoryWorkflow();

  function set<K extends keyof CreateRegulatoryWorkflowInput>(k: K, v: CreateRegulatoryWorkflowInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      await create.mutateAsync(form);
      toast({ title: 'Ärende skapat' });
      setForm(EMPTY_CREATE);
      onClose();
    } catch (err) {
      toast({ title: 'Kunde inte skapa ärendet', variant: 'destructive',
        description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !create.isPending) { setForm(EMPTY_CREATE); onClose(); } }} aria-describedby={undefined}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nytt myndighetsärende</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Spåra ett manuellt ärende hos Transportstyrelsen eller Trafikverket</p>
        </DialogHeader>

        <form id="workflow-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Typ</label>
            <select className={selectCls} value={form.workflow_type}
              onChange={(e) => set('workflow_type', e.target.value as RegulatoryWorkflowType)}>
              {(Object.keys(WORKFLOW_TYPE_LABEL) as RegulatoryWorkflowType[]).map((t) => (
                <option key={t} value={t}>{WORKFLOW_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Titel *</label>
            <input className={inputCls} value={form.title} required
              placeholder="T.ex. Riskutbildning – Anna Andersson"
              onChange={(e) => set('title', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Förfallodatum</label>
            <input type="date" className={inputCls} value={form.due_date ?? ''}
              onChange={(e) => set('due_date', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Anteckningar</label>
            <textarea className={inputCls + ' h-20 py-2'} value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose} disabled={create.isPending}>Avbryt</Button>
          <Button type="submit" form="workflow-form" disabled={create.isPending || !form.title.trim()}>
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Skapa ärende
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail / edit dialog ───────────────────────────────────────────────────

function WorkflowDetailDialog({ workflow, onClose }: { workflow: RegulatoryWorkflow | null; onClose: () => void }) {
  const update = useUpdateRegulatoryWorkflow();
  const upload = useUploadWorkflowDocument();
  const { data: documents } = useWorkflowDocuments(workflow?.id ?? null);
  const { can } = usePermissions();
  const { data: history } = useWorkflowAuditHistory(workflow?.id ?? null, can(Permissions.ADMIN_AUDIT_READ));

  const [status, setStatus] = useState<RegulatoryWorkflowStatus>(workflow?.status ?? 'not_started');
  const [reference, setReference] = useState(workflow?.external_reference ?? '');
  const [notes, setNotes] = useState(workflow?.notes ?? '');

  // Sync local state whenever a different workflow is opened.
  const [openedId, setOpenedId] = useState<string | null>(null);
  if (workflow && workflow.id !== openedId) {
    setOpenedId(workflow.id);
    setStatus(workflow.status);
    setReference(workflow.external_reference ?? '');
    setNotes(workflow.notes ?? '');
  }

  async function handleSave() {
    if (!workflow) return;
    try {
      await update.mutateAsync({
        id: workflow.id,
        status,
        external_reference: reference || null,
        notes: notes || null,
        ...(status === 'submitted' && !workflow.submitted_at ? { submitted_at: new Date().toISOString() } : {}),
        ...(status === 'confirmed' && !workflow.confirmed_at ? { confirmed_at: new Date().toISOString() } : {}),
      });
      toast({ title: 'Ärendet uppdaterat' });
      onClose();
    } catch (err) {
      toast({ title: 'Kunde inte uppdatera ärendet', variant: 'destructive',
        description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !workflow) return;
    try {
      await upload.mutateAsync({ workflowId: workflow.id, file });
      toast({ title: 'Dokument uppladdat' });
    } catch (err) {
      toast({ title: 'Uppladdningen misslyckades', variant: 'destructive',
        description: err instanceof Error ? err.message : undefined });
    } finally {
      e.target.value = '';
    }
  }

  if (!workflow) return null;
  const portalUrl = WORKFLOW_TYPE_PORTAL_URL[workflow.workflow_type];

  return (
    <Dialog open={!!workflow} onOpenChange={(v) => { if (!v) onClose(); }} aria-describedby={undefined}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{workflow.title}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {WORKFLOW_TYPE_LABEL[workflow.workflow_type]}
            {WORKFLOW_TYPE_AGENCY[workflow.workflow_type] ? ` · ${WORKFLOW_TYPE_AGENCY[workflow.workflow_type]}` : ''}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {portalUrl && (
            <a href={portalUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Öppna officiell portal
            </a>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as RegulatoryWorkflowStatus)}>
              {(Object.keys(STATUS_LABEL) as RegulatoryWorkflowStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bekräftelsenummer</label>
            <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Från myndighetens bekräftelse" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Anteckningar</label>
            <textarea className={inputCls + ' h-20 py-2'} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bilagor</label>
            <div className="space-y-1.5">
              {(documents ?? []).map((d) => (
                <div key={d.id} className="text-xs text-muted-foreground truncate">{d.file_name}</div>
              ))}
              <label className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer">
                <Upload className="w-3 h-3" />
                {upload.isPending ? 'Laddar upp…' : 'Ladda upp dokument'}
                <input type="file" className="hidden" onChange={(e) => void handleUpload(e)} disabled={upload.isPending} />
              </label>
            </div>
          </div>

          {history && history.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ändringshistorik</label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                    <span>
                      {AUDIT_OPERATION_LABEL[h.operation]}
                      {h.changed_fields && h.changed_fields.length > 0 ? ` (${h.changed_fields.join(', ')})` : ''}
                      {h.actor_email ? ` — ${h.actor_email}` : ''}
                    </span>
                    <span className="shrink-0">{new Date(h.occurred_at).toLocaleString('sv-SE')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground/70 pt-1 border-t border-border">
            Skapad {new Date(workflow.created_at).toLocaleString('sv-SE')} · Senast ändrad {new Date(workflow.updated_at).toLocaleString('sv-SE')}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose} disabled={update.isPending}>Stäng</Button>
          <Button type="button" onClick={() => void handleSave()} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function RegulatoryPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RegulatoryWorkflowStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<RegulatoryWorkflowType | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<RegulatoryWorkflow | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading, error, refetch } = useRegulatoryWorkflows();

  // Deep-link support: a reminder notification links to /regulatory?open=<id>
  // so clicking it lands on the exact item, not just the list.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || !data) return;
    const match = data.find((w) => w.id === openId);
    if (match) {
      setSelected(match);
      setSearchParams((prev) => { prev.delete('open'); return prev; }, { replace: true });
    }
  }, [searchParams, data, setSearchParams]);

  const filtered = useMemo(() => {
    let all = data ?? [];
    if (statusFilter !== 'all') all = all.filter((w) => w.status === statusFilter);
    if (typeFilter   !== 'all') all = all.filter((w) => w.workflow_type === typeFilter);
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((w) =>
      w.title.toLowerCase().includes(q) ||
      WORKFLOW_TYPE_LABEL[w.workflow_type].toLowerCase().includes(q) ||
      (w.external_reference ?? '').toLowerCase().includes(q),
    );
  }, [data, search, statusFilter, typeFilter]);

  const columns = useMemo(() => buildColumns(), []);

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="flex items-center justify-end pt-4 pb-3">
        <PermissionGate permission={Permissions.REGULATORY_WORKFLOW_CREATE}>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Nytt ärende
          </Button>
        </PermissionGate>
      </div>

      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Transportstyrelsen och Trafikverket kräver för flera processer manuell hantering via deras egna portaler
        (t.ex. riskutbildningsrapportering, förarprovsbokning) — det finns inget officiellt API att koppla mot.
        Här spårar ni vad som är på gång, vem som ansvarar och vad myndigheten svarat.
      </p>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Input
            placeholder="Sök på titel, typ eller bekräftelsenummer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border border-border bg-background px-2.5 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RegulatoryWorkflowStatus | 'all')}
        >
          <option value="all">Alla statusar</option>
          {(Object.keys(STATUS_LABEL) as RegulatoryWorkflowStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-2.5 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as RegulatoryWorkflowType | 'all')}
        >
          <option value="all">Alla typer</option>
          {(Object.keys(WORKFLOW_TYPE_LABEL) as RegulatoryWorkflowType[]).map((t) => (
            <option key={t} value={t}>{WORKFLOW_TYPE_LABEL[t]}</option>
          ))}
        </select>
        <Button variant="ghost" size="icon" onClick={() => void refetch()} title="Uppdatera listan" disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-destructive">Det gick inte att hämta listan.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Försök igen</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            emptyMessage="Inga myndighetsärenden registrerade."
            defaultPageSize={25}
            onRowClick={(row) => setSelected(row)}
          />
        </div>
      )}

      <CreateWorkflowDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <WorkflowDetailDialog workflow={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
