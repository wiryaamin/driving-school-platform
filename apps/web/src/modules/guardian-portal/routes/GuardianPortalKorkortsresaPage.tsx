import { CheckCircle2, Circle, AlertCircle, Phone, Mail } from 'lucide-react';
import { useGuardianMe, useGuardianProgress } from '../hooks/useGuardianPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#2D5BE3';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

const STAGE_ORDER = [
  'not_started', 'theory_study',
  'risk1_booked', 'risk1_completed',
  'risk2_booked', 'risk2_completed',
  'theory_exam_booked', 'theory_passed',
  'practical_exam_booked', 'practical_passed', 'licence_issued',
] as const;

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as typeof STAGE_ORDER[number]);
  return idx < 0 ? 0 : idx;
}

type StageStatus = 'done' | 'active' | 'planned' | 'locked';

interface Step {
  label:       string;
  description: string;
  icon:        string;
  tip:         string;
  compute: (progress: {
    permit_stage:        string;
    risk1_completed_at:  string | null;
    risk2_completed_at:  string | null;
    theory_passed_at:    string | null;
    practical_passed_at: string | null;
  }) => { status: StageStatus; completedAt?: string | null };
}

const STEPS: Step[] = [
  {
    label: 'Körkortstillstånd',
    description: 'Ansökan om körkortstillstånd beviljad',
    icon: '📋',
    tip: 'Ansökan görs via Transportstyrelsen.',
    compute: () => ({ status: 'done' }),
  },
  {
    label: 'Riskettan',
    description: 'Riskutbildning del 1 — halka och olycksrisk',
    icon: '❄️',
    tip: 'Genomförs på en halkbana med instruktör.',
    compute: p => {
      const idx = stageIndex(p.permit_stage);
      if (p.risk1_completed_at) return { status: 'done', completedAt: p.risk1_completed_at };
      if (idx >= 2)             return { status: 'active' };
      return                           { status: 'planned' };
    },
  },
  {
    label: 'Risktvåan',
    description: 'Riskutbildning del 2 — mörker och trötthet',
    icon: '🌙',
    tip: 'Genomförs vanligtvis mot slutet av utbildningen.',
    compute: p => {
      const idx = stageIndex(p.permit_stage);
      if (p.risk2_completed_at) return { status: 'done', completedAt: p.risk2_completed_at };
      if (idx >= 4)             return { status: 'active' };
      if (p.risk1_completed_at) return { status: 'planned' };
      return                           { status: 'locked' };
    },
  },
  {
    label: 'Kunskapsprov',
    description: 'Godkänt teoriprov hos Trafikverket',
    icon: '📚',
    tip: 'Bokas hos Trafikverket. Kräver godkänd Risk 1.',
    compute: p => {
      const idx = stageIndex(p.permit_stage);
      if (p.theory_passed_at) return { status: 'done', completedAt: p.theory_passed_at };
      if (idx >= 6)           return { status: 'active' };
      if (p.risk1_completed_at) return { status: 'planned' };
      return                         { status: 'locked' };
    },
  },
  {
    label: 'Körprov',
    description: 'Godkänt praktiskt körprov hos Trafikverket',
    icon: '🚗',
    tip: 'Kräver godkänt kunskapsprov, Risk 1 och Risk 2.',
    compute: p => {
      const idx = stageIndex(p.permit_stage);
      if (p.practical_passed_at) return { status: 'done', completedAt: p.practical_passed_at };
      if (idx >= 8)              return { status: 'active' };
      if (p.theory_passed_at)    return { status: 'planned' };
      return                            { status: 'locked' };
    },
  },
  {
    label: 'Körkort',
    description: 'Körkortet är utfärdat och skickat',
    icon: '🏆',
    tip: 'Skickas automatiskt hem efter godkänt körprov.',
    compute: p => {
      const idx = stageIndex(p.permit_stage);
      if (idx >= 10)             return { status: 'done' };
      if (p.practical_passed_at) return { status: 'planned' };
      return                            { status: 'locked' };
    },
  },
];

