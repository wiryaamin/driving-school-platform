import { useState, useEffect, useRef } from 'react';
import { GraduationCap, CheckCircle2, XCircle, ChevronRight, RotateCcw, Clock, Trophy, BookOpen } from 'lucide-react';
import { Button } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import {
  usePortalQuizCategories,
  usePortalStartQuiz,
  usePortalSubmitQuiz,
  usePortalQuizHistory,
  type QuizQuestion,
  type QuizResult,
  type QuizAnswerInput,
  type QuizHistoryEntry,
} from '../hooks/useStudentPortal.js';

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  trafikregler:  'Trafikregler',
  vagmarken:     'Vägmärken',
  miljo:         'Miljö & Ekonomi',
  fordon:        'Fordon & Teknik',
  riskhantering: 'Riskhantering',
};

const CATEGORY_COLORS: Record<string, string> = {
  trafikregler:  'bg-blue-50 border-blue-200 text-blue-800',
  vagmarken:     'bg-amber-50 border-amber-200 text-amber-800',
  miljo:         'bg-green-50 border-green-200 text-green-800',
  fordon:        'bg-purple-50 border-purple-200 text-purple-800',
  riskhantering: 'bg-red-50 border-red-200 text-red-800',
};

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Screen types ─────────────────────────────────────────────────────────────

type Screen =
  | { type: 'categories' }
  | { type: 'quiz'; sessionId: string; questions: QuizQuestion[]; category?: string | undefined }
  | { type: 'results'; result: QuizResult; category?: string | undefined }
  | { type: 'history' };

// ─── Category grid ────────────────────────────────────────────────────────────

