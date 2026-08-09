import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus   = 'active' | 'completed';

export interface Task {
  id:                 string;
  title:              string;
  due_date:           string | null;
  assigned_to_id:     string | null;
  assigned_to_name:   string | null;
  priority:           TaskPriority | null;
  created_by_id:      string;
  created_by_name:    string;
  status:             TaskStatus;
  completed_at:       string | null;
  created_at:         string;
}

export interface TaskAssignee {
  id:   string;
  name: string;
}

// tasks is not present in @platform/types' hand-maintained Database stub
// yet — same escape hatch already used by useFavorites.ts/useWatchlist.ts;
// RLS (tasks_select_org/insert_org/update_org/delete_org) is what actually
// enforces org-wide shared visibility.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tasksTable() { return (supabase as any).from('tasks'); }

const TASKS_KEY = ['tasks-items'] as const;

// ─── Assignee Hook (from instructors table) ───────────────────────────────────

export function useTaskAssignees() {
  return useQuery<TaskAssignee[]>({
    queryKey: ['task-assignees'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as unknown as any)
        .from('instructors')
        .select('id, first_name, last_name')
        .is('deleted_at', null)
        .order('first_name', { ascending: true });

      return ((data ?? []) as { id: string; first_name: string; last_name: string }[]).map((r): TaskAssignee => ({
        id:   r.id,
        name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Tasks Hook ───────────────────────────────────────────────────────────────

export function useTasks() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: TASKS_KEY,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await tasksTable()
        .select('id, title, due_date, assigned_to_id, assigned_to_name, priority, created_by_id, created_by_name, status, completed_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as Task[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const todayIso = new Date().toISOString().slice(0, 10);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === 'active'),
    [tasks],
  );

  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === 'completed'),
    [tasks],
  );

  const overdueCount = useMemo(
    () => activeTasks.filter((t) => t.due_date !== null && t.due_date < todayIso).length,
    [activeTasks, todayIso],
  );

  const creators = useMemo<TaskAssignee[]>(() => {
    const map = new Map<string, string>();
    tasks.forEach((t) => { map.set(t.created_by_id, t.created_by_name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const addTask = useMutation({
    mutationFn: async (input: {
      title:              string;
      due_date:           string | null;
      assigned_to_id:     string | null;
      assigned_to_name:   string | null;
      priority:           TaskPriority | null;
      created_by_id:      string;
      created_by_name:    string;
    }): Promise<void> => {
      if (!orgId) throw new Error('Ingen organisation');
      const { error } = await tasksTable().insert({ organization_id: orgId, ...input });
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });

  const completeTask = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await tasksTable()
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });

  const restoreTask = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await tasksTable()
        .update({ status: 'active', completed_at: null })
        .eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await tasksTable().delete().eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });

  return {
    tasks,
    activeTasks,
    completedTasks,
    overdueCount,
    creators,
    addTask:      (input: Parameters<typeof addTask.mutate>[0]) => addTask.mutate(input),
    completeTask: (id: string) => completeTask.mutate(id),
    restoreTask:  (id: string) => restoreTask.mutate(id),
    deleteTask:   (id: string) => deleteTask.mutate(id),
  };
}
