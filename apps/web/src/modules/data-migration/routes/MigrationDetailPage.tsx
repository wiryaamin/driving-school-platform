import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Download, Upload, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronRight, RefreshCw, ArrowLeft, Plus,
} from 'lucide-react';
import {
  Button, Badge, Skeleton,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useMigrationSession,
  useMigrationRows,
  useUploadMigrationRows,
  useImportMigration,
  useCancelMigration,
} from '../hooks/useDataMigration.js';
import type { MigrationSession, MigrationRow, RowStatus, MigrationEntity } from '../hooks/useDataMigration.js';
import { parseCsv } from '../lib/csvParser.js';
import { downloadTemplate, TEMPLATE_COLUMNS, ENTITY_LABELS, ENTITY_DESCRIPTIONS } from '../lib/csvTemplates.js';
import { cn } from '@/lib/utils.js';

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Förberedelse', 'Uppladdning', 'Granskning', 'Import', 'Klar'];

function getStep(status: MigrationSession['status']): number {
  switch (status) {
    case 'draft':      return 0;
    case 'uploading':
    case 'validating': return 1;
    case 'validated':  return 2;
    case 'importing':  return 3;
    case 'completed':
    case 'failed':
    case 'cancelled':  return 4;
  }
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto pb-1">
      {STEPS.map((label, idx) => {
        const done   = idx < current;
        const active = idx === current;
        return (
          <div key={label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center shrink-0">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors',
                done   ? 'bg-primary border-primary text-primary-foreground'
                       : active ? 'border-primary text-primary bg-background'
                       : 'border-border text-muted-foreground bg-background',
              )}>
                {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              <span className={cn(
                'text-[10px] mt-1 font-medium whitespace-nowrap',
                active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground',
              )}>
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                'flex-1 h-0.5 mx-1 mb-4 transition-colors',
                idx < current ? 'bg-primary' : 'bg-border',
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color = 'default',
}: {
  label: string;
  value: number;
  color?: 'green' | 'amber' | 'red' | 'default';
}) {
  const valueClass = {
    green:   'text-green-600 dark:text-green-400',
    amber:   'text-amber-600 dark:text-amber-400',
    red:     'text-red-600 dark:text-red-400',
    default: 'text-foreground',
  }[color];

  return (
    <div className="rounded-lg border border-border bg-card p-4 text-center">
      <p className={cn('text-2xl font-bold', valueClass)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ─── Row status badge ─────────────────────────────────────────────────────────

const ROW_STATUS_CONFIG: Record<RowStatus, { label: string; icon: React.FC<{ className?: string }>; className: string }> = {
  pending:  { label: 'Väntar',      icon: RefreshCw,      className: 'text-muted-foreground' },
  valid:    { label: 'Giltig',      icon: CheckCircle2,   className: 'text-green-600 dark:text-green-400' },
  warning:  { label: 'Varning',     icon: AlertTriangle,  className: 'text-amber-600 dark:text-amber-400' },
  error:    { label: 'Fel',         icon: XCircle,        className: 'text-red-600 dark:text-red-400' },
  imported: { label: 'Importerad',  icon: CheckCircle2,   className: 'text-green-600 dark:text-green-400' },
  skipped:  { label: 'Hoppades',    icon: RefreshCw,      className: 'text-muted-foreground' },
  failed:   { label: 'Misslyckad',  icon: XCircle,        className: 'text-red-600 dark:text-red-400' },
};

function RowStatusBadge({ status }: { status: RowStatus }) {
  const cfg  = ROW_STATUS_CONFIG[status] ?? ROW_STATUS_CONFIG['pending'];
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', cfg.className)}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

// ─── Expandable row ───────────────────────────────────────────────────────────

function ExpandableRow({ row }: { row: MigrationRow }) {
  const [expanded, setExpanded] = useState(false);
  const rawKeys = Object.keys(row.raw_data ?? {}).slice(0, 2);

  return (
    <>
      <tr
        className="border-b border-border hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-3 text-sm text-muted-foreground">{row.row_number}</td>
        <td className="px-4 py-3">
          <RowStatusBadge status={row.validation_status} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {rawKeys.map((k) => (
              <span key={k} className="text-sm text-foreground">
                <span className="text-muted-foreground text-xs">{k}: </span>
                {row.raw_data[k] || '—'}
              </span>
            ))}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="space-y-0.5">
            {row.errors.slice(0, 2).map((e, i) => (
              <p key={i} className="text-xs text-red-600 dark:text-red-400 truncate max-w-[220px]">{e.message}</p>
            ))}
            {row.warnings.slice(0, 1).map((w, i) => (
              <p key={i} className="text-xs text-amber-600 dark:text-amber-400 truncate max-w-[220px]">{w.message}</p>
            ))}
            {(row.errors.length === 0 && row.warnings.length === 0) && (
              <span className="text-xs text-muted-foreground/40">—</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground inline" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground inline" />
          }
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={5} className="px-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Raw data */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Rådata</p>
                <div className="space-y-1">
                  {Object.entries(row.raw_data ?? {}).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="text-muted-foreground min-w-[120px] shrink-0">{k}</span>
                      <span className="text-foreground font-mono">{v || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Issues */}
              <div>
                {(row.errors.length > 0 || row.warnings.length > 0) && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Problem</p>
                    <div className="space-y-1">
                      {row.errors.map((e, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                          <span className="text-xs text-red-600 dark:text-red-400">{e.field}: {e.message}</span>
                        </div>
                      ))}
                      {row.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span className="text-xs text-amber-600 dark:text-amber-400">{w.field}: {w.message}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {row.normalized_data && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Normaliserat</p>
                    <div className="space-y-1">
                      {Object.entries(row.normalized_data).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-xs">
                          <span className="text-muted-foreground min-w-[120px] shrink-0">{k}</span>
                          <span className="text-foreground font-mono">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {row.production_id && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Produktions-ID</p>
                    <span className="text-xs font-mono text-foreground">{row.production_id}</span>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Step 0: Förberedelse ─────────────────────────────────────────────────────

function PreparationStep({
  session,
  onProceed,
}: {
  session: MigrationSession;
  onProceed: () => void;
}) {
  const entity  = session.entity_type as MigrationEntity;
  const cols    = TEMPLATE_COLUMNS[entity] ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">
          Importera {ENTITY_LABELS[entity]}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{ENTITY_DESCRIPTIONS[entity]}</p>
        <Button variant="outline" size="sm" onClick={() => downloadTemplate(entity)}>
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Ladda ner mall (.csv)
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kolumnreferens</p>
        </div>
        <div className="divide-y divide-border">
          {cols.map((col) => (
            <div key={col.key} className="flex items-start gap-3 px-5 py-3">
              <span className="font-mono text-xs text-foreground w-36 shrink-0 pt-0.5">{col.key}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-foreground">{col.label}</span>
                  <Badge variant={col.required ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                    {col.required ? 'Obligatorisk' : 'Valfri'}
                  </Badge>
                </div>
                {col.hint && (
                  <p className="text-xs text-muted-foreground mt-0.5">{col.hint}</p>
                )}
                <p className="text-xs text-muted-foreground/60 mt-0.5">Exempel: {col.example || '(tomt)'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CSV structure preview */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CSV-förhandsgranskning</p>
          <span className="text-[10px] text-muted-foreground">Exempelformat — radera exempelraden och fyll i din data</span>
        </div>
        <div className="overflow-x-auto">
          <pre className="px-5 py-4 text-[11px] font-mono text-foreground leading-relaxed whitespace-pre">
            {cols.map((c) => c.key).join(',')}
            {'\n'}
            {cols.map((c) => c.example.includes(',') ? `"${c.example}"` : c.example).join(',')}
          </pre>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onProceed}>
          Välj fil och fortsätt
          <ChevronRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 1: Uppladdning ──────────────────────────────────────────────────────

function UploadStep({ session }: { session: MigrationSession }) {
  const uploadMut = useUploadMigrationRows();
  const fileRef   = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows]     = useState<Array<Record<string, string>> | null>(null);
  const [parseErrors, setParseErrors]   = useState<string[]>([]);
  const [fileName, setFileName]         = useState<string>('');
  const [fileSize, setFileSize]         = useState<number>(0);
  const [isDragging, setIsDragging]     = useState(false);
  const [isXlsx, setIsXlsx]            = useState(false);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setFileSize(file.size);
    setIsXlsx(false);
    setParseErrors([]);
    setParsedRows(null);

    if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
      setIsXlsx(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text   = e.target?.result as string;
      const result = parseCsv(text);
      setParseErrors(result.errors);
      if (result.errors.length === 0) {
        setParsedRows(result.rows);
      }
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onUpload = async () => {
    if (!parsedRows) return;
    try {
      await uploadMut.mutateAsync({
        id:              session.id,
        rows:            parsedRows,
        file_name:       fileName || undefined,
        file_size_bytes: fileSize || undefined,
      });
      toast({ title: 'Uppladdning klar', description: 'Datan validerades.' });
    } catch {
      toast({ title: 'Uppladdning misslyckad', description: 'Kontrollera filen och försök igen.', variant: 'destructive' });
    }
  };

  const isInProgress = session.status === 'uploading' || session.status === 'validating';

  if (isInProgress) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {session.status === 'uploading' ? 'Laddar upp...' : `Validerar ${session.total_rows} rader...`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Vänta medan systemet bearbetar filen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3 transition-colors cursor-pointer',
          isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/20',
        )}
        onClick={() => fileRef.current?.click()}
      >
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <Upload className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {fileName ? fileName : 'Dra och släpp en CSV-fil här'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fileName ? `${(fileSize / 1024).toFixed(1)} KB` : 'eller klicka för att välja fil (.csv)'}
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="sr-only"
        onChange={onFileChange}
      />

      {/* xlsx warning */}
      {isXlsx && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Excel-filer (.xlsx) stöds inte direkt. Spara filen som CSV (.csv) i Excel under
            <strong> Spara som → CSV UTF-8</strong> och ladda upp igen.
          </p>
        </div>
      )}

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-4 py-3">
          {parseErrors.map((e, i) => (
            <p key={i} className="text-sm text-red-700 dark:text-red-300">{e}</p>
          ))}
        </div>
      )}

      {/* Parse success */}
      {parsedRows !== null && parseErrors.length === 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-700 dark:text-green-300">
              <strong>{parsedRows.length} rader</strong> hittades i filen
            </p>
          </div>
          <Button
            onClick={onUpload}
            disabled={uploadMut.isPending}
            size="sm"
          >
            {uploadMut.isPending ? 'Laddar upp...' : 'Ladda upp och validera'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Granskning ───────────────────────────────────────────────────────

type RowFilter = RowStatus | 'all';

const ROW_FILTER_TABS: { key: RowFilter; label: string }[] = [
  { key: 'all',     label: 'Alla'      },
  { key: 'valid',   label: 'Giltiga'   },
  { key: 'warning', label: 'Varningar' },
  { key: 'error',   label: 'Fel'       },
];

function ReviewStep({
  session,
  onImport,
  isImporting,
}: {
  session:    MigrationSession;
  onImport:   () => void;
  isImporting: boolean;
}) {
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [page, setPage]           = useState(1);
  const PER_PAGE = 25;

  const { data: rowsData, isLoading: rowsLoading } = useMigrationRows(session.id, {
    status:   rowFilter,
    page,
    per_page: PER_PAGE,
  });

  const rows  = rowsData?.data ?? [];
  const total = rowsData?.meta.total ?? 0;
  const pages = Math.ceil(total / PER_PAGE);

  const importable = session.valid_rows + session.warning_rows;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Giltiga"   value={session.valid_rows}   color="green" />
        <StatCard label="Varningar" value={session.warning_rows} color="amber" />
        <StatCard label="Fel"       value={session.error_rows}   color="red"   />
        <StatCard label="Totalt"    value={session.total_rows}   />
      </div>

      {/* Import options */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <p className="text-sm font-semibold text-foreground">Importinställningar</p>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Importläge</label>
            <div className="text-sm text-foreground">
              {session.import_mode === 'skip_errors'
                ? 'Hoppa över rader med fel'
                : 'Avbryt vid första fel'}
            </div>
          </div>

          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Testläge (dry run)</label>
            <div className="flex items-center gap-2">
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                session.dry_run
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-muted text-muted-foreground',
              )}>
                {session.dry_run ? 'Aktiverat — inga rader sparas' : 'Inaktiverat'}
              </span>
            </div>
          </div>
        </div>

        {session.dry_run && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Testläge är aktiverat. Importen simuleras utan att spara data till produktionsdatabasen.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-1">
          <p className="text-sm text-muted-foreground">
            {importable} rader kan importeras ({session.valid_rows} giltiga + {session.warning_rows} med varningar)
          </p>
          <Button
            onClick={onImport}
            disabled={importable === 0 || isImporting}
          >
            {isImporting ? 'Importerar...' : session.dry_run ? 'Kör testimport' : 'Importera'}
            <ChevronRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      </div>

      {/* Row table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Filter pills */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-border overflow-x-auto">
          {ROW_FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setRowFilter(tab.key); setPage(1); }}
              className={cn(
                'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                rowFilter === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {rowsLoading ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Inga rader för detta filter</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">#</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Data</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Fel / Varningar</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => <ExpandableRow key={row.id} row={row} />)}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Sida {page} av {pages} ({total} rader)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Föregående
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Nästa
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Importing ────────────────────────────────────────────────────────

function ImportingStep({ session }: { session: MigrationSession }) {
  return (
    <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center justify-center text-center gap-4">
      <div className="w-10 h-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      <div>
        <p className="text-sm font-medium text-foreground">
          Importerar...
        </p>
        {session.total_rows > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {session.imported_rows} / {session.total_rows} rader klara
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Step 4: Klar ─────────────────────────────────────────────────────────────

function CompletedStep({
  session,
  onNewImport,
}: {
  session:     MigrationSession;
  onNewImport: () => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const [logFilter, setLogFilter] = useState<RowFilter>('imported');
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;

  const { data: rowsData, isLoading: rowsLoading } = useMigrationRows(session.id, {
    status:   showLog ? logFilter : 'imported',
    page,
    per_page: PER_PAGE,
  });

  const rows  = rowsData?.data ?? [];
  const total = rowsData?.meta.total ?? 0;
  const pages = Math.ceil(total / PER_PAGE);

  const isFailed    = session.status === 'failed';
  const isCancelled = session.status === 'cancelled';

  return (
    <div className="space-y-5">
      {/* Outcome header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
            isFailed || isCancelled ? 'bg-red-100 dark:bg-red-950' : 'bg-green-100 dark:bg-green-950',
          )}>
            {isFailed || isCancelled
              ? <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              : <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            }
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              {isFailed    ? 'Import misslyckades'
               : isCancelled ? 'Import avbruten'
               : session.dry_run ? 'Testimport slutförd'
               : 'Import slutförd'}
            </h2>
            {session.error_summary && (
              <p className="text-xs text-muted-foreground mt-1">{session.error_summary}</p>
            )}
            {session.dry_run && !isFailed && (
              <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Dry run — inga rader sparades
              </div>
            )}
          </div>
        </div>

        {!isFailed && !isCancelled && (
          <div className="grid grid-cols-3 gap-3 mt-5">
            <StatCard label="Importerade"  value={session.imported_rows} color="green" />
            <StatCard label="Hoppades"     value={session.skipped_rows}  color="default" />
            <StatCard label="Misslyckade"  value={session.error_rows}    color={session.error_rows > 0 ? 'red' : 'default'} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={onNewImport} variant="outline">
          <Plus className="w-4 h-4 mr-1.5" />
          Ny import
        </Button>
        <Button
          variant="ghost"
          onClick={() => { setShowLog((s) => !s); setPage(1); }}
        >
          {showLog ? 'Dölj importlogg' : 'Visa importlogg'}
        </Button>
      </div>

      {/* Import log */}
      {showLog && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-1 px-4 py-3 border-b border-border overflow-x-auto">
            {([
              { key: 'imported' as RowFilter, label: 'Importerade'  },
              { key: 'skipped'  as RowFilter, label: 'Hoppades'     },
              { key: 'failed'   as RowFilter, label: 'Misslyckade'  },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setLogFilter(tab.key); setPage(1); }}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  logFilter === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {rowsLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Inga rader för detta filter</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">#</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Data</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Fel / Varningar</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => <ExpandableRow key={row.id} row={row} />)}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">Sida {page} av {pages} ({total} rader)</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Föregående</Button>
                    <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Nästa</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MigrationDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();

  const [showUploadStep, setShowUploadStep] = useState(false);

  const { data: session, isLoading, isError } = useMigrationSession(id ?? '');
  const importMut  = useImportMigration();
  const cancelMut  = useCancelMigration();

  const handleImport = async () => {
    if (!id) return;
    try {
      await importMut.mutateAsync(id);
    } catch {
      toast({ title: 'Import misslyckades', description: 'Kontrollera loggarna och försök igen.', variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    try {
      await cancelMut.mutateAsync(id);
      navigate('/settings/data-migration');
    } catch {
      toast({ title: 'Kunde inte avbryta', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <PageLayout>
        <PageHeader title="Laddar import..." />
        <PageContent>
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </PageContent>
      </PageLayout>
    );
  }

  if (isError || !session) {
    return (
      <PageLayout>
        <PageHeader
          title="Session hittades inte"
          breadcrumbs={[
            { label: 'Inställningar', href: '/settings' },
            { label: 'Dataimport', href: '/settings/data-migration' },
            { label: 'Session' },
          ]}
        />
        <PageContent>
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">Importsessionen kunde inte hittas.</p>
            <Button className="mt-4" onClick={() => navigate('/settings/data-migration')}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Tillbaka till importer
            </Button>
          </div>
        </PageContent>
      </PageLayout>
    );
  }

  const step = session.status === 'draft' && showUploadStep ? 1 : getStep(session.status);

  return (
    <PageLayout>
      <PageHeader
        title={`Import: ${ENTITY_LABELS[session.entity_type as MigrationEntity]}`}
        description={session.file_name ?? undefined}
        breadcrumbs={[
          { label: 'Inställningar', href: '/settings' },
          { label: 'Dataimport', href: '/settings/data-migration' },
          { label: ENTITY_LABELS[session.entity_type as MigrationEntity] },
        ]}
        actions={
          !['completed', 'cancelled', 'failed'].includes(session.status) ? (
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelMut.isPending}>
              Avbryt import
            </Button>
          ) : undefined
        }
      />

      <PageContent>
        {/* Step indicator */}
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <StepIndicator current={step} />
        </div>

        {/* Step content */}
        {step === 0 && (
          <PreparationStep
            session={session}
            onProceed={() => setShowUploadStep(true)}
          />
        )}

        {step === 1 && <UploadStep session={session} />}

        {step === 2 && (
          <ReviewStep
            session={session}
            onImport={handleImport}
            isImporting={importMut.isPending}
          />
        )}

        {step === 3 && <ImportingStep session={session} />}

        {step === 4 && (
          <CompletedStep
            session={session}
            onNewImport={() => navigate('/settings/data-migration')}
          />
        )}
      </PageContent>
    </PageLayout>
  );
}
