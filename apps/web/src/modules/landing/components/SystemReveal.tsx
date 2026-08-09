import { Link } from 'react-router-dom';
import {
  Users,
  CalendarClock,
  UserCog,
  Wallet,
  MessagesSquare,
  FolderOpen,
  ShieldCheck,
  LineChart,
} from 'lucide-react';
import { cn } from '@platform/ui';

/**
 * Scene 3 — System Reveal ("THE SOLUTION").
 *
 * Visual Redesign Pass: rebuilt from the centered screenshot + flanking
 * term/description list into the reference layout's asymmetric split — a
 * narrower left column (eyebrow, headline, copy, CTA) beside a wider 2x4
 * icon-card feature grid. Module copy is carried over near-verbatim from the
 * previous version (and from Resources' own `DOMAINS`), just recomposed as
 * cards instead of a plain `<dl>`. `id="system"` is preserved — the Hero's
 * "Se plattformen" secondary CTA anchors here.
 */
const FEATURES = [
  { icon: Users, title: 'Elevhantering', description: 'Hela elevresan, från första kontakt till körkort.' },
  { icon: CalendarClock, title: 'Schemaläggning & kalender', description: 'Smart bokning för lektioner, instruktörer och fordon.' },
  { icon: UserCog, title: 'Instruktörshantering', description: 'Tillgänglighet, arbetsbelastning och behörigheter.' },
  { icon: Wallet, title: 'Ekonomi', description: 'Fakturering, betalningar och svensk bokföring.' },
  { icon: MessagesSquare, title: 'Kommunikation', description: 'SMS, e-post och meddelanden i appen.' },
  { icon: FolderOpen, title: 'Dokument', description: 'Avtal, intyg och säker dokumentlagring.' },
  { icon: ShieldCheck, title: 'Identitet & säkerhet', description: 'Rollbaserad åtkomst, granskningsloggar och dataskydd.' },
  { icon: LineChart, title: 'Rapportering & analys', description: 'Realtidsdata för bättre affärsbeslut.' },
] as const;

export function SystemReveal({ className }: { className?: string }) {
  return (
    <section id="system" className={cn('w-full scroll-mt-24 bg-muted px-8 py-16 md:py-20 lg:py-24', className)}>
      <div className="mx-auto max-w-[1120px] lg:max-w-[1320px]">
        <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-12 xl:gap-16">
          <div className="mx-auto max-w-xl text-center lg:col-span-4 lg:mx-0 lg:max-w-none lg:text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Lösningen</p>
            <h2 className="mt-2 text-balance text-[26px] font-medium leading-[1.15] tracking-[-0.015em] text-foreground md:text-[32px] lg:text-[36px]">
              Operativsystemet för hela din trafikskola.
            </h2>
            <p className="mt-4 text-pretty text-base leading-[1.5] text-muted-foreground">
              Trafikcloud kopplar samman varje del av verksamheten i en plattform — byggd för
              trafikskolor, gjord i Sverige.
            </p>
            <Link
              to="/business-challenges"
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-input bg-background px-5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              Utforska plattformen
              <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8 lg:mt-0">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-xl border border-border bg-background p-5 shadow-[var(--shadow-sm)]">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
                <p className="mt-1 text-sm leading-[1.4] text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
