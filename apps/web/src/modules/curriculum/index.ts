export { CurriculumPage }         from './routes/CurriculumPage.js';
export { CurriculumTemplatePage } from './routes/CurriculumTemplatePage.js';
export { StudentTrainingPlanPanel } from './components/StudentTrainingPlanPanel.js';
export {
  useCurriculumTemplates,
  useCurriculumTemplateSteps,
  useStudentTrainingPlan,
  useStudentPlanSteps,
  useAssignTrainingPlan,
  useUpdateStudentPlanStep,
} from './hooks/useCurriculum.js';
export type {
  TrainingPlanTemplate,
  TemplateStep,
  StudentTrainingPlan,
  StudentPlanStep,
} from './hooks/useCurriculum.js';
