import { Outlet, Navigate } from 'react-router-dom';
import { useSessionStore } from '@core/store/session.store.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';

/**
 * AuthLayout — the layout for all /auth/* routes.
 * Redirects already-authenticated users to the dashboard.
 */
export function AuthLayout() {
  const { isAuthenticated, isLoading } = useSessionStore();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-4">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-white" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Körskoleplattformen</h1>
        </div>

        {/* Auth page content */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <Outlet />
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} Körskoleplattformen. Alla rättigheter förbehållna.
        </p>
      </div>
    </div>
  );
}
