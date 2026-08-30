import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '@core/store/session.store.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';
import type { Permission } from '@core/rbac/permissions.js';
import { getTrialLockState } from '@core/auth/trialLock.js';

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
  const { isAuthenticated, isLoading, hasAllPermissions, hasAnyPermission, organization, user } = useSessionStore();
  const location = useLocation();

  // Show loading spinner while auth state is being determined
  if (isLoading) return <LoadingScreen />;

  // Redirect to login if not authenticated, preserving the intended destination
  if (!isAuthenticated) {
    return <Navigate to={loginRedirect} state={{ from: location }} replace />;
  }

  // Authenticated but no organization and not a platform admin (a disabled
  // profile, an offboarded member, or any other state get_user_jwt_claims
  // returns empty claims for) has nothing here to actually access.
  // getPostLoginRoute already steers a *fresh* login/redirect away from
  // /dashboard for this case, but that only runs once, at the login moment
  // — a reload, a bookmark, or an already-open tab landing straight on a
  // protected route never passes back through it, so the empty-claims user
  // still reached the full tenant shell with every widget's query 403ing.
  // This is the check that actually holds regardless of how the route was
  // reached. Confirmed via a real account stuck in exactly this state
  // during live testing, 2026-08-30.
  if (!user?.is_platform_admin && !organization) {
    return <Navigate to="/403?reason=no_organization" replace />;
  }

  // Trial expired past its 7-day grace period: block the whole app until a
  // platform admin extends/upgrades. Skip the check on /trial-expired itself
  // to avoid a redirect loop. Same rule enforced server-side in
  // supabase/functions/_shared/context.ts — this is the UI-side mirror.
  if (location.pathname !== '/trial-expired' && getTrialLockState(organization).locked) {
    return <Navigate to="/trial-expired" replace />;
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
