# TrafikskolaOS — UI Modernization Roadmap
**Version:** 1.0  
**Date:** 2026-06-30  
**Branch:** ui/modernization-v2  
**Authors:** Chief Product Designer · Principal UX Architect · Design System Lead  
**Status:** APPROVED FOR IMPLEMENTATION

---

## Executive Summary

The TrafikskolaOS platform currently operates with **six distinct visual languages** across its portals and workspaces. Each was built to work; none were built to cohere. This roadmap defines the complete modernization sequence to achieve one unified **Scandinavian SaaS design language** across every surface — without modifying any business logic, workflow, or data model.

The design direction is:

> **Clean authority.** A Scandinavian SaaS aesthetic: generous whitespace, restrained color, crisp typography, purposeful density. Operationally serious. Visually calm. Consistently branded across every surface a user touches.

This roadmap is organized into **9 work packages** executed in strict sequence. Each package has defined scope, affected modules, dependencies, and expected outcomes. No package begins until its dependencies are complete.

---

## Current State Audit

### 1. Design Token Fragmentation

| Surface | Background | Primary Color | Border Radius | Sidebar Width |
|---|---|---|---|---|
| Trafikskola Workspace | `#ffffff` (`bg-background`) | `#006AA7` (Swedish Blue) | `0.5rem` | 280px |
| Platform Admin | `#ffffff` (`bg-background`) | `#006AA7` (Swedish Blue) | `0.5rem` | 280px |
| Student Portal | `#F7F8FC` | `#684EFF` (violet) | `0.75rem` | 224px |
| Guardian Portal | `#ffffff` | `#4F46E5` (indigo) desktop / `#1055C9` mobile | `0.75rem` | 256px |
| Instructor Portal | `#FAFBFF` | `#684EFF` (violet) desktop / `#1055C9` mobile | `0.75rem` | 256px |
| Instructor App | `bg-gray-50` | `text-purple-600` (Tailwind) | mixed | N/A |
| Public Catalog | `bg-gray-50` | `text-blue-700` (Tailwind) | mixed | N/A |

**Finding:** 7 distinct primary color values. 4 distinct sidebar widths. 3 distinct background tones. Zero shared portal design tokens.

---

### 2. Navigation Inconsistencies

**Workspace Sidebar:**
- 5 nav sections (GENERELLT, BOKNINGSSYSTEM, RESURSER, EKONOMI, SYSTEMINSTÄLLNINGAR)
- 30+ individual navigation items visible at once
- GENERELLT section alone has 11 items — no visual hierarchy within sections
- Org name duplicated: shown in sidebar header AND in TopBar simultaneously
- No keyboard shortcut indicator for CommandPalette (⌘K exists but is undiscoverable)
- Section label caps: inconsistent tracking values across sections

**Portal Navigation — Mobile:**

| Portal | Pattern | Tab Count | FAB | Hamburger |
|---|---|---|---|---|
| Student Portal | Bottom 5-tab bar | 5 | No | No |
| Guardian Portal | Bottom 4-tab + raised progress pill | 5 total | Progress circle (center) | Yes (Meny tab) |
| Instructor Portal | Bottom 4-tab + raised Plus FAB | 5 total | Plus/Ny lektion (center) | Yes (Meny tab) |
| Instructor App | Bottom 5-tab bar | 5 | No | No |

Three different mobile nav patterns exist for functionally equivalent surfaces.

---

### 3. Typography System Gaps

No shared font scale is defined in the design system. Current usage across the codebase:

| Class | Usage context |
|---|---|
| `text-[9px]` | Notification badges |
| `text-[10px]` | Section labels, sub-labels, timestamps |
| `text-[11px]` | Secondary KPI labels |
| `text-xs` (12px) | Table cells, form hints |
| `text-sm` (14px) | Body text, nav items, form inputs |
| `text-base` (16px) | Rarely used directly |
| `text-xl` / `text-2xl` | Page headers (inconsistent choice) |

**Finding:** 8 size values in active use with no documented scale. `text-[9px]` and `text-[10px]` are bespoke values outside the Tailwind scale.

---

### 4. Component Consistency Gaps

**Cards:** Three patterns coexist:
1. shadcn `Card` from `@platform/ui` (workspace pages)
2. Bespoke `bg-white border border-gray-200 rounded-xl` (portals)
3. Bespoke `bg-white rounded-xl shadow-sm border border-gray-100` (public catalog)

**Badges/Status indicators:** Each module defines its own badge color map. No central `StatusBadge` component exists that maps entity status → display token.

**Loading screens (portals):** Student loads against `#684EFF` purple. Guardian and Instructor load against `#1055C9` blue. Same UX pattern, three different executions.

**Error screens:** All use a full-screen color fill + Shield icon, but with different brand colors and no consistent layout contract.

**Forms:** Mix of controlled `<input>` with shadcn `Input` wrapper and bare HTML inputs in portal pages. Label-input spacing is inconsistent.

---

### 5. Accessibility Gaps

- `aria-label` coverage is partial: TopBar bell and help buttons have labels; some portal nav items do not
- Focus ring: `ring-2 ring-primary ring-offset-2` defined in globals.css but not consistently applied to bespoke button elements in portals
- Color contrast: portal colors (`#684EFF` on white at small text sizes) are below WCAG AA threshold at 14px
- Touch target minimum: Some portal nav items are 36px × 36px; WCAG 2.5.5 recommends 44px × 44px
- No `prefers-reduced-motion` guard on any animation or transition
- Sidebar navigation has no `role="navigation"` on the `<aside>` element

