import { useState, useMemo } from 'react';
import {
  ExternalLink, Video, FileText, BookOpen, AlertCircle, Loader2,
  ChevronDown, ChevronUp, CheckCircle2, Circle, Search,
} from 'lucide-react';
import {
  usePortalMaterials, usePortalCompletions, usePortalMarkComplete, usePortalUnmarkComplete,
  type PortalMaterial,
} from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';

// ─── Types & constants ────────────────────────────────────────────────────────

type CategoryKey = 'teori' | 'körning' | 'risk' | 'lagregler' | 'övrigt';

const CATEGORY_META: Record<CategoryKey, { label: string; color: string }> = {
  teori:     { label: 'Teorikunskap',   color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  körning:   { label: 'Körning',        color: 'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300'   },
  risk:      { label: 'Riskutbildning', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  lagregler: { label: 'Lagar & regler', color: 'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-300'  },
  övrigt:    { label: 'Övrigt',         color: 'bg-gray-100   text-gray-600   dark:bg-gray-800      dark:text-gray-300'   },
};

const CATEGORY_ORDER: CategoryKey[] = ['teori', 'körning', 'risk', 'lagregler', 'övrigt'];

const CONTENT_ICON = {
  link:     ExternalLink,
  video:    Video,
  document: FileText,
} as const;

const CONTENT_LABEL: Record<string, string> = {
  link:     'Länk',
  video:    'Video',
  document: 'Dokument',
};

// ─── Material card ────────────────────────────────────────────────────────────

function MaterialCard({
  material,
  isCompleted,
  onToggleComplete,
  isTogglingComplete,
}: {
  material:           PortalMaterial;
  isCompleted:        boolean;
  onToggleComplete:   () => void;
  isTogglingComplete: boolean;
}) {
  const Icon   = CONTENT_ICON[material.content_type] ?? ExternalLink;
  const meta   = CATEGORY_META[material.category as CategoryKey] ?? CATEGORY_META['övrigt'];
  const hasUrl = Boolean(material.url);

  const inner = (
    <div className={cn(
      'bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-start gap-3.5 transition-all',
      hasUrl && 'hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-sm active:scale-[0.99]',
      isCompleted && 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-900/10',
    )}>
      {/* Type icon */}
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
        isCompleted
          ? 'bg-emerald-100 text-emerald-500 dark:bg-emerald-900/40 dark:text-emerald-400'
          : 'bg-indigo-50 text-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-400',
      )}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1">
          <p className={cn(
            'text-sm font-semibold flex-1 leading-snug',
            isCompleted ? 'text-emerald-900 dark:text-emerald-300' : 'text-gray-900 dark:text-gray-100',
          )}>
            {material.title}
          </p>
          {hasUrl && <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />}
        </div>
        {material.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-relaxed">{material.description}</p>
        )}
        <span className={cn(
          'inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide',
          meta.color,
        )}>
          {CONTENT_LABEL[material.content_type] ?? material.content_type}
        </span>
      </div>

      {/* Completion toggle (stop propagation so link doesn't fire) */}
      <button
        type="button"
        onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleComplete(); }}
        disabled={isTogglingComplete}
        aria-label={isCompleted ? 'Markera som ej klar' : 'Markera som klar'}
        className="shrink-0 mt-0.5 p-1 rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
      >
        {isTogglingComplete
          ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          : isCompleted
            ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            : <Circle       className="w-5 h-5 text-gray-300 dark:text-gray-600" />}
      </button>
    </div>
  );

  if (!hasUrl) return inner;

  return (
    <a href={material.url!} target="_blank" rel="noopener noreferrer" className="block">
      {inner}
    </a>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  categoryKey,
  items,
  completedIds,
  onToggleComplete,
  pendingId,
}: {
  categoryKey:       CategoryKey;
  items:             PortalMaterial[];
  completedIds:      Set<string>;
  onToggleComplete:  (id: string, completed: boolean) => void;
  pendingId:         string | null;
}) {
  const [open, setOpen] = useState(true);
  const meta = CATEGORY_META[categoryKey];
  const completedCount = items.filter(m => completedIds.has(m.id)).length;

  return (
    <section>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 mb-2 group"
      >
        <span className={cn(
          'text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-lg',
          meta.color,
        )}>
          {meta.label}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {completedCount}/{items.length} klara
        </span>
        <span className="ml-auto text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="space-y-2">
          {items.map(m => (
            <MaterialCard
              key={m.id}
              material={m}
              isCompleted={completedIds.has(m.id)}
              onToggleComplete={() => onToggleComplete(m.id, completedIds.has(m.id))}
              isTogglingComplete={pendingId === m.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── StudentPortalMaterialPage ────────────────────────────────────────────────

export function StudentPortalMaterialPage() {
  const { data: materials,    isLoading: mLoading,  isError: mError    } = usePortalMaterials();
  const { data: completedArr, isLoading: cLoading                       } = usePortalCompletions();
  const markComplete   = usePortalMarkComplete();
  const unmarkComplete = usePortalUnmarkComplete();
  const [searchQuery, setSearchQuery] = useState('');

  const completedIds = new Set(completedArr ?? []);
  const isLoading    = mLoading || cLoading;
  const pendingId    = markComplete.isPending
    ? markComplete.variables
    : unmarkComplete.isPending
      ? unmarkComplete.variables
      : null;

  const filteredMaterials = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q || !materials) return materials ?? [];
    return materials.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.description?.toLowerCase().includes(q) ?? false),
    );
  }, [materials, searchQuery]);

  function handleToggle(materialId: string, currentlyCompleted: boolean) {
    if (currentlyCompleted) {
      unmarkComplete.mutate(materialId);
    } else {
      markComplete.mutate(materialId);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Laddar material…</p>
      </div>
    );
  }

  if (mError) {
    return (
      <div className="mx-4 mt-6 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/40">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        <p className="text-sm text-red-600 dark:text-red-400">Kunde inte hämta material. Försök igen.</p>
      </div>
    );
  }

  if (!materials || materials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
          <BookOpen className="w-8 h-8 text-indigo-300 dark:text-indigo-600" />
        </div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Inget material tillgängligt</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          Din trafikskola har inte lagt till något studiematerial ännu. Kontakta skolan om du har frågor.
        </p>
      </div>
    );
  }

  const grouped = CATEGORY_ORDER
    .map(key => ({ key, items: filteredMaterials.filter(m => m.category === key) }))
    .filter(g => g.items.length > 0);

  const totalCompleted = completedIds.size;
  const isSearching    = searchQuery.trim().length > 0;

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-5">
      {/* Page title + progress */}
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Studiematerial</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {totalCompleted} av {materials.length} {materials.length === 1 ? 'resurs' : 'resurser'} klara
        </p>
        {materials.length > 0 && (
          <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.round((totalCompleted / materials.length) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Sök material…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-xl border-0 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* No search results */}
      {isSearching && grouped.length === 0 && (
        <div className="flex flex-col items-center py-10 text-center gap-2">
          <Search className="w-8 h-8 text-gray-200 dark:text-gray-700" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Inga resurser matchar <span className="font-semibold">"{searchQuery.trim()}"</span>
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline mt-1"
          >
            Rensa sökning
          </button>
        </div>
      )}

      {/* Grouped sections */}
      {grouped.map(({ key, items }) => (
        <CategorySection
          key={key}
          categoryKey={key}
          items={items}
          completedIds={completedIds}
          onToggleComplete={handleToggle}
          pendingId={pendingId ?? null}
        />
      ))}
    </div>
  );
}
