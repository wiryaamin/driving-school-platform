import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, BookOpen, Plus, ExternalLink, Video, FileText,
  Pencil, Trash2, Eye, EyeOff, X, Loader2, Check,
} from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaterialCategory = 'teori' | 'körning' | 'risk' | 'lagregler' | 'övrigt';
export type ContentType      = 'link'  | 'video'   | 'document';

export interface TrainingMaterial {
  id:           string;
  title:        string;
  description:  string | null;
  category:     MaterialCategory;
  content_type: ContentType;
  url:          string | null;
  is_published: boolean;
  display_order: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { value: MaterialCategory; label: string }[] = [
  { value: 'teori',    label: 'Teorikunskap'  },
  { value: 'körning',  label: 'Körning'       },
  { value: 'risk',     label: 'Riskutbildning'},
  { value: 'lagregler',label: 'Lagar & regler'},
  { value: 'övrigt',   label: 'Övrigt'        },
];

const CONTENT_TYPES: { value: ContentType; label: string; Icon: typeof ExternalLink }[] = [
  { value: 'link',     label: 'Länk',     Icon: ExternalLink },
  { value: 'video',    label: 'Video',    Icon: Video        },
  { value: 'document', label: 'Dokument', Icon: FileText     },
];

const CONTENT_TYPE_ICON: Record<ContentType, typeof ExternalLink> = {
  link:     ExternalLink,
  video:    Video,
  document: FileText,
};

// ─── Form state ───────────────────────────────────────────────────────────────

interface MaterialForm {
  title:        string;
  description:  string;
  category:     MaterialCategory;
  content_type: ContentType;
  url:          string;
  display_order: string;
  is_published:  boolean;
}

const EMPTY_FORM: MaterialForm = {
  title:         '',
  description:   '',
  category:      'teori',
  content_type:  'link',
  url:           '',
  display_order: '0',
  is_published:  true,
};

// ─── Material form sheet ──────────────────────────────────────────────────────

function MaterialSheet({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial:  MaterialForm;
  onClose:  () => void;
  onSave:   (form: MaterialForm) => void;
  saving:   boolean;
}) {
  const [form, setForm] = useState<MaterialForm>(initial);

  function field<K extends keyof MaterialForm>(key: K, value: MaterialForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-md bg-background border-l border-border flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">
            {initial.title ? 'Redigera material' : 'Lägg till material'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Titel *</label>
            <input
              required
              value={form.title}
              onChange={e => field('title', e.target.value)}
              maxLength={200}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="t.ex. Introduktion till trafikregler"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Beskrivning (valfritt)</label>
            <textarea
              value={form.description}
              onChange={e => field('description', e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Kort beskrivning av materialet"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Kategori</label>
            <select
              value={form.category}
              onChange={e => field('category', e.target.value as MaterialCategory)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Content type */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Typ</label>
            <div className="flex gap-2">
              {CONTENT_TYPES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => field('content_type', value)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border-2 text-xs font-medium transition-all',
                    form.content_type === value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/50',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* URL */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {form.content_type === 'video' ? 'Video-URL (YouTube, Vimeo…)' : form.content_type === 'document' ? 'Dokumentlänk (Google Drive, PDF…)' : 'URL / länk'}
            </label>
            <input
              type="url"
              value={form.url}
              onChange={e => field('url', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://"
            />
          </div>

          {/* Display order */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Sorteringsordning</label>
            <input
              type="number"
              value={form.display_order}
              onChange={e => field('display_order', e.target.value)}
              min={0}
              max={999}
              className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Lägre nummer visas först inom kategorin.</p>
          </div>

          {/* Published */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => field('is_published', !form.is_published)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
                form.is_published ? 'bg-primary' : 'bg-input',
              )}
            >
              <span className={cn(
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                form.is_published ? 'translate-x-4' : 'translate-x-0',
              )} />
            </button>
            <label className="text-sm text-foreground cursor-pointer" onClick={() => field('is_published', !form.is_published)}>
              Publicerat (synligt för elever)
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Avbryt</Button>
          <Button
            size="sm"
            disabled={!form.title.trim() || saving}
            onClick={() => onSave(form)}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
            Spara
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── MaterialsSettingsPage ────────────────────────────────────────────────────

export function MaterialsSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc    = useQueryClient();

  const [showSheet, setShowSheet] = useState(false);
  const [editing, setEditing]     = useState<TrainingMaterial | null>(null);

  const queryKey = ['settings-materials', orgId];

  const { data: materials = [], isLoading } = useQuery<TrainingMaterial[]>({
    queryKey,
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('training_materials')
        .select('id, title, description, category, content_type, url, is_published, display_order')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('category')
        .order('display_order')
        .order('title');
      return (data ?? []) as TrainingMaterial[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const { data: completionCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['settings-materials-completions', orgId],
    queryFn:  async () => {
      if (!orgId) return {};
      const { data } = await supabase
        .from('student_material_completions')
        .select('material_id')
        .eq('organization_id', orgId);
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ material_id: string }>) {
        counts[row.material_id] = (counts[row.material_id] ?? 0) + 1;
      }
      return counts;
    },
    enabled:   !!orgId,
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: async (form: MaterialForm) => {
      if (!orgId) throw new Error('No org');
      const { error } = await supabase.from('training_materials').insert({
        organization_id: orgId,
        title:           form.title.trim(),
        description:     form.description.trim() || null,
        category:        form.category,
        content_type:    form.content_type,
        url:             form.url.trim() || null,
        is_published:    form.is_published,
        display_order:   parseInt(form.display_order, 10) || 0,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      setShowSheet(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: MaterialForm }) => {
      const { error } = await supabase.from('training_materials').update({
        title:         form.title.trim(),
        description:   form.description.trim() || null,
        category:      form.category,
        content_type:  form.content_type,
        url:           form.url.trim() || null,
        is_published:  form.is_published,
        display_order: parseInt(form.display_order, 10) || 0,
      } as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      setEditing(null);
      setShowSheet(false);
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase.from('training_materials')
        .update({ is_published: published } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('training_materials')
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });

  function handleEdit(m: TrainingMaterial) {
    setEditing(m);
    setShowSheet(true);
  }

  function handleCloseSheet() {
    setShowSheet(false);
    setEditing(null);
  }

  function handleSave(form: MaterialForm) {
    if (editing) {
      updateMut.mutate({ id: editing.id, form });
    } else {
      createMut.mutate(form);
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  // Group by category
  const grouped = CATEGORIES.map(cat => ({
    category: cat,
    items: materials.filter(m => m.category === cat.value),
  })).filter(g => g.items.length > 0);

  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/education/licenses" className="hover:text-foreground">Utbildning</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Material</span>
        </nav>
        <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white gap-1.5" onClick={() => { setEditing(null); setShowSheet(true); }}>
          <Plus className="w-3.5 h-3.5" />
          Lägg till material
        </Button>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <BookOpen className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Utbildningsmaterial</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Hantera länkar, videor och dokument som visas för elever i elevportalen under fliken Material.
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : materials.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center space-y-2">
          <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Inget material har lagts till ännu.</p>
          <button
            onClick={() => { setEditing(null); setShowSheet(true); }}
            className="text-sm text-primary hover:underline"
          >
            Lägg till ditt första material
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ category, items }) => (
            <div key={category.value}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                {category.label}
              </h3>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {items.map(m => {
                  const Icon = CONTENT_TYPE_ICON[m.content_type];
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        m.is_published
                          ? 'bg-indigo-50 text-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-400'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm font-medium truncate',
                          m.is_published ? 'text-foreground' : 'text-muted-foreground',
                        )}>
                          {m.title}
                        </p>
                        {m.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{m.description}</p>
                        )}
                      </div>
                      {!m.is_published && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                          Dold
                        </span>
                      )}
                      {(completionCounts[m.id] ?? 0) > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 shrink-0" title="Antal elever som markerat som klar">
                          {completionCounts[m.id]} ✓
                        </span>
                      )}
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {m.url && (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Öppna länk"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => toggleMut.mutate({ id: m.id, published: !m.is_published })}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title={m.is_published ? 'Dölj för elever' : 'Publicera för elever'}
                        >
                          {m.is_published ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleEdit(m)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title="Redigera"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Ta bort "${m.title}"?`)) deleteMut.mutate(m.id);
                          }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Ta bort"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Published summary */}
      {materials.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          {materials.filter(m => m.is_published).length} av {materials.length} material publicerade för elever
        </p>
      )}

      {/* Sheet */}
      {showSheet && (
        <MaterialSheet
          initial={editing
            ? {
                title:         editing.title,
                description:   editing.description ?? '',
                category:      editing.category,
                content_type:  editing.content_type,
                url:           editing.url ?? '',
                display_order: String(editing.display_order),
                is_published:  editing.is_published,
              }
            : EMPTY_FORM
          }
          onClose={handleCloseSheet}
          onSave={handleSave}
          saving={isSaving}
        />
      )}
    </div>
  );
}