---

### 6. Mobile Responsiveness Gaps

- Trafikskola Workspace: shifts to mobile at `md` (768px) breakpoint — correct
- Platform Admin: **no mobile layout exists** — sidebar is `hidden md:flex`, content area has no mobile fallback
- Public Catalog: responsive grid works, but no bottom nav or mobile-optimized header
- Portal breakpoint inconsistency: Student/Guardian/Instructor portals switch at `lg` (1024px); Instructor App has no desktop layout at all
- PageLayout `max-w-screen-2xl` is very wide; on mid-size screens (1024–1280px) content can feel sparse in narrow columns

---

## Design Language Definition

### Scandinavian SaaS Principles

1. **Function precedes form.** Every visual element earns its place by aiding comprehension or action.
2. **Whitespace is structure.** Breathing room between elements communicates hierarchy better than borders.
3. **Restrained palette.** One primary. One destructive. Semantic status colors only. No decorative gradients.
4. **Typography carries authority.** Weight and scale alone create hierarchy — color is the exception, not the rule.
5. **Consistency is trust.** Users moving between portals recognize the platform instantly.

### Unified Color Architecture

The modernized palette introduces a three-tier color system:

**Tier 1 — Platform Brand (shared across all surfaces):**
- `--platform-blue`: `#006AA7` (Swedish Blue — existing primary, retained)
- `--platform-blue-light`: `#E8F4FD` (tint for backgrounds, selected states)
- `--platform-blue-dark`: `#004D7A` (hover states, deep surfaces)

**Tier 2 — Portal Accent (per-portal identity, applied only to portal surfaces):**
- Student Portal: `--accent-student`: `#5B48E8` (violet — rationalized from current `#684EFF`)
- Guardian Portal: `--accent-guardian`: `#2D5BE3` (royal blue — rationalized from current dual `#4F46E5`/`#1055C9`)
- Instructor Portal: `--accent-instructor`: `#0F7E6B` (teal — differentiated from Student Portal)
- Public Catalog: `--accent-public`: `#006AA7` (platform blue — public surfaces use main brand)

**Tier 3 — Semantic (entity state and feedback — workspace-only):**
- Active/Open: `emerald-500`
- Warning/Pending: `amber-500`
- Error/Critical: `red-500`
- Info: `sky-500`
- Neutral/Inactive: `slate-400`

### Typography Scale

A 7-step scale replaces the current ad-hoc sizing:

| Token | Size | Weight | Usage |
|---|---|---|---|
| `type-label-xs` | 10px, uppercase, tracking-widest | 600 | Section headers, metadata chips |
| `type-label-sm` | 12px | 500 | Table headers, form labels, secondary nav |
| `type-body` | 14px | 400 | All body text, nav items, form values |
| `type-body-medium` | 14px | 500 | Emphasized body, badge text |
| `type-heading-sm` | 16px | 600 | Card titles, sheet headers |
| `type-heading-md` | 20px | 700 | Page titles |
| `type-heading-lg` | 24px | 700 | Dashboard section leads, portal greetings |

No values below 10px. No bespoke `text-[9px]`, `text-[11px]`, or `text-[13px]` values.

### Spacing & Radius System

- **Base unit:** 4px (Tailwind default — no change)
- **Component radius:** `rounded-lg` (8px) for interactive elements — unified across all portals
- **Card radius:** `rounded-xl` (12px) — unified across all portals
- **Overlay radius (modals, sheets):** `rounded-xl` top only on mobile, `rounded-xl` on desktop
- **Input radius:** `rounded-lg` (8px)
- **Avatar radius:** `rounded-full` (circles) or `rounded-xl` (square org avatars)

### Icon Standard

- **Library:** Lucide React (current — retained)
- **Size:** `w-4 h-4` for nav/inline; `w-5 h-5` for mobile nav tabs; `w-6 h-6` for FAB
- **Stroke:** `strokeWidth={1.75}` for portal icons (lighter, warmer); `strokeWidth={2}` for workspace icons (more authoritative)
- **Never** mix Lucide with other icon libraries on the same surface

---

## Work Packages

---

## WP-DS: Design System Foundation

**Priority:** P0 — Blocker for all other work packages

### Objective
Establish a single shared design token layer, a unified component base, and documented design contracts that all subsequent work packages implement against.

### Scope

**DS-1: Token consolidation in `globals.css`**
- Add portal accent color variables (`--accent-student`, `--accent-guardian`, `--accent-instructor`, `--accent-public`)
- Add typography scale variables (`--type-label-xs` through `--type-heading-lg`)
- Document all existing tokens with consistent naming
- Remove the `--sidebar-collapsed-width` variable (collapsed sidebar is not implemented and is not on the roadmap)
- Reconcile `--sidebar-width: 256px` vs the actual `w-[280px]` — choose one value and apply it

**DS-2: Component additions to `@platform/ui`**
- `StatusBadge` — single component mapping entity status string → color token + label. Replaces all per-module badge color maps
- `PortalCard` — shared card primitive for portal surfaces (white bg, `rounded-xl`, `border border-gray-100`, `shadow-sm`) replacing bespoke card divs in all portals
- `PortalErrorScreen` — standardized full-screen error layout accepting `accentColor`, `message`, and `actionLabel` props
- `PortalLoadingScreen` — standardized full-screen loading layout accepting `accentColor` prop
- `EmptyTableState` — unified empty state for DataTable (replaces per-module empty div patterns)
- `PageBreadcrumb` — standalone breadcrumb component (currently embedded in `PageHeader` but unusable in isolation)

