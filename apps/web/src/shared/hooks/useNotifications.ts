// Canonical implementation moved to useNotificationBell.ts (shell notification bell hooks).
// This file re-exports for backward compatibility.
export { useRecentActivity, useNotificationDot, notificationBellKeys } from './useNotificationBell.js';
export type { Notification } from './useNotificationBell.js';
