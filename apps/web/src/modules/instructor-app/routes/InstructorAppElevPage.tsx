import { useState, useMemo } from 'react';
import { Search, ChevronRight, Users, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInstructorCtx } from './InstructorAppLayout.js';
import { useMyStudents, type AssignedStudent } from '../hooks/useInstructorApp.js';
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

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

function formatLicCat(cat: string): string {
  return cat ? cat.replace(/_?(automat|auto|manuell|manual)/i, '').trim().toUpperCase() || cat.toUpperCase() : '';
}

const PERMIT_STAGE: Record<string, { label: string; cls: string }> = {
  not_started: { label: 'Ej påbörjat', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  learner:     { label: 'Övningskör',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  risk1:       { label: 'Risk 1',      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  risk2:       { label: 'Risk 2',      cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  theory:      { label: 'Teori',       cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  practical:   { label: 'Uppkörning', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  done:        { label: 'Klar',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
};

// ─── Student card ─────────────────────────────────────────────────────────────

function StudentCard({ student }: { student: AssignedStudent }) {
  const initials    = `${student.first_name.charAt(0)}${student.last_name.charAt(0)}`.toUpperCase();
  const permitCfg   = PERMIT_STAGE[student.permit_stage] ?? null;

  return (
    <Link
      to={`/instructor-app/elever/${student.id}`}
      className="block bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-purple-200 dark:hover:border-purple-700 transition-colors overflow-hidden"
    >
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-purple-700 dark:text-purple-300">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {student.first_name} {student.last_name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {student.target_licence_category && (
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                {formatLicCat(student.target_licence_category)}
              </span>
            )}
            {permitCfg && (
              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', permitCfg.cls)}>
                {permitCfg.label}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={student.status} />
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
        </div>
      </div>
    </Link>
  );
}

// ─── InstructorAppElevPage ────────────────────────────────────────────────────

export function InstructorAppElevPage() {
  const { instructor } = useInstructorCtx();
  const { data: students, isLoading, isError } = useMyStudents(instructor.id);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return students ?? [];
    return (students ?? []).filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
      || (s.phone ?? '').includes(q)
      || (s.email ?? '').toLowerCase().includes(q),
    );
  }, [students, query]);

  const active   = filtered.filter(s => s.status === 'active');
  const inactive = filtered.filter(s => s.status !== 'active');

  return (
    <div className="max-w-lg mx-auto">
      {/* Search header */}
      <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950 px-4 pt-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Sök elev..."
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="px-4 pb-4 space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">Kunde inte hämta elever.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center gap-3">
            <Users className="w-12 h-12 text-gray-200 dark:text-gray-700" />
            <p className="font-semibold text-gray-500 dark:text-gray-400">
              {query ? 'Ingen elev hittades' : 'Inga elever tilldelade'}
            </p>
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
              >
                Rensa sökning
              </button>
            )}
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  Aktiva elever ({active.length})
                </p>
                {active.map(s => <StudentCard key={s.id} student={s} />)}
              </div>
            )}
            {inactive.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  Övriga ({inactive.length})
                </p>
                {inactive.map(s => <StudentCard key={s.id} student={s} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
