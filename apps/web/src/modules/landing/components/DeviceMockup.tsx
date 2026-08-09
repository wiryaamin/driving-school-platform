import { cn } from '@platform/ui';

/**
 * Laptop + phone device-frame composition for the Hero, showing the real
 * running dashboard inside browser/phone chrome — distinct from
 * `ScreenshotFrame` (used everywhere else on the page), which is deliberately
 * frameless. This one exception exists because the Hero is the page's single
 * "here is the actual product" moment and benefits from reading unmistakably
 * as a real screen, not an abstract image card.
 *
 * `src` should be a real, current screenshot of the authenticated dashboard —
 * not a mockup or fabricated UI. If none is supplied, both frames render
 * empty rather than staging a fake screen.
 */
export function DeviceMockup({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full', className)}>
      {/* Laptop */}
      <div className="mx-auto w-full max-w-[720px] rounded-t-xl border-8 border-b-0 border-[#1a1d24] bg-[#1a1d24] shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-1.5 rounded-t-md bg-[#1a1d24] px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-white/25" />
          <span className="h-2 w-2 rounded-full bg-white/25" />
          <span className="h-2 w-2 rounded-full bg-white/25" />
        </div>
        <div className="aspect-[16/10] w-full overflow-hidden bg-muted">
          {src ? (
            <img src={src} alt={alt} className="h-full w-full object-cover object-top" loading="eager" decoding="async" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              Skärmbild saknas
            </div>
          )}
        </div>
      </div>
      {/* Laptop base */}
      <div className="mx-auto h-3 w-full max-w-[760px] rounded-b-xl bg-[#0d0e12]" />
      <div className="mx-auto h-1.5 w-1/3 rounded-b-lg bg-[#0d0e12]" />

      {/* Phone — overlapping bottom-right, matching the Hero's established
          "second, smaller frame overlapping the primary frame's corner"
          composition already used on this page (Hero's own mobile overlay,
          Proof's SIE4 export). */}
      <div className="absolute -bottom-6 -right-2 hidden w-[26%] max-w-[170px] sm:block md:-bottom-8 md:-right-4">
        <div className="rounded-[1.4rem] border-[6px] border-[#1a1d24] bg-[#1a1d24] shadow-[var(--shadow-xl)] ring-4 ring-background">
          <div className="aspect-[9/19] w-full overflow-hidden rounded-[1rem] bg-muted">
            {src ? (
              <img src={src} alt={alt} className="h-full w-full object-cover object-top" loading="eager" decoding="async" />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-muted-foreground">
                Skärmbild saknas
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
