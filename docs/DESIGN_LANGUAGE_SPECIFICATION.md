# TrafikskolaOS — Design Language Specification

**Version:** 1.0  
**Date:** 2026-06-30  
**Status:** OFFICIAL — Governs all UI implementation from this point forward  
**Branch:** ui/modernization-v2  
**Authors:** Chief Product Designer · Design System Architect · UX Director · Scandinavian Design Lead

---

## Preamble

This document is the single source of truth for all visual and interaction decisions in TrafikskolaOS. Every developer, designer, and contributor must follow this specification when building, modifying, or reviewing any UI surface. Deviations require explicit approval and a specification amendment.

This specification does not describe what was built. It defines what must be built going forward.

---

## Part 1 — Design Philosophy

### 1.1 Visual Identity

TrafikskolaOS is a professional SaaS platform serving Swedish driving schools. Its visual identity must communicate the same qualities a well-run Swedish institution communicates: calm competence, structural clarity, and understated confidence.

The design direction is:

> **Clean authority.** A Scandinavian SaaS aesthetic — generous whitespace, restrained color, crisp typography, purposeful density. Operationally serious. Visually calm. Consistently branded.

This means:

**Scandinavian Simplicity**  
Every element on screen must earn its place. If removing an element makes the interface clearer, remove it. Decoration is not a design goal. Negative space is structure.

**Professional SaaS**  
This is a business tool. Users are professionals managing businesses, students, and legal compliance. The interface must look like it belongs in that context — not a consumer app, not a startup side project.

**Swedish Business Culture**  
Sweden values precision, trust, and efficiency. The interface must feel like a reliable colleague: predictable in behavior, honest in communication, never dramatic. Swedish terminology is used throughout. Swedish compliance requirements are visible and legible.

**Trust**  
Color is used conservatively. Blue communicates authority. Status colors (amber, red, green) are used only when they carry information. Never use color as decoration.

**Calmness**  
No aggressive animations. No busy backgrounds. No attention-competing elements. The user's data is the focal point.

**Operational Efficiency**  
The platform is used during a working day, repeatedly, across long sessions. Every interaction must feel fast and low-effort. Fewer clicks. Predictable layouts. No surprises.

**Premium Quality**  
Precise spacing. Consistent visual rhythm. Type that reads well at working distances. An interface that feels considered and polished — not over-designed, but exactly designed.

### 1.2 Design Personality Spectrum

```
Consumer App ←——————————————→ Enterprise SaaS
Playful     ←——————————————→ Serious
Colorful    ←——————————————→ Restrained
Complex     ←——————————————→ Simple
Dense       ←——————————————→ Breathing room

TrafikskolaOS sits here:          ▲
                          ────────┘
                          Slightly right of center — professional,
                          restrained, purposeful. Not cold. Not plain.
```

---

## Part 2 — User Personas

### 2.1 Platform Administrator

**Who:** The SaaS platform owner. Has access to all tenant organizations.

**Primary Goals:**
- Monitor platform health and tenant activity
- Onboard and manage driving school organizations
- Manage subscriptions and billing lifecycle
- Investigate support escalations

**Primary Workflows:** Organization list → detail → configuration; user impersonation; subscription management

**Information Density:** High. Platform admins are technical operators who want data density, not hand-holding.

**Interaction Patterns:** Data tables with filters, drill-down navigation, bulk actions, confirmation dialogs for destructive ops

**Device Split:** 95% desktop

**UX Priorities:**
1. Data visibility at a glance
2. Fast navigation between organizations
3. Confidence-building confirmation flows for sensitive actions
4. Clear visual separation between platform scope and tenant scope

### 2.2 Driving School Administrator (Trafikskola Admin)

**Who:** The owner or operations manager of a trafikskola. Primary daily user of the workspace.

**Primary Goals:**
- Manage the school's schedule, students, and instructors
- Monitor financial performance
- Handle customer inquiries and bookings
- Generate compliance reports

**Primary Workflows:** Dashboard → scheduling → student management → finance → reports

**Information Density:** Medium-high. Needs KPIs visible without hunting, and can handle a data table when needed.

**Interaction Patterns:** Dashboard scanning, list-to-detail navigation, form-based workflows, sheet/drawer for secondary actions

**Device Split:** 70% desktop, 30% tablet/mobile

**UX Priorities:**
1. Dashboard glanceability (KPIs at top)
2. Fast scheduling operations (minimum clicks per booking)
3. Finance overview without accounting expertise
4. Print/export for compliance

### 2.3 Instructor

**Who:** A driving instructor. May use either the Trafikskola Workspace or the dedicated Instructor Portal/App.

**Primary Goals:**
- View and manage their personal schedule
- Record lesson attendance and notes
- Review student progress
- Communicate with students and admin

**Primary Workflows:** Schedule view → lesson detail → attendance/note → next lesson

**Information Density:** Low-medium. Instructors are mobile, often checking quickly between lessons.

**Interaction Patterns:** Calendar-first, tap-and-confirm, minimal form entry, large touch targets

**Device Split:** 60% mobile, 40% desktop

**UX Priorities:**
1. Today's schedule at a glance
2. One-tap attendance marking
3. Student status quickly accessible
4. Offline tolerance (not required now, but layout should not fight it)

### 2.4 Student

**Who:** A learner at a trafikskola. Uses the Student Portal.

**Primary Goals:**
- Book driving lessons
- Track their own learning progress
- Communicate with their school
- View payment history

**Primary Workflows:** Boka lektion → confirm → view upcoming → messaging

**Information Density:** Low. Students are consumers, not power users. Clarity over density.

**Interaction Patterns:** Card-based browsing, bottom sheet confirmations, step-by-step booking flow, friendly status states

**Device Split:** 80% mobile, 20% desktop

**UX Priorities:**
1. Lesson booking is frictionless
2. Progress feels motivating, not bureaucratic
3. Messaging is easy to find
4. Errors are clearly explained in Swedish

### 2.5 Guardian

**Who:** A parent or legal guardian monitoring a student's progress.

**Primary Goals:**
- Track their child's learning progress
- View booked lessons
- Review payment summaries
- Contact the school

**Primary Workflows:** Dashboard → progress view → booking history → messaging

**Information Density:** Low. Guardians are secondary users. Simplicity is paramount.

**Interaction Patterns:** Read-heavy browsing, minimal data entry, notification-driven returns

**Device Split:** 70% mobile, 30% desktop

**UX Priorities:**
1. Progress is clearly communicated
2. Nothing requires explanation
3. Contact/support is always findable
4. No accidental actions

### 2.6 Public Visitor

**Who:** A prospective student or parent researching a driving school.

**Primary Goals:**
- Understand what courses and packages are available
- See pricing
- Contact the school or begin enrollment

**Primary Workflows:** Package list → package detail → contact/enroll CTA

**Information Density:** Low. This is a marketing surface. Clarity and conversion over comprehensiveness.

**Interaction Patterns:** Browsing, comparison, single CTA per package

**Device Split:** 60% mobile, 40% desktop

**UX Priorities:**
1. Packages are easy to compare
2. Pricing is unambiguous
3. CTA is always visible
4. School branding is prominent

---

## Part 3 — Design Principles

### P1 — Function Before Form

Every UI decision starts with a functional question: what is the user trying to accomplish? Visual treatment follows the answer to that question. Never add visual complexity for aesthetic reasons alone.

*Implication: Do not add gradients, shadows, or decorative elements unless they carry functional meaning (e.g., elevation indicating interactivity).*

### P2 — Consistency Over Creativity

A new design pattern costs the user cognitive effort. Use existing patterns from this specification. Introduce new patterns only when the existing vocabulary genuinely fails the use case — and document the new pattern when you do.

*Implication: Never invent a new card design, new button variant, or new navigation pattern without updating this spec.*

### P3 — Progressive Disclosure

Show what the user needs now. Reveal additional detail on demand. Never show all available information simultaneously.

*Implication: Secondary actions belong in `...` menus or drawers. Detail pages carry detail. List pages carry summaries.*

### P4 — Minimal Cognitive Load

The user should never need to figure out what a screen is for. Labels are explicit. Empty states explain what goes there. Error messages tell the user what to do next.

