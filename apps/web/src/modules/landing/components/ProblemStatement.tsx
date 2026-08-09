import { Clock, CalendarDays, Database, MessagesSquare, FileText, BarChart3 } from 'lucide-react';
import { cn } from '@platform/ui';

/**
 * Scene 2 — Problem Recognition.
 *
 * Visual Redesign Pass: rebuilt from a single large text statement into the
 * reference layout's six-item icon grid ("THE CHALLENGE"), one column per
 * concrete daily pain point. The previous single-sentence version's core
 * claim ("most systems are just an instructor diary with a payment button")
 * is preserved as this scene's closing line rather than deleted outright.
 */
const CHALLENGES = [
  { icon: Clock, title: 'Tidskrävande', description: 'Manuell administration tar tid från undervisning och tillväxt.' },
  { icon: CalendarDays, title: 'Komplex schemaläggning', description: 'Lektioner, instruktörer och fordon är svåra att planera och samordna.' },
  { icon: Database, title: 'Fristående system', description: 'Flera verktyg skapar dubbelarbete och ökar risken för fel.' },
  { icon: MessagesSquare, title: 'Kommunikationsluckor', description: 'Information är utspridd och elever förväntar sig snabb, tydlig kommunikation.' },
  { icon: FileText, title: 'Efterlevnad & journalföring', description: 'Regelkrav och dokumentation är svåra att hålla ordning på.' },
  { icon: BarChart3, title: 'Begränsad överblick', description: 'Brist på realtidsdata gör det svårt att fatta välgrundade beslut.' },
] as const;

export function ProblemStatement({ className }: { className?: string }) {
  return (
    <section className={cn('w-full bg-background px-8 py-16 md:py-20 lg:py-24', className)}>
      <div className="mx-auto max-w-[1120px] xl:max-w-[1320px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Utmaningen</p>
          <h2 className="mt-2 text-balance text-[26px] font-medium leading-[1.15] tracking-[-0.015em] text-foreground md:text-[32px] lg:text-[38px]">
            Trafikskolor möter komplex daglig drift.
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:mt-16 lg:grid-cols-6 lg:gap-x-8">
          {CHALLENGES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex flex-col items-start gap-3 text-left">
              <Icon className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="mt-1 text-sm leading-[1.4] text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-14 max-w-[900px] text-balance text-center text-[22px] font-medium leading-[1.2] tracking-[-0.01em] text-foreground md:mt-16 md:text-[28px]">
          De flesta system för trafikskolor är egentligen bara en instruktörsdagbok med en
          betalknapp.
        </p>
      </div>
    </section>
  );
}
