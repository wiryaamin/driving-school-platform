import { Link } from 'react-router-dom';
import { Section, PageHeading, CTAButton, usePageMeta } from '@modules/public-site/index.js';

/**
 * Onboarding page ("Onboarding") — Epic 5.
 *
 * Per the approved Website Information Architecture, this page's job is to
 * remove uncertainty and build confidence in the switching process — not to
 * sell, not to list features, not to document technical implementation. It
 * is written for a visitor who has already decided Trafikcloud may be
 * right for them and now wants to understand how the transition actually
 * works, in calm, reassuring, business-level language.
 *
 * Seven stages, matching the epic brief exactly (Book a Personal Demo →
 * Planning the Transition → Data Migration → Platform Configuration →
 * Training → Go Live → Continuous Success). Each stage covers three things
 * in three short paragraphs: what happens, why it matters, and the expected
 * outcome — the outcome sentence carries emphasis, matching the pattern
 * already established by the Business Challenges page.
 *
 * Deliberately non-duplicative:
 *   - Home's own Onboarding Journey scene (SecurityArchitecture's sibling,
 *     landing/components/OnboardingJourney.tsx) is a compact 10-node funnel
 *     diagram plus a 5-row shared-responsibility table, restrained by
 *     design to "one calm scene." This page covers the same real process at
 *     the depth Home deliberately doesn't — new prose throughout, no reused
 *     sentences, no reused funnel/table visualization.
 *   - Business Challenges' situational pain points (spreadsheets, multiple
 *     locations, etc.) are not restated here — this page assumes the
 *     decision is already made and focuses purely on the mechanics of
 *     getting there.
 *   - Resources' reference facts (compliance specifics, architecture depth)
 *     are not repeated — data migration is described at business level only
 *     ("your students, instructors, vehicles, and courses move with you"),
 *     never as a technical import/schema process.
 *
 * No specific durations are promised anywhere on this page (no "two weeks,"
 * no "within a month") — per the epic's explicit instruction not to promise
 * unrealistic timelines, pacing is described qualitatively only ("planeras
 * utifrån er verksamhets faktiska förutsättningar").
 *
 * Structured Data Type: HowTo, not the generic WebPage fallback — per
 * docs/PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md's recommended-type
 * table ("Onboarding | WebPage, optionally HowTo if the published content
 * ends up being a literal numbered sequence"). It does: seven ordered
 * stages, so HowTo's `step` array is the more precise, honest choice.
 */
type Stage = {
  id: string;
  title: string;
  intro: string;
  what: string;
  why: string;
  outcome: string;
};