*Implication: Every empty state has an action. Every error message has a resolution path.*

### P5 — Predictable Behavior

The same interaction must produce the same result everywhere. Primary button is always on the right. Destructive actions always require confirmation. Cancel is always available. The sidebar always behaves the same way.

*Implication: Never override global interaction conventions in a module-specific component.*

### P6 — Accessibility as Foundation

Accessibility is not a post-implementation audit. It is a design constraint from the first line of code. WCAG 2.1 AA is the floor. Every interactive element must be keyboard-navigable and screen-reader labeled.

*Implication: If a component cannot be built to AA standards, the component design must change.*

### P7 — Mobile-First Where Appropriate, Desktop-Productive Where Required

The Student, Guardian, and Instructor portals are mobile-first surfaces. The Workspace and Platform Admin are desktop-primary productivity surfaces. Design decisions must serve the actual device split of each surface, not apply a single ruleset across all surfaces.

*Implication: Do not sacrifice workspace data density for mobile breakpoints; do not sacrifice portal touch targets for desktop efficiency.*

### P8 — Whitespace as Structure

Spacing is not empty. Generous whitespace groups related elements and separates unrelated ones. The spacing system in this specification is not negotiable.

*Implication: Do not tighten spacing to fit more on screen. Restructure the information instead.*

### P9 — Swedish-First Language

All UI copy is in Swedish unless a field is specifically an international value (e.g., ISO currency codes, country codes). Professional Swedish is used — not formal bureaucratic Swedish, not informal colloquial Swedish.

*Implication: Avoid English UI strings in any surface a Swedish end-user will see.*

---

## Part 4 — Color System

### 4.1 Brand Colors

The brand palette consists of two anchors: Swedish Blue for authority and action, and a neutral-dark for text and structural elements.

| Token | HSL | Hex | Usage |
|---|---|---|---|
| `--primary` | `207 100% 33%` | `#006AA7` | Primary actions, links, focus rings, active nav |
| `--primary-foreground` | `210 40% 98%` | `#F8FAFF` | Text on primary backgrounds |
| `--foreground` | `222 47% 11%` | `#141E2E` | All body text, headings, labels |

Swedish Blue (`#006AA7`) is the single brand color. It is used for primary interactive elements. It is not used decoratively.

### 4.2 Workspace Surface Hierarchy

The Trafikskola Workspace and Platform Admin use a light-surface hierarchy.

| Token | HSL | Hex | Usage |
|---|---|---|---|
| `--background` | `0 0% 100%` | `#FFFFFF` | Page background |
| `--card` | `0 0% 100%` | `#FFFFFF` | Card surface |
| `--secondary` | `210 40% 96%` | `#EEF4FB` | Secondary button fill, chip backgrounds |
| `--muted` | `210 40% 96%` | `#EEF4FB` | Table alternating rows (when used), muted fills |
| `--muted-foreground` | `215 16% 47%` | `#68778D` | Placeholder text, secondary labels, hints |
| `--border` | `214 32% 91%` | `#DDE5F0` | Card borders, input borders, table rules |
| `--input` | `214 32% 91%` | `#DDE5F0` | Input field borders |

### 4.3 Sidebar Colors

The workspace sidebar uses a dark navy surface to visually separate navigation from content.

| Token | HSL | Hex | Usage |
|---|---|---|---|
| `--sidebar-background` | `222 47% 11%` | `#0F1929` | Sidebar fill |
| `--sidebar-foreground` | `215 20% 75%` | `#AEBACE` | Inactive nav item text and icons |
| `--sidebar-primary` | `207 100% 45%` | `#0090E5` | Active nav item text and icon (brighter on dark bg) |
| `--sidebar-accent` | `222 47% 18%` | `#1C2D47` | Active nav item background, hover state |
| `--sidebar-accent-foreground` | `0 0% 100%` | `#FFFFFF` | Text/icon on active sidebar item |
| `--sidebar-border` | `222 47% 18%` | `#1C2D47` | Section dividers inside sidebar |

### 4.4 Portal Accent Colors

Each portal has a single accent color that defines its identity. There must be exactly one accent color per portal. No portal may use two brand colors simultaneously.

| Portal | Token | Hex | Rationale |
|---|---|---|---|
| Trafikskola Workspace | `--accent-workspace: var(--primary)` | `#006AA7` | Swedish Blue = institutional authority |
| Platform Admin | `--accent-platform: #B45309` | `#B45309` | Amber/gold = administrative authority, distinct from tenant blue |
| Student Portal | `--accent-student: #684EFF` | `#684EFF` | Violet = youthful energy, approachable |
| Guardian Portal | `--accent-guardian: #2D5BE3` | `#2D5BE3` | Deep blue = parental trust, calmer than student violet |
| Instructor Portal | `--accent-instructor: #0F7E6B` | `#0F7E6B` | Teal = professional, distinct from student violet |
| Public Catalog | `--accent-public: var(--primary)` | `#006AA7` | Swedish Blue = school brand authority |

**Critical rules:**
- Student Portal and Instructor Portal must never use the same accent color.
- Loading screens, error screens, and active nav states within a portal must all use the same accent token — never a mix.
- Hardcoded hex values in portal components are forbidden. Use the CSS variable.

### 4.5 Semantic Colors

Semantic colors carry meaning. They are not used for decoration.

| Intent | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| **Success** | `#16A34A` | `#22C55E` | Confirmed status, passed states, completed actions |
| **Warning** | `#D97706` | `#F59E0B` | Pending, attention required, near-expiry |
| **Destructive** | `hsl(0 84% 60%)` | `hsl(0 63% 51%)` | Errors, deleted state, cancel destructive |
| **Info** | `hsl(var(--primary))` | `hsl(var(--primary))` | Informational, neutral notices |
| **Neutral** | `hsl(var(--muted-foreground))` | `hsl(var(--muted-foreground))` | Inactive, archived, draft |

**Rules:**
- Green is only used for confirmed/active/success states.
- Amber is only used for pending/warning/near-expiry states.
- Red is only used for destructive actions, errors, and definitively failed states.
- Never use red for "inactive" or amber for "deleted" — semantic color must match semantic meaning.

### 4.6 Interactive States

Every interactive element must have distinct visual states for all interaction modes.

| State | Treatment |
|---|---|
| **Default** | Standard surface and border colors |
| **Hover** | Background shifts by ~4% lightness; cursor changes |
| **Active/Pressed** | Background shifts by ~8% lightness |
| **Focus** | `ring-2 ring-primary ring-offset-2` — 2px ring in Swedish Blue |
| **Selected** | `bg-sidebar-accent` / `bg-secondary` depending on surface; left border 3px primary |
| **Disabled** | `opacity-50 cursor-not-allowed pointer-events-none` |
| **Loading** | Skeleton shimmer replacing content; button shows spinner, keeps dimensions |

### 4.7 Dark Mode Palette

Dark mode is fully supported in the Workspace and Platform Admin. Portals may optionally support dark mode in a later phase.

| Token | Light | Dark |
|---|---|---|
| `--background` | `0 0% 100%` | `222 47% 6%` |
| `--card` | `0 0% 100%` | `222 47% 8%` |
| `--foreground` | `222 47% 11%` | `210 40% 98%` |
| `--muted` | `210 40% 96%` | `217 33% 17%` |
| `--muted-foreground` | `215 16% 47%` | `215 20% 65%` |
| `--border` | `214 32% 91%` | `217 33% 17%` |
| `--primary` | `207 100% 33%` | `207 100% 50%` |
| `--sidebar-background` | `222 47% 11%` | `222 47% 4%` |
| `--sidebar-accent` | `222 47% 18%` | `222 47% 10%` |

Dark mode tokens must maintain WCAG AA contrast ratios (minimum 4.5:1 for body text, 3:1 for large text and UI components).

### 4.8 Color Usage Rules

1. **Never introduce a color not defined in this specification** without a specification amendment.
2. **Never hardcode a hex value** in a component. Use CSS variables or Tailwind tokens that map to CSS variables.
3. **Never use `text-blue-*`, `text-purple-*`, or other Tailwind color utilities** for branded colors. These bypass the token system.
4. **Never use a semantic color for decoration.** Red means error. Green means success. Using green for a decorative tag is forbidden.
5. **Primary blue is for interactive elements.** It is not a highlight color for sections or headings.
6. **Portal accent colors may only be used within their portal.** `--accent-student` must never appear in the workspace or admin surfaces.

