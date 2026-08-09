import { useState, useRef } from 'react';
import {
  Button, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@platform/ui';
import {
  CheckCircle2, Circle, Trash2, RotateCcw, AlertCircle, ClipboardList,
} from 'lucide-react';
import { useTasks, useTaskAssignees } from '../hooks/useTasks.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';
import type { Task, TaskPriority } from '../hooks/useTasks.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low:    'Låg',
  medium: 'Medel',
  high:   'Hög',
};

const PRIORITY_CLS: Record<TaskPriority, string> = {
  low:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  high:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  const today = todayIso();
  const tomorrow = tomorrowIso();
  if (iso === today) return 'Idag';
  if (iso === tomorrow) return 'Imorgon';
  return new Date(iso + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function isOverdue(task: Task): boolean {
  return task.status === 'active' && task.due_date !== null && task.due_date < todayIso();
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onComplete,
  onRestore,
  onDelete,
}: {
  task:       Task;
  onComplete: (id: string) => void;
  onRestore:  (id: string) => void;
  onDelete:   (id: string) => void;
}) {
  const overdue  = isOverdue(task);
  const dueLabel = formatDue(task.due_date);
  const isActive = task.status === 'active';

  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 group',
      'hover:bg-muted/30 transition-colors',
    )}>
      {/* Checkbox */}
      <button
        onClick={() => isActive ? onComplete(task.id) : onRestore(task.id)}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
        aria-label={isActive ? 'Markera som klar' : 'Återställ uppgift'}
      >
        {isActive
          ? <Circle className="w-5 h-5" />
          : <CheckCircle2 className="w-5 h-5 text-primary" />
        }
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium leading-snug',
          !isActive && 'line-through text-muted-foreground',
        )}>
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {/* Due date */}
          {dueLabel && (
            <span className={cn(
              'text-xs font-medium',
              overdue ? 'text-destructive' : 'text-muted-foreground',
            )}>
              {overdue && <AlertCircle className="w-3 h-3 inline mr-0.5 -mt-px" />}
              {dueLabel}
            </span>
          )}
          {/* Priority */}
          {task.priority && (
            <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded', PRIORITY_CLS[task.priority])}>
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {/* Assignee */}
          {task.assigned_to_name && (
            <span className="text-xs text-muted-foreground">
              → {task.assigned_to_name}
            </span>
          )}
          {/* Creator */}
          <span className="text-xs text-muted-foreground/50">
            av {task.created_by_name}
          </span>
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(task.id)}
        className="shrink-0 mt-0.5 text-muted-foreground/30 hover:text-destructive transition-colors sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Ta bort uppgift"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Restore for completed */}
      {!isActive && (
        <button
          onClick={() => onRestore(task.id)}
          className="shrink-0 mt-0.5 text-muted-foreground/30 hover:text-primary transition-colors sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Återaktivera"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ClipboardList className="w-12 h-12 text-muted-foreground/20 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground/50 mt-1">
        Lägg till dina uppgifter och håll koll på dem i affärssystemet
      </p>
    </div>
  );
}

// ─── Tasks Page ───────────────────────────────────────────────────────────────

type TabKey = 'active' | 'completed';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active',    label: 'Aktiva'    },
  { key: 'completed', label: 'Avklarade' },
];

