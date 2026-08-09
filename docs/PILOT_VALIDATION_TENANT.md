# Pilot Validation Tenant

**Status:** Permanent, non-production validation environment. Not for demonstrations, not for production activity. Preserved for future regression testing, operational validation, and pilot support work.
**Created:** Sprint 4H (Pilot Operational Validation), via the platform's own real `platform-admin/provision` endpoint — not hand-seeded.
**Passwords:** rotated to unique, randomly generated values as of Sprint 4H, immediately after this document's predecessor accidentally stored them in plaintext (caught and corrected the same turn). **No password is stored in this repository, in any project file, or in any conversation transcript going forward.** They exist only wherever you choose to keep them (e.g. your own password manager) — ask in a fresh session if they need rotating again; nothing here can regenerate them without a new rotation.

## Organization

- **Name:** Pilot Validation School
- **Slug:** `pilot-validation-school`
- **Subscription tier:** Trial

## Accounts

| Role | Email | Purpose |
|---|---|---|
| Platform Administrator | `pilot-validation-platformadmin@example.test` | Validating platform-wide/cross-tenant admin workflows (org provisioning, platform dashboard) |
| Organization Owner | `pilot-validation-owner@example.test` | Validating full-permission tenant-level workflows (settings, user management, org configuration) |
| Branch Manager (`org_manager`) | `pilot-validation-branchmanager@example.test` | Validating manager-tier permission scope |
| Receptionist | `pilot-validation-receptionist@example.test` | Validating day-to-day operational workflows (students, bookings, packages, invoices) |
| Instructor | `pilot-validation-instructor@example.test` | Validating instructor-facing workflows — **note:** this account has the `instructor` membership role but no corresponding `instructors` table row yet; instructor-record-dependent features (assigned students, lesson completion) require that additional setup step before they're reachable |

## Representative test data

- One real student record ("Sara Svensson") with a generated, still-valid student portal access token (expires 2026-08-18) — used to validate the Student Portal end to end.
- One real demo request submitted through the public site's actual form.

## Rules for using this tenant

- **Validation only.** Never use it to demonstrate the product to a prospect or customer, and never enter real customer data into it.
- **Clearly labeled.** Every account email and the organization name itself are prefixed/named so they're unmistakably test data if ever seen in a report, dashboard, or export.
- If a future session needs to log in as one of these accounts, rotate the relevant password again (via the Admin API) rather than assume an old one still works — none of the passwords set in this sprint are recorded anywhere retrievable.

## Related documents

`docs/PILOT_OPERATIONAL_VALIDATION.md` — the Sprint 4H report this tenant was built to support, including the real defect it helped find and fix (Organization Settings → Users page).
