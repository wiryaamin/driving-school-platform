# TrafikskolaOS – Website Integration Services
## Version 1.0 Product Specification

**Document type:** This document defines the approved Website Integration Services that TrafikskolaOS Version 1.0 is designed to expose through a tenant driving school's website. It specifies the approved product scope and is not an implementation assessment or code verification document.

**Companion document:** This specification defines the approved product scope. `docs/WEBSITE_FEATURE_INTEGRATION_CATALOGUE.md` independently documents implementation status, verified directly against the codebase, feature by feature. The two documents intentionally serve different purposes and must remain separate — they must not be merged.

---

## Table of Contents

1. Course Catalogue & Pricing
2. Campaigns & Special Offers
3. Online Booking & Scheduling
4. Student Registration & Enrollment
5. Unified Portal Login (Student, Guardian & Instructor)
6. Mobile App Download (App Store & Google Play)

---

## Approved Website Integration Services

The following services constitute the approved public-facing Website Integration Services for TrafikskolaOS Version 1.0.

## 1. Course Catalogue & Pricing

The platform SHALL provide a public, tenant-branded listing of a driving school's lesson packages and pricing, reachable from the school's own website, reflecting each package's current price and availability.

## 2. Campaigns & Special Offers

The platform SHALL support tenant-configured promotional campaigns and discount codes, visible alongside the relevant packages in the Course Catalogue and applied automatically during enrollment where eligible.

## 3. Online Booking & Scheduling

The platform SHALL provide a booking experience through which a prospective or existing student can select and reserve a lesson time directly from the tenant website, integrated with the driving school's own scheduling calendar and instructor/vehicle availability.

## 4. Student Registration & Enrollment

The platform SHALL provide a structured registration flow through which a prospective student can enroll in a selected package from the tenant website, resulting in a reviewable enrollment record within the tenant's own workspace.

## 5. Unified Portal Login (Student, Guardian & Instructor)

The platform SHALL provide a single, unified login entry point through which a Student, Guardian, or Instructor authenticates once, with the platform presenting the correct role-specific portal experience automatically based on the authenticated user's role.

## 6. Mobile App Download (App Store & Google Play)

TrafikskolaOS SHALL provide a single mobile application, supporting all end-user roles. The tenant website SHALL present official download widgets for:
- Apple App Store
- Google Play

After authentication within the mobile application, the application SHALL automatically present the experience corresponding to the authenticated user's role:
- Student
- Guardian
- Instructor

---

## Relationship to Implementation

This document defines the approved Version 1.0 product scope for Website Integration Services. It intentionally does not describe implementation status, development progress, or release readiness. Those aspects are documented independently in `docs/WEBSITE_FEATURE_INTEGRATION_CATALOGUE.md` and governed through the project's implementation and release management processes.
