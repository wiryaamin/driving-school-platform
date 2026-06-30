import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Plus, GripVertical, CheckCircle,
  Milestone, AlertTriangle, CalendarDays, Clock,
} from 'lucide-react';
import { Button, Skeleton, toast } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import {
  useCurriculumTemplates, useCurriculumTemplateSteps, useCreateTemplateStep,
} from '../hooks/useCurriculum.js';
import type { TemplateStep } from '../hooks/useCurriculum.js';
import { AddStepDialog } from '../components/AddStepDialog.js';

// ─── Step type config ─────────────────────────────────────────────────────────

const STEP_TYPE_META: Record<TemplateStep['step_type'], { label: string; icon: React.ElementType; cls: string }> = {
  lesson_block:   { label: 'Lektionsblock',    icon: BookOpen,     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'     },
  milestone:      { label: 'Milstolpe',         icon: Milestone,    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'   },
  gate_check:     { label: 'Grindkontroll',     icon: AlertTriangle,cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'  },
  external_event: { label: 'Externt evenemang', icon: CalendarDays, cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
};

// ─── StepItem ─────────────────────────────────────────────────────────────────

function StepItem({ step }: { step: TemplateStep }) {
  const meta = STEP_TYPE_META[step.step_type];
  const { icon: Icon } = meta;

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/20 transition-colors group">
      <div className="flex items-center gap-2 shrink-0">
        <GripVertical className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors cursor-grab" />
        <span className="text-xs font-bold text-muted-foreground w-5 text-center">{step.step_number}</span>
      </div>

      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', meta.cls)}>
        <Icon className="w-3.5 h-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground">{step.name_sv}</p>
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', meta.cls)}>
            {meta.label}
          </span>
          {!step.is_mandatory && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Valfri</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {step.required_lesson_count && (
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              {step.required_lesson_count} lektioner
            </span>
          )}
          {step.estimated_minutes && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {step.estimated_minutes >= 60
                ? `${(step.estimated_minutes / 60).toFixed(1).replace('.0', '')}h`
                : `${step.estimated_minutes}min`}
            </span>
          )}
          {step.gate_type && (
            <span className="text-amber-600 dark:text-amber-400">{step.gate_type}</span>
          )}
        </div>
        {step.notes_sv && (
          <p className="text-xs text-muted-foreground mt-1 italic">{step.notes_sv}</p>
        )}
      </div>
    </div>
  );
}

// ─── CurriculumTemplatePage ───────────────────────────────────────────────────

export function CurriculumTemplatePage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const [addStepOpen, setAddStepOpen] = useState(false);

  const { data: templates = [] } = useCurriculumTemplates();
  const { data: steps = [], isLoading: stepsLoading } = useCurriculumTemplateSteps(templateId ?? null);
  const createStep = useCreateTemplateStep();

  const template = templates.find(t => t.id === templateId);

  const totalLessons = steps.reduce((s, st) => s + (st.required_lesson_count ?? 0), 0);
  const totalHours   = steps.reduce((s, st) => s + (st.estimated_minutes ?? 0), 0) / 60;
  const mandatory    = steps.filter(st => st.is_mandatory).length;

  if (!templateId) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Back nav */}
      <button
        type="button"
        onClick={() => navigate('/curriculum')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Utbildningsplaner
      </button>

      {/* Header */}
      {template ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{template.name_sv}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {template.code} · Behörighet {template.licence_category} · {template.purpose}
            </p>
            {template.description_sv && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-xl">
                {template.description_sv}
              </p>
            )}
          </div>
          <Button onClick={() => setAddStepOpen(true)} size="sm" className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Lägg till steg
          </Button>
        </div>
      ) : (
        <Skeleton className="h-16 rounded-xl" />
      )}

      {/* Summary stats */}
      {steps.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{steps.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Steg totalt</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{mandatory}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Obligatoriska</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-foreground">
              {totalHours > 0 ? `${totalHours.toFixed(0)}h` : `${totalLessons}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalHours > 0 ? 'Uppskattad tid' : 'Lektioner'}
            </p>
          </div>
        </div>
      )}

      {/* Steps */}
      {stepsLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(n => <Skeleton key={n} className="h-16 rounded-xl" />)}
        </div>
      ) : steps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Inga steg ännu</p>
            <p className="text-xs text-muted-foreground mt-1">
              Lägg till steg som lektionsblock, milstolpar och grindkontroller.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 mt-1" onClick={() => setAddStepOpen(true)}>
            <Plus className="w-4 h-4" />
            Lägg till första steget
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map(step => (
            <StepItem key={step.id} step={step} />
          ))}
        </div>
      )}

      {/* Add step dialog */}
      {template && (
        <AddStepDialog
          open={addStepOpen}
          onOpenChange={setAddStepOpen}
          nextStepNumber={(steps[steps.length - 1]?.step_number ?? 0) + 1}
          onCreate={async (input) => {
            if (!templateId) return;
            // Need organization_id from template
            await createStep.mutateAsync({
              template_id:           templateId,
              step_number:           input.step_number,
              name_sv:               input.name_sv,
              step_type:             input.step_type,
              required_lesson_count: input.required_lesson_count,
              estimated_minutes:     input.estimated_minutes,
              is_mandatory:          input.is_mandatory,
              notes_sv:              input.notes_sv,
            });
            toast({ title: 'Steg tillagt' });
            setAddStepOpen(false);
          }}
          isPending={createStep.isPending}
        />
      )}
    </div>
  );
}
