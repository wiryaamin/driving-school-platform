import { useParams, Navigate } from 'react-router-dom';

/**
 * The Onboarding Command Center now lives as a tab inside Organization
 * Detail (the single Customer Lifecycle workspace) rather than a separate
 * page — see OnboardingJourneyPanel.tsx. This route is kept only so
 * existing links (Demo Request sheet, Tenant Onboarding list) and any
 * bookmarks keep working; it redirects straight to the real location
 * instead of maintaining a second, parallel implementation.
 */
export function PlatformOnboardingJourneyPage() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/platform/organizations/${id}?tab=onboarding`} replace />;
}
