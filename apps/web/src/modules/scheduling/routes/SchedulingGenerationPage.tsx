import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Play, RefreshCcw, CheckCircle, AlertTriangle,
  XCircle, Settings, History, Zap, CalendarDays,
} from 'lucide-react';
import { toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useGenerationConfigs, useGenerationRuns, useTriggerGeneration,
  type GenerationConfig, type GenerationRun, type TriggerGenerationResult,
} from '../hooks/useGeneration.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDateSwedish(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTimeSwedish(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

// ─── Run Status Badge ─────────────────────────────────────────────────────────

const RUN_STATUS: Record<GenerationRun['status'], { label: string; cls: string; icon: typeof CheckCircle }> = {
  running:   { label: 'Körs',        cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',      icon: Loader2 },
  completed: { label: 'Klar',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', icon: CheckCircle },
  partial:   { label: 'Delvis klar', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',  icon: AlertTriangle },
  failed:    { label: 'Misslyckad',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',          icon: XCircle },
};

function RunStatusBadge({ status }: { status: GenerationRun['status'] }) {
  const cfg  = RUN_STATUS[status] ?? RUN_STATUS.failed;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.cls)}>
      <Icon className={cn('w-3 h-3', status === 'running' && 'animate-spin')} />
      {cfg.label}
    </span>
  );
}

// ─── Frequency label ──────────────────────────────────────────────────────────

const FREQ_LABEL: Record<GenerationConfig['generation_frequency'], string> = {
  daily:  'Daglig',
  weekly: 'Veckovis',
  manual: 'Manuell',
};

// ─── Config Card ──────────────────────────────────────────────────────────────

function ConfigCard({ config }: { config: GenerationConfig }) {
  return (
    <div className={cn(
      'bg-card border border-border rounded-xl p-4 flex flex-col gap-3',
      !config.is_active && 'opacity-60',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {config.lesson_type_name ?? 'Okänd lektionstyp'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {FREQ_LABEL[config.generation_frequency]} · {config.generation_horizon_days} dagar framåt
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {config.is_active ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Aktiv
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Inaktiv
            </span>
          )}
          {config.auto_generation_enabled ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              Auto
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Manuell
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-muted-foreground">Senaste körning</p>
          <p className="font-medium text-foreground mt-0.5">
            {config.last_generation_at
              ? formatDateTimeSwedish(config.last_generation_at)
              : '—'
            }
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Nästa planerade</p>
          <p className="font-medium text-foreground mt-0.5">
            {config.next_generation_at
              ? formatDateTimeSwedish(config.next_generation_at)
              : '—'
            }
          </p>
        </div>
      </div>

      {config.retry_count > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          {config.retry_count}/{config.max_retry_count} försök — väntar {config.failure_backoff_minutes} min
        </p>
      )}
    </div>
  );
}

// ─── Run Row ──────────────────────────────────────────────────────────────────

function RunRow({ run }: { run: GenerationRun }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-2.5 px-3 text-xs text-foreground tabular-nums">
        {formatDateTimeSwedish(run.started_at)}
      </td>
      <td className="py-2.5 px-3 text-xs text-muted-foreground capitalize">
        {run.generation_scope}
      </td>
      <td className="py-2.5 px-3">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatDateSwedish(run.start_date)} – {formatDateSwedish(run.end_date)}
        </span>
      </td>
      <td className="py-2.5 px-3">
        <RunStatusBadge status={run.status} />
      </td>
      <td className="py-2.5 px-3 text-xs tabular-nums">
        <span className="text-emerald-700 dark:text-emerald-400 font-medium">{run.records_created}</span>
        <span className="text-muted-foreground mx-1">/</span>
        <span className="text-muted-foreground">{run.records_skipped} hoppade</span>
        {run.conflicts_detected > 0 && (
          <span className="ml-1 text-amber-600 dark:text-amber-400">
            / {run.conflicts_detected} konfl.
          </span>
        )}
      </td>
    </tr>
  );
}

// Sentinel select value for "generate generic availability, no fixed lesson
// type" — distinct from '' (nothing chosen yet), maps to a null RPC param.
const GENERIC_AVAILABILITY_VALUE = '__generic__';

// ─── Manual Trigger Section ───────────────────────────────────────────────────

function ManualTriggerSection() {
  const { data: lessonTypes = [], isLoading: ltLoading } = useLessonTypes();
  const trigger   = useTriggerGeneration();
  const navigate  = useNavigate();

  const today   = todayISO();
  const default30 = addDaysISO(today, 30);

  const [lessonTypeId, setLessonTypeId] = useState('');
  const [startDate,    setStartDate]    = useState(today);
  const [endDate,      setEndDate]      = useState(default30);
  const [result,       setResult]       = useState<TriggerGenerationResult | null>(null);

  const canSubmit = Boolean(lessonTypeId) && startDate && endDate && endDate >= startDate && !trigger.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    trigger.mutate(
      { lessonTypeId: lessonTypeId === GENERIC_AVAILABILITY_VALUE ? null : lessonTypeId, startDate, endDate },
      {
        onSuccess: (res) => {
          setResult(res);
          toast({ title: 'Generering klar', description: `${res.slots_created} pass skapades.` });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Okänt fel';
          toast({ title: 'Generering misslyckades', description: msg, variant: 'destructive' });
        },
      },
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Zap className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Kör manuellt</h2>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Lesson type selector */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Lektionstyp
            </label>
            <select
              value={lessonTypeId}
              onChange={e => setLessonTypeId(e.target.value)}
              disabled={ltLoading}
              className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
            >
              <option value="">Välj lektionstyp…</option>
              <option value={GENERIC_AVAILABILITY_VALUE}>— Ingen specifik (tillgänglighet) —</option>
              {lessonTypes.map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>

          {/* Start date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Startdatum
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
            />
          </div>

          {/* End date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Slutdatum
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {trigger.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />
            }
            {trigger.isPending ? 'Genererar…' : 'Starta generering'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/scheduling')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Avbryt
          </button>
        </div>

        {/* Result summary */}
        {result && (
          <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{result.slots_created}</p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">Pass skapade</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-muted-foreground tabular-nums">{result.slots_skipped}</p>
              <p className="text-[10px] text-muted-foreground">Hoppade</p>
            </div>
            <div className="text-center">
              <p className={cn(
                'text-lg font-bold tabular-nums',
                result.conflicts_found > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
              )}>
                {result.conflicts_found}
              </p>
              <p className="text-[10px] text-muted-foreground">Konflikter</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{result.instructors_processed}</p>
              <p className="text-[10px] text-muted-foreground">Instruktörer</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{result.rules_processed}</p>
              <p className="text-[10px] text-muted-foreground">Regler</p>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

// ─── SchedulingGenerationPage ─────────────────────────────────────────────────

export function SchedulingGenerationPage() {
  const { data: configs = [],  isLoading: configsLoading,  isError: configsError,  refetch: refetchConfigs  } = useGenerationConfigs();
  const { data: runs   = [],  isLoading: runsLoading,   isError: runsError,   refetch: refetchRuns   } = useGenerationRuns(30);

  return (
    <PageLayout>
      <PageHeader
        title="Schemaläggning – Generering"
        description="Konfigurera och starta automatisk passläggning"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Schema', href: '/scheduling' },
          { label: 'Generering' },
        ]}
      />

      <PageContent>

        {/* ── Configs ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Generationskonfigurationer
              </h2>
            </div>
            <button
              onClick={() => void refetchConfigs()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCcw className="w-3 h-3" />
              Uppdatera
            </button>
          </div>

          {configsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : configsError ? (
            <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Kunde inte hämta konfigurationer.
            </div>
          ) : configs.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-center bg-card border border-border rounded-xl">
              <Settings className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Inga generationskonfigurationer</p>
              <p className="text-xs text-muted-foreground/70">Konfigurationer skapas via API eller admin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {configs.map(c => <ConfigCard key={c.id} config={c} />)}
            </div>
          )}
        </section>

        {/* ── Manual Trigger ────────────────────────────────────────────── */}
        <PermissionGate permission={Permissions.SCHEDULING_GENERATION_RUN}>
          <ManualTriggerSection />
        </PermissionGate>

        {/* ── Run History ───────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Senaste körningar
              </h2>
            </div>
            <button
              onClick={() => void refetchRuns()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCcw className="w-3 h-3" />
              Uppdatera
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {runsLoading ? (
              <div className="space-y-px p-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : runsError ? (
              <div className="flex items-center gap-3 p-4 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Kunde inte hämta körningshistorik.
              </div>
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 text-center">
                <CalendarDays className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Inga körningar ännu</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Starttid</th>
                      <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Scope</th>
                      <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Period</th>
                      <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Resultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map(r => <RunRow key={r.id} run={r} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

      </PageContent>
    </PageLayout>
  );
}
