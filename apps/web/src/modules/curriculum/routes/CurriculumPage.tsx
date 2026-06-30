import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, ChevronRight, CheckCircle, Clock, GraduationCap } from 'lucide-react';
import { Button, Skeleton, toast } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { useCurriculumTemplates, useCreateCurriculumTemplate } from '../hooks/useCurriculum.js';
import type { TrainingPlanTemplate } from '../hooks/useCurriculum.js';
import { CreateTemplateDialog } from '../components/CreateTemplateDialog.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  B:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  A:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  C:   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  D:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

function catColor(cat: string): string {
  return CATEGORY_COLORS[cat.charAt(0)] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  tpl,
  onClick,
}: {
  tpl:     TrainingPlanTemplate;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-border bg-card p-4 hover:shadow-sm hover:border-primary/30 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{tpl.name_sv}</p>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', catColor(tpl.licence_category))}>
                {tpl.licence_category}
              </span>
              {!tpl.is_active && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Inaktiv</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{tpl.code} · {tpl.purpose}</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors mt-1 shrink-0" />
      </div>

      {tpl.description_sv && (
        <p className="text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
          {tpl.description_sv}
        </p>
      )}

      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
        {tpl.total_estimated_hours && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {tpl.total_estimated_hours}h totalt
          </span>
        )}
        <span className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          {tpl.is_active ? 'Aktiv' : 'Inaktiv'}
        </span>
      </div>
    </button>
  );
}

// ─── CurriculumPage ───────────────────────────────────────────────────────────

export function CurriculumPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: templates = [], isLoading } = useCurriculumTemplates();
  const createTemplate = useCreateCurriculumTemplate();

  // Group by licence category
  const byCategory: Record<string, TrainingPlanTemplate[]> = {};
  for (const tpl of templates) {
    (byCategory[tpl.licence_category] ??= []).push(tpl);
  }
  const categories = Object.keys(byCategory).sort();

  const activeCount   = templates.filter(t => t.is_active).length;
  const inactiveCount = templates.length - activeCount;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            Utbildningsplaner
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {templates.length} mallar · {activeCount} aktiva{inactiveCount > 0 ? ` · ${inactiveCount} inaktiva` : ''}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Ny mall
        </Button>
      </div>

      {/* Template list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(n => <Skeleton key={n} className="h-28 rounded-xl" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
            <BookOpen className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Inga utbildningsmallar ännu</p>
            <p className="text-xs text-muted-foreground mt-1">
              Skapa en mall för att strukturera körkortsutbildningen för dina elever.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} variant="outline" size="sm" className="gap-2 mt-2">
            <Plus className="w-4 h-4" />
            Skapa första mallen
          </Button>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', catColor(cat))}>
                Behörighet {cat}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {byCategory[cat]!.map(tpl => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                onClick={() => navigate(`/curriculum/${tpl.id}`)}
              />
            ))}
          </div>
        ))
      )}

      <CreateTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (input) => {
          const result = await createTemplate.mutateAsync(input);
          toast({ title: 'Mall skapad' });
          setCreateOpen(false);
          navigate(`/curriculum/${result.id}`);
        }}
        isPending={createTemplate.isPending}
      />
    </div>
  );
}
