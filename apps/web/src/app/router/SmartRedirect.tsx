import { Navigate } from 'react-router-dom';
import { useSessionStore } from '@core/store/session.store.js';

/**
 * SmartRedirect — index redirect for the authenticated root route.
 * Platform admins without a tenant context go to /platform/dashboard.
 * Everyone else goes to /dashboard.
 */
export function SmartRedirect() {
  const user = useSessionStore(s => s.user);
  if (user?.is_platform_admin) {
    return <Navigate to="/platform/dashboard" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}