**DS-3: Tailwind config additions**
- Add `type` scale as custom fontSize values
- Add portal accent colors to the color scale
- Add `motion-safe:` variant as the standard wrapper for all CSS transitions

**DS-4: Design token documentation**
- `docs/DESIGN_TOKENS.md` — a single reference listing every token, its value in light and dark mode, and what it is used for
- This document is updated as part of every subsequent work package

### Affected Files
- `apps/web/src/globals.css`
- `packages/ui/src/index.ts`
- `packages/ui/src/components/` (new components)
- `apps/web/tailwind.config.ts`
- `docs/DESIGN_TOKENS.md` (new)

### Dependencies
None — this is the foundation.

### Expected UX Improvements
- All subsequent work packages implement against a single source of truth
- Token changes (e.g., brand color update) propagate across the entire platform in one edit
- New developers have a documented reference instead of reading component files

---

## WP-NAV: Navigation & Shell

**Priority:** P1 — Depends on WP-DS

### Objective
Rationalize the Trafikskola Workspace navigation to reduce cognitive load, fix the sidebar structure, and eliminate redundancy between the sidebar and TopBar.

### Scope

**NAV-1: Sidebar reorganization**
Collapse 5 nav sections into 4, reduce total item count from 30+ to 22 visible items by default:

*Proposed structure:*

| Section | Items (max) |
|---|---|
| *(no section label)* | Översikt (pinned above first divider) |
| ELEVER & BOKNINGAR | Kunder, Leads, Bokningsschema, Mitt schema, Passöversikt, Väntelista, Klasslista |
| EKONOMI | Fakturor, Betalningar, Kassa, Paket, Ordrar |
| PERSONAL & RESURSER | Personal, LärarApp, Fordon & Platser |
| VERKTYG | Kampanjer, Kommunikation, Rapporter, Insikter, Inställningar |

Items that are rarely accessed (Passläggning, Slotmallar, Statistik, Dataimport, Trafikövningsplatser, Kursöversikt, Bevakningar, Uppgifter, Loggar, Företagskunder, Utbildningsplaner) move to contextual sub-navigation within their parent modules. They do not disappear — they are surfaced within the module, not in the global sidebar.

**NAV-2: TopBar cleanup**
- Remove org name text from TopBar (already in sidebar header — redundant)
- Keep: mobile hamburger, location picker, Kassa shortcut, dark mode toggle, notification bell, help menu, user menu
- Add: keyboard shortcut indicator `⌘K` as a small pill next to the location picker — makes CommandPalette discoverable
- Tighten TopBar height from 56px to 52px for more content area

**NAV-3: Sidebar header refinement**
- Increase org avatar area visibility: `w-10 h-10` (from `w-9 h-9`)
- Add subscription tier badge below org name (currently only shows for 'trialing' and 'past_due' — also show 'Professional' / 'Enterprise' tier for context)
- Add a tenant-switcher affordance (if user has access to multiple organizations): small ChevronDown next to org name

**NAV-4: Active state refinement**
- Current active state: `bg-sidebar-accent` — works, but the color (`222 47% 18%`) is only slightly lighter than the sidebar background
- New active state: left-border indicator (3px solid `--sidebar-primary`) + `bg-sidebar-accent` — provides clearer active position

**NAV-5: ⌘K CommandPalette enhancement**
- Current: mounted in AppShell but no visual affordance
- Add: keyboard shortcut display `⌘K` or `Ctrl+K` in TopBar search area
- Palette itself: add section dividers (Actions / Navigate / Recent) rather than a flat list

### Affected Files
- `apps/web/src/shared/components/layout/Sidebar/Sidebar.tsx`
- `apps/web/src/shared/components/layout/TopBar/TopBar.tsx`
- `apps/web/src/shared/components/layout/AppShell/AppShell.tsx`
- `apps/web/src/shared/components/CommandPalette/CommandPalette.tsx`

### Dependencies
WP-DS must be complete (uses new token names for active state).

### Expected UX Improvements
- Sidebar shows 22 items vs 30+: reduces scroll depth by ~40%
- Org name deduplication removes visual confusion
- ⌘K discoverability enables power users to navigate without mouse
- Active state left-border provides unambiguous current-location indicator

---

## WP-WORKSPACE: Trafikskola Workspace

**Priority:** P2 — Depends on WP-NAV

### Objective
Bring the Oversikt (dashboard) and all shared workspace page layouts to the modernized design language. Establish the visual contract for all operational module pages.

### Scope

**WS-1: Dashboard (Översikt) — Layout refinement**
- Implement a consistent 4-column grid on wide screens, 2-column on medium, 1-column on mobile
- Move the 4 quick-nav tabs (Kunder, Företagskunder, Mitt schema, Bokningsschema) from the Dashboard into a horizontal pill-link bar at the top of the page, styled as contextual shortcuts rather than page-level tabs
- KPI cards: standardize all to use the same `StatCard` component with consistent icon-box sizing, value typography (`type-heading-lg`), label typography (`type-label-xs`), and optional trend indicator
- Quick actions grid: standardize icon box to `w-11 h-11`, uniform card height, eliminate per-item bespoke color classes in favor of `variant` prop on shared `ActionCard` component
- Greeting banner: add date + day-of-week in `type-label-sm` below the greeting text (currently only the name/time greeting is shown)

