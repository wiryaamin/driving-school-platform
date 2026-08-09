import { UserPlus, CalendarCheck, Car, FileText, TrendingUp, ArrowRight } from 'lucide-react';
import { cn } from '@platform/ui';

/**
 * New scene — "Så funkar det" (reference layout's five-step flow: Register →
 * Plan → Teach → Manage → Grow). Distinct from `OnboardingJourney`'s deeper
 * ten-stage vendor/customer responsibility funnel further down the page —
 * this one is the short, visual day-to-day user journey; that one is the
 * detailed implementation-project timeline. Kept as separate scenes rather
 * than merged, since they answer different questions ("what does a student's
 * journey look like" vs. "what happens during onboarding as a business").
 */
const STEPS = [
  { icon: UserPlus, title: '1. Registrera', description: 'Ny elevförfrågan eller registrering.' },
  { icon: CalendarCheck, title: '2. Planera', description: 'Schemalägg lektioner och fördela resurser.' },
  { icon: Car, title: '3. Undervisa', description: 'Genomför lektioner och följ upp progress.' },
  { icon: FileText, title: '4. Hantera', description: 'Hantera dokument, betalningar och journalföring.' },
  { icon: TrendingUp, title: '5. Väx', description: 'Analysera resultat och utveckla skolan.' },
] as const;

export function HowItWorks({ className }: { className?: string }) {
  return (
    <section className={cn('w-full bg-background px-8 py-16 md:py-20 lg:py-24', className)}>
      <div className="mx-auto max-w-[1120px] xl:max-w-[1320px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Så funkar det</p>
          <h2 className="mt-2 text-balance text-[26px] font-medium leading-[1.15] tracking-[-0.015em] text-foreground md:text-[32px] lg:text-[38px]">
            Från elev till körkort. Allt i ett flöde.
          </h2>
        </div>

        <div className="mt-14 flex flex-col gap-10 md:mt-16 lg:flex-row lg:items-start lg:gap-2">
          {STEPS.map(({ icon: Icon, title, description }, i) => (
            <div key={title} className="contents lg:flex lg:flex-1 lg:items-start">
              <div className="flex items-start gap-4 lg:flex-col lg:items-center lg:text-center">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden />
                </div>
                <div className="lg:mt-3">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-1 max-w-[160px] text-sm leading-[1.4] text-muted-foreground lg:mx-auto">
                    {description}
                  </p>
                </div>
              </div>

              {i < STEPS.length - 1 && (
                <ArrowRight
                  className="mt-6 hidden h-5 w-5 shrink-0 self-center text-muted-foreground/40 lg:block"
                  aria-hidden
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
