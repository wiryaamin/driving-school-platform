# Gap Implementation Plan — Best-in-Class Feature Parity

## Status Key
- [ ] Not started
- [~] In progress
- [x] Complete

---

## Gap 1 — Curriculum / Lesson-Plan Builder
**Target:** Formal lesson plan with theory blocks, practical stage gates, exam prep roadmap.

**Backend tables available:**
- `training_plan_templates` — org-level templates with structured steps
- `training_plan_template_steps` — ordered steps per template
- `student_training_plans` — student-assigned plan instance
- `student_training_plan_steps` — per-step completion state for a student
- `student_permit_milestones` — milestone completion events

**Frontend deliverables:**
- [ ] G1-A: New `curriculum/` module with index route (`/curriculum`)
- [ ] G1-B: `CurriculumTemplatesPage` — list + create/edit training plan templates
- [ ] G1-C: `CurriculumBuilderPage` — drag-reorder steps, mark required/optional, set milestone gates
- [ ] G1-D: `StudentTrainingPlanTab` — add "Utbildningsplan" sub-tab to `StudentDetailPage.UtbildningTab`
  - Shows assigned plan, step-by-step progress, completion percentages
  - Admin can check off steps and mark milestones
- [ ] G1-E: Sidebar nav entry "Utbildningsplaner" → `/curriculum`
- [ ] G1-F: Hooks: `useCurriculumTemplates`, `useStudentTrainingPlan`, `useUpdateStudentTrainingStep`

---

## Gap 2 — Automated Student Lifecycle Workflows
**Target:** Onboarding sequences, inactivity alerts, failed-exam triggers, stage-change automations.

**Backend tables available:**
- `automation_rules` (with `automation_rule_type` enum covering: booking_reminder, followup_no_show, inactivity_alert, birthday, permit_expiry, payment_overdue, custom_trigger)
- `notification_rules` — trigger-based channel dispatch
- Existing `AutomatiseringsReglerPage` at `/settings/automations`

**Frontend deliverables:**
- [ ] G2-A: Audit and expand `AutomatiseringsReglerPage` to show lifecycle trigger types not yet shown
  - Add student lifecycle triggers: `student_inactive_14d`, `student_inactive_30d`, `exam_failed`, `booking_gap_7d`, `onboarding_welcome`
  - Template quick-add buttons for each trigger type
- [ ] G2-B: New `WorkflowsPage` at `/settings/workflows` — visual trigger→action cards
  - Each card: trigger event, conditions, action (send email/SMS, assign task, set flag)
  - Enable/disable toggle per workflow
- [ ] G2-C: Student activity "heat" indicator on student list (days-since-last-booking badge)
- [ ] G2-D: "Inaktiva elever" alert panel on Dashboard (students with no booking in 21+ days)
- [ ] G2-E: Sidebar nav "Arbetsflöden" under Settings

---

## Gap 3 — Driving Test Integration
**Target:** Transportstyrelsen exam readiness gate, test result recording, exam prep roadmap.

**Backend tables available:**
- `student_permit_milestones` — milestone events (includes theory_exam, practical_exam)
- `lesson_bookings` + `booking_attendance` — history
- `student_training_plan_steps` — step completion

**Frontend deliverables:**
- [ ] G3-A: `ExamReadinessPanel` component — added to `StudentDetailPage` elevkort tab
  - Checklist: Risk1 done, Risk2 done, theory exam ready, driving lessons minimum, assessment passed
  - Overall readiness score (green/amber/red)
  - "Redo för körprov" flag
- [ ] G3-B: `ExamResultsTab` — new sub-tab in `StudentDetailPage.UtbildningTab`
  - Record theory/practical exam attempts with date + pass/fail
  - History of all attempts
  - Link to Transportstyrelsen booking portal (external link)
- [ ] G3-C: Milestone badges on `StudentDetailPage` header (Risk1 ✓, Risk2 ✓, Theory ✓, Practical ✓)
- [ ] G3-D: Hook: `useStudentMilestones(studentId)` + `useRecordMilestone()`

---

## Gap 4 — Lead-to-Student Conversion Funnel
**Target:** Kanban pipeline, lead scoring, conversion analytics.

**Backend tables available:**
- `student_leads` — lead records with status

**Frontend deliverables:**
- [ ] G4-A: Rebuild `LeadsSettingsPage` → proper `LeadsPage` at `/leads`
  - Kanban columns: Ny → Kontaktad → Bokat → Elev → Avböjt
  - Drag cards between columns (update status)
  - Card shows: name, contact info, licence category, source, age-in-pipeline