const STAGES: Stage[] = [
  {
    id: 'demo',
    title: 'Boka en personlig visning.',
    intro: 'Allt börjar med ett samtal om hur er skola faktiskt drivs idag — inte en generisk produktdemo.',
    what:
      'Vi går igenom hur ni arbetar idag — schemaläggning, elevhantering, ekonomi och de system ni redan använder. Utifrån det visar vi plattformen utifrån er verksamhet, med utrymme för frågor genom hela samtalet.',
    why:
      'Ni ska kunna bedöma om Trafikcloud faktiskt passar er verksamhet, inte bara se en generell presentation av funktioner ni kanske aldrig använder.',
    outcome: 'En tydlig bild av om Trafikcloud passar er verksamhet — utan några förpliktelser.',
  },
  {
    id: 'planering',
    title: 'Planera övergången.',
    intro: 'Nästa steg är att lägga en plan tillsammans, utifrån er verksamhets faktiska förutsättningar.',
    what:
      'Vi går igenom era nuvarande system tillsammans, planerar vad som behöver flyttas och i vilken ordning, och sätter upp en tidsplan som utgår från hur er verksamhet faktiskt ser ut — inte en standardmall.',
    why:
      'En genomtänkt plan, där det är tydligt vem som ansvarar för vad, är det som gör att övergången känns hanterbar istället för stressig.',
    outcome: 'En konkret plan för övergången, med tydligt ansvar på båda sidor, innan något faktiskt flyttas.',
  },
  {
    id: 'datamigrering',
    title: 'Datamigrering.',
    intro: 'Det ni redan byggt upp följer med in i Trafikcloud.',
    what:
      'Era befintliga elever, instruktörer, fordon, kurser och historisk verksamhetsinformation förs över till Trafikcloud. Ni tillhandahåller underlaget; vi ansvarar för att det hamnar rätt.',
    why:
      'Ingen börjar om från noll. Elevhistorik, pågående utbildningar och fordonsuppgifter finns redan på plats när ni börjar använda systemet.',
    outcome: 'Er verksamhets historik och pågående arbete finns i Trafikcloud innan ni börjar använda det dagligen.',
  },
  {
    id: 'konfiguration',
    title: 'Konfiguration av plattformen.',
    intro: 'Plattformen sätts upp utifrån hur just er verksamhet är organiserad.',
    what:
      'Er organisation sätts upp i Trafikcloud — inklusive eventuella flera orter, användare och roller, och den grundläggande konfiguration er verksamhet behöver för att fungera från dag ett.',
    why:
      'Rätt struktur från början gör att varje person i verksamheten möter ett system som redan är anpassat efter hur just er skola är organiserad.',
    outcome: 'En plattform konfigurerad utifrån er faktiska organisation, redo att användas.',
  },
  {
    id: 'utbildning',
    title: 'Utbildning.',
    intro: 'Personalen introduceras till det de faktiskt kommer använda i sitt dagliga arbete.',
    what:
      'Administratörer utbildas i grunden, och övrig personal introduceras till de delar av systemet de faktiskt kommer använda i sitt dagliga arbete.',
    why:
      'Ett nytt system är bara till nytta om personalen känner sig trygg i det. Utbildningen anpassas efter vad varje roll faktiskt behöver kunna, inte en genomgång av allt.',
    outcome: 'Personalen känner sig bekväm med det dagliga arbetet i Trafikcloud innan systemet tas i skarp drift.',
  },
  {
    id: 'golive',
    title: 'Go Live.',
    intro: 'Verksamheten börjar drivas i Trafikcloud på riktigt.',
    what:
      'Verksamheten börjar drivas i Trafikcloud på riktigt. Vi finns med under övergångsperioden för att svara på frågor och lösa det som dyker upp i det dagliga arbetet.',
    why:
      'De första dagarna i ett nytt system väcker ofta frågor som inte kom upp under utbildningen. Stöd under just den perioden är det som gör övergången trygg.',
    outcome: 'Verksamheten drivs i Trafikcloud, med stöd nära till hands under de första skarpa dagarna.',
  },
  {
    id: 'fortsatt-framgang',
    title: 'Fortsatt framgång.',
    intro: 'Lanseringen är en början, inte ett avslut.',
    what:
      'Efter lanseringen fortsätter Trafikcloud att stödja er verksamhet — med löpande support, vidareutveckling av plattformen, och utrymme att växa i samma system.',
    why:
      'En övergång är inte ett engångsprojekt som avslutas vid lanseringen. Er verksamhet fortsätter att utvecklas, och plattformen ska följa med, inte bli något ni växer ur.',
    outcome: 'Ett system som fortsätter att fungera för er, oavsett hur er verksamhet förändras framöver.',
  },
];

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'Så blir ni kund hos Trafikcloud',
  description:
    'Den strukturerade, guidade processen från personlig visning till en verksamhet som drivs i Trafikcloud.',
  step: STAGES.map((s) => ({
    '@type': 'HowToStep',
    name: s.title.replace(/\.$/, ''),
    text: s.what,
  })),
};

export function OnboardingPage() {
  usePageMeta({
    title: 'Onboarding — Trafikcloud',
    description:
      'Så går bytet till Trafikcloud till — en strukturerad, guidad process från personlig visning till daglig drift, steg för steg.',
    path: '/onboarding',
    structuredData: STRUCTURED_DATA,
  });

  return (
    <>
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          title="En strukturerad process, inte ett hopp i det okända."
          description="Att byta system är ett beslut som ska kännas tryggt. Här är hur övergången till Trafikcloud faktiskt går till, steg för steg."
        />
      </Section>

      {STAGES.map((stage) => (
        <Section key={stage.id} id={stage.id} className="py-10 md:py-12 lg:py-14 xl:py-16">
          <PageHeading as="h2" title={stage.title} description={stage.intro} />
          <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-4 text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
            <p>{stage.what}</p>
            <p>{stage.why}</p>
            <p className="text-foreground">{stage.outcome}</p>
          </div>
        </Section>
      ))}

      {/* Secondary CTA (Contact Us) + Primary CTA (Book a Personal Demo) */}
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <p className="mx-auto max-w-xl text-pretty text-center text-base text-muted-foreground">
          Har ni frågor som inte besvarades här?{' '}
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
