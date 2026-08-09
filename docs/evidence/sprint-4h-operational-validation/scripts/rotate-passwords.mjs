import crypto from 'crypto';

const SUPABASE_URL = 'https://ulgsndzfksphquqakelq.supabase.co';
const SERVICE_KEY = '<REDACTED_SERVICE_ROLE_KEY_NEVER_COMMIT_REAL_VALUE>';

function genPassword() {
  return crypto.randomBytes(18).toString('base64').replace(/[+/=]/g, m => ({'+':'A','/':'B','=':''}[m])) + '!9';
}

const accounts = [
  { role: 'Platform Administrator', email: 'pilot-validation-platformadmin@example.test', id: '159056bc-6a74-45aa-bd68-514ffb54c1ef' },
  { role: 'Organization Owner',     email: 'pilot-validation-owner@example.test',         id: '2c5d7cac-750d-44fc-842e-900f01fcbbbf' },
  { role: 'Branch Manager',         email: 'pilot-validation-branchmanager@example.test', id: '9446da42-bbd4-4f09-9e46-709673db1af7' },
  { role: 'Receptionist',           email: 'pilot-validation-receptionist@example.test',  id: '6b37f6a1-8ece-41ee-96db-2c67fff192b8' },
  { role: 'Instructor',             email: 'pilot-validation-instructor@example.test',    id: 'cd906e62-8ee3-40c9-b400-975a7723ef92' },
];

async function setPassword(id, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`${id} -> ${res.status}: ${await res.text()}`);
}

const lines = ['# Pilot Validation Tenant — Credentials (rotated Sprint 4H)', '', '**Do not commit. Gitignored.**', ''];
for (const acc of accounts) {
  const pw = genPassword();
  await setPassword(acc.id, pw);
  lines.push(`- **${acc.role}** — \`${acc.email}\` — \`${pw}\``);
  console.log(`rotated: ${acc.role}`);
}

const fs = await import('fs');
fs.writeFileSync('C:/Users/worya/Claude Projects/Driving Schools/supabase/seed/pilot-validation-credentials.local.md', lines.join('\n') + '\n');
console.log('DONE — credentials written to supabase/seed/pilot-validation-credentials.local.md');
