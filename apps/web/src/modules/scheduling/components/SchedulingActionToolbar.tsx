import { Search, Clock, FileText, Zap, LayoutTemplate } from 'lucide-react';

interface SchedulingActionToolbarProps {
  onNavigate:       (path: string) => void;
  onHittaLedigTid?: () => void;
  onSubstitute?:    () => void;
}

export function SchedulingActionToolbar({ onNavigate, onHittaLedigTid }: SchedulingActionToolbarProps) {
  return (
    <div className="flex flex-wrap items-center px-3 py-1 bg-muted/40 border-b border-border min-h-[36px]">

      {/* Customer search */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onNavigate('/students')}
          className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Search className="w-3 h-3" />
          Sök efter kund
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

      <div className="w-px h-5 bg-border mx-2 hidden sm:block shrink-0" />

      {/* Generera pass + Passmallar — only reachable via a one-time onboarding
          link before this was added (Business Workflow Execution Audit,
          2026-08-07); surfaced here since this calendar is the page staff
          actually return to day-to-day. */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onNavigate('/scheduling/generation')}
          className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Zap className="w-3 h-3" />
          Generera pass
        </button>
        <button
          onClick={() => onNavigate('/scheduling/mallar')}
          className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <LayoutTemplate className="w-3 h-3" />
          Passmallar
        </button>
      </div>
    </div>
  );
}
