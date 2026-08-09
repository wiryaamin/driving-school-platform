import { PageHeading, Container } from '@modules/public-site/index.js';
import { TrialSignupForm } from '@modules/trial-onboarding/index.js';

/**
 * Scene 9 — Kom igång med Trafikcloud.
 *
 * 2026-08-08: replaced the embedded demo-request lead-capture form with the
 * real self-service trial-signup form (TrialSignupForm.js) — this section,
 * the site's one true conversion action (navigation.ts's DEMO_CTA and every
 * CTA consuming it), previously fed the old manual-review/Convert-to-
 * Customer pipeline, which never runs the Business Discovery questionnaire.
 * Filling in this form now genuinely starts the pre-account guided-interview
 * → automatic-configuration → administrator-account flow end to end.
 */
export function CallToAction() {
  return (
    <section className="w-full bg-background px-8 py-16 md:py-20 lg:py-28 xl:py-36">
      <Container>
        <PageHeading
          as="h2"
          title="Kom igång med Trafikcloud"
          description="Starta er kostnadsfria provperiod redan idag."
        />

        <p className="mx-auto mt-4 max-w-xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
          Svara på några frågor om er verksamhet — Trafikcloud konfigurerar resten automatiskt.
        </p>

        <div className="mt-8">
          <TrialSignupForm />
        </div>
      </Container>
    </section>
  );
}
