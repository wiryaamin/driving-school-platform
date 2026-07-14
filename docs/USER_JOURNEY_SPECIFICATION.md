# TrafikskolaOS — User Journey Specification

**Version:** 1.0  
**Date:** 2026-06-30  
**Status:** OFFICIAL — All navigation optimization and UX improvements must reference this document  
**Branch:** ui/modernization-v2  
**Authors:** Chief Product Strategist · UX Research Lead · Information Architect · Workflow Optimization Specialist

---

## Preamble

This document maps every major user journey across all portals and roles in TrafikskolaOS. For each journey it defines the entry point, navigation path, required screens, decision points, permissions needed, and the exit point. It then scores current workflow efficiency and identifies specific improvements.

**Methodology:** Journeys are mapped against the live route tree from `apps/web/src/app/router/routes.tsx` and the navigation configuration from `apps/web/src/shared/components/layout/Sidebar/Sidebar.tsx`. Click counts reflect the actual route hops a user makes in the current system — not a theoretical ideal.

**Reading this document:** Each journey has a Workflow Efficiency Score (WES) rated 1–10. A score of 10 means the workflow requires the minimum possible steps to accomplish its goal. Scores below 7 indicate a bottleneck that should be resolved during WP-NAV or WP-OPS.

---

## Part 1 — Persona Overview

### 1.1 Platform Administrator

**Role context:** The SaaS operator. Has `is_platform_admin = true` in JWT. Accesses the platform via `/platform/*`. Does not operate within any single trafikskola's data context.

**Primary goals:**
- Onboard new trafikskolor efficiently
- Monitor subscription health across all tenants
- Resolve support escalations without disrupting tenant operations
- Audit platform security and compliance

**Most frequent tasks:**
- Review new trial organizations (daily)
- Check platform dashboard for anomalies (daily)
- Respond to support escalations (as needed)
- Manage subscriptions that are past due (weekly)

**Daily workflows:**
1. `/platform/dashboard` → scan KPIs → investigate anomalies → `/platform/audit`
2. `/platform/organizations` → filter by trialing → review new signups

**Weekly workflows:**
1. `/platform/subscriptions` → filter past_due → contact or suspend
2. `/platform/organizations` → review usage per tenant → identify at-risk accounts

**Exceptional workflows:**
- Suspend/reactivate a tenant organization
- Impersonate a tenant for support investigation
- Promote a user to platform admin

**Information density preference:** High. Wants data tables with full context, not cards.

**Device split:** 95% desktop.

**UX priorities:** Speed of data access, audit trail visibility, tenant isolation confidence, clear status indicators.

---

### 1.2 Driving School Administrator (Trafikskola Admin / Owner)

**Role context:** The primary operator of a trafikskola's workspace. Has `role = admin` in JWT. Accesses the full workspace at `/` (protected routes). Responsible for all operational decisions.

**Primary goals:**
- Keep the school's schedule fully utilized
- Convert leads and new students efficiently
- Monitor financial health without needing an accountant for every question
- Generate compliant reports and accounting exports

**Most frequent tasks:**
- Review today's dashboard (every morning)
- Book or modify lessons (multiple times daily)
- Create invoices for students (weekly)
- Check outstanding payments (weekly)
- Generate monthly SIE4 export (monthly)

**Daily workflows:**
1. `/dashboard` → scan KPIs + today's schedule → address alerts
2. `/scheduling` → check calendar → fill gaps / confirm bookings
3. `/students` → check new leads or recently enrolled students

**Weekly workflows:**
1. `/finance/invoices` → create invoices for lessons given
2. `/finance/payments` → mark received payments
3. `/communication` → send reminders to students with upcoming lessons

**Exceptional workflows:**
- Corporate enrollment of multiple students from a company
- Month-end accounting close and SIE4 export
- Add a new instructor and configure their schedule template

**Information density preference:** Medium-high. KPIs prominent, then drill into detail.

**Device split:** 70% desktop, 30% tablet.

**UX priorities:** Fast scheduling, low-click booking, financial overview, student lifecycle visibility.

---

### 1.3 Receptionist

**Role context:** Front-desk operations staff at a trafikskola. Has `role = staff` in JWT with scoped permissions. Cannot access accounting, payroll, or system settings. Primary job is student intake, booking management, and phone queries.

**Primary goals:**
- Handle incoming student registrations quickly
- Book and reschedule lessons on behalf of students
- Answer availability questions
- Process cash and card payments

**Most frequent tasks:**
- Create new students from phone inquiries (multiple daily)
- Book lessons requested by students (multiple daily)
- Reschedule cancelled bookings (several daily)
- Check if a specific slot is available (many daily)
- Record payment at the counter (daily)

**Daily workflows:**
1. `/scheduling` → calendar view → check availability for inquiries
2. `/students` → search student → view bookings → reschedule if needed
3. `/finance/cash` → Kassa → record payment
4. Quick-create new student → assign package → create first booking

**Weekly workflows:**
1. `/scheduling/waitlist` → contact waitlisted students when slots open
2. `/students` → follow up with students who haven't paid

**Exceptional workflows:**
- Handle a student complaint (navigate to student detail → add note → communicate)
- Process a refund request

**Information density preference:** Medium. Needs information fast, not deep analysis.

**Device split:** 80% desktop (counter), 20% tablet (mobile reception).

**UX priorities:** Zero-friction search, one-click booking, payment fast-path, minimal navigation.

---

### 1.4 Instructor

**Role context:** A driving instructor. May access the workspace via `role = instructor`, the Instructor Portal at `/instructor-portal/*`, or the Instructor App at `/instructor-app/*`. Primarily interested in their own schedule and their students.

**Primary goals:**
- Know exactly what to do today — who, when, where
- Mark lesson attendance immediately after each lesson
- Track individual student progress
- Communicate with students

**Most frequent tasks:**
- Check today's schedule (every morning and between lessons)
- Mark lesson attendance (after each lesson)
- View a student's profile (before a lesson)
- Add a note on a lesson (after complex lessons)
- Check availability for schedule changes (weekly)

**Daily workflows (Instructor App on mobile):**
1. `/instructor-app` → Idag → lesson list → view student → post-lesson attendance mark
2. Check between-lesson: next student name, time, lesson type

**Daily workflows (Instructor Portal on desktop):**
1. `/instructor-portal` → dashboard → today's lessons → student detail
2. `/instructor-portal/schema` → week view → confirm schedule

**Weekly workflows:**
1. Review student progress notes (portal)
2. Check upcoming week's schedule
3. Flag availability exceptions (holidays, leave)

**Exceptional workflows:**
- Report a student as "not ready for theory exam"
- Request schedule change through admin
- Review attendance history for a specific student

**Information density preference:** Low on mobile (one lesson at a time), medium on desktop.

**Device split:** 60% mobile (Instructor App), 40% desktop (Instructor Portal).

**UX priorities:** Today first, attendance in one tap, student info always accessible, no administrative burden.

---

### 1.5 Student

**Role context:** A learner at a trafikskola. Accesses the Student Portal at `/portal/*`. Token-based authentication (no Supabase Auth required).

**Primary goals:**
- Book driving lessons at convenient times
- Track their own progress toward getting a license
- Pay for lessons and packages
- Communicate with the school

**Most frequent tasks:**
- Book a lesson (frequent, especially early in training)
- Check their upcoming lessons (weekly)
- View progress (weekly)
- Contact their school (occasional)

**Daily/weekly workflows:**
1. `/portal` → dashboard → next lesson reminder
2. `/portal/boka` → pick date → pick slot → confirm

**Monthly workflows:**
1. `/portal/konto` → check balance and payment history
2. `/portal/framsteg` → see how far along they are

