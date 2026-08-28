/**
 * Trial onboarding — provisioning engine.
 *
 * Extracted from trial-signup/index.ts's old handleComplete (2026-08-08,
 * "remove auto-approval" hardening pass). Previously a tenant's own
 * questionnaire submission both validated AND immediately provisioned the
 * organization in one request — Platform Admin had no real say before an
 * org existed. Now: trial-signup's POST /:token/complete only validates and
 * marks the session questionnaire_completed; provisioning only runs when
 * Platform Admin explicitly calls platform-admin's POST
 * /trial-requests/:id/approve, which imports and calls
 * provisionTrialOrganization() from here. Single implementation, two very
 * different callers in spirit (public applicant vs. authenticated admin) —
 * not a second lifecycle system, the same one with its provisioning step
 * relocated to where the approval gate actually lives.
 *
 * Every hard failure (organization creation, the configuration pipeline,
 * validation, or administrator-account creation) rolls back everything
 * created in this run via rollbackTrialProvisioning() and leaves the
 * session in 'provisioning_failed' — correctable and retriable, never a
 * dangling half-provisioned organization. Steps E1-E5 (vehicles/
 * instructors/staff/branches/slots) stay best-effort/non-fatal, same as
 * before — a failure there was never a reason to fail the whole request.
 */

import { dispatchMessage } from './comm-providers.ts';
import {
  provisionBusinessConfiguration, provisionBusinessResources,
  type CompleteAnswers as SharedCompleteAnswers,
} from './business-setup-provisioning.ts';
import { logTrialEvent, type TrialEventType } from './trial-onboarding-lifecycle.ts';
import { logger } from './logger.ts';

// deno-lint-ignore no-explicit-any
type DbClient = any;

function getAppOrigin(): string {
  const configured = Deno.env.get('APP_URL');
  return configured && configured.length > 0 ? configured : 'http://localhost:5173';
}

