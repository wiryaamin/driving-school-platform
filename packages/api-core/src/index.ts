// Context
export type { TenantContext } from './context/tenant-context.js';
export { buildTenantContext, requireOrgContext } from './context/tenant-context.js';
export type { RequestContext } from './context/request-context.js';
export { buildRequestContext, getElapsedMs } from './context/request-context.js';
export type { WorkerContext } from './context/worker-context.js';
export { buildWorkerContext, buildPlatformWorkerContext } from './context/worker-context.js';

// Errors
export {
  ServiceError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  BusinessRuleError,
  InternalError,
  isServiceError,
} from './errors/service-errors.js';
export { mapDbError } from './errors/db-error-mapper.js';

// Utils
export { ok, fail, fromError, assertOk } from './utils/result.js';
export {
  normalizePagination,
  buildPaginationMeta,
  paginationToRange,
  buildPagedResult,
} from './utils/pagination.js';
export type { NormalizedPagination } from './utils/pagination.js';
export { applyListQuery, buildOrgScope } from './utils/query-builder.js';
export type { ListQueryOptions, TableName } from './utils/query-builder.js';

// Middleware
export { assertPermission, hasPermission, requireActor } from './middleware/rbac.middleware.js';

// Repository
export { BaseRepository } from './repositories/base.repository.js';
export { StudentRepository } from './repositories/student.repository.js';
export { InstructorRepository } from './repositories/instructor.repository.js';
export { LessonSlotRepository } from './repositories/lesson-slot.repository.js';
export { LessonBookingRepository } from './repositories/lesson-booking.repository.js';
export { NotificationRepository } from './repositories/notification.repository.js';
export { NotificationPreferenceRepository } from './repositories/notification-preference.repository.js';
export { LessonReminderRepository } from './repositories/lesson-reminder.repository.js';
export { WaitlistRepository } from './repositories/waitlist.repository.js';
export { PackageCatalogRepository } from './repositories/package-catalog.repository.js';
export { PackageOfferingRepository } from './repositories/package-offering.repository.js';
export { StudentPackageRepository } from './repositories/student-package.repository.js';
export { CreditLedgerRepository } from './repositories/credit-ledger.repository.js';
export { InvoiceRepository } from './repositories/invoice.repository.js';
export { PaymentRepository } from './repositories/payment.repository.js';
export { FinancialPeriodRepository } from './repositories/financial-period.repository.js';

// Services
export { StudentService } from './services/student.service.js';
export { InstructorService } from './services/instructor.service.js';
export { SchedulingService } from './services/scheduling.service.js';
export { NotificationService } from './services/notification.service.js';
export { ReminderService } from './services/reminder.service.js';
export { WaitlistService } from './services/waitlist.service.js';
export { PackageService } from './services/package.service.js';
export { InvoiceService } from './services/invoice.service.js';
export { PaymentService } from './services/payment.service.js';
export { CreditService } from './services/credit.service.js';

// Events
export { OutboxPublisher, createOutboxPublisher } from './events/outbox.publisher.js';
export type { OutboxEventInput } from './events/outbox.publisher.js';
