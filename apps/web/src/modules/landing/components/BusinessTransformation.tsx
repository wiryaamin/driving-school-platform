import { Section, PageHeading } from '@modules/public-site/index.js';

/**
 * Scene 6 — Business Transformation.
 *
 * New scene per docs/LANDING_PAGE_STRATEGY_V3_BUSINESS_OPERATING_PLATFORM.md
 * §6 — promoted from creative-direction grounding (Creative Blueprint,
 * Phase 7's before/after composite) to real, on-page content. Condensed to
 * "one calm, specific paragraph-equivalent of copy," per v3's explicit
 * constraint against a literal two-column comparison table or a dramatized
 * pain-point list.
 *
 * The closing line preserves the retired Roles scene's one piece of real
 * value (v3 §2): the team adopts this without friction, spoken to the owner,
 * not pitched to the team directly.
 *
 * Layout Refactor: previously a fully centered single column, identical in
 * structure to every other scene on the page. Now an asymmetric label/content
 * grid at `lg`+ — the headline sits in a narrower left column, the prose in a
 * wider right column — an editorial pattern that gives this scene its own
 * distinct shape rather than repeating the centered-stack rhythm a fourth or
 * fifth time in a row. Centered and stacked below `lg`, where a label/content
 * split has no room to read correctly.
 *
 * V2 Implementation: the scene's own second paragraph makes a specific,
 * screenshot-able claim — "ägaren ser hela verksamheten på ett ställe" — so
 * per Design Direction V2 ("use screenshots wherever possible"), a real
 * screenshot of the overview dashboard now sits beneath the text, full width,
 * as direct visual evidence for that exact sentence rather than leaving the
 * claim as prose alone.
 *
 * Rhythm Sprint: `tint` marks this as one of the page's alternating zone
 * beats — breaks up what was previously a long unbroken run of flat white
 * sections (Proof, Transformation, Onboarding, Security all flat in a row).
 */
export function BusinessTransformation() {
  return (
    <Section tint containerClassName="lg:max-w-[1200px]">
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-12 xl:gap-16">
        <div className="lg:col-span-4">
          <PageHeading
            as="h2"
            title="Från lösa system till en verksamhet."
            className="lg:mx-0 lg:max-w-none lg:text-left"
          />
        </div>

        <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-5 text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground lg:col-span-8 lg:mx-0 lg:mt-0 lg:max-w-none lg:text-left">
          <p>
            Idag styr många trafikskolor sin verksamhet i flera olika verktyg samtidigt — ett
            bokningssystem, ett kalkylblad, en separat sms-tjänst och manuell bokföring. En
            avbokning blir flera telefonsamtal. En momsperiod blir en stressig vecka.
          </p>
          <p>
            Med Trafikcloud ser ägaren hela verksamheten på ett ställe. En avbokning öppnar
            automatiskt platsen för väntelistan. Bokföringen byggs kontinuerligt — inte under
            press inför en deadline.
          </p>
          <p className="text-foreground">
            Administration, ekonomi och instruktörer arbetar i samma system — utan att ni behöver
            övertyga någon.
          </p>
        </div>
      </div>
    </Section>
  );
}
