import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { AppShellLayout } from '@app/layouts/AppShell.js';
import { AuthLayout } from '@app/layouts/AuthLayout.js';
import { ProtectedRoute } from '@shared/components/guards/ProtectedRoute.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';

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
    ],
  },

  // ── Catch-all ─────────────────────────────────────────────────────────────
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
];
