# TrafikskolaOS — Public Website Foundation: Final Architecture Refinement

**Document type:** Architecture refinement, appended to Epic 1 (Public Website Foundation). Per explicit direction, Section 1 is **documentation only** — the URL migration it describes is deferred to its own future epic, not executed here. Sections 2–4 are standards/architecture documents, also not implemented as running code (analytics, SSR) per instruction.
**Status:** Final. No landing page content, no navigation labels, no Quiet Authority system values, and no already-built public page were touched to produce this document.

---

## 1. Public vs. Application URL Strategy

### Current state (verified directly against `routes.tsx`, not assumed)

| Surface | Current root | Status |
|---|---|---|
| Authenticated Tenant Workspace | `/` | The entire live application — dashboard, students, instructors, scheduling, finance, every authenticated module |
| Platform Administration | `/platform` | **Already correctly isolated** — guarded by `PlatformAdminRoute`, mounted as its own subtree. No change needed here; it already matches the target architecture below. |
| Public Website | Scattered top-level paths | `/landing`, `/product`, `/guides`, `/business-challenges`, `/onboarding`, `/support`, `/about`, `/contact`, `/demo`, `/legal/*` — each individually chosen to avoid colliding with whatever the Tenant Workspace happened to already own (`/product` and `/guides` exist specifically because `/platform` and `/resources` were taken) |

**The actual problem, stated precisely:** it isn't that the public site's URLs are wrong today — every route works, verified in Epic 1. The problem is that the public site's namespace is **reactive, not owned** — each new public page has to be checked against the Tenant Workspace's ever-growing route list before it can be named, and that check is manual (I did it by hand for Epic 1). That doesn't scale, and it means the public site's URL stability depends on the authenticated app never adding a colliding route, which this project cannot guarantee going forward.

### Target architecture (recommended, not yet implemented)

```
/           Public Website        (marketing, currently at /landing and siblings)
/app        Tenant Workspace      (the entire current authenticated application)
/platform   Platform Administration  (already here — no change)
```

This is the right shape, and I'm not proposing an alternative to it — it's a standard, well-understood split (marketing at root, product behind its own prefix, admin behind its own prefix) and it directly solves the stated problem: once the Tenant Workspace lives entirely under `/app/*`, the public site owns every top-level path that doesn't start with `/app` or `/platform`, permanently, with no further manual collision-checking required.

**One alternative genuinely worth naming, not recommending yet:** a separate subdomain (`app.trafikskolaos.se` for the Tenant Workspace, `trafikskolaos.se` for the public site) rather than a path prefix. This is the more common pattern at larger scale — it gives fully independent deployability, cleaner cookie/session domain boundaries, and no risk of a public-site static asset ever shadowing an app route. It is **not** recommended as the near-term move: it's an infrastructure decision (DNS, hosting configuration, CORS, auth cookie domain scoping against the hosted Supabase project), not a routing refactor, and folding it into this refinement would be exactly the "uncontrolled scope expansion" this project has consistently avoided. Worth revisiting if the application grows enough to justify independent deployment pipelines for the marketing site vs. the product.

### Why this is deferred rather than implemented today

Verified before writing this document, not assumed: the Tenant Workspace's routes are used via **at least 96 files** containing absolute-path navigation (`navigate('/students')`, `to="/dashboard"`, etc.) — a conservative count that excludes redirect guards (`ProtectedRoute`, `SmartRedirect`), the auth-hook's post-login redirect target, and any links already sent to real users in emails (invoices, portal invitations) that assume today's URLs still resolve. Moving `/` → `/app` correctly means:

1. Prefixing every existing route with `/app`.
2. Updating all absolute-path navigation across the application to match.
3. Updating `ProtectedRoute`/`SmartRedirect` and the auth-hook's post-login target.
4. Deciding what happens to already-issued links (temporary redirects from the old paths, at minimum, so a customer's saved bookmark or an emailed invoice link doesn't 404).
5. Re-verifying the entire authenticated app, not just the public site.

That is a large, high-risk change to a live, production-connected application — the exact category of work this entire project has been explicitly kept away from ("treat the application as a finished product," repeated in every prior instruction). It is correctly a **separate, dedicated epic** with its own scoping, testing plan, and rollout strategy (almost certainly needing temporary redirect rules from old paths to new, not a hard cutover) — not a line item inside a landing-page-adjacent refinement. Deferred, not forgotten: this document is the recommendation that epic should start from.

---

## 2. Public Page Definition Standard

The canonical template every future public page must be defined against before implementation begins — modeled on Home, the one page with real, implemented content, so the template is proven against something real rather than purely theoretical.