---

## Part 5 — Typography

### 5.1 Font Family

```
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

Inter is the sole typeface. No additional typefaces are permitted without a specification amendment. Font is loaded via the page HTML — not via CSS `@import` which blocks rendering.

Font feature settings applied globally:
```css
font-feature-settings: 'rlig' 1, 'calt' 1;
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

### 5.2 Font Weights

| Weight | Class | Usage |
|---|---|---|
| 400 (Regular) | `font-normal` | Body text, table cells, form values |
| 500 (Medium) | `font-medium` | Labels, nav items, secondary headings |
| 600 (Semibold) | `font-semibold` | Page titles, card headings, emphasis |
| 700 (Bold) | `font-bold` | KPI values, active states, critical labels |

No other weights are used.

### 5.3 Type Scale

This is the canonical type scale. Size classes outside this list are forbidden. `text-[9px]` and `text-[10px]` bespoke values must be eliminated from all surfaces.

| Step | Size | Class | Line Height | Usage |
|---|---|---|---|---|
| `--text-2xs` | 11px | `text-[11px]` | `leading-none` | Badge labels, notification counts (floor size) |
| `--text-xs` | 12px | `text-xs` | `leading-4` | Section labels (caps), table secondary info, timestamps, hints |
| `--text-sm` | 14px | `text-sm` | `leading-5` | Body text, nav items, form inputs, table cells, form labels |
| `--text-base` | 16px | `text-base` | `leading-6` | Card intros, dialog body text |
| `--text-lg` | 18px | `text-lg` | `leading-7` | Section headings within a page |
| `--text-xl` | 20px | `text-xl` | `leading-7` | Page title (PageHeader) |
| `--text-2xl` | 24px | `text-2xl` | `leading-8` | Dashboard KPI primary value |
| `--text-3xl` | 30px | `text-3xl` | `leading-9` | Hero KPI, prominent metric |

**11px is the absolute minimum.** No text on any surface may be smaller than 11px.

### 5.4 Heading Hierarchy

| Level | Class | Weight | Usage |
|---|---|---|---|
| Page Title (H1) | `text-xl font-semibold tracking-tight` | Semibold | One per page; rendered by `PageHeader` |
| Section Heading (H2) | `text-lg font-semibold` | Semibold | Within a page section |
| Card Heading (H3) | `text-sm font-semibold` | Semibold | Card header, table label |
| Group Label | `text-xs font-semibold uppercase tracking-widest text-muted-foreground` | Semibold | Sidebar section labels, nav group headers |

### 5.5 Body and UI Text

| Role | Class | Weight |
|---|---|---|
| Body text | `text-sm text-foreground` | Regular |
| Secondary / helper | `text-sm text-muted-foreground` | Regular |
| Form label | `text-sm font-medium text-foreground` | Medium |
| Form hint | `text-xs text-muted-foreground` | Regular |
| Table cell (primary) | `text-sm text-foreground` | Regular |
| Table cell (secondary) | `text-xs text-muted-foreground` | Regular |
| Button text | `text-sm font-medium` | Medium |
| Nav item | `text-sm font-medium` | Medium |

### 5.6 KPI and Data Display

| Role | Class | Weight |
|---|---|---|
| KPI primary value | `text-2xl font-bold tracking-tight` | Bold |
| KPI secondary metric | `text-lg font-semibold` | Semibold |
| KPI label | `text-xs font-medium text-muted-foreground uppercase tracking-wide` | Medium |
| KPI trend | `text-xs font-medium` | Medium |

### 5.7 Letter Spacing Rules

| Context | Class |
|---|---|
| Page titles, KPI values | `tracking-tight` |
| Normal body | (none — browser default) |
| Section group labels | `tracking-widest` |
| KPI labels (uppercase) | `tracking-wide` |

---

## Part 6 — Spacing System

The platform uses a 4px base unit. All spacing values are multiples of 4.

### 6.1 Spacing Scale Reference

| Token | px | Tailwind | Usage |
|---|---|---|---|
| space-1 | 4px | `p-1 / gap-1` | Icon internal padding, tight labels |
| space-2 | 8px | `p-2 / gap-2` | Inline element gaps, compact badge padding |
| space-3 | 12px | `p-3 / gap-3` | Small button padding, list item padding |
| space-4 | 16px | `p-4 / gap-4` | Card padding (compact), form field gaps |
| space-5 | 20px | `p-5 / gap-5` | Page section vertical gaps |
| space-6 | 24px | `p-6 / gap-6` | Card padding (standard), dialog padding |
| space-8 | 32px | `p-8 / gap-8` | Section separation, large form blocks |
| space-10 | 40px | `p-10` | Dashboard section breathing room |
| space-12 | 48px | `p-12` | Hero areas, onboarding |

### 6.2 Layout Dimensions

| Variable | Value | Notes |
|---|---|---|
| `--sidebar-width` | `280px` | Workspace and Platform Admin sidebar (fix CSS var to match actual) |
| `--sidebar-collapsed-width` | `64px` | Collapsed sidebar (future) |
| `--topbar-height` | `52px` | Reduced from 56px during WP-NAV |
| Page max-width | `max-w-screen-2xl` | Applied by `PageLayout` |
| Card padding (default) | `p-6` | Standard content cards |
| Card padding (compact) | `p-4` | Stat cards, compact panels |
| Section gap | `space-y-5` | Between page sections |
| Form field gap | `space-y-4` | Between labeled form inputs |
| Table cell padding | `px-4 py-3` | Standard table rows |
| Table cell padding (compact) | `px-3 py-2` | Dense data tables |

### 6.3 Grid System

**Workspace page grid:**
```
PageLayout → max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8
  └── PageSection → space-y-5
      └── Content grid (context-dependent)
```

**Dashboard KPI grid:**
```
grid grid-cols-2 md:grid-cols-4 gap-4
```

**Module list/detail split (wide screens):**
```
grid grid-cols-1 lg:grid-cols-3 gap-6
(list takes col-span-1, detail takes col-span-2)
```

**Form layout:**
```
Single column on mobile
Two-column grid on md+ for horizontal form groups
max-w-2xl for standalone forms
```

### 6.4 Sidebar Spacing

| Element | Value |
|---|---|
| Org block (top) | `p-4` |
| Section label | `px-3 pt-4 pb-1` |
| Nav item | `px-2.5 py-2 mx-2` |
| Nav icon gap | `gap-3` |
| Bottom area padding | `p-3` |

---

## Part 7 — Component Language

### 7.1 Buttons

Four variants, two sizes, one behavior contract.

**Variants:**

| Variant | When to use |
|---|---|
| `default` (Primary) | The single main action on a page or dialog |
| `secondary` | Alternative or supporting action |
| `outline` | Tertiary action; requires less visual weight than secondary |
| `destructive` | Irreversible delete, cancel subscription, void invoice |
| `ghost` | Navigation, icon-only buttons, low-emphasis actions in lists |
| `link` | Inline contextual navigation |

**Sizes:**

| Size | Class | Usage |
|---|---|---|
| `default` | `h-9 px-4 text-sm` | Standard forms and dialogs |
| `sm` | `h-8 px-3 text-xs` | Table row actions, compact toolbars |
| `lg` | `h-11 px-8 text-sm` | Primary CTA on portals and public pages |
| `icon` | `h-9 w-9` | Icon-only buttons (requires `aria-label`) |

**Rules:**
1. One primary button per view context (page, dialog, sheet).
2. Primary button is positioned right. Cancel/secondary is left.
3. Destructive actions always show a confirmation dialog before executing.
4. A loading button retains its dimensions and shows a spinner.
5. Disabled buttons use `opacity-50 cursor-not-allowed`.
6. Never create a custom button variant using raw `<div>` or `<span>` clickable elements.

### 7.2 Cards

All cards use the `Card` component from `@platform/ui`. Bespoke card markup (`bg-white rounded-xl border border-gray-200`) is forbidden.