- [ ] G4-B: Lead score badge — computed from: has email, has phone, licence category set, response time
- [ ] G4-C: Conversion funnel chart — SVG funnel showing drop-off at each stage
- [ ] G4-D: `LeadDetailSheet` — click a lead card → right panel with full details + send email/SMS
- [ ] G4-E: "Konvertera till elev" button — creates a student from the lead
- [ ] G4-F: Hook: `useLeads`, `useUpdateLeadStatus`, `useConvertLeadToStudent`

---

## Gap 5 — Instructor Performance Analytics
**Target:** Completion rates, student satisfaction, utilization, benchmarking.

**Backend tables available:**
- `lesson_bookings` (status, attendance_status, performance_rating)
- `lesson_slots` (instructor_id, starts_at, current_bookings, max_bookings)
- `booking_attendance`
- `instructor_student_assessments` (competency ratings by instructor)

**Frontend deliverables:**
- [ ] G5-A: Enhance `InstructorPortalStatistikPage` — add detailed KPIs:
  - Completion rate (completed / total bookings)
  - No-show rate
  - Average performance rating given to students
  - Slot utilization % (current_bookings / max_bookings avg)
- [ ] G5-B: Admin instructor analytics — add "Prestanda" tab to `InstructorDetailPage`
  - Same KPIs as above, admin view
  - Trend chart: bookings per week (SVG line chart)
  - Students assessed (from instructor_student_assessments)
- [ ] G5-C: Instructor leaderboard panel on Dashboard or Insights — top instructors by utilization
- [ ] G5-D: Hook: `useInstructorPerformance(instructorId, dateRange)`

---

## Gap 6 — Insights Module Depth
**Target:** Cohort analysis, retention curves, revenue per lesson-type, peak-hour heatmaps.

**Backend tables available (via existing hooks):**
- `useInsightsKpi`, `useInsightsTrends`, `useInsightsDemografi`, `useInsightsRapporter`
- Booking + finance data available via other hooks

**Frontend deliverables:**
- [ ] G6-A: `CohortTab` — new tab in `InsightsPage`
  - Cohort table: students enrolled by month, % still active at 1/2/3/6 months
  - Retention heatmap grid (SVG)
- [ ] G6-B: Fill `RapporterTab` — revenue per lesson type breakdown
  - Bar chart: revenue by lesson category (driving/theory/risk1/risk2/intensive)
  - Average lessons per student to completion
- [ ] G6-C: `OverviewTab` enhancement — add peak-hour heatmap
  - 7-day × 24-hour grid, colored by booking density
  - Based on `useSlotList` data
- [ ] G6-D: `KpiTab` enhancement — add trend sparklines to each KPI card
- [ ] G6-E: Sidebar nav entry for Insights already exists; ensure all tabs visible and labeled clearly

---

## Gap 7 — Resource Utilization Heatmaps
**Target:** Vehicle utilization charts, maintenance scheduling, instructor-vehicle conflict detection.

**Backend tables available:**
- `vehicles` — vehicle inventory
- `lesson_slots` — slots with vehicle_id
- `vehicle_maintenance` — maintenance records
- `vehicle_inspections` — inspection records
- `vehicle_service_records`

**Frontend deliverables:**
- [ ] G7-A: Vehicle utilization section in `ResourcesPage`
  - Per-vehicle: days used in last 30d, slots assigned, hours driven estimate
  - Utilization bar per vehicle
- [ ] G7-B: `VehicleMaintenancePage` at `/resources/maintenance`
  - List upcoming/overdue maintenance per vehicle
  - Create maintenance record form
  - Flag vehicles with overdue maintenance
- [ ] G7-C: Peak-hour utilization heatmap (7 days × standard time slots)
  - Which vehicles/slots are consistently over/under-booked
- [ ] G7-D: "Konflikter" panel — instructor assigned to multiple slots at same time (conflict detection client-side)
- [ ] G7-E: Hook: `useVehicleUtilization(vehicleId, dateRange)`

---

## Gap 8 — Multi-Branch / Location-Aware Views
**Target:** Location filtering across reports, dashboard, and scheduling. Cross-location reporting.

**Backend tables available:**
- `organization_locations` — named branches/locations
- `lesson_slots.location_id` — slots tagged with location
- `lesson_bookings` — inherit location from slot

