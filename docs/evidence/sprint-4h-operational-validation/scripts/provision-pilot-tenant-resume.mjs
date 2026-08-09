const SUPABASE_URL = 'https://ulgsndzfksphquqakelq.supabase.co';
const ANON_KEY = '<REDACTED_ANON_KEY_SEE_ENVIRONMENT_VARIABLE_REFERENCE_MD>';
const SERVICE_KEY = '<REDACTED_SERVICE_ROLE_KEY_NEVER_COMMIT_REAL_VALUE>';
const PASSWORD = '<REDACTED_ROTATED_TEST_PASSWORD>';

const orgId = '5669e831-5325-4513-9956-f939b29b8eb0';
const ownerId = '2c5d7cac-750d-44fc-842e-900f01fcbbbf';

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

const results = { orgId, ownerId };

async function main() {
  console.log('--- 3. Set known password for owner ---');
  await svc(`/auth/v1/admin/users/${ownerId}`, {
    method: 'PUT',
    body: JSON.stringify({ password: PASSWORD }),
  });
  console.log('owner password set');

  console.log('--- 4. Create remaining role users directly ---');
  const roles = [
    { key: 'branchManager', email: 'pilot-validation-branchmanager@example.test', first: 'Björn', last: 'Chef', role: 'org_manager' },
    { key: 'receptionist',  email: 'pilot-validation-receptionist@example.test',  first: 'Rita',  last: 'Reception', role: 'receptionist' },
    { key: 'instructor',    email: 'pilot-validation-instructor@example.test',    first: 'Ivan',  last: 'Instruktör', role: 'instructor' },
  ];

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

main().then(() => process.exitCode = 0).catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; });
