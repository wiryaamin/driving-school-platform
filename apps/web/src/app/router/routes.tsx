import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { AppShellLayout } from '@app/layouts/AppShell.js';
import { AuthLayout } from '@app/layouts/AuthLayout.js';
import { ProtectedRoute } from '@shared/components/guards/ProtectedRoute.js';
import { PlatformAdminRoute } from '@shared/components/guards/PlatformAdminRoute.js';
import { SmartRedirect } from './SmartRedirect.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';
import { ForbiddenPage } from '@modules/auth/routes/ForbiddenPage.js';
import { ComingSoonPage } from '@shared/components/placeholders/ComingSoonPage.js';
import { StudentPortalLayout } from '@modules/student-portal/index.js';
import { InstructorPortalLayout } from '@modules/instructor-portal/index.js';
import { InstructorAppLayout } from '@modules/instructor-app/index.js';

// ─── Platform Admin module (lazy) ─────────────────────────────────────────────
const PlatformShell             = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformShell })));
const PlatformDashboardPage     = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformDashboardPage })));
const PlatformOrganizationsPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformOrganizationsPage })));
const PlatformSubscriptionsPage      = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformSubscriptionsPage })));
const PlatformSubscriptionDetailPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformSubscriptionDetailPage })));
const PlatformAuditPage              = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformAuditPage })));
const PlatformAdminsPage               = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformAdminsPage })));
const PlatformOrganizationDetailPage   = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformOrganizationDetailPage })));
const PlatformRolesPage    = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformRolesPage })));
const PlatformSupportPage  = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformSupportPage })));
const PlatformSecurityPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformSecurityPage })));

// ─── Public catalog (lazy) ────────────────────────────────────────────────────
const PublicCatalogPage       = lazy(() => import('@modules/public-catalog/index.js').then(m => ({ default: m.PublicCatalogPage })));
const PublicPackageDetailPage = lazy(() => import('@modules/public-catalog/index.js').then(m => ({ default: m.PublicPackageDetailPage })));
const CheckoutPage            = lazy(() => import('@modules/public-catalog/index.js').then(m => ({ default: m.CheckoutPage })));
const ConfirmationPage        = lazy(() => import('@modules/public-catalog/index.js').then(m => ({ default: m.ConfirmationPage })));

// ─── Enrollments operator module (lazy) ──────────────────────────────────────
const EnrollmentListPage   = lazy(() => import('@modules/enrollments/index.js').then(m => ({ default: m.EnrollmentListPage })));
const EnrollmentDetailPage = lazy(() => import('@modules/enrollments/index.js').then(m => ({ default: m.EnrollmentDetailPage })));

// ─── Public leads / booking page (lazy) ──────────────────────────────────────
const PublicBookingPage = lazy(() => import('@modules/leads/index.js').then(m => ({ default: m.PublicBookingPage })));
const LeadsPage              = lazy(() => import('@modules/leads/index.js').then(m => ({ default: m.LeadsPage })));
const CurriculumPage         = lazy(() => import('@modules/curriculum/index.js').then(m => ({ default: m.CurriculumPage })));
const CurriculumTemplatePage = lazy(() => import('@modules/curriculum/index.js').then(m => ({ default: m.CurriculumTemplatePage })));

// ─── Instructor app (lazy) ────────────────────────────────────────────────────
const InstructorAppIdagPage        = lazy(() => import('@modules/instructor-app/index.js').then(m => ({ default: m.InstructorAppIdagPage })));
const InstructorAppSchemaPage      = lazy(() => import('@modules/instructor-app/index.js').then(m => ({ default: m.InstructorAppSchemaPage })));
const InstructorAppElevPage        = lazy(() => import('@modules/instructor-app/index.js').then(m => ({ default: m.InstructorAppElevPage })));
const InstructorAppElevDetailPage  = lazy(() => import('@modules/instructor-app/index.js').then(m => ({ default: m.InstructorAppElevDetailPage })));
const InstructorAppStatistikPage   = lazy(() => import('@modules/instructor-app/index.js').then(m => ({ default: m.InstructorAppStatistikPage })));
const InstructorAppProfilPage      = lazy(() => import('@modules/instructor-app/index.js').then(m => ({ default: m.InstructorAppProfilPage })));

