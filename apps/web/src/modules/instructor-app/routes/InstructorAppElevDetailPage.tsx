import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft, Phone, Mail, Star, AlertTriangle, AlertCircle,
  CheckCircle, Circle, Loader2, ClipboardCheck, TrendingUp,
  History, StickyNote, Wallet, CalendarClock, Car,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInstructorCtx } from './InstructorAppLayout.js';
import {
  useMyStudents, useStudentSummary, useAssessment, useSaveAssessment,
  useLessonContext, useLessonHistory,
  type LessonHistoryEntry,
} from '../hooks/useInstructorApp.js';
import { PERMIT_STAGE_LABELS, getProgressPct, type PermitStage } from '@modules/student-portal/lib/permitStage.js';
import { cn } from '@/lib/utils.js';

// ─── Assessment (P1-3) — same competency/readiness keys and one-per-
// instructor-per-student model as instructor-portal/utbildningskort, reused
// not reinvented, so a student's card reads consistently regardless of which
// instructor surface last touched it. ──────────────────────────────────────

const COMPETENCIES = [
  { key: 'stadskorning', label: 'Stadskörning' },
  { key: 'landsvag',     label: 'Landsväg' },
  { key: 'motorvag',     label: 'Motorväg' },
  { key: 'parkering',    label: 'Parkering' },
  { key: 'backning',     label: 'Backning' },
  { key: 'cirkulation',  label: 'Cirkulationsplats' },
  { key: 'morker',       label: 'Körning i mörker' },
  { key: 'halka',        label: 'Halkkörning' },
] as const;

const READINESS = [
  { key: 'risk1',     label: 'Redo för Riskettan' },
  { key: 'risk2',     label: 'Redo för Risktvåan' },
  { key: 'theory',    label: 'Redo för Kunskapsprov' },
  { key: 'practical', label: 'Redo för Körprov' },
] as const;

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Ej påbörjad',       cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  { value: 'in_progress', label: 'Pågående',           cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { value: 'mastered',    label: 'Behärskas',          cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  { value: 'needs_more',  label: 'Kräver mer träning', cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
] as const;

// ─── Lesson context (PORTALS V1.1 Phase 3) ────────────────────────────────────
// Compact, scannable "who / where in training / what happened / what's next"
// view sourced from the single aggregated GET /students/:id/lesson-context
// endpoint — one round trip instead of several. Sections render only when
// meaningful data exists (per the approved design), each with its own loading/
// empty/error handling folded into the single query above.

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function ContextCard({ icon: Icon, label, children }: { icon: typeof TrendingUp; label: string; children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-2">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </p>
      {children}
    </div>
  );
}

