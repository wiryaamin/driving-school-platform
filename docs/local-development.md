# Local Development Guide

## Prerequisites

- Node.js 20+, pnpm 9+
- Docker Desktop (for Supabase local stack)
- Supabase CLI: `npm install -g supabase`

---

## First-Time Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
# Generate auth hook secret
openssl rand -base64 32
# Example output: mK4Lp2Rx7vNqY8Z0jW3sUeHdFcTbGnOi9AkXm1BpQ2E=

# Copy env files
cp supabase/functions/.env.example supabase/functions/.env
cp apps/web/.env.example apps/web/.env.local
```

`supabase/functions/.env`:
```
# IMPORTANT: prefix with v1,whsec_ — the raw base64 alone will not work
AUTH_HOOK_SECRET=v1,whsec_<value from openssl above>
WORKER_SECRET=any-random-string-for-local-dev
```

`apps/web/.env.local`:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key from supabase start output>
VITE_APP_ENV=development
```

### 3. Start the local Supabase stack

```bash
supabase start
# Note the anon key from the output — add to apps/web/.env.local
```

### 4. Serve Edge Functions

```bash
supabase functions serve --env-file supabase/functions/.env
```

### 5. Start the web app

```bash
pnpm --filter @platform/web dev
```

---

## Bootstrap: First Organization and Admin

Use the seed script rather than manual SQL inserts. The seed handles all steps atomically with full guards.

**Full instructions:** See `docs/DEPLOY.md` — Part 1, Steps 6–7.

Quick summary:
1. Create an auth user in Studio → Authentication → Users → Add User
2. Copy the UUID shown after creation
3. Open `supabase/seed/bootstrap_org_admin.sql` and update `v_user_id` and `v_user_email`
4. Run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f supabase/seed/bootstrap_org_admin.sql
```

For demo data:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f supabase/seed/demo_data.sql

psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f supabase/seed/demo_continuity.sql
```

---

## Platform Admin Bootstrap

Platform admins have cross-tenant access. To create a platform admin after running the org bootstrap:

```sql
-- 1. Create the auth user via Studio
-- 2. Create their profile (or it was already created by the bootstrap seed)
INSERT INTO public.profiles (id, first_name, last_name, email)
VALUES ('<user-uuid>', 'Platform', 'Admin', 'admin@internal.com')
ON CONFLICT (id) DO NOTHING;

-- 3. Register as platform admin
INSERT INTO public.platform_admins (user_id, role, is_active)
VALUES ('<user-uuid>', 'platform_superadmin', true);
```

Sign in — the JWT will contain:
```json
{
  "organization_id": null,
  "is_platform_admin": true,
  "role": "platform_superadmin",
  "subscription_tier": "enterprise"
}
```

---

## Verifying JWT Claims

After signing in, decode the access token to inspect claims:

```javascript
// In browser console after sign-in
const { data } = await supabase.auth.getSession();
const token = data.session.access_token;
const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
console.log(payload);
```

Expected for an org user:
```json
{
  "sub": "<user-uuid>",
  "email": "test@example.com",
  "organization_id": "<org-uuid>",
  "active_membership_id": "<membership-uuid>",
  "role": "org_admin",
  "permissions": ["students:student:read", "..."],
  "location_ids": [],
  "subscription_tier": "professional",
  "is_platform_admin": false
}
```

---

## Tenant Switching Demo

Requires a user with memberships in two organizations.

```sql
-- Add second organization and membership
INSERT INTO public.organizations (name, slug, subscription_tier)
VALUES ('Second School', 'second-school', 'starter')
RETURNING id;

INSERT INTO public.memberships (user_id, organization_id, status)
VALUES ('<user-uuid>', '<second-org-uuid>', 'active');
-- Assign a role for this membership too
```

In the browser console:
```javascript
import { useSwitchTenant } from './src/modules/auth/hooks/useSwitchTenant';
// Or directly:
const supabaseUrl = 'http://127.0.0.1:54321';
const { data: { session } } = await supabase.auth.getSession();

const res = await fetch(`${supabaseUrl}/functions/v1/switch-tenant`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ target_org_id: '<second-org-uuid>' }),
});
console.log(await res.json()); // { success: true, message: '...' }

// Then refresh to get the new JWT
await supabase.auth.refreshSession();

// Verify the new JWT
const { data: newSession } = await supabase.auth.getSession();
const newPayload = JSON.parse(atob(newSession.session.access_token.split('.')[1]...));
console.log(newPayload.organization_id); // should equal second-org-uuid
```

---

## Confirming the Auth Hook Fires

Watch Edge Function logs:
```bash
supabase functions serve --env-file supabase/functions/.env
# Watch terminal output for auth-hook log lines when signing in or refreshing
```

Log line pattern:
```json
{"level":"info","message":"auth-hook: claims built","timestamp":"...","context":{"correlation_id":"...","user_id":"...","method":"password","has_org":true,"is_platform_admin":false}}
```

---

## Useful Local Commands

```bash
# Apply new migrations (non-destructive — skips already-applied)
supabase db push

# Reset the database completely (WIPES ALL DATA — use only to start fresh)
supabase db reset

# Check migration status
supabase migration list

# View database in browser
supabase studio

# Run full typecheck
pnpm typecheck

# Run lint
pnpm lint
```
