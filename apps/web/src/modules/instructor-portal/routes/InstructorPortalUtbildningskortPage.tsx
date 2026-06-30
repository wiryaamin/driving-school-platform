import { useState, useEffect } from 'react';
import {
  Users, ChevronDown, ChevronRight, CheckCircle, Circle,
  Loader2, BookOpen, Save, AlertCircle,
} from 'lucide-react';
import {
  useInstructorPortalStudents,
  useInstructorPortalAssessment,
  useInstructorPortalSaveAssessment,
} from '../hooks/useInstructorPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#1055C9';

// ─── Competency definitions ───────────────────────────────────────────────────

const COMPETENCIES = [
  { key: 'stadskorning',   label: 'Stadskörning',      icon: '🏙️' },
  { key: 'landsvag',       label: 'Landsväg',          icon: '🛣️' },
  { key: 'motorvag',       label: 'Motorväg',          icon: '🚀' },
  { key: 'parkering',      label: 'Parkering',         icon: '🅿️' },
  { key: 'backning',       label: 'Backning',          icon: '⬅️' },
  { key: 'cirkulation',    label: 'Cirkulationsplats', icon: '🔄' },
  { key: 'morker',         label: 'Körning i mörker',  icon: '🌙' },
  { key: 'halka',          label: 'Halkkörning',       icon: '❄️' },
] as const;

type CompetencyKey    = typeof COMPETENCIES[number]['key'];
type CompetencyStatus = 'not_started' | 'in_progress' | 'mastered' | 'needs_more';

interface ReadinessState {
  risk1:     boolean;
  risk2:     boolean;
  theory:    boolean;
  practical: boolean;
}

// ─── Competency status config ─────────────────────────────────────────────────

const STATUS_OPTIONS: { value: CompetencyStatus; label: string; cls: string }[] = [
  { value: 'not_started', label: 'Ej påbörjad',       cls: 'bg-gray-100 text-gray-500'   },
  { value: 'in_progress', label: 'Pågående',           cls: 'bg-amber-100 text-amber-700' },
  { value: 'mastered',    label: 'Behärskas',          cls: 'bg-green-100 text-green-700' },
  { value: 'needs_more',  label: 'Kräver mer träning', cls: 'bg-red-100 text-red-600'     },
];

function statusCls(s: CompetencyStatus | undefined): string {
  return STATUS_OPTIONS.find(o => o.value === (s ?? 'not_started'))?.cls ?? 'bg-gray-100 text-gray-500';
}

// ─── CompetencyRow ────────────────────────────────────────────────────────────

function CompetencyRow({
  comp, value, onChange,
}: {
  comp:     typeof COMPETENCIES[number];
  value:    CompetencyStatus | undefined;
  onChange: (v: CompetencyStatus) => void;
}) {
  const current = value ?? 'not_started';
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="text-lg shrink-0">{comp.icon}</span>
        <p className="flex-1 text-sm font-medium text-gray-800">{comp.label}</p>
        <button
          onClick={() => setOpen(v => !v)}
          className={cn('px-3 py-1.5 rounded-xl text-xs font-bold transition-colors', statusCls(current))}
        >
          {STATUS_OPTIONS.find(o => o.value === current)?.label ?? 'Ej påbörjad'}
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors',
                current === opt.value
                  ? opt.cls + ' border-current'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ReadinessItem ────────────────────────────────────────────────────────────

function ReadinessItem({
  label, value, onChange,
}: {
  label:    string;
  value:    boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        'flex items-center gap-2 w-full px-4 py-3 border-b border-gray-50 last:border-0 text-left transition-colors',
        value ? 'bg-green-50' : 'hover:bg-gray-50',
      )}
    >
      {value
        ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
        : <Circle className="w-5 h-5 text-gray-200 shrink-0" />
      }
      <p className={cn('text-sm font-medium', value ? 'text-green-800' : 'text-gray-700')}>
        {label}
      </p>
    </button>
  );
}

// ─── StudentUtbildningskort ───────────────────────────────────────────────────

