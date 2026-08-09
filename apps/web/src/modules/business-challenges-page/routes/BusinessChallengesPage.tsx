import { Link } from 'react-router-dom';
import { Section, PageHeading, CTAButton, usePageMeta } from '@modules/public-site/index.js';

/**
 * Business Challenges page ("Er situation") — Epic 4.
 *
 * Per the approved Website Information Architecture, this page organizes
 * content strictly around the *business situation* a school owner
 * recognizes themselves in — never by internal role, software module, or
 * feature. It is a business conversation, not a product overview: no
 * feature lists, no pricing, no competitor comparison.
 *
 * Each situation covers all five required elements in three paragraphs,
 * matching this site's established "calm, specific" prose restraint
 * (Home's Business Transformation scene set the precedent):
 *   - PageHeading title + description  → the current situation
 *   - Paragraph 1                      → why it becomes a problem +
 *                                         its operational consequences
 *   - Paragraph 2                      → how Trafikcloud addresses it
 *   - Paragraph 3 (foreground, closing)→ the expected business outcome
 *
 * Content is deliberately non-duplicative of Home and Resources: it never
 * restates Home's narrative claims (system unification, Swedish compliance,
 * security) or Resources' reference facts (BAS/VAT/SIE4/AGI specifics,
 * multi-tenant architecture depth, domain descriptions, integrations) — it
 * only refers to the underlying real capabilities in situational,
 * consequence-oriented language specific to each business circumstance.
 *
 * Structured Data Type: WebPage, per
 * docs/PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md's recommended-type table
 * ("no specific commerce/product schema fits a situational-navigation page").
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Er situation — Trafikcloud',
  description:
    'Trafikcloud utgår från den situation din trafikskola faktiskt befinner sig i — inte en generisk funktionslista.',
};

type Situation = {
  id: string;
  title: string;
  situation: string;
  problem: string;
  approach: string;
  outcome: string;
};

const SITUATIONS: Situation[] = [
  {
    id: 'kalkylblad',
    title: 'Ni driver skolan i kalkylblad och lösa system.',
    situation:
      'Bokningar förs i ett schema, elevuppgifter i ett kalkylblad, sms skickas manuellt och bokföringen sammanställs i efterhand.',
    problem:
      'Ingenting av det pratar med varandra, så varje förändring — en ombokning, en ny elev, en betalning — måste föras in flera gånger, av en person som kommer ihåg att göra det. Resultatet blir dubbelbokningar när systemen inte stämmer överens, fakturor som skickas för sent och elever som tappas bort mellan kalkylblad och minne.',
    approach:
      'Trafikcloud samlar schema, elever och ekonomi i samma system. En bokning, en elev och en faktura är alltid samma post, oavsett var i systemet den visas — det finns inget separat kalkylblad att hålla synkroniserat.',
    outcome:
      'Administrationen slutar vara ett eget deltidsarbete. Det som tidigare krävde manuell avstämning sker automatiskt, i bakgrunden, varje dag.',
  },
  {
    id: 'administration',
    title: 'Administrationen tar mer tid än undervisningen förtjänar.',
    situation:
      'Mycket av arbetsdagen går åt till att föra in samma information flera gånger, leta efter uppgifter och stämma av att allt stämmer.',
    problem:
      'Manuellt administrativt arbete växer i takt med verksamheten — fler elever betyder fler timmar administration, inte bara fler intäkter. Det tar tid från undervisning och kunder, administrativa uppgifter skjuts upp, och risken för fel ökar när tiden är knapp.',
    approach:
      'Rutinuppgifter som bokningsbekräftelser, påminnelser och fakturering sker automatiskt i Trafikcloud, istället för manuellt för varje elev.',
    outcome:
      'Personalens tid går till undervisning och kunder — inte till att föra in samma uppgift på tre olika ställen.',
  },
  {
    id: 'instruktorer-fordon',
    title: 'Flera instruktörer och fordon blir svåra att hålla koll på.',
    situation:
      'Fler instruktörer och fordon gör det svårare att veta vem som är ledig, vilket fordon som är tillgängligt, och vilket som snart behöver besiktigas.',
    problem:
      'Utan ett gemensamt system hanteras schemaläggning och fordonsstatus separat — ofta i enskilda instruktörers huvuden snarare än i något alla kan se. Det leder till dubbelbokade instruktörer, fordon som körs förbi besiktningsdatum, och lektioner som ställs in för att rätt resurs inte fanns tillgänglig.',
    approach:
      'Instruktörer och fordon schemaläggs i samma system som bokningarna i Trafikcloud, och besiktning, försäkring och service för varje fordon följs automatiskt.',
    outcome:
      'Rätt instruktör och rätt fordon finns på rätt plats, utan att någon behöver hålla koll manuellt.',
  },
  {
    id: 'flera-orter',
    title: 'Ni växer från en ort till flera.',
    situation:
      'En andra eller tredje ort innebär fler scheman, fler instruktörer och fler fordon att hantera samtidigt, ofta med egna rutiner per ort.',
    problem:
      'Ett system som fungerade för en ort blir svårt att överblicka när det multipliceras — varje ort riskerar att bli sin egen lilla ö. Ägaren tvingas sätta ihop en helhetsbild manuellt, ort för ort, vilket gör det svårare att se om verksamheten som helhet går bra eller dåligt.',
    approach:
      'I Trafikcloud drivs alla orter i samma system, med samma regler och samma data — en flerortsverksamhet hanteras som en verksamhet, inte som flera separata.',
    outcome:
      'Ägaren ser hela verksamheten på ett ställe, oavsett hur många orter den drivs från.',
  },
  {
    id: 'foretagskunder',
    title: 'Ni hanterar företagskunder och B2B-utbildning.',
    situation:
      'Företag som köper utbildning åt sin personal behöver hanteras annorlunda än enskilda elever — gemensam fakturering, uppföljning per anställd.',
    problem:
      'Utan stöd för det hanteras varje företagskund som en samling separata privatelever, vilket gör uppföljning och fakturering tyngre än det behöver vara — manuell sammanställning av vilka anställda som är klara, fakturor som skapas för hand per avtal, otydlighet om vad som ingår.',
    approach:
      'Trafikcloud stödjer företagskunder som en egen kundtyp — utbildning kan säljas och faktureras samlat, samtidigt som varje anställds framsteg följs individuellt.',
    outcome:
      'Företagsavtal blir lika enkla att hantera operativt som resten av verksamheten, istället för ett återkommande specialprojekt.',
  },
  {
    id: 'overblick',
    title: 'Ni saknar överblick och kontroll över verksamheten.',
    situation:
      'Information om beläggning, ekonomi och elevernas framsteg finns — men sprids över flera system eller personer, utan en samlad bild av hur verksamheten faktiskt mår.',
    problem:
      'Beslut fattas på magkänsla eller föråldrad information, eftersom det tar för lång tid att sätta ihop en aktuell bild. Ekonomiska problem upptäcks sent, beläggningen optimeras inte, och det är svårt att veta om verksamheten faktiskt växer eller bara känns upptagen.',
    approach:
      'I Trafikcloud visas beläggning, ekonomi och elevstatus samlat och uppdateras löpande — inte som en rapport som sammanställs i efterhand.',
    outcome:
      'Beslut kan fattas utifrån hur verksamheten faktiskt ser ut just nu, inte en gissning.',
  },
  {
    id: 'framtida-tillvaxt',
    title: 'Ni vill förbereda verksamheten för framtida tillväxt.',
    situation:
      'Verksamheten fungerar idag, men dagens rutiner och system är byggda för dagens storlek — inte för fler elever, fler orter eller fler anställda.',
    problem:
      'System och rutiner som inte är byggda för att växa måste ofta bytas ut helt när verksamheten väl växer, vilket är dyrare och mer riskfyllt än att växa inom ett system som redan klarar det. Tillväxt riskerar då att tvinga fram ett systembyte mitt i en redan pressad period.',
    approach:
      'Trafikcloud är byggt för att hantera fler elever, fler orter och fler anställda utan att verksamheten behöver byta system när den väl växer.',
    outcome:
      'Tillväxt kräver att ni fortsätter använda det system ni redan har — inte att ni börjar om.',
  },
];

export function BusinessChallengesPage() {
  usePageMeta({
    title: 'Er situation — Trafikcloud',
    description:
      'Trafikcloud utgår från den situation din trafikskola faktiskt befinner sig i — kalkylblad, administration, flera orter, tillväxt eller företagskunder.',
    path: '/business-challenges',
    structuredData: STRUCTURED_DATA,
  });

  return (
    <>
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          title="Vi utgår från er situation, inte en generisk funktionslista."
          description="Varje trafikskola har sin egen verklighet. Här är de situationer vi oftast möter — och hur Trafikcloud faktiskt hjälper i var och en av dem."
        />
      </Section>

      {SITUATIONS.map((s) => (
        <Section key={s.id} id={s.id} className="py-10 md:py-12 lg:py-14 xl:py-16">
          <PageHeading as="h2" title={s.title} description={s.situation} />
          <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-4 text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
            <p>{s.problem}</p>
            <p>{s.approach}</p>
            <p className="text-foreground">{s.outcome}</p>
          </div>
        </Section>
      ))}

      {/* Secondary CTA (Continue to Onboarding) + Primary CTA (Book a Personal Demo) */}
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <p className="mx-auto max-w-xl text-pretty text-center text-base text-muted-foreground">
          Vill ni veta hur ett byte till Trafikcloud faktiskt går till?{' '}
          <Link
            to="/onboarding"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Fortsätt till onboarding-processen
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
