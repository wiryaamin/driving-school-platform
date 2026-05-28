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

# Copy env files and fill in the generated secret
cp supabase/functions/.env.example supabase/functions/.env
cp apps/web/.env.example apps/web/.env.local
```

`supabase/functions/.env`:
```
AUTH_HOOK_SECRET=<value from openssl above>
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

## Creating Test Users

Connect to the local database (`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`) or use the Supabase Studio at `http://127.0.0.1:54323`.

### Regular org user

1. Create an organization:
```sql
INSERT INTO public.organizations (name, slug, subscription_tier)
VALUES ('Test Driving School', 'test-driving-school', 'professional')
RETURNING id;
```

2. Sign up a user via Supabase Auth (use Studio → Authentication → Users → Add User).

3. Create a profile (auto-created by trigger if configured, otherwise):
```sql
INSERT INTO public.profiles (id, first_name, last_name, email, language_preference)
VALUES ('<user-uuid>', 'Test', 'User', 'test@example.com', 'sv');
```

4. Create a membership:
```sql
INSERT INTO public.memberships (user_id, organization_id, status)
VALUES ('<user-uuid>', '<org-uuid>', 'active')
RETURNING id;
```

5. Assign a role:
```sql
-- First find the role ID
SELECT id FROM public.roles WHERE name = 'org_admin' AND is_system_role = true;

-- Then assign it
INSERT INTO public.membership_roles (membership_id, role_id)
VALUES ('<membership-uuid>', '<role-uuid>');
```

6. Sign in via the web app — the JWT should now contain `organization_id`, `permissions`, and `role`.

---

## Platform Admin Bootstrap

Platform admins have full cross-tenant access. Bootstrap the first one with direct SQL:

```sql
-- 1. Create the auth user via Studio or supabase CLI
-- 2. Create their profile
INSERT INTO public.profiles (id, first_name, last_name, email, language_preference)
VALUES ('<user-uuid>', 'Platform', 'Admin', 'admin@internal.com', 'sv');

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
# Apply new migrations
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