async function generateUniqueSlug(db: DbClient, name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'trafikskola';

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (candidate.length < 3) continue;
    const { count } = await db.from('organizations').select('id', { count: 'exact', head: true }).eq('slug', candidate);
    if ((count ?? 0) === 0) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export function passwordCreationEmailHtml(schoolName: string, actionLink: string): string {
  return `
    <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <p style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Trafikcloud</p>
      <h2 style="font-size: 18px; margin-top: 24px;">Er trafikskola är konfigurerad</h2>
      <p>Hej,</p>
      <p><strong>${schoolName}</strong> är nu konfigurerad utifrån era svar. Sista steget — skapa ert lösenord för att logga in.</p>
      <p style="margin: 32px 0;">
        <a href="${actionLink}" style="background: #16a34a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
          Skapa lösenord och logga in
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Frågor? Hör av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    </div>`;
}

interface WelcomeConfigItem {
  name: string; purpose: string; status: string; beforeProduction: string; parameters: string[]; location: string;
}

export function buildWelcomeConfigItems(answers: CompleteAnswers): WelcomeConfigItem[] {
  const items: WelcomeConfigItem[] = [];

  items.push({
    name: 'E-post (Resend)',
    purpose: 'Bekräftelser, påminnelser och kvitton skickas via e-post till era elever.',
    status: 'Använder Trafikclouds pilot-/testkonfiguration så att ni kan börja testa direkt.',
    beforeProduction: 'Ersätt med er egen Resend-konfiguration innan skarp drift.',
    parameters: ['Resend API-nyckel'],
    location: 'Kommunikation → Kanalinställningar → E-post',
  });

  if (answers.channels?.sms) {
    items.push({
      name: 'SMS (46elks)',
      purpose: 'SMS-påminnelser och bekräftelser till elever.',
      status: 'Använder Trafikclouds pilot-/testkonfiguration (46elks, begränsad testkredit) så att ni kan börja testa direkt.',
      beforeProduction: 'Ersätt Trafikclouds testkonfiguration med ert eget SMS-konto (46elks eller annan leverantör) innan skarp drift.',
      parameters: ['46elks API-användarnamn', '46elks API-lösenord'],
      location: 'Kommunikation → Kanalinställningar → SMS',
    });
  }
  if (answers.channels?.whatsapp) {
    items.push({
      name: 'WhatsApp (Meta)',
      purpose: 'WhatsApp-meddelanden till elever.',
      status: 'Använder Trafikclouds pilot-/testkonfiguration (Metas testnummer) så att ni kan börja testa direkt.',
      beforeProduction: 'Ersätt Trafikclouds testkonfiguration med ert eget verifierade WhatsApp Business-nummer innan skarp drift.',
      parameters: ['Meta Access Token', 'Meta Phone Number ID'],
      location: 'Kommunikation → Kanalinställningar → WhatsApp',
    });
  }
  if (Array.isArray(answers.payment_methods) && answers.payment_methods.includes('card')) {
    items.push({
      name: 'Kortbetalning (Nets och Stripe)',
      purpose: 'Låter elever betala kurser och lektioner med kort direkt i Trafikcloud.',
      status: 'Använder Trafikclouds pilot-/testkonfiguration (både Nets och Stripe testmiljö) så att ni kan börja testa direkt.',
      beforeProduction: 'Ersätt Trafikclouds testkonfiguration med ert eget Nets- eller Stripe-konto innan skarp drift.',
      parameters: ['Nets Secret Key', 'Nets Checkout Key', 'Stripe Secret Key'],
      location: 'Inställningar → Företagsuppgifter → Betalningar',
    });
  }

  items.push({
    name: 'Personuppslag (Roaring)',
    purpose: 'Slår automatiskt upp namn och adress när ni registrerar en ny elev med personnummer.',
    status: 'Använder Trafikclouds pilot-/testkonfiguration (Roaring sandbox) så att ni kan börja testa direkt.',
    beforeProduction: 'Ersätt Trafikclouds testkonfiguration med ert eget Roaring-konto (eller annan leverantör) innan skarp drift.',
    parameters: ['Roaring Client ID', 'Roaring Client Secret'],
    location: 'Inställningar → Externa tjänster → Personuppslag',
  });

  return items;
}

export function welcomeConfigEmailHtml(schoolName: string, items: WelcomeConfigItem[]): string {
  const rows = items.map((item) => `
    <div style="margin: 20px 0; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <p style="font-weight: 600; margin: 0 0 8px;">${item.name}</p>
      <p style="font-size: 13px; color: #475569; margin: 0 0 10px;">${item.purpose}</p>
      <p style="font-size: 13px; margin: 4px 0;"><strong>Status just nu:</strong> ${item.status}</p>
      <p style="font-size: 13px; margin: 4px 0;"><strong>Innan skarp drift:</strong> ${item.beforeProduction}</p>
      <p style="font-size: 13px; margin: 4px 0 2px;"><strong>Ersätt följande uppgifter med era egna:</strong></p>
      <ul style="font-size: 13px; margin: 0 0 4px; padding-left: 20px;">
        ${item.parameters.map((p) => `<li>${p}</li>`).join('')}
      </ul>
      <p style="font-size: 13px; margin: 4px 0;"><strong>Var:</strong> ${item.location}</p>
    </div>`).join('');

  return `
    <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; color: #0f172a;">
      <p style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Trafikcloud</p>
      <h2 style="font-size: 18px; margin-top: 24px;">Välkommen — så här är er provperiod konfigurerad</h2>
      <p>Hej,</p>
      <p><strong>${schoolName}</strong> är redo att användas. Här är en översikt över vilka externa tjänster som används under provperioden, och vad ni behöver göra själva innan skarp drift.</p>
      ${rows}
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">Inga lösenord, nycklar eller andra hemliga uppgifter förekommer i det här mailet — allt konfigureras säkert direkt i Trafikcloud.</p>
      <p style="font-size: 13px; color: #64748b;">Frågor? Hör av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    </div>`;
}

// ─── Answer shape ─────────────────────────────────────────────────────────────
//
// Now the canonical shape defined in business-setup-provisioning.ts (Tenant
// Registration Unification, 2026-08-28) — re-exported here so trial-signup/
// index.ts's existing `import type { CompleteAnswers } from
// '../_shared/trial-provisioning.ts'` keeps working unchanged.
export type {
  VehicleAnswer, InstructorAnswer, StaffAnswer, BranchAnswer,
} from './business-setup-provisioning.ts';
export type CompleteAnswers = SharedCompleteAnswers;

export interface TrialProvisioningSession {
  id: string;
  email: string;
  driving_school_name: string;
  interview_answers: Record<string, unknown>;
}

export type ProvisionResult =
  | {
      ok: true;
      organizationId: string; actionLink: string | null;
      lessonTypesCreated: number; packageTemplatesCreated: number; branchCreated: number; pricedLessonTypes: number;
      vehiclesCreated: number; instructorsCreated: number; staffInvited: number;
      additionalBranchesCreated: number; slotsGenerated: number;
    }
  | { ok: false; code: string; message: string; status: number };

// ─── Rollback ─────────────────────────────────────────────────────────────────
//
// Full teardown of everything a provisioning run could have created, safe to
// call even if only some steps succeeded (every delete is a no-op on rows
// that don't exist). Mirrors the exact table/order this session's own
// disposable-diagnostic cleanup scripts have used throughout development.
// Order matters: tenant_trial_sessions_org_fkey is ON DELETE CASCADE, so the
// session's own organization_id is cleared FIRST — deleting the org while
// the session still points at it would cascade-delete the session too.
export async function rollbackTrialProvisioning(
  db: DbClient, sessionId: string, orgId: string, userId: string | null, isNewUser: boolean,
): Promise<void> {
  await db.from('tenant_trial_sessions').update({ organization_id: null }).eq('id', sessionId);

  if (userId) {
    await db.from('membership_roles').delete().in(
      'membership_id',
      (await db.from('memberships').select('id').eq('user_id', userId).eq('organization_id', orgId)).data?.map((m: { id: string }) => m.id) ?? [],
    );
    await db.from('memberships').delete().eq('user_id', userId).eq('organization_id', orgId);
    // Only delete the auth user (and their profile) if THIS run created
    // them. When the applicant's email matched an existing platform user,
    // userId points at a real, pre-existing account — deleting it here
    // would destroy an unrelated person's login over a failure in this
    // org's provisioning, not just undo this run's own side effects.
    if (isNewUser) {
      await db.auth.admin.deleteUser(userId);
      await db.from('profiles').delete().eq('id', userId);
    }
  }
  // Any additional staff (admin_entries/receptionist_entries) invited during
  // this run aren't tracked individually — find them via remaining
  // memberships on this org before the org itself disappears.
  const { data: remainingMemberships } = await db.from('memberships').select('id, user_id').eq('organization_id', orgId);
  for (const m of (remainingMemberships ?? []) as Array<{ id: string; user_id: string }>) {
    await db.from('membership_roles').delete().eq('membership_id', m.id);
    await db.auth.admin.deleteUser(m.user_id);
    await db.from('profiles').delete().eq('id', m.user_id);
  }
  await db.from('memberships').delete().eq('organization_id', orgId);

  const { data: instr } = await db.from('instructors').select('id').eq('organization_id', orgId);
  const instrIds = (instr ?? []).map((i: { id: string }) => i.id);
  if (instrIds.length > 0) await db.from('instructor_availability_rules').delete().in('instructor_id', instrIds);
  await db.from('lesson_slots').delete().eq('organization_id', orgId);
  await db.from('scheduling_generation_runs').delete().eq('organization_id', orgId);
  await db.from('scheduling_generation_configs').delete().eq('organization_id', orgId);
  await db.from('instructors').delete().eq('organization_id', orgId);
  await db.from('vehicles').delete().eq('organization_id', orgId);
  await db.from('organization_locations').delete().eq('organization_id', orgId);
  await db.from('channel_configs').delete().eq('organization_id', orgId);
  await db.from('person_lookup_provider_configs').delete().eq('organization_id', orgId);
  await db.from('vat_periods').delete().eq('organization_id', orgId);
  await db.from('package_offerings').delete().eq('organization_id', orgId);
  await db.from('package_catalog').delete().eq('organization_id', orgId);
  await db.from('lesson_types').delete().eq('organization_id', orgId);
  await db.from('organizations').delete().eq('id', orgId);
}

// ─── Provisioning ───────────────────────────────────────────────────────────

export async function provisionTrialOrganization(db: DbClient, session: TrialProvisioningSession, correlationId: string): Promise<ProvisionResult> {
  const answers = session.interview_answers as CompleteAnswers;
  const firstName = (answers.contact_first_name ?? '').trim() || 'Administratör';
  const lastName  = (answers.contact_last_name ?? '').trim()  || session.driving_school_name;

  const evt = (eventType: TrialEventType, metadata?: Record<string, unknown>) =>
    logTrialEvent(db, { sessionId: session.id, email: session.email, drivingSchoolName: session.driving_school_name, eventType, actorType: 'system', metadata });

  async function failNoRollback(code: string, message: string, status: number): Promise<ProvisionResult> {
    await db.from('tenant_trial_sessions').update({ status: 'provisioning_failed' }).eq('id', session.id);
    await evt('provisioning_failed', { code, message, rolled_back: false });
    logger.error('trial-provisioning.failed', { correlation_id: correlationId, session_id: session.id, code, message, rolled_back: false });
    return { ok: false, code, message, status };
  }
  async function failWithRollback(
    orgId: string, userId: string | null, code: string, message: string, status: number, isNewUser = true,
  ): Promise<ProvisionResult> {
    await rollbackTrialProvisioning(db, session.id, orgId, userId, isNewUser);
    await db.from('tenant_trial_sessions').update({ status: 'provisioning_failed' }).eq('id', session.id);
    await evt('provisioning_failed', { code, message, rolled_back: true, organization_id: orgId });
    logger.error('trial-provisioning.failed', { correlation_id: correlationId, session_id: session.id, code, message, rolled_back: true, organization_id: orgId });
    return { ok: false, code, message, status };
  }

  await evt('provisioning_started');

  // ── Create the organization ───────────────────────────────────────────────
  // Mirrors bootstrap_org_admin.sql Step 1 exactly (same columns, same
  // defaults) — no administrator, membership, or auth user exists yet.
  // visit_address/visit_zip/visit_city use the exact key names
  // gatherKnownBusinessFacts() already reads (Company Settings' own
  // convention) — the existing branch executor in provisioning-engine.ts
  // then creates the first location automatically from these, unmodified.
  const slug = await generateUniqueSlug(db, session.driving_school_name);
  const settings: Record<string, unknown> = { timezone: 'Europe/Stockholm', currency: 'SEK', locale: 'sv-SE', vat_rate: 0.25 };
  if (answers.default_language) settings['locale'] = answers.default_language === 'en' ? 'en-US' : 'sv-SE';
  if (answers.timezone)         settings['timezone'] = answers.timezone;
  if (answers.address_line1 && answers.postal_code && answers.city) {
    settings['visit_address'] = answers.address_line1;
    settings['visit_zip']     = answers.postal_code;
    settings['visit_city']    = answers.city;
  }
  settings['trial_interview_answers'] = answers;

  const { data: org, error: orgErr } = await db.from('organizations').insert({
    slug, name: session.driving_school_name, legal_name: answers.legal_name || session.driving_school_name,
    org_number: answers.org_number || null, vat_number: answers.vat_number || null,
    status: 'active', subscription_tier: 'trial', subscription_status: 'trialing',
    max_locations: 5, max_users: 20,
    trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    settings,
  }).select('id').single();
  if (orgErr || !org) {
    return failNoRollback('INTERNAL_ERROR', 'Kunde inte skapa organisation', 500);
  }
  const orgId = org.id as string;
  await db.from('tenant_trial_sessions').update({ organization_id: orgId }).eq('id', session.id);

  // ── Steps B/B2/C/C2/C2b/C3: canonical business configuration ──────────────
  // Channels, payment/person-lookup pilot defaults, Business Discovery
  // pipeline, pricing, per-category durations, VAT period — the exact same
  // shared function Platform Admin's handleProvision also calls (Tenant
  // Registration Unification, 2026-08-28). Email/SMS/WhatsApp all genuinely
  // enabled via the platform pilot sandbox — see docs history for the live
  // verification each one had before being wired (Resend proven send,
  // 46elks account-info check, Meta phone-number metadata check).
  const configOutcome = await provisionBusinessConfiguration(db, orgId, answers, { correlationId });
  if (!configOutcome.ok) {
    const f = configOutcome.failure!;
    return failWithRollback(orgId, null, f.code, f.message, f.status);
  }
  const pricedLessonTypes = configOutcome.pricedLessonTypes;

  // ── Validation Engine ──────────────────────────────────────────────────────
  // legal_name/driving_school_name is trial-specific (Platform Admin already
  // requires an org name before an org can exist at all), so it stays here
  // rather than in the shared function; the other two gaps are read straight
  // off the shared outcome.
  const validationErrors: string[] = [...configOutcome.validationWarnings];
  if (!answers.legal_name && !session.driving_school_name) validationErrors.push('Organisationens namn saknas.');
  if (validationErrors.length > 0) {
    return failWithRollback(orgId, null, 'VALIDATION_FAILED', validationErrors.join(' '), 422);
  }

  // ── Step D: create the administrator account ──────────────────────────────
  const origin = getAppOrigin();

  // The applicant's email may already belong to an existing platform user
  // (e.g. they already run a different trafikskola, or a prior trial
  // attempt left an auth user behind before any org existed). Supabase
  // Auth enforces one account per email project-wide, so generating an
  // "invite" link for an already-registered email fails outright — this
  // previously surfaced as a generic "Kunde inte skapa administratörskonto"
  // and rolled back the whole run (confirmed live 2026-08-09, blocking a
  // real pilot approval). Reuse the existing account as the new org's
  // owner instead: no invite email needed, they already have credentials
  // and can reach the new org via tenant switching after logging in.
  const { data: existingUserId } = await db.rpc('find_auth_user_by_email', { p_email: session.email });
  const isNewUserAccount = !existingUserId;

  let userId: string;
  // Email #3 below sends whatever action_link ends up in this variable —
  // for a brand-new account that's an "invite" link (set your first
  // password); for a reused existing account it's a "recovery" link
  // instead, since generating a fresh invite for an already-registered
  // email is exactly what fails Step D in the first place. Either way the
  // applicant gets a real, working link to reach their password — leaving
  // this null for the reuse case (as an earlier version of this fix did)
  // silently dropped Email #3 with no way to log in short of remembering
  // an old test account's password.
  //
  // The link is built from properties.hashed_token, NOT properties.
  // action_link. action_link is GoTrue's own hosted `/auth/v1/verify` GET
  // endpoint — visiting that URL (a bare HTTP GET, no JS involved)
  // immediately consumes the single-use token server-side. Email security
  // scanners (Gmail's Safe Browsing prefetch and similar) routinely GET
  // every link in an email before the recipient ever sees it, which
  // silently burns the token — confirmed live 2026-08-09: a freshly-sent
  // recovery email showed "Återställningslänken har gått ut" on the
  // applicant's very first real click. hashed_token instead points at our
  // own app route; loading that page is inert (no token consumption) —
  // consumption only happens when ResetPasswordPage/AcceptInvitePage
  // actually call verifyOtp() from real, executed JS, which a prefetch
  // never triggers. This is exactly the "modern, recommended format"
  // apps/web/src/modules/auth/lib/authCallback.ts already documents and
  // AcceptInvitePage/ResetPasswordPage already prefer — this was the one
  // remaining email-sending call still on the legacy action_link path.
  let actionLink: string | null = null;
  if (existingUserId) {
    userId = existingUserId as string;
    const { data: recoveryData, error: recoveryErr } = await db.auth.admin.generateLink({
      type: 'recovery', email: session.email,
      options: { redirectTo: `${origin}/auth/reset-password` },
    });
    if (recoveryErr) {
      logger.warn('trial-provisioning.recovery_link_failed', { correlation_id: correlationId, error: recoveryErr.message });
    } else if (recoveryData?.properties?.hashed_token) {
      actionLink = `${origin}/auth/reset-password?token_hash=${recoveryData.properties.hashed_token}&type=recovery`;
    }
  } else {
    const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
      type: 'invite', email: session.email,
      options: { data: { first_name: firstName, last_name: lastName }, redirectTo: `${origin}/auth/accept-invite` },
    });
    if (linkErr || !linkData?.user) {
      return failWithRollback(orgId, null, 'INTERNAL_ERROR', 'Kunde inte skapa administratörskonto', 500);
    }
    userId = linkData.user.id as string;
    actionLink = linkData.properties?.hashed_token
      ? `${origin}/auth/accept-invite?token_hash=${linkData.properties.hashed_token}&type=invite`
      : null;
  }

  const { error: profileErr } = await db.from('profiles').upsert(
    { id: userId, first_name: firstName, last_name: lastName, email: session.email, is_active: true, onboarded_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  if (profileErr) {
    return failWithRollback(orgId, userId, 'INTERNAL_ERROR', 'Kunde inte skapa profil', 500, isNewUserAccount);
  }

  const { data: ownerRole } = await db.from('roles').select('id').eq('name', 'org_owner').eq('is_system_role', true).maybeSingle();
  if (!ownerRole) {
    return failWithRollback(orgId, userId, 'INTERNAL_ERROR', 'Platform configuration error: org_owner role not found', 500, isNewUserAccount);
  }

  const { data: membership, error: membershipErr } = await db.from('memberships')
    .insert({ user_id: userId, organization_id: orgId, status: 'active', joined_at: new Date().toISOString() })
    .select('id').single();
  if (membershipErr || !membership) {
    return failWithRollback(orgId, userId, 'INTERNAL_ERROR', 'Kunde inte skapa medlemskap', 500, isNewUserAccount);
  }

  const { error: roleErr } = await db.from('membership_roles').insert({ membership_id: membership.id, role_id: ownerRole.id, is_active: true });
  if (roleErr) {
    return failWithRollback(orgId, userId, 'INTERNAL_ERROR', 'Kunde inte tilldela roll', 500, isNewUserAccount);
  }

  await db.from('tenant_trial_sessions').update({ status: 'active', completed_at: new Date().toISOString(), admin_user_id: userId }).eq('id', session.id);
  await evt('provisioning_completed', { organization_id: orgId, admin_user_id: userId });

  // ── Steps E1-E5: canonical business resources ─────────────────────────────
  // Vehicles, instructors (+ availability), additional staff invites,
  // branches, bookable slots — the same shared function Platform Admin's
  // handleProvision calls once its own administrator account exists.
  const resourcesOutcome = await provisionBusinessResources(db, orgId, answers, {
    userId, correlationId, actorEmail: session.email, appOrigin: origin,
  });
  const {
    vehiclesCreated, instructorsCreated, staffInvited,
    additionalBranchesCreated: branchesCreated, primaryBranchFallbackCreated, slotsGenerated,
  } = resourcesOutcome;

  // Email #3 — real "create your password" email.
  if (actionLink) {
    try {
      const pwEmailResult = await dispatchMessage({
        channel: 'email', provider: 'resend', to: session.email, from: 'Trafikcloud <info@trafikcloud.se>',
        subject: 'Skapa ert lösenord – Trafikcloud', body: passwordCreationEmailHtml(session.driving_school_name, actionLink),
      });
      if (pwEmailResult.status !== 'sent') {
        logger.warn('trial-provisioning.password_email_failed', { correlation_id: correlationId, error: pwEmailResult.error });
      }
    } catch (err) {
      logger.warn('trial-provisioning.password_email_exception', { correlation_id: correlationId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Email #4 — Welcome / Trial Configuration.
  try {
    const configItems = buildWelcomeConfigItems(answers);
    const welcomeResult = await dispatchMessage({
      channel: 'email', provider: 'resend', to: session.email, from: 'Trafikcloud <info@trafikcloud.se>',
      subject: 'Välkommen till Trafikcloud – er provperiodskonfiguration', body: welcomeConfigEmailHtml(session.driving_school_name, configItems),
    });
    if (welcomeResult.status !== 'sent') {
      logger.warn('trial-provisioning.welcome_config_email_failed', { correlation_id: correlationId, error: welcomeResult.error });
    }
  } catch (err) {
    logger.warn('trial-provisioning.welcome_config_email_exception', { correlation_id: correlationId, error: err instanceof Error ? err.message : String(err) });
  }

  logger.info('trial-provisioning.completed', {
    correlation_id: correlationId, organization_id: orgId, user_id: userId,
    lesson_types_created: configOutcome.lessonTypesCreated, package_templates_created: configOutcome.packageTemplatesCreated,
    priced_lesson_types: pricedLessonTypes,
    vehicles_created: vehiclesCreated, instructors_created: instructorsCreated,
    staff_invited: staffInvited, branches_created: branchesCreated, slots_generated: slotsGenerated,
  });

  return {
    ok: true,
    organizationId: orgId, actionLink,
    lessonTypesCreated: configOutcome.lessonTypesCreated,
    packageTemplatesCreated: configOutcome.packageTemplatesCreated,
    branchCreated: configOutcome.branchCreated + primaryBranchFallbackCreated,
    pricedLessonTypes, vehiclesCreated, instructorsCreated, staffInvited,
    additionalBranchesCreated: branchesCreated, slotsGenerated,
  };
}
