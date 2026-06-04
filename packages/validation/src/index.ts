export {
  PaginationSchema,
  UuidSchema,
  UuidParamsSchema,
  OptionalUuidSchema,
  ListQuerySchema,
} from './common/index.js';
export type {
  PaginationDto,
  UuidParamsDto,
  ListQueryDto,
} from './common/index.js';

export {
  CreateStudentSchema,
  UpdateStudentSchema,
  StudentListQuerySchema,
} from './students/index.js';
export type {
  CreateStudentDto,
  UpdateStudentDto,
  StudentListQueryDto,
} from './students/index.js';

export {
  CreateInstructorSchema,
  UpdateInstructorSchema,
  InstructorListQuerySchema,
} from './instructors/index.js';
export type {
  CreateInstructorDto,
  UpdateInstructorDto,
  InstructorListQueryDto,
} from './instructors/index.js';

export {
  CreateNotificationSchema,
  NotificationListQuerySchema,
  UpsertPreferenceSchema,
  JoinWaitlistSchema,
  WaitlistListQuerySchema,
  UpsertAutomationRuleSchema,
} from './notifications/index.js';
export type {
  CreateNotificationDto,
  NotificationListQueryDto,
  UpsertPreferenceDto,
  JoinWaitlistDto,
  WaitlistListQueryDto,
  UpsertAutomationRuleDto,
} from './notifications/index.js';

export {
  CreateLessonSlotSchema,
  UpdateLessonSlotSchema,
  LessonSlotListQuerySchema,
  CreateBookingSchema,
  UpdateBookingSchema,
  CancelBookingSchema,
  RescheduleBookingSchema,
  LessonBookingListQuerySchema,
} from './scheduling/index.js';
export type {
  CreateLessonSlotDto,
  UpdateLessonSlotDto,
  LessonSlotListQueryDto,
  CreateBookingDto,
  UpdateBookingDto,
  CancelBookingDto,
  RescheduleBookingDto,
  LessonBookingListQueryDto,
} from './scheduling/index.js';