**WS-2: PageLayout contract**
- `PageLayout` currently uses `max-w-screen-2xl` — constrain to `max-w-[1440px]` to prevent excessive line lengths on very wide monitors
- `PageHeader` title: change from `text-xl font-semibold` → `type-heading-md` (20px 700)
- Add `sticky` variant to `PageHeader` for use in dense data pages where the header should stay visible while the table scrolls

**WS-3: Module page consistency audit**
Apply the following to every module's list, detail, and form pages:

| Element | Current state | Modernized state |
|---|---|---|
| Page title | `text-xl font-semibold` | `type-heading-md` |
| Section headers within page | ad-hoc | `type-label-xs` uppercase with 1px divider below |
| Card titles | ad-hoc | `type-heading-sm` (16px 600) |
| Table cell text | ad-hoc | `type-body` (14px 400) |
| Empty states | per-module divs | `EmptyTableState` from WP-DS |
| Loading states | per-module skeleton | `TableSkeleton` / `CardSkeleton` from `@platform/ui` |
| Status badges | per-module color maps | `StatusBadge` from WP-DS |
| Primary action buttons | `Button` — various sizes | `Button size="sm"` as default for page-level actions |

**WS-4: Dark mode audit**
- Verify every workspace component renders correctly in dark mode
- Portal pages currently use hardcoded `bg-white`, `text-gray-900`, `border-gray-100` — these are correct for portals (intentionally light) but every workspace component must use CSS variable tokens exclusively
- Identify and fix any hardcoded hex colors inside workspace module files

### Affected Files
- `apps/web/src/modules/dashboard/routes/DashboardPage.tsx`
- `apps/web/src/shared/components/layout/PageLayout/PageLayout.tsx`
- All module list and detail pages (applied systematically in WP-OPS)

### Dependencies
WP-NAV (shell is stable before refining content layer).

### Expected UX Improvements
- Consistent information density across all module pages
- Dashboard reads as an operational command center, not a collection of ad-hoc cards
- Instructors and admins can internalize page layout pattern once, apply it everywhere

---

## WP-OPS: Operational Modules

**Priority:** P3 — Depends on WP-WORKSPACE

### Objective
Apply the WP-WORKSPACE design contract to every operational module in the Trafikskola Workspace. This is the largest work package by page count.

### Scope

The following modules receive the WP-WS-3 treatment (consistent page title, section headers, card titles, table cells, empty states, loading states, status badges, action buttons):

**OPS-1: Students & Customers module**
- `StudentListPage` — tab bar (Alla / Aktiva / Nya / Pausade / Arkiverade) → styled pill-tabs using `Tabs` from `@platform/ui`
- Filter panel: currently inline form → slide-in filter sheet pattern consistent with other modules
- `StudentDetailPage` — tab navigation for student sub-sections (Ekonomi, Bokningar, Dokument, Kontrakt) → `Tabs` component
- Student status badges → `StatusBadge`

**OPS-2: Scheduling module**
- `SchedulingCalendarPage` — FilterRow above calendar: apply standard `PageFilters` wrapper
- Instructor filter pills: standardize to `Badge` variant components
- `BookingListPage` / `WaitlistPage` — apply standard `DataTable` + `EmptyTableState`
- Slot status dots → `StatusBadge` dot variant
- `SlotDetailSheet` — apply `SheetHeader`, `SheetContent`, `SheetFooter` consistently

**OPS-3: Finance module**
- `FinanceOverviewPage` — apply KPI grid consistency from WP-WS-1
- `InvoiceListPage` — `DataTable` with consistent status badge column
- All finance sub-pages use `PageLayout` + `PageHeader` consistently
- Finance is the highest-complexity module — apply changes one sub-page at a time

**OPS-4: Communication module**
- `CommunicationHubPage` — apply consistent tab navigation
- Channel icons (`ChannelIcon`) → verify all channels are represented by Lucide icons (not bespoke SVG)
- Delivery log table → `DataTable` + `StatusBadge`

**OPS-5: Reports & Insights module**
- `RapporterPage` / `InsightsPage` — chart areas use SVG components (`SvgLineChart`, `SvgBarChart`)
- Audit SVG charts for responsive behavior; they must scale correctly at `md` and `sm` breakpoints
- Tab navigation in Insights (KpiTab, ElevtrendTab, CohortTab, RapporterTab) → `Tabs` component

**OPS-6: Staff, Resources, Settings modules**
- `InstructorListPage` — `DataTable` + `StatusBadge`
- `InstructorDetailPage` — same detail tab pattern as StudentDetailPage
- `SettingsPage` — settings sidebar (`SettingsSidebar`) applies consistent section label typography
- Settings sub-pages: consistent `PageHeader` + settings section card pattern

**OPS-7: Corporate, Leads, Enrollment, Orders, Packages, Campaigns**
- Newer modules (added in recent sprints) — verify each uses `PageLayout`, `PageHeader`, and `DataTable`
- Where bespoke table patterns exist, migrate to `DataTable`

### Affected Modules
All 16 operational modules in the Trafikskola Workspace.

### Dependencies
WP-WORKSPACE (design contract is defined before bulk application).

### Expected UX Improvements
- Staff recognize every list/detail/form page through the same visual grammar
- Onboarding new staff to the platform is faster when all pages behave identically
- Filter, sort, and pagination controls appear in the same position on every list page

---

## WP-STUDENT: Student Portal

**Priority:** P4 — Depends on WP-DS

### Objective
Modernize the Student Portal to a cohesive experience. Preserve the `#5B48E8` violet accent identity. Unify loading/error states, sidebar, and mobile bottom nav using shared patterns from WP-DS.

