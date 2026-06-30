import { useState } from 'react';
import { CheckCircle, Circle, Clock, TrendingUp, AlertCircle, BookOpen, Plus, Trash2, ChevronDown } from 'lucide-react';
import {
  usePortalProgress,
  usePortalPracticeLog,
  usePortalAddPractice,
  usePortalDeletePractice,
} from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} tim`;
  return `${h} tim ${m} min`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string | number; sub?: string | undefined; color: string; icon: React.ElementType;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-start gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Stage definitions ────────────────────────────────────────────────────────

const STAGE_ORDER = [
  'not_started', 'theory_study',
  'risk1_booked', 'risk1_completed',
  'risk2_booked', 'risk2_completed',
  'theory_exam_booked', 'theory_passed',
  'practical_exam_booked', 'practical_passed', 'licence_issued',
] as const;

type PermitStage = typeof STAGE_ORDER[number];

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as PermitStage);
  return idx === -1 ? 0 : idx;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ stage }: { stage: string }) {
  const idx = stageIndex(stage);
  const pct = stage === 'licence_issued'
    ? 100
    : Math.round((idx / (STAGE_ORDER.length - 1)) * 100);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Utbildningsframsteg</span>
        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{pct} %</span>
      </div>
      <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            pct === 100
              ? 'bg-gradient-to-r from-green-400 to-emerald-500'
              : 'bg-gradient-to-r from-blue-500 to-purple-500',
          )}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Next-step hint ───────────────────────────────────────────────────────────

const NEXT_STEP: Record<PermitStage, { title: string; hint: string; done?: true }> = {
  not_started:           { title: 'Kom igång',        hint: 'Boka dina första körlektioner för att komma igång.' },
  theory_study:          { title: 'Teoristudier',     hint: 'Studera trafikteorin och boka Risk 1-utbildning.' },
  risk1_booked:          { title: 'Risk 1 bokad',     hint: 'Förbered dig inför halkbanan.' },
  risk1_completed:       { title: 'Boka Risk 2',      hint: 'Risk 1 klar — boka nu mörkerövningen (Risk 2).' },
  risk2_booked:          { title: 'Risk 2 bokad',     hint: 'Förbered dig inför mörkerövningen.' },
  risk2_completed:       { title: 'Boka teoriprov',   hint: 'Boka teoriprov hos Trafikverket när du är redo.' },
  theory_exam_booked:    { title: 'Teoriprov bokat',  hint: 'Repetera teorin noggrant inför provet.' },
  theory_passed:         { title: 'Boka uppkörning',  hint: 'Öva vidare och boka uppkörning hos Trafikverket.' },
  practical_exam_booked: { title: 'Uppkörning bokad', hint: 'Finjustera körtekniken inför körprovet.' },
  practical_passed:      { title: 'Körprov godkänt!', hint: 'Grattis — körkortet är på väg hem till dig.', done: true },
  licence_issued:        { title: 'Körkort utfärdat', hint: 'Grattis och välkommen på vägarna!',           done: true },
};

function NextStepHint({ stage }: { stage: string }) {
  const hint = NEXT_STEP[stage as PermitStage];
  if (!hint) return null;
  const isDone = hint.done ?? false;
  return (
    <div className={cn(
      'rounded-2xl border px-4 py-3 flex items-start gap-3',
      isDone
        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    )}>
      <div className={cn(
        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
        isDone
          ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'
          : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
      )}>
        {isDone ? <CheckCircle className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
      </div>
      <div>
        <p className={cn(
          'text-sm font-semibold leading-tight',
          isDone ? 'text-green-800 dark:text-green-300' : 'text-blue-800 dark:text-blue-300',
        )}>
          Nästa steg: {hint.title}
        </p>
        <p className={cn(
          'text-xs mt-0.5',
          isDone ? 'text-green-700 dark:text-green-400' : 'text-blue-700 dark:text-blue-400',
        )}>
          {hint.hint}
        </p>
      </div>
    </div>
  );
}

// ─── Permit milestone ─────────────────────────────────────────────────────────

interface MilestoneProps {
  label:       string;
  description: string;
  completedAt: string | null;
  isActive:    boolean;
}

function Milestone({ label, description, completedAt, isActive }: MilestoneProps) {
  const done = Boolean(completedAt);
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10',
          done
            ? 'bg-green-500 text-white'
            : isActive
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-400',
        )}>
          {done
            ? <CheckCircle className="w-4 h-4" />
            : <Circle className={cn('w-4 h-4', isActive && 'animate-pulse')} />
          }
        </div>
      </div>
      <div className="flex-1 pb-5">
        <p className={cn(
          'text-sm font-semibold',
          done     ? 'text-gray-900 dark:text-gray-100'
          : isActive ? 'text-blue-600 dark:text-blue-400'
                     : 'text-gray-400 dark:text-gray-500',
        )}>
          {label}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>
        {done && completedAt && (
          <p className="text-[10px] text-green-600 dark:text-green-400 mt-1">
            Avklarat {formatDate(completedAt)}
          </p>
        )}
        {isActive && !done && (
          <span className="inline-block mt-1.5 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-semibold rounded-full">
            Aktuellt steg
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Duration presets ─────────────────────────────────────────────────────────

const DURATION_PRESETS = [
  { label: '30 min', value: 30  },
  { label: '45 min', value: 45  },
  { label: '1 tim',  value: 60  },
  { label: '1½ tim', value: 90  },
  { label: '2 tim',  value: 120 },
];

// ─── Körkortsbok ──────────────────────────────────────────────────────────────

function KorkortsBokSection() {
  const { data: entries = [], isLoading } = usePortalPracticeLog();
  const addPractice    = usePortalAddPractice();
  const deletePractice = usePortalDeletePractice();

  const [showForm,     setShowForm]     = useState(false);
  const [showAll,      setShowAll]      = useState(false);
  const [practiceDate, setPracticeDate] = useState(todayStr);
  const [durationMin,  setDurationMin]  = useState(60);
  const [notes,        setNotes]        = useState('');

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);

  function resetForm() {
    setPracticeDate(todayStr());
    setDurationMin(60);
    setNotes('');
    setShowForm(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!practiceDate || durationMin < 1) return;
    addPractice.mutate(
      { practice_date: practiceDate, duration_minutes: durationMin, notes: notes.trim() || undefined },
      { onSuccess: resetForm },
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-purple-500" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Körkortsbok</h2>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-xl hover:bg-purple-700 active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Logga körning
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="px-5 pb-4 flex items-center gap-6 border-b border-gray-50 dark:border-gray-800">
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatHours(totalMinutes)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Total privat körning</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {entries.length}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Tillfällen</p>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mx-4 my-4 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl space-y-3 border border-gray-100 dark:border-gray-700"
        >
          <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Ny körning</p>

          {/* Date */}
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Datum</label>
            <input
              type="date"
              value={practiceDate}
              max={todayStr()}
              onChange={e => setPracticeDate(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Duration presets */}
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">Tid</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DURATION_PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDurationMin(p.value)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                    durationMin === p.value
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-purple-400',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={durationMin}
                min={1}
                max={480}
                step={5}
                onChange={e => setDurationMin(Number(e.target.value))}
                className="w-20 px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-gray-100 tabular-nums"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">min</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Anteckning (valfri)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="T.ex. övade parkering, motorväg..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-gray-100 resize-none placeholder:text-gray-400"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={addPractice.isPending}
              className="flex-1 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 active:scale-95 transition-all"
            >
              {addPractice.isPending ? 'Sparar...' : 'Spara'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-all"
            >
              Avbryt
            </button>
          </div>
        </form>
      )}

      {/* Entry list */}
      {isLoading && (
        <div className="px-5 py-4 space-y-2">
          {[1, 2].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
        </div>
      )}

      {!isLoading && entries.length === 0 && !showForm && (
        <p className="px-5 py-4 text-xs text-gray-400 dark:text-gray-500 text-center">
          Ingen privat körning registrerad ännu.
        </p>
      )}

      {!isLoading && entries.length > 0 && (
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {(showAll ? entries : entries.slice(0, 10)).map(entry => (
            <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    {formatDate(entry.practice_date)}
                  </span>
                  <span className="text-xs text-purple-600 dark:text-purple-400 font-medium tabular-nums">
                    {formatHours(entry.duration_minutes)}
                  </span>
                </div>
                {entry.notes && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight line-clamp-1">
                    {entry.notes}
                  </p>
                )}
              </div>
              <button
                onClick={() => deletePractice.mutate(entry.id)}
                disabled={deletePractice.isPending}
                className="w-7 h-7 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0 mt-0.5"
                aria-label="Ta bort"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {entries.length > 10 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="w-full px-5 py-3 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center justify-center gap-1 transition-colors"
            >
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showAll && 'rotate-180')} />
              {showAll ? 'Visa färre' : `Visa alla ${entries.length} tillfällen`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── StudentPortalFramstegPage ────────────────────────────────────────────────

export function StudentPortalFramstegPage() {
  const { data: progress, isLoading, isError } = usePortalProgress();

  if (isLoading) {
    return (
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !progress) {
    return (
      <div className="px-4 py-5 max-w-lg mx-auto">
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">Kunde inte hämta din information.</p>
        </div>
      </div>
    );
  }

  const currentStageIdx = stageIndex(progress.permit_stage);

  const MILESTONES: MilestoneProps[] = [
    {
      label:       'Teoriutbildning',
      description: 'Studera trafikteori och genomför teoriprov',
      completedAt: progress.theory_passed_at,
      isActive:    currentStageIdx < stageIndex('theory_passed'),
    },
    {
      label:       'Risk 1',
      description: 'Riskutbildning del 1 — halkbana',
      completedAt: progress.risk1_completed_at,
      isActive:    currentStageIdx >= stageIndex('risk1_booked') && !progress.risk1_completed_at,
    },
    {
      label:       'Risk 2',
      description: 'Riskutbildning del 2 — mörkerövning',
      completedAt: progress.risk2_completed_at,
      isActive:    currentStageIdx >= stageIndex('risk2_booked') && !progress.risk2_completed_at,
    },
    {
      label:       'Teoriprov',
      description: 'Godkänt teoriprov hos Trafikverket',
      completedAt: progress.theory_passed_at,
      isActive:    Boolean(progress.risk1_completed_at && progress.risk2_completed_at && !progress.theory_passed_at),
    },
    {
      label:       'Uppkörning',
      description: 'Körprov hos Trafikverket',
      completedAt: progress.practical_passed_at,
      isActive:    Boolean(progress.theory_passed_at && !progress.practical_passed_at),
    },
    {
      label:       'Körkort klart',
      description: 'Körkortet är utfärdat — grattis!',
      completedAt: progress.practical_passed_at,
      isActive:    false,
    },
  ];

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Mina framsteg</h1>

      {/* Progress bar */}
      <ProgressBar stage={progress.permit_stage} />

      {/* Next-step hint */}
      <NextStepHint stage={progress.permit_stage} />

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Genomförda lektioner"
          value={progress.completed_count}
          icon={CheckCircle}
          color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        />
        <StatCard
          label="Total körtid"
          value={formatHours(progress.total_minutes)}
          icon={Clock}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          label="Kommande bokningar"
          value={progress.upcoming_count}
          icon={TrendingUp}
          color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
        />
        <StatCard
          label="Uteblivanden"
          value={progress.no_show_count}
          sub={progress.no_show_count > 0 ? 'Kontakta skolan' : undefined}
          icon={AlertCircle}
          color={progress.no_show_count > 0
            ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
            : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
          }
        />
      </div>

      {/* Milestone timeline */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-5 pt-5 pb-2">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">Utbildningsväg</h2>
        <div className="relative">
          <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-gray-100 dark:bg-gray-800" aria-hidden="true" />
          {MILESTONES.map((m, i) => (
            <Milestone key={i} {...m} />
          ))}
        </div>
      </div>

      {/* Private practice log */}
      <KorkortsBokSection />
    </div>
  );
}
