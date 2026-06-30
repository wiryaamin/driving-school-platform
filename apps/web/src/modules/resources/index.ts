export { ResourcesPage } from './routes/ResourcesPage.js';
export { useVehicles, getServiceStatus } from './hooks/useVehicles.js';
export type { Vehicle, ServiceStatus } from './hooks/useVehicles.js';
export { useVehicleServiceRecords, useCreateServiceRecord, useDeleteServiceRecord, SERVICE_TYPE_LABELS } from './hooks/useVehicleService.js';
export type { VehicleServiceRecord, ServiceType, CreateServiceRecordInput } from './hooks/useVehicleService.js';
