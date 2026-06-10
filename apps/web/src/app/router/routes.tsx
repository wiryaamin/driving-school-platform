import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { AppShellLayout } from '@app/layouts/AppShell.js';
import { AuthLayout } from '@app/layouts/AuthLayout.js';
import { ProtectedRoute } from '@shared/components/guards/ProtectedRoute.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';
import { ForbiddenPage } from '@modules/auth/routes/ForbiddenPage.js';
import { ComingSoonPage } from '@shared/components/placeholders/ComingSoonPage.js';

// ─── Lazy-loaded Page Routes ──────────────────────────────────────────────────
// Each module loaded only when first navigated to — reduces initial bundle.

const LoginPage = lazy(() => import('@modules/auth/routes/LoginPage.js').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@modules/dashboard/routes/DashboardPage.js').then(m => ({ default: m.DashboardPage })));
const StudentsPage = lazy(() => import('@modules/students/index.js').then(m => ({ default: m.StudentsPage })));
const SchedulingPage = lazy(() => import('@modules/scheduling/index.js').then(m => ({ default: m.SchedulingPage })));
const InstructorsPage = lazy(() => import('@modules/instructors/index.js').then(m => ({ default: m.InstructorsPage })));
const FinancePage = lazy(() => import('@modules/finance/index.js').then(m => ({ default: m.FinancePage })));

// Future modules — uncomment as they're implemented:
// const SettingsPage = lazy(() => import('@modules/settings/routes/SettingsPage.js').then(m => ({ default: m.SettingsPage })));

// ─── Route Definitions ────────────────────────────────────────────────────────
//
// Authorization boundary:
//   Public routes (AuthLayout):  /auth/*  — accessible without a session
//   Protected routes (ProtectedRoute + AppShellLayout): /  — require authentication;
//     ProtectedRoute redirects unauthenticated visitors to /auth/login with
//     state.from preserved so the post-login redirect lands on the intended page.
//   Permission-denied route: /403  — shown when ProtectedRoute rejects due to
//     missing permissions; rendered standalone (no AppShell) so it's accessible
//     after auth but before any module-specific permission is loaded.
//   Catch-all: unknown paths redirect to /auth/login to avoid silent 404s and
//     ensure ProtectedRoute's redirect-with-state mechanism is triggered cleanly.

export const routes: RouteObject[] = [
  // ── Auth routes (public) ──────────────────────────────────────────────────
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      {
        path: 'login',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <LoginPage />
          </Suspense>
        ),
      },
    ],
  },

  // ── Permission-denied page (outside ProtectedRoute — requires auth but not ──
  // ── a specific permission, so ProtectedRoute would loop if this were inside) ─
  {
    path: '/403',
    element: <ForbiddenPage />,
  },

  // ── Protected app routes ──────────────────────────────────────────────────
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShellLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      // ── Module routes ─────────────────────────────────────────────────
      {
        path: 'students/*',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentsPage />
          </Suspense>
        ),
      },
      {
        path: 'scheduling/*',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <SchedulingPage />
          </Suspense>
        ),
      },
      {
        path: 'instructors/*',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorsPage />
          </Suspense>
        ),
      },
      {
        path: 'finance/*',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <FinancePage />
          </Suspense>
        ),
      },
      // Future module routes — added here as modules are implemented:
      // { path: 'settings/*', element: <Suspense fallback={<LoadingScreen />}><SettingsPage /></Suspense> },

      // ── Authenticated fallback — MUST be last child ───────────────────────
      // Catches any path that passes ProtectedRoute but has no matching module
      // yet (e.g. /reports, /settings, /corporate). Renders a placeholder inside
      // the AppShell so the user is never ejected from their session. Replace
      // this child with a real route once the module is implemented.
      {
        path: '*',
        element: <ComingSoonPage />,
      },
    ],
  },

  // ── Catch-all: redirect to login so ProtectedRoute can handle auth + ──────
  // ── preserve state.from on the subsequent redirect to a known page ─────────
  {
    path: '*',
    element: <Navigate to="/auth/login" replace />,
  },
];
