import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '@core/store/session.store.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';
import type { Permission } from '@core/rbac/permissions.js';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Require specific permissions to access this route */
  permissions?: Permission[];
  /** Require ANY of these permissions (OR logic) */
  anyPermissions?: Permission[];
  /** Custom redirect when unauthenticated (default: /auth/login) */
  loginRedirect?: string;
  /** Custom redirect when forbidden (default: /403) */
  forbiddenRedirect?: string;
}

/**
 * ProtectedRoute — guards routes that require authentication (and optionally permissions).
 * Place around any route that should not be accessible without login.
 *
 * @example
 * // Auth only
 * <ProtectedRoute><DashboardPage /></ProtectedRoute>
 *
 * // Auth + permission
 * <ProtectedRoute permissions={['finance:invoice:void']}>
 *   <VoidInvoicePage />
 * </ProtectedRoute>
 */
export function ProtectedRoute({
  children,
  permissions,
  anyPermissions,
  loginRedirect = '/auth/login',
  forbiddenRedirect = '/403',
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasAllPermissions, hasAnyPermission } = useSessionStore();
  const location = useLocation();

  // Show loading spinner while auth state is being determined
  if (isLoading) return <LoadingScreen />;

  // Redirect to login if not authenticated, preserving the intended destination
  if (!isAuthenticated) {
    return <Navigate to={loginRedirect} state={{ from: location }} replace />;
  }

  // Permission checks
  if (permissions && permissions.length > 0 && !hasAllPermissions(permissions)) {
    return <Navigate to={forbiddenRedirect} replace />;
  }
  if (anyPermissions && anyPermissions.length > 0 && !hasAnyPermission(anyPermissions)) {
    return <Navigate to={forbiddenRedirect} replace />;
  }

  return <>{children}</>;
}
