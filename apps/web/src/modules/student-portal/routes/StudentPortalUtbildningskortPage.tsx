import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Star, AlertCircle, Loader2, BookOpen } from 'lucide-react';
import { usePortalHistory } from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#684EFF';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Competency definitions ───────────────────────────────────────────────────

interface CompetencyDef {
  key:      string;
  label:    string;
  icon:     string;
  keywords: string[];
  desc:     string;
}

const COMPETENCIES: CompetencyDef[] = [
  { key: 'stadskorning',   label: 'Stadskörning',      icon: '🏙️', keywords: ['stad', 'körlektion', 'B -', 'kör'], desc: 'Körning i tätbebyggt område med korsningar, övergångsställen och parkering.' },
  { key: 'landsvag',       label: 'Landsväg',          icon: '🛣️', keywords: ['landsvä', 'lands', 'utanför'], desc: 'Körning utanför tättbebyggt område med högre hastigheter.' },
  { key: 'motorvag',       label: 'Motorväg',          icon: '🚀', keywords: ['motorvä', 'motor', 'E4', 'E20'], desc: 'Motorvägskörning med påfart, avfart och filbyten.' },
  { key: 'parkering',      label: 'Parkering',         icon: '🅿️', keywords: ['parke', 'fickpark', 'vinkel'], desc: 'Parallellparkering, fickparkering och vändning.' },
  { key: 'backning',       label: 'Backning',          icon: '⬅️', keywords: ['back', 'vänd', 'backe'], desc: 'Backning i rak linje, runt hörn och vändning.' },
  { key: 'cirkulation',    label: 'Cirkulationsplats', icon: '🔄', keywords: ['cirku', 'rondell', 'rond', 'ring'], desc: 'Körning in, i och ut ur rondell och cirkulationsplats.' },
  { key: 'morker',         label: 'Körning i mörker',  icon: '🌙', keywords: ['mörk', 'risk 2', 'risk2', 'natt', 'mörkerkör'], desc: 'Mörkerövning, belysning och siktsträcka.' },
  { key: 'halka',          label: 'Halkkörning',       icon: '❄️', keywords: ['halk', 'risk 1', 'risk1', 'is', 'snö', 'vinter'], desc: 'Körning på halt underlag, undvikningsmanöver och ABS.' },
];

// ─── Status derivation from lesson history ─────────────────────────────────────

type CompetencyStatus = 'not_started' | 'in_progress' | 'mastered' | 'needs_more';

interface CompetencyResult {
  status:       CompetencyStatus;
  lessonCount:  number;
  avgRating:    number | null;
  lessons:      {
    id:           string;
    starts_at:    string;
    lesson_type:  string | null;
    notes:        string | null;
    rating:       number | null;
  }[];
}

function matchesCompetency(lessonTypeName: string | null, keywords: string[]): boolean {
  if (!lessonTypeName) return false;
  const lower = lessonTypeName.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

function deriveStatus(lessonCount: number, avgRating: number | null): CompetencyStatus {
  if (lessonCount === 0) return 'not_started';
  if (lessonCount <= 2)  return 'in_progress';
  if (avgRating === null) return 'in_progress';
  if (avgRating >= 3.5)  return 'mastered';
  return 'needs_more';
}

function useCompetencies() {
  const { data: history = [], isLoading, isError } = usePortalHistory();

  const results = useMemo((): Record<string, CompetencyResult> => {
    const completed = history.filter(h => h.status === 'completed');
    return Object.fromEntries(
      COMPETENCIES.map(comp => {
        const matching = completed.filter(h => matchesCompetency(h.lesson_type_name, comp.keywords));
        const ratings  = matching.filter(h => h.performance_rating !== null).map(h => h.performance_rating!);
        const avgRating = ratings.length > 0
          ? ratings.reduce((a, b) => a + b, 0) / ratings.length
          : null;
        const lessons = matching.map(h => ({
          id:          h.id,
          starts_at:   h.starts_at,
          lesson_type: h.lesson_type_name,
          notes:       h.instructor_notes,
          rating:      h.performance_rating,
        }));
        const result: CompetencyResult = {
          status:      deriveStatus(matching.length, avgRating),
          lessonCount: matching.length,
          avgRating,
          lessons,
        };
        return [comp.key, result];
      }),
    );
  }, [history]);

  return { results, isLoading, isError, totalLessons: history.filter(h => h.status === 'completed').length };
}

// ─── Rating stars ─────────────────────────────────────────────────────────────

function RatingDots({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={cn(
            'w-2 h-2 rounded-full',
            i < Math.round(rating) ? 'bg-amber-400' : 'bg-gray-200',
          )}
        />
      ))}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: CompetencyStatus }) {
  const cfg: Record<CompetencyStatus, { label: string; cls: string }> = {
    not_started: { label: 'Ej påbörjad',    cls: 'bg-gray-100 text-gray-500'   },
    in_progress: { label: 'Pågående',        cls: 'bg-amber-100 text-amber-700' },
    mastered:    { label: 'Behärskas',       cls: 'bg-green-100 text-green-700' },
    needs_more:  { label: 'Kräver mer träning', cls: 'bg-red-100 text-red-600'  },
  };
  const { label, cls } = cfg[status];
  return <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full', cls)}>{label}</span>;
}

