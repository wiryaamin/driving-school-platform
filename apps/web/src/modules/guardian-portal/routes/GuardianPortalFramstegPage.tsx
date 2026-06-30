import { useMemo } from 'react';
import { CheckCircle2, TrendingUp, AlertCircle, Star, Circle } from 'lucide-react';
import {
  useGuardianProgress,
  useGuardianBookings,
  useGuardianAssessments,
  type GuardianBooking,
  type GuardianAssessment,
} from '../hooks/useGuardianPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#1055C9';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Competency config (matches instructor portal + assessment DB keys) ─────────

const COMPETENCIES = [
  { key: 'stadskorning', label: 'Stadskörning',      icon: '🏙️', keywords: ['stad', 'körlektion', 'kör']           },
  { key: 'landsvag',     label: 'Landsväg',           icon: '🛣️', keywords: ['landsvä', 'lands', 'utanför']         },
  { key: 'motorvag',     label: 'Motorväg',           icon: '🚀', keywords: ['motorvä', 'motor', 'E4', 'E20']       },
  { key: 'parkering',    label: 'Parkering',          icon: '🅿️', keywords: ['parke', 'fickpark', 'vinkel']         },
  { key: 'backning',     label: 'Backning',           icon: '⬅️', keywords: ['back', 'vänd', 'backe']               },
  { key: 'cirkulation',  label: 'Cirkulationsplats',  icon: '🔄', keywords: ['cirku', 'rondell', 'rond', 'ring']    },
  { key: 'morker',       label: 'Körning i mörker',   icon: '🌙', keywords: ['mörk', 'risk 2', 'risk2', 'natt']    },
  { key: 'halka',        label: 'Halkkörning',        icon: '❄️', keywords: ['halk', 'risk 1', 'risk1', 'is', 'snö'] },
] as const;

type CompKey = typeof COMPETENCIES[number]['key'];
type CompStatus = 'not_started' | 'in_progress' | 'mastered' | 'needs_more';

const STATUS_CFG: Record<CompStatus, { label: string; bg: string; text: string }> = {
  not_started: { label: 'Ej påbörjad',   bg: 'bg-gray-50',   text: 'text-gray-500'  },
  in_progress: { label: 'Pågående',       bg: 'bg-blue-50',   text: 'text-blue-700'  },
  mastered:    { label: 'Behärskas',      bg: 'bg-green-50',  text: 'text-green-700' },
  needs_more:  { label: 'Kräver träning', bg: 'bg-amber-50',  text: 'text-amber-700' },
};

// ─── Derive competencies from booking lesson-type keywords (fallback) ──────────

