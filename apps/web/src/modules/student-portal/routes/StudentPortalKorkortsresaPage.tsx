import { useMemo } from 'react';
import { CheckCircle, Lock, AlertCircle } from 'lucide-react';
import { usePortalProgress, usePortalMe } from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';
import { stageIndex as stageIdx } from '../lib/permitStage.js';

const BRAND = '#684EFF';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Stage status computation ─────────────────────────────────────────────────

type StageStatus = 'done' | 'active' | 'planned' | 'locked';

interface StageResult {
  status:      StageStatus;
  completedAt: string | null;
}

// Portal Audit SP-02: this file already indexed the real 11-value
// permit_stage enum correctly (unlike Settings/Dashboard, which didn't) —
// now reuses the single shared mapping instead of keeping its own
// numerically-equivalent copy, so it can't independently drift from it later.

interface StepDef {
  key:         string;
  label:       string;
  subtitle:    string;
  description: string;
  tip:         string;
  emoji:       string;
  color:       string;
  doneBg:      string;
  doneText:    string;
  compute: (args: {
    permitStage: string;
    risk1_completed_at:  string | null;
    risk2_completed_at:  string | null;
    theory_passed_at:    string | null;
    practical_passed_at: string | null;
  }) => StageResult;
}

const STEPS: StepDef[] = [
  {
    key:         'kkt',
    label:       'Körkortstillstånd',
    subtitle:    'Ansökan godkänd',
    description: 'Du har fått körkortstillstånd och är redo att börja utbildningen.',
    tip:         'Ansök via Transportstyrelsen. Vanligtvis klar inom 1–2 veckor.',
    emoji:       '📋',
    color:       'bg-teal-500',
    doneBg:      'bg-teal-50 border-teal-200',
    doneText:    'text-teal-700',
    compute: ({ permitStage }) => ({
      status:      stageIdx(permitStage) >= 1 ? 'done' : 'active',
      completedAt: null,
    }),
  },
  {
    key:         'risk1',
    label:       'Riskettan',
    subtitle:    'Riskutbildning del 1',
    description: 'Praktisk utbildning på halkbana. Lär dig hantera bilen i farliga situationer.',
    tip:         'Genomförs på godkänd halkbana. Tar normalt en heldag.',
    emoji:       '🌊',
    color:       'bg-blue-500',
    doneBg:      'bg-blue-50 border-blue-200',
    doneText:    'text-blue-700',
    compute: ({ permitStage, risk1_completed_at }) => {
      if (risk1_completed_at)                     return { status: 'done',    completedAt: risk1_completed_at };
      if (stageIdx(permitStage) >= 2)             return { status: 'active',  completedAt: null };
      return                                             { status: 'locked',  completedAt: null };
    },
  },
  {
    key:         'risk2',
    label:       'Risktvåan',
    subtitle:    'Riskutbildning del 2',
    description: 'Mörkerövning och alkohol/drogutbildning. Obligatoriskt för körkort B.',
    tip:         'Genomförs på kvällen eller tidig morgon. Bokas separat.',
    emoji:       '🌙',
    color:       'bg-indigo-500',
    doneBg:      'bg-indigo-50 border-indigo-200',
    doneText:    'text-indigo-700',
    compute: ({ permitStage, risk2_completed_at }) => {
      if (risk2_completed_at)                     return { status: 'done',    completedAt: risk2_completed_at };
      if (stageIdx(permitStage) >= 4)             return { status: 'active',  completedAt: null };
      if (stageIdx(permitStage) >= 3)             return { status: 'planned', completedAt: null };
      return                                             { status: 'locked',  completedAt: null };
    },
  },
  {
    key:         'theory',
    label:       'Kunskapsprov',
    subtitle:    'Teoriprov hos Trafikverket',
    description: 'Teoriprov med 65 frågor. Behöver minst 52 rätt (80%) för godkänt.',
    tip:         'Bokas via Trafikverkets e-tjänst. Kostar 325 kr.',
    emoji:       '📖',
    color:       'bg-amber-500',
    doneBg:      'bg-amber-50 border-amber-200',
    doneText:    'text-amber-700',
    compute: ({ permitStage, risk1_completed_at, risk2_completed_at, theory_passed_at }) => {
      if (theory_passed_at)                       return { status: 'done',    completedAt: theory_passed_at };
      if (stageIdx(permitStage) >= 6)             return { status: 'active',  completedAt: null };
      if (risk1_completed_at && risk2_completed_at) return { status: 'planned', completedAt: null };
      return                                             { status: 'locked',  completedAt: null };
    },
  },
  {
    key:         'practical',
    label:       'Körprov',
    subtitle:    'Uppkörning hos Trafikverket',
    description: 'Praktiskt körprov med Trafikverkets examinator. Ca 45 minuter.',
    tip:         'Bokas via Trafikverkets e-tjänst. Kostar 1 350 kr. Kräver godkänt teoriprov.',
    emoji:       '🚗',
    color:       'bg-purple-500',
    doneBg:      'bg-purple-50 border-purple-200',
    doneText:    'text-purple-700',
    compute: ({ permitStage, theory_passed_at, practical_passed_at }) => {
      if (practical_passed_at)                    return { status: 'done',    completedAt: practical_passed_at };
      if (stageIdx(permitStage) >= 8)             return { status: 'active',  completedAt: null };
      if (theory_passed_at)                       return { status: 'planned', completedAt: null };
      return                                             { status: 'locked',  completedAt: null };
    },
  },
  {
    key:         'licence',
    label:       'Körkort',
    subtitle:    'Utfärdat av Transportstyrelsen',
    description: 'Grattis! Körkortet skickas hem till din folkbokföringsadress inom 1–2 veckor.',
    tip:         'Spara alltid körkortet på säker plats. Det är ett värdebevis.',
    emoji:       '🏆',
    color:       'bg-green-500',
    doneBg:      'bg-green-50 border-green-200',
    doneText:    'text-green-700',
    compute: ({ permitStage, practical_passed_at }) => {
      if (permitStage === 'licence_issued')        return { status: 'done',    completedAt: null };
      if (practical_passed_at)                     return { status: 'planned', completedAt: null };
      return                                              { status: 'locked',  completedAt: null };
    },
  },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: StageStatus }) {
  const cfg = {
    done:    { label: 'Genomförd',    cls: 'bg-green-100 text-green-700'  },
    active:  { label: 'Pågående',     cls: 'bg-blue-100 text-blue-700'    },
    planned: { label: 'Planerad',     cls: 'bg-amber-100 text-amber-700'  },
    locked:  { label: 'Ej påbörjad',  cls: 'bg-gray-100 text-gray-500'   },
  }[status];
  return (
    <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step, result, isLast }: { step: StepDef; result: StageResult; isLast: boolean }) {
  const isDone   = result.status === 'done';
  const isActive = result.status === 'active';
  const isLocked = result.status === 'locked';

  return (
    <div className="flex gap-4">
      {/* Left: connector line + icon */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 text-lg',
          isDone   ? step.color + ' text-white shadow-sm' :
          isActive ? 'bg-white border-2 text-xl' :
          isLocked ? 'bg-gray-100 text-gray-300' :
                     'bg-amber-100',
        )}
          style={isActive ? { borderColor: BRAND } : undefined}
        >
          {isDone
            ? <CheckCircle className="w-5 h-5 text-white" />
            : isLocked
            ? <Lock className="w-4 h-4 text-gray-300" />
            : step.emoji
          }
        </div>
        {!isLast && (
          <div className={cn(
            'w-0.5 flex-1 mt-1 mb-1',
            isDone ? 'bg-green-300' : 'bg-gray-100',
          )} />
        )}
      </div>

      {/* Right: card */}
      <div className={cn(
        'flex-1 mb-4 rounded-2xl border p-4 shadow-sm',
        isDone   ? step.doneBg :
        isActive ? 'bg-white border-blue-200' :
                   'bg-gray-50 border-gray-100',
      )}
        style={isActive ? { borderColor: BRAND + '40' } : undefined}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <p className={cn(
              'text-sm font-bold leading-tight',
              isLocked ? 'text-gray-400' : 'text-gray-900',
            )}>
              {step.label}
            </p>
            <p className={cn(
              'text-xs mt-0.5',
              isLocked ? 'text-gray-300' : 'text-gray-500',
            )}>
              {step.subtitle}
            </p>
          </div>
          <StatusChip status={result.status} />
        </div>

        {!isLocked && (
          <p className="text-xs text-gray-600 mt-2 leading-relaxed">{step.description}</p>
        )}

        {result.completedAt && (
          <p className={cn('text-xs font-medium mt-2', step.doneText)}>
            ✓ {formatDate(result.completedAt)}
          </p>
        )}

        {isActive && (
          <div
            className="mt-3 px-3 py-2 rounded-xl text-xs leading-relaxed"
            style={{ background: `${BRAND}10`, color: BRAND }}
          >
            <span className="font-bold">Tips: </span>{step.tip}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Progress header ──────────────────────────────────────────────────────────

function JourneyHeader({
  completedSteps,
  totalSteps,
  category,
}: {
  completedSteps: number;
  totalSteps:     number;
  category:       string | null;
}) {
  const pct = Math.round((completedSteps / totalSteps) * 100);
  return (
    <div
      className="rounded-2xl p-5 text-white shadow-sm mb-4"
      style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #0d48b2 100%)` }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold">
          {category ? `Körkortsresa – kategori ${category}` : 'Min körkortsresa'}
        </p>
        <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-full">
          {completedSteps}/{totalSteps} klara
        </span>
      </div>
      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-white rounded-full transition-all duration-700"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <p className="text-white/70 text-xs mt-2">{pct}% av utbildningsvägen genomförd</p>
    </div>
  );
}

// ─── StudentPortalKorkortsresaPage ────────────────────────────────────────────

export function StudentPortalKorkortsresaPage() {
  const { data: progress, isLoading, isError } = usePortalProgress();
  const { data: me } = usePortalMe();

  const stageResults = useMemo(
    () => STEPS.map(step => step.compute({
      permitStage:        progress?.permit_stage        ?? 'not_started',
      risk1_completed_at: progress?.risk1_completed_at  ?? null,
      risk2_completed_at: progress?.risk2_completed_at  ?? null,
      theory_passed_at:   progress?.theory_passed_at    ?? null,
      practical_passed_at:progress?.practical_passed_at ?? null,
    })),
    [progress],
  );

  const completedCount = stageResults.filter(r => r.status === 'done').length;

  return (
    <div className="space-y-2">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Min körkortsresa</h1>
        <p className="text-sm text-gray-400 mt-0.5">Från tillstånd till körkort</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">Kunde inte hämta framstegsdata. Försök igen senare.</p>
        </div>
      )}

      {!isLoading && !isError && progress && (
        <>
          <JourneyHeader
            completedSteps={completedCount}
            totalSteps={STEPS.length}
            category={me?.target_licence_category ?? null}
          />
          <div className="pt-2">
            {STEPS.map((step, i) => (
              <StepCard
                key={step.key}
                step={step}
                result={stageResults[i]!}
                isLast={i === STEPS.length - 1}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
