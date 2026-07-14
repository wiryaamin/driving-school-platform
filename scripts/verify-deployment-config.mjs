#!/usr/bin/env node
/**
 * verify-deployment-config.mjs — Deployment Safety Verification (Pilot
 * Readiness Action 7).
 *
 * Compares every deployed Edge Function's LIVE gateway configuration
 * against the approved configuration declared in supabase/config.toml,
 * which is this platform's single source of truth for deployment intent.
 *
 * Why this exists: `supabase functions deploy <name>` silently applies
 * verify_jwt = true to any function without an explicit [functions.<name>]
 * entry in config.toml, and has been observed (Action 2, and again in the
 * Action 7 investigation) to reset an already-correct verify_jwt = false
 * back to true on a bare redeploy. This script detects that drift instead
 * of relying on deploy-tooling behavior or memory.
 *
 * Checks performed, per function:
 *   - verify_jwt matches config.toml
 *   - function is deployed and ACTIVE
 *   - every function directory on disk has an explicit config.toml entry
 *     (no more implicit defaults to silently drift into)
 *   - every config.toml entry corresponds to a real, live deployment
 *   - no unexpected function is live that isn't declared in config.toml
 *
 * Usage:
 *   node scripts/verify-deployment-config.mjs
 *   SUPABASE_PROJECT_REF=<ref> node scripts/verify-deployment-config.mjs
 *
 * Exit code: 0 if every deployed function matches its approved
 * configuration; 1 if any drift, missing deployment, inactive function, or
 * undeclared live function is found.
 *
 * This script intentionally reuses the existing `supabase functions list`
 * CLI (the same command used manually throughout prior Pilot Readiness
 * actions) rather than introducing a new deployment framework or API
 * client.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_TOML_PATH = path.join(REPO_ROOT, 'supabase', 'config.toml');
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'supabase', 'functions');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'ulgsndzfksphquqakelq';

/** Parses [functions.<name>] blocks out of config.toml. Deliberately
 * narrow — not a general TOML parser — this only needs to read the flat
 * enabled/verify_jwt keys under each [functions.*] table header, which is
 * the entirety of this file's [functions.*] structure. */
function parseConfigTomlFunctions(tomlText) {
  const functions = new Map();
  const lines = tomlText.split(/\r?\n/);
  let currentName = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^\[functions\.([a-zA-Z0-9_-]+)\]$/);
    if (sectionMatch) {
      currentName = sectionMatch[1];
      if (functions.has(currentName)) {
        throw new Error(`Duplicate [functions.${currentName}] section in config.toml`);
      }
      functions.set(currentName, { enabled: null, verify_jwt: null });
      continue;
    }
    if (currentName === null) continue;
    if (line.startsWith('[')) {
      // entered a different top-level table; stop attributing keys to currentName
      currentName = null;
      continue;
    }
    const kvMatch = line.match(/^(enabled|verify_jwt)\s*=\s*(true|false)\s*$/);
    if (kvMatch) {
      functions.get(currentName)[kvMatch[1]] = kvMatch[2] === 'true';
    }
  }

  return functions;
}

function listFunctionDirectories() {
  return readdirSync(FUNCTIONS_DIR)
    .filter((name) => name !== '_shared')
    .filter((name) => statSync(path.join(FUNCTIONS_DIR, name)).isDirectory())
    .sort();
}

