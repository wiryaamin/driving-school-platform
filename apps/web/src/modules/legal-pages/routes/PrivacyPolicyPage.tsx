import { Link } from 'react-router-dom';
import { Section, PageHeading, usePageMeta } from '@modules/public-site/index.js';

/**
 * Privacy Policy ("Integritetspolicy").
 *
 * Replaces the PagePlaceholder that previously lived at this route — a live,
 * public page collecting personal data (including minors', via students and
 * their guardians) with no real privacy policy behind it. This page
 * describes, honestly and specifically, what the Trafikcloud platform
 * actually processes and why, grounded in the real data model and the real
 * third-party services the product integrates with (Stripe, Swish, SMS/
 * email/push providers, Fortnox, vehicle-registry lookup) — not generic
 * boilerplate.
 *
 * Per this codebase's own established discipline (see ContactPage.tsx and
 * Footer.tsx: "Do not invent contact information" / "only link to pages
 * that are real"), the legal entity's formal company registration number,
 * registered address, and a dedicated data-protection contact address do
 * not exist yet and are not fabricated here — they carry the same honest
 * "publiceras här inför kommersiell lansering" placeholder already used
 * elsewhere on the public site. Everything else on this page is a real,
 * substantive description of the platform's actual data processing, not a
 * placeholder — but it is a first draft and should still be reviewed by
 * qualified legal counsel before being treated as final, binding text,
 * particularly given the platform's processing of minors' personal data
 * under Swedish/EU law.
 */
