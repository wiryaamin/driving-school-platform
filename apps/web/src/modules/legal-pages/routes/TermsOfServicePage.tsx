import { Link } from 'react-router-dom';
import { Section, PageHeading, usePageMeta } from '@modules/public-site/index.js';

/**
 * Terms of Service ("Användarvillkor"). See PrivacyPolicyPage.tsx for the
 * full rationale — same replacement of a PagePlaceholder, same "don't
 * invent what doesn't exist yet" discipline for commercial specifics
 * (pricing, formal company registration) that are genuinely
 * customer-specific/not-yet-published rather than universal facts this page
 * can state outright. First draft; should go through legal review before
 * being treated as final, binding terms.
 */
export function TermsOfServicePage() {
  usePageMeta({
    title: 'Användarvillkor — Trafikcloud',
    description: 'Villkoren för att använda Trafikcloud — plattformen, kontotyper, ansvar och gränser för tjänsten.',
    path: '/legal/terms',
  });

  return (
    <>
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          title="Användarvillkor."
          description="Villkoren för att använda Trafikcloud — för trafikskolor och deras användare."
        />
      </Section>

      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <div className="mx-auto max-w-3xl text-[15px] leading-[1.7] text-foreground">
          <p className="text-sm text-muted-foreground">Senast uppdaterad: 7 augusti 2026.</p>

          <p className="mt-6">
            Dessa villkor gäller för trafikskolor ("kunden") som tecknar avtal om att använda
            Trafikcloud, och för de användare — personal, lärare, elever och vårdnadshavare — som
            kunden ger tillgång till plattformen.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">1. Tjänsten</h2>
          <p className="mt-3">
            Trafikcloud är en molnbaserad plattform för trafikskolor: schemaläggning och bokning,
            elev- och lärarhantering, fordonshantering, fakturering och bokföring enligt svensk
            standard (BAS-kontoplan, momsrapportering, SIE4-export), kommunikation, samt rapportering.
            Varje trafikskola arbetar i en egen, isolerad arbetsyta.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">2. Konto och kontotyper</h2>
          <p className="mt-3">
            Kunden ansvarar för att de konton som skapas — administratör, personal, lärare, elev och
            vårdnadshavare — endast används av rätt person, och för att omedelbart inaktivera konton
            som inte längre ska ha åtkomst (till exempel vid en anställds avslut). Inloggningsuppgifter
            får inte delas mellan flera personer.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">3. Kundens data</h2>
          <p className="mt-3">
            Kunden äger sin egen verksamhetsdata — elevregister, bokningar, fakturor och övrig
            information som registreras i plattformen. Trafikcloud behandlar denna data som
            personuppgiftsbiträde, enligt vår{' '}
            <Link to="/legal/privacy" className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
              integritetspolicy
            </Link>{' '}
            och ett separat personuppgiftsbiträdesavtal. Kunden ansvarar för att ha rättslig grund för
            de uppgifter som registreras om sina egna elever, vårdnadshavare och anställda.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">4. Betalning och abonnemang</h2>
          <p className="mt-3">
            Avgifter för att använda Trafikcloud regleras i det avtal som tecknas med varje enskild
            trafikskola vid uppstart, inte i ett offentligt fast prisblad. Betalningsvillkor,
            uppsägningstid för abonnemanget och eventuell bindningstid framgår av det avtalet.
          </p>
          <p className="mt-3">
            Betalningar som elever gör till trafikskolan via plattformen — till exempel via kort eller
            Swish — förmedlas av tredjepartsleverantörer. Trafikcloud är inte part i det köpet; det
            sker mellan eleven och trafikskolan.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">5. Tillåten användning</h2>
          <p className="mt-3">Plattformen får inte användas för att:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>bryta mot lag, inklusive dataskyddslagstiftning eller bokföringslagen,</li>
            <li>försöka kringgå behörighetsstyrning eller få åtkomst till en annan trafikskolas data,</li>
            <li>belasta plattformen på ett sätt som stör andra kunders drift, eller</li>
            <li>skicka kommunikation (SMS, e-post) i strid med marknadsföringslagen eller mottagarens samtycke.</li>
          </ul>

          <h2 className="mt-10 text-xl font-medium text-foreground">6. Tillgänglighet</h2>
          <p className="mt-3">
            Vi strävar efter hög tillgänglighet och underhåller plattformen löpande, men lämnar inga
            garantier om oavbruten drift. Planerat underhåll som kan påverka tillgängligheten
            kommuniceras till kunden i förväg när det är praktiskt möjligt.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">7. Immateriella rättigheter</h2>
          <p className="mt-3">
            Trafikcloud, plattformens källkod, design och varumärke tillhör Trafikcloud. Kunden får en
            icke-exklusiv rätt att använda tjänsten under avtalstiden — inget annat.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">8. Uppsägning</h2>
          <p className="mt-3">
            Endera parten kan säga upp avtalet enligt de villkor som anges i kundens specifika avtal.
            Vid uppsägning kan kunden begära ut sin egen data inom rimlig tid innan den raderas, i den
            utsträckning bokföringslagen och andra rättsliga skyldigheter inte kräver fortsatt lagring.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">9. Ansvarsbegränsning</h2>
          <p className="mt-3">
            Trafikcloud ansvarar inte för indirekta skador, utebliven vinst, eller förlust som uppstår
            till följd av att kunden själv, eller en tredjepartsleverantör (till exempel en
            betalnings- eller kommunikationsleverantör), inte fullgör sin del. Fullständig
            ansvarsreglering framgår av kundens specifika avtal.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">10. Tillämplig lag</h2>
          <p className="mt-3">
            Dessa villkor tolkas enligt svensk lag. Tvist som inte kan lösas i samförstånd avgörs av
            svensk domstol.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">11. Ändringar</h2>
          <p className="mt-3">
            Vi kan uppdatera dessa villkor när plattformen utvecklas. Väsentliga ändringar meddelas
            kunden i förväg.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">12. Kontakt</h2>
          <p className="mt-3">
            Frågor om dessa villkor besvaras via vår{' '}
            <Link to="/contact" className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
              kontaktsida
            </Link>.
          </p>
        </div>
      </Section>
    </>
  );
}