function fetchLiveFunctions(projectRef) {
  const raw = execFileSync(
    'supabase',
    ['functions', 'list', '--project-ref', projectRef, '-o', 'json'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const parsed = JSON.parse(raw);
  const bySlug = new Map();
  for (const fn of parsed) bySlug.set(fn.slug ?? fn.name, fn);
  return bySlug;
}

function main() {
  const tomlText = readFileSync(CONFIG_TOML_PATH, 'utf8');
  const approved = parseConfigTomlFunctions(tomlText);
  const onDisk = listFunctionDirectories();

  const findings = [];

  // Every function directory on disk must have an explicit config.toml entry.
  for (const name of onDisk) {
    if (!approved.has(name)) {
      findings.push({
        severity: 'FAIL',
        function: name,
        issue: 'NO_CONFIG_TOML_ENTRY',
        detail: 'Function directory exists on disk but has no [functions.<name>] entry in config.toml — a bare deploy would silently apply the platform default (verify_jwt = true).',
      });
    }
  }

  // Every config.toml entry must correspond to a real function directory.
  for (const name of approved.keys()) {
    if (!onDisk.includes(name)) {
      findings.push({
        severity: 'WARN',
        function: name,
        issue: 'CONFIG_TOML_ENTRY_HAS_NO_SOURCE',
        detail: 'config.toml declares this function but no matching directory exists under supabase/functions/.',
      });
    }
  }

  // Every config.toml entry must have an explicit verify_jwt value.
  for (const [name, cfg] of approved.entries()) {
    if (cfg.verify_jwt === null) {
      findings.push({
        severity: 'FAIL',
        function: name,
        issue: 'MISSING_VERIFY_JWT_KEY',
        detail: '[functions.' + name + '] exists but has no verify_jwt = true/false line.',
      });
    }
  }

  console.log(`Deployment Safety Verification — project ${PROJECT_REF}`);
  console.log(`config.toml: ${approved.size} declared functions | disk: ${onDisk.length} function directories\n`);

  let live;
  try {
    live = fetchLiveFunctions(PROJECT_REF);
  } catch (err) {
    console.error('FAIL: could not fetch live function list via `supabase functions list`.');
    console.error(String(err.message ?? err));
    process.exitCode = 1;
    return;
  }

  console.log(`live deployment: ${live.size} functions reported\n`);

  const rows = [];
  for (const [name, cfg] of approved.entries()) {
    if (cfg.verify_jwt === null) continue; // already reported above
    const liveFn = live.get(name);

    if (!liveFn) {
      findings.push({
        severity: 'FAIL',
        function: name,
        issue: 'NOT_DEPLOYED',
        detail: 'Declared in config.toml but not present in the live function list.',
      });
      rows.push({ name, approved: cfg.verify_jwt, live: '—', status: 'MISSING', result: 'FAIL' });
      continue;
    }

    if (liveFn.status !== 'ACTIVE') {
      findings.push({
        severity: 'FAIL',
        function: name,
        issue: 'NOT_ACTIVE',
        detail: `Live status is "${liveFn.status}", expected ACTIVE.`,
      });
    }

    if (liveFn.verify_jwt !== cfg.verify_jwt) {
      findings.push({
        severity: 'FAIL',
        function: name,
        issue: 'VERIFY_JWT_DRIFT',
        detail: `config.toml declares verify_jwt = ${cfg.verify_jwt}, live gateway reports verify_jwt = ${liveFn.verify_jwt}.`,
      });
    }

    const result = liveFn.status === 'ACTIVE' && liveFn.verify_jwt === cfg.verify_jwt ? 'PASS' : 'FAIL';
    rows.push({ name, approved: cfg.verify_jwt, live: liveFn.verify_jwt, status: liveFn.status, result });
  }

  // Live functions that exist but aren't declared anywhere in config.toml.
  for (const name of live.keys()) {
    if (!approved.has(name)) {
      findings.push({
        severity: 'FAIL',
        function: name,
        issue: 'UNDECLARED_LIVE_FUNCTION',
        detail: 'Function is live in production but has no config.toml entry at all.',
      });
    }
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  const nameWidth = Math.max(...rows.map((r) => r.name.length), 'FUNCTION'.length) + 2;
  console.log(
    'FUNCTION'.padEnd(nameWidth) + 'APPROVED'.padEnd(10) + 'LIVE'.padEnd(8) + 'STATUS'.padEnd(10) + 'RESULT',
  );
  for (const r of rows) {
    console.log(
      r.name.padEnd(nameWidth) +
        String(r.approved).padEnd(10) +
        String(r.live).padEnd(8) +
        String(r.status).padEnd(10) +
        r.result,
    );
  }

  const passCount = rows.filter((r) => r.result === 'PASS').length;
  const failCount = rows.filter((r) => r.result === 'FAIL').length;
  console.log(`\n${passCount} passed, ${failCount} failed out of ${rows.length} declared functions.`);

  if (findings.length > 0) {
    console.log(`\n${findings.length} finding(s):\n`);
    for (const f of findings) {
      console.log(`[${f.severity}] ${f.function} — ${f.issue}`);
      console.log(`    ${f.detail}`);
    }
  } else {
    console.log('\nNo drift detected. All deployed Edge Functions match their approved configuration.');
  }

  const hardFailures = findings.filter((f) => f.severity === 'FAIL');
  process.exitCode = hardFailures.length > 0 ? 1 : 0;
}

main();