export function PrivacyPolicyPage() {
  usePageMeta({
    title: 'Integritetspolicy — Trafikcloud',
    description:
      'Hur Trafikcloud behandlar personuppgifter — vilka uppgifter vi hanterar, varför, vilka som får ta del av dem och vilka rättigheter du har.',
    path: '/legal/privacy',
  });

  return (
    <>
      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <PageHeading
          title="Integritetspolicy."
          description="Hur Trafikcloud behandlar personuppgifter i plattformen — för elever, vårdnadshavare, lärare och kunder hos våra trafikskolor."
        />
      </Section>

      <Section className="py-10 md:py-12 lg:py-14 xl:py-16">
        <div className="mx-auto max-w-3xl text-[15px] leading-[1.7] text-foreground">
          <p className="text-sm text-muted-foreground">Senast uppdaterad: 7 augusti 2026.</p>

          <p className="mt-6">
            Trafikcloud är en molnbaserad plattform som svenska trafikskolor använder för att driva
            sin verksamhet — schemaläggning, elevadministration, fakturering, bokföring och
            kommunikation. Den här policyn beskriver hur personuppgifter behandlas när trafikskolor,
            deras elever, vårdnadshavare och personal använder plattformen, samt när någon besöker
            trafikcloud.se.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">1. Vem som är personuppgiftsansvarig</h2>
          <p className="mt-3">
            Trafikcloud AB <span className="text-muted-foreground">(organisationsnummer och fullständiga
            registreringsuppgifter publiceras här inför kommersiell lansering)</span> är i normalfallet{' '}
            <strong>personuppgiftsbiträde</strong> — inte personuppgiftsansvarig — för de uppgifter om
            elever, vårdnadshavare och personal som en trafikskola registrerar i plattformen. Det är
            trafikskolan själv som är <strong>personuppgiftsansvarig</strong> för sina egna kunders och
            anställdas uppgifter, precis som för vilket annat verksamhetssystem de använder. Ett
            personuppgiftsbiträdesavtal (PUB-avtal) reglerar Trafikclouds behandling å trafikskolans
            vägnar.
          </p>
          <p className="mt-3">
            För uppgifter som Trafikcloud själva samlar in — till exempel när någon bokar en visning,
            kontaktar oss, eller skapar ett konto som plattformsadministratör — är Trafikcloud
            personuppgiftsansvarig.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">2. Vilka uppgifter vi behandlar</h2>
          <p className="mt-3">Beroende på hur en trafikskola använder plattformen kan följande kategorier av personuppgifter behandlas:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li><strong>Elever:</strong> namn, personnummer eller födelsedatum, kontaktuppgifter, önskad körkortsbehörighet, utbildningsframsteg, provresultat, bokningar och närvaro, dokument som laddas upp (t.ex. intyg), samt relation till vårdnadshavare om eleven är minderårig.</li>
            <li><strong>Vårdnadshavare:</strong> namn, kontaktuppgifter, relation till eleven, samt uppgifter som visas via vårdnadshavarportalen (schema, framsteg, saldo).</li>
            <li><strong>Lärare och övrig personal:</strong> namn, kontaktuppgifter, anställningsuppgifter, certifieringar, arbetstider och schema.</li>
            <li><strong>Betalningsuppgifter:</strong> fakturor, betalningshistorik och krediter. Kortuppgifter hanteras direkt av vår betalningsleverantör (Stripe) — Trafikcloud lagrar aldrig fullständiga kortnummer.</li>
            <li><strong>Kommunikation:</strong> loggar över SMS, e-post och push-notiser som skickats via plattformen, för att kunna visa leveransstatus och undvika dubbelutskick.</li>
            <li><strong>Teknisk information:</strong> inloggningssessioner, IP-adress i säkerhetsloggar, och enhetsinformation för den som aktiverar push-notiser.</li>
          </ul>
          <p className="mt-3">
            Varje trafikskola är egen, isolerad i plattformen — uppgifter delas aldrig mellan olika
            trafikskolor.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">3. Varför vi behandlar uppgifterna</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>För att fullgöra avtalet mellan trafikskolan och dess elev — schemaläggning, bokningar, fakturering.</li>
            <li>För att uppfylla rättsliga skyldigheter — bland annat bokföringslagens krav på att bevara räkenskapsinformation, och rapportering till Transportstyrelsen där det är tillämpligt.</li>
            <li>För att skydda plattformen och dess användare — säkerhetsloggning, behörighetsstyrning och missbruksförhindrande åtgärder.</li>
            <li>För att kommunicera bokningsbekräftelser, påminnelser och annan trafikskolerelaterad information, där trafikskolan aktiverat detta.</li>
          </ul>

          <h2 className="mt-10 text-xl font-medium text-foreground">4. Vilka som kan få ta del av uppgifterna</h2>
          <p className="mt-3">
            Trafikcloud delar inte personuppgifter med tredje part i marknadsföringssyfte. Uppgifter
            kan däremot behandlas av leverantörer som Trafikcloud eller trafikskolan anlitar för att
            leverera tjänsten, bland annat:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Molndrift och databaslagring (Supabase).</li>
            <li>Betalningsförmedling — kortbetalningar (Stripe) och, i vissa fall, Swish enligt trafikskolans eget Swish-avtal.</li>
            <li>Utskick av SMS, e-post och push-notiser, för de kanaler trafikskolan aktiverat.</li>
            <li>Bokföringsexport, för trafikskolor som kopplat sitt Fortnox-konto.</li>
            <li>Fordonsregisteruppslag, vid registrering av skolfordon.</li>
          </ul>
          <p className="mt-3">
            Dessa leverantörer får endast behandla uppgifterna för att leverera tjänsten åt Trafikcloud
            eller trafikskolan, inte för egna ändamål. Om en leverantör är etablerad utanför EU/EES
            säkerställer vi att överföringen sker med lämpliga skyddsåtgärder enligt GDPR, till exempel
            EU-kommissionens standardavtalsklausuler.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">5. Hur länge uppgifterna sparas</h2>
          <p className="mt-3">
            Räkenskapsinformation — fakturor, betalningar och bokföring — sparas i minst sju år enligt
            bokföringslagen. Övriga uppgifter sparas så länge kundrelationen mellan eleven och
            trafikskolan pågår, och raderas eller anonymiseras inom rimlig tid därefter, om inte längre
            lagring krävs enligt lag. En trafikskola kan när som helst begära att uppgifter om en
            specifik elev raderas, inom ramen för vad bokföringslagen och andra rättsliga skyldigheter
            tillåter.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">6. Dina rättigheter</h2>
          <p className="mt-3">Du har enligt GDPR rätt att:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Få information om och tillgång till de uppgifter som behandlas om dig.</li>
            <li>Begära rättelse av felaktiga uppgifter.</li>
            <li>Begära radering, i den utsträckning rättsliga skyldigheter inte kräver fortsatt lagring.</li>
            <li>Begära begränsning av behandlingen, eller invända mot den.</li>
            <li>Få ut dina uppgifter i ett strukturerat format (dataportabilitet).</li>
            <li>Lämna klagomål till Integritetsskyddsmyndigheten (IMY).</li>
          </ul>
          <p className="mt-3">
            Eftersom det oftast är trafikskolan som är personuppgiftsansvarig ska en förfrågan i
            första hand riktas dit. Gäller frågan uppgifter Trafikcloud själva ansvarar för (till
            exempel en kontoförfrågan från en trafikskola, eller en förfrågan från någon som bokat en
            visning), se kontaktuppgifter nedan.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">7. Minderåriga elever</h2>
          <p className="mt-3">
            Många elever i plattformen är under 18 år. Trafikskolan ansvarar för att inhämta
            vårdnadshavares samtycke där det krävs. Vårdnadshavare kan få egen inloggning
            (vårdnadshavarportalen) för att följa sitt barns bokningar och utbildningsframsteg.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">8. Cookies</h2>
          <p className="mt-3">
            Plattformen använder cookies som krävs för inloggning och säkerhet — till exempel för att
            hålla en användare inloggad mellan sidladdningar. Dessa är nödvändiga för att tjänsten ska
            fungera och kräver inget separat samtycke. Vi använder inte cookies för
            marknadsföringsspårning på trafikcloud.se.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">9. Säkerhet</h2>
          <p className="mt-3">
            Varje trafikskolas data är tekniskt isolerad från andra trafikskolors. Åtkomst styrs av
            roller och behörigheter — en användare ser bara det som är relevant för sin roll.
            Känsliga åtgärder loggas. Data överförs krypterat.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">10. Kontakt</h2>
          <p className="mt-3">
            En dedikerad kontaktadress för dataskyddsfrågor publiceras här inför kommersiell
            lansering. Fram tills dess, se vår{' '}
            <Link to="/contact" className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
              kontaktsida
            </Link>.
          </p>

          <h2 className="mt-10 text-xl font-medium text-foreground">11. Ändringar av denna policy</h2>
          <p className="mt-3">
            Vi kan uppdatera den här policyn när plattformen utvecklas. Väsentliga ändringar meddelas
            trafikskolor som är kunder hos Trafikcloud.
          </p>
        </div>
      </Section>
    </>
  );
}
