# TrafikskolaOS — UI Layout Contracts

**Version:** 1.0  
**Date:** 2026-06-30  
**Status:** OFFICIAL — Every page implementation must comply with an approved contract from this document  
**Branch:** ui/modernization-v2  
**Authors:** Chief UX Architect · Product Designer · Information Architect · Enterprise SaaS Layout Specialist

---

## Preamble

A layout contract is a binding structural blueprint for a page or page family. It defines the position, order, and presence of every major layout region — not the visual treatment (governed by the Design Language Specification) and not the content (governed by individual module requirements).

**Why contracts exist:** When every module invents its own page structure, users rebuild their mental model on every navigation. Layout contracts ensure that any user who knows how to use the Students module immediately knows how to use the Bookings module, the Finance module, and any future module — because the structural grammar is identical.

**What a contract specifies:**
- Which regions a page type contains
- The mandatory order of those regions top-to-bottom
- Whether each region is required or conditional
- What the region's purpose is
- Behavioral rules that apply to that region

**What a contract does not specify:**
- Visual colors, typography, or spacing (→ Design Language Specification)
- Component implementations (→ @platform/ui)
- Business logic or data models
- API or database design

Every page in the system must map to exactly one contract. If a page cannot map to an existing contract, the case must be escalated for a contract amendment — not resolved by inventing a bespoke layout.

---

## Application Shell

Before the contracts, the shell that wraps all workspace pages is defined here as the fixed context all contracts operate within.

### Workspace Shell

```
┌─────────────────────────────────────────────────────────────┐
│  TopBar (52px, fixed, left: 280px on md+)                   │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   Sidebar    │   Main Content Area                          │
│   (280px,    │   (md:pl-[280px] pt-[52px])                 │
│   fixed,     │                                              │
│   md+)       │   ← Page contract renders here →            │
│              │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

**Shell constraints all contracts must respect:**
- Main content area starts at `pt-[52px]` (TopBar offset)
- Content is padded `md:pl-[280px]` by the shell — contracts do not add left offset themselves
- Content uses `max-w-screen-2xl mx-auto` (via `PageLayout`) to prevent extreme widths on large monitors
- On mobile, sidebar is hidden; content spans full width

### Portal Shells

Each portal has its own shell (defined in its Layout component). Portal contracts operate within their respective shell — not the workspace shell.

---

## Contract 1 — Workspace Dashboard

**Applies to:** Trafikskola Dashboard (`/dashboard`), Platform Admin Dashboard

### Purpose

The dashboard is the first screen a user sees after login. Its job is to orient the user to the current operational state in under 10 seconds — without requiring any navigation.

### Layout Blueprint

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: GREETING HEADER                          [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  God morgon, Anna!           [Date]   [Quick Action Chips]  │
│  {subtitle: active count, status}                           │
├─────────────────────────────────────────────────────────────┤
│  ZONE 2: ALERT STRIP                            [CONDITIONAL]│
│  ─────────────────────────────────────────────────────────── │
│  ⚠ Alert message requiring immediate attention              │
├─────────────────────────────────────────────────────────────┤
│  ZONE 3: KPI GRID                                 [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [KPI 1]   [KPI 2]   [KPI 3]   [KPI 4]                     │
│  2 cols mobile → 4 cols desktop                             │
├─────────────────────────────────────────────────────────────┤
│  ZONE 4: PRIMARY CONTENT ROW                      [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Left: Today's Schedule / 2/3 width]  [Right: Activity]   │
│  On mobile: stacks vertically, schedule first              │
├─────────────────────────────────────────────────────────────┤
│  ZONE 5: SECONDARY CONTENT ROW                  [CONDITIONAL]│
│  ─────────────────────────────────────────────────────────── │
│  [Widget A]   [Widget B]   [Widget C]                       │
│  2–3 column grid; role-dependent content                    │
└─────────────────────────────────────────────────────────────┘
```

### Zone Specifications

**Zone 1 — Greeting Header**
- *Required.* Always the topmost content element.
- Greeting is time-of-day aware: "God morgon", "God eftermiddag", "God kväll"
- Greeting includes the user's first name: "God morgon, Anna!"
- Subtitle line: today's date + one operational context phrase (e.g., "5 elever bokade idag")
- Right side: 3–5 Quick Action chips (horizontal scroll on mobile)
- Quick Actions are high-frequency ops: Ny bokning, Ny elev, Skicka meddelande, Skapa faktura
- Quick Actions link to routes — they do not open modals
- No breadcrumbs on the dashboard — it is the root

**Zone 2 — Alert Strip**
- *Conditional.* Only visible when there is an active alert.
- Alert types: overdue invoices, failed automation, expiring licenses, system messages
- Amber background for warnings, red for errors, blue for informational
- Dismissible per alert. Dismissed state persists in localStorage until resolved server-side
- Never stack more than 3 alerts; if more exist, collapse into "3 varslar" chip

