import { useState } from 'react';
import { HelpCircle, Plus, Loader2, Pencil, Trash2, Power, PowerOff } from 'lucide-react';
import {
  Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Textarea, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useOrgQuizQuestions, useCreateQuizQuestion, useUpdateQuizQuestion,
  useToggleQuizQuestionActive, useDeleteQuizQuestion,
  type QuizQuestion, type QuizCategory, type QuizDifficulty, type QuizOption,
} from '../hooks/useQuizQuestions.js';

const CATEGORY_LABELS: Record<QuizCategory, string> = {
  trafikregler:  'Trafikregler',
  vagmarken:     'Vägmärken',
  miljo:         'Miljö & Ekonomi',
  fordon:        'Fordon & Teknik',
  riskhantering: 'Riskhantering',
};

const DIFFICULTY_LABELS: Record<QuizDifficulty, string> = {
  easy: 'Lätt', normal: 'Normal', hard: 'Svår',
};

const EMPTY_OPTIONS: QuizOption[] = [
  { text: '', is_correct: true },
  { text: '', is_correct: false },
  { text: '', is_correct: false },
  { text: '', is_correct: false },
];

// ─── Create/edit dialog ────────────────────────────────────────────────────────

function QuestionDialog({ question, onClose }: { question: QuizQuestion | 'new' | null; onClose: () => void }) {
  const isEdit = question !== null && question !== 'new';
  const create = useCreateQuizQuestion();
  const update = useUpdateQuizQuestion();

  const [category, setCategory] = useState<QuizCategory>(isEdit ? question.category : 'trafikregler');
  const [questionText, setQuestionText] = useState(isEdit ? question.question_text : '');
  const [options, setOptions] = useState<QuizOption[]>(isEdit ? question.options : EMPTY_OPTIONS);
  const [explanation, setExplanation] = useState(isEdit ? question.explanation ?? '' : '');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(isEdit ? question.difficulty : 'normal');

  const pending = create.isPending || update.isPending;
  const correctIndex = options.findIndex((o) => o.is_correct);

  function setOptionText(i: number, text: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, text } : o)));
  }

  function setCorrect(i: number) {
    setOptions((prev) => prev.map((o, idx) => ({ ...o, is_correct: idx === i })));
  }

  async function handleSubmit() {
    if (!questionText.trim() || options.some((o) => !o.text.trim())) {
      toast({ title: 'Fyll i frågan och alla fyra svarsalternativ', variant: 'destructive' });
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: question.id, category, question_text: questionText, options, explanation, difficulty });
      } else {
        await create.mutateAsync({ category, question_text: questionText, options, explanation, difficulty });
      }
      toast({ title: isEdit ? 'Fråga uppdaterad' : 'Fråga tillagd' });
      onClose();
    } catch (e) {
      toast({ title: 'Kunde inte spara', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open={question !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Redigera fråga' : 'Ny teorifråga'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as QuizCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as QuizCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Svårighetsgrad</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as QuizDifficulty)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DIFFICULTY_LABELS) as QuizDifficulty[]).map((d) => (
                    <SelectItem key={d} value={d}>{DIFFICULTY_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Fråga</Label>
            <Textarea rows={2} placeholder="T.ex. Vad gäller vid övergångsställe utan trafiksignal?" value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Svarsalternativ (markera rätt svar)</Label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={correctIndex === i}
                    onChange={() => setCorrect(i)}
                    className="w-4 h-4 accent-primary shrink-0"
                    aria-label={`Alternativ ${i + 1} är rätt svar`}
                  />
                  <Input
                    placeholder={`Alternativ ${i + 1}`}
                    value={opt.text}
                    onChange={(e) => setOptionText(i, e.target.value)}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Förklaring (valfritt, visas efter svar)</Label>
            <Textarea rows={2} placeholder="Varför är detta rätt svar?" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={pending} onClick={() => void handleSubmit()}>
            {pending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            {isEdit ? 'Spara ändringar' : 'Lägg till fråga'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Question row ──────────────────────────────────────────────────────────────

function QuestionRow({ question, onEdit }: { question: QuizQuestion; onEdit: () => void }) {
  const toggleActive = useToggleQuizQuestionActive();
  const del = useDeleteQuizQuestion();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleDelete() {
    try {
      await del.mutateAsync(question.id);
      toast({ title: 'Fråga borttagen' });
    } catch (e) {
      toast({ title: 'Kunde inte ta bort', description: String(e), variant: 'destructive' });
    } finally {
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{CATEGORY_LABELS[question.category]}</Badge>
          <Badge variant="outline" className="text-muted-foreground">{DIFFICULTY_LABELS[question.difficulty]}</Badge>
          {!question.is_active && <Badge variant="outline" className="text-muted-foreground">Inaktiv</Badge>}
        </div>
        <p className="text-sm text-foreground">{question.question_text}</p>
        <p className="text-xs text-muted-foreground">
          Rätt svar: {question.options.find((o) => o.is_correct)?.text ?? '—'}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon" title="Redigera" onClick={onEdit}>
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          title={question.is_active ? 'Inaktivera' : 'Aktivera'}
          disabled={toggleActive.isPending}
          onClick={() => toggleActive.mutate({ id: question.id, is_active: !question.is_active })}
        >
          {question.is_active ? <PowerOff className="w-4 h-4 text-destructive" /> : <Power className="w-4 h-4 text-green-600" />}
        </Button>
        {confirmingDelete ? (
          <Button variant="destructive" size="sm" className="h-8 text-xs" disabled={del.isPending} onClick={() => void handleDelete()}>
            {del.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Bekräfta'}
          </Button>
        ) : (
          <Button variant="ghost" size="icon" title="Ta bort" onClick={() => setConfirmingDelete(true)}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TeorifragorPage() {
  const { data: questions = [], isLoading } = useOrgQuizQuestions();
  const [dialogTarget, setDialogTarget] = useState<QuizQuestion | 'new' | null>(null);

  return (
    <PageLayout>
      <PageHeader
        title="Körkortsfrågor"
        description="Egna teorifrågor för elevernas övningsprov, utöver de generella frågorna"
        actions={
          <Button onClick={() => setDialogTarget('new')}>
            <Plus className="w-4 h-4 mr-1.5" />
            Ny fråga
          </Button>
        }
      />
      <PageContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Hämtar frågor…
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center space-y-3">
            <HelpCircle className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="font-medium">Inga egna frågor tillagda</p>
            <p className="text-sm text-muted-foreground">
              Era elever övar redan på 25 generella teorifrågor. Lägg till egna frågor för att bredda övningsprovet.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            {questions.map((q) => (
              <QuestionRow key={q.id} question={q} onEdit={() => setDialogTarget(q)} />
            ))}
          </div>
        )}
      </PageContent>
      {dialogTarget !== null && (
        <QuestionDialog question={dialogTarget} onClose={() => setDialogTarget(null)} />
      )}
    </PageLayout>
  );
}
