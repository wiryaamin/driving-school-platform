import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, ChevronRight, FileText, Download, Info, FileDown } from 'lucide-react';
import {
  Button, Skeleton,
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
import type { ColumnSpec } from '../lib/csvTemplates.js';
import { cn } from '@/lib/utils.js';
import { supabase } from '@core/api/supabase.js';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MigrationStatus, { label: string; className: string }> = {
  draft:      { label: 'Utkast',            className: 'bg-muted text-muted-foreground' },
  uploading:  { label: 'Laddar upp',        className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  validating: { label: 'Validerar',         className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  validated:  { label: 'Klar att importera', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  importing:  { label: 'Importerar',        className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  completed:  { label: 'Slutförd',          className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  failed:     { label: 'Misslyckad',        className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  cancelled:  { label: 'Avbruten',          className: 'bg-muted text-muted-foreground' },
};

function SessionStatusBadge({ status }: { status: MigrationStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['draft'];
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', cfg.className)}>
      {cfg.label}
    </span>
  );
}

// ─── Schema preview dialog ────────────────────────────────────────────────────

function SchemaPreviewDialog({
  entity,
  onClose,
}: {
  entity: MigrationEntity | null;
  onClose: () => void;
}) {
  if (!entity) return null;
  const cols: ColumnSpec[] = TEMPLATE_COLUMNS[entity] ?? [];

  return (
    <Dialog open={entity !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Kolumnspecifikation — {ENTITY_LABELS[entity]}</DialogTitle>
          <DialogDescription>{ENTITY_DESCRIPTIONS[entity]}</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0 z-10">
              <tr>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground border-b border-border">Kolumn</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground border-b border-border">Etikett</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground border-b border-border">Krav</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground border-b border-border hidden sm:table-cell">Exempel</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground border-b border-border hidden md:table-cell">Tips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cols.map((col) => (
                <tr key={col.key} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3 font-mono text-xs text-foreground whitespace-nowrap">{col.key}</td>
                  <td className="py-2 px-3 text-xs">{col.label}</td>
                  <td className="py-2 px-3">
                    <span className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
                      col.required
                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                        : 'bg-muted text-muted-foreground',
                    )}>
                      {col.required ? 'Obligatorisk' : 'Valfri'}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">{col.example}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground hidden md:table-cell">{col.hint ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter className="pt-3">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate(entity)}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Ladda ner mall
          </Button>
          <Button onClick={onClose}>Stäng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Export dialog ────────────────────────────────────────────────────────────

const EXPORT_SUPPORTED = new Set<MigrationEntity>(['students', 'instructors']);

const ENTITY_ENDPOINT: Partial<Record<MigrationEntity, string>> = {
  students:    'students',
  instructors: 'instructors',
};

function mapToExportRow(entity: MigrationEntity, r: Record<string, unknown>): Record<string, string> {
  const str = (v: unknown) => (v == null || v === '' ? '' : String(v));

  if (entity === 'students') {
    return {
      first_name:              str(r['first_name']),
      last_name:               str(r['last_name']),
      personnummer:            '',
      email:                   str(r['email']),
      phone:                   str(r['phone']),
      address_street:          str(r['address_line1']),
      address_city:            str(r['city']),
      address_postal_code:     str(r['postal_code']),
      target_licence_category: str(r['target_licence_category']),
      enrolled_at:             str(r['enrolled_at']),
      status:                  str(r['status']),
      permit_stage:            str(r['permit_stage']),
      instructor_email:        '',
      risk1_completed_at:      str(r['risk1_completed_at']),
      risk2_completed_at:      str(r['risk2_completed_at']),
      theory_passed_at:        str(r['theory_passed_at']),
      practical_passed_at:     str(r['practical_passed_at']),
      notes:                   str(r['notes']),
    };
  }

  if (entity === 'instructors') {
    const cats  = r['teaching_categories'];
    const langs = r['languages_spoken'];
    return {
      first_name:            str(r['first_name']),
      last_name:             str(r['last_name']),
      personnummer:          '',
      email:                 str(r['email']),
      phone:                 str(r['phone']),
      employment_type:       str(r['employment_type']),
      teaching_categories:   Array.isArray(cats)  ? cats.join(',')  : str(cats),
      employment_started_at: str(r['employment_started_at']),
      adi_number:            str(r['adi_number']),
      adi_valid_until:       str(r['adi_valid_until']),
      languages_spoken:      Array.isArray(langs) ? langs.join(',') : str(langs),
    };
  }

  return {};
}

function buildCsv(entity: MigrationEntity, rows: Record<string, string>[]): string {
  const cols = TEMPLATE_COLUMNS[entity] ?? [];
  const keys = cols.map((c) => c.key);
  const header = keys.join(',');
  const lines = rows.map((row) =>
    keys.map((k) => {
      const val = row[k] ?? '';
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(','),
  );
  return [header, ...lines].join('\n');
}

function triggerCsvDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entity, setEntity]     = useState<MigrationEntity>('students');
  const [isLoading, setLoading] = useState(false);

  const supported = EXPORT_SUPPORTED.has(entity);

  const handleExport = async () => {
    setLoading(true);
    try {
      const endpoint = ENTITY_ENDPOINT[entity];
      if (!endpoint) throw new Error('Ej tillgänglig');

      const { data, error } = await supabase.functions.invoke<{ data: Record<string, unknown>[] }>(
        `${endpoint}?per_page=1000`,
        { method: 'GET' },
      );
      if (error) throw error;

      const records = data?.data ?? [];
      const rows    = records.map((r) => mapToExportRow(entity, r));
      const csv     = buildCsv(entity, rows);
      const date    = new Date().toISOString().slice(0, 10);
      triggerCsvDownload(csv, `export-${entity}-${date}.csv`);

      toast({
        title:       `Exporterade ${records.length} poster`,
        description: `${ENTITY_LABELS[entity]} sparades som CSV-fil`,
      });
      onClose();
    } catch (e) {
      toast({
        title:       'Export misslyckades',
        description: e instanceof Error ? e.message : 'Okänt fel',
        variant:     'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportera data</DialogTitle>
          <DialogDescription>
            Exportera befintliga poster till CSV. Filen kan redigeras och sedan
            återimporteras via importfunktionen.
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

          {supported ? (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Hämtar <strong className="text-foreground">{ENTITY_LABELS[entity]}</strong> och
              genererar en CSV med samma kolumnstruktur som importmallen.
              Personnummer exporteras inte av säkerhetsskäl.
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Direktexport ej tillgänglig för {ENTITY_LABELS[entity]}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ladda ner en tom importmall och fyll i uppgifterna manuellt,
                eller exportera data från respektive modul i systemet.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Avbryt
          </Button>
          {supported ? (
            <Button onClick={handleExport} disabled={isLoading}>
              <FileDown className="w-4 h-4 mr-2" />
              {isLoading ? 'Exporterar…' : 'Exportera'}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => { downloadTemplate(entity); onClose(); }}>
              <Download className="w-4 h-4 mr-2" />
              Ladda ner mall
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────────────

function CreateSessionDialog({
  open,
  onClose,
  onShowSchema,
}: {
  open: boolean;
  onClose: () => void;
  onShowSchema: (entity: MigrationEntity) => void;
}) {
  const navigate   = useNavigate();
  const createMut  = useCreateMigrationSession();
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
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate(entity)}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Mall
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { onClose(); onShowSchema(entity); }}
              >
                <Info className="w-3.5 h-3.5 mr-1.5" />
                Kolonner
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createMut.isPending}>
            Avbryt
          </Button>
          <Button onClick={handleStart} disabled={createMut.isPending}>
            {createMut.isPending ? 'Skapar…' : 'Starta'}
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

// ─── Templates panel ──────────────────────────────────────────────────────────

function TemplatesPanel({ onShowSchema }: { onShowSchema: (entity: MigrationEntity) => void }) {
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
          const cols     = TEMPLATE_COLUMNS[entity] ?? [];
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
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  title="Visa kolumnspecifikation"
                  onClick={() => onShowSchema(entity)}
                >
                  <Info className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadTemplate(entity)}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Ladda ner
                </Button>
              </div>
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
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [exportOpen, setExportOpen]   = useState(false);
  const [schemaEntity, setSchemaEntity] = useState<MigrationEntity | null>(null);

  const { data, isLoading } = useMigrationSessions();
  const sessions = data?.data ?? [];

  return (
    <PageLayout>
      <PageHeader
        title="Dataimport"
        description="Importera och exportera elever, instruktörer, bokningar och finansiell data."
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
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <FileDown className="w-4 h-4 mr-2" />
              Exportera
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Ny import
            </Button>
          </div>
        }
      />

      <PageContent>
        {showTemplates && <TemplatesPanel onShowSchema={setSchemaEntity} />}

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

      <CreateSessionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onShowSchema={(e) => setSchemaEntity(e)}
      />

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />

      <SchemaPreviewDialog
        entity={schemaEntity}
        onClose={() => setSchemaEntity(null)}
      />
    </PageLayout>
  );
}
