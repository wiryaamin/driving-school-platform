import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '@core/store/session.store.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';

interface PlatformAdminRouteProps {
  children: ReactNode;
}

/**
 * PlatformAdminRoute — guards routes that require is_platform_admin = true.
 * - Unauthenticated users → /auth/login
 * - Authenticated tenant users → /dashboard
 * - Platform admins → render children
 */
export function PlatformAdminRoute({ children }: PlatformAdminRouteProps) {
  const { isAuthenticated, isLoading, user } = useSessionStore();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (!user?.is_platform_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