**Exceptional workflows:**
- Cancel/reschedule a lesson
- View and download a document (e.g., contract)
- Change profile settings

**Information density preference:** Low. Consumer UX expected. Clarity over density.

**Device split:** 80% mobile, 20% desktop.

**UX priorities:** Booking is easy, progress feels encouraging, payment is transparent, contact is always one tap away.

---

### 1.6 Guardian

**Role context:** A parent or legal guardian of a student. Accesses the Guardian Portal at `/guardian/*`. Token-based authentication.

**Primary goals:**
- See what their child is learning and how far they've come
- Know when lessons are happening
- Understand what has been paid and what is due
- Contact the school if concerned

**Most frequent tasks:**
- Check student progress (weekly)
- Review upcoming lessons (weekly)
- View payment summary (monthly)

**Exceptional workflows:**
- Contact the school about a concern
- Download a document or certificate

**Information density preference:** Low. Guardian is a secondary, occasional user.

**Device split:** 70% mobile, 30% desktop.

**UX priorities:** Progress is clear and encouraging, lesson calendar is readable, no action is accidental, contact is always one tap away.

---

### 1.7 Corporate Customer Contact

**Role context:** An HR manager or fleet manager at a company that sends employees to the trafikskola for B or C-license training. Interacts with the school through the operator (admin/receptionist), not directly via a portal (no self-service portal exists yet for corporate contacts).

**Primary goals:**
- Know which of their employees are enrolled and progressing
- Receive consolidated invoices for their account
- Add or remove employees from the enrollment

**Most frequent tasks:**
- Call or email to add a new employee to the training program
- Request a status update on enrolled employees
- Dispute or query an invoice

**Primary workflow (handled by admin on their behalf):**
1. Admin: `/corporate` → find company → detail → add employee student → assign package

**Information density preference:** N/A — relies on the admin for portal access today.

**Device split:** N/A — indirect interaction.

**UX priorities:** Consolidated billing, employee progress visibility, efficient admin-side operations that minimize phone calls.

---

### 1.8 Public Visitor

**Role context:** A prospective student or guardian browsing online. Accesses the Public Catalog at `/catalog/:orgId` or the Public Booking page at `/book`. No authentication required.

**Primary goals:**
- Understand what courses and packages a school offers
- See pricing clearly
- Take the next step: contact the school, submit a booking request, or purchase online

**Most frequent tasks:**
- Browse packages
- View package details and pricing
- Submit a booking inquiry or purchase a package

**Conversion funnel:**
1. `/catalog/:orgId` → browse packages → `/catalog/:orgId/:packageId` → `/catalog/:orgId/:packageId/checkout` → `/catalog/:orgId/:packageId/confirmation`
2. `/book` → fill inquiry form → school receives lead in `/leads`

**Information density preference:** Very low. Marketing expectations, not business tool expectations.

**Device split:** 60% mobile, 40% desktop.

**UX priorities:** Immediate clarity on pricing, zero friction to inquire, trust signals (school identity, package details), fast checkout.

---

## Part 2 — User Journey Maps

---

### Journey 1 — New Student Registration

**Persona:** Receptionist or Driving School Admin  
**Trigger:** Phone call, walk-in, or inbound inquiry from a new student  
**Frequency:** Multiple times daily  
**Current WES:** 5/10

#### Navigation Path

```
ENTRY: /dashboard (Quick Action "Ny elev") OR /students (Button "Lägg till elev")
  ↓
SCREEN 1: Students list → Click "Lägg till elev" button
  ↓
SCREEN 2: Create student Sheet (opens from right)
  Fields: Förnamn, Efternamn, Personnummer, E-post, Telefon, Körkortsbehörighet
  ↓
  [Save] → Success toast
  ↓
SCREEN 3: Student detail page (auto-navigate after creation)
  ↓
  [Assign package? YES] → Finance tab → CreateInvoiceSheet
    ↓
    Select package → Set amount → Save invoice → Toast "Fakturan skapades"
    ↓
  [Book first lesson? YES] → Navigate to /scheduling
    ↓
SCREEN 4: Calendar → Find available slot → Click slot
  ↓
SCREEN 5: Slot detail sheet → Select student → Confirm booking
  ↓
EXIT: Booking confirmed. Student has been created, invoiced, and has their first booking.
```

**Required permissions:** `students:student:create`, `finance:invoice:create`, `scheduling:booking:create`

**Decision points:**
1. Does the student already exist? → Search first before creating
2. Does the student want a package immediately? → Invoice at creation time vs. later
3. Should the first lesson be booked now? → Calendar navigation required

**Current click count:** 12–15 clicks from dashboard to first booking confirmed

**Pain points:**
1. **Package assignment is a separate navigation step.** After creating a student, the user must navigate to the Finance tab on the detail page, then open a sheet, then select the package, then save the invoice. This is 4 additional steps that could be inline at creation.
2. **No duplicate check during creation.** A student with the same personnummer could be created twice. The form does not warn.
3. **After creation, the booking requires leaving the student context entirely** to navigate to the calendar, then find the student again by search within the slot booking sheet.
4. **No "next step" prompt** after student creation. The user must know to go to Finance, then go to Scheduling.

**Improvement opportunities:**
- Add a "Tilldela paket" step inside the creation sheet (optional step)
- Add a "Boka första lektion →" button on the student creation success screen
- Add duplicate personnummer detection on blur in the creation form
- Add a "Ny elev" entry in the Command Palette that opens the creation sheet from any page

---

### Journey 2 — Corporate Student Enrollment

**Persona:** Driving School Admin or Receptionist  
**Trigger:** A company contacts the school to enroll employees  
**Frequency:** Weekly  
**Current WES:** 4/10

#### Navigation Path

```
ENTRY: Sidebar → "Företagskunder" → /corporate
  ↓
SCREEN 1: Corporate list → [Company exists? YES: find company / NO: create]
  ↓
  [Create company] → Sheet form: Företagsnamn, Org.nr, Kontaktperson, Fakturauppgifter
  ↓ Save → Company detail page
  ↓
SCREEN 2: Company detail → "Anställda / Elever" tab
  ↓
  [Add employee] → Search for existing student OR create new student
  ↓
  [Student exists? YES: link / NO: navigate to /students → create → return]
  ↓                          ↑
  [PAIN: context break ──────┘ user must leave corporate context to create student]
  ↓
SCREEN 3: Back in company detail → Student linked to company
  ↓
  [Assign package to student?] → Navigate to student detail → Finance tab → Invoice
  ↓
  [Individual invoice or company invoice?] → DECISION POINT
  ↓
SCREEN 4: Finance → Fakturor → Ny faktura → Select company as recipient → Add student lines
  ↓
EXIT: Company account exists, students linked, consolidated invoice created.
```

**Required permissions:** `students:student:create`, `students:student:read`, `finance:invoice:create`

**Decision points:**
1. Is the company already in the system?
2. Are the employees already students or new?
3. Does the company want individual invoices per student or a consolidated company invoice?
4. Who is the billing contact?

**Current click count:** 18–25 clicks for a typical 3-employee enrollment

**Pain points:**
1. **Massive context break when creating new student employees.** The user navigates to `/corporate/:id`, then must navigate to `/students` to create each student, then navigate back to `/corporate/:id` to link them. No inline creation from within the company record.
2. **Consolidated invoicing is not guided.** The user must know to go to Finance, find the company as recipient, and manually add line items. There is no "Create company invoice" workflow from within the corporate detail page.
3. **No bulk enrollment.** Adding 5 employees requires 5 separate student creation + link operations.
4. **Package assignment per student is a separate journey** (see Journey 1 pain points).

