# Pilot Deployment Checklist

Platform: Trafikskolan SaaS — Swedish Driving School ERP

Use this checklist for every controlled pilot deployment. Work through each section in order. Mark items with ✓ as you complete them.

---

## Pre-Deployment — Prerequisites

### Environment
- [ ] Node.js ≥ 20 installed and verified (`node --version`)
- [ ] pnpm ≥ 9 installed and verified (`pnpm --version`)
- [ ] Docker Desktop is running
- [ ] Supabase CLI is installed (`supabase --version`)
- [ ] Repository is cloned from the correct branch/tag

### Build verification
- [ ] `pnpm install` completes without errors
- [ ] `pnpm typecheck` exits with 0 errors
- [ ] `pnpm build` succeeds (check `apps/web/dist/` exists after)

---

## Supabase Setup

This project uses **hosted Supabase** (project ref: `ulgsndzfksphquqakelq`). No local Docker stack required.

### Project connection
- [ ] `apps/web/.env.local` has `VITE_SUPABASE_URL=https://ulgsndzfksphquqakelq.supabase.co`
- [ ] `apps/web/.env.local` has the correct `VITE_SUPABASE_ANON_KEY` (from Dashboard → Settings → API)

### Migrations
- [ ] `supabase link --project-ref ulgsndzfksphquqakelq` completed
- [ ] `supabase db push --linked` completed without errors
- [ ] `supabase migration list --linked` shows all migrations as Applied
- [ ] No "ERROR" lines in the migration output

### Edge Functions & Secrets
- [ ] Edge Functions deployed: `supabase functions deploy --project-ref ulgsndzfksphquqakelq`
- [ ] `AUTH_HOOK_SECRET` set on hosted project (format: `v1,whsec_<base64>`)
- [ ] `WORKER_SECRET` set on hosted project
- [ ] Secrets verified: `supabase secrets list --project-ref ulgsndzfksphquqakelq`

---

## Auth Hook

- [ ] Auth hook configured in Dashboard → Authentication → Hooks → Custom Access Token Hook
- [ ] Hook URI: `https://ulgsndzfksphquqakelq.supabase.co/functions/v1/auth-hook`
- [ ] Hook secret matches the `AUTH_HOOK_SECRET` set above

**Validation:** Sign in with the pilot user and decode the JWT (see below). Confirm no `auth_degraded` flag is present.

---

## Bootstrap Validation

- [ ] Auth user created in Studio → Authentication → Users
- [ ] `v_user_id` UUID in `bootstrap_org_admin.sql` matches the created user
- [ ] `v_user_email` matches the sign-in email
- [ ] Organization name, legal name, and location are set to real pilot values
- [ ] `bootstrap_org_admin.sql` ran without errors
- [ ] Bootstrap output shows: "Bootstrap complete" with Organization ID and Membership ID

---

## Frontend Validation

- [ ] `apps/web/.env.local` exists with correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_APP_ENV=development` (local pilot) or `production` (hosted pilot)
- [ ] `VITE_ENABLE_QUERY_DEVTOOLS=false` for pilot sessions
- [ ] `VITE_ENABLE_DEBUG_LOGGING=false` for pilot sessions
- [ ] `pnpm dev` starts without errors
- [ ] App loads at `http://localhost:5173` without blank screen or error boundary

---

## Login & JWT Validation

Sign in with the bootstrapped admin account and run in the browser console:

```javascript
const { data } = await supabase.auth.getSession();
const t = data.session.access_token;
console.log(JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))));
```

Verify each of the following in the JWT output:

- [ ] `organization_id` — non-null UUID (matches bootstrap output)
- [ ] `role` — `"org_owner"`
- [ ] `permissions` — non-empty array (org_owner has all permissions)
- [ ] `location_ids` — array with at least one UUID (primary location)
- [ ] `subscription_tier` — `"trial"`
- [ ] `is_platform_admin` — `false`
- [ ] `auth_degraded` — must be **absent** (not present in the claims)

---

## Module Smoke Test

Walk through each module and verify it loads without errors:

### Dashboard
- [ ] `/` loads — KPI cards appear (may show zeros if no data)
- [ ] Today's lessons section is visible
- [ ] Recent activity feed loads (may be empty)