**Card anatomy:**
```
Card
  CardHeader (optional)
    CardTitle
    CardDescription
  CardContent
  CardFooter (optional)
```

**Card variants:**

| Context | Padding | Border | Shadow |
|---|---|---|---|
| Standard content card | `p-6` | `border border-border` | None |
| KPI stat card | `p-4` | `border border-border` | None |
| Highlighted / selected | `p-6` | `border-2 border-primary` | None |
| Portal card | `p-5` | `border border-border` | `shadow-sm` |

Cards do not use drop shadows in the workspace. Light shadow (`shadow-sm`) is permitted on portal surfaces only.

### 7.3 Data Tables

Tables are the primary data presentation layer in the workspace. They must be consistent across all modules.

**Structure:**
```
PageFilters (search + filter chips above table)
DataTable
  TableHeader (sticky on scroll)
  TableBody (rows)
  TableFooter (pagination)
```

**Column standards:**
- First column: primary identifier, left-aligned, `font-medium`
- ID/code columns: monospace (`font-mono text-xs`)
- Date columns: right-aligned, `text-xs`
- Amount columns: right-aligned, `tabular-nums`
- Status columns: center-aligned badge
- Actions column: right-aligned, `...` menu via `DropdownMenu`

**Pagination:**
- Default page size: 25 rows (never 100)
- Show: `{start}–{end} av {total}`
- Previous / Next buttons

**Empty state:**
```
EmptyTableState component (from @platform/ui)
Icon + heading + description + optional CTA
```

### 7.4 Forms

**Input field anatomy:**
```
<div class="space-y-2">
  <Label htmlFor="...">Fältnamn</Label>
  <Input id="..." ... />
  <p class="text-xs text-muted-foreground">Hjälptext om nödvändig</p>
</div>
```

All form fields use `@platform/ui` components: `Input`, `Textarea`, `Select`, `Switch`, `Label`.

**Form layout rules:**
1. Single-column layout on mobile and in drawers/sheets.
2. Two-column layout available on desktop for wide forms.
3. `max-w-2xl` container for standalone form pages.
4. Section headings (`text-sm font-semibold`) may be used to group related fields.
5. Required indicator: asterisk `*` in `text-destructive` appended to label.
6. Validation errors appear below the field in `text-xs text-destructive`.
7. Form buttons appear at the bottom of the form, right-aligned.

### 7.5 Dialogs

Dialogs are for focused, blocking decisions. They interrupt the user's flow and should be used sparingly.

**When to use a Dialog:**
- Confirming destructive actions
- Simple 1–2 field quick-entry forms
- Critical alerts that require acknowledgment

**When to use a Sheet/Drawer instead:**
- Complex forms (3+ fields)
- Detail panels
- Edit flows

**Dialog anatomy:**
```
Dialog
  DialogHeader
    DialogTitle (concise, action-oriented)
    DialogDescription (explains consequences)
  DialogFooter
    Cancel button (left / secondary)
    Confirm button (right / primary or destructive)
```

**Rules:**
1. Dialog titles are sentence case, never ALL CAPS.
2. Destructive dialog: confirm button is `variant="destructive"`, label reflects the action (e.g., "Ta bort elev", not "OK").
3. Clicking outside a dialog or pressing Escape always closes it (unless there is unsaved data).
4. Maximum dialog width: `max-w-lg` for simple dialogs, `max-w-2xl` for form dialogs.

### 7.6 Sheets / Drawers

Sheets slide in from the right. Used for:
- Record creation and editing
- Detail panels that don't warrant a full page
- Secondary context without losing the current view

**Sheet anatomy:**
```
Sheet
  SheetHeader
    SheetTitle
    SheetDescription (optional)
  SheetContent (scrollable)
    [form fields or detail content]
  SheetFooter
    [action buttons]
```

**Rules:**
1. Sheet width: `w-full md:max-w-md` (form sheets), `w-full md:max-w-xl` (detail sheets).
2. Sheet always has a visible close button in the header.
3. If the sheet contains a form with unsaved changes, closing triggers a "Unsaved changes" confirmation.
4. Sheets do not nest. Never open a Sheet from inside a Sheet.

### 7.7 Tabs

Tabs separate logically distinct content areas within the same page context.

**Usage rules:**
1. Use tabs when content areas are parallel and mutually exclusive.
2. Maximum 6 tabs per tab group. More than 6 indicates a navigation issue.
3. Tab labels are concise (1–2 words in Swedish).
4. Default active tab is always the first tab.
5. Tab content does not scroll the tab bar — only content area scrolls.

### 7.8 KPI Cards

KPI cards appear at the top of dashboard pages and provide at-a-glance operational metrics.

**Standard KPI card anatomy:**
```
Card (p-4)
  div.flex.items-center.justify-between
    p.text-xs.font-medium.uppercase.tracking-wide.text-muted-foreground  ← Label
    Icon (w-4 h-4 text-muted-foreground)
  p.text-2xl.font-bold.tracking-tight.mt-2  ← Primary value
  p.text-xs.text-muted-foreground.mt-1  ← Trend or subtitle
```

**Rules:**
1. KPI grid: 2 columns mobile, 4 columns desktop.
2. Primary value: `text-2xl font-bold` (never text-3xl or larger — not a vanity metric display).
3. Trend direction: green for positive, red for negative, muted for neutral.
4. Unit is included in the value string (e.g., "124 kr", "18 elever") or as a superscript.
5. KPI cards do not have interactive affordances unless clicking reveals a drill-down.

### 7.9 Status Badges

Status badges communicate the current state of a record. They use the `StatusBadge` component (to be created in WP-DS).

**Variant contract:**

| Intent | Background | Text | Border | Usage |
|---|---|---|---|---|
| `active` / `confirmed` | `bg-green-50` | `text-green-700` | `border-green-200` | Active, confirmed, employed, completed |
| `pending` / `warning` | `bg-amber-50` | `text-amber-700` | `border-amber-200` | Pending, waiting, near-expiry, draft |
| `inactive` / `neutral` | `bg-gray-100` | `text-gray-600` | `border-gray-200` | Inactive, archived, cancelled |
| `destructive` / `error` | `bg-red-50` | `text-red-700` | `border-red-200` | Failed, overdue, rejected |
| `info` / `special` | `bg-blue-50` | `text-blue-700` | `border-blue-200` | Information, special status, flagged |

**Rules:**
1. Badges use `text-[11px] font-semibold uppercase tracking-wide`.
2. Badges have `px-2 py-0.5 rounded-full border`.
3. Never use raw `bg-green-200 text-green-900` — always use the StatusBadge component.
4. Never show more than one status badge per table row (use the most important).

### 7.10 Empty States

Every list, table, or data surface must have an explicit empty state. The `EmptyState` component from `@platform/ui` is required.

**Empty state anatomy:**
```
div.flex.flex-col.items-center.justify-center.py-12
  Icon (w-10 h-10 text-muted-foreground stroke-width={1.5})
  p.text-base.font-semibold.text-foreground.mt-4  ← Heading
  p.text-sm.text-muted-foreground.text-center.mt-1.max-w-xs  ← Description
  Button (optional, mt-4)  ← Primary action to fill the empty state
```

**Swedish content examples:**
- Empty student list: "Inga elever" / "Det finns inga registrerade elever ännu. Lägg till din första elev för att komma igång."
- Empty schedule: "Inga lektioner" / "Inga bokade lektioner för valt datum."
- Empty search result: "Inga träffar" / "Prova ett annat sökord eller rensa filtren."

### 7.11 Loading States

**Full-page loading:** Use `LoadingState` component. Never show a spinner without context.

**List loading:** Use `TableSkeleton` component — renders correctly-proportioned skeleton rows.

**Card loading:** Use `CardSkeleton` component.

**Button loading:** Button disables, keeps its dimensions, shows `<Loader2 className="animate-spin w-4 h-4" />`.

**Rules:**
1. Skeleton screens are preferred over spinners for content areas.
2. Loading states must match the approximate shape of the content they replace (no full-page spinner for a card).
3. Loading state minimum display time: none. Show immediately, remove when data arrives.

### 7.12 Error States

**Inline error (field validation):** `text-xs text-destructive` below the input. Icon optional.

**Toast error (transient):** Use `toast.error()` for action failures. Auto-dismiss after 5 seconds.