// ─── Student portal (lazy) ────────────────────────────────────────────────────
const StudentPortalDashboard    = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalDashboard })));
const StudentPortalBokaPage     = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalBokaPage })));
const StudentPortalBokningarPage = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalBokningarPage })));
const StudentPortalFramstegPage = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalFramstegPage })));
const StudentPortalKontoPage    = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalKontoPage })));
const StudentPortalMaterialPage = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalMaterialPage })));
const StudentPortalTeoriPage     = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalTeoriPage })));
const StudentPortalSettingsPage      = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalSettingsPage })));
const StudentPortalOvningkorningPage = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalOvningkorningPage })));
const StudentPortalMinLararePage     = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalMinLararePage })));
const StudentPortalDokumentPage      = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalDokumentPage })));
const StudentPortalKorkortsresaPage  = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalKorkortsresaPage })));
const StudentPortalUtbildningskortPage = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalUtbildningskortPage })));
const StudentPortalMeddelandenPage   = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalMeddelandenPage })));

const InstructorPortalUtbildningskortPage = lazy(() => import('@modules/instructor-portal/index.js').then(m => ({ default: m.InstructorPortalUtbildningskortPage })));

// ─── Instructor portal (lazy) ─────────────────────────────────────────────────
const InstructorPortalDashboard         = lazy(() => import('@modules/instructor-portal/index.js').then(m => ({ default: m.InstructorPortalDashboard })));
const InstructorPortalSchemaPage        = lazy(() => import('@modules/instructor-portal/index.js').then(m => ({ default: m.InstructorPortalSchemaPage })));
const InstructorPortalBokningarPage     = lazy(() => import('@modules/instructor-portal/index.js').then(m => ({ default: m.InstructorPortalBokningarPage })));
const InstructorPortalElevPage          = lazy(() => import('@modules/instructor-portal/index.js').then(m => ({ default: m.InstructorPortalElevPage })));
const InstructorPortalStatistikPage     = lazy(() => import('@modules/instructor-portal/index.js').then(m => ({ default: m.InstructorPortalStatistikPage })));
const InstructorPortalInstallningarPage = lazy(() => import('@modules/instructor-portal/index.js').then(m => ({ default: m.InstructorPortalInstallningarPage })));

// ─── Guardian portal (lazy) ───────────────────────────────────────────────────
const GuardianPortalLayout             = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalLayout })));
const GuardianPortalDashboard          = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalDashboard })));
const GuardianPortalSchemaPage         = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalSchemaPage })));
const GuardianPortalFramstegPage       = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalFramstegPage })));
const GuardianPortalEkonomiPage        = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalEkonomiPage })));
const GuardianPortalKorkortsresaPage   = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalKorkortsresaPage })));
const GuardianPortalRiskutbildningPage = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalRiskutbildningPage })));
const GuardianPortalMeddelandenPage    = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalMeddelandenPage })));
const GuardianPortalDokumentPage       = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalDokumentPage })));
const GuardianPortalKontoPage          = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalKontoPage })));
const GuardianPortalBokningarPage      = lazy(() => import('@modules/guardian-portal/index.js').then(m => ({ default: m.GuardianPortalBokningarPage })));

// ─── Lazy-loaded Page Routes ──────────────────────────────────────────────────
// Each module loaded only when first navigated to — reduces initial bundle.

