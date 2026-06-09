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
// Phase 4B
export { RefundRepository } from './repositories/refund.repository.js';
export { PaymentAllocationRepository } from './repositories/payment-allocation.repository.js';
export { DiscountRepository } from './repositories/discount.repository.js';
export { CouponRepository } from './repositories/coupon.repository.js';
export { DiscountApplicationRepository } from './repositories/discount-application.repository.js';
export { DunningScheduleRepository } from './repositories/dunning-schedule.repository.js';
export { InvoiceDunningStateRepository } from './repositories/invoice-dunning-state.repository.js';
export { InvoiceReminderLogRepository } from './repositories/invoice-reminder-log.repository.js';
export { AccountingExportRepository } from './repositories/accounting-export.repository.js';
export { AccountingExportEntryRepository } from './repositories/accounting-export-entry.repository.js';
// Phase 4C
export { BasAccountRepository } from './repositories/bas-account.repository.js';
export { VatPeriodRepository } from './repositories/vat-period.repository.js';
export { Sie4ExportRepository } from './repositories/sie4-export.repository.js';
export { FortnoxSyncRepository } from './repositories/fortnox-sync.repository.js';
// Phase 4D
export { JournalEntryRepository } from './repositories/journal-entry.repository.js';
export { AccountBalanceRepository } from './repositories/account-balance.repository.js';
export { DeferredRevenueRepository } from './repositories/deferred-revenue.repository.js';
// Phase 4E
export { BankStatementImportRepository, BankStatementLineRepository } from './repositories/bank-statement.repository.js';
export { ReconciliationRunRepository, ReconciliationItemRepository } from './repositories/reconciliation-run.repository.js';
export { FiscalYearRepository } from './repositories/fiscal-year.repository.js';
export { PeriodAuditSnapshotRepository, LedgerConsistencyCheckRepository } from './repositories/period-snapshot.repository.js';
// Phase 4F
export { PayrollRunRepository, PayrollEntryRepository } from './repositories/payroll-run.repository.js';
export { TaxRemittanceRepository, VatClearingRunRepository } from './repositories/tax-remittance.repository.js';
export { AgiExportRepository, AgiExportLineRepository, RegulatoryAuditExportRepository } from './repositories/regulatory-export.repository.js';
// Phase 4G
export { FixedAssetClassRepository, FixedAssetRepository, AssetDisposalRepository } from './repositories/fixed-asset.repository.js';
export { DepreciationScheduleRepository } from './repositories/depreciation.repository.js';
export { AccrualScheduleRepository, AccrualReleaseLineRepository, PeriodicDeferredScheduleRepository } from './repositories/accrual.repository.js';
// Phase 4H
export { LedgerReplayRunRepository, ReplaySnapshotRepository } from './repositories/ledger-replay.repository.js';
export {
  ScheduleGenerationRepository,
  ScheduleGenerationLinkRepository,
  FiscalDependencyGraphRepository,
  ReplayDivergenceEventRepository,
  SubledgerCloseJobRepository,
  ReplayValidationReportRepository,
  CanonicalReplayExportRepository,
  ReplayHashRegistryRepository,
} from './repositories/ledger-governance.repository.js';
// Phase 4H-A
export {
  AccountingLayerRegistryRepository,
  ReplayValidationDeltaRepository,
  ReplayCertificationRepository,
  ReplayIntegrityCertificateRepository,
  ReplayExecutionJobRepository,
  CanonicalExportHashRepository,
} from './repositories/accounting-architecture.repository.js';
// Phase 5A
export {
  ComplianceEventRepository,
  AgiSubmissionRepository,
  AgiSubmissionLineRepository,
  VatDeclarationRepository,
  VatDeclarationLineRepository,
  FilingCertificationRepository,
  SaftExportRepository,
  RetentionPolicyRepository,
  RegulatoryExportHashRepository,
  // Phase 5A.1
  CanonicalizationProfileRepository,
  ReplayAssertionRepository,
  DeterministicExportRegistryRepository,
  CertificationSnapshotRepository,
} from './repositories/compliance.repository.js';

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
// Phase 4B
export { RefundService } from './services/refund.service.js';
export { DiscountService } from './services/discount.service.js';
export { DunningService } from './services/dunning.service.js';
export { ReconciliationService } from './services/reconciliation.service.js';
export { ReportingService } from './services/reporting.service.js';
export { AccountingExportService } from './services/accounting-export.service.js';
// Phase 4C
export { SwedishComplianceService } from './services/swedish-compliance.service.js';
export { SwedishVatService } from './services/swedish-vat.service.js';
export { Sie4Service } from './services/sie4.service.js';
export { FortnoxService } from './services/fortnox.service.js';
// Phase 4D
export { LedgerService } from './services/ledger.service.js';
export { PostingService } from './services/posting.service.js';
export { RevenueRecognitionService } from './services/revenue-recognition.service.js';
// Phase 4E
export { BankReconciliationService } from './services/bank-reconciliation.service.js';
export { FinancialCloseService } from './services/financial-close.service.js';
export { FiscalYearService } from './services/fiscal-year.service.js';
// Phase 4F
export { PayrollJournalService } from './services/payroll-journal.service.js';
export { TaxClearingService } from './services/tax-clearing.service.js';
export { RegulatoryExportService } from './services/regulatory-export.service.js';
// Phase 4G
export { FixedAssetService } from './services/fixed-asset.service.js';
export { DepreciationService } from './services/depreciation.service.js';
export { AccrualService } from './services/accrual.service.js';
// Phase 4H
export { LedgerReplayService } from './services/ledger-replay.service.js';
export { LedgerGovernanceService } from './services/ledger-governance.service.js';
// Phase 4H-A
export { AccountingArchitectureService } from './services/accounting-architecture.service.js';
// Phase 5A
export { ComplianceService } from './services/compliance.service.js';

// Events
export { OutboxPublisher, createOutboxPublisher } from './events/outbox.publisher.js';
export type { OutboxEventInput } from './events/outbox.publisher.js';
