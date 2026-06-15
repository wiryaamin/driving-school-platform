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
const CorporatePage = lazy(() => import('@modules/corporate/index.js').then(m => ({ default: m.CorporatePage })));
const LogsPage = lazy(() => import('@modules/logs/index.js').then(m => ({ default: m.LogsPage })));
const WatchlistPage  = lazy(() => import('@modules/watchlist/index.js').then(m => ({ default: m.WatchlistPage })));
const ClassListPage  = lazy(() => import('@modules/classlist/index.js').then(m => ({ default: m.ClassListPage })));
const InsightsPage   = lazy(() => import('@modules/insights/index.js').then(m => ({ default: m.InsightsPage })));
const TasksPage      = lazy(() => import('@modules/tasks/index.js').then(m => ({ default: m.TasksPage })));
const RapporterPage  = lazy(() => import('@modules/reports/index.js').then(m => ({ default: m.RapporterPage })));
const SettingsPage         = lazy(() => import('@modules/settings/index.js').then(m => ({ default: m.SettingsPage })));
const KommunikationPage    = lazy(() => import('@modules/kommunikation/index.js').then(m => ({ default: m.KommunikationPage })));
const CommunicationHubPage   = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.CommunicationHubPage })));
const ComposeMessagePage     = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.ComposeMessagePage })));
const DeliveryLogPage        = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.DeliveryLogPage })));
const ChannelSettingsPage    = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.ChannelSettingsPage })));
const TemplateManagementPage = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.TemplateManagementPage })));
const ActivityCenterPage     = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.ActivityCenterPage })));
const NotificationRulesPage  = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.NotificationRulesPage })));
const QueueMonitorPage       = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.QueueMonitorPage })));
const DataMigrationPage      = lazy(() => import('@modules/data-migration/index.js').then(m => ({ default: m.DataMigrationPage })));
const MigrationDetailPage    = lazy(() => import('@modules/data-migration/index.js').then(m => ({ default: m.MigrationDetailPage })));

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
      {
        path: 'corporate/*',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <CorporatePage />
          </Suspense>
        ),
      },
      {
        path: 'logs',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <LogsPage />
          </Suspense>
        ),
      },
      {
        path: 'watchlist',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <WatchlistPage />
          </Suspense>
        ),
      },
      {
        path: 'class-list',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <ClassListPage />
          </Suspense>
        ),
      },
      {
        path: 'insights',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InsightsPage />
          </Suspense>
        ),
      },
      {
        path: 'tasks',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <TasksPage />
          </Suspense>
        ),
      },
      {
        path: 'reports/*',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <RapporterPage />
          </Suspense>
        ),
      },
      {
        path: 'settings/*',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <SettingsPage />
          </Suspense>
        ),
      },
      {
        path: 'kommunikation',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <KommunikationPage />
          </Suspense>
        ),
      },
      {
        path: 'communication',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <CommunicationHubPage />
          </Suspense>
        ),
      },
      {
        path: 'communication/compose',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <ComposeMessagePage />
          </Suspense>
        ),
      },
      {
        path: 'communication/log',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <DeliveryLogPage />
          </Suspense>
        ),
      },
      {
        path: 'communication/settings',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <ChannelSettingsPage />
          </Suspense>
        ),
      },
      {
        path: 'communication/templates',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <TemplateManagementPage />
          </Suspense>
        ),
      },
      {
        path: 'communication/activity',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <ActivityCenterPage />
          </Suspense>
        ),
      },
      {
        path: 'communication/rules',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <NotificationRulesPage />
          </Suspense>
        ),
      },
      {
        path: 'communication/queue',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <QueueMonitorPage />
          </Suspense>
        ),
      },

      {
        path: 'settings/data-migration',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <DataMigrationPage />
          </Suspense>
        ),
      },
      {
        path: 'settings/data-migration/:id',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <MigrationDetailPage />
          </Suspense>
        ),
      },

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