function StudentUtbildningskort({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { data: assessment, isLoading: assessLoading, isError: assessError } = useInstructorPortalAssessment(studentId);
  const saveAssessment = useInstructorPortalSaveAssessment();

  const [competencies,  setCompetencies]  = useState<Partial<Record<CompetencyKey, CompetencyStatus>>>({});
  const [readiness,     setReadiness]     = useState<Partial<ReadinessState>>({});
  const [notes,         setNotes]         = useState('');
  const [initialized,   setInitialized]   = useState(false);
  const [saved,         setSaved]         = useState(false);

  // Seed local state from server data on first load
  useEffect(() => {
    if (!initialized && !assessLoading) {
      if (assessment) {
        setCompetencies(assessment.competencies as Partial<Record<CompetencyKey, CompetencyStatus>>);
        setReadiness(assessment.readiness as Partial<ReadinessState>);
        setNotes(assessment.notes ?? '');
      }
      setInitialized(true);
    }
  }, [assessment, assessLoading, initialized]);

  function handleSave() {
    saveAssessment.mutate(
      {
        studentId,
        competencies: competencies as Record<string, string>,
        readiness:    readiness    as Record<string, boolean>,
        notes,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        },
      },
    );
  }

  if (assessLoading && !initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  if (assessError) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4">
        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
        <p className="text-sm text-red-600">Kunde inte hämta utbildningskortet.</p>
      </div>
    );
  }

  const firstName = studentName.split(' ')[0] ?? studentName;

  return (
    <div className="space-y-4">
      {/* Competencies */}
      <div>
        <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide mb-2">Kompetenser</p>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {COMPETENCIES.map(comp => (
            <CompetencyRow
              key={comp.key}
              comp={comp}
              value={competencies[comp.key]}
              onChange={val => setCompetencies(prev => ({ ...prev, [comp.key]: val }))}
            />
          ))}
        </div>
      </div>

      {/* Readiness */}
      <div>
        <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide mb-2">Bedömning – redo för</p>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {([
            { key: 'risk1'     as const, label: 'Redo för Riskettan'    },
            { key: 'risk2'     as const, label: 'Redo för Risktvåan'    },
            { key: 'theory'    as const, label: 'Redo för Kunskapsprov' },
            { key: 'practical' as const, label: 'Redo för Körprov'      },
          ] as const).map(item => (
            <ReadinessItem
              key={item.key}
              label={item.label}
              value={Boolean(readiness[item.key])}
              onChange={v => setReadiness(prev => ({ ...prev, [item.key]: v }))}
            />
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide mb-2">Anteckningar</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          placeholder={`Anteckningar om ${firstName}s utbildning...`}
          className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none text-gray-700 placeholder:text-gray-300"
        />
      </div>

      {saveAssessment.isError && (
        <p className="text-xs text-red-600 text-center">Kunde inte spara — försök igen.</p>
      )}

      <button
        onClick={handleSave}
        disabled={saveAssessment.isPending}
        className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        style={{ background: saved ? '#22c55e' : BRAND }}
      >
        {saveAssessment.isPending
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : saved
          ? <CheckCircle className="w-4 h-4" />
          : <Save className="w-4 h-4" />}
        {saveAssessment.isPending ? 'Sparar…' : saved ? 'Sparat!' : 'Spara utbildningskort'}
      </button>
    </div>
  );
}

// ─── InstructorPortalUtbildningskortPage ──────────────────────────────────────

export function InstructorPortalUtbildningskortPage() {
  const { data: students, isLoading, isError } = useInstructorPortalStudents();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = students?.find(s => s.id === selectedId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Utbildningskort</h1>
        <p className="text-sm text-gray-400 mt-0.5">Bedöm och dokumentera elevernas kompetenser</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">
          Kunde inte hämta elevlistan.
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Student picker */}
          <div>
            <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide mb-2">Välj elev</p>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-50">
              {(students ?? []).length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <Users className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-400">Inga elever att visa ännu</p>
                </div>
              ) : (
                (students ?? []).map(s => {
                  const isSelected = s.id === selectedId;
                  const initial    = s.first_name.charAt(0).toUpperCase();
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(isSelected ? null : s.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50',
                      )}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                        style={{ background: isSelected ? BRAND : '#94a3b8' }}
                      >
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-tight">
                          {s.first_name} {s.last_name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {s.completed_lessons} lektioner · {s.permit_stage}
                        </p>
                      </div>
                      {isSelected
                        ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: BRAND }} />
                        : <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                      }
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Utbildningskort for selected student */}
          {selected && (
            <StudentUtbildningskort
              key={selected.id}
              studentId={selected.id}
              studentName={`${selected.first_name} ${selected.last_name}`}
            />
          )}

          {!selectedId && (students ?? []).length > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 rounded-2xl border border-blue-100 p-4">
              <BookOpen className="w-4 h-4 shrink-0" style={{ color: BRAND }} />
              <p className="text-xs text-blue-700">Välj en elev ovan för att se och uppdatera deras utbildningskort.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
