import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@platform/ui';
import { Section, PageHeading } from '@modules/public-site/index.js';
import { useInView } from '../hooks/useInView.js';

/**
 * Scene 7 — Onboarding Journey.
 *
 * New scene per docs/LANDING_PAGE_STRATEGY_V3_BUSINESS_OPERATING_PLATFORM.md
 * §7. Funnel stages and the shared-responsibility table content are taken
 * directly from that document (translated into the Swedish already used
 * throughout the rest of the page) — nothing here was invented at
 * implementation time beyond word-level phrasing.
 *
 * v3 explicitly sanctions "a small amount of structured, list-like content"
 * as the one justified exception to the page's restraint — this is that one
 * exception, kept to a single vertical sequence rather than a card grid or
 * multi-column comparison, per v3's explicit constraint.
 *
 * The closing line implements the partnership-messaging strengthening from
 * docs/LANDING_PAGE_STRATEGY_V4_FINAL_BLUEPRINT.md §6: the funnel's terminal
 * stage (Kundinloggning) is framed as the start of ongoing use, not a finish
 * line.
 *
 * Layout Refactor: the funnel is now a genuine horizontal stepper at `lg`+ —
 * dots on a single continuous line, evenly spaced via a 10-column grid,
 * labels beneath — instead of the vertical-only sequence used at every
 * breakpoint before. Still no icon, no card, no per-step illustration; the
 * only visual elements are the same dot/line/label vocabulary the vertical
 * version already used, just laid out left-to-right where there's room for
 * it. The vertical sequence remains exactly as-is below `lg`. Both variants
 * share one `useInView` ref on their common wrapper so the reveal animation
 * works correctly regardless of which one is actually visible.
 *
 * V2 Implementation: deliberately still a diagram, not a screenshot — per
 * Design Direction V2's illustration rule, illustration is warranted only
 * where no single product screen can communicate the concept, and a
 * multi-month, cross-organization business process (visitor → demo →
 * subscription → go-live → ongoing use) is exactly that case; no one screen
 * in the product shows "the whole onboarding journey." Widened to match the
 * page's wider rhythm elsewhere (1200px vs. the previous default 1120px).
 *
 * Mobile Scroll Affordance Pass: the responsibility table's own scroll
 * container (previously the shared `Container` primitive) is now a local
 * div carrying the identical `mx-auto w-full max-w-[1120px]` classes —
 * swapped for a plain div rather than adding `forwardRef` to the shared
 * `Container` (used across every public page), so this change stays
 * entirely local to this one table. A ref on that div drives two edge-fade
 * overlays, each using the section's own existing `background` color as a
 * gradient (no new color introduced) rather than a flat block, so they
 * blend into the section instead of reading as a new UI element. Both fades
 * are opacity-driven by real overflow state (`scrollWidth` vs `clientWidth`),
 * not a breakpoint, so they simply never activate at desktop widths where
 * the table already fits without scrolling — desktop output is unchanged.
 */
const STAGES = [
  'Besökare',
  'Demo',
  'Behovsgenomgång',
  'Prenumeration',
  'Tenant-etablering',
  'Organisationsuppsättning',
  'Datamigrering',
  'Personalutbildning',
  'Go Live',
  'Kundinloggning',
];

const RESPONSIBILITIES: { stage: string; platform: string; school: string }[] = [
  {
    stage: 'Tenant-etablering',
    platform: 'Etablerar er isolerade miljö och tillämpar er konfiguration.',
    school: 'Bekräftar organisationsuppgifter (platser, registreringsuppgifter).',
  },
  {
    stage: 'Organisationsuppsättning',
    platform: 'Konfigurerar roller, behörigheter och platsstruktur.',
    school: 'Beslutar vem som har vilken roll och tillhandahåller personaluppgifter.',
  },
  {
    stage: 'Datamigrering',
    platform: 'Utför eller vägleder den tekniska importen av befintliga uppgifter.',
    school: 'Tillhandahåller källdata — elevlistor, scheman, historisk bokföring.',
  },
  {
    stage: 'Personalutbildning',
    platform: 'Håller i guidad utbildning för personalen.',
    school: 'Ser till att personalen deltar och tar till sig systemet.',
  },
  {
    stage: 'Go Live',
    platform: 'Ger stöd under övergångsperioden.',
    school: 'Kör verksamheten i det nya systemet från dag ett.',
  },
];

