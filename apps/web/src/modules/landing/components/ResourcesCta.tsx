import { Link } from 'react-router-dom';
import { BookOpen, LifeBuoy, Info, Mail } from 'lucide-react';
import { CTAButton } from '@modules/public-site/index.js';

/**
 * New scene — Resources + demo CTA split, per the reference layout's closing
 * "resources grid beside a booking card" section. Each tile links to a real,
 * existing public page (no fabricated Blog/Knowledge Base/Product Updates
 * pages, which don't exist in this app) rather than inventing pages to match
 * the reference's exact four labels.
 */
const RESOURCES = [
  { icon: BookOpen, title: 'Guider', description: 'Praktiska handledningar.', path: '/guides' },
  { icon: LifeBuoy, title: 'Support', description: 'Hjälp när ni behöver den.', path: '/support' },
  { icon: Info, title: 'Om Trafikcloud', description: 'Vilka vi är och varför.', path: '/about' },
  { icon: Mail, title: 'Kontakt', description: 'Prata med oss direkt.', path: '/contact' },
] as const;

export function ResourcesCta() {
  return (
    <section className="w-full bg-muted px-8 py-16 md:py-20 lg:py-24">
      <div className="mx-auto grid max-w-[1120px] gap-10 lg:max-w-[1320px] lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Resurser</p>
          <h2 className="mt-2 max-w-md text-balance text-[24px] font-medium leading-[1.15] tracking-[-0.015em] text-foreground md:text-[28px]">
            Kunskap och verktyg som hjälper er skola att lyckas.
          </h2>

          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8">
            {RESOURCES.map(({ icon: Icon, title, description, path }) => (
              <Link key={title} to={path} className="group flex flex-col items-start gap-2">
                <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                <p className="text-sm font-medium text-foreground group-hover:text-primary">{title}</p>
                <p className="text-xs leading-[1.4] text-muted-foreground">{description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-2xl bg-background p-8 shadow-[var(--shadow-sm)] lg:col-span-5">
          <h3 className="text-balance text-[22px] font-medium leading-[1.2] tracking-[-0.01em] text-foreground md:text-[24px]">
            Redo att komma igång med Trafikcloud?
          </h3>
          <p className="mt-3 text-pretty text-sm leading-[1.5] text-muted-foreground">
            Starta er kostnadsfria provperiod och se hur vi kan hjälpa er skola växa.
          </p>
          <CTAButton asChild size="lg" className="mt-6 w-full sm:w-auto">
            <Link to="/start-trial">
              Starta provperiod
              <span aria-hidden>→</span>
            </Link>
          </CTAButton>
        </div>
      </div>
    </section>
  );
}