**Zone 3 — KPI Grid**
- *Required.* Appears immediately below the greeting/alert.
- Grid: 2 columns mobile → 4 columns desktop
- Maximum 4 KPI cards; 6 in Platform Admin variant
- KPI priority order: operational first (today's lessons), financial second (outstanding sum), trend third
- Each KPI card: label (uppercase xs), primary value (2xl bold), trend indicator (xs)
- KPI cards are NOT interactive unless they link to a drill-down (then entire card is clickable, with hover state)
- Loading state: show CardSkeleton in the same grid dimensions

**Zone 4 — Primary Content Row**
- *Required.* The main operational content of the dashboard.
- Desktop: two-column grid `lg:grid-cols-3` — left panel takes `col-span-2`, right panel takes `col-span-1`
- Mobile: single column, left panel (schedule) appears first
- **Left panel (Today's Schedule):** compact time-ordered list of today's bookings; "Gå till schema" link at bottom; max 8 items; empty state if no lessons today
- **Right panel (Recent Activity):** reverse-chronological event feed; timestamps relative below 24h; max 10 items; "Se alla händelser" link

**Zone 5 — Secondary Content Row**
- *Conditional.* Shown when role-relevant widgets exist.
- 2–3 column grid depending on widget count
- Example widgets: Instructor availability board, Pending waitlist, Upcoming course starts, Overdue invoice list
- Each widget is a self-contained Card with its own header and "Se alla →" link

### Dashboard Variant: Platform Admin

The Platform Admin dashboard follows the same 5-zone structure with different zone content:

| Zone | Content |
|---|---|
| Greeting Header | "God morgon, Wirya!" + platform-wide date |
| Alert Strip | System health alerts, tenant errors |
| KPI Grid | Active organizations, Monthly recurring revenue, New trials this month, Support queue depth |
| Primary Row | Left: New organizations this week (list) / Right: System event log |
| Secondary Row | Subscription tier distribution, Top-activity tenants, Error rate |

---

## Contract 2 — Workspace List Page

**Applies to:** Elever, Instruktörer, Kunder, Företagskunder, Fakturor, Bokningar, Paket, Fordon, Kampanjer, Resurser, Rapporter, Klasslista, and all future list-type pages

### Purpose

The list page is where users discover, search, filter, and navigate to records. Its only jobs are: find a record, understand its status at a glance, and take a bulk or individual action.

### Layout Blueprint

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: PAGE HEADER                              [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Breadcrumb]                                               │
│  Page Title                    [Secondary Actions] [Primary]│
│  Subtitle / record count                                    │
├─────────────────────────────────────────────────────────────┤
│  ZONE 2: FILTER BAR                               [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [🔍 Search input]  [Filter 1 ▾]  [Filter 2 ▾]  [Clear ×] │
├─────────────────────────────────────────────────────────────┤
│  ZONE 3: BULK ACTION BAR                        [CONDITIONAL]│
│  ─────────────────────────────────────────────────────────── │
│  {N} valda   [Bulk Action 1]  [Bulk Action 2]  [Avmarkera] │
│  Only visible when ≥1 row is selected                       │
├─────────────────────────────────────────────────────────────┤
│  ZONE 4: DATA TABLE                               [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [  ] Col 1 (primary)  Col 2  Col 3  Status  Actions […]   │
│  ─────────────────────────────────────────────────────────── │
│  Row 1                                                      │
│  Row 2                                                      │
│  …                                                          │
│  ─────────────────────────────────────────────────────────── │
│  [Empty State — when no records match]                      │
├─────────────────────────────────────────────────────────────┤
│  ZONE 5: PAGINATION                               [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  {1–25 av 143}          [← Föregående]  [Nästa →]          │
└─────────────────────────────────────────────────────────────┘
```

### Zone Specifications

**Zone 1 — Page Header**
- *Required.*
- Breadcrumb: only if the list is nested (e.g., Company → Enrolled Students). Top-level lists (Elever, Fakturor) have no breadcrumb.
- Title: module name, sentence case (e.g., "Elever", "Fakturor", "Bokningar")
- Subtitle: live record count, post-filter (e.g., "143 elever", "12 resultat")
- **Primary action:** one Button `variant="default"` at far right — creates a new record (e.g., "Lägg till elev", "Ny faktura")
- **Secondary actions:** 0–2 Ghost or Outline buttons to the left of primary (e.g., "Importera", "Exportera")
- Never more than 3 actions in the header; further actions move to a `...` dropdown

**Zone 2 — Filter Bar**
- *Required.* Always positioned directly below the page header, above the table.
- Left: Search input (`w-full md:w-72`) with Search icon, placeholder in Swedish (e.g., "Sök elev...")
- Right: Filter dropdowns as `Select` or `DropdownMenu` components; most common filters first
- "Rensa filter" link appears only when at least one filter is active
- Active filters are indicated with a filled chip or count badge on the filter button
- Maximum 4 filter controls visible; additional filters move to a "Fler filter" panel

**Zone 3 — Bulk Action Bar**
- *Conditional.* Replaces or overlays the filter bar when ≥1 rows are selected.
- Shows: "{N} valda" count + 1–3 contextually relevant bulk actions + "Avmarkera alla" link
- Bulk actions are destructive-aware: bulk delete always confirms
- Animates in when selection count goes from 0 to 1; animates out when deselected

**Zone 4 — Data Table**
- *Required.*
- First column: checkbox (for selection) + primary identifier (bold, links to detail page)
- Column order: primary identifier → key attributes → status badge → date → actions
- Status column: always uses StatusBadge component
- Actions column: always the rightmost column; uses `MoreHorizontal` DropdownMenu; minimum actions: Edit, View, Delete
- Row click (outside checkbox and actions): navigates to detail page
- Sticky table header on vertical scroll
- Column sorting: click header to toggle asc/desc; sorted column shows ChevronUp/Down icon
- Empty state (no records): EmptyState component — icon, heading, description, optional primary CTA
- Empty state (search/filter returned nothing): EmptyState with "Inga träffar" + clear filter button

**Zone 5 — Pagination**
- *Required.* Always 25 records per page (default). Never 100.
- Left: "{start}–{end} av {total} {entity}" (e.g., "1–25 av 143 elever")
- Right: "← Föregående" and "Nästa →" buttons; disabled when at boundary
- Optional: page size selector for power users (25 / 50 / 100)

---

## Contract 3 — Workspace Detail Page

**Applies to:** Student detail, Instructor detail, Company detail, Invoice detail, Package detail, Booking detail, Vehicle detail, and all future record detail pages

### Purpose

The detail page presents the full context of a single record. It answers: what is this record, what is its current state, what happened to it, and what can I do with it now?

### Layout Blueprint

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: PAGE HEADER                              [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Breadcrumb: Parent List > Record Name]                    │
│  Record Name / Title          [Secondary] [Edit] […]       │
│  Subtitle: ID, Type, Created date                           │
├─────────────────────────────────────────────────────────────┤
│  ZONE 2: STATUS SUMMARY CARD                      [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Avatar/Icon]  Primary Name            [Status Badge]     │
│                 Secondary Info Line 1                       │
│                 Secondary Info Line 2                       │
│                 [Key Metric 1] [Key Metric 2] [Key Metric 3]│
├─────────────────────────────────────────────────────────────┤
│  ZONE 3: TAB NAVIGATION                           [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Tab 1: Översikt] [Tab 2: ...] [Tab 3: ...] [Tab 4: ...] │
├─────────────────────────────────────────────────────────────┤
│  ZONE 4: TAB CONTENT AREA                         [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  ┌──────────────────────────────────┬────────────────────┐  │
│  │ Primary Panel (2/3)             │ Side Panel (1/3)   │  │
│  │                                 │                    │  │
│  │ [Main content for active tab]   │ [Quick facts,      │  │
│  │                                 │  related records,  │  │
│  │                                 │  contact info]     │  │
│  └──────────────────────────────────┴────────────────────┘  │
│  (mobile: side panel collapses below primary)               │
├─────────────────────────────────────────────────────────────┤
│  ZONE 5: ACTIVITY LOG                             [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  Aktivitetslogg                          [Se alla →]        │
│  ─────────────────────────────────────── [Add note +]       │
│  ● Event 1 (timestamp)                                      │
│  ● Event 2 (timestamp)                                      │
│  ● Note (user-authored)                                     │
└─────────────────────────────────────────────────────────────┘
```

### Zone Specifications

**Zone 1 — Page Header**
- *Required.*
- Breadcrumb: always present on detail pages (e.g., "Elever / Anna Svensson")
- Title: the record's primary name or identifier
- Subtitle: record type, internal ID, creation date
- Actions: Edit button (outline), More (...) dropdown with: Delete, Export PDF, Copy link
- Destructive actions (Delete) always live inside the `...` dropdown — never as a visible primary button

**Zone 2 — Status Summary Card**
- *Required.* The "at a glance" summary. Appears before tabs, always visible regardless of active tab.
- Avatar/Icon: entity type icon or photo (circular, `w-14 h-14`)
- Primary name: `text-lg font-semibold`
- Secondary info: 1–2 lines of key identifiers (e.g., personnummer, email, phone)
- Status badge: current lifecycle status, top-right of card
- Key metrics row: 3–4 compact metric chips (e.g., "12 bokningar", "3 450 kr", "Körkort B")

**Zone 3 — Tab Navigation**
- *Required.* Anchored immediately below the summary card.
- Tabs represent logically distinct views of the same record
- First tab is always "Översikt" (overview)
- Recommended tab order: Översikt → [Domain-specific tabs] → Ekonomi → Dokument → Aktivitet
- Maximum 6 tabs. If more content exists, group within tabs using sub-sections
- Active tab state uses `border-b-2 border-primary text-primary`
- URL reflects active tab (`?tab=ekonomi`) for shareability and browser back support

**Zone 4 — Tab Content: Översikt (default)**
- *Required tab content.*
- Two-column layout on desktop (`lg:grid-cols-3`): primary panel (`col-span-2`) + side panel (`col-span-1`)
- **Primary panel:** The most operationally relevant content for this entity (e.g., for a student: upcoming lessons, recent bookings, active packages)
- **Side panel:** Quick facts section (non-editable key fields), Related records (e.g., assigned instructor, linked company), Contact actions (email, phone)
- Mobile: side panel stacks below primary panel

**Zone 5 — Activity Log**
- *Required.* Always the bottommost zone on every detail page, across all tabs.
- Title: "Aktivitetslogg" (`text-sm font-semibold`)
- Right: "Se alla →" link and "Lägg till anteckning" button
- Each entry: icon (semantic color) + event description + timestamp (relative below 24h)
- User-authored notes are visually distinct from system events (indented, note icon, author name)
- Default: show 10 most recent. "Se alla" expands or navigates to full log

### Standard Tab Library

| Tab Name | Typical Content |
|---|---|
| Översikt | Summary, recent activity, quick facts |
| Bokningar | Booking list for this record |
| Ekonomi | Financial summary, invoices, payments |
| Kurser | Enrolled courses, completion progress |
| Dokument | Uploaded documents, signed forms |
| Kommunikation | Message history related to this record |
| Anteckningar | Staff notes |
| Aktivitet | Full audit/event log |

---

## Contract 4 — Create / Edit Page

**Applies to:** Create Student, Edit Student, Create Instructor, Edit Instructor, Create Invoice, Create Package, Edit Settings, and all future create/edit workflows that do not warrant a wizard

### Purpose

The Create/Edit page captures structured user input for creating or modifying a single record. It must be clear, linear, and forgiving — the user should never be confused about what to fill in or what happens when they save.

### Layout Blueprint

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: PAGE HEADER                              [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Breadcrumb]                                               │
│  Ny elev / Redigera Anna Svensson                           │
│  Subtitle: "Fyll i elevens uppgifter"                       │
├─────────────────────────────────────────────────────────────┤
│  ZONE 2: FORM BODY                                [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  ┌──────────────────────────────────┬────────────────────┐  │
│  │ Form Sections (2/3)             │ Info Panel (1/3)   │  │
│  │                                 │ [optional]         │  │
│  │ ┌─────────────────────────────┐ │                    │  │
│  │ │ Section 1: Grunduppgifter  │ │ [Help text,        │  │
│  │ │ [field] [field]            │ │  field guidance,   │  │
│  │ │ [field] [field]            │ │  related info]     │  │
│  │ └─────────────────────────────┘ │                    │  │
│  │ ┌─────────────────────────────┐ │                    │  │
│  │ │ Section 2: Kontaktuppgifter│ │                    │  │
│  │ │ [field] [field]            │ │                    │  │
│  │ └─────────────────────────────┘ │                    │  │
│  └──────────────────────────────────┴────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ZONE 3: STICKY FORM FOOTER                       [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Avbryt]                            [Spara] / [Spara elev] │
└─────────────────────────────────────────────────────────────┘
```

### Zone Specifications

**Zone 1 — Page Header**
- *Required.*
- Breadcrumb: points back to the parent list (e.g., "Elever / Ny elev")
- Title: action-first — "Ny elev", "Redigera Anna Svensson", "Ny faktura"
- Subtitle: brief instruction (e.g., "Fyll i elevens grunduppgifter nedan")
- No actions in the header — all actions are in the sticky footer

**Zone 2 — Form Body**
- *Required.*
- **Maximum width:** `max-w-2xl` for simple forms; `max-w-4xl` with side panel
- **Form sections:** Group related fields under a section heading (`text-sm font-semibold text-foreground border-b pb-2 mb-4`)
- **Field layout:** Single column on mobile; two-column `grid grid-cols-2 gap-4` on desktop for short fields
- **Required fields:** Label ends with `*` in `text-destructive`
- **Inline validation:** Error appears below the specific field immediately on blur
- **Side panel (optional):** Right-column Card with contextual help, field explanations, or related entity summary (e.g., when editing a booking, show the student's profile in the side panel)

**Zone 3 — Sticky Form Footer**
- *Required.* Fixed to the bottom of the viewport while the form extends above.
- Left: "Avbryt" button (`variant="outline"`) — returns to previous page with confirmation if changes exist
- Right: Primary save button (`variant="default"`) — specific label: "Spara elev", "Spara faktura", "Skapa bokning"
- Loading state: save button shows spinner, disables, retains dimensions
- On success: navigate to the created/updated record's detail page + toast confirmation

### Sheet/Drawer Variant

When create/edit is triggered from within a list page (as a sheet), the same zones apply within the Sheet container:
- Zone 1 → SheetHeader (title + description)
- Zone 2 → SheetContent (scrollable form body, no side panel)
- Zone 3 → SheetFooter (Avbryt | Spara)

Sheet-based forms are used for records with ≤5 fields. More than 5 fields warrant a full-page form.

---

## Contract 5 — Wizard

**Applies to:** New Student enrollment, New Company enrollment, Package purchase, Corporate enrollment, Onboarding flow, and any multi-step workflow with 3+ sequential decisions

### Purpose

A wizard guides the user through a process that must happen in a defined sequence. The user must never feel lost — they always know which step they are on, how many remain, and what they need to provide.

### Layout Blueprint

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: WIZARD HEADER                            [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  Ny elev                                         [✕ Avsluta]│
├─────────────────────────────────────────────────────────────┤
│  ZONE 2: STEPPER                                  [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  ①─────────②─────────③─────────④                           │
│  Grundinfo  Körkort   Paket     Bekräfta                    │
│  [Done]     [Active]  [Pending] [Pending]                   │
├─────────────────────────────────────────────────────────────┤
│  ZONE 3: STEP CONTENT                             [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Step title]                                               │
│  [Step description / instruction]                           │
│                                                             │
│  [Step-specific form fields or selection UI]                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ZONE 4: WIZARD NAVIGATION                        [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [← Tillbaka]                          [Nästa → / Slutför] │
└─────────────────────────────────────────────────────────────┘
```

**Final step — Review**

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 3: REVIEW STEP                                        │
│  ─────────────────────────────────────────────────────────── │
│  Granska och bekräfta                                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Grunduppgifter                          [Redigera ✎] │   │
│  │ Namn: Anna Svensson                                  │   │
│  │ E-post: anna@email.com                               │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Paket                                   [Redigera ✎] │   │
│  │ Intensivpaket B — 3 490 kr                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [← Tillbaka]                              [Slutför]       │
└─────────────────────────────────────────────────────────────┘
```

**Completion Screen**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    ✓  (large check icon)                    │
│                                                             │
│               Anna Svensson har lagts till                  │
│                                                             │
│        [Gå till eleven]    [Lägg till en till]             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Zone Specifications

**Zone 1 — Wizard Header**
- *Required.*
- Left: wizard title ("Ny elev", "Nytt abonnemang")
- Right: "✕ Avsluta" Ghost button — exits the wizard with an "Osparade ändringar — vill du avsluta?" confirmation
- No breadcrumbs, no other actions. The wizard header is minimal.

**Zone 2 — Stepper**
- *Required.*
- Horizontal stepper at the top of the page (below header)
- Each step shows: number/icon + label
- Step states: completed (✓ green), active (primary blue, filled circle), pending (gray outline)
- Completed steps are clickable (navigate back without losing later data)
- Active step is NOT clickable
- Pending steps are NOT clickable
- Maximum 6 steps. More than 6 indicates the wizard needs redesign.
- On mobile: stepper shows only current step number + total ("Steg 2 av 4")

**Zone 3 — Step Content**
- *Required.* Changes on each step transition.
- Step title: `text-xl font-semibold` (same as page title)
- Step description: `text-sm text-muted-foreground`
- Content area: single-column form fields or selection UI
- Maximum `max-w-lg` for simple input steps; `max-w-2xl` for comparison/selection steps
- Each step must be independently valid — the "Nästa" button validates the current step before advancing

**Zone 4 — Wizard Navigation**
- *Required.* Fixed at the bottom of the wizard area (not viewport-sticky on full-page wizards).
- Left: "← Tillbaka" (`variant="outline"`) — goes to previous step; hidden on step 1
- Right: "Nästa →" (`variant="default"`) on interim steps; "Slutför" on final step
- Step 1: "Tillbaka" is replaced by "Avbryt" (same as Zone 1's exit)
- Validation runs on "Nästa" click; errors appear inline in Zone 3

---

## Contract 6 — Calendar

**Applies to:** Bokningsschema, Mitt schema, Instruktörschema, Fordonsschema

### Purpose

The calendar is a scheduling surface. It must support creating, viewing, and modifying time-bound records with minimal clicks. The current date and the user's immediate context (instructor view, vehicle view) must always be visible.

### Layout Blueprint

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: CALENDAR TOOLBAR                         [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  Row 1: [← Idag →]  [Month/Week/Day]    [Period label]     │
│  Row 2: [Instructor filter pills]  [Status filter]         │
├───────────────────────────────────────┬─────────────────────┤
│  ZONE 2: CALENDAR GRID                │  ZONE 3: SIDE PANEL │
│  [REQUIRED]                           │  [CONDITIONAL]      │
│  ─────────────────────────────────────│─────────────────────│
│                                       │                     │
│   [FullCalendar timeGridWeek /        │  [Slot or booking   │
│    timeGridDay / listWeek]            │   detail — appears  │
│                                       │   when event is     │
│                                       │   clicked]          │
│                                       │                     │
└───────────────────────────────────────┴─────────────────────┘
│  ZONE 4: DETAILS DRAWER                         [CONDITIONAL]│
│  ─────────────────────────────────────────────────────────── │
│  Sheet from right: slot/booking detail + actions            │
└─────────────────────────────────────────────────────────────┘
```

### Zone Specifications

**Zone 1 — Calendar Toolbar (Row 1)**
- *Required.*
- Navigation: "←" (previous period), "Idag" (jump to today), "→" (next period)
- View switcher: "Dag" | "Vecka" | "Månad" — currently active view is highlighted
- Period label: "{Vecka 27 — Jul 1–7, 2026}" centered or right-aligned
- On mobile: Dag is default view; Vecka shows on md+

**Zone 1 — Calendar Toolbar (Row 2)**
- *Required when multi-instructor context.*
- Instructor filter pills: one pill per instructor; "Alla" default; active instructor highlighted in primary
- Status filter: "Lediga tider" | "Bokade" | "Alla"
- Mobile: horizontal scroll row of pills

**Zone 2 — Calendar Grid**
- *Required.*
- Renders FullCalendar with organization's design token overrides
- Standard slot intervals: 07:00–08:30, 08:30–10:00, 10:00–11:30, 12:00–13:30, 13:30–15:00, 15:00–16:30
- Event card: instructor last name (or "Ledig"), status color, booking count badge
- Drag-and-drop: enabled on desktop for rescheduling (with confirmation dialog on drop)
- Today column: subtle primary-tinted background
- Now indicator: destructive (red) line

**Zone 3 — Side Panel (Desktop)**
- *Conditional.* Appears at 1/3 width on the right when an event is clicked on desktop.
- Shows: slot details, booked students, available slots, quick actions (Boka, Avboka, Redigera)
- Closes when clicking outside the event or pressing Escape

**Zone 4 — Details Drawer (Mobile)**
- *Conditional.* Sheet from bottom on mobile when an event is tapped.
- Same content as desktop side panel but in Sheet/drawer format
- Full-width, 75% screen height, draggable

---

## Contract 7 — Finance Page

**Applies to:** Fakturering, Betalningar, Kassaregister, Bokföring, Ekonomiöversikt, Redovisning

### Purpose

Finance pages present financial data that must be precise, auditable, and trustworthy. The layout must communicate authority — no ambiguity about amounts, dates, or record states.

### Layout Blueprint

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: PAGE HEADER                              [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Breadcrumb]                                               │
│  Fakturering                  [Exportera] [Ny faktura]      │
├─────────────────────────────────────────────────────────────┤
│  ZONE 2: FINANCIAL KPI STRIP                      [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Total utgående] [Ej betalda] [Förfallna] [Betalt i mån.] │
├─────────────────────────────────────────────────────────────┤
│  ZONE 3: FILTER & PERIOD SELECTOR                 [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Period: Jul 2026 ▾]  [Status ▾]  [Typ ▾]  [Sök...]      │
├─────────────────────────────────────────────────────────────┤
│  ZONE 4: LEDGER / DATA TABLE                      [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Fakturanr] [Mottagare] [Datum] [Förfallodag] [Belopp] [S]│
│  Row data…                                                  │
│  ─────────────────────────────────────────────────────────── │
│  [Pagination]                                               │
├─────────────────────────────────────────────────────────────┤
│  ZONE 5: PERIOD SUMMARY                         [CONDITIONAL]│
│  ─────────────────────────────────────────────────────────── │
│  Summering: {period}                                        │
│  Utgående: X kr  |  Inkommande: Y kr  |  Netto: Z kr       │
├─────────────────────────────────────────────────────────────┤
│  ZONE 6: EXPORT & AUDIT FOOTER                  [CONDITIONAL]│
│  ─────────────────────────────────────────────────────────── │
│  [Exportera SIE4] [Exportera CSV] | Senast exporterat: …   │
└─────────────────────────────────────────────────────────────┘
```

### Zone Specifications

**Zone 2 — Financial KPI Strip**
- *Required.* 4-column grid (2 on mobile).
- Values in SEK: always use thousand separators, always include "kr" suffix
- Amber on overdue/outstanding, green on paid/cleared, neutral on pending

**Zone 3 — Filter & Period Selector**
- *Required.* Period selector is always the first control.
- Period selector: "Jan 2026", "Feb 2026", etc. — defaults to current month
- Status filter, record type filter, search
- When period filter changes, Zone 2 KPIs update to match

**Zone 4 — Ledger / Data Table**
- *Required.* Follows List Page Contract table rules with additional financial column standards:
  - Amount columns: right-aligned, `tabular-nums font-mono text-sm`
  - Invoice number: `font-mono text-xs text-muted-foreground`
  - Due date: color-coded — past due in `text-destructive`, due today in `text-amber-600`
  - Immutable records (journal entries, posted invoices) have no edit action in the row menu

**Zone 5 — Period Summary**
- *Conditional.* Appears below the table when a specific period is selected.
- Shows period totals: income, expenses, net, VAT breakdown
- Never editable — display only

**Zone 6 — Export & Audit Footer**
- *Conditional.* Appears on accounting-facing pages (Bokföring, SIE4, AGI).
- Export buttons for compliance formats (SIE4, CSV, AGI)
- Audit trail: "Senast exporterat: {date} av {user}"
- Exported periods are visually distinguished (locked indicator)

---

## Contract 8 — Reports Page

**Applies to:** Rapporter, Statistik, Insikter, KPI Dashboard

### Purpose

The reports page lets users understand trends, measure performance, and make informed decisions. It must balance analytical depth with everyday readability.

### Layout Blueprint

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: PAGE HEADER                              [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  Rapporter                   [Spara vy]  [Exportera]       │
├─────────────────────────────────────────────────────────────┤
│  ZONE 2: REPORT CONTROLS                          [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Period ▾]  [Instruktör ▾]  [Typ ▾]  [Jämför med ▾]      │
├─────────────────────────────────────────────────────────────┤
│  ZONE 3: KPI SUMMARY ROW                          [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  [Metric 1]  [Metric 2]  [Metric 3]  [Metric 4]            │
│  With trend vs. previous period                             │
├─────────────────────────────────────────────────────────────┤
│  ZONE 4: CHART AREA                               [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  ┌──────────────────────────────┬────────────────────────┐  │
│  │ Primary Chart (2/3)         │ Secondary Chart (1/3)  │  │
│  │ [Bar/Line chart]            │ [Pie/Donut]            │  │
│  └──────────────────────────────┴────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ZONE 5: DATA TABLE                               [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  Detaljerad data                                            │
│  [Sortable table with the underlying chart data]            │
│  [Pagination]                                               │
└─────────────────────────────────────────────────────────────┘
```

### Zone Specifications

**Zone 2 — Report Controls**
- *Required.* Always visible; updates all zones below when changed.
- Period selector: date range or preset ("Denna månad", "Förra kvartalet", "Anpassat")
- Comparison: optional period comparison toggle (e.g., "Jämför med förra månaden")
- Instructor and category filters

**Zone 3 — KPI Summary Row**
- *Required.* Always above charts. KPIs reflect the selected period.
- Each KPI includes a trend arrow and delta vs. comparison period

**Zone 4 — Chart Area**
- *Required.* Charts are placed above the data table.
- Charts must have: title, axis labels, legend, tooltip on hover
- Charts are not interactive (drill-down is out of scope unless explicitly designed)
- Loading state: CardSkeleton in chart dimensions

**Zone 5 — Data Table**
- *Required.* Always below charts. Provides the raw data behind the visualizations.
- Same data as charts but in tabular form — allows copy/export
- Exportable as CSV via "Exportera" in Zone 1

---

## Contract 9 — Settings Page

**Applies to:** Inställningar, Systeminställningar, Organisationsinställningar, Profilinställningar

### Purpose

Settings pages allow users to configure the system. They must feel stable, clear, and safe — settings changes have lasting consequences and must never feel ambiguous.

### Layout Blueprint

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: PAGE HEADER                              [REQUIRED] │
│  ─────────────────────────────────────────────────────────── │
│  Inställningar                                              │
├──────────────────┬──────────────────────────────────────────┤
│  ZONE 2:         │  ZONE 3: SETTINGS PANEL                  │
│  SETTINGS NAV    │  ─────────────────────────────────────── │
│  [REQUIRED]      │  [Section title]                        │
│  ──────────────  │  [Section description]                  │
│  Allmänt         │                                         │
│  Kontaktuppgifter│  ┌──────────────────────────────────┐   │
│  Användare       │  │ Setting group 1                  │   │
│  Behörigheter    │  │ [label] [input / toggle / select]│   │
│  Integrationer   │  │ [label] [input / toggle / select]│   │
│  Notifikationer  │  └──────────────────────────────────┘   │
│  Fakturering     │  ┌──────────────────────────────────┐   │
│  Säkerhet        │  │ Setting group 2                  │   │
│  ──────────────  │  │ [Danger Zone — red border]       │   │
│                  │  └──────────────────────────────────┘   │
├──────────────────┴──────────────────────────────────────────┤
│  ZONE 4: SETTINGS FOOTER                        [CONDITIONAL]│
│  ─────────────────────────────────────────────────────────── │
│  [Avbryt]                                       [Spara]    │
└─────────────────────────────────────────────────────────────┘
```

### Zone Specifications

**Zone 2 — Settings Navigation**
- *Required.* Left-column nav list (`w-48`) on desktop; horizontal scrollable tabs on mobile
- Active category: `font-semibold text-foreground` + left border
- Categories are logical groupings — not alphabetical

**Zone 3 — Settings Panel**
- *Required.* Each setting category renders in this panel.
- Section title + description at top
- Setting groups use `Card` component with internal spacing
- "Danger Zone" group has `border-2 border-destructive/30` — contains irreversible settings (delete org, reset data)
- Toggle switches use `Switch` component — change takes effect on toggle (no save needed) unless explicitly batched
- Text inputs and selects batch their changes — a footer save button appears when unsaved changes exist

**Zone 4 — Settings Footer**
- *Conditional.* Appears only when there are unsaved batched changes.
- Sticky to bottom of the panel area (not viewport)
- "Avbryt" (resets unsaved changes), "Spara" (saves all pending changes in the panel)
- Disappears after successful save

---

## Contract 10 — Student Portal

**Applies to:** All pages within `/portal/*` (verified against the live implementation during Production Readiness Sprint 4; superseded the originally-specified `/student-portal/*` prefix, which was never built — the deployed routes use Swedish slugs and were already in active use with distributed student-token URLs, so the routes are treated as authoritative and this document corrected to match, not the other way around).

### Portal Shell

```
Desktop (≥768px):                    Mobile (<768px):
┌────────┬────────────────────────┐  ┌────────────────────────┐
│ Sidebar│ Content Area           │  │ Content Area           │
│ 256px  │ (scrollable)           │  │ (scrollable)           │
│        │                        │  │                        │
│ Logo   │ ← Page renders here    │  │ ← Page renders here    │
│        │                        │  │                        │
│ Nav    │                        │  │                        │
│        │                        │  ├────────────────────────┤
│        │                        │  │ Bottom Tab Bar (64px)  │
└────────┴────────────────────────┘  └────────────────────────┘
```

### Page Hierarchy

| Route | Page | Contract |
|---|---|---|
| `/portal` | Dashboard | Student Dashboard Contract |
| `/portal/bokningar` | My Bookings (upcoming + history tabs) | Student List Contract |
| `/portal/boka` | Book a Lesson | Booking Wizard Contract |
| `/portal/framsteg` | My Progress | Student Progress Contract |
| `/portal/konto` | Payments & Economy | Student Finance Contract |
| `/portal/meddelanden` | Messages | Student Messaging Contract |
| `/portal/installningar` | My Profile | Student Profile Contract |
| `/portal/support` | Support | Student Support Contract |

Additional pages beyond the original spec, verified in active use and retained as-is (Sprint 4): `/portal/teori` (theory quiz), `/portal/material` (study materials), `/portal/ovningskörning` (private practice log), `/portal/min-larare` (my instructor), `/portal/dokument` (documents), `/portal/korkortsresa` (licence journey timeline), `/portal/utbildningskort` (competency card).

### Student Dashboard Contract

```
┌─────────────────────────────────────────────────────────────┐
│  Välkommen, Anna!                                           │
│  [Boka lektion] CTA button                  [date]         │
├─────────────────────────────────────────────────────────────┤
│  Nästa lektion                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [Calendar icon] Tisdag 15 jul • 09:00–10:30          │  │
│  │ Instruktör: Erik Lindström                           │  │
│  │ [Avboka] [Lägg till i kalender]                      │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Min framsteg                [Se alla →]                    │
│  [Progress bar — lessons completed / total]                 │
│  12 av 20 lektioner genomförda                             │
├─────────────────────────────────────────────────────────────┤
│  Kommande lektioner          [Boka ny →]                    │
│  [Compact list of next 3 upcoming lessons]                  │
├─────────────────────────────────────────────────────────────┤
│  Snabblänkar                                                │
│  [Mina betalningar] [Meddelanden] [Mitt paket]             │
└─────────────────────────────────────────────────────────────┘
```

### Student Portal Rules

1. CTA "Boka lektion" must be visible on every page — in the TopBar on desktop, as a FAB on mobile (if relevant) or prominently in the content.
2. The student's name is used in the greeting on the dashboard.
3. Progress indicators (progress bars, lesson count) are displayed in the portal accent color.
4. Students may view invoices and their own packages/credits (read-only), and may **initiate their own payment** via Swish or card checkout for an outstanding balance — this was verified during Production Readiness Sprint 4 as a real, intentional, fully-built capability (`StudentPortalKontoPage.tsx`) and this document is corrected to match; students still cannot create or edit an invoice itself, only pay one.
5. The bottom tab bar on mobile always has exactly 5 tabs in this order: Hem, Boka, [Boka FAB center], Mina lektioner, Profil.

---

## Contract 11 — Guardian Portal

**Applies to:** All pages within `/guardian/*` (verified against the live implementation during Production Readiness Sprint 4; superseded the originally-specified `/guardian-portal/*` prefix, which was never built — the deployed routes use Swedish slugs and were already in active use with distributed guardian-token URLs, so the routes are treated as authoritative and this document corrected to match, not the other way around).

### How It Differs from Student Portal

| Dimension | Student Portal | Guardian Portal |
|---|---|---|
| Accent color | `#684EFF` (violet) | `#2D5BE3` (deep blue) |
| Primary persona | The student themselves | A parent monitoring a student |
| Primary action | "Boka lektion" | "Se framsteg" |
| Payment actions | View own payments | View student's payments (read-only) |
| Booking actions | Can book | Cannot book (contacts school instead) |
| Mobile center action | Boka FAB | Progress indicator |
| Information density | Medium | Low (guardian is a secondary user) |

### Guardian Portal Page Hierarchy

| Route | Page |
|---|---|
| `/guardian` | Dashboard (student progress overview) |
| `/guardian/framsteg` | Detailed progress view |
| `/guardian/schema` | Upcoming lessons |
| `/guardian/bokningar` | Lesson history |
| `/guardian/ekonomi` | Payment summary (read-only) |
| `/guardian/meddelanden` | Contact school |
| `/guardian/konto` | Guardian profile |
| `/guardian/dokument` | Documents |

Additional pages beyond the original spec, verified in active use and retained as-is (Sprint 4): `/guardian/korkortsresa` (licence journey timeline), `/guardian/riskutbildning` (risk-training tracker). Lesson history is split across two pages (`schema` for upcoming, `bokningar` for history) rather than the single `lessons` route originally specified — retained as-is, both are real and fully wired.

### Guardian Dashboard Contract

```
┌─────────────────────────────────────────────────────────────┐
│  Anna Svenssons körkortsresa                                │
│  [Elev: Anna]  [Skola: Sundsvalls Trafikskola]             │
├─────────────────────────────────────────────────────────────┤
│  Framsteg                                                   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   12 / 20 lektioner │
│  Beräknad klar: September 2026                              │
├─────────────────────────────────────────────────────────────┤
│  Nästa lektion                                              │
│  [Next lesson card — same as Student Portal]                │
├─────────────────────────────────────────────────────────────┤
│  Betalningsstatus                                           │
│  [Balance summary — read-only]                              │
├─────────────────────────────────────────────────────────────┤
│  Kontakta skolan            [📞 Ring] [✉️ Skicka meddelande]│
└─────────────────────────────────────────────────────────────┘
```

### Guardian Portal Rules

1. No booking capability — guardians observe, they do not act on schedules.
2. Contact CTA (ring/meddelande) must be visible on every page.
3. Student identity (name, photo initial) is always shown — guardian may have multiple children in the future.
4. Mobile bottom nav: Hem | Framsteg | [Progress circle center] | Betalningar | Kontakt
5. The raised center element shows the progress circle (not a FAB for creating records).

---

## Contract 12 — Instructor Portal

**Applies to:** All pages within `/instructor-portal/*` and `/instructor-app/*`

### Portal Variants

| Variant | Surface | Primary use |
|---|---|---|
| Instructor Portal | `/instructor-portal/*` | Desktop + tablet, full feature set |
| Instructor App | `/instructor-app/*` | Mobile-only, optimized for between-lesson use |

Both use accent color `#0F7E6B` (teal).

### Instructor Portal Page Hierarchy

| Route | Page | Contract |
|---|---|---|
| `/instructor-portal` | Dashboard (today's lessons) | Instructor Dashboard Contract |
| `/instructor-portal/today` | Today's Lessons | Instructor List Contract |
| `/instructor-portal/schedule` | Week Schedule | Calendar Contract |
| `/instructor-portal/students` | My Students | Instructor Student List Contract |
| `/instructor-portal/attendance` | Attendance Log | Instructor List Contract |
| `/instructor-portal/messages` | Messages | Instructor Messaging Contract |
| `/instructor-portal/profile` | My Profile | Edit Contract |
| `/instructor-portal/availability` | My Availability | Calendar/Edit Contract |

### Instructor Dashboard Contract

```
┌─────────────────────────────────────────────────────────────┐
│  God morgon, Erik!                          [datum]         │
│  3 lektioner idag                                           │
├─────────────────────────────────────────────────────────────┤
│  Idag                                                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 08:30 │ Anna Svensson  │ Körövning B  │ [Närvaro ✓] │  │
│  │ 10:00 │ Johan Berg     │ Risk 2       │ [Närvaro ✓] │  │
│  │ 13:30 │ Sara Holm      │ Körövning B  │ [Kommande]  │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Mina elever denna vecka     [Se alla →]                    │
│  [Compact student chip list]                                │
├─────────────────────────────────────────────────────────────┤
│  Meddelanden                 [Se alla →]                    │
│  [Last 3 unread messages]                                   │
└─────────────────────────────────────────────────────────────┘
```

### Instructor Portal Rules

1. Attendance marking (Närvaro ✓ / Uteblev ✗) must be accessible from the lesson list with maximum 2 taps — never buried behind a detail page.
2. Today's lessons are always the first content after the greeting — this is the instructor's primary job.
3. Mobile center FAB: "Ny lektion" (creates a quick lesson record).
4. The Instructor App (`/instructor-app/*`) is mobile-only. It should not be accessed or rendered on desktop — redirect to Instructor Portal on md+.
5. Instructor App bottom nav: Idag | Schema | Elever | Statistik | Profil.

---

## Contract 13 — Platform Admin

**Applies to:** All pages within `/platform/*`

### Platform Shell

Platform Admin uses its own shell (`PlatformShell`) with `PlatformSidebar` and `PlatformTopBar`. The layout contract applies within that shell.

### Platform Admin Page Hierarchy

| Route | Page | Contract |
|---|---|---|
| `/platform` | Platform Dashboard | Platform Dashboard Contract |
| `/platform/organizations` | Organizations List | List Contract |
| `/platform/organizations/:id` | Organization Detail | Detail Contract |
| `/platform/subscriptions` | Subscriptions | Finance Contract |
| `/platform/billing` | Billing | Finance Contract |
| `/platform/operations` | Operations | Reports Contract |
| `/platform/monitoring` | System Monitoring | Platform Monitoring Contract |
| `/platform/audit-logs` | Audit Logs | List Contract (read-only) |
| `/platform/users` | Platform Users | List Contract |
| `/platform/announcements` | Announcements | List + Create Contract |

### Platform Dashboard Contract

```
┌─────────────────────────────────────────────────────────────┐
│  Plattformsöversikt                         [datum]         │
│  [Platform status indicator]                                │
├─────────────────────────────────────────────────────────────┤
│  ALERT STRIP (if system issues exist)                       │
├─────────────────────────────────────────────────────────────┤
│  [Aktiva org] [MRR] [Nya trials] [Support-kö]              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┬────────────────────────┐  │
│  │ Nya organisationer (7 dagar) │ Systemhändelser        │  │
│  │ [Organization list]          │ [Event log]            │  │
│  └──────────────────────────────┴────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  [Abonnemangsfördelning]  [Topp-aktivitet]  [Felfrekvens]  │
└─────────────────────────────────────────────────────────────┘
```

### Platform Admin Rules

1. Platform admin pages must visually communicate that the user is in a privileged context. The amber/gold accent color serves this purpose.
2. Organization detail pages display a "Du ser en kunds data" (You are viewing a customer's data) banner when drilling into a tenant's records.
3. Destructive platform-level actions (delete organization, reset tenant) require two-step confirmation: type the organization name + click confirm.
4. Audit log pages are read-only. No edit or delete actions exist on any row.
5. Platform Admin must have mobile support (unlike the current baseline). Mobile uses the Sheet-overlay sidebar pattern.

---

## Contract 14 — Public Catalog

**Applies to:** All pages within `/catalog/*` (the public-facing school website)

### Public Shell

The Public Catalog has no shared shell component — each page is standalone. A `PublicLayout` component (to be created in WP-PUBLIC) will wrap all public pages with a consistent header and footer.

```
┌─────────────────────────────────────────────────────────────┐
│  PUBLIC HEADER (sticky)                                     │
│  [School logo] [School name]              [Kontakta oss]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PAGE CONTENT (varies by page type)                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  PUBLIC FOOTER                                              │
│  [School info] [Contact] [Opening hours] [Privacy policy]  │
└─────────────────────────────────────────────────────────────┘
```

### Public Page Hierarchy

| Route | Page | Contract |
|---|---|---|
| `/catalog` | Landing / Package List | Public Catalog Contract |
| `/catalog/package/:id` | Package Detail | Public Detail Contract |
| `/catalog/courses` | Courses | Public List Contract |
| `/catalog/pricing` | Pricing | Public Pricing Contract |
| `/catalog/contact` | Contact | Public Form Contract |
| `/catalog/faq` | FAQ | Public FAQ Contract |
| `/catalog/book` | Booking Request | Public Form Contract |

### Public Catalog Landing Contract

```
┌─────────────────────────────────────────────────────────────┐
│  PUBLIC HEADER                                              │
├─────────────────────────────────────────────────────────────┤
│  HERO SECTION                                               │
│  [School name]                                              │
│  [Tagline]                                                  │
│  [Kontakta oss] [Se paket] CTAs                            │
├─────────────────────────────────────────────────────────────┤
│  CATEGORY FILTER PILLS                                      │
│  [Alla] [Körkort B] [Intensiv] [MC] [Lastbil]              │
├─────────────────────────────────────────────────────────────┤
│  PACKAGE GRID                                               │
│  [Package Card] [Package Card] [Package Card]               │
│  [Package Card] [Package Card] [Package Card]               │
│  3 cols desktop → 2 cols tablet → 1 col mobile             │
├─────────────────────────────────────────────────────────────┤
│  CTA SECTION                                                │
│  "Redo att börja? Kontakta oss idag."                       │
│  [Kontakta oss]                                             │
├─────────────────────────────────────────────────────────────┤
│  PUBLIC FOOTER                                              │
└─────────────────────────────────────────────────────────────┘
```

### Public Catalog Rules

1. Every package card must show: name, brief description, price, and a single CTA ("Mer info" or "Boka nu").
2. Contact CTA is always visible in the sticky header.
3. SEO: every public page has `<title>`, `<meta name="description">`, and JSON-LD structured data.
4. No authentication required. Public pages must be accessible without login.
5. No workspace or portal navigation elements may appear on public pages.

---

## Contract 15 — Global Layout Rules

These rules apply to every page across every surface. No exceptions.

### Structural Rules

| Rule | Specification |
|---|---|
| **Page title alignment** | Always left-aligned. Never centered. Never right-aligned. |
| **Primary action position** | Always top-right of the page header. Never left. Never bottom. |
| **Secondary actions position** | Immediately left of the primary action, in the page header. |
| **Destructive actions** | Always inside a `...` dropdown menu. Never as a visible page-level button. |
| **Filter bar position** | Always directly above the data table. Never below, never inside the table header. |
| **KPIs vs. charts** | KPIs always appear above charts. Never place charts above KPIs. |
| **Timeline/Activity** | Always the bottommost content zone on a detail page. |
| **Save button position** | Always right-aligned in forms and footer zones. |
| **Cancel button position** | Always left-aligned, to the left of the save button. |
| **Breadcrumb position** | Always above the page title, in the page header. |
| **Empty states** | Centered horizontally within the content area. Never left-aligned. |
| **Pagination** | Always below the data table. Never above. |
| **Toasts** | Top-right on desktop. Bottom-center on mobile. Never inside page content. |
| **Dialog position** | Centered in viewport. Never positioned relative to the triggering element. |
| **Sheet position (desktop)** | Slides from the right. |
| **Sheet position (mobile)** | Slides from the bottom. |
| **Loading skeletons** | Always match the dimensions of the content they replace. |

### Hierarchy Rules

| Content Type | Position |
|---|---|
| Alert / Warning banners | Immediately above KPIs (top of page content) |
| KPI cards | Before all other content (after header/alerts) |
| Filters | Before table/list |
| Table/list | After filters |
| Summary/totals | After table |
| Activity/timeline | Last zone on page |

### Spacing Rules

| Rule | Value |
|---|---|
| Between major page zones | `space-y-5` (20px) |
| Between card sections | `space-y-4` (16px) |
| Between form fields | `space-y-4` (16px) |
| Page horizontal padding | `px-4 sm:px-6 lg:px-8` |
| Card internal padding (standard) | `p-6` |
| Card internal padding (compact) | `p-4` |

---

## Contract 16 — Cross-Portal Consistency Rules

Different portals serve different user types. They may have different visual identities. But their interaction patterns must be consistent — a user who has used the Student Portal will be able to understand the Guardian Portal immediately.

### Universal Interaction Rules

| Rule | All Portals |
|---|---|
| **Login flow** | Same login form contract (email + password, Swedish labels) |
| **Loading screen** | Same layout — fullscreen, portal accent background, spinner, portal name |
| **Error screen** | Same layout — fullscreen, portal accent background, Shield icon, Swedish message, "Försök igen" |
| **Session expiry** | Redirect to login with "Din session har gått ut. Logga in igen." message |
| **Navigation item tap** | Navigates immediately — no hover preview |
| **Form submission** | Same feedback pattern: loading → success toast → navigate |
| **Empty states** | Same layout — centered icon + heading + description + optional CTA |
| **Confirmation dialogs** | Same pattern — title + description + [Cancel left] [Confirm right] |
| **Toast notifications** | Success = green, Error = red, Info = neutral |

### Visual Identity Consistency

Each portal has its own accent color. Within that constraint:

| Property | Rule |
|---|---|
| Font | Inter across all portals |
| Border radius | `0.5rem` for cards, `0.75rem` for portal nav items |
| Icon library | Lucide React across all portals |
| Typography scale | Same 8-step scale from Design Language Specification |
| Spacing system | Same 4px grid across all portals |
| Component library | Same `@platform/ui` components (adapted with portal accent CSS var) |

### What May Differ Between Portals

| Property | Permitted variation |
|---|---|
| Accent color | Each portal has a distinct color (defined in DLS) |
| Navigation pattern | Desktop sidebar vs. mobile bottom bar (defined per portal) |
| Background color | `#FFFFFF` or `#FAFAFA` for portal content areas |
| Sidebar width | 256px for all portals (standardized) |
| Information density | Lower density for student/guardian, higher for instructor |

### What May NOT Differ Between Portals

| Property | Reason |
|---|---|
| Loading/error screen structure | User expects the same rescue pattern in any crisis |
| Form validation behavior | Field error position, required field indicator, save button position |
| Dialog structure | Cancel/confirm position and behavior |
| Toast notification behavior | Auto-dismiss timing, position, type colors |
| Focus ring appearance | Accessibility requirement |
| Swedish terminology | Same glossary applies everywhere |

---

## Contract 17 — Navigation Rules

### Sidebar (Workspace + Platform Admin)

**Presence:** Desktop only (`hidden md:flex`). Mobile uses Sheet-overlay.

**Structure:**
```
[Org block — top, pinned]
[Nav section label]
  [Nav item]
  [Nav item]
[Nav section label]
  [Nav item]
─────────────
[User block — bottom, pinned]
```

**Behavior rules:**
1. The currently active route is always highlighted with the active state (left border + accent background).
2. Section labels are non-interactive — they are purely visual separators.
3. Collapsed items (if a section has sub-items) use an accordion expand pattern — not a flyout.
4. Sidebar never scrolls independently — it is full-height with the nav list scrollable only if it overflows the viewport.
5. The sidebar does not respond to hover to "expand" — it is always either open or replaced by the mobile sheet.

**Active state contract:**
- Background: `bg-sidebar-accent`
- Left border: `border-l-[3px] border-sidebar-primary`
- Text: `text-sidebar-accent-foreground`
- Icon: inherits text color (no separate icon color override)

### Top Bar

**Presence:** Fixed, full width on mobile (`left-0`), indented on desktop (`left-[280px]`).

**Left slot (desktop):** Empty — no org name, no logo.  
**Left slot (mobile):** Hamburger menu button only.

**Center slot:** Empty or page context title (only used in deeply nested contexts).

**Right slot (always in this order, left to right):**
```
[⌘K search pill] → [Dark mode toggle] → [Notification bell] → [Help menu] → [User menu]
```

**Behavior rules:**
1. The `⌘K` pill is always visible and clickable. It opens the CommandPalette.
2. Notification bell shows a count badge when there are unread notifications. Max display: 9+.
3. User menu opens a DropdownMenu — not a sheet or a dialog.

### Bottom Navigation (Portals — Mobile)

**Presence:** Fixed to bottom of viewport on mobile only. Hidden on md+.

**Structure:** 4–5 tabs. Center tab may be a raised FAB or special element.

**Behavior rules:**
1. Active tab: icon and label in portal accent color.
2. Touch target per tab: minimum 44×44px.
3. Labels are always visible (never icon-only bottom nav).
4. Tab labels are 1 word maximum ("Hem", "Boka", "Profil").
5. Badge counts on nav tabs use `text-[11px]` and portal accent background.

### Command Palette

**Trigger:** `⌘K` on Mac, `Ctrl+K` on Windows, clicking the `⌘K` pill in TopBar.

**Presence:** Workspace only (`/dashboard/*` and workspace module routes). Not in portals.

**Anatomy:**
```
┌─────────────────────────────────────────┐
│ 🔍 [Search input]               [Esc]  │
├─────────────────────────────────────────┤
│ Navigering                              │
│   → Dashboard                          │
│   → Elever                             │
│ Elever                                  │
│   🎓 Anna Svensson                     │
│   🎓 Johan Berg                        │
│ Senaste                                 │
│   → Faktura #2024-047                  │
└─────────────────────────────────────────┘
```

**Behavior rules:**
1. Opens as a Dialog (centered, modal) with a search input that auto-focuses.
2. Results are grouped by type.
3. Keyboard: Arrow Up/Down to navigate results, Enter to select, Escape to close.
4. Search triggers after 1 character for navigation items; after 2 characters for data search.
5. Maximum 5 results per group.

### Context Menus and Dropdowns

1. Row action menus use `MoreHorizontal` icon + `DropdownMenu`.
2. Dropdown opens below the trigger, aligned to the right edge.
3. Destructive items (Delete, Void, Cancel) are positioned last in the dropdown and styled with `text-destructive`.
4. A destructive dropdown item always opens a confirmation Dialog before executing.

### Drawers and Dialogs

**Dialog (use for):** Confirmations, small forms, critical alerts.
**Sheet/Drawer (use for):** Complex forms, detail panels, content that benefits from context continuity.

**Never use a dialog for:** Multi-step flows (use Wizard contract), large content bodies (use Sheet).  
**Never use a Sheet for:** Simple yes/no confirmations (use Dialog).

---

## Contract 18 — Acceptance Criteria

Every future UI deliverable (page, feature, component) must be verified against all applicable checks before it is considered complete.

### AC-1: Layout Contract Compliance

- [ ] The page maps to exactly one approved layout contract from this document
- [ ] All required zones of the contract are present and in the correct order
- [ ] No zones are added beyond the contract without a contract amendment
- [ ] Conditional zones appear only when their triggering condition is met
- [ ] Primary action is positioned top-right in the page header
- [ ] Save button is right-aligned, cancel is left-aligned
- [ ] Breadcrumbs are above the page title (when applicable)
- [ ] Filters are above the data table (when applicable)
- [ ] Empty state is present for all list/table surfaces
- [ ] Activity log is the last zone on all detail pages

### AC-2: Design Language Compliance

- [ ] All colors use CSS variables or token-mapped Tailwind classes (no hardcoded hex, no Tailwind color utilities for brand/semantic values)
- [ ] All font sizes are from the approved 8-step type scale (minimum 11px)
- [ ] All spacing uses the 4px-base grid (Tailwind spacing classes only, no inline `style` spacing)
- [ ] All interactive elements use `@platform/ui` components
- [ ] Icons are Lucide React, correct size and stroke weight for surface
- [ ] Loading states use skeleton components (not spinners in content areas)
- [ ] Status badges use the `StatusBadge` component and approved variant mapping
- [ ] Portal accent color is used only within its designated portal
- [ ] No two portals use the same accent color

### AC-3: Accessibility Compliance

- [ ] Minimum contrast ratio 4.5:1 for body text (verified with automated tool)
- [ ] Minimum contrast ratio 3:1 for UI components and icons
- [ ] All interactive elements reachable by Tab key in logical visual order
- [ ] Focus ring visible on all interactive elements (`ring-2 ring-primary ring-offset-2` never suppressed)
- [ ] All icon-only buttons have `aria-label`
- [ ] Page has exactly one `<h1>` that matches the page title
- [ ] Navigation uses `<nav>` landmark, main content uses `<main>`
- [ ] All images have `alt` text; decorative images have `alt=""`
- [ ] Dialogs have `aria-modal="true"` and `aria-labelledby`
- [ ] Touch targets minimum 44×44px on all mobile surfaces
- [ ] Focus moves to first element in dialogs/sheets on open; returns to trigger on close
- [ ] `prefers-reduced-motion` respected for all animations

### AC-4: Responsive Behavior

- [ ] Layout tested at 375px (mobile), 768px (tablet), 1024px (laptop), 1440px (desktop)
- [ ] No horizontal scroll at any breakpoint
- [ ] Tables collapse or scroll correctly on mobile
- [ ] Sheets use `side="bottom"` on mobile, `side="right"` on desktop
- [ ] Dialogs are full-screen on mobile
- [ ] Navigation sidebar hidden on mobile (Sheet-overlay used instead)
- [ ] Bottom tab bar hidden on desktop (portal pages only)
- [ ] No fixed-pixel-width content containers

### AC-5: Dark Mode

- [ ] Page renders without visual defects in dark mode
- [ ] No hardcoded light-mode colors remain in the component
- [ ] Contrast ratios pass in dark mode independently
- [ ] Skeleton loading states visible in dark mode
- [ ] Sidebar and TopBar render correctly in dark mode

### AC-6: Swedish Terminology

- [ ] All user-visible text is in Swedish (excluding international identifiers)
- [ ] Button labels are specific and action-describing ("Spara elev", not "OK")
- [ ] Empty states use the approved copy pattern (heading + description)
- [ ] Error messages are actionable in Swedish
- [ ] Terminology matches the approved glossary (Design Language Specification §14.8)
- [ ] Page title matches the sidebar nav item label for the same route

### AC-7: Component Reuse

- [ ] No UI logic duplicated from an existing component
- [ ] New reusable patterns added to `@platform/ui` before use in route files
- [ ] No bespoke card markup (`bg-white rounded-xl`) — Card component used
- [ ] No bespoke button markup — Button component used
- [ ] No bespoke table markup — DataTable component used
- [ ] EmptyState component used for all empty list/table states
- [ ] LoadingState / Skeleton used for all loading states
- [ ] Toaster is mounted once in AppShell — not inside routes

### AC-8: TypeScript Integrity

- [ ] `pnpm typecheck` passes with zero errors across all packages
- [ ] No `@ts-ignore` or `as any` introduced
- [ ] `exactOptionalPropertyTypes` satisfied
- [ ] `noUncheckedIndexedAccess` satisfied — array accesses guarded

---

## Appendix A — Contract Decision Tree

When beginning a new page, use this decision tree to determine which contract applies:

```
Is this the first page a user sees after login?
  └─ YES → Contract 1: Dashboard
  └─ NO ↓

Does this page show a list of multiple records?
  └─ YES → Contract 2: List Page
  └─ NO ↓

Does this page show all details for a single record?
  └─ YES → Contract 3: Detail Page
  └─ NO ↓

Does this page capture user input for creating or editing a record?
  └─ YES, 1–5 fields: Use a Sheet with Create/Edit contract
  └─ YES, 5+ fields: Contract 4: Create/Edit Page
  └─ YES, multi-step: Contract 5: Wizard
  └─ NO ↓

Does this page show a time-based calendar or schedule?
  └─ YES → Contract 6: Calendar
  └─ NO ↓

Does this page show financial transactions, invoices, or accounting?
  └─ YES → Contract 7: Finance Page
  └─ NO ↓

Does this page show charts, analytics, and performance metrics?
  └─ YES → Contract 8: Reports Page
  └─ NO ↓

Does this page configure system or organization behavior?
  └─ YES → Contract 9: Settings Page
  └─ NO ↓

Is this page within a specific portal (Student, Guardian, Instructor, Platform, Public)?
  └─ Student Portal → Contract 10
  └─ Guardian Portal → Contract 11
  └─ Instructor Portal → Contract 12
  └─ Platform Admin → Contract 13
  └─ Public Catalog → Contract 14
  └─ NO ↓

ESCALATE: This page type is not covered by an existing contract.
Document the case and create a contract amendment.
```

---

## Appendix B — Zone Quick Reference

| Zone Name | Required? | Description |
|---|---|---|
| Page Header | Required on all pages | Title, breadcrumb, page actions |
| Alert Strip | Conditional | System or data alerts above KPIs |
| KPI Grid | Required on Dashboard and Finance | 4-column stat cards |
| Filter Bar | Required on List pages | Search + filter controls above table |
| Bulk Action Bar | Conditional | Appears when rows selected |
| Data Table | Required on List/Finance pages | Primary data grid |
| Pagination | Required with Data Table | 25/page default |
| Status Summary Card | Required on Detail pages | At-a-glance record state |
| Tab Navigation | Required on Detail pages | Switches content panels |
| Activity Log | Required on Detail pages | Always bottommost zone |
| Sticky Form Footer | Required on Create/Edit pages | Cancel left, Save right |
| Wizard Stepper | Required on Wizard pages | Shows step position |
| Wizard Navigation | Required on Wizard pages | Back/Next/Finish |
| Calendar Toolbar | Required on Calendar pages | Period navigation + view switcher |
| Calendar Grid | Required on Calendar pages | FullCalendar instance |
| Financial KPI Strip | Required on Finance pages | Period-aware totals |
| Period Summary | Conditional | Appears on Finance pages with period filter |
| Export Footer | Conditional | Compliance export actions |
| Report Controls | Required on Report pages | Period + dimension filters |
| Chart Area | Required on Report pages | Visual analytics |
| Settings Navigation | Required on Settings pages | Category sidebar |
| Settings Panel | Required on Settings pages | Configuration forms |
| Settings Footer | Conditional | Appears when unsaved changes exist |

---

*This document is the official structural blueprint for TrafikskolaOS. All future page implementations must follow an approved contract from this document. Layout deviations require a documented contract amendment. Version amendments require design lead approval.*

*Next action: WP-DS — Design System Foundation implementation. Awaiting approval.*