### Scope

**STUDENT-1: Shared layout components**
- Replace the inline `InvalidLinkScreen` function with `PortalErrorScreen` from WP-DS, passing `accentColor="var(--accent-student)"`
- Replace the inline `PortalLoadingScreen` function with the shared `PortalLoadingScreen` from WP-DS
- The full-screen error and loading states now share the same layout across all portals

**STUDENT-2: Desktop sidebar**
- Width: standardize to `w-64` (256px) — aligns with Guardian and Instructor portals
- Logo: replace the 4-color grid `AppLogo` with a cleaner implementation:  
  - School name in `type-heading-sm` weight  
  - `--accent-student` colored left border strip on the sidebar (4px solid, full height) to visually badge the portal
- Nav items: `rounded-lg` (from current `rounded-xl`) — aligns with design system token
- Active state: `background: var(--accent-student) / 12%` + `color: var(--accent-student)` — replaces inline style strings with CSS variable references
- User card at bottom: retain chevron → settings link pattern; update avatar gradient to use `--accent-student` as single color (remove the orange/red gradient)

**STUDENT-3: Mobile bottom nav**
- Retain 5-tab pattern (Hem, Resa, Boka, Meddelanden, Profil)
- Standardize tab icon size to `w-5 h-5`
- Boka (center): retain FAB pattern; apply `w-12 h-12 rounded-full bg-[var(--accent-student)]`
- Badge on Meddelanden: use `min-w-[20px] h-5` for legibility (from current `16px`)
- Apply `safe-area-inset-bottom` consistently

**STUDENT-4: Portal page layout**
- Desktop content area: `max-w-4xl mx-auto px-8 py-6` (from current `max-w-5xl px-8 py-6`)
- Mobile content area: `max-w-md mx-auto px-4 py-4` (from current `max-w-lg px-4 py-5`)
- Desktop top bar: retain greeting + "Boka lektion" CTA pattern; apply `type-heading-md` to greeting text
- Portal cards: use `PortalCard` from WP-DS throughout all portal pages

**STUDENT-5: Page-by-page polish**
Apply consistent `PortalCard`, typography scale, and status badges to:
- StudentPortalDashboard
- StudentPortalBokningarPage
- StudentPortalTeoriPage
- StudentPortalFramstegPage
- StudentPortalMeddelandenPage
- StudentPortalKontoPage / EkonomiPage
- StudentPortalDokumentPage
- StudentPortalKorkortsresaPage

### Affected Files
- `apps/web/src/modules/student-portal/routes/StudentPortalLayout.tsx`
- All `StudentPortal*Page.tsx` files

### Dependencies
WP-DS (shared PortalErrorScreen, PortalLoadingScreen, PortalCard).

### Expected UX Improvements
- Loading/error states consistent with all other portals
- Sidebar identity clear at a glance via accent color strip
- Mobile nav meets 44px touch target minimums
- Typography matches the documented scale throughout

---

## WP-GUARDIAN: Guardian Portal

**Priority:** P5 — Depends on WP-DS

### Objective
Unify the Guardian Portal's two conflicting brand colors (`#4F46E5` desktop vs `#1055C9` mobile) into one `--accent-guardian` value. Standardize the mobile nav and sidebar with WP-DS patterns.

### Scope

**GUARDIAN-1: Color unification**
- Replace `BRAND = '#1055C9'` and `DESKTOP_PRIMARY = '#4F46E5'` with a single `CSS_ACCENT = 'var(--accent-guardian)'`
- The single accent value `#2D5BE3` (royal blue, visually between the two current values) applies consistently to: sidebar active state, mobile nav active color, loading screen background, FAB button, inline CTAs

**GUARDIAN-2: Shared loading/error screens**
- Replace inline `InvalidLinkScreen` and `PortalLoadingScreen` with shared `PortalErrorScreen` and `PortalLoadingScreen` from WP-DS

**GUARDIAN-3: Desktop sidebar**
- Standardize width to `w-64` (256px — already correct)
- Add `--accent-guardian` left border strip (4px, full height) matching Student Portal pattern
- User card: apply `PortalCard` style (`bg-gray-50 rounded-lg border border-gray-100`)
- Nav items: `rounded-lg` (currently `rounded-xl`) — align with token
- Guardian-specific badge: remove hardcoded `badge: 2` from `NAV_ALL` — wire to real unread count or remove static decoration

**GUARDIAN-4: Mobile navigation**
- The center raised progress pill (CheckCircle2) is a unique and excellent pattern — **retain it**
- Standardize the 4 surrounding tabs to `min-w-[52px]` touch targets
- "Meny" hamburger: retain — it correctly opens the full nav drawer for less-used items
- Unify active color to `var(--accent-guardian)` from current hardcoded `text-blue-600`

**GUARDIAN-5: Demo banner**
- Retain the amber demo warning banner (important for preview sessions)
- Reduce height from current `py-1.5` implicit to explicit `h-8` to match the `isDemo` spacer already in place

**GUARDIAN-6: Page-by-page polish**
Apply `PortalCard`, typography scale to:
- GuardianPortalDashboard
- GuardianPortalSchemaPage
- GuardianPortalFramstegPage
- GuardianPortalEkonomiPage
- GuardianPortalBokningarPage
- GuardianPortalMeddelandenPage
- GuardianPortalDokumentPage
- GuardianPortalKorkortsresaPage
- GuardianPortalRiskutbildningPage
- GuardianPortalKontoPage

