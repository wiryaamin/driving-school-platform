import { Link } from 'react-router-dom';
import { Section, PageHeading, CTAButton, usePageMeta } from '@modules/public-site/index.js';

/**
 * Contact page ("Kontakt") — Epic 7.
 *
 * A communication page, not Support (product help for existing customers)
 * and not a sales landing page. Per the epic brief: "Do not invent contact
 * information."
 *
 * No real contact form, email address, or phone number exists yet — the
 * Footer already carries honest placeholder brackets for
 * organisationsnummer/adress/kontakt-e-post (Public Website Foundation,
 * Epic 1), and this is a frontend-only marketing project with no backend to
 * submit a form to. Building a form UI that looks functional but silently
 * goes nowhere would be the exact "looks live but doesn't work" anti-pattern
 * this project has avoided throughout (PagePlaceholder's whole reason for
 * existing). So Contact Options (Section 2) and Office Information
 * (Section 6) state plainly that these will be published before launch,
 * rather than presenting fake inputs or fabricated details. The one real,
 * working path this page offers today is the site-wide "Boka en personlig
 * visning" CTA, already wired to /demo.
 *
 * Two of this page's own numbered sections already are its two CTAs —
 * Section 3 is titled "Boka en personlig visning" and carries the Primary
 * CTA inline; Section 4 ("Redan kund?") carries the Secondary CTA ("Gå till
 * Support") inline. Unlike every prior public page, no separate closing
 * dual-CTA block is added after Office Information — it would duplicate
 * what Sections 3–4 already do, since this page's own brief (unlike prior
 * epics) explicitly dedicates numbered sections to each CTA rather than
 * only implying them.
 *
 * Structured Data Type: ContactPage, per
 * docs/PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md's recommended-type table.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: 'Kontakt — Trafikcloud',
  description: 'Kontaktvägar för blivande kunder, befintliga kunder och samarbetspartners.',
};

export function ContactPage() {
  usePageMeta({
    title: 'Kontakt — Trafikcloud',
    description:
      'Kontakta Trafikcloud — för frågor från blivande kunder, befintliga kunder eller samarbetsförfrågningar.',
    path: '/contact',
    structuredData: STRUCTURED_DATA,
  });

  return (
    <>
      {/* 1. Contact Introduction */}
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          title="Kontakta oss."
          description="Vi svarar gärna på frågor — oavsett om ni redan är kund, funderar på att bli det, eller har en annan anledning att höra av er. Vi strävar efter att svara så snabbt vi kan."
        />
      </Section>

      {/* 2. Contact Options — honest, no fabricated channels */}
      <Section id="kontaktvagar" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Kontaktvägar." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Kontaktformulär, e-postadress och telefonnummer publiceras här inför lanseringen. Tills
          dess är en personlig visning — nedan — det snabbaste sättet att komma i kontakt med oss.
        </p>
      </Section>

      {/* 3. Book a Personal Demo — Primary CTA */}
      <Section id="demo" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          as="h2"
          title="Boka en personlig visning."
          description="Vill ni se plattformen? Vi visar den utifrån er verksamhet, inte en generisk demo."
        />
        <div className="mt-8 flex justify-center">
          <CTAButton asChild size="lg">
            <Link to="/demo">Boka en personlig visning</Link>
          </CTAButton>
        </div>
      </Section>

      {/* 4. Existing Customers — Secondary CTA (Go to Support), no Support content duplicated */}
      <Section id="befintlig-kund" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Redan kund?" />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Om ni redan använder Trafikcloud och behöver hjälp med plattformen är Support rätt plats
          för det, inte den här sidan.{' '}
          <Link
            to="/support"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Gå till Support
          </Link>
          .
        </p>
      </Section>

      {/* 5. Business & Partnership Enquiries — no invented partner programmes */}
      <Section id="samarbete" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Affärs- och samarbetsförfrågningar." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Är ni ett företag eller en organisation intresserad av ett samarbete med Trafikcloud? Vi
          tar gärna emot den typen av förfrågningar via samma kontaktvägar som ovan, när de är
          publicerade.
        </p>
      </Section>

      {/* 6. Office Information — reserved, no fabricated address/registration details */}
      <Section id="kontorsinformation" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Kontorsinformation." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Officiell företagsinformation — organisationsnummer, adress och registreringsuppgifter —
          publiceras här inför kommersiell lansering.
        </p>
      </Section>
    </>
  );
}