**Improvement opportunities:**
- Inline "Lägg till anställd" inside company detail — either creates or links a student without leaving company context
- "Skapa företagsfaktura" button in company detail → pre-fills recipient, allows adding multiple students as line items
- Bulk import via CSV for large corporate enrollments

---

### Journey 3 — Lesson Booking (Admin / Receptionist Side)

**Persona:** Receptionist or Driving School Admin  
**Trigger:** Student calls to book, or admin proactively fills available slots  
**Frequency:** Many times daily — highest frequency workflow in the system  
**Current WES:** 7/10

#### Navigation Path

```
ENTRY: Sidebar → "Bokningsschema" → /scheduling
  ↓
SCREEN 1: Calendar (week view, default)
  → Filter by instructor (pill filter row)
  → Navigate to desired week (← →)
  ↓
  Click available slot (teal/green on calendar)
  ↓
SCREEN 2: Slot detail sheet (right panel on desktop)
  → Shows: date, time, instructor, available/booked count
  → Click "Boka"
  ↓
SCREEN 3: Booking creation sheet
  → Search student by name or personnummer
  → Select lesson type (Körlektion, Risk 1, Risk 2, etc.)
  → Optional: note
  → Click "Boka"
  ↓
  Success toast: "Bokningen skapades"
  ↓
EXIT: Booking confirmed. Calendar updates to show the booking.
```

**Required permissions:** `scheduling:booking:create`, `students:student:read`

**Decision points:**
1. Which instructor's calendar? (pill filter)
2. Which week? (navigation)
3. Which student? (search in sheet)
4. Which lesson type?

**Current click count:** 5–7 clicks from calendar to booking confirmed

**Pain points:**
1. **Instructor filter is required before the slot is meaningful.** If no instructor is filtered, the calendar shows aggregate slots that may be confusing. The default view should show a useful state without requiring a filter first.
2. **No confirmation of student balance/package.** When booking, the receptionist cannot see if the student has a remaining lesson balance or an outstanding invoice. This leads to overbooked students who haven't paid.
3. **Slot search is calendar-only.** There is no "find next available slot for instructor X on any day this week" feature — the user must manually scan the calendar.
4. **Rescheduling is a separate journey** (Journey 5) — cancelling and rebooking requires more clicks than it should.

**Improvement opportunities:**
- Show student's remaining package balance in the booking sheet (read-only, inline)
- Add a "Nästa lediga tid" feature: given an instructor and lesson type, jump to the next available slot
- Active balance warning if student has outstanding invoices when booking

---

### Journey 4 — Lesson Booking (Student Portal)

**Persona:** Student  
**Trigger:** Student wants to book their next lesson  
**Frequency:** Frequent (especially early in training)  
**Current WES:** 7/10

#### Navigation Path

```
ENTRY: /portal (Student Dashboard) → "Boka lektion" CTA button
  OR: Bottom nav → "Boka" tab
  ↓
SCREEN 1: /portal/boka
  → Date picker or calendar
  → Shows available slots for the student's assigned instructor
  ↓
  [Select date] → Available slots for that date appear
  ↓
  [Select slot] → Slot detail preview
  ↓
SCREEN 2: Booking confirmation panel
  → Shows: date, time, instructor name, lesson type
  → "Bekräfta bokning" button
  ↓
  Success state: "Bokningen bekräftad!" with lesson details
  ↓
EXIT: Student returns to /portal (dashboard) with the new lesson visible in "Kommande lektioner"
```

**Required permissions:** Portal token (no RBAC — student scope is defined by token)

**Decision points:**
1. Which date? (student chooses)
2. Which available slot? (student chooses from shown slots)

**Current click count:** 4–5 clicks from dashboard to booking confirmed

**Pain points:**
1. **Slot availability only shows the student's assigned instructor.** If the assigned instructor has no availability this week, the student sees no slots — with no explanation. They may think the system is broken.
2. **No lesson type selection in the student flow.** The lesson type (körlektion, teorigenomgång, etc.) is set by the instructor or admin — the student cannot specify what kind of lesson they need.
3. **No calendar context** in the `/portal/boka` page in the current implementation — the student picks dates without seeing their other upcoming lessons in the same view.
4. **Cancellation flow is separate** and not prominently discoverable in the current portal UI.

**Improvement opportunities:**
- Show a mini-calendar with existing bookings alongside the booking slots
- Show clear "Inga lediga tider den här veckan — prova nästa vecka →" when no slots exist
- Allow students to add a note/request when booking (e.g., "I want to practice highway driving")

---

### Journey 5 — Lesson Rescheduling

**Persona:** Receptionist, Admin, or Student (portal)  
**Trigger:** Student cancels or needs to change a booking  
**Frequency:** Multiple times daily (common operational event)  
**Current WES:** 5/10

#### Navigation Path (Admin Side)

```
ENTRY: /scheduling → calendar view
  ↓
  [Find existing booking] → Navigate to correct week → Identify booked slot
  ↓
SCREEN 1: Click booked slot → Slot detail sheet
  → Shows: booked student name, lesson type
  → Click "Avboka" 
  ↓
SCREEN 2: Cancellation confirmation dialog
  → Reason for cancellation (optional)
  → "Avboka" confirm button
  ↓
  Slot returns to available
  ↓
  [Rebook on new slot?] → 
SCREEN 3: Navigate to new date on calendar → Find slot → Click → Booking sheet
  → Student pre-populated? NO — must search again
  ↓
EXIT: Old booking cancelled, new booking created.
```

**Required permissions:** `scheduling:booking:update`, `scheduling:booking:delete`, `scheduling:booking:create`

**Decision points:**
1. Was the cancellation last-minute? (late cancellation policy may apply)
2. Does the student want to rebook immediately or later?

**Current click count:** 10–13 clicks from finding the booking to new booking confirmed

**Pain points:**
1. **Cancel and rebook are two completely separate operations** with no link between them. After cancelling, the student context is lost — the receptionist must search for the student again in the new booking sheet.
2. **Finding the original booking requires manual calendar navigation.** There is no "search bookings by student" quick path. The receptionist must know which week the booking is in.
3. **No reschedule action exists** — it is always cancel + rebook. A true reschedule operation (drag to new slot, or "move booking to this slot") would halve the click count.
4. **No late-cancellation tracking.** Cancellations within 24h are not flagged differently. Schools lose money on last-minute cancellations with no system support for tracking them.

**Improvement opportunities:**
- Add "Boka om" (reschedule) as a direct action on any booked slot — opens a slot-picker within the student's context, then moves the booking in one operation
- In the student search, offer "Visa alla bokningar" to find bookings without calendar navigation
- Flag cancellations within 24h with an amber tag and optional late-cancellation fee trigger
- `/scheduling/bokningar` (Bokningsflöde) should allow searching for a booking by student name directly

---

### Journey 6 — Package Purchase

**Persona:** Driving School Admin or Receptionist  
**Trigger:** Student wants to start training, needs a package  
**Frequency:** Multiple times weekly  
**Current WES:** 5/10

#### Navigation Path

```
OPTION A: From student detail
  ENTRY: /students → search student → /students/:id
    ↓
  SCREEN 1: Student detail → Finance tab (StudentFinancePanel)
    ↓
    "Skapa faktura" button → CreateInvoiceSheet
    ↓
  SCREEN 2: CreateInvoiceSheet
    → Select package from dropdown
    → Adjust price if discounted
    → "Spara faktura"
    ↓
    Invoice created (status: Utkast / Draft)
    ↓
  SCREEN 3: Navigate to /finance/invoices → Find the draft invoice → "Skicka" → "Bokför"
    ↓
  EXIT: Package invoice posted, student has active package credit.

OPTION B: From packages list
  ENTRY: Sidebar → "Paket" → /packages
    ↓
  SCREEN 1: Package list → Find package → Detail
    ↓
    "Sälj till elev" → Student search
    ↓
  [Continue as Option A from Step 2]
```

