import type { ReactNode } from 'react';
import { cn } from '@platform/ui';

/**
 * The public site's bespoke 1120px content wrapper (High-Fidelity Hero Design
 * Specification, Part 1 / Part 8) — deliberately not the shared Tailwind
 * `container` utility, which caps at 1400px. Extracted here so every future
 * public page reuses one definition instead of re-deriving the same
 * two-element padding/max-width pattern already used by Hero, ProblemStatement,
 * and SystemReveal.
 */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1120px]', className)}>{children}</div>;
}
