import type { ReactNode } from 'react';
import { cn } from '@platform/ui';
import { Container } from './Container.js';

/**
 * The public site's standard section wrapper — the responsive vertical
 * padding ladder (64/80/112/144px), plus the bespoke 1120px content wrapper.
 * Extracted so every page reuses one definition rather than re-deriving it.
 *
 * Visual Refinement Sprint: the `lg`/`xl` tiers were widened (96→112px,
 * 128→144px) for more generous breathing room on larger viewports, per the
 * premiumization brief's "increase whitespace significantly" instruction.
 * The `base`/`md` tiers are unchanged — mobile density was already correct
 * and didn't need more room. Applied here once, so it propagates to every
 * scene and every interior page identically rather than needing a per-scene
 * edit — the exact vertical-rhythm discipline the Visual Design Language
 * document (§5, §13) calls out as the implementation's strongest asset.
 *
 * `scroll-mt-24` fixes a real, confirmed bug: the sticky header (h-16, 64px)
 * has no scroll offset compensation, so any same-page anchor navigation
 * (e.g. Hero's "Se plattformen" → #system) or scrollIntoView lands content
 * partially hidden behind the header. 96px of scroll-margin clears the
 * header with room to spare, on every section that carries an `id`.
 *
 * `tint`: an optional flat `bg-muted` fill, replacing the default
 * `bg-background`. Rhythm Sprint — this is the shared mechanism behind the
 * page's alternating section rhythm (tint / flat / tint / flat...), reusing
 * the existing `--muted` token only, no new color. Deliberately a flat,
 * uniform fill rather than a corner-anchored gradient: a gradient fades to
 * white well before a tall section finishes scrolling past, which is why
 * the previous per-section gradient tints read as "barely there" — a flat
 * fill stays visible for the section's entire height.
 */
export function Section({
  children,
  className,
  containerClassName,
  id,
  tint = false,
}: {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  id?: string;
  tint?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        'w-full scroll-mt-24 px-8 py-16 md:py-20 lg:py-28 xl:py-36',
        tint ? 'bg-muted' : 'bg-background',
        className
      )}
    >
      <Container {...(containerClassName ? { className: containerClassName } : {})}>{children}</Container>
    </section>
  );
}