**Page-level error:** Use `EmptyState` variant with `variant="error"` — AlertCircle icon, `text-destructive`, error message, retry button.

**Portal full-screen error:** Use the shared `PortalErrorScreen` component (to be created in WP-DS). Uses the portal's accent color background, Shield icon, error heading, and a "Försök igen" button.

**Rules:**
1. Never show a raw unformatted error message string from the API. Format it into Swedish.
2. Every error state has a recovery path (retry button, back button, or support link).
3. Full-screen error states use a solid background — never a transparent overlay on broken content.

### 7.13 Notifications and Toasts

The `Toaster` component renders at the application shell level — not inside individual modules.

**Toast types:**
- `toast.success("…")` — green variant, auto-dismiss 4s
- `toast.error("…")` — red variant, auto-dismiss 6s (longer for errors)
- `toast.info("…")` — neutral variant, auto-dismiss 4s
- `toast.loading("…")` — spinner, dismissed programmatically on completion

**Rules:**
1. One Toaster instance per application shell. Never mount Toaster inside a route.
2. Success messages are short and affirmative: "Eleven skapades", "Bokingen sparades".
3. Error messages describe what failed: "Kunde inte spara bokning. Kontrollera din anslutning."
4. Never show more than 3 toasts simultaneously.

---

## Part 8 — Iconography

### 8.1 Icon Library

**Lucide React** is the sole icon library across all surfaces.

No other icon library (Heroicons, Feather, FontAwesome, Material Icons) may be introduced.

### 8.2 Icon Sizes

| Context | Size | Class |
|---|---|---|
| Navigation sidebar | 18×18px | `w-[18px] h-[18px]` |
| Top bar actions | 18×18px | `w-[18px] h-[18px]` |
| Button icons | 16×16px | `w-4 h-4` |
| Table action icons | 14×14px | `w-3.5 h-3.5` |
| KPI card icons | 16×16px | `w-4 h-4` |
| Empty state icons | 40×40px | `w-10 h-10` |
| Portal nav icons | 20×20px | `w-5 h-5` |
| Portal FAB icons | 22×22px | `w-[22px] h-[22px]` |
| Loading spinner | 16×16px | `w-4 h-4` |

### 8.3 Stroke Weights

| Surface | Stroke Width |
|---|---|
| Workspace sidebar and topbar | `strokeWidth={1.75}` |
| Content area (buttons, cards, forms) | `strokeWidth={2}` |
| Portal navigation | `strokeWidth={1.75}` |
| Empty state icons | `strokeWidth={1.5}` |
| Loading spinners | `strokeWidth={2}` |

Thinner strokes feel calmer and more premium. Thicker strokes provide clarity in compact UI.

### 8.4 Icon Colors

| Context | Color |
|---|---|
| Sidebar inactive | `text-sidebar-foreground` |
| Sidebar active | `text-sidebar-accent-foreground` |
| Body content (default) | `text-muted-foreground` |
| Primary action icons | `text-primary` |
| Success icons | `text-green-600` |
| Warning icons | `text-amber-600` |
| Destructive icons | `text-destructive` |
| Disabled icons | `text-muted-foreground opacity-50` |

### 8.5 Icon Rules

1. Icons must always accompany a text label in navigation — never icon-only nav without `aria-label`.
2. Icon-only buttons (toolbar, table row actions) always have `aria-label`.
3. Decorative icons (purely illustrative, no information value) use `aria-hidden="true"`.
4. Never use an icon to replace a text label in a form.
5. Maintain consistent iconographic vocabulary: use the same icon for the same concept across all modules.

**Canonical icon vocabulary (partial):**

| Concept | Icon |
|---|---|
| Add / Create | `Plus` |
| Edit | `Pencil` |
| Delete | `Trash2` |
| Search | `Search` |
| Filter | `Filter` |
| Settings | `Settings` |
| Notifications | `Bell` |
| User / Profile | `User` |
| Calendar / Schedule | `Calendar` |
| Finance / Money | `CreditCard` |
| Students | `GraduationCap` |
| Instructors | `UserCheck` |
| Reports | `BarChart3` |
| Messages | `MessageSquare` |
| Close | `X` |
| Back | `ChevronLeft` |
| Menu | `Menu` |
| More actions | `MoreHorizontal` |
| External link | `ExternalLink` |
| Download | `Download` |
| Upload | `Upload` |
| Check / Success | `CheckCircle2` |
| Alert | `AlertCircle` |
| Info | `Info` |
| Lock | `Lock` |
| Logout | `LogOut` |

---

## Part 9 — Navigation Language

### 9.1 Workspace Sidebar

The workspace sidebar is the primary navigation surface for the Trafikskola Workspace and Platform Admin.

**Dimensions:** `280px` wide. Fixed, non-scrolling. The main content area uses `md:pl-[280px]`.

**Structure (top to bottom):**
```
Org Avatar Block (top, pinned)
  └── Logo/Avatar (w-10 h-10 rounded-xl)
  └── Organization name (text-sm font-semibold)
  └── Subscription tier badge
  └── [Tenant switcher affordance — future]
─────────────────────────────────────────
Nav Sections (scrollable)
  Section Label (text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/60)
  Nav Items
─────────────────────────────────────────
Bottom Block (pinned)
  User avatar + name + role
  Sign out
```

**Section structure (after WP-NAV):**

| # | Section Label | Max Items |
|---|---|---|
| 1 | OPERATIVT | 6 items |
| 2 | BOKNINGSSYSTEM | 5 items |
| 3 | EKONOMI | 4 items |
| 4 | SYSTEM | 3 items |

**Nav item anatomy:**
```
<li>
  <NavLink className="flex items-center gap-3 px-2.5 py-2 mx-2 rounded-lg ...">
    <Icon strokeWidth={1.75} />
    <span className="text-sm font-medium">Label</span>
    [Badge count, if applicable]
  </NavLink>
</li>
```

**Active state contract:**
- Background: `bg-sidebar-accent`
- Text: `text-sidebar-accent-foreground`
- Left border: `border-l-[3px] border-sidebar-primary` (applied via `pl-[calc(0.625rem-3px)]` adjustment)
- Icon: inherits text color

**Hover state:**
- Background: `bg-sidebar-accent/60`
- No left border on hover (only on active)

### 9.2 Top Bar

**Dimensions:** `52px` height. Fixed. Positioned `left-0 md:left-[280px]` to respect sidebar.

**Top bar slots (left to right):**
```
[Mobile hamburger — md:hidden]
[Page title or breadcrumbs — takes remaining space]
                                    [⌘K search pill]
                                    [Dark mode toggle]
                                    [Notifications bell]
                                    [Help menu]
                                    [User menu]
```

**Rules:**
1. Organization name is NOT displayed in the TopBar. It lives in the sidebar org block.
2. `⌘K` search pill is always visible — it is the primary discovery mechanism.
3. The TopBar never contains module-specific actions. Module actions live inside the page content area.
4. Kassa shortcut (amber button) belongs in the sidebar or quick-actions area, not the TopBar.

### 9.3 Breadcrumbs

Breadcrumbs are shown on detail and sub-pages only. They do not appear on top-level list pages.

```
Elever / Anna Svensson / Ekonomi
↑                                 ← text-sm text-muted-foreground
         ↑                        ← text-sm text-primary (clickable)
                    ↑             ← text-sm font-medium text-foreground (current)
```

**Rules:**
1. Maximum 3 levels (root → parent → current).
2. Current page is not a link.
3. Breadcrumbs use `ChevronRight` separator icon (`w-4 h-4 text-muted-foreground`).

### 9.4 Command Palette

Activated by `⌘K` (Mac) or `Ctrl+K` (Windows). Mounted at AppShell level.

**Capabilities:**
- Navigate to any top-level route
- Search students (live query)
- Search instructors
- Jump to recent items

**Rules:**
1. Command palette is always available from any route within the workspace.
2. The `⌘K` pill in the TopBar must be visible and display the keyboard shortcut.
3. Results are grouped by type (Navigering, Elever, Instruktörer, Senaste).

### 9.5 Mobile Navigation (Workspace)

