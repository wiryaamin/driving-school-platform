import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Search, Loader2, ChevronRight, TrendingUp,
  AlertCircle, Phone, Mail,
} from 'lucide-react';
import { useInstructorPortalStudents } from '../hooks/useInstructorPortal.js';
import { PERMIT_STAGE_LABELS, getProgressPct, milestoneRank, type PermitStage } from '@modules/student-portal/lib/permitStage.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#1055C9';

// P2-2: this used its own invented 6-value vocabulary
// ('learner'/'risk1'/'risk2'/'theory'/'practical'/'licensed') with a
// hardcoded percentage per stage — the exact same obsolete-vocabulary bug
// Portal Audit SP-02 already fixed in the Student Portal, just never caught
// here because it's a different surface. Reuses the same authoritative
// 11-value permitStage module instead of a second invented one; the
// hardcoded per-stage "tip" text is dropped rather than re-invented for the
// new vocabulary — there was no real curriculum data behind it.

const MILESTONE_CLS = [
  'bg-gray-100 text-gray-600',
  'bg-amber-100 text-amber-700',
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
] as const;

function stageDisplay(stage: string) {
  const label = PERMIT_STAGE_LABELS[stage as PermitStage] ?? stage;
  const pct   = getProgressPct(stage);
  const cls   = MILESTONE_CLS[milestoneRank(stage)] ?? MILESTONE_CLS[0];
  return { label, pct, cls };
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function MiniProgress({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${Math.max(pct, 4)}%`,
          background: pct === 100 ? '#22c55e' : BRAND,
        }}
      />
    </div>
  );
}

// ─── Student detail card (expanded) ──────────────────────────────────────────

function StudentDetail({
  s,
}: {
  s: {
    id:                      string;
    first_name:              string;
    last_name:               string;
    email:                   string | null;
    phone:                   string | null;
    permit_stage:            string;
    target_licence_category: string;
    completed_lessons:       number;
    last_lesson_at:          string | null;
    next_lesson_at:          string | null;
  };
}) {
  const cfg = stageDisplay(s.permit_stage);

  function fmtDate(iso: string | null): string {
    if (!iso) return '–';
    return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      {/* Progress */}
      <div className="bg-gray-50 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-gray-600">Utbildningsframsteg</p>
          <span className="text-xs font-bold" style={{ color: BRAND }}>{cfg.pct}%</span>
        </div>
        <MiniProgress pct={cfg.pct} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{s.completed_lessons}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Genomförda lektioner</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{s.target_licence_category}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Körkortstyp</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-sm font-bold text-gray-900">{fmtDate(s.last_lesson_at)}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Senaste lektion</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-sm font-bold text-gray-900">{fmtDate(s.next_lesson_at)}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Nästa lektion</p>
        </div>
      </div>

      {/* Contact info */}
      {(s.phone ?? s.email) && (
        <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5">
          {s.phone && (
            <a
              href={`tel:${s.phone}`}
              className="flex items-center gap-2 text-xs text-gray-700 hover:text-blue-600 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              {s.phone}
            </a>
          )}
          {s.email && (
            <a
              href={`mailto:${s.email}`}
              className="flex items-center gap-2 text-xs text-gray-700 hover:text-blue-600 transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              {s.email}
            </a>
          )}
        </div>
      )}


      {/* Link to utbildningskort */}
      <Link
        to="/instructor-portal/utbildningskort"
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border text-xs font-bold transition-colors hover:bg-blue-50"
        style={{ borderColor: BRAND, color: BRAND }}
      >
        <TrendingUp className="w-3.5 h-3.5" />
        Öppna utbildningskort
      </Link>
    </div>
  );
}

// ─── InstructorPortalElevPage ─────────────────────────────────────────────────

export function InstructorPortalElevPage() {
  const { data: students, isLoading, isError } = useInstructorPortalStudents();
  const [search,     setSearch]     = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = (students ?? []).filter(s => {
    if (!search) return true;
    return `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mina elever</h1>
        <p className="text-sm text-gray-400 mt-0.5">Elever du undervisar</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Sök på namn..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">Kunde inte hämta elevlistan.</p>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <Users className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">
            {search ? 'Inga elever matchade sökningen' : 'Inga elever tilldelade ännu'}
          </p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-50">
          {filtered.map(s => {
            const cfg        = stageDisplay(s.permit_stage);
            const isExpanded = s.id === expandedId;
            const initial    = s.first_name.charAt(0).toUpperCase();

            return (
              <div key={s.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                    style={{ background: BRAND }}
                  >
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">
                        {s.first_name} {s.last_name}
                      </p>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', cfg.cls)}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-400">{s.completed_lessons} lektioner</p>
                      <MiniProgress pct={cfg.pct} />
                      <span className="text-[10px] text-gray-400 shrink-0">{cfg.pct}%</span>
                    </div>
                  </div>
                  <ChevronRight
                    className={cn('w-4 h-4 text-gray-300 shrink-0 transition-transform', isExpanded && 'rotate-90')}
                  />
                </button>

                {isExpanded && <StudentDetail s={s} />}
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && students && students.length > 0 && (
        <p className="text-center text-xs text-gray-400">
          {filtered.length} av {students.length} elever
        </p>
      )}
    </div>
  );
}