| Field | Definition | Worked example — Home |
|---|---|---|
| **URL** | The page's public path | `/landing` (target architecture: `/`) |
| **Page Purpose** | One sentence — what question this page answers that no other page does | Earn the next ten seconds with a checkable, specific claim |
| **Primary Audience** | Exactly one of: Prospective Customer, New Customer, Existing Customer, Existing Customer needing Support, Platform Administrator (Website IA v4, §14) | Prospective Customer |
| **Business Goal** | What changes in the business if this page does its job | Visitor continues scrolling instead of leaving in the first ten seconds |
| **Primary CTA** | Exactly one action (Website Governance v4 §15, principle 2) | "Boka en visning" |
| **SEO Title** | ≤60 characters, unique per page, set via `usePageMeta` | "TrafikskolaOS — Allt din trafikskola behöver, i ett system" |
| **Meta Description** | ≤160 characters, unique per page | "Schemaläggning, elever, ekonomi och kommunikation i en plattform byggd för svensk bokföring." |
| **Canonical URL** | Absolute, self-referencing unless intentionally pointing elsewhere | `https://trafikskolaos.se/landing` |
| **Open Graph Title** | May match SEO Title; only diverges when the sharing context needs different framing than a search result does | Same as SEO Title (no divergence needed here) |
| **Open Graph Description** | May match Meta Description | Same as Meta Description |
| **Structured Data Type** | The schema.org type this page should mark up, once implemented | `SoftwareApplication` (the product itself) |
| **Breadcrumb Position** | This page's position in the site hierarchy (Website IA §11's sitemap) | Root — no breadcrumb, Home has no parent |
| **Analytics Events** | Which events from Section 3 below this page can fire | `demo_requested` (primary CTA), `navigation_clicked` (nav/footer links) |

**Structured data types recommended per already-approved page** (for when structured data is actually implemented — not done here):

| Page | Recommended schema.org type |
|---|---|
| Home | `SoftwareApplication` |
| Platform (`/product`) | `SoftwareApplication` (secondary — deep-dive, not a duplicate primary entity) |
| Business Challenges | `WebPage` (no specific commerce/product schema fits a situational-navigation page) |
| Onboarding | `WebPage`, optionally `HowTo` if the published content ends up being a literal numbered sequence |
| Resources (`/guides`) | `CollectionPage`, with each resource item as `Article` or `TechArticle` |
| Resources → FAQ specifically | `FAQPage` |
| Support | `WebPage` (deliberately not `FAQPage` — Support's Help Center content and Resources' FAQ content are different things and should not both claim the same schema type unless their content is genuinely structured as question/answer pairs) |
| About TrafikskolaOS | `AboutPage`, with `Organization` for the company details block |
| Contact | `ContactPage` |
| Boka en personlig visning (`/demo`) | `WebPage` (booking-flow pages generally don't have a dedicated, appropriate schema.org type) |

---

## 3. Analytics Architecture (Business Events Only — Not Implemented)

Every event below is a **business event** — what happened, from the business's perspective, not a technical/UI implementation detail (no click coordinates, no component names, no library-specific payload shape). This is intentional: analytics implementation (which tool, what SDK, what technical properties) is a separate decision this document does not make.

| Event | Fires when | Business question it answers |
|---|---|---|
| **Demo Requested** | A visitor completes the "Boka en personlig visning" action | How many visitors convert into a qualified conversation? |
| **Contact Submitted** | A visitor submits the Contact page's form | How many inquiries arrive that don't fit the demo funnel? |
| **Customer Login Clicked** | A visitor clicks "Kundinloggning" | How much of the site's traffic is existing customers, not prospects — informs how much marketing effort is actually reaching new visitors vs. serving returning ones |
| **Resource Downloaded** | A visitor accesses/downloads a Resources item (Migration Guide, etc.) | Which self-serve content is actually earning trust before a conversation happens? |
| **Support Accessed** | A visitor clicks "Support" or reaches a Support sub-page | Volume of existing-customer support-seeking behavior via the public site, as distinct from in-product support channels |
| **Onboarding Started** | A prospective customer reaches the Onboarding page (or, later, an actual onboarding flow begins post-conversion) | How many prospects are diligence-checking the switching process before deciding — a leading indicator distinct from Demo Requested |
| **Navigation Clicked** | A visitor clicks any primary or footer navigation item | Which pages visitors actually seek out, informing which parts of Sections 1–2's architecture are pulling their weight and which aren't |

**Governance note, consistent with every prior document in this program:** these events describe what's real and planned to be built — none should be wired up before the page or action it describes actually exists (e.g., `resource_downloaded` has nothing to fire on until Resources has real content). Implementing analytics against a page that's still a `PagePlaceholder` would silently generate meaningless data.

---

## 4. SEO Architecture

### Metadata ownership

Two layers, already implemented in Epic 1, formalized here as the standing architecture:

1. **`apps/web/index.html`** owns the *static, pre-JS default* — currently the authenticated app's own identity (`noindex, nofollow`, "Körskoleplattformen"). This is the safe fallback if a public page's JS never runs.
2. **`apps/web/src/modules/public-site/lib/usePageMeta.ts`** owns *per-route overrides* for every public page — title, description, canonical, Open Graph, and flipping `robots` to `index, follow` for the duration the page is mounted. Every future public page must call this hook with the values defined by Section 2's template — it is the single mechanism, not one of several.

### Canonical URLs

Every public page's canonical URL is self-referencing (`https://trafikskolaos.se` + the page's own path) unless a future page is intentionally a duplicate/near-duplicate of another (none exist today). Canonical URLs are set by the same `usePageMeta` call as the rest of a page's metadata — there is no separate mechanism to keep in sync.