**Required permissions:** `finance:invoice:create`, `finance:package:read`, `students:student:read`

**Decision points:**
1. Which package? (standard vs. intensive vs. custom)
2. Is there a campaign/discount to apply?
3. Should the invoice be sent by email or printed?
4. Post invoice immediately or save as draft for review?

**Current click count:** 8–12 clicks (Option A), 10–14 clicks (Option B)

**Pain points:**
1. **Two distinct entry points to the same workflow** cause confusion about the canonical path. Should you start from the student or from the package? Both exist, neither is primary.
2. **Invoice posting is a separate step from creation.** A draft invoice must be manually found in `/finance/invoices` and posted. There is no "Create and post" single action.
3. **No campaign/discount is auto-applied.** If a campaign is active (e.g., "20% rabatt sommar 2026"), the receptionist must manually know about it and adjust the price. No automatic suggestion.
4. **Package selection shows all packages** — no filtering by license type (B, C, MC). A receptionist enrolling a truck driver sees the same package list as one enrolling a B-student.

**Improvement opportunities:**
- "Skapa och bokför faktura" as a primary action (create + post in one step, with confirmation)
- Auto-suggest active campaigns/discounts when creating an invoice for a package
- Filter packages by license category in the selection dropdown
- Surface package status (remaining lessons, credit balance) prominently on student detail

---

### Journey 7 — Payment Processing

**Persona:** Receptionist or Admin  
**Trigger:** Student pays for a lesson or package (cash, Swish, card at counter)  
**Frequency:** Multiple times daily  
**Current WES:** 6/10

#### Navigation Path

```
ENTRY: Sidebar → "Kassa" → /finance/cash
  OR: Sidebar → "Betalningar" → /finance/payments → "Ny betalning"
  ↓
SCREEN 1: Kassaregister (Cash Register)
  → Search student or invoice
  → Select invoice to pay against
  → Enter amount
  → Select payment method (Kontant, Swish, Bankkort)
  → "Registrera betalning"
  ↓
  Success: Payment recorded, invoice status updates to "Betald"
  ↓
  [Receipt needed?] → Print or email receipt
  ↓
EXIT: Payment recorded. Invoice marked paid. Student balance updated.
```

**Required permissions:** `finance:payment:create`, `finance:invoice:read`

**Decision points:**
1. Is the student paying a specific invoice or making a general deposit?
2. What payment method?
3. Is there change to give (cash payments)?
4. Does the student need a receipt?

**Current click count:** 4–6 clicks from Kassa to payment recorded

**Pain points:**
1. **Two entry points (Kassa vs. Betalningar) serve the same workflow** with unclear distinction. Staff are confused about which to use for walk-in payments.
2. **Kassa doesn't show outstanding invoices for the student upfront.** Staff must know the invoice number or manually search.
3. **No receipt generation path** is clearly surfaced after payment confirmation.
4. **Partial payments** are not handled — a student paying half now is not straightforward.

**Improvement opportunities:**
- Unify Kassa and Betalningar under a single "Registrera betalning" flow with payment type as the first choice
- Auto-show all outstanding invoices for a student as soon as they are found by search
- "Skriv ut kvitto" and "Skicka kvitto via e-post" buttons on the payment success screen

---

### Journey 8 — Invoice Generation (Monthly Billing Cycle)

**Persona:** Driving School Admin  
**Trigger:** End of month — generate invoices for all lessons given  
**Frequency:** Monthly (but individual invoice creation happens throughout)  
**Current WES:** 5/10

#### Navigation Path

```
ENTRY: Sidebar → "Fakturor" → /finance/invoices
  ↓
SCREEN 1: Invoice list → Filter: Period = "Denna månad", Status = "Utkast"
  ↓
  [Drafts exist? YES → review and post each one]
  [No drafts? Must create invoices for each student who had lessons this month]
  ↓
  OPTION A: Manual creation per student
    → Navigate to each student → Finance tab → Create invoice → Return to invoice list → Repeat
    ↓
    [PAIN: one invoice creation per student, no bulk path]
  ↓
  OPTION B: Bulk invoice from invoice list (if exists)
    → "Ny faktura" → Select recipient → Add line items manually
  ↓
SCREEN 2: Review invoice list → Select all drafts → "Skicka" (bulk action)
  ↓
SCREEN 3: Finance/Fortnox (if Fortnox sync active) → Export
  ↓
EXIT: All month's invoices posted and sent. Optional: SIE4 export.
```

**Required permissions:** `finance:invoice:create`, `finance:invoice:update`, `finance:fortnox:manage`

**Decision points:**
1. Does the school invoice per lesson or per package upfront?
2. Is Fortnox sync active?
3. Are there any students with disputed amounts?

**Current click count:** 8–12 clicks per student invoice; unscalable for schools with 50+ students

**Pain points:**
1. **No bulk invoice generation.** A school with 40 active students must create 40 invoices manually, one by one, navigating to each student's Finance tab.
2. **No lesson-based auto-invoice.** Lessons that have been completed are not auto-suggested as invoice line items. The admin must mentally recall what to invoice.
3. **No invoice preview before sending.** The current flow goes draft → send with no visual preview step.
4. **Fortnox export is a separate step** with its own navigation — not integrated into the invoice review flow.

**Improvement opportunities:**
- "Generera fakturor" batch operation: select a date range → system suggests an invoice per student based on completed lessons → admin reviews → bulk post
- Completed lesson checkbox suggesting invoice line item when creating an invoice for a student
- Preview modal before sending each invoice

---

### Journey 9 — Student Progression Tracking

**Persona:** Instructor or Admin  
**Trigger:** After a lesson, instructor records progress and notes  
**Frequency:** After every lesson (multiple daily for instructors)  
**Current WES:** 6/10

#### Navigation Path (Instructor App — primary)

```
ENTRY: /instructor-app → Idag tab
  ↓
SCREEN 1: Today's lesson list
  → Lesson tile: student name, time, lesson type
  → Tap lesson → Lesson detail
  ↓
SCREEN 2: Lesson detail
  → Mark attendance: [Närvande ✓] / [Uteblev ✗] / [Sen-avbokning]
  → Add lesson note (free text)
  → Save
  ↓
EXIT: Attendance recorded. Note saved to student's lesson history.

Navigation Path (Instructor Portal — desktop)
  ENTRY: /instructor-portal → dashboard → today's lessons
    ↓
  SCREEN 1: Today's lesson list
    ↓
  SCREEN 2: Click lesson → Lesson detail panel
    → Mark attendance → Add note → Save
    ↓
  EXIT: Same result.
```

**Required permissions:** `scheduling:booking:update` (attendance), `students:student:read`

**Decision points:**
1. Present or absent?
2. Is a late cancellation being recorded?
3. Are there notes worth recording? (skill observations, test readiness)

**Current click count:** 3–4 clicks per lesson (good)

**Pain points:**
1. **Progress tracking and attendance marking are conflated.** Marking "Närvande" records that the lesson happened, but doesn't capture what was practised, how well, or whether the student is progressing toward test readiness.
2. **The Utbildningskort (education card)** exists at `/instructor-portal/utbildningskort` and `/portal/utbildningskort` but is not surfaced from the attendance flow. After marking attendance, there is no prompt to update the education card.
3. **No test-readiness indicator.** The instructor has no standardized way to flag "this student is ready for theory exam" or "this student needs 3 more lessons before the road test."
4. **Progress notes are not visible to the student.** Notes entered by the instructor on a lesson are internal — the student sees no feedback in their portal.

