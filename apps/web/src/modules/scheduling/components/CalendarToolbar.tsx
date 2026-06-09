import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import type { CalendarViewType } from '../hooks/useCalendarView.js';

// ─── CalendarToolbar ──────────────────────────────────────────────────────────

interface CalendarToolbarProps {
  title: string;
  view: CalendarViewType;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarViewType) => void;
  isLoading?: boolean;
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
  isLoading = false,
}: CalendarToolbarProps) {
  return (
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
        <div className="flex items-center gap-1.5 min-w-0">
          {isLoading ? (
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          ) : (
            <h2 className="text-base font-semibold text-foreground capitalize truncate">
              {title}
            </h2>
          )}
        </div>
      </div>

      {/* Right: view switcher */}
      <div className="flex items-center gap-1 shrink-0">
        {/* View switcher — segmented control style */}
        <div
          className="flex items-center rounded-md border border-input bg-background p-0.5 gap-0.5"
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

        {/* Calendar icon for mobile — decorative */}
        <Calendar className="w-4 h-4 text-muted-foreground hidden sm:block" aria-hidden />
      </div>
    </div>
  );
}