function matchesKeywords(name: string, keywords: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

function deriveCompetencies(bookings: GuardianBooking[]): Record<CompKey, { status: CompStatus; count: number }> {
  const result = {} as Record<CompKey, { status: CompStatus; count: number }>;
  for (const comp of COMPETENCIES) {
    const matching = bookings.filter(b => {
      const name = b.lesson_slots?.lesson_types?.name ?? '';
      return name.length > 0 && matchesKeywords(name, comp.keywords) && b.status === 'completed';
    });
    const count = matching.length;
    const status: CompStatus = count === 0 ? 'not_started' : count <= 2 ? 'in_progress' : 'mastered';
    result[comp.key] = { status, count };
  }
  return result;
}

// ─── Merge instructor assessment data over the keyword-derived baseline ────────

function mergeWithAssessment(
  derived: Record<CompKey, { status: CompStatus; count: number }>,
  assessment: GuardianAssessment | undefined,
): Record<CompKey, { status: CompStatus; count: number; fromInstructor: boolean }> {
  const result = {} as Record<CompKey, { status: CompStatus; count: number; fromInstructor: boolean }>;
  for (const comp of COMPETENCIES) {
    const instructorStatus = assessment?.competencies[comp.key] as CompStatus | undefined;
    if (instructorStatus && instructorStatus !== 'not_started') {
      result[comp.key] = { status: instructorStatus, count: derived[comp.key]?.count ?? 0, fromInstructor: true };
    } else {
      result[comp.key] = { ...derived[comp.key]!, fromInstructor: false };
    }
  }
  return result;
}

// ─── GuardianPortalFramstegPage ───────────────────────────────────────────────

export function GuardianPortalFramstegPage() {
  const { data: progress, isLoading, isError } = useGuardianProgress();
  const { data: bookings = [] }                 = useGuardianBookings();
  const { data: assessments = [] }              = useGuardianAssessments();

  const latestAssessment = assessments[0];

  const derivedComps = useMemo(() => deriveCompetencies(bookings), [bookings]);
  const competencies  = useMemo(
    () => mergeWithAssessment(derivedComps, latestAssessment),
    [derivedComps, latestAssessment],
  );

  const masteredCount    = Object.values(competencies).filter(c => c.status === 'mastered').length;
  const inProgressCount  = Object.values(competencies).filter(c => c.status === 'in_progress').length;

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

  const attendanceRate = progress.completed_count + progress.no_show_count > 0
    ? Math.round((progress.completed_count / (progress.completed_count + progress.no_show_count)) * 100)
    : null;

  return (
    <div className="space-y-6">

      {/* Lesson stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{progress.completed_count}</p>
          <p className="text-xs text-gray-500 mt-0.5">Genomförda lektioner</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{progress.upcoming_count}</p>
          <p className="text-xs text-gray-500 mt-0.5">Kommande bokningar</p>
        </div>
      </div>

      {/* Attendance breakdown */}
      {(progress.cancelled_count > 0 || progress.no_show_count > 0 || attendanceRate !== null) && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>
            Närvaro
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
            {attendanceRate !== null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-gray-700">Närvaro totalt</span>
                </div>
                <span className={cn(
                  'text-sm font-bold tabular-nums',
                  attendanceRate >= 90 ? 'text-green-600' : attendanceRate >= 75 ? 'text-amber-600' : 'text-red-600',
                )}>
                  {attendanceRate}%
                </span>
              </div>
            )}
            {progress.cancelled_count > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Avbokade lektioner</span>
                <span className="font-semibold text-gray-700 tabular-nums">{progress.cancelled_count}</span>
              </div>
            )}
            {progress.no_show_count > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Uteblivna lektioner</span>
                <span className="font-semibold text-red-600 tabular-nums">{progress.no_show_count}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instructor assessment note */}
      {latestAssessment?.notes && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <Star className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-blue-800 mb-1">
                Instruktörskommentar — {latestAssessment.instructor_name}
              </p>
              <p className="text-xs text-blue-700 leading-relaxed">{latestAssessment.notes}</p>
              <p className="text-[10px] text-blue-500 mt-1">{formatDate(latestAssessment.updated_at)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Instructor readiness */}
      {latestAssessment && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>
            Redo-bedömning
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-blue-500" />
              <p className="text-xs font-semibold text-gray-700">
                Instruktörens milstolpsbedömning · {latestAssessment.instructor_name}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'risk1',     label: 'Risk 1'    },
                { key: 'risk2',     label: 'Risk 2'    },
                { key: 'theory',    label: 'Teoriprov'  },
                { key: 'practical', label: 'Körprov'    },
              ] as const).map(({ key, label }) => {
                const ready = latestAssessment.readiness[key] === true;
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center gap-2 p-3 rounded-xl',
                      ready ? 'bg-green-50' : 'bg-gray-50',
                    )}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                      ready ? 'bg-green-100' : 'bg-gray-200',
                    )}>
                      {ready
                        ? <CheckCircle2 className="w-3 h-3 text-green-600" />
                        : <Circle       className="w-3 h-3 text-gray-400"  />
                      }
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-900">{label}</p>
                      <p className={cn('text-[10px]', ready ? 'text-green-600' : 'text-gray-400')}>
                        {ready ? 'Redo' : 'Ännu inte'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Competency summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Behärskas',   value: masteredCount,   color: 'text-green-600' },
          { label: 'Pågående',    value: inProgressCount, color: 'text-blue-600'  },
          { label: 'Ej påbörjad', value: COMPETENCIES.length - masteredCount - inProgressCount, color: 'text-gray-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
            <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Competency cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: BRAND }}>
            Utbildningskort
          </p>
          {latestAssessment && (
            <span className="text-[10px] text-gray-400">
              Instruktörsbedömning · {latestAssessment.instructor_name}
            </span>
          )}
        </div>
        <div className="space-y-2">
          {COMPETENCIES.map(comp => {
            const c   = competencies[comp.key];
            const cfg = STATUS_CFG[c.status];
            return (
              <div
                key={comp.key}
                className={cn(
                  'rounded-2xl p-4 flex items-center gap-3 border',
                  cfg.bg,
                  c.status === 'not_started' ? 'border-gray-100' : 'border-transparent',
                )}
              >
                <span className="text-2xl leading-none shrink-0">{comp.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{comp.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.count === 0
                      ? 'Ingen lektion ännu'
                      : `${c.count} lektion${c.count > 1 ? 'er' : ''}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.fromInstructor && (
                    <Star className="w-3 h-3 text-blue-400" />
                  )}
                  <span className={cn(
                    'text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full',
                    cfg.text,
                    c.status === 'not_started' ? 'bg-gray-100' : 'bg-white/60',
                  )}>
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {latestAssessment && (
          <p className="text-[10px] text-gray-400 mt-2 text-center flex items-center justify-center gap-1">
            <Star className="w-2.5 h-2.5" /> = instruktörsbedömning
          </p>
        )}
      </div>

      {/* Assessment history */}
      {assessments.length > 1 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>
            Bedömningshistorik
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 shadow-sm overflow-hidden">
            {assessments.slice(1, 5).map((a, i) => {
              const masteredKeys = Object.entries(a.competencies)
                .filter(([, v]) => String(v) === 'mastered')
                .map(([k]) => k)
                .slice(0, 4);
              return (
                <div key={i} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Star className="w-3 h-3 text-blue-400" />
                      <p className="text-xs font-semibold text-gray-700">{a.instructor_name}</p>
                    </div>
                    <p className="text-[10px] text-gray-400">{formatDate(a.updated_at)}</p>
                  </div>
                  {a.notes && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 border-l-2 border-gray-200 pl-2">
                      {a.notes}
                    </p>
                  )}
                  {masteredKeys.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {masteredKeys.map(k => (
                        <span key={k} className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-md font-medium">
                          {COMPETENCIES.find(c => c.key === k)?.label ?? k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestone dates */}
      {(progress.risk1_completed_at || progress.risk2_completed_at ||
        progress.theory_passed_at  || progress.practical_passed_at) && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>
            Godkända steg
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 shadow-sm">
            {[
              { label: 'Risk 1',    date: progress.risk1_completed_at },
              { label: 'Risk 2',    date: progress.risk2_completed_at },
              { label: 'Teoriprov', date: progress.theory_passed_at   },
              { label: 'Körprov',   date: progress.practical_passed_at},
            ].filter(m => m.date).map(m => (
              <div key={m.label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{m.label}</p>
                  <p className="text-xs text-green-600">{formatDate(m.date ?? null)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
