import { useState } from 'react';
import { BookOpen, CheckCircle, Circle, Loader2, Plus, ChevronRight } from 'lucide-react';
import { Button, Skeleton, toast } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import {
  useStudentTrainingPlan, useStudentPlanSteps, useCurriculumTemplates,
  useAssignTrainingPlan, useUpdateStudentPlanStep,
} from '../hooks/useCurriculum.js';
import type { StudentPlanStep } from '../hooks/useCurriculum.js';

// ─── Step status visual ───────────────────────────────────────────────────────

const STEP_STATUS_META: Record<StudentPlanStep['status'], { label: string; cls: string; icon: React.ElementType }> = {
  not_started: { label: 'Ej påbörjad', cls: 'text-muted-foreground', icon: Circle      },
  in_progress: { label: 'Pågår',        cls: 'text-blue-600 dark:text-blue-400',   icon: ChevronRight },
  completed:   { label: 'Klar',          cls: 'text-green-600 dark:text-green-400', icon: CheckCircle  },
  skipped:     { label: 'Hoppades över', cls: 'text-muted-foreground/50',           icon: Circle       },
};

// ─── PlanStepRow ──────────────────────────────────────────────────────────────

function PlanStepRow({
  planStep,
  planId: _planId,
  onUpdate,
}: {
  planStep: StudentPlanStep;
  planId:   string;
  onUpdate: (id: string, status: StudentPlanStep['status']) => void;
}) {
  const meta = STEP_STATUS_META[planStep.status];
  const { icon: Icon } = meta;
  const step = planStep.step;

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-xl border transition-colors',
      planStep.status === 'completed'
        ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10'
        : planStep.status === 'in_progress'
        ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10'
        : 'border-border bg-card',
    )}>
      <button
        type="button"
        className="mt-0.5 shrink-0"
        onClick={() => {
          const next = planStep.status === 'completed' ? 'not_started'
            : planStep.status === 'in_progress' ? 'completed'
            : 'in_progress';
          onUpdate(planStep.id, next);
        }}
      >
        <Icon className={cn('w-4.5 h-4.5', meta.cls)} />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground w-5 shrink-0">{step?.step_number ?? ''}</span>
          <p className={cn(
            'text-sm font-medium',
            planStep.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground',
          )}>
            {step?.name_sv ?? '–'}
          </p>
          {step && !step.is_mandatory && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Valfri</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground ml-7">
          <span className={meta.cls}>{meta.label}</span>
          {step?.required_lesson_count && planStep.status !== 'completed' && (
            <span>{planStep.lessons_completed_count}/{step.required_lesson_count} lektioner</span>
          )}
          {planStep.completed_at && (
            <span>{new Date(planStep.completed_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StudentTrainingPlanPanel ─────────────────────────────────────────────────

interface StudentTrainingPlanPanelProps {
  studentId:        string;
  licenceCategory?: string;
}

export function StudentTrainingPlanPanel({ studentId, licenceCategory = 'B' }: StudentTrainingPlanPanelProps) {
  const [showAssign, setShowAssign] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const { data: plan, isLoading: planLoading } = useStudentTrainingPlan(studentId);
  const { data: steps = [], isLoading: stepsLoading } = useStudentPlanSteps(plan?.id ?? null);
  const { data: templates = [] } = useCurriculumTemplates();
  const assignPlan   = useAssignTrainingPlan();
  const updateStep   = useUpdateStudentPlanStep();

  const isLoading = planLoading;

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const totalCount     = steps.length;
  const pct            = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0;

  function handleUpdateStep(id: string, status: StudentPlanStep['status']) {
    if (!plan) return;
    updateStep.mutate(
      { id, planId: plan.id, status },
      {
        onError: (e) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
      </div>
    );
  }

  if (!plan) {
    const compatibleTemplates = templates.filter(t => t.licence_category === licenceCategory && t.is_active);

    return (
      <div className="pt-2">
        {!showAssign ? (
          <div className="rounded-xl border border-dashed border-border p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Ingen utbildningsplan tilldelad</p>
              <p className="text-xs text-muted-foreground mt-1">
                Välj en mall för att starta elevens utbildningsplan.
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-2 mt-1" onClick={() => setShowAssign(true)}>
              <Plus className="w-4 h-4" />
              Tilldela plan
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Välj utbildningsmall</p>
            {compatibleTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Inga aktiva mallar hittades för behörighet {licenceCategory}.
                Skapa en mall under Utbildningsplaner.
              </p>
            ) : (
              <div className="space-y-2">
                {compatibleTemplates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(t.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-xl border transition-colors text-sm',
                      selectedTemplateId === t.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30',
                    )}
                  >
                    <p className="font-medium text-foreground">{t.name_sv}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.code} · {t.purpose}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!selectedTemplateId || assignPlan.isPending}
                onClick={() => {
                  if (!selectedTemplateId) return;
                  assignPlan.mutate(
                    { student_id: studentId, template_id: selectedTemplateId, licence_category: licenceCategory },
                    {
                      onSuccess: () => { toast({ title: 'Utbildningsplan tilldelad' }); setShowAssign(false); },
                      onError: (e) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
                    },
                  );
                }}
              >
                {assignPlan.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                Tilldela
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAssign(false)}>Avbryt</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-4">
      {/* Plan header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{plan.template?.name_sv ?? 'Utbildningsplan'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {plan.template?.code} · Behörighet {plan.licence_category}
            </p>
          </div>
          <span className="text-xs font-bold text-primary">{pct}%</span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {completedCount} av {totalCount} steg klara
        </p>
      </div>

      {/* Steps */}
      {stepsLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(n => <Skeleton key={n} className="h-14 rounded-xl" />)}
        </div>
      ) : steps.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Inga steg i denna plan.
        </p>
      ) : (
        <div className="space-y-2">
          {steps.map(ps => (
            <PlanStepRow
              key={ps.id}
              planStep={ps}
              planId={plan.id}
              onUpdate={handleUpdateStep}
            />
          ))}
        </div>
      )}
    </div>
  );
}