const STATUS_STYLES: Record<StageStatus, { node: string; label: string; labelText: string }> = {
  done:    { node: 'bg-green-500 text-white',  label: 'Genomförd', labelText: 'text-green-700' },
  active:  { node: 'bg-blue-500 text-white',   label: 'Pågående',  labelText: 'text-blue-700'  },
  planned: { node: 'bg-amber-400 text-white',  label: 'Planerad',  labelText: 'text-amber-700' },
  locked:  { node: 'bg-gray-200 text-gray-400',label: 'Ej påbörjad',labelText: 'text-gray-400' },
};

export function GuardianPortalKorkortsresaPage() {
  const { data: me }                            = useGuardianMe();
  const { data: progress, isLoading, isError } = useGuardianProgress();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (isError || !progress) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        <p className="text-sm text-red-600">Kunde inte hämta framsteg.</p>
      </div>
    );
  }

  const results = STEPS.map(s => ({ ...s, result: s.compute(progress) }));
  const doneCount = results.filter(s => s.result.status === 'done').length;

  return (
    <div className="space-y-6">

      {/* Hero */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #2D5BE3 0%, #0d48b2 100%)' }}
      >
        <p className="text-white/70 text-xs font-bold uppercase tracking-wide mb-1">Körkortsresa</p>
        <p className="text-xl font-bold">{doneCount} av {STEPS.length} steg klara</p>
        <div className="mt-3 h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${Math.round((doneCount / STEPS.length) * 100)}%` }}
          />
        </div>
        <p className="text-white/60 text-xs mt-1.5">
          {Math.round((doneCount / STEPS.length) * 100)}% genomfört
        </p>
      </div>

      {/* School contact — shown when a risk step is active */}
      {results.some(r => r.result.status === 'active' &&
        (r.label === 'Riskettan' || r.label === 'Risktvåan')) &&
       (me?.organization.phone ?? me?.organization.email) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: BRAND }}>
            Boka via trafikskolan
          </p>
          <p className="text-xs text-gray-500">
            Riskutbildning bokas via trafikskolan. Kontakta oss för att komma vidare.
          </p>
          {me?.organization.phone && (
            <a
              href={`tel:${me.organization.phone}`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <Phone className="w-4 h-4 shrink-0" />
              {me.organization.phone}
            </a>
          )}
          {me?.organization.email && (
            <a
              href={`mailto:${me.organization.email}`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <Mail className="w-4 h-4 shrink-0" />
              {me.organization.email}
            </a>
          )}
        </div>
      )}

      {/* Timeline */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>Utbildningsväg</p>
        <div className="bg-white rounded-2xl border border-gray-100 px-5 pt-5 pb-2 shadow-sm">
          <div className="relative">
            <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-gray-100" aria-hidden="true" />
            {results.map(({ label, description, icon, tip, result }, i) => {
              const st  = STATUS_STYLES[result.status];
              const active = result.status === 'active';
              return (
                <div key={i} className="flex items-start gap-4">
                  <div
                    className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10', st.node)}
                  >
                    {result.status === 'done'
                      ? <CheckCircle2 className="w-4 h-4" />
                      : result.status === 'locked'
                        ? <Circle className="w-4 h-4" />
                        : <span className="text-sm">{icon}</span>
                    }
                  </div>
                  <div className="flex-1 pb-5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn(
                        'text-sm font-semibold',
                        result.status === 'done' ? 'text-gray-900'
                          : active ? 'text-blue-600'
                          : result.status === 'locked' ? 'text-gray-400'
                          : 'text-gray-700',
                      )}>
                        {label}
                      </p>
                      <span className={cn('text-[10px] font-bold uppercase tracking-wide', st.labelText)}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                    {result.completedAt && (
                      <p className="text-[10px] text-green-600 mt-1">Avklarat {formatDate(result.completedAt)}</p>
                    )}
                    {active && (
                      <p className="text-xs text-blue-600 mt-1 bg-blue-50 px-2 py-1 rounded-xl inline-block">
                        {tip}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