### Affected Files
- `apps/web/src/modules/guardian-portal/routes/GuardianPortalLayout.tsx`
- All `GuardianPortal*Page.tsx` files

### Dependencies
WP-DS.

### Expected UX Improvements
- Guardian's loading screen is no longer a different color to the app itself
- Desktop and mobile feel like the same product
- Touch targets meet 44px minimum
- Nav badge is either real-data or removed — no stale hardcoded counts

---

## WP-INSTRUCTOR: Instructor Portal & Instructor App

**Priority:** P6 — Depends on WP-DS

### Objective
Unify the Instructor Portal (token-authenticated external portal) and the Instructor App (internal admin-side mobile view for instructors) into one coherent instructor experience with a distinct teal identity.

### Scope

**INSTRUCTOR-1: Color system — differentiate from Student Portal**
- Current Instructor Portal: `#684EFF` (same violet as Student Portal) — **must change**
- Current Instructor App: `text-purple-600` (Tailwind) — no design token
- New: `--accent-instructor: #0F7E6B` (teal) — visually authoritative, distinct from student violet and guardian blue, appropriate for a professional context
- Apply to: sidebar active states, FAB button, mobile nav active color, loading screen, CTA buttons

**INSTRUCTOR-2: Shared loading/error screens**
- Replace inline `InvalidLinkScreen` and `PortalLoadingScreen` in `InstructorPortalLayout.tsx` with shared `PortalErrorScreen` and `PortalLoadingScreen` from WP-DS

**INSTRUCTOR-3: Portal sidebar**
- Standardize width to `w-64` (already correct)
- Replace hardcoded `background: '#FAFBFF'` with `bg-white border-r border-gray-100` to match Student and Guardian portal sidebar style
- Add `--accent-instructor` left border strip (4px, full height)
- Remove `style={{ background: PRIMARY }}` inline from active nav item — replace with CSS variable
- Help section card: use `PortalCard` from WP-DS

**INSTRUCTOR-4: Portal mobile bottom tab bar**
- Retain center FAB (Plus → Ny lektion) — excellent mobile-first pattern
- Active color: `var(--accent-instructor)` (teal) — replaces hardcoded `PRIMARY`
- "Meny" tab: retain for full nav drawer
- Touch target: pad items to `min-h-[52px]` for WCAG compliance

**INSTRUCTOR-5: Instructor App — layout consistency**
- InstructorApp is the only portal-type surface with no desktop layout
- **Decision: retain mobile-only.** InstructorApp is intentionally the on-mobile daily-use interface for instructors who are also workspace users. Document this design decision explicitly.
- Top bar: replace `bg-white dark:bg-gray-900` hardcoded string with CSS variables (`bg-background`)
- Active tab indicator: apply `--accent-instructor` (teal) replacing `text-purple-600`
- Bottom nav: `min-h-[60px]` items for touch target compliance
- Error state (`AlertCircle` full-screen): use `PortalErrorScreen` pattern for visual consistency

**INSTRUCTOR-6: Page-by-page polish**
Apply to Instructor Portal pages:
- InstructorPortalDashboard
- InstructorPortalSchemaPage
- InstructorPortalBokningarPage
- InstructorPortalElevPage
- InstructorPortalUtbildningskortPage
- InstructorPortalStatistikPage
- InstructorPortalInstallningarPage

Apply to Instructor App pages:
- InstructorAppIdagPage
- InstructorAppSchemaPage
- InstructorAppElevPage
- InstructorAppStatistikPage
- InstructorAppProfilPage

### Affected Files
- `apps/web/src/modules/instructor-portal/routes/InstructorPortalLayout.tsx`
- `apps/web/src/modules/instructor-app/routes/InstructorAppLayout.tsx`
- All `InstructorPortal*Page.tsx` and `InstructorApp*Page.tsx` files

### Dependencies
WP-DS.

### Expected UX Improvements
- Instructor Portal is visually distinct from Student Portal — instructors and students cannot confuse the surfaces
- Loading/error states consistent across all portals
- Touch targets meet WCAG 2.5.5

---

## WP-PLATFORM: Platform Admin

**Priority:** P7 — Depends on WP-NAV

### Objective
Elevate the Platform Admin workspace to match Trafikskola Workspace quality. Add mobile support. Unify the shell structure.

### Scope

**PLATFORM-1: Shell alignment**
- `PlatformShell` is structurally identical to `AppShell` — DRY opportunity
- Refactor both to use a shared `AdminShell` base that accepts `sidebar`, `topBar`, and `commandPalette` slot props
- This removes duplicated flex/overflow/min-h-screen structure

**PLATFORM-2: PlatformSidebar refinements**
- Add mobile sidebar: currently no `MobileSidebar` exists for platform admin — add one using the same `Sheet` pattern as the Trafikskola workspace `MobileSidebar`
- Footer identity section: replace the `User` icon with actual user initials (same pattern as workspace `UserMenu`)
- Platform admin badge: the `Platform Admin` subtitle uses `text-primary` — change to a dedicated amber or gold color (`--platform-admin-badge: #B45309`) to visually distinguish the platform context at a glance
- Section labels: `OPERATIONS` label is in English; standardize to `VERKSAMHET` (Swedish)

**PLATFORM-3: PlatformTopBar**
- `PlatformTopBar` should mirror workspace TopBar structure: height 52px, right-aligned controls
- Currently `PlatformTopBar` has minimal content — add: page title, notification bell (platform events), user menu (currently only in sidebar footer)

