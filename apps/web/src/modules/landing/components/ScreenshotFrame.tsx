import { cn } from '@platform/ui';

/**
 * Hairline-framed product screenshot container.
 * Implements High-Fidelity Hero Design Specification, Part 3 and Part 4
 * (frame treatment, aspect ratio) plus the Visual Refinement Sprint's
 * elevation system (globals.css `--shadow-*`, replacing the previous
 * hand-typed arbitrary shadow value — the exact "not yet in the design
 * system" gap the Visual Design Language review flagged).
 *
 * `weight` lets a placement declare its narrative importance instead of
 * every screenshot on the page getting identical treatment regardless of
 * role: the Creative Blueprint calls the Proof/Compliance screenshot "the
 * single most important screenshot on the page," which the implementation
 * previously didn't reflect at all. `"primary"` (Hero) uses `--shadow-md`;
 * `"emphasis"` (Proof) uses the deeper `--shadow-lg` so it reads as the
 * page's heaviest single image without changing size, framing, or ratio.
 * No device/browser chrome in either case — explicitly rejected in this
 * sprint's brief; dominance comes from elevation and scale, not staging.
 *
 * Screenshot Presentation Sprint: corner radius raised one step (`rounded-lg`
 * → `rounded-xl`, 8px → 12px) across every instance for a softer, less
 * boxy edge. `floating` is a new treatment, not a third `weight`, because it
 * describes a structural role (this frame sits physically on top of another
 * frame — Hero's mobile overlay, Proof's SIE4 export) rather than narrative
 * importance: it takes the new `--shadow-xl` tier (one step past `emphasis`,
 * since a floating frame must out-rank whatever it's layered over), a
 * doubled border, and a `ring-4 ring-background` "cut-out" ring outside
 * that border. The ring alone isn't enough on its own — a background-
 * colored ring disappears on sections that aren't tinted (Proof's own
 * section is flat `bg-background`, so a same-color ring would blend
 * straight into the page there) — so the border does the work of reading
 * as a distinct edge on *every* section background, tinted or not, while
 * the ring adds extra separation only where there's contrast to show it.
 * Its own radius stays one step tighter than the base frame (`rounded-lg`)
 * since a smaller layered element wants a proportionally smaller radius,
 * not the same one scaled down.
 */
interface ScreenshotFrameProps {
  src?: string;
  alt: string;
  className?: string;
  weight?: 'primary' | 'emphasis';
  floating?: boolean;
}

export function ScreenshotFrame({ src, alt, className, weight = 'primary', floating = false }: ScreenshotFrameProps) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-border bg-muted',
        'aspect-[16/9]',
        weight === 'emphasis' ? 'shadow-[var(--shadow-lg)]' : 'shadow-[var(--shadow-md)]',
        floating && 'rounded-lg border-2 shadow-[var(--shadow-xl)] ring-4 ring-background',
        className
      )}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center"
          style={{
            background:
              'radial-gradient(ellipse at center, hsl(var(--muted)) 0%, hsl(var(--background)) 140%)',
          }}
        >
          {/* Reuses the app's real brand mark (identical markup to Sidebar.tsx /
              AuthLayout.tsx) so the placeholder reads as an intentional,
              branded holding state rather than an empty box — still makes no
              claim about the product's UI. */}
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-primary-foreground" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Skärmbild av Trafikcloud-panelen</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Platshållare i väntan på en verklig skärmbild från produktionsmiljön.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