On mobile, the workspace sidebar is hidden. A hamburger button opens a `Sheet` overlay from the left containing the full sidebar.

```
<Sheet side="left">
  [Full Sidebar content]
</Sheet>
```

The MobileSidebar Sheet closes when:
- A nav link is tapped
- The backdrop is tapped
- The close button (`X`) is tapped

### 9.6 Portal Navigation

Portals (Student, Guardian, Instructor) each have their own navigation contract defined in their layout component.

**Desktop sidebar contract (all portals):**
- Width: `256px` (standardized across all portals)
- Background: `#FFFFFF` or `#FAFAFA`
- Active item: left `3px` border in portal accent color, light tint background (`accent 8%`)
- Nav icon: `w-5 h-5 strokeWidth={1.75}`
- Nav label: `text-sm font-medium`

**Mobile bottom nav contract (all portals):**
- Height: `64px`
- Tabs: 4–5 items
- Active tab: icon and label in portal accent color
- Touch target: minimum `44×44px` per item
- Center FAB (Instructor Portal): `w-14 h-14 rounded-full` in accent color, positioned `-mt-5`

---

## Part 10 — Dashboard Principles

### 10.1 Dashboard Layout Contract

Every tenant dashboard follows this structure, top to bottom:

```
1. PageHeader
   └── Greeting text (time-of-day aware, instructor name)
   └── Subtitle (date, active student count)

2. Quick Actions Row (horizontal scroll on mobile)
   └── 4–6 action chips: most-used operations

3. KPI Grid (2×2 mobile, 4×1 desktop)
   └── Today's lessons count
   └── Active students count
   └── Outstanding invoices (sum)
   └── Pending bookings count

4. Primary Content Row (2-column on desktop)
   └── Left: Today's schedule (compact calendar list)
   └── Right: Recent activity feed

5. Secondary Content Row (optional, 2–3 column on desktop)
   └── Context-relevant module widgets
```

### 10.2 KPI Hierarchy

Not all KPIs are equal. The dashboard follows a strict priority order:

**P1 — Today's operations** (always visible): lessons today, students expected

**P2 — Financial health** (always visible): outstanding invoices, unpaid balance

**P3 — Trend metrics** (visible on scroll or secondary row): week-over-week bookings, new students this month

**P4 — System health** (Platform Admin only): error rates, tenant counts, system status

### 10.3 Quick Actions

Quick actions are high-frequency operations that save the user navigation steps.

**Student workspace defaults:**
- Ny bokning
- Ny elev
- Nytt körkort / Påbörja körning
- Skicka meddelande

**Rules:**
1. Maximum 6 quick actions.
2. Quick actions use `Ghost` button style with icon + label.
3. Quick actions link to routes — they do not open modals.
4. Quick actions are consistent across sessions (not personalized unless explicitly designed).

### 10.4 Activity Feeds

Activity feeds show recent events in reverse-chronological order.

```
Activity item:
  Icon (w-5 h-5 in semantic color)
  Primary text (text-sm font-medium)
  Secondary text / metadata (text-xs text-muted-foreground)
  Timestamp (text-xs text-muted-foreground, relative: "3 min sedan")
```

**Rules:**
1. Show maximum 10 items. Link to full activity log.
2. Timestamps use relative format below 24h, date format above 24h.
3. Activity icons use semantic colors to communicate type (green = completed, amber = pending, red = alert).

---

## Part 11 — Responsive Design

### 11.1 Breakpoint System

TrafikskolaOS uses Tailwind's default breakpoint system:

| Name | Min-width | Description |
|---|---|---|
| (base) | 0px | Mobile-first default |
| `sm` | 640px | Large mobile, small tablet |
| `md` | 768px | Tablet, sidebar appears |
| `lg` | 1024px | Laptop, two-column layouts |
| `xl` | 1280px | Standard desktop |
| `2xl` | 1536px | Wide desktop |

### 11.2 Workspace (Desktop-Primary)

**< 768px (mobile):**
- Sidebar hidden; hamburger opens MobileSidebar Sheet
- TopBar shows: mobile hamburger, page title, notifications
- Stat grid: 2 columns
- Table: key columns only; secondary columns hidden
- Forms: single column

**768px–1024px (tablet):**
- Sidebar visible (280px), content area constrained
- Stat grid: 2–4 columns
- Two-column layouts collapse to one column

**≥ 1024px (desktop standard):**
- Full sidebar + content layout
- Stat grid: 4 columns
- Two-column content layouts active

**≥ 1536px (ultra-wide):**
- `max-w-screen-2xl` prevents content from stretching to extreme widths
- Sidebar proportionally maintains fixed 280px

### 11.3 Portals (Mobile-First)

**Student Portal:**
- Mobile: bottom tab bar navigation, single-column content
- Desktop: 256px sidebar, main content area

**Guardian Portal:**
- Mobile: bottom tab bar + Meny tab for full menu
- Desktop: 256px sidebar, main content area

**Instructor Portal:**
- Mobile: bottom tab bar + FAB for primary action
- Desktop: 256px sidebar, main content area

**Instructor App:**
- Mobile only — no desktop layout

**Public Catalog:**
- Mobile: single column, sticky header
- Desktop: 3-column package grid

### 11.4 Key Responsive Rules

1. Tables are never horizontally scrollable on mobile — they collapse to card or list view.
2. Forms are always single-column on mobile.
3. Modals/dialogs are full-screen on mobile (`w-full h-full md:max-w-lg md:h-auto`).
4. Sheets slide from the bottom on mobile (`side="bottom"`) and from the right on desktop (`side="right"`).
5. Never use fixed pixel widths for content containers — use responsive max-widths.

---

## Part 12 — Accessibility

### 12.1 WCAG Standard

**Target: WCAG 2.1 Level AA** across all surfaces.

This is a minimum floor. Level AAA is aspirational for high-priority surfaces (dashboard, booking flow).

### 12.2 Contrast Ratios

| Usage | Minimum Ratio | Target Ratio |
|---|---|---|
| Body text on background | 4.5:1 | 7:1 |
| Large text (≥18pt or ≥14pt bold) | 3:1 | 4.5:1 |
| UI component borders | 3:1 | — |
| Icon (information-bearing) | 3:1 | — |
| Disabled elements | No minimum | — |

**Portal accent verification (required before WP-STUDENT/GUARDIAN/INSTRUCTOR):**

| Portal | Accent on White | Pass AA? |
|---|---|---|
| Student `#684EFF` | Check and document | Required |
| Guardian `#2D5BE3` | Check and document | Required |
| Instructor `#0F7E6B` | Check and document | Required |
| Platform Admin `#B45309` | Check and document | Required |

If an accent color fails 3:1 on white, adjust the shade darker until it passes before implementation.

### 12.3 Keyboard Navigation

1. All interactive elements are reachable by `Tab` key.
2. Tab order matches visual reading order.
3. Focus indicator: `ring-2 ring-primary ring-offset-2` — always visible and never suppressed.
4. `Escape` closes all modals, dialogs, sheets, dropdowns, and command palettes.
5. Sidebar navigation is navigable by arrow keys (when focused).
6. Data tables support keyboard row navigation.
7. `Enter` and `Space` activate buttons and links — never override these keys.

### 12.4 Screen Reader Support

