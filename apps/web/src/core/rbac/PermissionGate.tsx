import type { ReactNode } from 'react';
import { usePermissions } from './hooks.js';
import type { Permission } from './permissions.js';

interface PermissionGateProps {
  /** Single permission required to render children */
  permission?: Permission;
  /** Any of these permissions required (OR logic) */
  anyOf?: Permission[];
  /** All of these permissions required (AND logic) */
  allOf?: Permission[];
  /** Rendered when permission check fails — defaults to null */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Declarative permission guard component.
 * Renders children only when the user has the required permission(s).
 *
 * @example
 * <PermissionGate permission="finance:invoice:void">
 *   <VoidInvoiceButton />
 * </PermissionGate>
 *
 * <PermissionGate anyOf={['org_admin', 'finance_admin']} fallback={<AccessDenied />}>
 *   <FinancePanel />
 * </PermissionGate>
 */
export function PermissionGate({
  permission,
  anyOf,
  allOf,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { can, canAny, canAll } = usePermissions();

  let allowed = true;

  if (permission) allowed = can(permission);
  else if (anyOf && anyOf.length > 0) allowed = canAny(anyOf);
  else if (allOf && allOf.length > 0) allowed = canAll(allOf);

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
