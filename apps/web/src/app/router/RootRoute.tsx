import { lazy, Suspense } from 'react';
import { useSessionStore } from '@core/store/session.store.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';
import { SmartRedirect } from './SmartRedirect.js';

const LandingPage = lazy(() => import('@modules/landing/index.js').then(m => ({ default: m.LandingPage })));
const PublicLayout = lazy(() => import('@modules/public-site/index.js').then(m => ({ default: m.PublicLayout })));

/**
 * RootRoute — resolves the bare domain root ('/').
 * Signed-out visitors see the marketing landing page at '/' itself (no
 * redirect to '/landing'). Signed-in users are sent into the app via the
 * same SmartRedirect logic used everywhere else.
 */
export function RootRoute() {
  const isAuthenticated = useSessionStore(s => s.isAuthenticated);
  const isLoading = useSessionStore(s => s.isLoading);

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) return <SmartRedirect />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <PublicLayout>
        <LandingPage />
      </PublicLayout>
    </Suspense>
  );
}
