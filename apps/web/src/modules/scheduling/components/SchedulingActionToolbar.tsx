import { Search, Clock, FileText, CreditCard, User, UserX } from 'lucide-react';

interface SchedulingActionToolbarProps {
  onNavigate:       (path: string) => void;
  onHittaLedigTid?: () => void;
  onSubstitute?:    () => void;
}

export function SchedulingActionToolbar({ onNavigate, onHittaLedigTid, onSubstitute }: SchedulingActionToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-muted/40 border-b border-border">

      {/* Customer search area */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onNavigate('/students')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Search className="w-3 h-3" />
          Sök kund
        </button>
      </div>

      <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onHittaLedigTid}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Clock className="w-3 h-3" />
          Hitta ledig tid
        </button>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          onClick={() => onNavigate('/scheduling/bokningar')}
        >
          <FileText className="w-3 h-3" />
          Bokningsflöde
        </button>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          onClick={() => onNavigate('/finance/cash')}
        >
          <CreditCard className="w-3 h-3" />
          Kassa
        </button>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          onClick={() => onNavigate('/students')}
        >
          <User className="w-3 h-3" />
          Kunder
        </button>
        <button
          onClick={onSubstitute}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-300 bg-amber-50 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50 transition-colors"
          title="Omfördela pass till vikarie"
        >
          <UserX className="w-3 h-3" />
          Sjukvikariera
        </button>
      </div>
    </div>
  );
}
