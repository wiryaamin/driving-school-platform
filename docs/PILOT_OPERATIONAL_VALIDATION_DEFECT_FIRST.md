# Operational Validation — Defect-First Investigation (HTTP 400 on Users Page)

**Document type:** Formal root-cause investigation, requested at a higher evidentiary standard than the initial finding in `docs/PILOT_OPERATIONAL_VALIDATION.md`. That document reported this defect and a fix; this document supplies the complete request/response evidence, rejects alternative explanations explicitly, and — because this investigation's own regression pass found the fix was incomplete — documents a second, previously-undiscovered instance of the same defect, found and fixed the same way.
**Method:** unchanged from prior sprints — real browser automation (Playwright/Chromium) against the running application and hosted backend, plus direct, isolated PostgREST queries used specifically to capture evidence independent of application code.

---

## 1. Root Cause Analysis Report

The `profiles` table does not have an `organization_id` column. It was removed in migration Phase 1B.2 — tenant context was deliberately moved to flow through `memberships` only (documented at the type level in `packages/types/auth.types.ts`: *"Note: organization_id was removed from profiles in Phase 1B.2. Org context flows through memberships only — use AuthUser.organization_id."*). Two frontend pages had not been updated to match: they queried `profiles` filtered directly by `organization_id`, a column PostgREST correctly refuses to filter on because it does not exist.

## 2. HTTP Request/Response Evidence

**Original failing request** (captured live during the Owner → Settings → Users navigation, and independently reproduced via a direct, isolated PostgREST call — i.e. two independent methods, same result):

```
GET https://ulgsndzfksphquqakelq.supabase.co/rest/v1/profiles
    ?select=id,first_name,last_name,email,phone,is_active,last_seen_at,created_at
    &organization_id=eq.5669e831-5325-4513-9956-f939b29b8eb0
    &deleted_at=is.null
    &order=first_name.asc

HTTP/1.1 400 Bad Request
{"code":"42703","details":null,"hint":null,"message":"column profiles.organization_id does not exist"}
```

`42703` is PostgreSQL's standard code for `undefined_column` — this is not an RLS denial (which would be a 401/403 with a different code), not a malformed request, and not a transient failure. It is PostgREST reporting, accurately, that the query asked for a column that is not there.

**Second instance, found during this investigation's own regression pass** (Roles page, not previously tested with this level of instrumentation):

```
GET https://ulgsndzfksphquqakelq.supabase.co/rest/v1/profiles
    ?select=id,first_name,last_name,email
    &organization_id=eq.5669e831-5325-4513-9956-f939b29b8eb0
    &deleted_at=is.null
    &order=first_name.asc

HTTP/1.1 400 Bad Request
{"code":"42703","details":null,"hint":null,"message":"column profiles.organization_id does not exist"}
```

Identical error, different page (`RolesSettingsPage.tsx`, not `UsersSettingsPage.tsx`) — same root cause, independent occurrence, not a residual of the first fix.

**Console output at time of both failures:** exactly one line each — `Failed to load resource: the server responded with a status of 400 ()` — no stack trace (expected; this is a rejected network request, not a thrown exception), no other errors on the page.

## 3. Evidence-Based Analysis

Systematically ruled out, each against the actual evidence rather than assumption:

- **Authentication:** ruled out — the Owner's session was valid throughout (dashboard, org settings, and every other query on both pages succeeded in the same page load).
- **Authorization / RLS policy:** ruled out — a policy denial returns a different error shape (typically `42501` or a `permission denied` message, sometimes surfaced as 401/403 by PostgREST's error mapping), not `42703`. The isolated `service_role` reproduction (Section 2) bypasses RLS entirely and produced the identical error, which independently rules out RLS as the cause.
- **Provisioning / test data:** ruled out — the error is schema-level (`column ... does not exist`), not data-level. It would occur identically against any organization, including real production ones, since it names a column, not a row.
- **Database schema:** **confirmed as the actual layer where the mismatch lives** — `profiles` genuinely has no `organization_id` column (by design, per Phase 1B.2), which the application code didn't account for in these two places.
- **Frontend request construction:** **confirmed as the proximate, correctable cause** — `UsersSettingsPage.tsx` and `RolesSettingsPage.tsx` both constructed a `.eq('organization_id', orgId)` filter against `profiles` directly, instead of deriving the relevant user ids from `memberships` (which does have `organization_id`) first.
- **Edge Function:** ruled out — this request never touches an Edge Function; it's a direct PostgREST call from the browser.
- **Configuration / Infrastructure:** ruled out — no environment-specific behavior; the isolated reproduction against the raw REST API confirms this is deterministic and code-level, not environmental.

## 4. Classification

**Application defect** — specifically, a query referencing a column removed from the schema in an earlier migration, in two frontend files that were not updated when that schema change happened.

**Why not "Provisioning issue" or "Test-data issue":** the error is schema-shaped (`42703`, a missing column), not data-shaped (no row/permission/format problem). It reproduces identically against the isolated `service_role` query, which has no dependency on which organization or which data is being queried.

**Why not "Expected behaviour" or "Configuration issue":** there is no configuration flag or intentional design that would make `profiles.organization_id` sometimes exist and sometimes not — the column simply isn't there, full stop, and querying for it is never correct.

**Why this counts as a Pilot Blocker category, not merely a code-quality nit:** its effect was total, silent non-functionality of two core Organization-Owner-facing pages (Users, Roles) — indistinguishable from those features never having been built, which is a materially different severity than a cosmetic or partial defect.

## 5. Corrective Action Report

**Files changed:** `UsersSettingsPage.tsx` (reported previously), and — newly, this investigation — `RolesSettingsPage.tsx`.

**Change, identical pattern in both files:** the `profiles` query no longer filters by the nonexistent `organization_id` column. Instead, it filters by `.in('id', memberIds)`, where `memberIds` is derived from the same page's own `memberships` query (which correctly does have and filter by `organization_id`) — sequenced so the `profiles` query only runs once `memberships` has resolved. The two `UsersSettingsPage.tsx` UPDATE mutations (edit profile, toggle active) simply dropped the same invalid filter — no cross-tenant risk, since the target row was already confirmed to belong to this org via the corrected list query before ever becoming editable.

**Pilot-readiness justification:** both pages are core Organization Owner capabilities (User Management, Role Management) explicitly named in this platform's own capability inventory. Restoring them is squarely "the minimum correction required to complete an existing Version 1 capability" — no new functionality, no refactor, no redesign: four call sites total across two files, each a one-line change (a different filter clause), verified with before/after evidence rather than assumed.

**What was deliberately not touched:** the query shape, the UI, the mutation logic, and every other page in the settings module that legitimately filters other tables (`locations`, `roles`, `automation rules`, etc.) by `organization_id` — those tables genuinely have that column; only the two `profiles` queries were wrong.

## 6. Regression Verification Results

Full, fresh live pass of the entire Organization Owner workflow after both fixes, single Playwright session, complete instrumentation (every 4xx/5xx captured with method, URL, and body; every console error captured):

| Step | Result |
|---|---|
| Login | ✅ `pilot-validation-owner@example.test` → `/dashboard` |
| Dashboard | ✅ loads, no errors |
| Settings → Organization | ✅ loads, no errors |
| Settings → Users | ✅ real data: "Anna Ägare" present, "Inga användare registrerade" absent |
| Settings → Roles | ✅ real data: 15 system roles, correct per-role member counts (Ägare: 1, Verksamhetschef: 1, Trafiklärare: 1, Receptionist: 1 — matching the tenant's actual 4 assigned accounts exactly) |
| **Total unexplained 4xx/5xx across the entire pass** | **Zero** |
| **Total console errors across the entire pass** | **Zero** |

`pnpm typecheck` (9/9 packages) and `eslint` on both changed files: clean, re-verified after the second fix, not merely assumed to still hold from the first.

## 7. Updated Operational Validation Report / 8. Updated Pilot Blocker Register / Updated Pilot Readiness Assessment

No change to the overall picture already on record in `docs/PILOT_OPERATIONAL_VALIDATION.md` and its continuation — the Users-page blocker was already marked fixed; it is now more thoroughly *proven* fixed, and a second instance that would otherwise have surfaced later (the first real pilot customer clicking into Roles instead of Users) has been closed pre-emptively. The two still-open items remain exactly what they were: Guardian creation (awaiting your classification) and SMTP (operational, unchanged).

**Operational validation may now resume for the remaining roles per Phase 6**, per this document's own gate — the Organization Owner workflow passes end-to-end with zero unexplained errors.

---

## Final Recommendation

**🟡 GO AFTER CORRECTING IDENTIFIED PILOT BLOCKERS** — unchanged in direction, strengthened in confidence. This investigation didn't just re-confirm the first fix; it found and closed a second, real instance of the identical defect class that a lighter-touch pass would have missed. That's the entire point of the defect-first, evidence-based method this sprint asked for, and it paid for itself.
