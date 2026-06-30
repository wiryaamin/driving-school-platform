export { PackagePage }      from './routes/PackagePage.js';
export { PackageListPage }  from './routes/PackageListPage.js';
export { PackageDetailPage } from './routes/PackageDetailPage.js';
export { StudentPackagePanel } from './components/StudentPackagePanel.js';
export {
  useStudentPackages,
  usePackageDetail,
  useConsumeCredit,
  useReverseCredit,
  useExpirePackages,
  useUpdatePackageConfig,
  packageStatusLabel,
  packageStatusColor,
  consumptionEventLabel,
  consumptionEventColor,
  reversalTypeLabel,
} from './hooks/usePackageConsumption.js';
export type {
  StudentPackage,
  StudentPackageDetail,
  PackageConsumptionEvent,
  PackageCreditReversal,
  PackageStatusType,
  ConsumptionEventType,
  ReversalType,
} from './hooks/usePackageConsumption.js';