**PLATFORM-4: Mobile support**
- Platform Admin currently has no mobile layout — platform admins may access dashboards on mobile
- Implement the same mobile hamburger + slide-in drawer pattern as the workspace
- Platform pages are information-dense; on mobile they scroll vertically; the `DataTable` component is already responsive

**PLATFORM-5: Page-by-page polish**
Apply workspace design contract (WP-WS-3) to:
- PlatformDashboardPage — KPI cards already follow the right pattern; apply `type-heading-lg` to the KPI value
- PlatformOrganizationsPage — `DataTable` already in use; standardize badge column
- PlatformSubscriptionsPage
- PlatformAuditPage
- PlatformSecurityPage
- PlatformSupportPage
- PlatformAdminsPage
- PlatformRolesPage
- PlatformOrganizationDetailPage

### Affected Files
- `apps/web/src/modules/platform/components/PlatformShell.tsx`
- `apps/web/src/modules/platform/components/PlatformSidebar.tsx`
- `apps/web/src/modules/platform/components/PlatformTopBar.tsx`
- All `Platform*Page.tsx` files

### Dependencies
WP-NAV (workspace shell patterns are stable and can be shared).

### Expected UX Improvements
- Platform admins can access the dashboard on mobile
- The platform context is unmistakable (amber admin badge)
- Shell code is not duplicated between workspace and platform

---

## WP-PUBLIC: Public Catalog

**Priority:** P8 — Depends on WP-DS

### Objective
Give the Public Catalog a cohesive, marketing-quality presentation that represents the trafikskola brand while remaining a lightweight, SEO-friendly surface.

### Scope

**PUBLIC-1: Layout structure**
- Create a `PublicLayout` component (does not exist today — the catalog page is self-contained)
- `PublicLayout` renders: sticky header with org logo area, main content, footer with legal note
- This layout is reused by `PublicCatalogPage`, `PublicPackageDetailPage`, `CheckoutPage`, `ConfirmationPage`

**PUBLIC-2: Header**
- Current: `LayoutGrid` icon + org name in `text-blue-700`
- New: org name in `type-heading-sm` weight, black text. Optional org logo image (if supplied). Color accent uses `--accent-public` (platform blue)
- Add a simple breadcrumb: `[Org Name] / Paket & kurser` on detail pages

**PUBLIC-3: Package cards**
- Current `PackageCard` uses bespoke `bg-white border border-gray-200 rounded-xl` — replace background and border with `PortalCard` from WP-DS
- Campaign discount badge: standardize to `StatusBadge variant="campaign"` from WP-DS
- Price display: `type-heading-md` for primary price, `type-body` strikethrough for original price
- CTA button: `Button` from `@platform/ui` (currently a bespoke styled anchor)

**PUBLIC-4: Category filter pills**
- Current: hardcoded `bg-blue-600 text-white` for active
- New: `bg-[var(--accent-public)] text-white` for active; `bg-white border border-gray-200` for inactive — uses token

**PUBLIC-5: Checkout and confirmation pages**
- Apply `PublicLayout`
- Use `PortalCard` for form containers
- Form inputs: use `Input` and `Label` from `@platform/ui`
- Apply `type-body` and `type-heading-sm` scale throughout

**PUBLIC-6: Campaign banner (`CampaignBanner`)**
- Apply `PortalCard` base styling
- Standardize countdown timer typography to `type-heading-lg` (large) + `type-label-xs` (unit labels)

### Affected Files
- `apps/web/src/modules/public-catalog/routes/PublicCatalogPage.tsx`
- `apps/web/src/modules/public-catalog/routes/PublicPackageDetailPage.tsx`
- `apps/web/src/modules/public-catalog/routes/CheckoutPage.tsx`
- `apps/web/src/modules/public-catalog/routes/ConfirmationPage.tsx`
- `apps/web/src/modules/public-catalog/components/PackageCard.tsx`
- `apps/web/src/modules/public-catalog/components/CampaignBanner.tsx`
- New: `apps/web/src/modules/public-catalog/routes/PublicLayout.tsx`

### Dependencies
WP-DS.

### Expected UX Improvements
- Public catalog feels like it belongs to the same platform family
- Package cards are visually clean and conversion-focused
- Token-driven colors prevent drift over time

---

## WP-MA: Mobile & Accessibility

**Priority:** P9 — Final pass across all work packages

### Objective
Systematic audit and remediation of mobile responsiveness and accessibility across the complete platform, applied after all other work packages are complete.

### Scope

**MA-1: Touch target audit**
- Audit all interactive elements across all portals and workspaces
- Every clickable/tappable element must meet 44×44px minimum (WCAG 2.5.5)
- Document any exceptions (inline text links) and apply `min-h-[44px]` padding where needed

**MA-2: ARIA audit**
- All navigation `<aside>` elements: add `role="navigation"` and `aria-label` (e.g., `aria-label="Sidnavigation"`)
- All modal dialogs: verify `role="dialog"`, `aria-labelledby`, `aria-modal="true"`
- All Sheet components: verify accessible focus management (focus trap, return focus on close)
- All dropdown menus: verify `role="menu"` / `role="menuitem"` and keyboard navigation (Arrow keys, Escape)
- Status badges: verify they use `role="status"` or `aria-label` for non-visual clarity
- All icon-only buttons: verify `aria-label` present

**MA-3: Color contrast audit**
- Run all text/background combinations through WCAG AA contrast check (4.5:1 for body text, 3:1 for large text)
- Primary at-risk combinations:
  - `--accent-student` (`#5B48E8`) on `white` at 14px body text
  - `--accent-guardian` (`#2D5BE3`) on `white` at 14px
  - `text-muted-foreground` (`215 16% 47%` = approximately `#6B7280`) on `white`
  - All `text-[10px]` labels at their small size