**Frontend deliverables:**
- [ ] G8-A: Global location filter — add a location picker to the AppShell header
  - Stores selected location in session store / Zustand
  - When set, all queries that accept `location_id` filter automatically use it
- [ ] G8-B: Dashboard location breakdown panel
  - KPIs broken down by location side-by-side
  - Only visible when org has >1 location
- [ ] G8-C: Reports location filter — all report pages respect location filter
- [ ] G8-D: Scheduling calendar location filter — already has slot filtering; wire location_id
- [ ] G8-E: `LocationsSettingsPage` already exists — verify create/edit locations is functional

---

## Gap 9 — Cohort / Class Learning Features
**Target:** Cohort progress views, group session completion tracking, class certificates.

**Backend tables available:**
- `lesson_bookings` — can group by slot_id (all bookings on same slot = cohort)
- `student_training_plan_steps` — completion per student
- `student_material_completions` — material watched/completed
- `quiz_sessions` + `quiz_session_answers` — theory test results

**Frontend deliverables:**
- [ ] G9-A: Enhance `ClassListPage` — add "Kurstillfällen" view
  - Group sessions tab: list group slots with enrolled students, completion status
  - Progress bar per session showing attended / total enrolled
- [ ] G9-B: `CohortProgressPanel` — for each group slot, show per-student status
  - Attended / not attended / cancelled
  - Quick mark-all-attended button
- [ ] G9-C: Theory quiz statistics in student detail
  - Use `quiz_sessions` data to show quiz completion rate, scores
  - "Kunskapsprov-redo" indicator
- [ ] G9-D: Certificate generation stub — "Utfärda intyg" button per student (Risk1 done, etc.)
  - Writes to `student_permit_milestones`
- [ ] G9-E: Hook: `useCohortProgress(slotId)`, `useStudentQuizStats(studentId)`

---

## Gap 10 — Business-Intelligence Reporting
**Target:** Customer retention reports, revenue per lesson type, instructor ROI, scheduled delivery.

**Backend tables available:**
- `invoices`, `invoice_line_items`, `payments` — revenue data
- `lesson_bookings` + `lesson_types` — bookings by type
- `students` — enrollment dates (created_at)
- `lesson_slots` — instructor workload

**Frontend deliverables:**
- [ ] G10-A: `RetentionRapportPage` at `/reports/retention`
  - Cohort retention: students who booked in month X still booking in month X+1/+2/+3
  - Churn rate calculation
- [ ] G10-B: `IntäkterRapportPage` at `/reports/intakter`
  - Revenue breakdown by lesson type (driving/theory/risk1/risk2/intensive/simulator)
  - Month-over-month trend
  - Top 10 students by spend
- [ ] G10-C: `InstruktörROIPage` at `/reports/instruktor-roi`
  - Per instructor: slots filled, revenue generated (from bookings × price), utilization %
  - Compare instructors side-by-side
- [ ] G10-D: Add new report entries to `RapporterPage` nav cards
- [ ] G10-E: CSV export button on all report tables

---

## Implementation Order

Priority based on: user impact × backend readiness × frontend complexity

| Order | Gap | Why |
|---|---|---|
| 1 | G4 (Lead Funnel) | `student_leads` table ready; high sales impact |
| 2 | G1 (Curriculum) | `training_plan_templates` ready; differentiates platform |
| 3 | G3 (Exam Integration) | `student_permit_milestones` ready; operational daily use |
| 4 | G5 (Instructor Analytics) | Data available from bookings; closes management gap |
| 5 | G6 (Insights Depth) | Hooks exist; fills placeholder tabs |
| 6 | G10 (BI Reporting) | Finance data available; business-critical |
| 7 | G2 (Lifecycle Workflows) | `automation_rules` ready; high automation value |
| 8 | G7 (Resource Utilization) | Vehicle data available; ops efficiency |
| 9 | G9 (Cohort Learning) | Quiz + booking data available; group scheduling complement |
| 10 | G8 (Multi-Branch) | `organization_locations` ready; enterprise unlock |

---

## Progress Tracker

| Gap | Status | Notes |
|---|---|---|
| G1 Curriculum | [ ] | |
| G2 Workflows | [ ] | |
| G3 Exam Integration | [ ] | |
| G4 Lead Funnel | [ ] | |
| G5 Instructor Analytics | [ ] | |
| G6 Insights Depth | [ ] | |
| G7 Resource Utilization | [ ] | |
| G8 Multi-Branch | [ ] | |
| G9 Cohort Learning | [ ] | |
| G10 BI Reporting | [ ] | |
