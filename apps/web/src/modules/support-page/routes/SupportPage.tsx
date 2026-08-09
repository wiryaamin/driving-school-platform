import { Link } from 'react-router-dom';
import { Section, PageHeading, CTAButton, usePageMeta } from '@modules/public-site/index.js';

/**
 * Support page ("Support") — Epic 8.
 *
 * For existing customers only — not sales, not general Contact, not
 * documentation itself. Not to be confused with `PlatformSupportPage`
 * (`/platform/support`), the internal Platform Admin support console — this
 * module is deliberately named `support-page`, following the established
 * `product-page`/`resources-page` naming convention, to avoid exactly the
 * kind of naming collision this project has hit before.
 *
 * No real support channel exists yet (no email, phone, ticket system, or
 * portal) — same honest constraint already applied to Contact (Epic 7): "do
 * not invent" applies here too. Section 3 states the channel isn't
 * finalized, without a link of its own; the one real, working fallback
 * (linking to the already-built Contact page) lives only in the closing
 * section, so there's exactly one clickable "how do I reach you today"
 * path on this page, not a redundant second copy.
 *
 * Primary CTA is "Gå till Resurser," not the demo booking used by every
 * other public page — deliberate, since this page's whole audience is
 * existing customers, for whom booking a sales demo is the wrong action.
 *
 * Sections 2, 4, and 6 all point to Resources without restating its
 * content (no domain list, no compliance facts, no architecture depth
 * repeated here) — satisfying "do not duplicate Resources" by linking, not
 * summarizing. Section 5 (Training) references onboarding-era training only
 * at the concept level, in fresh wording, without repeating Onboarding's
 * own "Utbildning" stage copy (Epic 5, read before writing this section).
 *
 * Structured Data Type: WebPage — deliberately not FAQPage, per
 * docs/PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md's recommended-type
 * table ("Support's Help Center content and Resources' FAQ content are
 * different things and should not both claim the same schema type").
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Support — Trafikcloud',
  description: 'Support för befintliga kunder som redan använder Trafikcloud.',
};

export function SupportPage() {
  usePageMeta({
    title: 'Support — Trafikcloud',
    description: 'Support för er som redan är kund hos Trafikcloud och behöver hjälp i det dagliga arbetet.',
    path: '/support',
    structuredData: STRUCTURED_DATA,
  });

  return (
    <>
      {/* 1. Support Introduction */}
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          title="Support."
          description="Den här sidan är till för er som redan använder Trafikcloud och behöver hjälp i det dagliga arbetet."
        />
      </Section>

      {/* 2. Before Contacting Support */}
      <Section id="innan-support" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Innan ni kontaktar Support." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Många frågor går snabbare att lösa på egen hand än via en supportkontakt.
          Kom-igång-material, dokumentation och produktguider samlas på vår resurssida.{' '}
          <Link
            to="/guides"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Gå till Resurser
          </Link>
          .
        </p>
      </Section>

      {/* 3. Contact Support — honest, no invented channel */}
      <Section id="kontakta-support" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Kontakta Support." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Officiella supportkanaler publiceras inför kommersiell lansering.
        </p>
      </Section>

      {/* 4. Product Updates */}
      <Section id="produktuppdateringar" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Produktuppdateringar." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Versionsnyheter och produktuppdateringar publiceras på vår resurssida, i takt med att
          plattformen vidareutvecklas.
        </p>
      </Section>

      {/* 5. Training */}
      <Section id="utbildning" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Utbildning." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Utbildning är en del av att bli kund hos Trafikcloud, och finns tillgänglig för
          befintliga kunder även efter lanseringen — till exempel när en ny medarbetare börjar och
          behöver komma igång med systemet.
        </p>
      </Section>

      {/* 6. Troubleshooting */}
      <Section id="felsokning" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Felsökning." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Felsökningsguider för vanliga frågor publiceras på vår resurssida i takt med att de tas
          fram.
        </p>
      </Section>

      {/* 7. Service Commitment — no promised response times or service levels */}
      <Section id="vart-lofte" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Vårt löfte till er som kund." />
        <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-4 text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          <p>
            Vi ser varje kundrelation som långsiktig, inte som en enskild affär. Vi strävar efter att
            vara tillgängliga, professionella och tydliga i vår kommunikation, och vi utvecklar
            plattformen löpande utifrån hur den faktiskt används av er som redan är kunder.
          </p>
          <p className="text-foreground">
            Vi lovar inte specifika svarstider idag — men vi lovar att ta varje fråga på allvar.
          </p>
        </div>
      </Section>

      {/* Secondary CTA (Contact Support fallback, honestly framed) + Primary CTA (Go to Resources) */}
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <p className="mx-auto max-w-xl text-pretty text-center text-base text-muted-foreground">
          Behöver ni nå oss innan officiella supportkanaler är publicerade?{' '}
          <Link
            to="/contact"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Kontakta oss
          </Link>
          .
        </p>

        <PageHeading
          as="h2"
          title="Gå till Resurser."
          description="Kom-igång-material, dokumentation och produktguider som ofta besvarar frågan snabbare än en supportkontakt."
          className="mt-16"
        />
        <div className="mt-8 flex justify-center">
          <CTAButton asChild size="lg">
            <Link to="/guides">Gå till Resurser</Link>
          </CTAButton>
        </div>
      </Section>
    </>
  );
}
