import { Link, NavLink } from 'react-router-dom';
import { Sheet, SheetContent, SheetTitle, cn } from '@platform/ui';
import { CTAButton } from './CTAButton.js';
import { PRIMARY_NAV, DEMO_CTA, CUSTOMER_LOGIN } from '../lib/navigation.js';

/**
 * Mobile/tablet navigation (below `xl`). Built on the existing `Sheet`
 * primitive (Radix Dialog under the hood) rather than a hand-rolled overlay —
 * reuses the design system and gets focus trapping, Escape-to-close, and
 * `aria-modal` for free, which a bespoke implementation would have to
 * reimplement.
 */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent id="mobile-nav" side="right" className="flex w-full flex-col gap-8 sm:max-w-sm">
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        <nav aria-label="Mobilnavigation" className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-2 py-2.5 text-base font-medium text-foreground transition-colors duration-150 hover:bg-muted motion-reduce:transition-none',
                  isActive && 'bg-muted'
                )
              }
              end={item.path === '/'}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border pt-6">
          <Link
            to={CUSTOMER_LOGIN.path}
            onClick={onClose}
            className="px-2 text-base font-medium text-foreground transition-colors duration-150 hover:text-primary motion-reduce:transition-none"
          >
            {CUSTOMER_LOGIN.label}
          </Link>
          <CTAButton asChild size="lg" className="w-full">
            <Link to={DEMO_CTA.path} onClick={onClose}>
              {DEMO_CTA.label}
            </Link>
          </CTAButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
