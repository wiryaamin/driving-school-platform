import { cn } from '@platform/ui';

/**
 * Interior-page and section heading primitive. Visual Refinement Sprint:
 * previously fixed at a single 28px regardless of viewport, while the Hero's
 * own h1 scaled across three breakpoints — meaning every headline on the
 * site *except* the Hero's stayed visually flat on large screens. Scales
 * 24px (mobile) → 28px (tablet) → 32px (desktop+), one tier below the Hero's
 * own scale at every breakpoint, so section headlines carry real weight on
 * wide viewports without ever competing with the Hero for dominance. Not the
 * authenticated app's own `PageHeader` from `@platform/ui`, which implements
 * a different, denser type scale (20px, left-aligned, breadcrumb/actions row)
 * built for internal admin pages, not the public site's restrained system.
 *
 * Typography Hierarchy Sprint: raised one further step — 24/28/32 read as
 * closer to "body-adjacent" than "section headline" once the Hero's own
 * scale grew to 58px in an earlier pass; the gap between "Hero-scale" and
 * "everything else" had become a cliff rather than a step. Now 26/32/38 —
 * still clearly, deliberately subordinate to Hero and Business Challenge's
 * oversized statement, but with enough presence to anchor a section on
 * sight rather than reading as body copy with extra weight. Also now
 * matches System Reveal's own previously-inconsistent hand-rolled heading
 * scale (was 28/36 with no tablet step) — one unified section-heading tier
 * across the whole page instead of two slightly different ones.
 */
export function PageHeading({
  title,
  description,
  className,
  as = 'h1',
}: {
  title: string;
  description?: string;
  className?: string;
  /**
   * Heading level. Defaults to 'h1' for interior pages, where this
   * component's title *is* the page's one heading. On Home, Hero already
   * owns the page's single h1 — every other scene's headline (Proof,
   * Business Transformation, Onboarding Journey, Security) must pass
   * as="h2" to avoid multiple h1s on one page (WCAG heading structure).
   */
  as?: 'h1' | 'h2';
}) {
  const Heading = as;
  return (
    <div className={cn('mx-auto max-w-2xl text-center', className)}>
      <Heading className="text-balance text-[26px] font-medium leading-[1.15] tracking-[-0.015em] text-foreground md:text-[32px] lg:text-[38px]">
        {title}
      </Heading>
      {description && (
        <p className="mt-4 text-pretty text-base font-normal leading-[1.5] text-muted-foreground md:text-[17px]">
          {description}
        </p>
      )}
    </div>
  );
}