**Improvement opportunities:**
- After marking attendance, prompt: "Vill du uppdatera utbildningskortet?" with a one-tap shortcut
- Add a simple 3-point skill rating system (Behöver öva / Godkänt / Väl godkänt) per lesson
- Optional: flag lesson as "test-redo" in instructor view
- Surface instructor lesson notes to students in `/portal/framsteg` (configurable per school)

---

### Journey 10 — Instructor Daily Workflow

**Persona:** Instructor  
**Trigger:** Start of the workday  
**Frequency:** Daily  
**Current WES:** 7/10

#### Navigation Path (Instructor App)

```
07:30 — ENTRY: /instructor-app (Idag tab — default on launch)
  ↓
SCREEN 1: Today's lesson list
  → See: 08:30 Anna Svensson – Körlektion B
  → See: 10:00 Johan Berg – Körlektion B
  → See: 13:30 Sara Holm – Risk 2
  ↓
  Before lesson: Tap student name → /instructor-app/elever/:id
  ↓
SCREEN 2: Student detail
  → Last lesson summary
  → Outstanding notes
  → Contact info (phone tap-to-call)
  ↓
  Return to lesson list (back button)
  ↓
  After lesson: Tap lesson → Mark attendance
  ↓
  [Repeat for each lesson]
  ↓
17:00 — SCREEN 3: /instructor-app/statistik → Check weekly summary
  ↓
EXIT: Day complete. All lessons marked. Notes recorded.
```

**Required permissions:** Instructor App token (own lessons + own students only)

**Current click count:** 2–3 clicks per lesson check, 3–4 per attendance mark

**Pain points:**
1. **No quick access to lesson notes from the day list.** To add a note, the instructor must tap the lesson → detail → note field. The note field is not visible on the day list.
2. **Between-lesson transition has no shortcut.** After finishing a lesson and marking attendance, the instructor must go back to the day list to find the next student — there is no "next lesson" shortcut.
3. **The LärarApp link in the workspace sidebar** (`/instructor-app`) takes workspace-authenticated instructors into the separate instructor app view. If they're logged in as a workspace user, this is a context switch that may or may not be intended.
4. **No push notification** when a student cancels a lesson — instructors find out at the last minute.

**Improvement opportunities:**
- "Nästa lektion →" button at the bottom of the attendance confirmation screen
- Quick-note input directly on the lesson list row (inline expand on tap)
- Push notifications for cancellations (infrastructure exists via automation rules)
- Show "15 min to next lesson" indicator when the current time is approaching

---

### Journey 11 — Guardian Follow-Up

**Persona:** Guardian  
**Trigger:** Regular check-in on their child's progress  
**Frequency:** Weekly  
**Current WES:** 8/10

#### Navigation Path

```
ENTRY: /guardian → Dashboard (Guardian Portal)
  ↓
SCREEN 1: Dashboard
  → Progress bar: "Anna — 12 av 20 lektioner"
  → Next lesson: Tisdag 15 jul, 09:00
  → Payment status chip: "Inga obetald fakturor"
  ↓
  [Want more detail?] → Tap "Framsteg"
  ↓
SCREEN 2: /guardian/framsteg
  → Lesson history with dates and notes
  → Completion percentage per skill area
  ↓
  [Want to contact school?] → 
SCREEN 3: /guardian/meddelanden OR bottom contact button
  ↓
EXIT: Guardian has seen progress, lessons, and optionally sent a message.
```

**Required permissions:** Guardian portal token (scoped to one student)

**Current click count:** 1–3 clicks depending on intent (excellent)

**Pain points:**
1. **Progress data is visible but not contextualized.** "12 av 20 lektioner" doesn't explain what 20 means — is it the minimum for a B license? An estimate? A package quantity?
2. **The "Riskutbildning" page** (`/guardian/riskutbildning`) is a required step in Swedish driver training (Risk 1 and Risk 2 courses) but is isolated from the main progress view. Guardians may not understand its importance.
3. **Payment status on the dashboard is a summary only.** If a guardian wants to see the actual invoice, they must go to `/guardian/ekonomi` — reasonable, but the navigation label isn't obvious.
4. **No guardian notification when a lesson is marked as completed.** The guardian must check manually — there's no push/email triggered by lesson completion.

**Improvement opportunities:**
- Add contextual note to progress: "20 lektioner är ett typiskt antal för körkort B. Din skola kan anpassa detta."
- Link Riskutbildning status directly from the main progress view
- "Ny händelse" notification badge on the guardian dashboard when something has happened since the last visit

---

### Journey 12 — Lead Conversion (Public Visitor → Enrolled Student)

**Persona:** Public Visitor → Driving School Admin  
**Trigger:** A visitor submits an inquiry via `/book` or the public catalog  
**Frequency:** Daily (multiple inbound leads per active school)  
**Current WES:** 4/10

#### Navigation Path

```
PHASE 1 — VISITOR SIDE:
  ENTRY: /catalog/:orgId → Browse packages
    ↓
  SCREEN 1: /catalog/:orgId/:packageId → Package detail
    ↓
    [Buy online?] → /catalog/:orgId/:packageId/checkout → /confirmation
    [Inquire?] → /book → Fill name, email, phone, message → Submit
    ↓
  Lead appears in workspace at /leads

PHASE 2 — ADMIN SIDE:
  ENTRY: Sidebar → "Leads" → /leads
    ↓
  SCREEN 1: Leads list
    → See new unread leads (no badge count or notification currently)
    ↓
    Click lead → Lead detail
    ↓
  SCREEN 2: Lead detail
    → Review contact info and inquiry message
    → [Convert to student] button
    ↓
  SCREEN 3: Create student form (pre-filled from lead data)
    → Verify/complete info → Save
    ↓
  SCREEN 4: Student detail → Finance tab → Create invoice → Select package
    ↓
  EXIT: Lead converted to enrolled student with invoice.

PHASE 3 — ONLINE PURCHASE PATH:
  ENTRY: /catalog/:orgId/:packageId/checkout
    ↓
  SCREEN 1: Checkout form (name, email, phone, payment)
    ↓
  Payment confirmation → /confirmation
    ↓
  Order appears in workspace at /orders
    ↓
  Admin: /orders → Find order → [Confirm enrollment] → Student created
```

**Required permissions:** No auth for visitor phase. `students:student:create`, `finance:invoice:create` for admin phase.

**Decision points:**
1. Did the visitor inquire or purchase?
2. Are lead contact details complete enough to convert?
3. Which package did they ask about?

**Current click count:** 6–8 clicks (admin side, lead to enrolled student)

**Pain points:**
1. **The Leads page has no badge or notification** in the sidebar. A new lead can sit unread for hours because there is no visible indicator (badge count = 0, no "New" tag).
2. **Lead conversion does not pre-fill the package.** When a visitor inquires about Package B from the catalog, the convert-to-student form has no memory of which package was requested. The admin must manually find and assign it.
3. **The Orders and Leads workflows are entirely separate** even though they represent the same funnel event (a prospective student showing intent). There is no unified inbox.
4. **No follow-up reminder.** If a lead doesn't hear back within 24h, there is no system prompt or automation rule that alerts the admin.

**Improvement opportunities:**
- Badge count on "Leads" nav item showing unread leads
- Unified "Inkorg" for leads + online orders as the intake queue
- Lead-to-student conversion pre-fills the package from the inquiry data
- Automated 24h follow-up reminder rule (hook into existing automation engine)

---

### Journey 13 — Company Management

**Persona:** Driving School Admin or Receptionist  
**Trigger:** Corporate account needs to be reviewed, updated, or billed  
**Frequency:** Weekly  
**Current WES:** 5/10

