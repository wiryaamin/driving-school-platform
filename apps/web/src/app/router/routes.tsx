import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { AppShellLayout } from '@app/layouts/AppShell.js';
import { ElevWorkspaceLayout } from '@app/layouts/ElevWorkspaceLayout.js';
import { EkonomiWorkspaceLayout } from '@app/layouts/EkonomiWorkspaceLayout.js';
import { PersonalResurserWorkspaceLayout } from '@app/layouts/PersonalResurserWorkspaceLayout.js';
import { SystemWorkspaceLayout } from '@app/layouts/SystemWorkspaceLayout.js';
import { AuthLayout } from '@app/layouts/AuthLayout.js';
import { ProtectedRoute } from '@shared/components/guards/ProtectedRoute.js';
import { PlatformAdminRoute } from '@shared/components/guards/PlatformAdminRoute.js';
import { RootRoute } from './RootRoute.js';
import { LoadingScreen } from '@shared/components/layout/LoadingScreen/LoadingScreen.js';
import { ForbiddenPage } from '@modules/auth/routes/ForbiddenPage.js';
import { ComingSoonPage } from '@shared/components/placeholders/ComingSoonPage.js';
import { TrialExpiredPage } from '@shared/components/placeholders/TrialExpiredPage.js';
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
const PlatformDemoRequestsPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformDemoRequestsPage })));
const PlatformAnnouncementsPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformAnnouncementsPage })));
const PlatformSupportPage  = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformSupportPage })));
const PlatformSecurityPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformSecurityPage })));
const PlatformTenantOnboardingPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformTenantOnboardingPage })));
const PlatformOperationsPage     = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformOperationsPage })));
const PlatformCommunicationsPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformCommunicationsPage })));
const PlatformCompliancePage     = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformCompliancePage })));
const PlatformRecoveryPage       = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformRecoveryPage })));
const PlatformOnboardingJourneyPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.PlatformOnboardingJourneyPage })));
const OnboardingCommandCenterPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.OnboardingCommandCenterPage })));
const TrialRequestsPage = lazy(() => import('@modules/platform/index.js').then(m => ({ default: m.TrialRequestsPage })));

// ─── Tenant Onboarding module (lazy) ──────────────────────────────────────────
const TenantOnboardingPage = lazy(() => import('@modules/tenant-onboarding/index.js').then(m => ({ default: m.TenantOnboardingPage })));
const BusinessDiscoveryPage = lazy(() => import('@modules/tenant-onboarding/index.js').then(m => ({ default: m.BusinessDiscoveryPage })));

// ─── Public catalog (lazy) ────────────────────────────────────────────────────
const PublicCatalogPage       = lazy(() => import('@modules/public-catalog/index.js').then(m => ({ default: m.PublicCatalogPage })));
const PublicPackageDetailPage = lazy(() => import('@modules/public-catalog/index.js').then(m => ({ default: m.PublicPackageDetailPage })));
const CheckoutPage            = lazy(() => import('@modules/public-catalog/index.js').then(m => ({ default: m.CheckoutPage })));
const ConfirmationPage        = lazy(() => import('@modules/public-catalog/index.js').then(m => ({ default: m.ConfirmationPage })));

// ─── Enrollments operator module (lazy) ──────────────────────────────────────
const EnrollmentListPage   = lazy(() => import('@modules/enrollments/index.js').then(m => ({ default: m.EnrollmentListPage })));
const EnrollmentDetailPage = lazy(() => import('@modules/enrollments/index.js').then(m => ({ default: m.EnrollmentDetailPage })));

