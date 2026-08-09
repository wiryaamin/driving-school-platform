import { Link } from 'react-router-dom';
import { ShieldCheck, Play } from 'lucide-react';
import { Button, cn } from '@platform/ui';
import { DeviceMockup } from './DeviceMockup.js';

/**
 * Hero — Scene 1 of the Trafikcloud public landing page.
 *
 * Visual Redesign Pass: rebuilt to match the approved reference layout
 * (eyebrow badge, headline with a highlighted phrase, dual CTAs, a row of
 * trust badges, and a laptop+phone device mockup showing the real dashboard)
 * — replacing the previous frameless single/overlapping-screenshot
 * composition. Copy stays Swedish throughout, per the site's established
 * convention; only the visual structure changes.
 */
interface HeroProps {
  className?: string;
  screenshotSrc?: string;
  screenshotAlt?: string;
}

const TRUST_BADGES = [
  { emoji: '🇸🇪', label: 'Sverige först' },
  { emoji: '🛡️', label: 'GDPR-kompatibel' },
  { emoji: '🔒', label: 'Företagssäkerhet' },
  { emoji: '↗️', label: 'Byggt för tillväxt' },
];

export function Hero({
  className,
  screenshotSrc = '/landing/hero-dashboard.png',
  screenshotAlt = 'Trafikcloud adminpanel som visar dagens schema och ekonomisk översikt',
}: HeroProps) {
  return (
    <section className={cn('w-full bg-muted px-8 py-16 md:py-20 lg:py-24 xl:py-28', className)}>
      <div className="mx-auto grid w-full max-w-[1120px] animate-fade-in motion-reduce:animate-none items-center gap-10 lg:max-w-[1320px] lg:grid-cols-12 lg:gap-8 xl:max-w-[1440px] xl:gap-16">
        <div className="mx-auto flex max-w-[560px] flex-col items-center text-center lg:col-span-5 lg:mx-0 lg:max-w-none lg:items-start lg:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-sm)]">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Det digitala operativsystemet för svenska trafikskolor
          </span>

          <h1 className="mt-4 text-balance text-[32px] font-medium leading-[1.1] tracking-[-0.02em] text-foreground md:text-[40px] lg:text-[52px]">
            Kör hela skolan från <span className="text-primary">en arbetsyta</span>.
          </h1>

          <p className="mt-4 text-pretty text-[18px] font-normal leading-[1.4] tracking-[-0.01em] text-muted-foreground md:mt-6 md:text-[20px]">
            Trafikcloud är den kompletta plattformen för trafikskolor. Hantera elever,
            schemaläggning, instruktörer, ekonomi och mer i ett säkert, sammankopplat system.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3 md:mt-8 md:flex-row md:gap-4 lg:items-start">
            <Button asChild size="lg" className="h-12 w-full rounded-xl px-6 text-base font-medium md:w-auto">
              <Link to="/start-trial">
                Starta provperiod
                <span aria-hidden>→</span>
              </Link>
            </Button>

            <a
              href="#system"
              className={cn(
                'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-input bg-background px-6 text-base font-medium text-foreground md:w-auto',
                'transition-colors duration-150 hover:bg-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'motion-reduce:transition-none'
              )}
            >
              <Play className="h-4 w-4" />
              Se plattformen
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 md:mt-10 lg:justify-start">
            {TRUST_BADGES.map((badge) => (
              <span key={badge.label} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span aria-hidden>{badge.emoji}</span>
                {badge.label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative w-full pb-10 sm:pb-14 lg:col-span-7 lg:pb-16">
          <DeviceMockup src={screenshotSrc} alt={screenshotAlt} />
        </div>
      </div>
    </section>
  );
}
