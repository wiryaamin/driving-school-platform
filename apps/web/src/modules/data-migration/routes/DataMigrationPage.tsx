import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, ChevronRight, FileText, Download } from 'lucide-react';
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useMigrationSessions,
  useCreateMigrationSession,
} from '../hooks/useDataMigration.js';
import type { MigrationSession, MigrationStatus, MigrationEntity } from '../hooks/useDataMigration.js';
import {
  ENTITY_LABELS, ENTITY_DESCRIPTIONS, RECOMMENDED_IMPORT_ORDER, TEMPLATE_COLUMNS, downloadTemplate,
} from '../lib/csvTemplates.js';
import { cn } from '@/lib/utils.js';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MigrationStatus, { label: string; className: string }> = {
  draft:      { label: 'Utkast',       className: 'bg-muted text-muted-foreground' },
  uploading:  { label: 'Laddar upp',   className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  validating: { label: 'Validerar',    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  validated:  { label: 'Klar att importera', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  importing:  { label: 'Importerar',   className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  completed:  { label: 'Slutförd',     className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  failed:     { label: 'Misslyckad',   className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  cancelled:  { label: 'Avbruten',     className: 'bg-muted text-muted-foreground' },
};

function SessionStatusBadge({ status }: { status: MigrationStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['draft'];
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', cfg.className)}>
      {cfg.label}
    </span>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────────────

function CreateSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate    = useNavigate();
  const createMut   = useCreateMigrationSession();
  const [entity, setEntity] = useState<MigrationEntity>('students');

  const handleStart = async () => {
    try {
      const session = await createMut.mutateAsync({ entity_type: entity });
      onClose();
      navigate(`/settings/data-migration/${session.id}`);
    } catch {
      toast({ title: 'Kunde inte skapa import', description: 'Försök igen', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ny dataimport</DialogTitle>
          <DialogDescription>
            Välj vilken typ av data du vill importera.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Entitetstyp</label>
            <Select value={entity} onValueChange={(v) => setEntity(v as MigrationEntity)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ENTITY_LABELS) as MigrationEntity[]).map((e) => (
                  <SelectItem key={e} value={e}>{ENTITY_LABELS[e]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 flex items-start gap-3">
            <p className="text-sm text-muted-foreground flex-1">{ENTITY_DESCRIPTIONS[entity]}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => downloadTemplate(entity)}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Mall
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createMut.isPending}>
            Avbryt
          </Button>
          <Button onClick={handleStart} disabled={createMut.isPending}>
            {createMut.isPending ? 'Skapar...' : 'Starta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────

function SessionRow({ session, onClick }: { session: MigrationSession; onClick: () => void }) {
  const date = new Date(session.created_at).toLocaleDateString('sv-SE', {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-4 px-4 py-3 text-left rounded-lg border border-border bg-card',
        'hover:bg-accent/40 transition-colors cursor-pointer',
      )}
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{ENTITY_LABELS[session.entity_type]}</span>
          {session.file_name && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{session.file_name}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <SessionStatusBadge status={session.status} />
          {session.total_rows > 0 && (
            <span className="text-xs text-muted-foreground">{session.total_rows} rader</span>
          )}
          {session.error_rows > 0 && (
            <span className="text-xs text-red-600 dark:text-red-400">{session.error_rows} fel</span>
          )}
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {session.status === 'completed' && (
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Importerade</p>
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">{session.imported_rows}</p>
          </div>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Templates panel ─────────────────────────────────────────────────────────

function TemplatesPanel() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold text-foreground">Importmallar</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ladda ner en CSV-mall per kategori, fyll i dina uppgifter och importera i den
          rekommenderade ordningen.
        </p>
      </div>
      <div className="divide-y divide-border">
        {RECOMMENDED_IMPORT_ORDER.map((entity, i) => {
          const cols = TEMPLATE_COLUMNS[entity];
          const required = cols.filter((c) => c.required).map((c) => c.key);
          return (
            <div key={entity} className="flex items-center gap-4 px-5 py-3.5">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{ENTITY_LABELS[entity]}</p>
                  <span className="text-[10px] font-mono text-muted-foreground/70 hidden sm:inline">
                    {required.join(', ')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{ENTITY_DESCRIPTIONS[entity]}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => downloadTemplate(entity)}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Ladda ner
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DataMigrationPage() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const { data, isLoading } = useMigrationSessions();
  const sessions = data?.data ?? [];

  return (
    <PageLayout>
      <PageHeader
        title="Dataimport"
        description="Importera elever, instruktörer, bokningar och finansiell data från externa system."
        breadcrumbs={[
          { label: 'Inställningar', href: '/settings' },
          { label: 'Dataimport' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowTemplates((v) => !v)}>
              <Download className="w-4 h-4 mr-2" />
              {showTemplates ? 'Dölj mallar' : 'Mallar'}
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Ny import
            </Button>
          </div>
        }
      />

      <PageContent>
        {showTemplates && <TemplatesPanel />}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[68px] w-full rounded-lg" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Inga importer ännu</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Starta din första import med knappen ovan.
            </p>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Ny import
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onClick={() => navigate(`/settings/data-migration/${session.id}`)}
              />
            ))}
          </div>
        )}
      </PageContent>

      <CreateSessionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </PageLayout>
  );
}
