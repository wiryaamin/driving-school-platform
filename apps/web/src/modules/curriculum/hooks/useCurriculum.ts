import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrainingPlanTemplate {
  id:                    string;
  organization_id:       string;
  code:                  string;
  name_sv:               string;
  name_en:               string | null;
  licence_category:      string;
  purpose:               string;
  description_sv:        string | null;
  total_estimated_hours: number | null;
  is_active:             boolean;
  created_at:            string;
  updated_at:            string;
}

export interface TemplateStep {
  id:                    string;
  template_id:           string;
  step_number:           number;
  name_sv:               string;
  step_type:             'lesson_block' | 'milestone' | 'gate_check' | 'external_event';
  required_lesson_count: number | null;
  required_hours_decimal: number | null;
  estimated_minutes:     number | null;
  is_mandatory:          boolean;
  gate_type:             string | null;
  notes_sv:              string | null;
}

export interface StudentTrainingPlan {
  id:              string;
  student_id:      string;
  template_id:     string;
  licence_category: string;
  status:          'enrolled' | 'in_progress' | 'completed' | 'withdrawn';
  enrolled_at:     string;
  completed_at:    string | null;
  notes:           string | null;
  template:        Pick<TrainingPlanTemplate, 'id' | 'name_sv' | 'code'> | null;
}

export interface StudentPlanStep {
  id:                      string;
  enrollment_id:           string;
  template_step_id:        string;
  status:                  'not_started' | 'in_progress' | 'completed' | 'skipped';
  lessons_completed_count: number;
  hours_completed_decimal: number;
  completed_at:            string | null;
  notes:                   string | null;
  step:                    Pick<TemplateStep, 'id' | 'step_number' | 'name_sv' | 'step_type' | 'required_lesson_count' | 'is_mandatory'> | null;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const curriculumKeys = {
  templates:     (orgId: string) => ['curriculum', 'templates', orgId] as const,
  template:      (id: string)    => ['curriculum', 'template', id] as const,
  templateSteps: (id: string)    => ['curriculum', 'template-steps', id] as const,
  studentPlan:   (studentId: string) => ['curriculum', 'student-plan', studentId] as const,
  studentSteps:  (planId: string)    => ['curriculum', 'student-steps', planId] as const,
};

// ─── Template hooks ───────────────────────────────────────────────────────────

export function useCurriculumTemplates() {
  const { organization } = useSession();
  const orgId = organization?.id;
  return useQuery<TrainingPlanTemplate[]>({
    queryKey: curriculumKeys.templates(orgId ?? ''),
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('training_plan_templates')
        .select('id, organization_id, code, name_sv, name_en, licence_category, purpose, description_sv, total_estimated_hours, is_active, created_at, updated_at')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('licence_category')
        .order('name_sv');
      if (error) throw new Error(error.message);
      return (data ?? []) as TrainingPlanTemplate[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

export function useCurriculumTemplateSteps(templateId: string | null) {
  return useQuery<TemplateStep[]>({
    queryKey: curriculumKeys.templateSteps(templateId ?? ''),
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('training_plan_template_steps')
        .select('id, template_id, step_number, name_sv, step_type, required_lesson_count, required_hours_decimal, estimated_minutes, is_mandatory, gate_type, notes_sv')
        .eq('template_id', templateId)
        .order('step_number');
      if (error) throw new Error(error.message);
      return (data ?? []) as TemplateStep[];
    },
    enabled: !!templateId,
    staleTime: 60_000,
  });
}

export function useCreateCurriculumTemplate() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code:             string;
      name_sv:          string;
      licence_category: string;
      purpose:          string;
      description_sv?:  string | undefined;
    }) => {
      if (!orgId) throw new Error('No org');
      const { data, error } = await supabase
        .from('training_plan_templates')
        .insert({ organization_id: orgId, ...input } as never)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data as { id: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['curriculum', 'templates', orgId] });
    },
  });
}

