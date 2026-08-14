import { useState } from 'react';
import { HelpCircle, Plus, Loader2, Pencil, Trash2, Power, PowerOff, Upload, X } from 'lucide-react';
import {
  Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Textarea, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { cn } from '@/lib/utils.js';
import {
  useOrgQuizQuestions, useCreateQuizQuestion, useUpdateQuizQuestion,
  useToggleQuizQuestionActive, useDeleteQuizQuestion, useUploadQuizQuestionMedia,
  type QuizQuestion, type QuizCategory, type QuizDifficulty, type QuizOption,
  type QuizAnswerType, type QuizMediaType,
} from '../hooks/useQuizQuestions.js';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

function normalizeOptions(options: QuizOption[]): QuizOption[] {
  return options.map((o) => ({ ...o, id: o.id ?? crypto.randomUUID() }));
}

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
  const uploadMedia = useUploadQuizQuestionMedia();

  const [category, setCategory] = useState<QuizCategory>(isEdit ? question.category : 'trafikregler');
  const [questionText, setQuestionText] = useState(isEdit ? question.question_text : '');
  const [options, setOptions] = useState<QuizOption[]>(() => normalizeOptions(isEdit ? question.options : EMPTY_OPTIONS));
  const [explanation, setExplanation] = useState(isEdit ? question.explanation ?? '' : '');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(isEdit ? question.difficulty : 'normal');
  const [answerType, setAnswerType] = useState<QuizAnswerType>(isEdit ? question.answer_type : 'single');
  const [mediaUrl, setMediaUrl] = useState<string | null>(isEdit ? question.media_url : null);
  const [mediaType, setMediaType] = useState<QuizMediaType | null>(isEdit ? question.media_type : null);

  const pending = create.isPending || update.isPending;

  function setOptionText(id: string, text: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  }

  function toggleCorrect(id: string) {
    setOptions((prev) => prev.map((o) => {
      if (answerType === 'single') return { ...o, is_correct: o.id === id };
      return o.id === id ? { ...o, is_correct: !o.is_correct } : o;
    }));
  }

  function handleAnswerTypeChange(type: QuizAnswerType) {
    setAnswerType(type);
    if (type === 'single') {
      // Collapse to at most one correct option so single-answer state stays valid.
      setOptions((prev) => {
        const firstCorrectId = prev.find((o) => o.is_correct)?.id;
        return prev.map((o) => ({ ...o, is_correct: o.id === firstCorrectId }));
      });
    }
  }

  async function handleMediaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url, type } = await uploadMedia.mutateAsync(file);
      setMediaUrl(url);
      setMediaType(type);
    } catch (err) {
      toast({ title: 'Kunde inte ladda upp media', description: String(err), variant: 'destructive' });
    } finally {
      e.target.value = '';
    }
  }

  function handleRemoveMedia() {
    setMediaUrl(null);
    setMediaType(null);
  }

  async function handleSubmit() {
    if (!questionText.trim() || options.some((o) => !o.text.trim())) {
      toast({ title: 'Fyll i frågan och alla fyra svarsalternativ', variant: 'destructive' });
      return;
    }
    if (!options.some((o) => o.is_correct)) {
      toast({ title: 'Markera minst ett rätt svar', variant: 'destructive' });
      return;
    }
    try {
      const payload = { category, question_text: questionText, options, explanation, difficulty, answer_type: answerType, media_url: mediaUrl, media_type: mediaType };
      if (isEdit) {
        await update.mutateAsync({ id: question.id, ...payload });
      } else {
        await create.mutateAsync(payload);
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

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-3">
            <div className="space-y-1.5">
              <Label>Fråga</Label>
              <Textarea rows={4} placeholder="T.ex. Vad gäller vid övergångsställe utan trafiksignal?" value={questionText} onChange={(e) => setQuestionText(e.target.value)} className="h-full resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Media (valfritt)</Label>
              {mediaUrl ? (
                <div className="relative rounded-lg border border-border overflow-hidden bg-muted h-[5.75rem]">
                  {mediaType === 'video' ? (
                    <video src={mediaUrl} className="w-full h-full object-cover" controls />
                  ) : (
                    <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={handleRemoveMedia}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                    title="Ta bort media"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border h-[5.75rem] cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors text-xs text-muted-foreground text-center px-1">
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
                    onChange={(e) => void handleMediaFile(e)}
                    disabled={uploadMedia.isPending}
                  />
                  <Upload className="w-4 h-4" />
                  {uploadMedia.isPending ? 'Laddar upp…' : 'Bild eller video'}
                </label>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Svarsalternativ</Label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <span className="w-6 h-6 shrink-0 rounded-full border border-border flex items-center justify-center text-xs font-semibold text-muted-foreground">
                    {OPTION_LETTERS[i]}
                  </span>
                  <Input
                    placeholder={`Svarsalternativ ${OPTION_LETTERS[i]}`}
                    value={opt.text}
                    onChange={(e) => setOptionText(opt.id!, e.target.value)}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Svarstyp</Label>
            <div className="flex gap-2">
              {([{ value: 'single', label: 'Ett rätt svar' }, { value: 'multiple', label: 'Flera rätta svar' }] as const).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleAnswerTypeChange(value)}
                  className={cn(
                    'flex-1 py-2 rounded-lg border-2 text-xs font-medium transition-all',
                    answerType === value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Rätt svar</Label>
            <div className="flex items-center gap-4 flex-wrap">
              {options.map((opt, i) => (
                <label key={opt.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type={answerType === 'single' ? 'radio' : 'checkbox'}
                    name={answerType === 'single' ? 'correct-option' : undefined}
                    checked={opt.is_correct}
                    onChange={() => toggleCorrect(opt.id!)}
                    className="w-4 h-4 accent-primary"
                    aria-label={`${OPTION_LETTERS[i]} är rätt svar`}
                  />
                  {OPTION_LETTERS[i]}
                </label>
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
          Rätt svar: {question.options.filter((o) => o.is_correct).map((o) => o.text).join(' + ') || '—'}
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
