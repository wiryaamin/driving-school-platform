import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '@core/store/session.store.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';

// These two routes legitimately establish a real (recovery/invite-scoped)
// Supabase session mid-flow, before the user has set their password —
// the auto-redirect-when-authenticated below must not hijack them away
// from the password-set form the moment that session appears.
const AUTHENTICATED_EXEMPT_PATHS = ['/auth/reset-password', '/auth/accept-invite'];

/**
 * AuthLayout — the layout for all /auth/* routes.
 * Redirects already-authenticated users to the dashboard.
 */
export function AuthLayout() {
  const { isAuthenticated, isLoading } = useSessionStore();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated && !AUTHENTICATED_EXEMPT_PATHS.includes(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <a href="https://trafikcloud.se/" className="h-9 w-[215px] overflow-hidden block rounded-sm bg-white">
            <img
              src="/logo-v2.png"
              alt="Trafikcloud"
              className="block h-[168px] w-[252px] max-w-none -ml-[18px] -mt-[64px]"
            />
          </a>
        </div>

        {/* Auth page content */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <Outlet />
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} Trafikcloud. Alla rättigheter förbehållna.
        </p>
      </div>
    </div>
  );
}
