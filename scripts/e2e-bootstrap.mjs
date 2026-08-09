#!/usr/bin/env node
/**
 * e2e-bootstrap.mjs — (re)provisions the isolated E2E regression-testing
 * tenant + admin user and writes .env.e2e.local (gitignored).
 *
 * Safe to re-run any time: the e2e-bootstrap Edge Function is idempotent
 * (reuses the existing test org/user, just rotates the password).
 *
 * Requires: supabase CLI logged in and linked to the project (this repo
 * already is, throughout normal development).
 *
 * Usage: node scripts/e2e-bootstrap.mjs
 */

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT_REF = 'ulgsndzfksphquqakelq';

function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

const webEnv = readEnvFile(join(root, 'apps/web/.env.local'));
const supabaseUrl = webEnv.VITE_SUPABASE_URL;

const secret = randomBytes(32).toString('hex');
const password = `${randomBytes(16).toString('hex')}Aa1!`;

console.log('Setting E2E_BOOTSTRAP_SECRET...');
execSync(`supabase secrets set E2E_BOOTSTRAP_SECRET="${secret}" --project-ref ${PROJECT_REF}`, { stdio: 'inherit' });

console.log('Invoking e2e-bootstrap...');
const res = await fetch(`${supabaseUrl}/functions/v1/e2e-bootstrap`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ admin_password: password }),
});

if (!res.ok) {
  console.error('Bootstrap failed:', res.status, await res.text());
  process.exit(1);
}

const { data } = await res.json();

const envContent = `# E2E regression-testing credentials — isolated test tenant only, zero real data value.
# Gitignored (matches .env.*.local). Regenerate anytime via scripts/e2e-bootstrap.mjs.
E2E_ORG_ID=${data.org_id}
E2E_ORG_SLUG=${data.org_slug}
E2E_ADMIN_EMAIL=${data.admin_email}
E2E_ADMIN_PASSWORD=${password}
E2E_ADMIN_USER_ID=${data.admin_user_id}
`;

writeFileSync(join(root, '.env.e2e.local'), envContent);
console.log('Wrote .env.e2e.local — run scripts/e2e-login.mjs to get a session.');
