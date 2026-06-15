import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

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

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tasks_items_v1';

function load(): Task[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Task[];
  } catch {
    return [];
  }
}

function persist(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// ─── Assignee Hook (from instructors table) ───────────────────────────────────

export function useTaskAssignees() {
  return useQuery<TaskAssignee[]>({
    queryKey: ['task-assignees'],
    queryFn: async () => {
      const { data } = await (supabase as unknown as any)
        .from('instructors')
        .select('id, first_name, last_name')
        .is('deleted_at', null)
        .in('status', ['active', 'on_leave'])
        .order('first_name', { ascending: true });

      return ((data ?? []) as any[]).map((r: any): TaskAssignee => ({
        id:   String(r.id),
        name: `${String(r.first_name ?? '')} ${String(r.last_name ?? '')}`.trim(),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Tasks Hook ───────────────────────────────────────────────────────────────

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(load);

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

  const addTask = useCallback((input: {
    title:              string;
    due_date:           string | null;
    assigned_to_id:     string | null;
    assigned_to_name:   string | null;
    priority:           TaskPriority | null;
    created_by_id:      string;
    created_by_name:    string;
  }) => {
    const task: Task = {
      id:           crypto.randomUUID(),
      status:       'active',
      completed_at: null,
      created_at:   new Date().toISOString(),
      ...input,
    };
    setTasks((prev) => {
      const next = [task, ...prev];
      persist(next);
      return next;
    });
  }, []);

  const completeTask = useCallback((id: string) => {
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === id
          ? { ...t, status: 'completed' as TaskStatus, completed_at: new Date().toISOString() }
          : t,
      );
      persist(next);
      return next;
    });
  }, []);

  const restoreTask = useCallback((id: string) => {
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === id ? { ...t, status: 'active' as TaskStatus, completed_at: null } : t,
      );
      persist(next);
      return next;
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return {
    tasks,
    activeTasks,
    completedTasks,
    overdueCount,
    creators,
    addTask,
    completeTask,
    restoreTask,
    deleteTask,
  };
}