1. Every page has an `<h1>` that matches the page title.
2. Navigation landmarks: `<nav>` for sidebar and top bar, `<main>` for content, `<footer>` for page footers.
3. All images have `alt` text. Decorative images use `alt=""`.
4. Icons that carry meaning have `aria-label` on their button parent or `aria-label` directly.
5. Loading states use `aria-busy="true"` on the container.
6. Dialog components use `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the dialog title.
7. Status badges use `aria-label` that spells out the status in Swedish (e.g., `aria-label="Status: Aktiv"`).

### 12.5 Touch Targets

Minimum touch target size is **44×44px** for all interactive elements on mobile surfaces.

Applies to:
- Bottom nav tabs (portals)
- FAB buttons
- List item actions
- Form inputs on mobile

If a visual element must be smaller than 44×44px, its `onClick` target area must still be padded to 44×44px using invisible padding.

### 12.6 Focus Management

1. When a dialog opens, focus moves to the first focusable element inside it.
2. When a dialog closes, focus returns to the element that opened it.
3. Sheets follow the same contract as dialogs.
4. When a toast appears, it does not steal focus.
5. After a successful form submission that closes a sheet, focus returns to the table/list.

### 12.7 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

All animations must be wrapped in `motion-safe:` Tailwind variant or respect this media query. No animation may be required for the UI to be understandable.

---

## Part 13 — Motion

### 13.1 Philosophy

Motion must be purposeful and calm. It communicates state change, not personality. Every animation must pass the question: "Does this make the interface easier to understand, or just prettier?"

If the answer is "prettier only", remove the animation.

### 13.2 Duration Scale

| Name | Duration | Usage |
|---|---|---|
| Instant | 0ms | State toggles that need no indication |
| Fast | 100ms | Hover state color transitions |
| Base | 150ms | Most UI transitions (default) |
| Moderate | 200ms | Sheet open/close, dropdown open |
| Slow | 300ms | Dialog open/close, page transitions |
| Long | 500ms | Skeleton → content reveal |

### 13.3 Easing

| Context | Easing |
|---|---|
| Enter (elements appearing) | `ease-out` |
| Exit (elements disappearing) | `ease-in` |
| State changes (hover, focus) | `ease-in-out` |
| Springs (portals, mobile) | `cubic-bezier(0.34, 1.56, 0.64, 1)` — subtle overshoot |

### 13.4 Permitted Animations

| Animation | Context | Duration |
|---|---|---|
| Fade in | Page enter, content reveal | 150ms |
| Slide from right | Sheet open | 200ms |
| Slide from bottom | Mobile sheet, bottom drawer | 200ms |
| Slide down | Dropdown open | 150ms |
| Scale + fade | Dialog open | 200ms |
| Skeleton shimmer | Loading placeholders | `infinite` @ 1.5s |
| Spinner rotation | Button loading, page loading | `infinite` @ 0.75s |
| Accordion expand | Collapsible content | 200ms |

### 13.5 Forbidden Animations

1. No `bounce` on data-carrying elements.
2. No complex multi-step entrance animations on list items.
3. No parallax effects.
4. No animated backgrounds or gradient shifts.
5. No spinning or pulsing icons in the sidebar.
6. No transition on page background color.

### 13.6 Page Transitions

Pages use a simple fade-in when entering. The `page-enter` CSS class applies `animate-fade-in`:

```css
.page-enter {
  animation: fadeIn 150ms ease-out;
}
```

No slide transitions between pages. The sidebar is persistent — sliding the content creates disorientation.

---

## Part 14 — Content Language

### 14.1 Language Principles

All user-facing text is in Swedish unless the content is inherently international (currency codes, ISO codes, technical identifiers).

**Register:** Professional, clear, warm. Not bureaucratic. Not informal. As if a competent colleague wrote it.

**Person:** Address the user directly using "du" (informal second person), not "ni" (formal) or third person.

**Tense:** Present tense for states, past tense for completed actions.

### 14.2 Headings and Titles

| Context | Casing | Example |
|---|---|---|
| Page titles | Sentence case | "Mina elever" |
| Section headings | Sentence case | "Kommande lektioner" |
| Dialog titles | Sentence case | "Ta bort elev" |
| Table column headers | Sentence case | "Bokningsdatum" |
| Sidebar nav items | Title case | "Mitt schema" |
| Section group labels | ALL CAPS | "BOKNINGSSYSTEM" |

### 14.3 Buttons and Actions

Buttons describe the action the system will perform — not the abstract outcome.

| Correct | Incorrect |
|---|---|
| "Spara elev" | "OK" |
| "Ta bort bokning" | "Ja" |
| "Avbryt" | "Stäng" (when it discards changes) |
| "Skicka faktura" | "Bekräfta" |
| "Lägg till instruktör" | "Skapa" |

Primary action buttons are specific. Generic "Bekräfta" and "OK" labels are forbidden on primary actions.

### 14.4 Empty States

Empty states are written in first-person-neutral, with a short heading and one sentence of explanation.

| Surface | Heading | Description |
|---|---|---|
| Empty student list | "Inga elever registrerade" | "Lägg till din första elev för att komma igång med bokningar och kurser." |
| Empty booking list | "Inga bokningar" | "Det finns inga bokningar för valt datum eller filter." |
| Empty invoice list | "Inga fakturor" | "Fakturor som skapas visas här." |
| No search results | "Inga träffar" | "Prova ett annat sökord eller bredda sökningen." |

### 14.5 Validation and Form Errors

Error messages appear below the field immediately upon validation. They are specific and actionable.

| Situation | Message |
|---|---|
| Required field empty | "Det här fältet är obligatoriskt." |
| Invalid email | "Ange en giltig e-postadress." |
| Invalid personnummer | "Personnumret verkar inte stämma. Kontrollera formatet (YYYYMMDD-XXXX)." |
| Date in the past | "Välj ett datum som inte har passerat." |
| Amount too low | "Beloppet måste vara minst 1 kr." |
| Duplicate booking | "Det finns redan en bokning i det här tidsfönstret." |

### 14.6 Success Messages (Toasts)

Short. Affirmative. Past tense.

| Action | Toast text |
|---|---|
| Student created | "Eleven skapades" |
| Booking saved | "Bokningen sparades" |
| Invoice sent | "Fakturan skickades" |
| Settings saved | "Inställningarna sparades" |
| User removed | "Användaren togs bort" |

### 14.7 Error Messages (Toasts)

Describe the failure. Give the user something to do.

| Situation | Toast text |
|---|---|
| Network error | "Kunde inte spara. Kontrollera din anslutning och försök igen." |
| Server error | "Något gick fel. Prova igen om ett ögonblick." |
| Permission denied | "Du har inte behörighet att utföra den här åtgärden." |
| Conflict | "Bokningen kunde inte skapas – välj ett annat tillfälle." |

### 14.8 Swedish Terminology Glossary

| Swedish | English | Usage context |
|---|---|---|
| Elev | Student | A learner registered at the school |
| Instruktör | Instructor | A driving instructor |
| Bokning | Booking | A scheduled lesson slot |
| Lektion | Lesson | The actual scheduled session |
| Schema | Schedule | Personal or organization schedule |
| Faktura | Invoice | Invoice document |
| Betalning | Payment | A payment transaction |
| Kurs | Course | A packaged learning program |
| Körkort | Driver's license | The license being worked toward |
| Trafikskola | Driving school | The organization |
| Administratör | Administrator | Admin role |
| Välkommen | Welcome | Greeting in onboarding/portal |
| Logga in | Log in | Authentication action |
| Logga ut | Log out | Sign-out action |

---

## Part 15 — Design Governance

### 15.1 The Cardinal Rules

These rules are absolute. No exception without a documented specification amendment approved by the design lead.

**COLOR**
1. Never introduce a color not defined in this specification.
2. Never hardcode a hex value in a component. Use CSS variables.
3. Never use Tailwind color utilities (`text-blue-700`, `bg-purple-100`) for branded or semantic colors. Map them to tokens first.
4. Never use a portal accent color outside its designated portal.
5. Never add a second accent color to a portal that already has one.

**TYPOGRAPHY**
6. Never use a font size below 11px (`text-[11px]`) on any surface.
7. Never use arbitrary font sizes outside the 8-step scale.
8. Never create bespoke heading styles — use the heading hierarchy from Section 5.4.

**SPACING**
9. Never hardcode spacing in `style={}` attributes. Use Tailwind spacing classes.
10. Never introduce spacing values outside the 4px-base grid.

**COMPONENTS**
11. Never create a bespoke button using `<div>` or `<span>` elements.
12. Never create a bespoke card layout. Use the `Card` component from `@platform/ui`.
13. Never bypass the `DataTable` component for tabular data.
14. Never bypass `EmptyState` or `LoadingState` for those states.
15. Never mount `Toaster` inside a route component. It belongs in AppShell.

**NAVIGATION**
16. Never add a new top-level sidebar navigation item without evaluating whether it belongs as a sub-item in an existing section.
17. Never add a navigation item without an icon.
18. Never create portal-specific navigation patterns that deviate from the portal nav contract.

**ACCESSIBILITY**
19. Never suppress the focus ring on any interactive element.
20. Never add `outline: none` without simultaneously providing an alternative focus indicator.
21. Never ship an interactive element without a keyboard activation path.

### 15.2 Process for Introducing New Patterns

If a use case cannot be solved by existing specification components:

1. Document why the existing system fails this use case.
2. Design the new pattern and present it for review.
3. Amend this specification to include the new pattern.
4. Build the new pattern in `@platform/ui` before using it in any module.
5. Never build a one-off pattern inside a route component.

### 15.3 When to Amend This Specification

Amendments are required when:
- A new color is needed
- A new component type is introduced
- A persona's behavior model changes significantly
- A portal's device split changes materially
- A Swedish terminology decision is reversed

Amendments are NOT required for:
- Bug fixes to existing components
- Content copy corrections
- Adding icons from the approved Lucide library
- Adjusting animation durations within the approved duration scale

---

## Part 16 — Quality Gates

Every UI deliverable — page, component, or feature — must pass all applicable quality gates before being considered complete.

### Gate QG-1: Design Consistency

- [ ] Uses only colors from the token system (no hardcoded hex, no Tailwind color utilities for brand/semantic colors)
- [ ] Uses only font sizes from the approved type scale
- [ ] Uses only spacing from the 4px grid
- [ ] All interactive elements use `@platform/ui` components — no bespoke button, card, or input markup
- [ ] Icons are Lucide React, correct size, correct stroke weight for surface
- [ ] Empty states use `EmptyState` component with correct Swedish content
- [ ] Loading states use skeleton components, not raw spinners

### Gate QG-2: Accessibility

- [ ] Minimum contrast ratio 4.5:1 for body text (verified with tool)
- [ ] Minimum contrast ratio 3:1 for UI components and icons
- [ ] All interactive elements reachable by keyboard
- [ ] Focus ring visible on all interactive elements
- [ ] All icon-only buttons have `aria-label`
- [ ] Page has exactly one `<h1>` matching the page title
- [ ] Images have `alt` text; decorative images have `alt=""`
- [ ] Dialogs have `aria-labelledby` and `aria-modal="true"`
- [ ] Touch targets minimum 44×44px on mobile surfaces

### Gate QG-3: Responsive Behavior

- [ ] Layout tested at: 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on any breakpoint
- [ ] Tables collapse or scroll correctly on mobile
- [ ] Sheets use `side="bottom"` on mobile, `side="right"` on desktop
- [ ] Dialogs are full-screen on mobile
- [ ] No fixed pixel widths on content containers

### Gate QG-4: Dark Mode

- [ ] Page and all components render without visual defects in dark mode
- [ ] No hardcoded light-mode colors remain in component
- [ ] Contrast ratios pass in dark mode as well as light mode
- [ ] Skeleton loading states are visible in dark mode

### Gate QG-5: Swedish Localization

- [ ] All user-visible text is in Swedish (unless field is inherently international)
- [ ] Button labels are specific and action-describing
- [ ] Empty states follow the approved copy pattern
- [ ] Error messages are actionable in Swedish
- [ ] No English strings visible to end users
- [ ] Terminology matches the approved glossary in Section 14.8

### Gate QG-6: Performance

- [ ] No new synchronous blocking requests added to the render path
- [ ] Lists use pagination (default 25 per page — never 100)
- [ ] Images are appropriately sized and format (WebP preferred)
- [ ] No `useEffect` chains that trigger sequential queries
- [ ] React Query cache is leveraged — no duplicate fetches on re-renders
- [ ] Route bundle does not regress significantly (Vite build report checked)

### Gate QG-7: Component Reuse

- [ ] No UI logic duplicated from an existing module or component
- [ ] New reusable patterns are added to `@platform/ui` — not inlined in route files
- [ ] No duplicated CSS class strings that should be abstracted into a component
- [ ] Module-specific components are in the module's `components/` directory — not `shared/`

### Gate QG-8: TypeScript Integrity

- [ ] `pnpm typecheck` passes with zero errors across all packages
- [ ] No `@ts-ignore` or `as any` introduced
- [ ] `exactOptionalPropertyTypes` satisfied — no `undefined` used where not permitted
- [ ] `noUncheckedIndexedAccess` satisfied — array and record accesses are guarded

---

## Appendix A — Token Quick Reference

```css
/* Primary / Brand */
--primary: 207 100% 33%;           /* #006AA7 — Swedish Blue */
--primary-foreground: 210 40% 98%; /* #F8FAFF */