function LessonContextSection({ studentId }: { studentId: string }) {
  const { data: ctx, isLoading, isError } = useLessonContext(studentId);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
      </div>
    );
  }
  if (isError) {
    return <p className="text-xs text-red-600 dark:text-red-400">Kunde inte hämta lektionsöversikt.</p>;
  }
  if (!ctx) return null;

  const pct   = getProgressPct(ctx.progress.permit_stage);
  const stage = PERMIT_STAGE_LABELS[ctx.progress.permit_stage as PermitStage] ?? ctx.progress.permit_stage;

  return (
    <div className="space-y-3">
      {/* PROGRESS */}
      <ContextCard icon={TrendingUp} label="Progress">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{stage}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{pct}%</p>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      </ContextCard>

      {/* LAST LESSON */}
      {ctx.last_lesson && (
        <ContextCard icon={History} label="Senaste lektion">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {ctx.last_lesson.lesson_type_name ?? 'Körlektion'}
            </p>
            <span className={cn(
              'text-[10px] font-bold px-2 py-0.5 rounded-full',
              ctx.last_lesson.status === 'completed'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
            )}>
              {ctx.last_lesson.status === 'completed' ? 'Genomförd' : 'Uteblev'}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {formatShortDate(ctx.last_lesson.starts_at)}
            {ctx.last_lesson.instructor_first_name && ` · ${ctx.last_lesson.instructor_first_name} ${ctx.last_lesson.instructor_last_name ?? ''}`}
          </p>
          {ctx.last_lesson.performance_rating !== null && (
            <StarDisplay rating={ctx.last_lesson.performance_rating} />
          )}
          {ctx.last_lesson.evaluation_outcome && (
            <p className="text-xs text-gray-600 dark:text-gray-400">{ctx.last_lesson.evaluation_outcome}</p>
          )}
        </ContextCard>
      )}

      {/* LAST ASSESSMENT */}
      {ctx.last_assessment && (
        <ContextCard icon={ClipboardCheck} label="Senaste bedömning">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {formatShortDate(ctx.last_assessment.assessed_at)}
          </p>
          {ctx.last_assessment.notes && (
            <p className="text-sm text-gray-700 dark:text-gray-300">{ctx.last_assessment.notes}</p>
          )}
        </ContextCard>
      )}

      {/* NOTES */}
      {ctx.notes.length > 0 && (
        <ContextCard icon={StickyNote} label="Anteckningar">
          {ctx.notes.map((n, i) => (
            <p key={i} className="text-sm text-gray-700 dark:text-gray-300">
              <span className="text-gray-400 dark:text-gray-500">{formatShortDate(n.created_at)} — </span>
              {n.content}
            </p>
          ))}
        </ContextCard>
      )}

      {/* PACKAGE */}
      {ctx.package && (
        <ContextCard icon={Wallet} label="Paket">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{ctx.package.package_name}</p>
            <p className="text-sm font-bold text-purple-600 dark:text-purple-400 tabular-nums">
              {ctx.package.remaining} kvar
            </p>
          </div>
        </ContextCard>
      )}

      {/* NEXT */}
      {ctx.next_lesson && (
        <ContextCard icon={CalendarClock} label="Nästa lektion">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {formatShortDate(ctx.next_lesson.starts_at)} kl. {formatShortTime(ctx.next_lesson.starts_at)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {ctx.next_lesson.lesson_type_name ?? 'Körlektion'}
          </p>
        </ContextCard>
      )}

      {/* VEHICLE */}
      {ctx.vehicle && (
        <ContextCard icon={Car} label="Fordon">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {ctx.vehicle.make} {ctx.vehicle.model}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{ctx.vehicle.registration_number}</p>
        </ContextCard>
      )}
    </div>
  );
}

// ─── Lesson history (Final Gap Analysis P2-1) ──────────────────────────────────
// LessonContextSection above shows only the single most recent lesson — this
// gives the instructor the full chronological list, bounded and paginated via
// GET /students/:id/lesson-history, same authorization and same fields as the
// last_lesson entry already exposed there (no financial/personnummer/guardian
// data added).

