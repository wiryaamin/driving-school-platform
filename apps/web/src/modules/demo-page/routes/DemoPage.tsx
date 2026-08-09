import { Section, PageHeading, usePageMeta } from '@modules/public-site/index.js';
import { DemoRequestForm } from '../components/DemoRequestForm.js';

/**
 * Book a Personal Demo page ("Boka en personlig visning") — reached at
 * /demo, linked from every honestly-labeled "Boka en personlig visning" CTA
 * across the public site (BusinessChallengesPage, ContactPage, AboutPage,
 * the marketing OnboardingPage). The form itself lives in
 * ../components/DemoRequestForm.tsx.
 *
 * 2026-08-08: this page's own copy previously claimed "Starta er
 * kostnadsfria provperiod redan idag" (start your free trial today) even
 * though submitting it only queues a manual admin review — it never starts
 * a trial by itself. The site's actual self-service trial-signup mechanism
 * is TrialSignupForm.js (apps/web/src/modules/trial-onboarding/), embedded
 * on the landing page and reachable at /start-trial — this page is now
 * honestly a "talk to a human first" contact-request form, a legitimately
 * different, still-valuable path that never bypasses anything since it
 * never creates an organization by itself (an admin still reviews and
 * decides how to proceed).
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Boka en personlig visning',
  description: 'Boka en personlig visning av Trafikcloud med vårt team.',
};

export function DemoPage() {
  usePageMeta({
    title: 'Boka en personlig visning',
    description: 'Boka en personlig visning av Trafikcloud med vårt team.',
    path: '/demo',
    structuredData: STRUCTURED_DATA,
  });

  return (
    <>
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          title="Boka en personlig visning"
          description="Vårt team kontaktar er och visar hur Trafikcloud fungerar för er skola."
        />
        <p className="mx-auto mt-6 max-w-xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Fyll i formuläret nedan så kontaktar vi er och hjälper er att komma igång med Trafikcloud.
        </p>
      </Section>

      <Section id="formular" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <DemoRequestForm />
      </Section>
    </>
  );
}