#### Navigation Path

```
ENTRY: Sidebar → "Företagskunder" → /corporate
  ↓
SCREEN 1: Corporate list
  → Search company → Click → /corporate/:id
  ↓
SCREEN 2: Company detail
  → Overview tab: company info, billing contact, org.nr
  → Elever tab: linked employee students
  → Ekonomi tab: invoices for this company
  ↓
  [Update billing info] → Edit company → Save
  [Add employee] → See Journey 2 pain point (context break)
  [Create invoice for company] → Navigate to /finance/invoices → Ny faktura → Select company
  ↓
EXIT: Company updated, employees reviewed, invoice created if needed.
```

**Required permissions:** Company management permissions, `finance:invoice:create`

**Current click count:** 5–8 clicks for typical review; 12+ for adding an employee and invoicing

**Pain points:**
1. **Creating a company invoice requires leaving the company context.** The Ekonomi tab on company detail shows existing invoices but has no "Ny faktura" button — the user must navigate to `/finance/invoices`.
2. **The company's enrolled students are hard to batch-view.** The Elever tab shows a list, but there's no "Show all these students' booking history" or "Total lessons given this month for this company."
3. **No distinction between active and archived corporate accounts.** Inactive companies clutter the list.

**Improvement opportunities:**
- "Ny faktura" button directly in the company detail Ekonomi tab
- Monthly lesson summary per company (total hours, total cost) for easy consolidated billing
- Active/Archived filter on corporate list

---

### Journey 14 — Reporting (Monthly)

**Persona:** Driving School Admin or Owner  
**Trigger:** End of month review, board presentation, or accounting hand-off  
**Frequency:** Monthly (overview), weekly (quick checks)  
**Current WES:** 6/10

#### Navigation Path

```
ENTRY: Sidebar → "Rapporter" → /reports
  OR: Sidebar → "Insikter" → /insights
  ↓
SCREEN 1: /reports
  → Select report type (Bokningsstatistik, Intäkter, Elevutveckling, etc.)
  → Set period: "Juni 2026"
  → View KPIs + charts + table
  ↓
  [Export?] → "Exportera CSV" or "Exportera PDF"
  ↓
  [Accounting export?] → Navigate to /finance/invoices → period filter → /finance/fortnox
  ↓
EXIT: Report viewed, exported if needed. Optional: SIE4 export for accountant.
```

**Required permissions:** Reports permissions (not explicitly defined in nav — uses `permission: null`)

**Decision points:**
1. What period?
2. Which metrics are relevant?
3. Export format?

**Current click count:** 3–5 clicks to view a report (good); 8–12 for a full accounting export chain

**Pain points:**
1. **Two sidebar items for reporting ("Rapporter" and "Insikter")** without clear distinction between them. Users don't know which one to open for what.
2. **Accounting export is on a completely different page** (`/finance/fortnox`). A user who wants the monthly financial report AND the SIE4 export must navigate to two disconnected pages.
3. **No saved report views.** If the admin wants to run the same report every month, they must set the same filters every time.
4. **No print-ready formatting** for reports. Exporting to CSV loses formatting; there is no PDF report view.

**Improvement opportunities:**
- Merge "Rapporter" and "Insikter" into a single reports hub with tabs for operational vs. financial vs. analytics
- Expose SIE4 export as a button within the financial reports tab — not as a separate Fortnox page
- Saved report presets: "Månadsrapport June" with saved period and filter settings

---

## Part 3 — Workflow Efficiency Scores

| Journey | Workflow | WES | Primary Issue |
|---|---|---|---|
| 1 | New Student Registration | 5/10 | Package and booking not linked to creation flow |
| 2 | Corporate Enrollment | 4/10 | Massive context breaks; no bulk path |
| 3 | Lesson Booking (Admin) | 7/10 | No balance check; no "next available" feature |
| 4 | Lesson Booking (Student) | 7/10 | No availability explanation when slots empty |
| 5 | Lesson Rescheduling | 5/10 | Cancel + rebook are two unlinked operations |
| 6 | Package Purchase | 5/10 | Two unclear entry points; no bulk invoice |
| 7 | Payment Processing | 6/10 | Two entry points; no receipt fast path |
| 8 | Invoice Generation (Monthly) | 5/10 | No batch generation; no lesson → invoice link |
| 9 | Student Progression Tracking | 6/10 | Attendance and education card are disconnected |
| 10 | Instructor Daily Workflow | 7/10 | No "next lesson" shortcut; no cancellation push |
| 11 | Guardian Follow-Up | 8/10 | Progress context lacks explanation |
| 12 | Lead Conversion | 4/10 | No badge on Leads nav; no intake unification |
| 13 | Company Management | 5/10 | Invoice creation requires context break |
| 14 | Monthly Reporting | 6/10 | Two redundant report items; export fragmented |

**Platform Average WES: 5.7 / 10**

The three lowest-scoring journeys (Corporate Enrollment, Lead Conversion, New Student Registration) all share the same root problem: **workflows that span multiple entities (student + invoice + booking + company) require the user to manually navigate between pages that have no contextual hand-offs.**

---

## Part 4 — Navigation Optimization Recommendations

### NAV-1: Reduce GENERELLT to 6 items

**Current:** 11 items in GENERELLT (Kunder, Leads, Utbildningsplaner, Företagskunder, Kommunikation, Rapporter, Insikter, Klasslista, Bevakningar, Uppgifter, Loggar)

**Recommendation:**

| Keep at top level | Move to sub-level or remove |
|---|---|
| Kunder | Utbildningsplaner → under Kunder |
| Leads | Klasslista → under Kunder |
| Företagskunder | Insikter → merge into Rapporter |
| Kommunikation | Bevakningar → under Kommunikation |
| Rapporter (merged) | Uppgifter → under Dashboard widget |
| — | Loggar → under Settings or Rapporter |

**Result:** 5 top-level items in GENERELLT vs. 11 today.

### NAV-2: Add Badge Counts to Key Navigation Items

| Nav item | Badge source | Rationale |
|---|---|---|
| Leads | Unread lead count | Critical — leads decay fast if unseen |
| Kommunikation | Undelivered message count | Alerts to failed communications |
| Väntelista | Active waitlist count | Keeps admin aware of revenue opportunity |
| Uppgifter | Overdue task count | Task visibility without navigating |

**Currently:** All badges are static (hardcoded 0 or absent). Leads have no real-time count.

### NAV-3: Merge Duplicate Report Entries

- **Rapporter** (`/reports`) and **Insikter** (`/insights`) serve overlapping purposes with no documented distinction.
- **Recommendation:** Merge into a single "Rapporter & Insikter" entry with internal tabs: Operativt | Finansiellt | Analys

### NAV-4: Rename Navigation Items for Clarity

| Current label | Recommended label | Reason |
|---|---|---|
| Kunder | Elever & Kunder | Clarifies it covers both |
| Passöversikt | Passöversikt | Fine as-is |
| Passläggning | Schemaläggning | More intuitive term |
| LärarApp | Instruktörsapp | More descriptive |
| Dataimport | Importera data | Action verb |

### NAV-5: Collapse BOKNINGSSYSTEM

**Current:** 9 items (Bokningsschema, Mitt schema, Bokningsflöde, Passöversikt, Väntelista, Kursöversikt, Statistik, Passläggning, Slotmallar)

**Recommendation:** 5 primary items + advanced items hidden behind "Avancerat ▾":

| Primary | Advanced |
|---|---|
| Bokningsschema | Passläggning |
| Mitt schema | Slotmallar |
| Passöversikt | Statistik |
| Väntelista | — |
| Kursöversikt | — |

Bokningsflöde merges into Bokningsschema as a tab.

---

