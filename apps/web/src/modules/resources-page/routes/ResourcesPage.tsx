import { Section, PageHeading, usePageMeta } from '@modules/public-site/index.js';

/**
 * Resources page ("Resurser") — Platform Page retirement migration.
 *
 * Per the approved Information Architecture clarification: Home (`/landing`)
 * is now the single authoritative public explanation of Trafikcloud. The
 * former standalone Platform page (`/product`, Epic 3) has been retired —
 * see apps/web/src/app/router/routes.tsx, which now redirects `/product` to
 * `/landing`.
 *
 * This module carries forward the Platform page's Category B content — the
 * material that was genuine educational reference, not marketing messaging
 * duplicating Home's own scenes (System Reveal, Proof, Business
 * Transformation, Security & Architecture). Category A content (platform
 * introduction, "one platform not disconnected tools," Sweden-first
 * philosophy framing, security messaging) was removed outright, not moved
 * here — Home already states those claims narratively; repeating them in a
 * reference voice would still be duplication.
 *
 * Content is rewritten from marketing voice into reference voice — stating
 * facts plainly rather than persuading — consistent with this page's
 * approved purpose (Website IA v4 §11/§12: "a self-serve hub... Resources
 * educates, it does not convert").
 *
 * Placement follows the approved Resources Information Architecture
 * (v4 §12) category definitions precisely, not by convenience:
 *   - Säkerhet: "expanded technical depth behind the Security & Architecture
 *     scene's restrained on-page claims" — the multi-tenant data-isolation
 *     elaboration belongs here because it deepens Home's Security &
 *     Architecture scene's claim ("Varje trafikskolas data är helt
 *     separerad, på databasnivå"), not because it's unrelated to security.
 *   - Svensk regelefterlevnad: "expanded depth behind the Proof scene's
 *     compliance claims (BAS, VAT, SIE, AGI, personnummer)" — matches
 *     exactly, including personnummer/GDPR handling.
 *   - Dokumentation: "reference material for how the product actually
 *     works" — the domain list and integration list.
 *
 * Only these three categories carry real content in this pass. The
 * remaining approved Resources categories (Migreringsguide, FAQ,
 * Versionsnyheter, Kundframgång) are out of this migration's scope and are
 * deliberately not stubbed here — building them is a future epic's work,
 * not implied by retiring the Platform page.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Resurser — Trafikcloud',
  description:
    'Referensmaterial om Trafikcloud: arkitektur, kärnverksamhetsområden, integrationer och svensk regelefterlevnad.',
};

const DOMAINS: { term: string; description: string }[] = [
  { term: 'Schemaläggning', description: 'Instruktörsmedveten bokning, väntelistor och en kalender som alltid är aktuell.' },
  { term: 'Elever', description: 'Hela elevresan — från första lektion till körkort — på ett ställe.' },
  { term: 'Instruktörer', description: 'Scheman, behörigheter och fordonstilldelning samlat.' },
  { term: 'Fordon', description: 'Besiktning, försäkring och service följs automatiskt.' },
  { term: 'Ekonomi', description: 'Dubbel bokföring, fakturering och svensk momshantering, inbyggt.' },
  { term: 'Kommunikation', description: 'Ett meddelande når rätt person, oavsett kanal.' },
];

export function ResourcesPage() {
  usePageMeta({
    title: 'Resurser — Trafikcloud',
    description:
      'Referensmaterial om Trafikcloud: multi-tenant-arkitektur, kärnverksamhetsområden, integrationer och svensk regelefterlevnad.',
    path: '/guides',
    structuredData: STRUCTURED_DATA,
  });

  return (
    <>
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          title="Resurser."
          description="Referensmaterial för dig som vill undersöka Trafikcloud på egen hand, i detalj."
        />
      </Section>

      {/* Säkerhet — elaborates Home's Security & Architecture scene claim */}
      <Section id="sakerhet" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Säkerhet." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Varje trafikskola som använder Trafikcloud får en egen, isolerad arbetsyta. Plattformen
          drivs som en gemensam, molnbaserad tjänst, men varje trafikskolas data är skild från alla
          andra trafikskolors på databasnivå, inte bara i gränssnittet. Infrastruktur delas; data
          delas aldrig.
        </p>
      </Section>

      {/* Svensk regelefterlevnad — elaborates Home's Proof scene claim */}
      <Section id="regelefterlevnad" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Svensk regelefterlevnad." />
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Trafikcloud stödjer BAS 2020-kontoplan, svenska momsperioder, SIE4-export och
          AGI-arbetsgivardeklarationer. Personnummer hanteras krypterat, i enlighet med GDPR, genom
          hela plattformen.
        </p>
      </Section>

      {/* Dokumentation — reference material for how the product works */}
      <Section id="dokumentation" className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading as="h2" title="Dokumentation." />

        <h3 className="mt-10 text-center text-base font-medium text-foreground">Kärnverksamhetsområden</h3>
        <dl className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2">
          {DOMAINS.map((domain) => (
            <div key={domain.term}>
              <dt className="text-base font-medium text-foreground">{domain.term}</dt>
              <dd className="mt-1 text-sm leading-[1.5] text-muted-foreground">{domain.description}</dd>
            </div>
          ))}
        </dl>

        <h3 className="mt-14 text-center text-base font-medium text-foreground">Integrationer</h3>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Trafikcloud kopplar samman med Fortnox för bokföring, stödjer kort och Swish som
          betalsätt, och erbjuder en bokningsyta där elever kan boka lektioner direkt.
        </p>
      </Section>
    </>
  );
}
