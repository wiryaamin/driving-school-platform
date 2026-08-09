import { Navigate } from 'react-router-dom';
import { useSessionStore } from '@core/store/session.store.js';
import { getPostLoginRoute } from '@/lib/auth/jwt.js';

/**
 * SmartRedirect — index redirect for the authenticated root route.
 * Shares its landing-route decision with LoginPage/AcceptInvitePage
 * (getPostLoginRoute) so all three agree: platform admins go to the platform
 * console, instructors go to their own daily operational workspace, everyone
 * else goes to /dashboard.
 */
export function SmartRedirect() {
  const user = useSessionStore(s => s.user);
  return <Navigate to={getPostLoginRoute(user)} replace />;
}
