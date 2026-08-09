import { Link } from 'react-router-dom';
import { CTAButton } from './CTAButton.js';
import { Container } from './Container.js';
import { FOOTER_NAV_GROUPS, LEGAL_NAV, PLATFORM_LOGIN, DEMO_CTA } from '../lib/navigation.js';

/**
 * Public-site footer.
 *
 * Visual Redesign Pass: rebuilt from the light `bg-muted/40` four-column
 * layout into a dark, wider multi-column footer matching the reference
 * layout's structure (brand column, several link columns, a dedicated
 * "book a demo" column, bottom legal bar). Per Website Governance v4 §15,
 * Platform Login stays internal and low-visibility — still present, still
 * deliberately the least emphasized link on the page.
 *
 * The reference layout also shows a "Solutions" link column, a Blog/Product
 * Updates resources column, and social media icons. None of those exist as
 * real pages or accounts in this app, so they're intentionally omitted here
 * rather than fabricated — this footer only links to pages that are real.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full bg-[#0d1b2e] text-white">
      <Container className="px-8 py-16 md:py-24">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-4 lg:col-span-2">
            <Link to="/" className="inline-flex items-center gap-2.5 rounded-lg bg-white px-3 py-2">
              <span className="h-8 w-[190px] overflow-hidden block">
                <img
                  src="/logo-v2.png"
                  alt="Trafikcloud"
                  className="block h-[149px] w-[224px] max-w-none -ml-[16px] -mt-[57px]"
                />
              </span>
            </Link>
            <span className="mt-1 block text-[11px] text-white/50">Digitalt operativsystem</span>
            <p className="mt-4 max-w-[260px] text-sm text-white/60">
              Den kompletta plattformen för trafikskolor i Sverige.
            </p>
          </div>

          {FOOTER_NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <h2 className="text-xs font-medium uppercase tracking-wide text-white/50">
                {group.heading}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className="text-sm text-white/80 transition-colors duration-150 hover:text-white motion-reduce:transition-none"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h2 className="text-xs font-medium uppercase tracking-wide text-white/50">Juridiskt</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {LEGAL_NAV.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className="text-sm text-white/80 transition-colors duration-150 hover:text-white motion-reduce:transition-none"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-white/50">Boka demo</h2>
            <p className="mt-4 text-sm text-white/70">Se Trafikcloud i praktiken.</p>
            <CTAButton asChild size="lg" className="mt-4 w-full sm:w-auto">
              <Link to={DEMO_CTA.path}>
                {DEMO_CTA.label.replace('en personlig visning', 'demo')}
              </Link>
            </CTAButton>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 text-xs text-white/50">
            <p>© {year} Trafikcloud. Alla rättigheter förbehållna.</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/50">
            <span>Tillverkad i Sverige 🇸🇪</span>
            {/* Platform Login — internal use only, deliberately unemphasized. */}
            <Link to={PLATFORM_LOGIN.path} className="text-white/30 hover:text-white/60">
              {PLATFORM_LOGIN.label}
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