function CategoryScreen({ onStart, onHistory }: {
  onStart:   (category?: string) => void;
  onHistory: () => void;
}) {
  const { data: categories = [], isLoading } = usePortalQuizCategories();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Teoriprov</h1>
          <p className="text-sm text-gray-500 mt-0.5">Öva inför ditt körkortsprov</p>
        </div>
        <Button variant="outline" size="sm" onClick={onHistory}>
          <Clock className="h-4 w-4 mr-1.5" />
          Historik
        </Button>
      </div>

      {/* Mixed quiz CTA */}
      <button
        onClick={() => onStart(undefined)}
        className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-5 text-left hover:border-blue-400 hover:bg-blue-100 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-600 p-2.5">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-blue-900">Blandat quiz</div>
            <div className="text-sm text-blue-700">10 frågor från alla kategorier</div>
          </div>
          <ChevronRight className="h-5 w-5 text-blue-400 group-hover:text-blue-600 transition-colors" />
        </div>
      </button>

      {/* Per-category cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map(cat => {
            const pct = cat.last_total
              ? Math.round(((cat.last_score ?? 0) / cat.last_total) * 100)
              : null;
            const colorClass = CATEGORY_COLORS[cat.category] ?? 'bg-gray-50 border-gray-200 text-gray-800';

            return (
              <button
                key={cat.category}
                onClick={() => onStart(cat.category)}
                className={cn(
                  'rounded-xl border p-4 text-left hover:opacity-80 transition-opacity group',
                  colorClass,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm">{categoryLabel(cat.category)}</div>
                    <div className="text-xs opacity-75 mt-0.5">{cat.question_count} frågor</div>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-50 group-hover:opacity-80 mt-0.5 shrink-0" />
                </div>
                {pct !== null && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs opacity-75 mb-1">
                      <span>Senaste: {cat.last_score}/{cat.last_total}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/10">
                      <div
                        className={cn('h-1.5 rounded-full transition-all', pct >= 75 ? 'bg-green-600' : 'bg-amber-500')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Quiz screen ──────────────────────────────────────────────────────────────

function QuizScreen({ sessionId, questions, category, onFinish, onAbort }: {
  sessionId: string;
  questions: QuizQuestion[];
  category?: string | undefined;
  onFinish:  (result: QuizResult) => void;
  onAbort:   () => void;
}) {
  const [currentIdx, setCurrentIdx]   = useState(0);
  const [selected, setSelected]       = useState<number | null>(null);
  const [confirmed, setConfirmed]     = useState(false);
  const [answers, setAnswers]         = useState<QuizAnswerInput[]>([]);
  const [elapsed, setElapsed]         = useState(0);
  const startedAt                     = useRef(Date.now());
  const submitQuiz                    = usePortalSubmitQuiz();

  const question = questions[currentIdx];
  const isLast   = currentIdx === questions.length - 1;

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!question) return null;

  function handleConfirm() {
    setConfirmed(true);
  }

  function handleNext() {
    const newAnswers = [
      ...answers,
      { question_id: question!.id, selected_index: selected },
    ];
    setAnswers(newAnswers);

    if (isLast) {
      submitQuiz.mutate(
        { session_id: sessionId, answers: newAnswers, time_spent_sec: elapsed },
        {
          onSuccess: result => onFinish(result),
          onError:   () => alert('Kunde inte skicka in quizet. Försök igen.'),
        },
      );
    } else {
      setCurrentIdx(i => i + 1);
      setSelected(null);
      setConfirmed(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onAbort} className="text-sm text-gray-500 hover:text-gray-700">
          ← Avsluta
        </button>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span><Clock className="h-3.5 w-3.5 inline mr-1" />{formatDuration(elapsed)}</span>
          <span>{currentIdx + 1} / {questions.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${((currentIdx) / questions.length) * 100}%` }}
        />
      </div>

      {/* Category badge */}
      {category && (
        <span className={cn(
          'inline-block text-xs font-medium px-2 py-0.5 rounded-full border',
          CATEGORY_COLORS[category] ?? 'bg-gray-50 border-gray-200 text-gray-700',
        )}>
          {categoryLabel(category)}
        </span>
      )}

      {/* Question */}
      <p className="text-base font-medium text-gray-900 leading-snug">{question.question_text}</p>

      {/* Options */}
      <div className="space-y-2.5">
        {question.options.map((opt, i) => {
          const isSelected = selected === i;
          return (
            <button
              key={i}
              disabled={confirmed}
              onClick={() => setSelected(i)}
              className={cn(
                'w-full rounded-xl border p-3.5 text-left text-sm transition-colors',
                !confirmed && isSelected  && 'border-blue-500 bg-blue-50 text-blue-900',
                !confirmed && !isSelected && 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                confirmed  && isSelected  && 'border-blue-500 bg-blue-50 text-blue-900',
                confirmed  && !isSelected && 'border-gray-100 bg-gray-50 text-gray-400',
              )}
            >
              <span className="font-medium mr-2 text-gray-400">{String.fromCharCode(65 + i)}.</span>
              {opt.text}
            </button>
          );
        })}
      </div>

      {/* Action button */}
      <div className="pt-1">
        {!confirmed ? (
          <Button
            className="w-full"
            disabled={selected === null}
            onClick={handleConfirm}
          >
            Bekräfta svar
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={handleNext}
            disabled={submitQuiz.isPending}
          >
            {isLast
              ? submitQuiz.isPending ? 'Sparar…' : 'Se resultat'
              : 'Nästa fråga'}
            {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Results screen ───────────────────────────────────────────────────────────

function ResultsScreen({ result, category: _category, onRetry, onHome }: {
  result:   QuizResult;
  category?: string | undefined;
  onRetry:  () => void;
  onHome:   () => void;
}) {
  const passed = result.passed;

  return (
    <div className="space-y-6">
      {/* Score card */}
      <div className={cn(
        'rounded-2xl border p-6 text-center',
        passed ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200',
      )}>
        <Trophy className={cn('h-10 w-10 mx-auto mb-3', passed ? 'text-green-600' : 'text-amber-500')} />
        <div className={cn('text-4xl font-bold', passed ? 'text-green-700' : 'text-amber-700')}>
          {result.percentage}%
        </div>
        <div className={cn('text-sm mt-1', passed ? 'text-green-600' : 'text-amber-600')}>
          {result.score} av {result.total} rätt
        </div>
        <div className={cn('text-xs mt-2 font-medium', passed ? 'text-green-700' : 'text-amber-700')}>
          {passed ? 'Godkänt (≥75%)' : 'Ej godkänt — kräver 75%'}
        </div>
      </div>

      {/* Answer review */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Genomgång</h2>
        {result.details.map((d, i) => (
          <div
            key={d.question_id}
            className={cn(
              'rounded-xl border p-4 space-y-2',
              d.is_correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
            )}
          >
            <div className="flex items-start gap-2">
              {d.is_correct
                ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                : <XCircle     className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
              <p className="text-sm font-medium text-gray-900">{i + 1}. {d.question_text}</p>
            </div>

            {!d.is_correct && (
              <div className="pl-6 space-y-1 text-xs">
                {d.selected_index !== null && (
                  <div className="text-red-700">
                    <span className="font-medium">Ditt svar:</span> {String.fromCharCode(65 + d.selected_index)}
                  </div>
                )}
                <div className="text-green-700">
                  <span className="font-medium">Rätt svar:</span> {String.fromCharCode(65 + d.correct_index)}
                </div>
                {d.explanation && (
                  <div className="text-gray-600 pt-1 border-t border-gray-200 mt-1">{d.explanation}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onHome}>
          Kategorier
        </Button>
        <Button className="flex-1" onClick={onRetry}>
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Försök igen
        </Button>
      </div>
    </div>
  );
}

// ─── History screen ───────────────────────────────────────────────────────────

function HistoryScreen({ onBack }: { onBack: () => void }) {
  const { data: history = [], isLoading } = usePortalQuizHistory();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">
          ← Tillbaka
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Quiz-historik</h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Inga avslutade quiz ännu</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {history.map((entry: QuizHistoryEntry) => {
            const pct   = entry.score !== null ? Math.round((entry.score / entry.question_count) * 100) : null;
            const passed = pct !== null && pct >= 75;
            return (
              <div key={entry.id} className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-4">
                <div className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                  passed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
                )}>
                  {pct !== null ? `${pct}%` : '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {entry.category ? categoryLabel(entry.category) : 'Blandat quiz'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {entry.score}/{entry.question_count} rätt
                    {entry.time_spent_sec ? ` · ${formatDuration(entry.time_spent_sec)}` : ''}
                    {' · '}{formatDate(entry.completed_at)}
                  </div>
                </div>
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  passed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
                )}>
                  {passed ? 'Godkänt' : 'Ej godkänt'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function StudentPortalTeoriPage() {
  const [screen, setScreen] = useState<Screen>({ type: 'categories' });
  const startQuiz           = usePortalStartQuiz();

  async function handleStart(category?: string) {
    try {
      const session = await startQuiz.mutateAsync({ category, question_count: 10 });
      setScreen({ type: 'quiz', sessionId: session.session_id, questions: session.questions, category });
    } catch (err) {
      console.error('Failed to start quiz', err);
      alert('Kunde inte starta quizet. Försök igen.');
    }
  }

  if (screen.type === 'categories') {
    return (
      <div className="max-w-xl mx-auto px-4 py-6">
        <CategoryScreen
          onStart={handleStart}
          onHistory={() => setScreen({ type: 'history' })}
        />
        {startQuiz.isPending && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl px-6 py-4 text-sm text-gray-700 shadow-lg">
              Laddar frågor…
            </div>
          </div>
        )}
      </div>
    );
  }

  if (screen.type === 'quiz') {
    return (
      <div className="max-w-xl mx-auto px-4 py-6">
        <QuizScreen
          sessionId={screen.sessionId}
          questions={screen.questions}
          category={screen.category}
          onFinish={result => setScreen({ type: 'results', result, category: screen.category })}
          onAbort={() => setScreen({ type: 'categories' })}
        />
      </div>
    );
  }

  if (screen.type === 'results') {
    return (
      <div className="max-w-xl mx-auto px-4 py-6">
        <ResultsScreen
          result={screen.result}
          category={screen.category}
          onRetry={() => handleStart(screen.category)}
          onHome={() => setScreen({ type: 'categories' })}
        />
        {startQuiz.isPending && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl px-6 py-4 text-sm text-gray-700 shadow-lg">
              Laddar frågor…
            </div>
          </div>
        )}
      </div>
    );
  }

  // history
  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <HistoryScreen onBack={() => setScreen({ type: 'categories' })} />
    </div>
  );
}
