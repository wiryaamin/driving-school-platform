import { useCallback } from 'react';
import { useSessionStore } from '@core/store/session.store.js';
import type { Permission } from './permissions.js';

/**
 * Permission checking hook — used in all components and pages.
 *
 * @example
 * const { can, canAny, canAll } = usePermissions();
 * if (can('finance:invoice:void')) { ... }
 */
export function usePermissions() {
  const { hasPermission, hasAnyPermission, hasAllPermissions, user } = useSessionStore();

  const can = useCallback(
    (permission: Permission): boolean => hasPermission(permission),
    [hasPermission]
  );

  const canAny = useCallback(
    (permissions: Permission[]): boolean => hasAnyPermission(permissions),
    [hasAnyPermission]
  );

  const canAll = useCallback(
    (permissions: Permission[]): boolean => hasAllPermissions(permissions),
    [hasAllPermissions]
  );

  const isRole = useCallback(
    (role: string): boolean => user?.role === role,
    [user]
  );

  return { can, canAny, canAll, isRole };
}