## Part 5 — Quick Action Recommendations

Quick Actions appear as chips on the Dashboard and in the Command Palette. They save 3–5 clicks per operation.

### QA-1: Dashboard Quick Actions (Trafikskola Admin)

| Action | Route | Saves |
|---|---|---|
| Ny elev | Opens creation sheet from dashboard | 3 clicks |
| Ny bokning | Opens booking sheet → student search → calendar | 4 clicks |
| Registrera betalning | Opens payment sheet directly | 4 clicks |
| Ny faktura | Opens invoice creation sheet | 3 clicks |
| Skicka meddelande | Opens compose message | 3 clicks |
| Ny lead | Opens lead creation form | 2 clicks |

**Maximum 6 quick actions on the dashboard.** Order by frequency for the default admin persona.

### QA-2: Dashboard Quick Actions (Receptionist)

| Action | Priority |
|---|---|
| Ny bokning | P1 (highest frequency) |
| Ny elev | P1 |
| Registrera betalning | P2 |
| Sök elev | P2 |
| Nästa lediga tid | P3 |
| Bokningsschema | P3 |

### QA-3: Command Palette (⌘K) Enhancements

The Command Palette currently supports: navigation items + student search + recent items.

**Add these command categories:**

| Category | Commands |
|---|---|
| Åtgärder | Ny elev, Ny bokning, Ny faktura, Registrera betalning |
| Elever | Live search → navigate to student detail |
| Instruktörer | Live search → navigate to instructor detail |
| Senaste | Last 5 viewed records |
| Datum | "Gå till datum…" → jump to that week in calendar |

**Trigger examples:**
- "ny" → suggest Ny elev, Ny bokning, Ny faktura
- "anna" → show Anna Svensson (student), Anna Berg (instructor)
- "faktura 2024" → show invoice #2024-047

### QA-4: Context-Aware Quick Actions (within pages)

| Context | Quick Actions available |
|---|---|
| Student detail — Översikt tab | Ny bokning för {student}, Skapa faktura, Skicka meddelande |
| Student detail — Finance tab | Skapa faktura, Registrera betalning, Skicka påminnelse |
| Calendar (slot hover) | Boka, Redigera pass, Blockera tid |
| Invoice list row | Skicka, Markera betald, Kreditnota |
| Lesson list row (instructor app) | Närvande ✓, Uteblev ✗, Lägg till anteckning |

---

## Part 6 — Dashboard Widget Recommendations

### WID-1: Trafikskola Dashboard Widgets

**Current Zone 3 (KPI Grid) — keep as-is (4 cards):**
- Lektioner idag
- Aktiva elever
- Obetald fakturasumma
- Kommande bokningar (this week)

**Current Zone 5 (Secondary Row) — recommended widgets:**

| Widget | Description | Replaces |
|---|---|---|
| Instructor status board | Real-time: on lesson / available / free / leave | Currently only on dashboard as raw data |
| Väntelista | Count + top 3 waiting students | Nav item, no dashboard surface |
| Ej betalda fakturor — förfallna | Overdue invoices requiring action | Hidden in finance module |
| Lediga tider idag | Available slots remaining today (count + next 3) | Requires calendar navigation |
| Leads inkorg | Unread leads count + last 3 (if leads exist) | Nav item only, no badge |

### WID-2: Platform Admin Dashboard Widgets

| Widget | Data |
|---|---|
| Subscription health | Donut: trial / active / past_due / cancelled |
| New signups (30 days) | Count + sparkline |
| Support queue | Open tickets by severity |
| Tenant activity heatmap | Which orgs have been active this week |
| Error rate | Edge function error rate last 24h |

### WID-3: Student Portal Dashboard Widgets

| Widget | Description |
|---|---|
| Nästa lektion | Countdown + lesson details |
| Framsteg | Progress bar (lessons done / total) |
| Paketbalans | Remaining lesson credits |
| Senaste aktivitet | Last 3 events (lesson, payment, message) |

### WID-4: Instructor App Dashboard Widgets

| Widget | Description |
|---|---|
| Idag | Count of today's lessons |
| Nästa lektion | Countdown |
| Elever denna vecka | How many unique students this week |
| Omarkerade lektioner | Past lessons missing attendance mark (alert) |

---

## Part 7 — Detailed Improvement Recommendations

### IMP-1: Reschedule Action (High Impact — WES impact: Journey 5 from 5 → 8)

**Problem:** Rescheduling a lesson requires cancel + rebook in 10–13 clicks.

**Solution:** Add a "Boka om" action on any booked slot. Opens a slot-picker filtered to the same instructor and student, defaulting to the same week. User picks a new slot → system moves the booking atomically.

**Implementation scope:** 1 new API action, 1 UI component (SlotPickerSheet with student pre-populated).

---

### IMP-2: Unified Intake Inbox (High Impact — WES impact: Journey 12 from 4 → 7)

**Problem:** Leads from `/book` and Orders from `/catalog` appear in two separate pages with no unified view. Lead nav item has no badge count.

**Solution:**
1. Add real-time badge count to "Leads" sidebar item (count of unread leads)
2. Create an "Inkorg" widget on the dashboard showing unread leads + unprocessed orders in one list
3. Merge Leads and Orders into a single intake view `/intake` with tabs: Leads | Beställningar

**Implementation scope:** Badge count is a query change + sidebar prop. Unified view is a new route.

---

### IMP-3: Contextual Hand-offs After Creation (High Impact — WES impact: Journey 1 from 5 → 7)

**Problem:** After creating a student, the user is dropped into the detail page with no guidance on what to do next.

**Solution:** After successful student creation, show a "Nästa steg" panel (inline, dismissible) with:
- "Tilldela paket →" → opens CreateInvoiceSheet pre-populated with new student
- "Boka första lektion →" → opens calendar with student pre-selected in booking sheet
- "Klar" → dismisses, stays on detail

**Implementation scope:** Post-creation state in the student detail page; 2 new sheet pre-population paths.

---

### IMP-4: Balance Check in Booking Sheet (Medium Impact — WES impact: Journey 3 from 7 → 9)

**Problem:** When booking a lesson for a student, the receptionist cannot see if the student has a remaining package balance or an outstanding invoice.

**Solution:** In the booking creation sheet, when a student is selected, show a compact status line:
- ✓ "3 lektioner kvar i Intensivpaket B"
- ⚠ "Obetald faktura: 2 450 kr (förfaller 15 jul)"
- ✗ "Inga aktiva paket — faktura krävs"

**Implementation scope:** One additional query in the booking sheet component; read-only display only.

---

### IMP-5: Batch Invoice Generation (High Impact — WES impact: Journey 8 from 5 → 7)

**Problem:** Monthly invoicing requires creating one invoice per student, one at a time.

**Solution:** Add a "Generera fakturor" operation in `/finance/invoices`:
1. Select period (month)
2. System lists all students who had completed, uninvoiced lessons in that period
3. Admin reviews the suggested invoice list (can remove individual students)
4. Click "Generera" → all invoices created as drafts
5. Review draft invoices → bulk "Skicka alla"

**Implementation scope:** New API endpoint + one-page wizard-style UI. Does not touch the double-entry ledger until "Skicka" (which posts the invoice).

---

### IMP-6: Inline Company Invoice Creation (Medium Impact — WES impact: Journey 13 from 5 → 7)

**Problem:** Creating an invoice for a company requires navigating away from the company detail page.

**Solution:** "Ny faktura" button in the company detail Ekonomi tab. Opens CreateInvoiceSheet pre-filled with company as recipient. Line items can pull from linked employee students' uninvoiced lessons.

**Implementation scope:** Add button to company detail Ekonomi tab; reuse existing CreateInvoiceSheet with company pre-population.

