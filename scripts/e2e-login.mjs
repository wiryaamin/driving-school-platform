#!/usr/bin/env node
/**
 * e2e-login.mjs — mints a fresh Supabase session for the isolated E2E
 * regression-testing tenant, with no browser and no human involvement.
 *
 * Requires .env.e2e.local (gitignored) to exist — run scripts/e2e-bootstrap.mjs
 * once first if it doesn't.
 *
 * Usage:
 *   node scripts/e2e-login.mjs
 *   node scripts/e2e-login.mjs --curl   # prints a ready-to-use Authorization header
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

const e2eEnv = readEnvFile(join(root, '.env.e2e.local'));
const webEnv = readEnvFile(join(root, 'apps/web/.env.local'));

const supabaseUrl = webEnv.VITE_SUPABASE_URL;
const anonKey = webEnv.VITE_SUPABASE_ANON_KEY;

const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: e2eEnv.E2E_ADMIN_EMAIL, password: e2eEnv.E2E_ADMIN_PASSWORD }),
});

if (!res.ok) {
  console.error('Login failed:', res.status, await res.text());
  process.exit(1);
}

const data = await res.json();

if (process.argv.includes('--curl')) {
  console.log(`Authorization: Bearer ${data.access_token}`);
} else {
  console.log(JSON.stringify({
    access_token: data.access_token,
    expires_in: data.expires_in,
    org_id: e2eEnv.E2E_ORG_ID,
    org_slug: e2eEnv.E2E_ORG_SLUG,
  }, null, 2));
}
