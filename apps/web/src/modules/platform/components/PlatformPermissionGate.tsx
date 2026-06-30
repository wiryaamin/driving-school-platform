import type { ReactNode } from 'react';
import { useSessionStore } from '@core/store/session.store.js';
import type { PlatformRole } from '@platform/types';

interface PlatformPermissionGateProps {
  roles:    PlatformRole[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children only when the authenticated user holds one of the
 * specified platform admin roles (platform_superadmin, platform_support,
 * platform_billing). Has no interaction with tenant RBAC.
 *
 * Usage:
 *   <PlatformPermissionGate roles={['platform_superadmin']}>
 *     <DangerZoneActions />
 *   </PlatformPermissionGate>
 */
export function PlatformPermissionGate({
  roles,
  children,
  fallback = null,
}: PlatformPermissionGateProps) {
  const user = useSessionStore(s => s.user);

  if (!user?.is_platform_admin) return <>{fallback}</>;

  const platformRole = user.role as PlatformRole | null;
  if (!platformRole || !roles.includes(platformRole)) return <>{fallback}</>;

  return <>{children}</>;
}
