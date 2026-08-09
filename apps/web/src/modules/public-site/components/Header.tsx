import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cn } from '@platform/ui';
import { CTAButton } from './CTAButton.js';
import { MobileNav } from './MobileNav.js';
import { PRIMARY_NAV, DEMO_CTA, CUSTOMER_LOGIN } from '../lib/navigation.js';

/**
 * Persistent public-site header. Sticky, per Website Information Architecture
 * v4 Section 3 ("mirrored in the navigation itself so it's reachable from
 * anywhere on the page, not only at the bottom") — the demo CTA and customer
 * login must not require scrolling back to Scene 7 or the footer.
 *
 * Eight primary nav items is dense for one row; the full set only renders at
 * `xl` (1280px+) and collapses to the mobile/tablet menu below that — a
 * deliberate, honest trade-off rather than cramming eight labels into a
 * narrower row (see the implementation report's recommendations).
 *
 * Layout Refactor: a subtle scroll-triggered elevation (`--shadow-sm`)
 * replaces the flat hairline border once the page scrolls past the Hero —
 * confirmation that the header is layered above content, not a persistent
 * decorative shadow. Motion is a one-time class toggle, not a continuous
 * animation, so it costs nothing for `prefers-reduced-motion` users.
 */
export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur transition-shadow duration-200 supports-[backdrop-filter]:bg-background/80 motion-reduce:transition-none',
        scrolled && 'shadow-[var(--shadow-sm)]'
      )}
    >
      {/* Wider than the page's own 1120px content column (Container.tsx) —
          the nav bar's eight items genuinely need the room, and a header is
          chrome, not body copy, so borrowing the app's existing 1400px
          `2xl` container cap (packages/config/tailwind.config.base.js) for
          this one element is a reuse of an existing value, not a new one. */}
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-8">
        <Link
          to="/"
          className="flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {/* Official Trafikcloud logo (apps/web/public/logo.png). The source
              file is a wide lockup with generous white padding around the
              visible mark — cropped via negative margins on a normally-
              flowing <img>, not absolute positioning, so the browser never
              has to rasterize the scaled image onto its own composited
              layer just to clip it. That absolute-position + overflow-hidden
              combination was confirmed (via a live A/B test against the raw
              uncropped image) to introduce a grey haze around the logo that
              doesn't exist in the source file, the CSS, or the deployment —
              purely a compositing artifact of that specific technique. */}
          <div className="h-9 w-[215px] overflow-hidden rounded-sm bg-white">
            <img
              src="/logo-v2.png"
              alt="Trafikcloud"
              className="block h-[168px] w-[252px] max-w-none -ml-[18px] -mt-[64px]"
            />
          </div>
        </Link>

        <nav aria-label="Huvudnavigation" className="hidden items-center gap-6 xl:flex">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none',
                  isActive && 'text-foreground'
                )
              }
              end={item.path === '/'}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Login stays a single, plain link to the one real gateway
            (/auth/login) — a small utility icon distinguishes it from the
            narrative nav items without implying a dropdown/menu that
            doesn't exist (Quiet Authority: icons are wayfinding, never a
            stand-in for functionality that isn't there). */}
        <div className="hidden items-center gap-5 xl:flex">
          <Link
            to={CUSTOMER_LOGIN.path}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors duration-150 hover:text-primary motion-reduce:transition-none"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21a8 8 0 0 0-16 0" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {CUSTOMER_LOGIN.label}
          </Link>
          <CTAButton asChild size="lg">
            <Link to={DEMO_CTA.path}>{DEMO_CTA.label}</Link>
          </CTAButton>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Öppna meny"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground xl:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        </button>
      </div>

      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
