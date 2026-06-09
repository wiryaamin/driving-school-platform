export { InstructorsPage } from './routes/InstructorsPage.js';

export { useInstructorList, useInstructor, instructorKeys } from './hooks/useInstructors.js';
export type { InstructorListResponse, InstructorListMeta } from './hooks/useInstructors.js';
export { useCreateInstructor, useUpdateInstructor, useArchiveInstructor } from './hooks/useInstructors.js';
export type { CreateInstructorFormValues, UpdateInstructorFormValues } from './hooks/useInstructors.js';

export {
  InstructorStatusBadge,
  instructorStatusLabel,
  INSTRUCTOR_STATUS_OPTIONS,
} from './components/InstructorStatusBadge.js';

export {
  employmentTypeLabel,
  formatTeachingCategories,
  formatAdiValidity,
} from './lib/instructorUtils.js';