function LessonHistorySection({ studentId }: { studentId: string }) {
  const [before, setBefore] = useState<string | undefined>(undefined);
  const [allLessons, setAllLessons] = useState<LessonHistoryEntry[]>([]);
  const { data, isLoading, isError } = useLessonHistory(studentId, before ? { before } : {});

  useEffect(() => {
    if (data) {
      setAllLessons(prev => (before ? [...prev, ...data.lessons] : data.lessons));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (isLoading && allLessons.length === 0) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}
      </div>
    );
  }
  if (isError) {
    return <p className="text-xs text-red-600 dark:text-red-400">Kunde inte hämta lektionshistorik.</p>;
  }
  if (allLessons.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">Inga tidigare lektioner ännu.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
        {allLessons.map(lesson => (
          <div key={lesson.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                {lesson.lesson_type_name ?? 'Körlektion'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{formatShortDate(lesson.starts_at)}</p>
            </div>
            <span className={cn(
              'shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full',
              lesson.status === 'completed'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
            )}>
              {lesson.status === 'completed' ? 'Genomförd' : 'Uteblev'}
            </span>
          </div>
        ))}
      </div>
      {data?.has_more && (
        <button
          onClick={() => setBefore(allLessons[allLessons.length - 1]?.starts_at)}
          disabled={isLoading}
          className="w-full py-2 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50"
        >
          {isLoading ? 'Laddar...' : 'Visa fler'}
        </button>
      )}
    </div>
  );
}

function AssessmentSection({ studentId, studentFirstName }: { studentId: string; studentFirstName: string }) {
  const { data: assessment, isLoading, isError } = useAssessment(studentId);
  const save = useSaveAssessment();

  const [competencies, setCompetencies] = useState<Partial<Record<string, string>>>({});
  const [readiness,    setReadiness]    = useState<Partial<Record<string, boolean>>>({});
  const [notes,        setNotes]        = useState('');
  const [initialized,  setInitialized]  = useState(false);
  const [saved,        setSaved]        = useState(false);

  useEffect(() => {
    if (!initialized && !isLoading) {
      if (assessment) {
        setCompetencies(assessment.competencies);
        setReadiness(assessment.readiness);
        setNotes(assessment.notes ?? '');
      }
      setInitialized(true);
    }
  }, [assessment, isLoading, initialized]);

  function handleSave() {
    save.mutate(
      { studentId, competencies: competencies as Record<string, string>, readiness: readiness as Record<string, boolean>, notes },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); } },
    );
  }

  if (isLoading && !initialized) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>;
  }
  if (isError) {
    return <p className="text-xs text-red-600 dark:text-red-400">Kunde inte hämta bedömningen.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {COMPETENCIES.map(comp => {
          const current = competencies[comp.key] ?? 'not_started';
          const cfg = STATUS_OPTIONS.find(o => o.value === current) ?? STATUS_OPTIONS[0];
          return (
            <div key={comp.key} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
              <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">{comp.label}</p>
              <select
                value={current}
                onChange={e => setCompetencies(prev => ({ ...prev, [comp.key]: e.target.value }))}
                className={cn('text-xs font-bold px-2 py-1 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-purple-300', cfg.cls)}
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {READINESS.map(item => {
          const value = Boolean(readiness[item.key]);
          return (
            <button
              key={item.key}
              onClick={() => setReadiness(prev => ({ ...prev, [item.key]: !value }))}
              className={cn(
                'flex items-center gap-2 w-full px-4 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0 text-left transition-colors',
                value ? 'bg-green-50 dark:bg-green-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
              )}
            >
              {value
                ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                : <Circle className="w-4 h-4 text-gray-200 dark:text-gray-700 shrink-0" />}
              <p className={cn('text-sm', value ? 'text-green-800 dark:text-green-300' : 'text-gray-700 dark:text-gray-300')}>{item.label}</p>
            </button>
          );
        })}
      </div>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        placeholder={`Anteckningar om ${studentFirstName}s utbildning...`}
        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-gray-600"
      />

      {save.isError && (
        <p className="text-xs text-red-600 dark:text-red-400 text-center">Kunde inte spara — försök igen.</p>
      )}

      <button
        onClick={handleSave}
        disabled={save.isPending}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold transition-colors"
      >
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : null}
        {saved ? 'Sparat' : 'Spara bedömning'}
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  lead:       { label: 'Intressent',   cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  onboarding: { label: 'Onboarding',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  active:     { label: 'Aktiv',        cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  paused:     { label: 'Pausad',       cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  completed:  { label: 'Klar',         cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  archived:   { label: 'Arkiverad',    cls: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500' },
};

function formatLicCat(cat: string): string {
  return cat ? cat.replace(/_?(automat|auto|manuell|manual)/i, '').trim().toUpperCase() || cat.toUpperCase() : '';
}

function StarDisplay({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            'w-4 h-4',
            i <= rounded
              ? 'fill-amber-400 text-amber-400'
              : 'fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700',
          )}
        />
      ))}
    </div>
  );
}

// ─── InstructorAppElevDetailPage ──────────────────────────────────────────────

export function InstructorAppElevDetailPage() {
  const { studentId }   = useParams<{ studentId: string }>();
  const { instructor }  = useInstructorCtx();
  const navigate        = useNavigate();

  const { data: students, isLoading: loadingStudents } = useMyStudents(instructor.id);
  const { data: summary, isLoading: loadingSummary }   = useStudentSummary(instructor.id, studentId);

  const student = (students ?? []).find(s => s.id === studentId);

  if (loadingStudents) {
    return (
      <div className="px-4 py-5 space-y-4 max-w-lg mx-auto animate-pulse">
        <div className="h-10 w-36 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        <div className="h-28 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center gap-4">
        <AlertCircle className="w-12 h-12 text-gray-300 dark:text-gray-600" />
        <p className="font-semibold text-gray-500 dark:text-gray-400">Eleven hittades inte</p>
        <button
          onClick={() => navigate('/instructor-app/elever')}
          className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
        >
          Tillbaka till elevlistan
        </button>
      </div>
    );
  }

  const initials   = `${student.first_name.charAt(0)}${student.last_name.charAt(0)}`.toUpperCase();
  const statusCfg  = STATUS_LABELS[student.status] ?? { label: student.status, cls: 'bg-gray-100 text-gray-500' };
  const hasContact = Boolean(student.phone || student.email);

  return (
    <div className="max-w-lg mx-auto">
      {/* Back header */}
      <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => navigate('/instructor-app/elever')}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 -ml-1 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
          {student.first_name} {student.last_name}
        </h1>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* Profile card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-purple-700 dark:text-purple-300">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {student.first_name} {student.last_name}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', statusCfg.cls)}>
                  {statusCfg.label}
                </span>
                {student.target_licence_category && (
                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full">
                    Kat. {formatLicCat(student.target_licence_category)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Contact */}
        {hasContact && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-4 pt-3.5 pb-1">
              Kontakt
            </p>
            {student.phone && (
              <a
                href={`tel:${student.phone}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-t border-gray-50 dark:border-gray-800"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Telefon</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{student.phone}</p>
                </div>
              </a>
            )}
            {student.email && (
              <a
                href={`mailto:${student.email}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-t border-gray-50 dark:border-gray-800"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">E-post</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{student.email}</p>
                </div>
              </a>
            )}
          </div>
        )}

        {/* Stats */}
        {loadingSummary ? (
          <div className="space-y-3">
            <div className="h-4 w-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : summary && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Statistik
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 text-center">
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {summary.completed}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Genomförda</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 text-center">
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                  {summary.upcoming}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Kommande</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col items-center justify-center gap-1">
                {summary.avg_rating !== null ? (
                  <>
                    <StarDisplay rating={summary.avg_rating} />
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">Snittbetyg</p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-bold text-gray-300 dark:text-gray-600">—</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">Snittbetyg</p>
                  </>
                )}
              </div>
            </div>
            {summary.no_show > 0 && (
              <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-800/60">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold">
                  {summary.no_show} utebliven{summary.no_show !== 1 ? 'a' : ''} lektion{summary.no_show !== 1 ? 'er' : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Lesson context (Phase 3) */}
        <LessonContextSection studentId={student.id} />

        {/* Lesson history (P2-1) */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <History className="w-3.5 h-3.5" />
            Lektionshistorik
          </p>
          <LessonHistorySection studentId={student.id} />
        </div>

        {/* Competency assessment (P1-3) */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <ClipboardCheck className="w-3.5 h-3.5" />
            Bedömning
          </p>
          <AssessmentSection studentId={student.id} studentFirstName={student.first_name} />
        </div>
      </div>
    </div>
  );
}
