import type { ComponentProps } from 'react';
import { Button, cn } from '@platform/ui';

/**
 * The public site's primary CTA sizing convention — 48px height, 24px
 * horizontal padding (High-Fidelity Hero Design Specification, Part 5).
 *
 * Radius is deliberately `rounded-xl` (12px, Tailwind's fixed scale) rather
 * than `rounded-lg` (`var(--radius)`, 8px) — Visual Refinement Sprint,
 * "premium enterprise" button treatment. Using the fixed Tailwind value
 * instead of the shared `--radius` token keeps this a public-site-only
 * change: it does not alter the authenticated app's global radius, which
 * every other button/card/input in the product still reads from `--radius`.
 *
 * Hover elevation uses the new `--shadow-sm` token (globals.css) instead of
 * a one-off shadow value — subtle, single-tier lift, not a "floating card"
 * effect (Quiet Authority: hover states are confirmation, not decoration).
 */
export function CTAButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className={cn(
        'h-12 rounded-xl px-6 text-base font-medium',
        'transition-shadow duration-150 hover:shadow-[var(--shadow-sm)] motion-reduce:transition-none',
        className
      )}
    />
  );
}