- Where contrast fails, darken the foreground color or increase font size

**MA-4: Reduced motion**
- Wrap all CSS transitions and animations in `@media (prefers-reduced-motion: reduce)` or the Tailwind `motion-safe:` variant
- Affected: sidebar hover transitions, modal enter/exit animations, skeleton pulse, tab indicator sliding
- Loading spinners (`Loader2 animate-spin`): replace with a static progress indicator when reduced motion is preferred

**MA-5: Platform Admin mobile layout**
- Verify all Platform Admin pages are usable on a 390px viewport after WP-PLATFORM adds mobile support
- `DataTable` horizontal scroll on small screens: add `overflow-x-auto` wrapper if not already present

**MA-6: Keyboard navigation audit**
- Full keyboard-only walkthrough of:
  - Sidebar navigation (Tab through all items, Enter to navigate)
  - CommandPalette (⌘K open, Arrow keys to navigate, Enter to select, Escape to close)
  - All Sheet components (Escape to close)
  - All Dialog components (Escape to close, focus trap)
  - DataTable (Tab into table, Arrow keys through rows)
  - Form inputs in order (Tab order must be logical, top-to-bottom)

**MA-7: Font size floor**
- Remove all `text-[9px]` usage (below legible floor)
- Replace with `text-[10px]` or `text-xs` (12px) minimum
- Document the decision: **10px is the absolute minimum for non-decorative text**

**MA-8: Form accessibility**
- All form inputs must have associated `<Label>` with correct `htmlFor`
- Required fields: add `aria-required="true"` and visual indicator (asterisk with `aria-hidden`)
- Error messages: use `aria-describedby` linking input to its error message element
- Autocomplete attributes: `autocomplete="given-name"`, `autocomplete="family-name"`, `autocomplete="email"`, `autocomplete="tel"` on the appropriate fields

### Affected Scope
All files across all portals and workspaces. This is a platform-wide audit pass.

### Dependencies
All other work packages (MA audits the final state).

### Expected UX Improvements
- WCAG 2.1 AA compliance across the platform
- Screen reader users can navigate the full platform
- Users with motor impairments can operate all controls by keyboard
- Users with vestibular disorders are not affected by animations
- Every student, guardian, and instructor using assistive technology gets the same experience

---

## Implementation Sequence

```
WP-DS  ──────────────────────────────────────────────────────────────► [Foundation complete]
         ↓                         ↓                 ↓          ↓
       WP-NAV              WP-STUDENT        WP-GUARDIAN   WP-INSTRUCTOR
         ↓                         └─────────────────┴──────────┘
       WP-WORKSPACE                               ↓
         ↓                                  WP-PUBLIC
       WP-OPS
         ↓
       WP-PLATFORM
         ↓
       WP-MA (final audit pass)
```

**Parallel execution opportunities:**
- WP-STUDENT, WP-GUARDIAN, WP-INSTRUCTOR, WP-PUBLIC can all run in parallel after WP-DS completes
- WP-PLATFORM can begin in parallel with WP-OPS (after WP-NAV completes)
- WP-MA begins only after all other packages are merged

---

## Priority Matrix

| Work Package | Priority | Effort | Impact | Risk |
|---|---|---|---|---|
| WP-DS: Design System | P0 | Medium | Very High | Low |
| WP-NAV: Navigation | P1 | Small | High | Low |
| WP-WORKSPACE: Dashboard | P2 | Medium | High | Low |
| WP-OPS: Operational Modules | P3 | Large | High | Medium |
| WP-STUDENT: Student Portal | P4 | Medium | High | Low |
| WP-GUARDIAN: Guardian Portal | P5 | Small | Medium | Low |
| WP-INSTRUCTOR: Instructor Portals | P6 | Medium | High | Low |
| WP-PLATFORM: Platform Admin | P7 | Medium | Medium | Low |
| WP-PUBLIC: Public Catalog | P8 | Small | Medium | Low |
| WP-MA: Mobile & Accessibility | P9 | Medium | High | Low |

---

## What This Roadmap Does NOT Do

This modernization roadmap explicitly excludes:

- Changes to any business logic, workflow, or operational behavior
- Changes to any Edge Function or database design
- Introduction of new features or modules
- Changes to routing structure or URL paths
- Changes to authentication or authorization behavior
- Changes to the data model or API contracts
- Changes to the Swedish accounting compliance layer
- Removal of any existing functionality
- Modification of any migration files
- Changes to the `@platform/types`, `@platform/utils`, `@platform/validation`, or `@platform/api-core` packages

---

## Quality Gates

Each work package must satisfy the following before merge:

1. **TypeScript:** `pnpm typecheck` — 0 errors across all 8 packages
2. **Lint:** `pnpm lint` — 0 errors (warnings acceptable)
3. **Build:** `pnpm build` — passes without error
4. **Visual parity:** All existing functionality visible and operational
5. **Dark mode:** All modified components tested in both light and dark mode
6. **Mobile:** All modified pages tested at 390px (iPhone 14) and 768px (tablet) viewport widths
7. **Accessibility:** New/modified interactive elements have correct ARIA labels

---

*This document is the authoritative UI Modernization Roadmap for TrafikskolaOS Baseline v1. All UI implementation work on branch `ui/modernization-v2` must reference this document. Changes to scope require an updated version of this document before implementation begins.*
