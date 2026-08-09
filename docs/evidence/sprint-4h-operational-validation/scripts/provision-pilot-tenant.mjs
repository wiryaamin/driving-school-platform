// Provisions a clearly-labeled Pilot Validation Tenant for Sprint 4H operational
// validation, per explicit user authorization. Uses the real platform-admin
// provisioning Edge Function (not hand-rolled SQL) for the org+owner, then
// service_role for the remaining role accounts (email delivery is a known,
// separately-validated, rate-limited dependency — not re-tested here).

const SUPABASE_URL = 'https://ulgsndzfksphquqakelq.supabase.co';
const ANON_KEY = '<REDACTED_ANON_KEY_SEE_ENVIRONMENT_VARIABLE_REFERENCE_MD>';
const SERVICE_KEY = '<REDACTED_SERVICE_ROLE_KEY_NEVER_COMMIT_REAL_VALUE>';
const PASSWORD = '<REDACTED_ROTATED_TEST_PASSWORD>';

async function svc(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function createUser(email) {
  const user = await svc('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  return user.id;
}

async function signIn(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`signIn ${email} -> ${JSON.stringify(json)}`);
  return json.access_token;
}

const results = {};

async function main() {
  console.log('--- 1. Platform admin user ---');
  const paEmail = 'pilot-validation-platformadmin@example.test';
  const paId = await createUser(paEmail);
  results.platformAdminId = paId;
  console.log('created', paId);

  await svc('/rest/v1/platform_admins', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: paId, role: 'platform_superadmin', is_active: true }),
  });
  console.log('platform_admins row inserted');

  const paToken = await signIn(paEmail);
  console.log('signed in as platform admin');

  console.log('--- 2. Provision org via real /platform-admin/provision ---');
  const provisionRes = await fetch(`${SUPABASE_URL}/functions/v1/platform-admin/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${paToken}` },
    body: JSON.stringify({
      name: 'Pilot Validation School',
      legal_name: 'Pilot Validation School AB',
      subscription_tier: 'trial',
      trial_days: 30,
      admin_first_name: 'Anna',
      admin_last_name: 'Ägare',
      admin_email: 'pilot-validation-owner@example.test',
    }),
  });
  const provisionJson = await provisionRes.json();
  if (!provisionRes.ok) throw new Error(`provision -> ${provisionRes.status}: ${JSON.stringify(provisionJson)}`);
  console.log('provision result:', JSON.stringify(provisionJson));
  const orgId = provisionJson.data.organization_id ?? provisionJson.data.organizationId ?? provisionJson.data.id;
  const ownerId = provisionJson.data.admin_user_id ?? provisionJson.data.user_id ?? provisionJson.data.adminUserId;
  results.orgId = orgId;
  results.ownerId = ownerId;
  console.log('orgId', orgId, 'ownerId', ownerId);

  console.log('--- 3. Set known password for owner ---');
  await svc(`/auth/v1/admin/users/${ownerId}`, {
    method: 'PUT',
    body: JSON.stringify({ password: PASSWORD }),
  });
  console.log('owner password set');

  console.log('--- 4. Create remaining role users directly (email delivery already validated separately) ---');
  const roles = [
    { key: 'branchManager', email: 'pilot-validation-branchmanager@example.test', first: 'Björn', last: 'Chef', role: 'org_manager' },
    { key: 'receptionist',  email: 'pilot-validation-receptionist@example.test',  first: 'Rita',  last: 'Reception', role: 'receptionist' },
    { key: 'instructor',    email: 'pilot-validation-instructor@example.test',    first: 'Ivan',  last: 'Instruktör', role: 'instructor' },
  ];

  // look up role ids
  const roleRows = await svc(`/rest/v1/roles?select=id,name&name=in.(org_manager,receptionist,instructor)`);
  const roleIdByName = Object.fromEntries(roleRows.map(r => [r.name, r.id]));
  console.log('role ids', roleIdByName);

  for (const r of roles) {
    const uid = await createUser(r.email);
    await svc('/rest/v1/profiles', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id: uid, first_name: r.first, last_name: r.last, email: r.email, is_active: true }),
    });
    const membership = await svc('/rest/v1/memberships', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: uid, organization_id: orgId, status: 'active', joined_at: new Date().toISOString() }),
    });
    const membershipId = membership[0].id;
    await svc('/rest/v1/membership_roles', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ membership_id: membershipId, organization_id: orgId, role_id: roleIdByName[r.role], is_active: true, assigned_by: ownerId }),
    });
    results[r.key] = { id: uid, email: r.email };
    console.log(r.key, 'created:', uid);
  }

  console.log('--- DONE ---');
  console.log(JSON.stringify({ ...results, password: PASSWORD }, null, 2));
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