export function OnboardingJourney() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateTableScrollAffordance = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateTableScrollAffordance();
    window.addEventListener('resize', updateTableScrollAffordance);
    return () => window.removeEventListener('resize', updateTableScrollAffordance);
  }, [updateTableScrollAffordance]);

  return (
    <Section containerClassName="lg:max-w-[1200px]">
      <PageHeading
        as="h2"
        title="Så går bytet till."
        description="Från första kontakt till en verksamhet som körs i ett system — och vidare."
      />

      {/* Funnel — one shared reveal-observer wrapper; a horizontal stepper at
          `lg`+, the original vertical sequence below it. */}
      <div ref={ref} className="mt-12 md:mt-16">
        {/* Desktop/laptop: horizontal, dots on one continuous line. */}
        <div className="relative hidden lg:block">
          <div aria-hidden className="absolute left-0 right-0 top-[5px] h-px bg-border" />
          <div className="relative grid grid-cols-10 gap-2">
            {STAGES.map((stage, i) => (
              <div key={stage} className="flex min-w-0 flex-col items-center text-center">
                <div
                  className={`z-10 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary bg-background transition-colors duration-300 motion-reduce:transition-none ${
                    inView ? 'bg-primary' : 'bg-background'
                  }`}
                  style={{ transitionDelay: `${i * 60}ms` }}
                />
                <p
                  className={`mt-3 w-full text-pretty text-xs font-medium leading-tight text-foreground transition-opacity duration-300 motion-reduce:transition-none [overflow-wrap:break-word] ${
                    inView ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  {stage}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile/tablet: vertical sequence — unchanged. */}
        <div className="mx-auto flex max-w-md flex-col lg:hidden">
          {STAGES.map((stage, i) => (
            <div key={stage} className="flex items-stretch gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary transition-colors duration-300 motion-reduce:transition-none ${
                    inView ? 'bg-primary' : 'bg-background'
                  }`}
                  style={{ transitionDelay: `${i * 60}ms` }}
                />
                {i < STAGES.length - 1 && (
                  <div
                    aria-hidden
                    className="w-px flex-1 bg-border transition-transform duration-300 motion-reduce:transition-none"
                    style={{
                      transformOrigin: 'top',
                      transform: `scaleY(${inView ? 1 : 0})`,
                      transitionDelay: `${i * 60 + 60}ms`,
                    }}
                  />
                )}
              </div>
              <p
                className={`pb-8 text-base font-medium text-foreground transition-opacity duration-300 motion-reduce:transition-none ${
                  inView ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                {stage}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Shared responsibility — plain semantic table, hairline dividers
          only, no header fill, no zebra striping. Table markup itself is
          unchanged; only its scroll wrapper gained the ref/fade affordance
          below. */}
      <div className="relative mt-4">
        <div
          ref={tableScrollRef}
          onScroll={updateTableScrollAffordance}
          className="mx-auto w-full max-w-[1120px] overflow-x-auto"
        >
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4 font-medium text-foreground">Steg</th>
                <th className="py-3 pr-4 font-medium text-foreground">Trafikcloud ansvarar för</th>
                <th className="py-3 font-medium text-foreground">Trafikskolan ansvarar för</th>
              </tr>
            </thead>
            <tbody>
              {RESPONSIBILITIES.map((row) => (
                <tr key={row.stage} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4 align-top font-medium text-foreground">{row.stage}</td>
                  <td className="py-3 pr-4 align-top text-muted-foreground">{row.platform}</td>
                  <td className="py-3 align-top text-muted-foreground">{row.school}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Edge-fade scroll affordance — opacity follows real overflow state,
            so both fades stay invisible whenever the table already fits
            (i.e. always, at desktop widths). Gradient uses the section's own
            `background` color, not a new one. */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent transition-opacity duration-200 motion-reduce:transition-none',
            canScrollLeft ? 'opacity-100' : 'opacity-0'
          )}
        />
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 motion-reduce:transition-none',
            canScrollRight ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>

      <p className="mx-auto mt-10 max-w-xl text-pretty text-center text-base text-muted-foreground">
        Kundinloggning är inte slutet på resan — det är där ert dagliga arbete börjar, med
        fortsatt support genom hela vägen.
      </p>
    </Section>
  );
}