// ─── Competency card ──────────────────────────────────────────────────────────

function CompetencyCard({ comp, result }: { comp: CompetencyDef; result: CompetencyResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => result.lessonCount > 0 ? setExpanded(v => !v) : undefined}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-4 text-left',
          result.lessonCount > 0 ? 'hover:bg-gray-50 transition-colors cursor-pointer' : 'cursor-default',
        )}
      >
        <span className="text-xl shrink-0">{comp.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{comp.label}</p>
            <StatusPill status={result.status} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {result.lessonCount === 0
              ? 'Inga lektioner registrerade'
              : `${result.lessonCount} lektion${result.lessonCount > 1 ? 'er' : ''}`}
            {result.avgRating !== null && ` · snitt `}
            {result.avgRating !== null && (
              <span className="inline-flex items-center gap-0.5">
                {result.avgRating.toFixed(1)}
                <Star className="w-2.5 h-2.5 text-amber-400 inline fill-amber-400" />
              </span>
            )}
          </p>
        </div>
        {result.lessonCount > 0 && (
          expanded ? <ChevronUp className="w-4 h-4 text-gray-300 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" />
        )}
      </button>

      {expanded && result.lessons.length > 0 && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{comp.desc}</p>
          {result.lessons.slice(0, 5).map(lesson => (
            <div key={lesson.id} className="bg-gray-50 rounded-xl px-3 py-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs font-medium text-gray-700">{formatDate(lesson.starts_at)}</p>
                {lesson.rating !== null && <RatingDots rating={lesson.rating} />}
              </div>
              {lesson.notes && (
                <p className="text-xs text-gray-500 leading-relaxed italic">
                  "{lesson.notes}"
                </p>
              )}
            </div>
          ))}
          {result.lessons.length > 5 && (
            <p className="text-xs text-gray-400 text-center">
              + {result.lessons.length - 5} fler lektioner
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── StudentPortalUtbildningskortPage ─────────────────────────────────────────

export function StudentPortalUtbildningskortPage() {
  const { results, isLoading, isError, totalLessons } = useCompetencies();

  const masteredCount  = COMPETENCIES.filter(c => results[c.key]?.status === 'mastered').length;
  const inProgressCount = COMPETENCIES.filter(c => results[c.key]?.status === 'in_progress').length;
  const needsMoreCount = COMPETENCIES.filter(c => results[c.key]?.status === 'needs_more').length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Utbildningskort</h1>
        <p className="text-sm text-gray-400 mt-0.5">Körkompetenser från dina lektioner</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">Kunde inte hämta din lektionshistorik.</p>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Summary stats */}
          {totalLessons > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-green-50 border border-green-100 rounded-2xl p-3 text-center">
                <p className="text-lg font-bold text-green-700">{masteredCount}</p>
                <p className="text-[10px] text-green-600 font-medium mt-0.5">Behärskas</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
                <p className="text-lg font-bold text-amber-700">{inProgressCount}</p>
                <p className="text-[10px] text-amber-600 font-medium mt-0.5">Pågående</p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-center">
                <p className="text-lg font-bold text-red-600">{needsMoreCount}</p>
                <p className="text-[10px] text-red-500 font-medium mt-0.5">Mer träning</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {totalLessons === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center space-y-3">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                style={{ background: `${BRAND}10` }}
              >
                <BookOpen className="w-7 h-7" style={{ color: BRAND }} />
              </div>
              <p className="text-sm font-semibold text-gray-700">Inga genomförda lektioner ännu</p>
              <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
                Ditt utbildningskort fylls på automatiskt efter varje genomförd lektion baserat på instruktörens bedömning.
              </p>
            </div>
          )}

          {/* Competency list */}
          <div>
            <p className="text-[#684EFF] text-xs font-bold uppercase tracking-wide mb-2">
              Kompetenser
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              {COMPETENCIES.map(comp => (
                <CompetencyCard
                  key={comp.key}
                  comp={comp}
                  result={results[comp.key] ?? {
                    status:      'not_started',
                    lessonCount: 0,
                    avgRating:   null,
                    lessons:     [],
                  }}
                />
              ))}
            </div>
          </div>

          <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
            <p className="text-xs text-blue-700 leading-relaxed">
              <span className="font-bold">Om utbildningskortet:</span> Kompetenserna uppdateras automatiskt
              baserat på dina genomförda lektioner och instruktörens bedömningar.
              Tryck på en kompetens för att se detaljer och lärarkommentarer.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
