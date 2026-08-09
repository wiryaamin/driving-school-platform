import { usePageMeta } from '@modules/public-site/index.js';
import { Hero } from '../components/Hero.js';
import { ProblemStatement } from '../components/ProblemStatement.js';
import { SystemReveal } from '../components/SystemReveal.js';
import { ProofCompliance } from '../components/ProofCompliance.js';
import { BusinessTransformation } from '../components/BusinessTransformation.js';
import { HowItWorks } from '../components/HowItWorks.js';
import { OnboardingJourney } from '../components/OnboardingJourney.js';
import { SecurityArchitecture } from '../components/SecurityArchitecture.js';
import { ResourcesCta } from '../components/ResourcesCta.js';
import { QuietClose } from '../components/QuietClose.js';

// Static — module-level, not re-created per render, so usePageMeta's effect
// doesn't re-fire on every Home render (structuredData is an object, and a
// new literal on every render would otherwise be a new dependency each time).
const HOME_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Trafikcloud',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Schemaläggning, elever, ekonomi och kommunikation i en plattform byggd för svensk bokföring.',
};

/**
 * Home.
 *
 * Visual Redesign Pass: restructured to match an approved reference layout —
 * Hero, Problem (icon grid), Solution (feature grid), Proof, Business
 * Transformation, a short 5-step "how it works" flow, the deeper Onboarding
 * funnel, a Security/Trust band, and a Resources+CTA close. Component-level
 * comments on each scene describe what changed and why; this file only
 * controls ordering.
 *
 * SEO values below match the worked example in
 * docs/PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md §2.
 */
export function LandingPage() {
  usePageMeta({
    title: 'Trafikcloud — Allt din trafikskola behöver, i ett system',
    description:
      'Schemaläggning, elever, ekonomi och kommunikation i en plattform byggd för svensk bokföring.',
    path: '/',
    structuredData: HOME_STRUCTURED_DATA,
  });

  return (
    <>
      <Hero />
      <ProblemStatement />
      <SystemReveal />
      <ProofCompliance />
      <BusinessTransformation />
      <HowItWorks />
      <OnboardingJourney />
      <SecurityArchitecture />
      <ResourcesCta />
      <QuietClose />
    </>
  );
}
