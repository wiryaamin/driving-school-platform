/**
 * e2e-bootstrap — Idempotent provisioning of a fully populated, isolated
 * E2E regression-testing tenant + admin user.
 *
 * Exists so automated regression testing (this session's or a future one's)
 * never needs a human's browser session, password, or JWT: this function
 * creates one known-credential admin account in its own isolated
 * organization (never Trafikskolan AB or any real tenant), gated by a
 * bearer secret that only infrastructure automation holds — never typed
 * into a browser, never requested from a person.
 *
 * Once the admin account exists, standard Supabase password-grant login
 * (POST /auth/v1/token?grant_type=password) mints a fresh, real session
 * whenever needed — no browser, no stored long-lived token, no repeated
 * bootstrap calls.
 *
 * Beyond the org+admin, this also seeds a realistic fixture set so every
 * major workflow has something real to exercise without manual setup:
 * a branch, instructors, vehicles, lesson types, lesson packages (internal
 * + public/website), students, a guardian, a corporate customer, a
 * discount + coupon, calendar availability, bookable slots, an issued
 * invoice, and a payment against it. Every step is a direct table write
 * using the same field shapes already validated against the platform's
 * real Edge Functions this session — not a duplicate of business logic,
 * just its data shape, so a from-scratch DB doesn't need any other
 * function online first.
 *
 * Idempotent: every step looks up by a stable key (code, registration
 * number, email, slug) before inserting, so re-running this is always
 * safe and never creates duplicates.
 *
 * Invocation:
 *   POST /functions/v1/e2e-bootstrap
 *   Authorization: Bearer <E2E_BOOTSTRAP_SECRET>
 *   { "admin_password": "..." }
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';

const BOOTSTRAP_SECRET = Deno.env.get('E2E_BOOTSTRAP_SECRET');

const TEST_ORG_SLUG    = 'e2e-regression-test';
const TEST_ORG_NAME    = 'E2E Regression Test Org (DO NOT USE FOR REAL DATA)';
const TEST_ADMIN_EMAIL = 'e2e-admin@e2e-test.internal';
// Separate from TEST_ADMIN_EMAIL deliberately — that user must stay a plain
// org_owner so org-scoped E2E tests keep exercising normal tenant RLS/JWT
// claims. Platform admins bypass org membership entirely in
// get_user_jwt_claims(), so testing platform-admin-only routes (e.g.
// platform-admin/announcements) needs its own, separate identity.
const TEST_PLATFORM_ADMIN_EMAIL = 'e2e-platform-admin@e2e-test.internal';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function futureDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
type Db = any;

// ─── Fixture helpers (each idempotent: look up by stable key, else insert) ──

// maybeSingle() throws PGRST116 when the query matches >1 row — silently
// swallowed by destructuring only `data`, which is `null` in that case, so
// every idempotency check below deliberately caps the match to one row with
// `.limit(1)` before `.maybeSingle()`, rather than trusting maybeSingle()
// alone to enforce that. This was found the hard way: an early version
// without `.limit(1)` treated a >1-match error as "not found" and inserted
// a fresh duplicate on every single call (see student_guardians cleanup).
// `.order('created_at')` makes the pick deterministic if duplicates already
// exist from a previous buggy run.

async function ensureBranch(db: Db, orgId: string, actorId: string): Promise<string> {
  const { data: existing } = await db
    .from('organization_locations')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', 'Huvudkontoret')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('organization_locations')
    .insert({
      organization_id: orgId,
      name: 'Huvudkontoret',
      address_line1: 'Testgatan 1',
      postal_code: '111 22',
      city: 'Stockholm',
      country: 'SE',
      is_primary: true,
      status: 'active',
      created_by: actorId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`branch: ${error.message}`);
  return data.id as string;
}

async function ensureInstructor(
  db: Db, orgId: string, actorId: string,
  email: string, firstName: string, lastName: string, categories: string[],
): Promise<string> {
  const { data: existing } = await db
    .from('instructors').select('id')
    .eq('organization_id', orgId).eq('email', email)
    .is('deleted_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('instructors')
    .insert({
      organization_id: orgId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: '+46701110000',
      employment_type: 'employed',
      teaching_categories: categories,
      languages_spoken: ['sv'],
      created_by: actorId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`instructor ${email}: ${error.message}`);
  return data.id as string;
}

async function ensureVehicle(
  db: Db, orgId: string, actorId: string,
  regNumber: string, make: string, model: string, year: number,
): Promise<string> {
  const { data: existing } = await db
    .from('vehicles').select('id')
    .eq('organization_id', orgId).eq('registration_number', regNumber)
    .is('deleted_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('vehicles')
    .insert({
      organization_id: orgId,
      registration_number: regNumber,
      make, model, model_year: year,
      transmission: 'manual',
      teaching_categories: ['B'],
      registration_expires_at: futureDate(365),
      insurance_expires_at: futureDate(365),
      created_by: actorId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`vehicle ${regNumber}: ${error.message}`);
  return data.id as string;
}

async function ensureLessonType(
  db: Db, orgId: string, code: string, name: string, category: string, price: number,
): Promise<string> {
  const { data: existing } = await db
    .from('lesson_types').select('id')
    .eq('organization_id', orgId).eq('code', code)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('lesson_types')
    .insert({ organization_id: orgId, name, code, category, pricing_sek: price })
    .select('id')
    .single();
  if (error) throw new Error(`lesson_type ${code}: ${error.message}`);
  return data.id as string;
}

async function ensurePackageOffering(
  db: Db, orgId: string, actorId: string,
  name: string, category: string, quantity: number, price: number, visibility: 'internal' | 'website',
): Promise<string> {
  const { data: existing } = await db
    .from('package_offerings').select('id')
    .eq('organization_id', orgId).eq('name', name)
    .is('archived_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('package_offerings')
    .insert({
      organization_id: orgId, name, lesson_category: category,
      quantity, price, currency: 'SEK', vat_rate: 0.25,
      visibility, featured: visibility === 'website', created_by: actorId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`package ${name}: ${error.message}`);
  return data.id as string;
}

async function ensureStudent(
  db: Db, orgId: string, actorId: string,
  email: string, firstName: string, lastName: string, status: string,
): Promise<string> {
  const { data: existing } = await db
    .from('students').select('id')
    .eq('organization_id', orgId).eq('email', email)
    .is('deleted_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('students')
    .insert({
      organization_id: orgId, first_name: firstName, last_name: lastName, email,
      phone: '+46701110001', preferred_language: 'sv', data_processing_consent: true,
      status, created_by: actorId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`student ${email}: ${error.message}`);
  return data.id as string;
}

async function ensureGuardian(
  db: Db, orgId: string, actorId: string, studentId: string, email: string,
): Promise<string> {
  const { data: existing } = await db
    .from('student_guardians').select('id')
    .eq('organization_id', orgId).eq('email', email)
    .is('deleted_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('student_guardians')
    .insert({
      organization_id: orgId, student_id: studentId,
      first_name: 'E2E', last_name: 'Guardian', email,
      phone: '+46701110002', relation: 'Foralder', can_pay: true, created_by: actorId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`guardian ${email}: ${error.message}`);
  return data.id as string;
}

async function ensureCorporateCustomer(db: Db, orgId: string, companyName: string): Promise<string> {
  const { data: existing } = await db
    .from('corporate_customers').select('id')
    .eq('organization_id', orgId).eq('company_name', companyName)
    .is('deleted_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('corporate_customers')
    .insert({
      organization_id: orgId, company_name: companyName, org_number: '556000-0000',
      contact_first_name: 'E2E', contact_last_name: 'Contact', contact_email: 'e2e-corporate@e2e-test.internal',
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw new Error(`corporate customer: ${error.message}`);
  return data.id as string;
}

async function ensureDiscountAndCoupon(db: Db, orgId: string): Promise<{ discountId: string; couponId: string }> {
  const { data: existingDiscount } = await db
    .from('discount_definitions').select('id')
    .eq('organization_id', orgId).eq('name', 'E2E 10% Discount')
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  let discountId: string;
  if (existingDiscount) {
    discountId = existingDiscount.id as string;
  } else {
    const { data, error } = await db
      .from('discount_definitions')
      .insert({
        organization_id: orgId, name: 'E2E 10% Discount', discount_type: 'percentage',
        discount_scope: 'all', discount_value: 0.10, requires_coupon: true,
      })
      .select('id')
      .single();
    if (error) throw new Error(`discount: ${error.message}`);
    discountId = data.id as string;
  }

  const { data: existingCoupon } = await db
    .from('coupon_codes').select('id')
    .eq('organization_id', orgId).eq('code', 'E2ETEST10')
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  let couponId: string;
  if (existingCoupon) {
    couponId = existingCoupon.id as string;
  } else {
    const { data, error } = await db
      .from('coupon_codes')
      .insert({ organization_id: orgId, discount_id: discountId, code: 'E2ETEST10', is_active: true })
      .select('id')
      .single();
    if (error) throw new Error(`coupon: ${error.message}`);
    couponId = data.id as string;
  }

  return { discountId, couponId };
}

async function ensureAvailability(db: Db, orgId: string, instructorId: string): Promise<void> {
  for (const day of [1, 2, 3, 4, 5]) { // Mon-Fri
    const { data: existing } = await db
      .from('instructor_availability_rules').select('id')
      .eq('organization_id', orgId).eq('instructor_id', instructorId).eq('day_of_week', day)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (existing) continue;

    const { error } = await db
      .from('instructor_availability_rules')
      .insert({
        organization_id: orgId, instructor_id: instructorId, day_of_week: day,
        start_time: '08:00', end_time: '17:00', timezone: 'Europe/Stockholm',
      });
    if (error) throw new Error(`availability day ${day}: ${error.message}`);
  }
}

async function ensureSlots(
  db: Db, orgId: string, actorId: string, instructorId: string, lessonTypeId: string,
): Promise<string[]> {
  const slotIds: string[] = [];
  for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
    const startsAt = new Date(Date.now() + dayOffset * 86_400_000);
    startsAt.setUTCHours(9, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

    const { data: existing } = await db
      .from('lesson_slots').select('id')
      .eq('organization_id', orgId).eq('instructor_id', instructorId)
      .eq('starts_at', startsAt.toISOString())
      .is('deleted_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (existing) { slotIds.push(existing.id as string); continue; }

    const { data, error } = await db
      .from('lesson_slots')
      .insert({
        organization_id: orgId, instructor_id: instructorId, lesson_type_id: lessonTypeId,
        starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
        timezone: 'Europe/Stockholm', status: 'open', max_bookings: 1,
        generation_source: 'manual', created_by: actorId,
      })
      .select('id')
      .single();
    if (error) throw new Error(`slot day+${dayOffset}: ${error.message}`);
    slotIds.push(data.id as string);
  }
  return slotIds;
}

async function ensureInvoiceAndPayment(
  db: Db, orgId: string, actorId: string, studentId: string, packageName: string, unitPrice: number,
): Promise<{ invoiceId: string; invoiceNumber: string | null }> {
  const description = `E2E fixture invoice — ${packageName}`;
  const { data: existingLine } = await db
    .from('invoice_line_items').select('invoice_id')
    .eq('organization_id', orgId).eq('description', description)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  if (existingLine) {
    const { data: inv } = await db
      .from('invoices').select('id, invoice_number')
      .eq('id', existingLine.invoice_id).single();
    return { invoiceId: inv.id as string, invoiceNumber: inv.invoice_number as string | null };
  }

  const { data: draftInvoice, error: invErr } = await db
    .from('invoices')
    .insert({ organization_id: orgId, student_id: studentId, status: 'draft', currency: 'SEK', created_by: actorId })
    .select('id')
    .single();
  if (invErr) throw new Error(`invoice draft: ${invErr.message}`);
  const invoiceId = draftInvoice.id as string;

  const vatAmount = Math.round(unitPrice * 0.25 * 100) / 100;
  const lineTotal = unitPrice + vatAmount;
  const { error: lineErr } = await db
    .from('invoice_line_items')
    .insert({
      organization_id: orgId, invoice_id: invoiceId, line_type: 'package',
      description, quantity: 1, unit_price: unitPrice, vat_rate: 0.25,
      vat_amount: vatAmount, line_total: lineTotal,
    });
  if (lineErr) throw new Error(`invoice line: ${lineErr.message}`);

  const { data: invoiceNumber, error: issueErr } = await db.rpc('issue_invoice', {
    p_invoice_id: invoiceId, p_actor_id: actorId,
  });
  if (issueErr) throw new Error(`issue_invoice: ${issueErr.message}`);

  // Partial payment — leaves the invoice partially_paid, useful for both
  // payment-flow and outstanding/aging report testing.
  const { error: payErr } = await db.rpc('record_payment', {
    p_invoice_id: invoiceId, p_amount: Math.round(lineTotal / 2 * 100) / 100,
    p_method: 'manual', p_actor_id: actorId,
  });
  if (payErr) throw new Error(`record_payment: ${payErr.message}`);

  return { invoiceId, invoiceNumber: invoiceNumber as string | null };
}

async function ensurePlatformAdminUser(db: Db, adminPassword: string): Promise<string> {
  const { data: userList, error: listErr } = await db.auth.admin.listUsers();
  if (listErr) throw new Error(`platform admin list users: ${listErr.message}`);
  const existingUser = userList.users.find((u: { email?: string }) => u.email === TEST_PLATFORM_ADMIN_EMAIL);

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    await db.auth.admin.updateUserById(userId, { password: adminPassword });
  } else {
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email: TEST_PLATFORM_ADMIN_EMAIL,
      password: adminPassword,
      email_confirm: true,
    });
    if (authErr || !authData.user) throw new Error(`platform admin create user: ${authErr?.message}`);
    userId = authData.user.id;
  }

  await db.from('profiles').upsert({
    id: userId,
    first_name: 'E2E',
    last_name: 'PlatformAdmin',
    email: TEST_PLATFORM_ADMIN_EMAIL,
    is_active: true,
    onboarded_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  const { error: paErr } = await db
    .from('platform_admins')
    .upsert({ user_id: userId, role: 'platform_support', is_active: true }, { onConflict: 'user_id' });
  if (paErr) throw new Error(`platform admin upsert: ${paErr.message}`);

  return userId;
}

// ─── Entry point ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!BOOTSTRAP_SECRET) {
    return json({ error: 'e2e-bootstrap not configured — E2E_BOOTSTRAP_SECRET missing' }, 503);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== BOOTSTRAP_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { admin_password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const adminPassword = body.admin_password;
  if (!adminPassword || adminPassword.length < 12) {
    return json({ error: 'admin_password is required (min 12 chars)' }, 422);
  }

  const db = createServiceClient();

  // ── Organization: idempotent lookup-or-create ────────────────────────────
  let orgId: string;
  const { data: existingOrg } = await db
    .from('organizations')
    .select('id')
    .eq('slug', TEST_ORG_SLUG)
    .limit(1)
    .maybeSingle();

  if (existingOrg) {
    orgId = existingOrg.id as string;
  } else {
    const { data: org, error: orgErr } = await db
      .from('organizations')
      .insert({
        slug: TEST_ORG_SLUG,
        name: TEST_ORG_NAME,
        legal_name: TEST_ORG_NAME,
        status: 'active',
        subscription_tier: 'professional',
        subscription_status: 'active',
        settings: {
          timezone: 'Europe/Stockholm', currency: 'SEK', locale: 'sv-SE', vat_rate: 0.25,
          swish_number: '1231111111', public_catalog_enabled: true, public_booking_enabled: true,
        },
      })
      .select('id')
      .single();

    if (orgErr || !org) {
      logger.error('e2e-bootstrap.org_create_failed', { error: orgErr?.message });
      return json({ error: 'Failed to create test organization', detail: orgErr?.message }, 500);
    }
    orgId = org.id as string;
  }

  // ── Admin auth user: idempotent lookup-or-create ─────────────────────────
  let userId: string;
  const { data: userList, error: listErr } = await db.auth.admin.listUsers();
  if (listErr) {
    logger.error('e2e-bootstrap.list_users_failed', { error: listErr.message });
    return json({ error: 'Failed to list users', detail: listErr.message }, 500);
  }
  const existingUser = userList.users.find((u: { email?: string }) => u.email === TEST_ADMIN_EMAIL);

  if (existingUser) {
    userId = existingUser.id;
    await db.auth.admin.updateUserById(userId, { password: adminPassword });
  } else {
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email: TEST_ADMIN_EMAIL,
      password: adminPassword,
      email_confirm: true,
    });
    if (authErr || !authData.user) {
      logger.error('e2e-bootstrap.create_user_failed', { error: authErr?.message });
      return json({ error: 'Failed to create test admin user', detail: authErr?.message }, 500);
    }
    userId = authData.user.id;
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  await db.from('profiles').upsert({
    id: userId,
    first_name: 'E2E',
    last_name: 'Regression',
    email: TEST_ADMIN_EMAIL,
    is_active: true,
    onboarded_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  // ── Membership + org_owner role: idempotent ──────────────────────────────
  const { data: existingMembership } = await db
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle();

  let membershipId: string;
  if (existingMembership) {
    membershipId = existingMembership.id as string;
  } else {
    const { data: membership, error: membershipErr } = await db
      .from('memberships')
      .insert({ user_id: userId, organization_id: orgId, status: 'active', joined_at: new Date().toISOString() })
      .select('id')
      .single();

    if (membershipErr || !membership) {
      logger.error('e2e-bootstrap.membership_failed', { error: membershipErr?.message });
      return json({ error: 'Failed to create membership', detail: membershipErr?.message }, 500);
    }
    membershipId = membership.id as string;
  }

  const { data: ownerRole } = await db.from('roles').select('id').eq('name', 'org_owner').eq('is_system_role', true).single();
  if (ownerRole) {
    const { data: existingAssignment } = await db
      .from('membership_roles')
      .select('membership_id')
      .eq('membership_id', membershipId)
      .eq('role_id', ownerRole.id)
      .limit(1)
      .maybeSingle();

    if (!existingAssignment) {
      await db.from('membership_roles').insert({ membership_id: membershipId, role_id: ownerRole.id, is_active: true });
    }
  }

  // ── Fixture data — each step idempotent, failures reported per-step ──────
  const fixtures: Record<string, unknown> = {};
  const fixtureErrors: Record<string, string> = {};

  async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      const result = await fn();
      fixtures[name] = result;
      return result;
    } catch (e) {
      fixtureErrors[name] = e instanceof Error ? e.message : String(e);
      logger.error(`e2e-bootstrap.fixture_failed.${name}`, { error: fixtureErrors[name] });
      return null;
    }
  }

  await step('branch_id', () => ensureBranch(db, orgId, userId));

  const instructorId = await step('instructor_id', () =>
    ensureInstructor(db, orgId, userId, 'e2e-instructor@e2e-test.internal', 'E2E', 'Instructor', ['B']));

  await step('vehicle_id', () => ensureVehicle(db, orgId, userId, 'E2E001', 'Volvo', 'V60', 2022));

  const drivingLessonTypeId = await step('lesson_type_driving_id', () =>
    ensureLessonType(db, orgId, 'e2e_driving_b', 'E2E Korlektion B', 'driving', 695));
  await step('lesson_type_theory_id', () =>
    ensureLessonType(db, orgId, 'e2e_theory', 'E2E Teorilektion', 'theory', 350));

  await step('package_internal_id', () =>
    ensurePackageOffering(db, orgId, userId, 'E2E Grundpaket B', 'driving', 10, 6950, 'internal'));
  const publicPackageName = 'E2E Startpaket B';
  await step('package_public_id', () =>
    ensurePackageOffering(db, orgId, userId, publicPackageName, 'driving', 10, 6950, 'website'));

  const studentId = await step('student_id', () =>
    ensureStudent(db, orgId, userId, 'e2e-student@e2e-test.internal', 'E2E', 'Student', 'active'));

  if (studentId) {
    await step('guardian_id', () => ensureGuardian(db, orgId, userId, studentId, 'e2e-guardian@e2e-test.internal'));
  }

  await step('corporate_customer_id', () => ensureCorporateCustomer(db, orgId, 'E2E Foretag AB'));

  await step('discount_coupon', () => ensureDiscountAndCoupon(db, orgId));

  if (instructorId) {
    await step('availability', () => ensureAvailability(db, orgId, instructorId));
    if (drivingLessonTypeId) {
      await step('slot_ids', () => ensureSlots(db, orgId, userId, instructorId, drivingLessonTypeId));
    }
  }

  if (studentId) {
    await step('invoice', () => ensureInvoiceAndPayment(db, orgId, userId, studentId, 'E2E Grundpaket B', 6950));
  }

  let platformAdminUserId: string | null = null;
  try {
    platformAdminUserId = await ensurePlatformAdminUser(db, adminPassword);
  } catch (e) {
    fixtureErrors['platform_admin_user'] = e instanceof Error ? e.message : String(e);
    logger.error('e2e-bootstrap.fixture_failed.platform_admin_user', { error: fixtureErrors['platform_admin_user'] });
  }

  logger.info('e2e-bootstrap.ready', { org_id: orgId, user_id: userId, fixture_errors: Object.keys(fixtureErrors).length });

  return json({
    data: {
      org_id: orgId,
      org_slug: TEST_ORG_SLUG,
      admin_email: TEST_ADMIN_EMAIL,
      admin_user_id: userId,
      platform_admin_email: TEST_PLATFORM_ADMIN_EMAIL,
      platform_admin_user_id: platformAdminUserId,
      fixtures,
      fixture_errors: Object.keys(fixtureErrors).length > 0 ? fixtureErrors : undefined,
    },
  });
});