const LoginPage = lazy(() => import('@modules/auth/routes/LoginPage.js').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@modules/dashboard/routes/DashboardPage.js').then(m => ({ default: m.DashboardPage })));
const StudentsPage      = lazy(() => import('@modules/students/index.js').then(m => ({ default: m.StudentsPage })));
const InaktivaElevPage  = lazy(() => import('@modules/students/routes/InaktivaElevPage.js').then(m => ({ default: m.InaktivaElevPage })));
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
const CommunicationHubPage   = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.CommunicationHubPage })));
const ComposeMessagePage     = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.ComposeMessagePage })));
const DeliveryLogPage        = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.DeliveryLogPage })));
const ChannelSettingsPage    = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.ChannelSettingsPage })));
const TemplateManagementPage = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.TemplateManagementPage })));
const ActivityCenterPage     = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.ActivityCenterPage })));
const NotificationRulesPage  = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.NotificationRulesPage })));
const QueueMonitorPage       = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.QueueMonitorPage })));
const CommAnalyticsPage      = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.CommAnalyticsPage })));
const NotificationLogPage    = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.NotificationLogPage })));
const ResourcesPage          = lazy(() => import('@modules/resources/index.js').then(m => ({ default: m.ResourcesPage })));
const DataMigrationPage      = lazy(() => import('@modules/data-migration/index.js').then(m => ({ default: m.DataMigrationPage })));
const MigrationDetailPage    = lazy(() => import('@modules/data-migration/index.js').then(m => ({ default: m.MigrationDetailPage })));
const ProfilePage            = lazy(() => import('@modules/profile/index.js').then(m => ({ default: m.ProfilePage })));
const PackagePage            = lazy(() => import('@modules/packages/index.js').then(m => ({ default: m.PackagePage })));
const CampaignPage           = lazy(() => import('@modules/campaigns/index.js').then(m => ({ default: m.CampaignPage })));
const OrderListPage          = lazy(() => import('@modules/orders/index.js').then(m => ({ default: m.OrderListPage })));
const OrderDetailPage        = lazy(() => import('@modules/orders/index.js').then(m => ({ default: m.OrderDetailPage })));

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

  // ── Student portal (token-based, no Supabase Auth required) ──────────────
  {
    path: '/portal',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <StudentPortalLayout />
      </Suspense>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalDashboard />
          </Suspense>
        ),
      },
      {
        path: 'boka',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalBokaPage />
          </Suspense>
        ),
      },
      {
        path: 'bokningar',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalBokningarPage />
          </Suspense>
        ),
      },
      {
        path: 'framsteg',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalFramstegPage />
          </Suspense>
        ),
      },
      {
        path: 'konto',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalKontoPage />
          </Suspense>
        ),
      },
      {
        path: 'material',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalMaterialPage />
          </Suspense>
        ),
      },
      {
        path: 'teori',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalTeoriPage />
          </Suspense>
        ),
      },
      {
        path: 'installningar',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalSettingsPage />
          </Suspense>
        ),
      },
      {
        path: 'ovningskörning',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalOvningkorningPage />
          </Suspense>
        ),
      },
      {
        path: 'min-larare',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalMinLararePage />
          </Suspense>
        ),
      },
      {
        path: 'dokument',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalDokumentPage />
          </Suspense>
        ),
      },
      {
        path: 'korkortsresa',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalKorkortsresaPage />
          </Suspense>
        ),
      },
      {
        path: 'utbildningskort',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalUtbildningskortPage />
          </Suspense>
        ),
      },
      {
        path: 'meddelanden',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalMeddelandenPage />
          </Suspense>
        ),
      },
    ],
  },

  // ── Instructor portal (token-based, no Supabase Auth required) ──────────────
  {
    path: '/instructor-portal',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <InstructorPortalLayout />
      </Suspense>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorPortalDashboard />
          </Suspense>
        ),
      },
      {
        path: 'schema',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorPortalSchemaPage />
          </Suspense>
        ),
      },
      {
        path: 'bokningar',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorPortalBokningarPage />
          </Suspense>
        ),
      },
      {
        path: 'elever',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorPortalElevPage />
          </Suspense>
        ),
      },
      {
        path: 'statistik',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorPortalStatistikPage />
          </Suspense>
        ),
      },
      {
        path: 'installningar',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorPortalInstallningarPage />
          </Suspense>
        ),
      },
      {
        path: 'utbildningskort',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorPortalUtbildningskortPage />
          </Suspense>
        ),
      },
    ],
  },

  // ── Guardian portal (token-based, no Supabase Auth required) ────────────────
  {
    path: '/guardian',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <GuardianPortalLayout />
      </Suspense>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalDashboard />
          </Suspense>
        ),
      },
      {
        path: 'schema',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalSchemaPage />
          </Suspense>
        ),
      },
      {
        path: 'framsteg',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalFramstegPage />
          </Suspense>
        ),
      },
      {
        path: 'ekonomi',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalEkonomiPage />
          </Suspense>
        ),
      },
      {
        path: 'korkortsresa',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalKorkortsresaPage />
          </Suspense>
        ),
      },
      {
        path: 'riskutbildning',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalRiskutbildningPage />
          </Suspense>
        ),
      },
      {
        path: 'meddelanden',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalMeddelandenPage />
          </Suspense>
        ),
      },
      {
        path: 'dokument',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalDokumentPage />
          </Suspense>
        ),
      },
      {
        path: 'konto',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalKontoPage />
          </Suspense>
        ),
      },
      {
        path: 'bokningar',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardianPortalBokningarPage />
          </Suspense>
        ),
      },
    ],
  },

  // ── Instructor app (protected, own mobile layout) ─────────────────────────
  {
    path: '/instructor-app',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingScreen />}>
          <InstructorAppLayout />
        </Suspense>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorAppIdagPage />
          </Suspense>
        ),
      },
      {
        path: 'schema',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorAppSchemaPage />
          </Suspense>
        ),
      },
      {
        path: 'elever',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorAppElevPage />
          </Suspense>
        ),
      },
      {
        path: 'elever/:studentId',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorAppElevDetailPage />
          </Suspense>
        ),
      },
      {
        path: 'statistik',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorAppStatistikPage />
          </Suspense>
        ),
      },
      {
        path: 'profil',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InstructorAppProfilPage />
          </Suspense>
        ),
      },
    ],
  },

  // ── Platform Admin workspace (requires is_platform_admin = true) ─────────
  {
    path: '/platform',
    element: (
      <PlatformAdminRoute>
        <Suspense fallback={<LoadingScreen />}>
          <PlatformShell />
        </Suspense>
      </PlatformAdminRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/platform/dashboard" replace /> },
      {
        path: 'dashboard',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformDashboardPage />
          </Suspense>
        ),
      },
      {
        path: 'organizations',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformOrganizationsPage />
          </Suspense>
        ),
      },
      {
        path: 'organizations/:id',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformOrganizationDetailPage />
          </Suspense>
        ),
      },
      {
        path: 'subscriptions',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformSubscriptionsPage />
          </Suspense>
        ),
      },
      {
        path: 'subscriptions/:id',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformSubscriptionDetailPage />
          </Suspense>
        ),
      },
      {
        path: 'audit',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformAuditPage />
          </Suspense>
        ),
      },
      {
        path: 'admins',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformAdminsPage />
          </Suspense>
        ),
      },
      {
        path: 'roles',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformRolesPage />
          </Suspense>
        ),
      },
      {
        path: 'support',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformSupportPage />
          </Suspense>
        ),
      },
      {
        path: 'security',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformSecurityPage />
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
      { index: true, element: <SmartRedirect /> },
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
        path: 'profile',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <ProfilePage />
          </Suspense>
        ),
      },
      {
        path: 'students/inactive',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <InaktivaElevPage />
          </Suspense>
        ),
      },
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
        path: 'packages/*',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PackagePage />
          </Suspense>
        ),
      },
      {
        path: 'campaigns/*',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <CampaignPage />
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
        path: 'leads',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <LeadsPage />
          </Suspense>
        ),
      },
      {
        path: 'curriculum',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <CurriculumPage />
          </Suspense>
        ),
      },
      {
        path: 'curriculum/:templateId',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <CurriculumTemplatePage />
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
        path: 'resources',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <ResourcesPage />
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
        element: <Navigate to="/communication" replace />,
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
        path: 'communication/analytics',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <CommAnalyticsPage />
          </Suspense>
        ),
      },
      {
        path: 'communication/notification-log',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <NotificationLogPage />
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

      // ── Order management workspace ───────────────────────────────────────
      {
        path: 'orders',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <OrderListPage />
          </Suspense>
        ),
      },
      {
        path: 'orders/:id',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <OrderDetailPage />
          </Suspense>
        ),
      },

      // ── Enrollment requests (operator workspace) ──────────────────────────
      {
        path: 'enrollments',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <EnrollmentListPage />
          </Suspense>
        ),
      },
      {
        path: 'enrollments/:id',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <EnrollmentDetailPage />
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

  // ── Public booking / lead capture page (no auth required) ───────────────
  {
    path: '/book',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <PublicBookingPage />
      </Suspense>
    ),
  },

  // ── Public package & campaign catalog (no auth required) ─────────────────
  {
    path: '/catalog/:orgId',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <PublicCatalogPage />
      </Suspense>
    ),
  },
  {
    path: '/catalog/:orgId/:packageId',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <PublicPackageDetailPage />
      </Suspense>
    ),
  },
  {
    path: '/catalog/:orgId/:packageId/checkout',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <CheckoutPage />
      </Suspense>
    ),
  },
  {
    path: '/catalog/:orgId/:packageId/confirmation',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <ConfirmationPage />
      </Suspense>
    ),
  },

  // ── Catch-all: redirect to login so ProtectedRoute can handle auth + ──────
  // ── preserve state.from on the subsequent redirect to a known page ─────────
  {
    path: '*',
    element: <Navigate to="/auth/login" replace />,
  },
];