### Open Graph

Same ownership as metadata generally (`usePageMeta`). Every public page must supply a real `ogImage` before launch — Epic 1 shipped a wired-but-unpopulated default (`/og-default.png`) rather than fabricating a placeholder image; producing that asset (and page-specific OG images, where a page's identity is unique enough to warrant one) is a design task, not an architecture decision, and is out of this document's scope.

### Structured Data

Not implemented anywhere yet. When it is, Section 2's per-page type recommendations are the standard; implementation should extend `usePageMeta` (or a sibling hook) to inject a `<script type="application/ld+json">` block per page, following the same one-mechanism-per-concern principle already established for title/description/OG.

### robots.txt ownership

`apps/web/public/robots.txt` is the single source of truth, static, manually maintained. **Standing rule:** every time a new public page is added, `robots.txt`'s `Allow` list must be updated in the same change — it does not update itself, and an un-added page silently stays disallowed even though it's live and linked. This is a real, easy-to-forget maintenance obligation worth flagging explicitly rather than assuming it'll be remembered.

### sitemap.xml ownership

Same ownership model and same standing rule as robots.txt — `apps/web/public/sitemap.xml` is static and manually maintained today. As the public site grows past roughly a dozen pages (Resources' individual articles, in particular, could grow past hand-maintenance quickly), this should be revisited as a build-time generation step rather than a hand-edited file — flagged as a future consideration, not a problem to solve now.

### Future prerendering/SSR considerations (documented, not implemented)

Epic 1's `usePageMeta` is a real, working, client-side-only mechanism — it does not solve metadata visibility for crawlers or link-preview tools that don't execute JavaScript. The architecturally correct long-term fix is one of:

- **Static prerendering** at build time for the public route set specifically (the Tenant Workspace and Platform Administration would never need this — only the public site's genuinely public, crawlable pages) — the lower-risk option, since it doesn't change how the app is served at runtime, only how the public HTML is generated at build time.
- **Full SSR** for the public site specifically, while the authenticated app remains a client-rendered SPA — higher implementation cost, only justified if prerendering proves insufficient.

Neither is implemented here, per explicit instruction. This is recorded so the decision isn't quietly forgotten between now and whenever public-launch SEO performance is actually measured.

---

## Files Modified

**None.** This entire refinement is documentation — `docs/PUBLIC_WEBSITE_FOUNDATION_FINAL_REFINEMENT.md` is the only file created. No route, component, navigation label, design token, or previously-approved public page was changed to produce it, consistent with the explicit "document architecture only" / "do not implement" instructions governing every section above.

## Architectural Decisions

1. **The `/`, `/app`, `/platform` target architecture is confirmed correct** and is not being replaced with an alternative — but its implementation is **deferred to its own future epic**, per your explicit direction, after verifying the actual blast radius (96+ files with absolute-path navigation, plus guards and the auth-hook's redirect target) made clear this is a large, high-risk change to the live application, not a routing tweak.
2. **`/platform` requires no change** — Platform Administration already lives exactly where the target architecture wants it.
3. **A subdomain-based split (`app.trafikskolaos.se`) is named as a longer-term alternative**, not recommended now — it's an infrastructure decision, not a routing refactor, and out of proportion to this refinement's scope.
4. **The Public Page Definition Standard is grounded against Home**, the one page with real content, rather than left purely abstract — so it's provably usable, not just theoretically complete.
5. **Analytics events are specified as business events only**, with an explicit governance note that no event should be wired to a page that's still a placeholder, preventing meaningless data collection as Epic 2 proceeds page-by-page.
6. **SEO architecture formalizes what Epic 1 already built** (the `index.html` / `usePageMeta` two-layer ownership model) rather than proposing a new mechanism, and names robots.txt/sitemap.xml's manual-maintenance obligation explicitly so it isn't silently forgotten as pages are added.

## Confirmation

The Public Website Foundation (Epic 1) — shared layout, header, footer, navigation, routing, shared components, SEO foundation, accessibility, and performance groundwork — together with this final architecture refinement, is **complete and finalized**. The one deferred item (the `/app` URL migration) is fully documented as a recommendation and does not block Epic 2: every public page Epic 2 will build already has a stable, non-colliding URL today, verified against the live route table, not assumed.

**Ready for Epic 2.** Not started.