export function TasksPage() {
  const { user, profile } = useSession();
  const {
    activeTasks, completedTasks, overdueCount, creators,
    addTask, completeTask, restoreTask, deleteTask,
  } = useTasks();
  const { data: assignees = [] } = useTaskAssignees();

  // ── Add-task form state ────────────────────────────────────────────────────
  const [title,      setTitle]      = useState('');
  const [dueDate,    setDueDate]    = useState<string | null>(null);
  const [assignedId, setAssignedId] = useState<string>('none');
  const [priority,   setPriority]   = useState<string>('none');
  const dateInputRef = useRef<HTMLInputElement>(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterCreator,  setFilterCreator]  = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [filterDue,      setFilterDue]      = useState('');
  const [filterPriority, setFilterPriority] = useState('all');

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('active');

  // ── Derived current-user info ─────────────────────────────────────────────
  const currentUserId   = user?.id ?? 'unknown';
  const currentUserName = profile
    ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Du'
    : 'Du';

  // ── Submit new task ───────────────────────────────────────────────────────
  function handleAddTask() {
    const trimmed = title.trim();
    if (!trimmed) return;

    const chosenAssignee = assignees.find((a) => a.id === assignedId) ?? null;

    addTask({
      title:            trimmed,
      due_date:         dueDate,
      assigned_to_id:   chosenAssignee?.id   ?? null,
      assigned_to_name: chosenAssignee?.name ?? null,
      priority:         (priority !== 'none' ? priority as TaskPriority : null),
      created_by_id:    currentUserId,
      created_by_name:  currentUserName,
    });

    setTitle('');
    setDueDate(null);
    setAssignedId('none');
    setPriority('none');
  }

  // ── Apply filters ─────────────────────────────────────────────────────────
  function applyFilters(list: typeof activeTasks) {
    return list.filter((t) => {
      if (filterCreator !== 'all'  && t.created_by_id  !== filterCreator)  return false;
      if (filterAssignee !== 'all' && t.assigned_to_id !== filterAssignee) return false;
      if (filterDue && t.due_date !== filterDue) return false;
      if (filterPriority !== 'all' && t.priority !== filterPriority)        return false;
      return true;
    });
  }

  const displayedTasks = applyFilters(
    activeTab === 'active' ? activeTasks : completedTasks,
  );

  const hasFilters = filterCreator !== 'all' || filterAssignee !== 'all' || filterDue !== '' || filterPriority !== 'all';

  return (
    <div className="max-w-screen-lg mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Alla uppgifter</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {activeTasks.length} aktiva uppgifter
          {overdueCount > 0 && (
            <span className="text-destructive">, {overdueCount} har passerat deadline</span>
          )}
        </p>
      </div>

      {/* Add task card */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Lägg till en uppgift..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
            className="flex-1"
          />
          <Button onClick={handleAddTask} disabled={!title.trim()}>
            Lägg till
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Due date quick picks */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">När ska uppgiften vara klar?</span>
            {[
              { label: 'Idag',    value: todayIso()    },
              { label: 'Imorgon', value: tomorrowIso() },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setDueDate((prev) => prev === value ? null : value)}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                  dueDate === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
            {/* Custom date */}
            <button
              onClick={() => dateInputRef.current?.showPicker?.()}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                dueDate && dueDate !== todayIso() && dueDate !== tomorrowIso()
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              {dueDate && dueDate !== todayIso() && dueDate !== tomorrowIso()
                ? new Date(dueDate + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
                : 'Välj datum'
              }
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className="sr-only"
              value={dueDate ?? ''}
              onChange={(e) => setDueDate(e.target.value || null)}
            />
          </div>

          {/* Assign */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">Tilldela</span>
            <Select value={assignedId} onValueChange={setAssignedId}>
              <SelectTrigger className="h-7 text-xs w-[150px]">
                <SelectValue placeholder="Välj lärare" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen</SelectItem>
                <SelectItem value={currentUserId}>Välj mig</SelectItem>
                {assignees
                  .filter((a) => a.id !== currentUserId)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">Prioritet</span>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-7 text-xs w-[130px]">
                <SelectValue placeholder="Välj prioritet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen</SelectItem>
                <SelectItem value="low">Låg</SelectItem>
                <SelectItem value="medium">Medel</SelectItem>
                <SelectItem value="high">Hög</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-foreground">Filtrera</p>
          {hasFilters && (
            <button
              onClick={() => { setFilterCreator('all'); setFilterAssignee('all'); setFilterDue(''); setFilterPriority('all'); }}
              className="text-xs text-primary hover:underline"
            >
              Rensa alla
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          {/* Skapad av */}
          <div className="min-w-[160px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Skapad av</span>
              {filterCreator !== 'all' && (
                <button onClick={() => setFilterCreator('all')} className="text-[10px] text-primary hover:underline">Rensa</button>
              )}
            </div>
            <Select value={filterCreator} onValueChange={setFilterCreator}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {creators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tilldelad till */}
          <div className="min-w-[160px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Tilldelad till</span>
              {user?.id && (
                <button
                  onClick={() => setFilterAssignee(currentUserId)}
                  className="text-[10px] text-primary hover:underline"
                >
                  Välj mig
                </button>
              )}
            </div>
            <Select value={filterAssignee} onValueChange={setFilterAssignee}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due date */}
          <div className="min-w-[140px]">
            <p className="text-xs text-muted-foreground mb-1">Förfallodatum</p>
            <input
              type="date"
              value={filterDue}
              onChange={(e) => setFilterDue(e.target.value)}
              className={cn(
                'h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs',
                'focus:outline-none focus:ring-1 focus:ring-ring text-foreground',
              )}
            />
          </div>

          {/* Priority */}
          <div className="min-w-[130px]">
            <p className="text-xs text-muted-foreground mb-1">Prioritet</p>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                <SelectItem value="low">Låg</SelectItem>
                <SelectItem value="medium">Medel</SelectItem>
                <SelectItem value="high">Hög</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-end border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
            )}
          >
            {tab.label}
            <span className={cn(
              'ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded-full',
              activeTab === tab.key
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
            )}>
              {tab.key === 'active' ? activeTasks.length : completedTasks.length}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {displayedTasks.length === 0 ? (
          <EmptyState
            label={
              hasFilters
                ? 'Inga uppgifter matchar filtret'
                : activeTab === 'active'
                  ? 'Inga uppgifter ännu'
                  : 'Inga avklarade uppgifter'
            }
          />
        ) : (
          displayedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={completeTask}
              onRestore={restoreTask}
              onDelete={deleteTask}
            />
          ))
        )}
      </div>

    </div>
  );
}