/* Surfaces */
--background: 0 0% 100%;           /* #FFFFFF */
--card: 0 0% 100%;                 /* #FFFFFF */
--secondary: 210 40% 96%;          /* #EEF4FB */
--muted: 210 40% 96%;              /* #EEF4FB */

/* Text */
--foreground: 222 47% 11%;         /* #141E2E */
--muted-foreground: 215 16% 47%;   /* #68778D */

/* Borders */
--border: 214 32% 91%;             /* #DDE5F0 */
--input: 214 32% 91%;              /* #DDE5F0 */
--ring: 207 100% 33%;              /* #006AA7 */

/* Radius */
--radius: 0.5rem;                  /* 8px */

/* Sidebar */
--sidebar-background: 222 47% 11%; /* #0F1929 */
--sidebar-foreground: 215 20% 75%; /* #AEBACE */
--sidebar-primary: 207 100% 45%;   /* #0090E5 */
--sidebar-accent: 222 47% 18%;     /* #1C2D47 */
--sidebar-accent-foreground: 0 0% 100%;

/* Layout */
--sidebar-width: 280px;            /* Fix from 256px to match implementation */
--topbar-height: 52px;             /* Reduced from 56px */

/* Portal Accents (to be added in WP-DS) */
--accent-platform: #B45309;        /* Amber — Platform Admin */
--accent-student: #684EFF;         /* Violet — Student Portal */
--accent-guardian: #2D5BE3;        /* Deep Blue — Guardian Portal */
--accent-instructor: #0F7E6B;      /* Teal — Instructor Portal */
```

---

## Appendix B — Spacing Quick Reference

| Token | px | Class |
|---|---|---|
| xs | 4px | `p-1` / `gap-1` |
| sm | 8px | `p-2` / `gap-2` |
| md | 12px | `p-3` / `gap-3` |
| base | 16px | `p-4` / `gap-4` |
| lg | 20px | `p-5` / `gap-5` |
| xl | 24px | `p-6` / `gap-6` |
| 2xl | 32px | `p-8` / `gap-8` |
| 3xl | 40px | `p-10` |
| 4xl | 48px | `p-12` |

---

## Appendix C — Type Scale Quick Reference

| Step | px | Class | Weight | Usage |
|---|---|---|---|---|
| 2xs | 11px | `text-[11px]` | Semibold | Badges (floor) |
| xs | 12px | `text-xs` | Medium/Semibold | Section labels, timestamps |
| sm | 14px | `text-sm` | Regular/Medium | Body, nav, inputs |
| base | 16px | `text-base` | Regular | Dialog body |
| lg | 18px | `text-lg` | Semibold | Section headings |
| xl | 20px | `text-xl` | Semibold | Page title |
| 2xl | 24px | `text-2xl` | Bold | KPI primary |
| 3xl | 30px | `text-3xl` | Bold | Hero KPI |

---

## Appendix D — Component Checklist

When building any new page or component, verify before shipping:

```
□ Uses Card from @platform/ui (not bespoke div)
□ Uses Button from @platform/ui (not bespoke element)
□ Uses DataTable from @platform/ui (not bespoke table)
□ Uses Input/Label from @platform/ui (not bare HTML)
□ Uses EmptyState from @platform/ui
□ Uses LoadingState / Skeleton from @platform/ui
□ All strings are in Swedish
□ All colors use CSS variables or token-mapped Tailwind classes
□ All spacing uses Tailwind scale classes
□ Icons are Lucide React, correct size and strokeWidth
□ Focus ring is preserved on all interactive elements
□ Touch targets ≥ 44px on mobile surfaces
□ pnpm typecheck passes
```

---

*This document is the official UI constitution for TrafikskolaOS. Version amendments require design lead approval and must be reflected in this file with a version number and date.*

*Next action: WP-DS — Design System Foundation implementation. Awaiting approval.*
