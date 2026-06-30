import { ArrowLeft, Phone, Mail, Star, AlertTriangle, AlertCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInstructorCtx } from './InstructorAppLayout.js';
import { useMyStudents, useStudentSummary } from '../hooks/useInstructorApp.js';
import { cn } from '@/lib/utils.js';

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
      </div>
    </div>
  );
}
