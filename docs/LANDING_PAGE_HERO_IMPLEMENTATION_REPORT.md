# TrafikskolaOS — Design Sprint 03: Hero Implementation Report

**Status**: Hero implemented, typecheck/lint clean, dev-server verified. Awaiting design approval before Scene 2 or further work.
**Date**: 2026-07-09
**Files added**: `apps/web/src/modules/landing/{components/Hero.tsx, components/ScreenshotFrame.tsx, routes/LandingPage.tsx, index.ts}`
**Files modified**: `apps/web/src/app/router/routes.tsx` (added lazy import + `/landing` route entry, both additive)
**Route**: `http://localhost:5173/landing` (dev)

---

## 1. Specification Compliance Checklist

Against `docs/LANDING_PAGE_HERO_HIGH_FIDELITY_DESIGN.md` and `docs/LANDING_PAGE_HERO_DESIGN_CHALLENGE.md`:

- [x] Headline: exact approved copy, `<h1>`, 44px desktop / 36px tablet / 32px mobile, weight 500, `leading-[1.15]`, `tracking-[-0.02em]`
- [x] Subheadline: exact approved copy, 28px desktop / 24px tablet / 22px mobile, weight 400, `leading-[1.3]`, `tracking-[-0.01em]`
- [x] Primary CTA: "Boka en visning", `--primary` fill, `--primary-foreground` label, 48px height, 8px radius
- [x] Secondary CTA: "Se plattformen", plain text link, `foreground` at rest, `primary` + underline on hover/focus
- [x] Screenshot: hairline `border` token, `shadow`, `radius: lg` (8px), 16:9 aspect ratio, full content width
- [x] Max content width 1120px via a bespoke wrapper — **not** the shared Tailwind `container` utility (the exact risk flagged in the High-Fidelity spec's own Part 8 critique)
- [x] Vertical rhythm: 8px-multiple spacing throughout (`py-16/20/24/32`, `mt-4/6/8/16`)
- [x] Single accent color (`--primary`) used in exactly two places: CTA fill and focus ring
- [x] No card, badge, or icon-grid element anywhere in the Hero
- [x] Load animation: fade/rise, `motion-reduce:animate-none` on every animated element
- [x] Hover/focus states on both CTAs and the screenshot frame — user-triggered only, no ambient motion
- [x] Reused existing components/tokens: `Button` and `cn` from `@platform/ui`, `--background`/`--foreground`/`--primary`/`--primary-foreground`/`--border`/`--ring`/`--radius` from `globals.css`
- [x] No new dependencies, no global CSS changes, no Tailwind config changes

---

## 2. Pixel-Level Deviations & Justification

| Deviation | From spec value | Implemented value | Justification |
|---|---|---|---|
| Load animation duration | 300–400ms (High-Fidelity spec, Part 6) | 150ms (`animate-fade-in`, pre-existing Tailwind keyframe in `tailwind.config.base.js`) | The technical requirements explicitly mandate reusing existing animation utilities and prohibit introducing duplicate systems. A near-duplicate slower keyframe solely for the Hero would have violated that. This is a genuine, minor, numeric deviation — flagged here for a future decision: either accept 150ms as final, or extend the shared keyframe with a slower named variant in a dedicated follow-up, rather than letting it drift silently. |
| Primary CTA height | `Button` component's default `size="lg"` preset is 40px (`h-10`) | 48px (`h-12`, via `className` override) | The shared `Button` primitive was reused in full (variant colors, focus-ring behavior, disabled states) with only its height/padding overridden to hit the approved 48px target — not a new button component, a targeted override of one primitive's size. |
| Internal gap responsive granularity | High-Fidelity spec lists four distinct breakpoint tiers (desktop/laptop/tablet/mobile) with slightly different intermediate values for headline→subheadline and subheadline→CTA gaps at each tier | Collapsed to two tiers (`<lg` vs `≥lg`) for those specific internal gaps only — outer section padding and all three type sizes still honor the full four-tier scale exactly | The dropped intermediate values differed by 4–8px between tiers — below the threshold of a perceptible visual difference. Falls within the brief's explicit allowance for minor, documented refinements that don't change information hierarchy or visual philosophy. |
| Mobile-specific screenshot crop | "Re-cropped, not scaled" for mobile (Final Design Direction, High-Fidelity spec Part 6) | **Not implemented** — see §7, Technical Debt | No real screenshot asset exists yet (see §3); there is nothing to crop. The placeholder renders identically (via `aspect-[16/9]` + `object-cover`) at every breakpoint. This must be revisited once a real asset exists — flagged, not silently skipped. |

**Nothing else deviates.** Information hierarchy, messaging, visual philosophy, component architecture, and design language are all implemented exactly as specified.

---

## 3. Product Screenshot — Documented Limitation

No real TrafikskolaOS screenshot asset exists anywhere in the repository (`apps/web/public` contains only PWA icons — verified before implementation). Per the sprint brief's own sanctioned fallback path:

1. **Highest-quality existing screen**: none available as a prepared image asset. Capturing one would require running the dev server, authenticating, ensuring realistic populated demo data exists, and producing a properly cropped/optimized image — a content-production task, not a layout-implementation one, and outside this sprint's scope.
2. **Improve presentation through framing only**: `ScreenshotFrame` is fully built to the approved spec (hairline border, two-layer shadow, 8px radius, 16:9 ratio, hover shadow-lift) and is ready to receive a real `src` the moment one exists — no component changes will be needed, only an asset.
3. **Documented limitation**: the Hero currently renders `ScreenshotFrame`'s honest placeholder state — a neutral, muted-background panel with a plain Swedish caption stating it's a placeholder awaiting a real screenshot. **This is explicitly not a fabricated dashboard** — no fake charts, numbers, or UI were drawn, per the brief's direct prohibition.

**Next step**: capture a real, populated admin-dashboard screenshot from a demo/staging environment (ideally showing the schedule + a KPI figure + one real notification moment, per the High-Fidelity spec's Part 4) and pass it via `<Hero screenshotSrc="...">` → currently the prop isn't wired through from `Hero` to `ScreenshotFrame` for external configuration since there's no asset to pass yet; wiring that one-line prop-through is trivial once an asset exists.

---

## 4. Accessibility Verification

- **Heading hierarchy**: exactly one `<h1>` on the page (the headline); the subheadline is a `<p>`, correctly not marked up as a heading despite its visual size.
- **Keyboard navigation**: both CTAs are real `<a>` elements in natural DOM/tab order (primary, then secondary); no `div`-with-onClick pattern used anywhere.
- **Focus states**: both CTAs show a visible `ring-ring`-colored outline on `focus-visible` (2px ring, 2px offset) — the same token/treatment as the shared `Button` component uses elsewhere in the app, so this isn't a new focus-state convention.
- **Reduced motion**: every animated or transitioning element (headline, subheadline, CTA row, screenshot frame) carries `motion-reduce:animate-none` or `motion-reduce:transition-none` — verified by reading the rendered class list on each element, not by an automated tool (see below).
- **Alt text**: the screenshot's `alt` attribute uses the exact descriptive Swedish text specified in the High-Fidelity spec ("TrafikskolaOS adminpanel som visar dagens schema och ekonomisk översikt"), not a decorative empty string — correct per spec even while the image itself is a placeholder.
- **Touch targets**: primary CTA is 48px tall (exceeds the 44px minimum); secondary CTA uses `min-h-[44px]` with horizontal padding specifically to guarantee the same minimum despite having no visible container.
- **Reading order**: DOM order matches visual order exactly; no CSS `order` or reversed flex-direction used anywhere in the Hero.
- **Contrast**: not independently verified with an automated contrast-checking tool in this session (none was available) — the color pairs used (`foreground`/`background`, `primary`/`primary-foreground`) are all pre-existing tokens already in production use elsewhere in the authenticated app, so their contrast is inherited from already-shipped values rather than newly introduced. This should still be confirmed with a real contrast tool (e.g. axe DevTools, Lighthouse) before the Hero ships publicly — flagged as a genuine verification gap, not claimed as done.

---

## 5. Responsive Verification

Verified by reading the compiled Tailwind class output for each breakpoint tier (`base`/`md`/`lg`/`xl`) against the High-Fidelity spec's Part 6 table — **not** verified by visually resizing a real browser viewport, since no browser-automation/screenshot tool was available in this environment (see §6). Section padding, type sizes, and CTA row stacking behavior all map directly to the spec's specified values at each named breakpoint (`md`=768px, `lg`=1024px, `xl`=1280px — the project's real, existing Tailwind breakpoints, not invented ones). The one confirmed, disclosed gap is the mobile-specific screenshot crop (§2, §3, §7).

---

## 6. Performance Observations

- **Bundle impact**: the landing module is lazy-loaded (`React.lazy` + `Suspense`, matching the existing app-wide pattern) — it adds zero weight to the main authenticated-app bundle and only loads on navigation to `/landing`.
- **Dependencies**: none added. Only `Button` and `cn` from the already-installed `@platform/ui` package are used.
- **Image loading**: `loading="lazy"` and `decoding="async"` are already wired on the `<img>` element for when a real screenshot `src` is supplied — currently unused in practice since the placeholder branch renders instead (no real image bytes are being loaded today, which is not a meaningful performance "win," just a reflection of §3's gap).
- **Layout shift**: the `aspect-[16/9]` container reserves the screenshot's box size before any image loads, which will prevent layout shift once a real asset is wired in.
- **Lighthouse**: not run — no such tool was available in this environment. This should be run against a real deployment before the Hero ships, once a real screenshot asset exists (an unoptimized or missing image is the most likely factor to affect a real score, more so than anything in this implementation's markup/CSS).
- **Verification method disclosed plainly**: `pnpm typecheck` (0 errors) and `pnpm lint` (0 errors, 67 warnings — exact pre-existing baseline, nothing new introduced) both ran successfully; the dev server was started and `/landing` was confirmed to serve HTTP 200, and both new component files were confirmed to compile cleanly through Vite's dev transform. No visual/screenshot-based browser verification was possible — flagged explicitly rather than implied.

---

## 7. Remaining Improvements / Technical Debt Introduced

| Item | Type | Notes |
|---|---|---|
| Real screenshot asset needed | Content dependency, not a defect | `ScreenshotFrame` is ready to receive it; `Hero` needs a one-line prop wired through once it exists |
| Mobile-specific screenshot crop not implemented | Deferred, disclosed | Cannot be meaningfully implemented without a real source image to crop from |
| Both CTA destinations are placeholders (`#kontakt`, `#system`) | Expected, scope-bounded | Real destinations depend on Scene 7 (demo-request flow) and Scene 3 (system map), both explicitly out of this sprint |
| Fade-in animation timing (150ms vs. spec's 300–400ms) | Minor, flagged deviation | Needs an explicit future decision (§2) rather than silent drift |
| Final routing decision (`/landing` vs. eventually replacing `/`) | Open architectural question | Deliberately not decided in this sprint — `/` remains the untouched, protected app shell |
| No automated contrast/Lighthouse verification | Verification gap | Tooling wasn't available in this environment; should be run before public launch |

**No other technical debt was introduced.** No global styles were changed, no new dependencies were added, no existing component was modified, and no other route or page was touched.

---

## Stop Condition

Per the sprint brief: Scene 2, navigation, footer, remaining landing page sections, and all other application pages were **not** touched. Implementation stops here. Waiting for design approval before continuing.
