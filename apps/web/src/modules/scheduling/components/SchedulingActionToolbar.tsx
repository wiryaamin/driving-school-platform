import { Search, Clock, FileText, User } from 'lucide-react';

interface SchedulingActionToolbarProps {
  onNavigate:       (path: string) => void;
  onHittaLedigTid?: () => void;
  onSubstitute?:    () => void;
}

export function SchedulingActionToolbar({ onNavigate, onHittaLedigTid }: SchedulingActionToolbarProps) {
  return (
    <div className="flex flex-wrap items-center px-3 py-1 bg-muted/40 border-b border-border min-h-[36px]">

      {/* Customer search + selected customer */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onNavigate('/students')}
          className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Search className="w-3 h-3" />
          Sök efter kund
        </button>
        <button className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background text-[11px] text-muted-foreground/60 hover:border-primary/40 transition-colors whitespace-nowrap">
          <User className="w-3 h-3 shrink-0" />
          Ingen kund vald
        </button>
      </div>

      <div className="w-px h-5 bg-border mx-2 hidden sm:block shrink-0" />

      {/* Hitta ledig tid + Bokningslista */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onHittaLedigTid}
          className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Clock className="w-3 h-3" />
          Hitta ledig tid
        </button>
        <button
          onClick={() => onNavigate('/scheduling/bokningar')}
          className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <FileText className="w-3 h-3" />
          Bokningslista
        </button>
      </div>
    </div>
  );
}