---

### IMP-7: Attendance → Education Card Link (Medium Impact — WES impact: Journey 9 from 6 → 8)

**Problem:** After marking attendance, there is no prompt to update the Utbildningskort. The two workflows are disconnected even though they describe the same event.

**Solution:** After attendance is marked in the Instructor App or Portal:
- "Vill du logga körkortsmoment?" → one-tap access to Utbildningskort filtered to current date

**Implementation scope:** Post-attendance state in lesson detail; deep-link to Utbildningskort with date pre-filtered.

---

### IMP-8: Merge Reports + Insights Navigation (Low Impact — WES impact: Journey 14 from 6 → 7)

**Problem:** "Rapporter" and "Insikter" are two sidebar items with overlapping purpose. Users don't know which to use.

**Solution:**
- Remove "Insikter" from the sidebar
- `/insights` redirects to `/reports?tab=insikter`
- `/reports` has tabs: Operativt | Finansiellt | Insikter

**Implementation scope:** Route alias + tabs in the reports module. Zero data model changes.

---

## Part 8 — Workflow Friction Summary

### Critical Friction Points (Fix in WP-OPS)

| # | Friction | Affected Journeys | Effort |
|---|---|---|---|
| F-1 | No "Boka om" (reschedule) action | 5 | Medium |
| F-2 | No badge count on Leads nav item | 12 | Low |
| F-3 | No contextual hand-off after student creation | 1, 6 | Medium |
| F-4 | Corporate student creation requires context break | 2 | High |
| F-5 | No batch invoice generation | 8 | High |
| F-6 | Student balance not shown in booking sheet | 3 | Low |

### Navigation Friction Points (Fix in WP-NAV)

| # | Friction | Impact |
|---|---|---|
| N-1 | GENERELLT has 11 items — cognitive overload | All daily workflows |
| N-2 | BOKNINGSSYSTEM has 9 items — 4 are rarely used | Scheduling workflows |
| N-3 | Rapporter and Insikter overlap | Reporting workflows |
| N-4 | Leads has no real-time badge | Lead conversion workflow |
| N-5 | Two payment entry points (Kassa + Betalningar) | Payment workflow |
| N-6 | Invoice creation lives at student level AND finance level | Invoice workflow |

### Quick Wins (Implement during WP-NAV without waiting for WP-OPS)

| # | Quick Win | Effort | WES Gain |
|---|---|---|---|
| QW-1 | Badge count on Leads nav item | 1 day | Journey 12: +2 |
| QW-2 | Merge Rapporter + Insikter | 0.5 day | Journey 14: +1 |
| QW-3 | "Nästa steg" panel after student creation | 1 day | Journey 1: +1 |
| QW-4 | Balance chip in booking sheet | 1 day | Journey 3: +1 |
| QW-5 | ⌘K action commands (Ny elev, Ny bokning, etc.) | 1 day | All: +0.5 |

---

## Appendix A — Route Map Reference

Complete route inventory for journey validation:

| Route | Surface | Module |
|---|---|---|
| `/dashboard` | Workspace | Dashboard |
| `/students/*` | Workspace | Students |
| `/students/inactive` | Workspace | Students |
| `/leads` | Workspace | Leads |
| `/curriculum` | Workspace | Curriculum |
| `/curriculum/:id` | Workspace | Curriculum |
| `/corporate/*` | Workspace | Corporate |
| `/communication` | Workspace | Communication Hub |
| `/communication/compose` | Workspace | Communication |
| `/communication/log` | Workspace | Communication |
| `/communication/settings` | Workspace | Communication |
| `/communication/templates` | Workspace | Communication |
| `/communication/activity` | Workspace | Communication |
| `/communication/rules` | Workspace | Communication |
| `/communication/queue` | Workspace | Communication |
| `/communication/analytics` | Workspace | Communication |
| `/communication/notification-log` | Workspace | Communication |
| `/reports/*` | Workspace | Reports |
| `/insights` | Workspace | Insights |
| `/class-list` | Workspace | Class list |
| `/watchlist` | Workspace | Watchlist |
| `/tasks` | Workspace | Tasks |
| `/logs` | Workspace | Logs |
| `/scheduling/*` | Workspace | Scheduling |
| `/scheduling/mine` | Workspace | Scheduling |
| `/scheduling/bokningar` | Workspace | Scheduling |
| `/scheduling/list` | Workspace | Scheduling |
| `/scheduling/waitlist` | Workspace | Scheduling |
| `/scheduling/kurser` | Workspace | Scheduling |
| `/scheduling/statistik` | Workspace | Scheduling |
| `/scheduling/generation` | Workspace | Scheduling |
| `/scheduling/mallar` | Workspace | Scheduling |
| `/scheduling/planner` | Workspace | Resources |
| `/resources` | Workspace | Resources |
| `/finance/invoices` | Workspace | Finance |
| `/finance/payments` | Workspace | Finance |
| `/finance/cash` | Workspace | Finance |
| `/packages/*` | Workspace | Packages |
| `/campaigns/*` | Workspace | Campaigns |
| `/orders` | Workspace | Orders |
| `/orders/:id` | Workspace | Orders |
| `/finance/fortnox` | Workspace | Finance |
| `/instructors/*` | Workspace | Instructors |
| `/instructor-app` | Workspace | Instructor app |
| `/settings/*` | Workspace | Settings |
| `/settings/data-migration` | Workspace | Data migration |
| `/enrollments` | Workspace | Enrollments |
| `/enrollments/:id` | Workspace | Enrollments |
| `/profile` | Workspace | Profile |
| `/portal/*` | Student Portal | 14 routes |
| `/instructor-portal/*` | Instructor Portal | 7 routes |
| `/instructor-app/*` | Instructor App | 6 routes |
| `/guardian/*` | Guardian Portal | 10 routes |
| `/platform/*` | Platform Admin | 10 routes |
| `/catalog/:orgId/*` | Public | 4 routes |
| `/book` | Public | Lead capture |

**Total routes:** 70+

---

## Appendix B — Persona × Journey Matrix

Which journeys each persona participates in:

| Journey | Platform Admin | Admin | Receptionist | Instructor | Student | Guardian | Corporate | Visitor |
|---|---|---|---|---|---|---|---|---|
| 1. New student reg. | — | ✓ | ✓ | — | — | — | — | — |
| 2. Corporate enrollment | — | ✓ | ✓ | — | — | — | Contact | — |
| 3. Lesson booking (admin) | — | ✓ | ✓ | — | — | — | — | — |
| 4. Lesson booking (student) | — | — | — | — | ✓ | — | — | — |
| 5. Rescheduling | — | ✓ | ✓ | Request | ✓ | — | — | — |
| 6. Package purchase | — | ✓ | ✓ | — | — | Guardian | — | — |
| 7. Payment | — | ✓ | ✓ | — | — | Guardian | — | — |
| 8. Invoice generation | — | ✓ | — | — | — | — | Receives | — |
| 9. Progression tracking | — | ✓ | — | ✓ | Views | Views | — | — |
| 10. Instructor daily | — | — | — | ✓ | — | — | — | — |
| 11. Guardian follow-up | — | — | — | — | — | ✓ | — | — |
| 12. Lead conversion | — | ✓ | ✓ | — | — | — | — | ✓ |
| 13. Company management | — | ✓ | ✓ | — | — | — | Contact | — |
| 14. Reporting | ✓ | ✓ | — | — | — | — | — | — |

---

*This document is the authoritative user journey reference for TrafikskolaOS. All navigation changes, Quick Action additions, and workflow improvements must trace back to a journey finding documented here.*

*Next action: WP-DS — Design System Foundation implementation. Awaiting approval.*