// ─── Public marketing website — shared shell + Home (lazy) ───────────────────
// Home's scene content (Hero/ProblemStatement/SystemReveal) is unchanged;
// PublicLayout is Epic 1's reusable shell primitive. PagePlaceholder (Epic 1's
// other primitive) has no remaining call sites as of the legal-pages fix
// (2026-08-07) — every public route now has real content.
const PublicLayout = lazy(() => import('@modules/public-site/index.js').then(m => ({ default: m.PublicLayout })));
// Platform page (/product) retired per the approved Information Architecture
// clarification — Home (/landing) is now the single authoritative public
// explanation of Trafikcloud. Its Category B (reference) content moved to
// Resources; see resources-page below and /product's redirect further down.
const PublicResourcesPage = lazy(() => import('@modules/resources-page/index.js').then(m => ({ default: m.ResourcesPage })));
// Epic 4 — Business Challenges page real content (module named
// business-challenges-page, matching the resources-page naming convention).
const BusinessChallengesPage = lazy(() =>
  import('@modules/business-challenges-page/index.js').then((m) => ({ default: m.BusinessChallengesPage })),
);
// Epic 5 — Onboarding page real content (module named onboarding-page,
// matching the business-challenges-page naming convention).
const OnboardingPage = lazy(() =>
  import('@modules/onboarding-page/index.js').then((m) => ({ default: m.OnboardingPage })),
);
// Epic 6 — About Trafikcloud page real content (module named about-page,
// matching the onboarding-page naming convention).
const AboutPage = lazy(() => import('@modules/about-page/index.js').then((m) => ({ default: m.AboutPage })));
// Epic 7 — Contact page real content (module named contact-page, matching
// the about-page naming convention).
const ContactPage = lazy(() => import('@modules/contact-page/index.js').then((m) => ({ default: m.ContactPage })));
// Epic 8 — Support page real content. Named PublicSupportPage, not
// "SupportPage", to avoid colliding with the existing PlatformSupportPage
// (/platform/support, the internal Platform Admin support console).
const PublicSupportPage = lazy(() => import('@modules/support-page/index.js').then((m) => ({ default: m.SupportPage })));
// Release 2.0, Epic 1 — Book a Personal Demo, the first operational
// (non-informational) public page.
const DemoPage = lazy(() => import('@modules/demo-page/index.js').then((m) => ({ default: m.DemoPage })));
// Execution Audit (2026-08-07) P1 — real privacy policy / terms of use,
// replacing the PagePlaceholder that previously lived at these routes.
const PrivacyPolicyPage = lazy(() => import('@modules/legal-pages/index.js').then((m) => ({ default: m.PrivacyPolicyPage })));
const TermsOfServicePage = lazy(() => import('@modules/legal-pages/index.js').then((m) => ({ default: m.TermsOfServicePage })));
// Self-service pre-account tenant trial signup (2026-08-07) — deliberately
// NOT nested under the PublicLayout marketing chrome below (this is a
// focused task flow, not a marketing page), same reasoning as
// PublicCatalogPage/CheckoutPage further down. Path /onboarding/:token is
// distinct from the existing static /onboarding marketing page (Epic 5,
// OnboardingPage) — React Router resolves the two as separate patterns; see
// docs/CUSTOMER_PROVISIONING_ONBOARDING_ARCHITECTURE.md §3 for why those two
// "onboarding" names must never be confused with each other.
const StartTrialPage = lazy(() => import('@modules/trial-onboarding/index.js').then((m) => ({ default: m.StartTrialPage })));
const TrialOnboardingWizardPage = lazy(() => import('@modules/trial-onboarding/index.js').then((m) => ({ default: m.TrialOnboardingWizardPage })));