export function useCreateTemplateStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      template_id:           string;
      step_number:           number;
      name_sv:               string;
      step_type:             TemplateStep['step_type'];
      required_lesson_count?: number | undefined;
      estimated_minutes?:    number | undefined;
      is_mandatory:          boolean;
      notes_sv?:             string | undefined;
    }) => {
      const { error } = await supabase
        .from('training_plan_template_steps')
        .insert({ organization_id: input.template_id, ...input } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: curriculumKeys.templateSteps(v.template_id) });
    },
  });
}

// ─── Student plan hooks ───────────────────────────────────────────────────────

export function useStudentTrainingPlan(studentId: string | null) {
  return useQuery<StudentTrainingPlan | null>({
    queryKey: curriculumKeys.studentPlan(studentId ?? ''),
    queryFn: async () => {
      if (!studentId) return null;
      const { data, error } = await supabase
        .from('student_training_plans')
        .select(`
          id, student_id, template_id, licence_category, status, enrolled_at, completed_at, notes,
          training_plan_templates(id, name_sv, code)
        `)
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('enrolled_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as {
        id: string; student_id: string; template_id: string; licence_category: string;
        status: StudentTrainingPlan['status']; enrolled_at: string; completed_at: string | null;
        notes: string | null;
        training_plan_templates: { id: string; name_sv: string; code: string } | null;
      };
      return {
        id:               row.id,
        student_id:       row.student_id,
        template_id:      row.template_id,
        licence_category: row.licence_category,
        status:           row.status,
        enrolled_at:      row.enrolled_at,
        completed_at:     row.completed_at,
        notes:            row.notes,
        template:         row.training_plan_templates,
      };
    },
    enabled: studentId !== null && studentId !== '',
    staleTime: 30_000,
  });
}

export function useStudentPlanSteps(planId: string | null) {
  return useQuery<StudentPlanStep[]>({
    queryKey: curriculumKeys.studentSteps(planId ?? ''),
    queryFn: async () => {
      if (!planId) return [];
      const { data, error } = await supabase
        .from('student_training_plan_steps')
        .select(`
          id, enrollment_id, template_step_id, status, lessons_completed_count, hours_completed_decimal, completed_at, notes,
          training_plan_template_steps(id, step_number, name_sv, step_type, required_lesson_count, is_mandatory)
        `)
        .eq('enrollment_id', planId)
        .order('training_plan_template_steps(step_number)');
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{
        id: string; enrollment_id: string; template_step_id: string;
        status: StudentPlanStep['status']; lessons_completed_count: number;
        hours_completed_decimal: number; completed_at: string | null; notes: string | null;
        training_plan_template_steps: { id: string; step_number: number; name_sv: string; step_type: string; required_lesson_count: number | null; is_mandatory: boolean } | null;
      }>).map(r => ({
        id:                      r.id,
        enrollment_id:           r.enrollment_id,
        template_step_id:        r.template_step_id,
        status:                  r.status,
        lessons_completed_count: r.lessons_completed_count,
        hours_completed_decimal: r.hours_completed_decimal,
        completed_at:            r.completed_at,
        notes:                   r.notes,
        step:                    r.training_plan_template_steps as StudentPlanStep['step'],
      }));
    },
    enabled: planId !== null && planId !== '',
    staleTime: 30_000,
  });
}

export function useAssignTrainingPlan() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { student_id: string; template_id: string; licence_category: string }) => {
      if (!orgId) throw new Error('No org');
      const { error } = await supabase.from('student_training_plans').insert({
        organization_id:  orgId,
        student_id:       input.student_id,
        template_id:      input.template_id,
        licence_category: input.licence_category,
        status:           'enrolled',
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: curriculumKeys.studentPlan(v.student_id) });
    },
  });
}

export function useUpdateStudentPlanStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id:          string;
      planId:      string;
      status:      StudentPlanStep['status'];
      lessons?:    number;
    }) => {
      const payload: Record<string, unknown> = {
        status:     input.status,
        updated_at: new Date().toISOString(),
      };
      if (input.lessons !== undefined) payload.lessons_completed_count = input.lessons;
      if (input.status === 'completed') payload.completed_at = new Date().toISOString();
      const { error } = await supabase
        .from('student_training_plan_steps')
        .update(payload as never)
        .eq('id', input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: curriculumKeys.studentSteps(v.planId) });
    },
  });
}