### Students
- [ ] `/students` loads — list renders (empty state if no demo data)
- [ ] "Ny elev" button opens the create sheet
- [ ] Create sheet validates and submits without console errors

### Scheduling
- [ ] `/scheduling` loads — FullCalendar renders
- [ ] Week view is visible with Swedish day names
- [ ] No console errors on load

### Instructors
- [ ] `/instructors` loads — list renders
- [ ] "Ny instruktör" button opens the create form

### Finance
- [ ] `/finance/invoices` loads — invoice list renders
- [ ] "Ny faktura" button opens the create sheet (requires `finance:invoice:create` permission)
- [ ] `/finance/payments` loads — payment list renders

---

## Demo Data Validation (if demo seeds were applied)

- [ ] `demo_data.sql` applied without errors
- [ ] `demo_continuity.sql` applied without errors
- [ ] Dashboard shows upcoming lessons for the current week
- [ ] At least 2 instructors appear in the instructor list
- [ ] At least 5 lesson types appear in the scheduling form

---

## Operational Sanity Checks

### Database
- [ ] Can query `public.organizations` in Studio (shows the bootstrapped org)
- [ ] Can query `public.memberships` (shows the admin membership)
- [ ] Can query `public.roles` (shows org_owner, org_admin, instructor, student roles)
- [ ] Can query `public.permissions` (should have 50+ rows)

### Auth
- [ ] Signing out redirects to the login page
- [ ] Signing back in restores the session with the same JWT claims
- [ ] Accessing `/403` directly shows the "Ingen åtkomst" page
- [ ] Accessing a non-existent route shows the "Kommer snart" placeholder

### Error boundary
- [ ] No JavaScript console errors on any page above
- [ ] No React rendering errors visible

---

## Event Worker (if operational features are being tested)

- [ ] Manual invocation works:
  ```bash
  curl -s -X POST https://ulgsndzfksphquqakelq.supabase.co/functions/v1/event-worker \
    -H "Authorization: Bearer <WORKER_SECRET>" \
    -H "Content-Type: application/json" \
    -d '{}'
  ```
- [ ] Response contains `{ "processed": N, "maintenance": { ... } }` without errors

---

## Pilot Sign-Off Criteria

A pilot deployment is considered successful when:

1. All items in "Login & JWT Validation" are checked
2. All 5 module smoke tests pass without console errors
3. Auth hook is confirmed firing (JWT has `organization_id` — not `auth_degraded`)
4. Bootstrap completed and org owner can sign in

If any item fails, do not proceed with user access until resolved. See `docs/DEPLOY.md` Troubleshooting section for resolution guidance.

---

## Known Pilot-Phase Limitations

The following features are scaffolded but not yet fully built. These are expected gaps — not failures:

| Feature | Status | Placeholder shown |
|---|---|---|
| BankID authentication | Not built | Feature flag disabled |
| AI Assistant | Not built | Feature flag disabled |
| Corporate portal | Not built | Feature flag disabled |
| Impersonation (platform admin → tenant) | Guard in place, UI not built | N/A |
| Student portal (`localhost:5174`) | Separate app not yet built | N/A |

Routes not yet implemented redirect to "Kommer snart" (Coming soon) — this is the expected behavior for the `path: '*'` wildcard route.

## Transportstyrelsen/Trafikverket Integration Domain (2026-07-27)

No pilot impact — none of this is a gap that stops a school from operating. Vehicle registration/insurance/inspection tracking already works today via manual entry (Epic 3.5); Vehicle Registry Lookup (`/resources`, "Hämta uppgifter" button) is an optional automation on top of it, live on Mock by default. The Manual Government Workflow Tracker (`/regulatory`) is a net-new internal tool with no external dependency, ready for pilot use as-is. See `docs/INTEGRATION_CONFIGURATION_GUIDE.md` §4.11–§4.12 for full detail, and `docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md`'s Version History for the two pre-existing platform bugs (a `notifications` enum gap and an RLS permission-code mismatch that had silently broken the Notification Bell platform-wide since Phase 3D) found and fixed while commissioning this work.
