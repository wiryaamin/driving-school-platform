/**
 * Single source of truth for the public site's navigation, per the approved
 * Website Information Architecture (docs/LANDING_PAGE_STRATEGY_V4_FINAL_BLUEPRINT.md,
 * Sections 3, 11, 20). Consumed by Header, MobileNav, and Footer so the item
 * list is defined once, not duplicated per component.
 */
export interface NavItem {
  label: string;
  path: string;
}

/**
 * Primary navigation — the site's seven informational/narrative pages.
 *
 * The standalone "Plattform" (/product) page was retired per the approved
 * Information Architecture clarification: Home already carries the complete
 * public explanation of Trafikcloud (System Reveal, Proof, Business
 * Transformation, Security & Architecture scenes), and a second page whose
 * sole purpose was also "explain the platform" was redundant by definition.
 * /product now redirects to /landing (see routes.tsx). Its genuine reference
 * content (multi-tenant architecture, business domains, integrations,
 * Swedish compliance) moved to Resources, rewritten in reference voice.
 *
 * Route slug still diverges from the IA's page *name* in one case: "Resurser"
 * → /guides (not /resources — that's the real, existing Vehicles/Resources
 * module). See routes.tsx.
 */
export const PRIMARY_NAV: NavItem[] = [
  { label: 'Hem', path: '/' },
  { label: 'Utmaningar', path: '/business-challenges' },
  { label: 'Onboarding', path: '/onboarding' },
  { label: 'Resurser', path: '/guides' },
  { label: 'Support', path: '/support' },
  { label: 'Om Trafikcloud', path: '/about' },
  { label: 'Kontakt', path: '/contact' },
];

/**
 * The site's one true conversion action — mirrored in nav per v4, Section 3.
 * Points at the real self-service trial-signup flow (2026-08-08) — was
 * /demo, which only queued a manual admin review and never ran the Business
 * Discovery questionnaire before creating a real administrator account.
 */
export const DEMO_CTA: NavItem = { label: 'Starta provperiod', path: '/start-trial' };

/**
 * Direct entry into the real, existing authenticated product — not a marketing
 * page. Label updated to "Logga in" (Visual Refinement Sprint) — same single
 * gateway (`/auth/login`), not a dropdown, not a new menu: still exactly one
 * link, still no Student/Instructor/Guardian portal exposed in navigation.
 */
export const CUSTOMER_LOGIN: NavItem = { label: 'Logga in', path: '/auth/login' };

/**
 * Footer utility navigation — mirrors PRIMARY_NAV plus the legal placeholders.
 * Per Website Governance (v4, Section 15): navigation follows the customer
 * journey, so the footer's grouping matches the IA's page relationships
 * rather than an arbitrary link dump.
 */
export const FOOTER_NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Plattform',
    items: [
      { label: 'Er situation', path: '/business-challenges' },
      { label: 'Onboarding', path: '/onboarding' },
    ],
  },
  {
    heading: 'Resurser',
    items: [
      { label: 'Resurser', path: '/guides' },
      { label: 'Support', path: '/support' },
    ],
  },
  {
    heading: 'Företag',
    items: [
      { label: 'Om Trafikcloud', path: '/about' },
      { label: 'Kontakt', path: '/contact' },
    ],
  },
];

/** Legal placeholders — real pages, honestly labeled, not yet populated with final legal text. */
export const LEGAL_NAV: NavItem[] = [
  { label: 'Integritetspolicy', path: '/legal/privacy' },
  { label: 'Användarvillkor', path: '/legal/terms' },
];

/**
 * Footer-only, deliberately low-visibility — internal platform administration,
 * not a customer journey (v4, Section 3). Never rendered in primary navigation.
 */
export const PLATFORM_LOGIN: NavItem = { label: 'Platform Login', path: '/auth/login' };
