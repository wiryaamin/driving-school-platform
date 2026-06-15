import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import type { CalendarViewType } from '../hooks/useCalendarView.js';

// ─── CalendarToolbar ──────────────────────────────────────────────────────────

interface InstructorOption {
  id:   string;
  name: string;
}

interface CalendarToolbarProps {
  title:                 string;
  view:                  CalendarViewType;
  onPrev:                () => void;
  onNext:                () => void;
  onToday:               () => void;
  onViewChange:          (view: CalendarViewType) => void;
  onCreateSlot?:         () => void;
  isLoading?:            boolean;
  instructors?:          InstructorOption[];
  selectedInstructorId?: string | null;
  onInstructorChange?:   (id: string | null) => void;
}

const VIEW_OPTIONS: { value: CalendarViewType; label: string }[] = [
  { value: 'timeGridDay',  label: 'Dag' },
  { value: 'timeGridWeek', label: 'Vecka' },
  { value: 'dayGridMonth', label: 'Månad' },
];

export function CalendarToolbar({
  title,
  view,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onCreateSlot,
  isLoading = false,
  instructors,
  selectedInstructorId,
  onInstructorChange,
}: CalendarToolbarProps) {
  const hasInstructors = instructors && instructors.length > 0;

  return (
    <div className="flex flex-col gap-2">

      {/* Row 1: navigation + view switcher (existing responsive layout preserved) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

        {/* Left: navigation */}
        <div className="flex items-center gap-1 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onToday}
            className="shrink-0"
            aria-label="Gå till idag"
          >
            Idag
          </Button>

          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onPrev}
              className="px-2"
              aria-label="Föregående period"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNext}
              className="px-2"
              aria-label="Nästa period"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Current period title */}
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            {isLoading ? (
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            ) : (
              <h2 className="text-base font-semibold text-foreground capitalize truncate">
                {title}
              </h2>
            )}
          </div>
        </div>

        {/* Right: create button + view switcher */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {onCreateSlot && (
            <Button
              size="sm"
              onClick={onCreateSlot}
              className="gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Nytt pass
            </Button>
          )}

        {/* View switcher — segmented control */}
        <div
          className="flex items-center rounded-md border border-input bg-background p-0.5 gap-0.5 shrink-0"
          role="group"
          aria-label="Kalendervy"
        >
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onViewChange(opt.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                view === opt.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
              aria-pressed={view === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Row 2: instructor filter — only rendered when instructors are present */}
      {hasInstructors && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <InstructorPill
            label="Alla lärare"
            active={!selectedInstructorId}
            onClick={() => onInstructorChange?.(null)}
          />
          {instructors.map((i) => (
            <InstructorPill
              key={i.id}
              label={i.name.split(' ').pop() ?? i.name}
              title={i.name}
              active={selectedInstructorId === i.id}
              onClick={() => onInstructorChange?.(i.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── InstructorPill ───────────────────────────────────────────────────────────

function InstructorPill({
  label,
  title,
  active,
  onClick,
}: {
  label:   string;
  title?:  string;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'shrink-0 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
    >
      {label}
    </button>
  );
}
