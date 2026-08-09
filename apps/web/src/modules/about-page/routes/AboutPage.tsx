import { Link } from 'react-router-dom';
import { Section, PageHeading, CTAButton, usePageMeta } from '@modules/public-site/index.js';

/**
 * About Trafikcloud page ("Om Trafikcloud") — Epic 6.
 *
 * Per the approved Website Information Architecture, this is a credibility
 * page, not a product or sales page — it answers "who is behind
 * Trafikcloud," not "what does it do" (Home/Platform's job) or "how do we
 * get started" (Onboarding's job). Company facts are kept to what's actually
 * established elsewhere in this project (Sweden-first, multi-tenant SaaS,
 * continuous development) — no founding story, founder names, team size, or
 * funding details are invented, consistent with the Footer's own honest
 * placeholder brackets for organisationsnummer/adress (real registration
 * details are not yet finalized and must not be fabricated here either).
 *
 * Deliberately non-duplicative of Home, Business Challenges, Onboarding, and
 * Resources: this page never restates the product-capability claims those
 * pages make (system unification, compliance specifics, situational
 * problem/solution framing, the onboarding process) — "Why Trafikcloud
 * Exists" is framed as company purpose, not a product pitch, in new prose
 * distinct from Home's ProblemStatement ("en instruktörsdagbok med en
 * betalknapp") and QuietClose ("Byggt för svenska trafikskolor, först.")
 * scenes, both read before writing this section.
 *
 * Principles (Section 5) are written as plain, falsifiable statements about
 * what each principle means in practice — not slogans — per the epic's
 * explicit instruction. Careers and Press (Sections 6–7) are honest reserved
 * sections: no job openings or announcements are invented, matching the
 * `PagePlaceholder` pattern's honesty standard even though these are
 * sections within a real page, not a whole-page placeholder.
 *
 * Structured Data Type: AboutPage with an Organization `mainEntity`, per
 * docs/PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md's recommended-type
 * table. The Organization entity is kept to name + description only — no
 * address, founding date, or logo URL, since none of those are established,
 * verifiable facts yet.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  name: 'Om Trafikcloud',
  description:
    'Varför Trafikcloud finns, vårt uppdrag och vår vision, och principerna vi driver plattformen efter.',
  mainEntity: {
    '@type': 'Organization',
    name: 'Trafikcloud',
    description: 'Sverige-först, multi-tenant SaaS-plattform för svenska trafikskolor.',
  },
};

const OVERVIEW: { term: string; description: string }[] = [
  { term: 'Sverige-först', description: 'Byggt för svenska trafikskolor och svensk bokföring från grunden, inte anpassat i efterhand.' },
  { term: 'Multi-tenant SaaS', description: 'Varje trafikskola driver sin egen isolerade verksamhet i samma plattform.' },
  { term: 'Kontinuerlig utveckling', description: 'Plattformen vidareutvecklas löpande, inte som ett projekt med ett slutdatum.' },
  { term: 'Långsiktigt åtagande', description: 'Byggt för trafikskolor som ska driva sin verksamhet i flera år framöver, inte bara nästa kvartal.' },
  { term: 'Tillförlitlighet och regelefterlevnad', description: 'Grunden i hur plattformen är byggd, inte ett tillägg i efterhand.' },
];

const PRINCIPLES: { term: string; description: string }[] = [
  { term: 'Enkelhet', description: 'Vi lägger hellre till en funktion för lite än en för mycket. Komplexitet läggs bara till när verksamheten faktiskt behöver den.' },
  { term: 'Förtroende', description: 'Vi bygger ett system trafikskolor kan lita på med sina elevers uppgifter och sin bokföring, varje dag.' },
  { term: 'Transparens', description: 'Vi är tydliga om vad plattformen gör idag och vad som ännu inte är byggt, snarare än att överdriva.' },
  { term: 'Långsiktiga relationer', description: 'Vi mäter framgång i hur länge en trafikskola stannar och växer med oss, inte i enskilda affärer.' },
  { term: 'Kontinuerlig förbättring', description: 'Plattformen utvecklas löpande utifrån hur den faktiskt används, inte utifrån en färdig plan.' },
  { term: 'Kundframgång', description: 'Vår framgång är beroende av att våra kunders verksamheter faktiskt fungerar bättre — inte tvärtom.' },
];

export function AboutPage() {
  usePageMeta({
    title: 'Om Trafikcloud',
    description:
      'Varför Trafikcloud finns, vårt uppdrag och vår vision, och principerna vi driver plattformen efter.',
    path: '/about',
    structuredData: STRUCTURED_DATA,
  });

  return (
    <>
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          title="Vilka vi är, och varför Trafikcloud finns."
          description="Den här sidan handlar inte om vad plattformen gör — det finns på andra sidor. Den handlar om företaget bakom den."
        />
      </Section>

      {/* 1. Why Trafikcloud Exists */}
      <Section id="varfor" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Varför Trafikcloud finns." />
        <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-4 text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          <p>
            Trafikcloud skapades för att lösa ett verkligt problem: svenska trafikskolor drivs för
            ofta i en samling lösa, separata system som aldrig var byggda för att prata med varandra.
            Vi såg en verksamhet som förtjänade ett sammanhållet system, byggt för hur den faktiskt
            drivs — inte ett verktyg som löser en enskild uppgift och lämnar resten åt kalkylblad och
            minne.
          </p>
          <p>
            Det är fortfarande skälet till att plattformen existerar: att ge svenska trafikskolor ett
            system som växer med verksamheten, istället för att bli ännu ett verktyg att hålla
            synkroniserat med alla andra.
          </p>
        </div>
      </Section>

      {/* 2. Our Mission */}
      <Section id="uppdrag" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Vårt uppdrag." />
        <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-4 text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          <p>
            Vårt uppdrag är att hjälpa svenska trafikskolor driva sin verksamhet mer effektivt — genom
            att minska den administrativa bördan och ge ägare och personal ett system de kan lita på
            i det dagliga arbetet.
          </p>
          <p>
            Det handlar inte om att lägga till fler funktioner, utan om att ta bort det som gör
            driften onödigt tungrodd, så att verksamheten kan växa hållbart utan att administrationen
            växer snabbare än intäkterna.
          </p>
        </div>
      </Section>

      {/* 3. Our Vision */}
      <Section id="vision" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Vår vision." />
        <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-4 text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          <p>
            Vår långsiktiga ambition är att bli den operativa plattform svenska trafikskolor utgår
            från — oavsett storlek, antal orter eller hur verksamheten är organiserad.
          </p>
          <p>
            Det är en ambition vi bygger mot stegvis, en verksamhet i taget, snarare än ett löfte om
            var vi redan är idag.
          </p>
        </div>
      </Section>

      {/* 4. Company Overview */}
      <Section id="foretaget" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Om företaget." />
        <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2">
          {OVERVIEW.map((item) => (
            <div key={item.term}>
              <dt className="text-base font-medium text-foreground">{item.term}</dt>
              <dd className="mt-1 text-sm leading-[1.5] text-muted-foreground">{item.description}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* 5. Our Principles */}
      <Section id="principer" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Våra principer." />
        <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2">
          {PRINCIPLES.map((item) => (
            <div key={item.term}>
              <dt className="text-base font-medium text-foreground">{item.term}</dt>
              <dd className="mt-1 text-sm leading-[1.5] text-muted-foreground">{item.description}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* 6. Careers (Future) — honest reserved section, no invented openings */}
      <Section id="karriar" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Karriär." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Vi växer i takt med att plattformen och kundbasen växer. Lediga tjänster publiceras här när
          de finns — just nu finns inga öppna tjänster att visa.
        </p>
      </Section>

      {/* 7. Press (Future) — honest reserved section, no invented announcements */}
      <Section id="press" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Press." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Nyheter och pressmaterial om Trafikcloud publiceras här när det finns något att dela. Just
          nu finns inget publicerat.
        </p>
      </Section>

      {/* Secondary CTA (Contact Us) + Primary CTA (Book a Personal Demo) */}
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <p className="mx-auto max-w-xl text-pretty text-center text-base text-muted-foreground">
          Har ni frågor om företaget bakom Trafikcloud?{' '}
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
          title="Boka en personlig visning."
          description="Vi visar plattformen utifrån er verksamhet, inte en generisk demo."
          className="mt-16"
        />
        <div className="mt-8 flex justify-center">
          <CTAButton asChild size="lg">
            <Link to="/demo">Boka en personlig visning</Link>
          </CTAButton>
        </div>
      </Section>
    </>
  );
}
