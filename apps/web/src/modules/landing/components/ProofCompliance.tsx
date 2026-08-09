import { Section, PageHeading } from '@modules/public-site/index.js';

/**
 * Scene 4 — Proof: Swedish Compliance & Accounting.
 *
 * Headline/supporting copy verbatim from docs/LANDING_PAGE_CREATIVE_BLUEPRINT.md
 * Phase 3 and docs/LANDING_PAGE_MESSAGING_STRATEGY.md's section-headline list.
 * The additional paragraph implements the claim broadening approved in
 * LANDING_PAGE_STRATEGY_V2_PLATFORM_POSITIONING.md §6 (append-only/audit-
 * traceable ledger, Fortnox) and LANDING_PAGE_STRATEGY_V3_BUSINESS_OPERATING_PLATFORM.md
 * §8 (personnummer handling) — reframed, per v3, as evidence for one claim
 * rather than a checklist, so it stays prose, not a feature list.
 *
 * Per the Creative Blueprint: "the single most important screenshot on the
 * page — given the most visual weight of any individual image." Still an
 * honest ScreenshotFrame placeholder — no real ledger screenshot exists yet.
 *
 * Visual Refinement Sprint: `weight="emphasis"` now actually reflects that
 * documented intent (deeper elevation than the Hero's screenshot) — the
 * implementation previously gave this scene's screenshot identical treatment
 * to every other one on the page despite the Blueprint's own instruction.
 *
 * Layout Refactor: elevation alone wasn't enough to make this scene read as
 * the page's heaviest single image — it was still bounded by the same
 * 1120px container as every other centered scene. `Section`'s own
 * `containerClassName` escape hatch widens *this scene's* container to
 * 1400px at `lg`+ (the widest single element on the whole page) — the
 * heading/paragraph above the screenshot are unaffected, since `PageHeading`
 * and the paragraph both carry their own independent, narrower `max-w-2xl`
 * regardless of the outer container's width. The scale jump between "normal
 * text measure" and "wider than anything else on the page" is what signals
 * importance here, not just the deeper shadow from the previous pass.
 *
 * V2 Implementation: per Design Direction V2 Part 3 ("real screenshots are
 * the primary visual asset... use screenshots wherever possible"), this
 * scene's copy makes two distinct, screenshot-able claims — the ledger
 * itself, and the SIE4 export — so it now shows two screenshots instead of
 * one: the ledger as the dominant frame, a SIE4 export view as a smaller
 * supporting frame overlapping its corner (same pattern as the Hero's
 * primary/secondary composition, reused rather than reinvented). Still no
 * device chrome (V2 Part 1, standing constraint).
 */
export function ProofCompliance() {
  return (
    <Section id="ekonomi" containerClassName="lg:max-w-[1400px]">
      <PageHeading
        as="h2"
        title="Byggt för svensk bokföring, inte anpassat i efterhand."
        description="BAS 2020, dubbel bokföring, momsperioder, SIE4 och AGI — inbyggt, inte tillagt."
      />

      <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-base font-normal leading-[1.5] text-muted-foreground">
        Huvudboken är append-only och spårbar rad för rad — ingenting redigeras i tysthet i
        efterhand. Trafikcloud kopplar samman med Fortnox, och personnummer hanteras
        krypterat, enligt GDPR, genom hela plattformen.
      </p>
    </Section>
  );
}