// ─── Public leads / booking page (lazy) ──────────────────────────────────────
const PublicBookingPage = lazy(() => import('@modules/leads/index.js').then(m => ({ default: m.PublicBookingPage })));
const PortalLoginPage   = lazy(() => import('@modules/leads/index.js').then(m => ({ default: m.PortalLoginPage })));
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
const StudentPortalSupportPage       = lazy(() => import('@modules/student-portal/index.js').then(m => ({ default: m.StudentPortalSupportPage })));

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
const ForgotPasswordPage = lazy(() => import('@modules/auth/routes/ForgotPasswordPage.js').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@modules/auth/routes/ResetPasswordPage.js').then(m => ({ default: m.ResetPasswordPage })));
const AcceptInvitePage = lazy(() => import('@modules/auth/routes/AcceptInvitePage.js').then(m => ({ default: m.AcceptInvitePage })));
const DashboardPage = lazy(() => import('@modules/dashboard/routes/DashboardPage.js').then(m => ({ default: m.DashboardPage })));
const StudentsPage      = lazy(() => import('@modules/students/index.js').then(m => ({ default: m.StudentsPage })));
const InaktivaElevPage  = lazy(() => import('@modules/students/routes/InaktivaElevPage.js').then(m => ({ default: m.InaktivaElevPage })));
const SchedulingPage = lazy(() => import('@modules/scheduling/index.js').then(m => ({ default: m.SchedulingPage })));
const InstructorsPage = lazy(() => import('@modules/instructors/index.js').then(m => ({ default: m.InstructorsPage })));
const FinancePage = lazy(() => import('@modules/finance/index.js').then(m => ({ default: m.FinancePage })));
const CorporatePage = lazy(() => import('@modules/corporate/index.js').then(m => ({ default: m.CorporatePage })));
const LogsPage = lazy(() => import('@modules/logs/index.js').then(m => ({ default: m.LogsPage })));
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
const NotificationLogPage         = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.NotificationLogPage })));
const NotificationPreferencesPage = lazy(() => import('@modules/communication/index.js').then(m => ({ default: m.NotificationPreferencesPage })));
const ResourcesPage          = lazy(() => import('@modules/resources/index.js').then(m => ({ default: m.ResourcesPage })));
const RegulatoryPage         = lazy(() => import('@modules/regulatory/index.js').then(m => ({ default: m.RegulatoryPage })));
const DocumentsPage          = lazy(() => import('@modules/documents/index.js').then(m => ({ default: m.DocumentsPage })));
const NyheterPage            = lazy(() => import('@modules/settings/index.js').then(m => ({ default: m.NyheterPage })));
const TeorifragorPage        = lazy(() => import('@modules/settings/index.js').then(m => ({ default: m.TeorifragorPage })));
const StaffPage              = lazy(() => import('@modules/staff/index.js').then(m => ({ default: m.StaffPage })));
const GuardiansPage          = lazy(() => import('@modules/guardians/index.js').then(m => ({ default: m.GuardiansPage })));
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
      {
        path: 'forgot-password',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <ForgotPasswordPage />
          </Suspense>
        ),
      },
      {
        path: 'reset-password',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <ResetPasswordPage />
          </Suspense>
        ),
      },
      {
        path: 'accept-invite',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <AcceptInvitePage />
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
      {
        path: 'support',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <StudentPortalSupportPage />
          </Suspense>
        ),
      },

      // Catches any /portal/* sub-path with no matching child (e.g. a nav
      // link added before its route was wired up) — without this, an
      // unmatched path falls through to the ADMIN app's own catch-all,
      // rendering the admin shell/sidebar for a student.
      {
        path: '*',
        element: <ComingSoonPage homePath="/portal" />,
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

      // Catches any /instructor-portal/* sub-path with no matching child
      // (e.g. 'meddelanden'/'ekonomi' nav links whose routes were never
      // wired up) — without this, an unmatched path falls through to the
      // ADMIN app's own catch-all, rendering the full admin shell/sidebar
      // (Kunder, Ekonomi, Inställningar, etc.) for an instructor. Confirmed
      // live 2026-08-06.
      {
        path: '*',
        element: <ComingSoonPage homePath="/instructor-portal" />,
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

      // Catches any /guardian/* sub-path with no matching child — see the
      // identical /instructor-portal catch-all above for why this matters.
      {
        path: '*',
        element: <ComingSoonPage homePath="/guardian" />,
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

      // Catches any /instructor-app/* sub-path with no matching child — see
      // the identical /instructor-portal catch-all above for why this matters.
      {
        path: '*',
        element: <ComingSoonPage homePath="/instructor-app" />,
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
        path: 'onboarding',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <OnboardingCommandCenterPage />
          </Suspense>
        ),
      },
      {
        path: 'demo-requests',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformDemoRequestsPage />
          </Suspense>
        ),
      },
      {
        path: 'trial-requests',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <TrialRequestsPage />
          </Suspense>
        ),
      },
      {
        path: 'announcements',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformAnnouncementsPage />
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
      {
        path: 'operations',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformOperationsPage />
          </Suspense>
        ),
      },
      {
        path: 'communications',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformCommunicationsPage />
          </Suspense>
        ),
      },
      {
        path: 'compliance',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformCompliancePage />
          </Suspense>
        ),
      },
      {
        path: 'recovery',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformRecoveryPage />
          </Suspense>
        ),
      },
      {
        path: 'tenant-onboarding',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformTenantOnboardingPage />
          </Suspense>
        ),
      },
      {
        path: 'tenant-onboarding/:id',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PlatformOnboardingJourneyPage />
          </Suspense>
        ),
      },
    ],
  },

  // ── Trial-expired lock screen (authenticated, no AppShell chrome) ─────────
  {
    path: '/trial-expired',
    element: (
      <ProtectedRoute>
        <TrialExpiredPage />
      </ProtectedRoute>
    ),
  },

  // ── Root route ────────────────────────────────────────────────────────────
  // Signed-out visitors get the marketing landing page at '/' itself (not a
  // redirect to '/landing'); signed-in users go straight into the app via
  // SmartRedirect. Deliberately NOT nested under the PublicLayout children
  // below or the protected AppShellLayout route further down — both of those
  // keep their own path lists unchanged.
  {
    path: '/',
    element: <RootRoute />,
  },

  // ── Protected app routes ──────────────────────────────────────────────────
  {
    element: (
      <ProtectedRoute>
        <AppShellLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'setup',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <TenantOnboardingPage />
          </Suspense>
        ),
      },
      {
        path: 'setup/business-discovery',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <BusinessDiscoveryPage />
          </Suspense>
        ),
      },
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
      // ── Elever workspace ─────────────────────────────────────────────────
      // Elever/Företagselever/Kommunikation/Dokumentarkiv are four
      // pre-existing, independent top-level route trees (no shared URL
      // prefix) — grouped here under one pathless layout route purely for
      // the shared tab bar. No path changed, so every existing deep link
      // keeps working exactly as before.
      {
        element: <ElevWorkspaceLayout />,
        children: [
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
            path: 'corporate/*',
            element: (
              <Suspense fallback={<LoadingScreen />}>
                <CorporatePage />
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
            path: 'communication/preferences',
            element: (
              <Suspense fallback={<LoadingScreen />}>
                <NotificationPreferencesPage />
              </Suspense>
            ),
          },
          {
            path: 'documents',
            element: (
              <Suspense fallback={<LoadingScreen />}>
                <DocumentsPage />
              </Suspense>
            ),
          },
        ],
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
      // ── Ekonomi / Bokföring workspace ────────────────────────────────────
      {
        element: <EkonomiWorkspaceLayout />,
        children: [
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
        ],
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

      // ── System workspace ─────────────────────────────────────────────────
      {
        element: <SystemWorkspaceLayout />,
        children: [
          {
            path: 'nyheter',
            element: (
              <Suspense fallback={<LoadingScreen />}>
                <NyheterPage />
              </Suspense>
            ),
          },
          {
            path: 'teorifragor',
            element: (
              <Suspense fallback={<LoadingScreen />}>
                <TeorifragorPage />
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
        ],
      },

      // ── Personal & Resurser workspace ────────────────────────────────────
      {
        element: <PersonalResurserWorkspaceLayout />,
        children: [
          {
            path: 'staff',
            element: (
              <Suspense fallback={<LoadingScreen />}>
                <StaffPage />
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
            path: 'regulatory',
            element: (
              <Suspense fallback={<LoadingScreen />}>
                <RegulatoryPage />
              </Suspense>
            ),
          },
        ],
      },

      // ── Guardians list ─────────────────────────────────────────────────────
      {
        path: 'guardians',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <GuardiansPage />
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

  // ── Unified portal login landing (disambiguates Student/Guardian/Instructor) ──
  {
    path: '/logga-in',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <PortalLoginPage />
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

  // ── Self-service tenant trial signup (no auth, no marketing chrome) ──────
  {
    path: '/start-trial',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <StartTrialPage />
      </Suspense>
    ),
  },
  {
    path: '/onboarding/:token',
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <TrialOnboardingWizardPage />
      </Suspense>
    ),
  },

  // ── Public marketing website — Epic 1: shared shell (Header/Footer/nav) ────
  // ── plus routes for every approved public page. A pathless layout route: ───
  // ── PublicLayout consumes no URL segment itself, so children resolve as ────
  // ── top-level paths (/landing, /guides, ...) rather than being prefixed. ───
  // ── Mounted separately from '/', which remains the protected app shell — ───
  // ── moving the marketing site onto '/' is a future decision, not part of ───
  // ── this scope. Home (/landing) and Resources (/guides) have real content. ─
  // ── /product (the former standalone Platform page) redirects to /landing — ─
  // ── retired per the approved Information Architecture clarification: Home ──
  // ── is now the single authoritative public explanation of Trafikcloud. ───
  // ── Every remaining page is an honest PagePlaceholder ("do not implement ───
  // ── landing page content yet" — Business Challenges, Onboarding, Support, ──
  // ── About, Contact, Demo, and legal pages are all future epics).
  {
    element: (
      <Suspense fallback={<LoadingScreen />}>
        <PublicLayout />
      </Suspense>
    ),
    children: [
      {
        // The landing page itself now lives only at "/" (see RootRoute.tsx,
        // which renders LandingPage directly for unauthenticated visitors).
        // "/landing" is kept only as a permanent redirect for existing
        // bookmarks/inbound links — client-side SPA redirect only; the
        // hosting layer's own redirect is out of this router's scope.
        path: 'landing',
        element: <Navigate to="/" replace />,
      },
      {
        // Retired per the approved Information Architecture clarification —
        // Home is now the single authoritative public explanation of
        // Trafikcloud; a second "explain the platform" page is redundant
        // by definition. Redirects rather than 404s/falls-through to login,
        // in case of an existing bookmark or inbound link. This is a
        // client-side SPA redirect only — a production launch would want a
        // real HTTP 301 at the hosting/CDN layer for SEO link-equity
        // preservation, which is outside this router's scope.
        path: 'product',
        element: <Navigate to="/" replace />,
      },
      {
        // Epic 4: real content (business-challenges-page module), no longer a PagePlaceholder.
        path: 'business-challenges',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <BusinessChallengesPage />
          </Suspense>
        ),
      },
      {
        // Epic 5: real content (onboarding-page module), no longer a PagePlaceholder.
        path: 'onboarding',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <OnboardingPage />
          </Suspense>
        ),
      },
      {
        // NOT "resources" — that path already belongs to the real, existing
        // Vehicles/Resources module (line ~751, `ResourcesPage`). Real
        // content as of the Platform page retirement migration — carries the
        // Category B (reference) content moved from the former /product page.
        path: 'guides',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PublicResourcesPage />
          </Suspense>
        ),
      },
      {
        // Epic 8: real content (support-page module), no longer a PagePlaceholder.
        // NOT PlatformSupportPage — that's the internal Platform Admin
        // support console at /platform/support (line ~622).
        path: 'support',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PublicSupportPage />
          </Suspense>
        ),
      },
      {
        // Epic 6: real content (about-page module), no longer a PagePlaceholder.
        path: 'about',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <AboutPage />
          </Suspense>
        ),
      },
      {
        // Epic 7: real content (contact-page module), no longer a PagePlaceholder.
        path: 'contact',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <ContactPage />
          </Suspense>
        ),
      },
      {
        // Release 2.0, Epic 1: real content (demo-page module), no longer a PagePlaceholder.
        path: 'demo',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <DemoPage />
          </Suspense>
        ),
      },
      {
        path: 'legal/privacy',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <PrivacyPolicyPage />
          </Suspense>
        ),
      },
      {
        path: 'legal/terms',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <TermsOfServicePage />
          </Suspense>
        ),
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
