/**
 * public-enrollment — Public enrollment submission and coupon validation.
 *
 * No authentication required. Uses service role to bypass RLS.
 *
 * Routes:
 *   GET  /public-enrollment/validate-coupon?org_id=<uuid>&code=<str>&package_id=<uuid>
 *          — validate a coupon code and return computed discount for a package
 *   POST /public-enrollment?org_id=<uuid>
 *          — submit an enrollment request (inserts into enrollment_requests)
 *
 * Security:
 *   - UUID validation on all ID params
 *   - Rate limiting: max 3 submissions per email per org per hour
 *   - Verifies package is still active + website/public visible
 *   - Verifies coupon is valid before accepting submission
 *   - Never exposes internal_notes, metadata, or private fields
 *
 * CORS: Access-Control-Allow-Origin: * (same as public-catalog)
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PUBLIC_CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Max-Age':       '86400',
};
const JSON_CT = { 'Content-Type': 'application/json', ...PUBLIC_CORS };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined ? { code } : {}) }, status);
}

function isValidateCoupon(req: Request): boolean {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'public-enrollment');
  return segments[fnIdx + 1] === 'validate-coupon';
}

// ─── Discount computation (mirrored from public-catalog) ──────────────────────

interface CampaignRow {
  id:                  string;
  name:                string;
  campaign_type:       string;
  discount_value:      number | null;
  discount_is_pct:     boolean | null;
  max_discount_amount: number | null;
  bonus_lessons:       number | null;
  starts_at:           string | null;
  ends_at:             string | null;
}

function computeDiscount(priceExVat: number, vatRate: number, c: CampaignRow): {
  discount_amount:      number | null;
  discounted_price:     number | null;
  discounted_incl_vat:  number | null;
  badge_label:          string | null;
} {
  const { campaign_type, discount_value, discount_is_pct, max_discount_amount } = c;

  if (['bonus_lessons','free_risk1','free_risk2','seasonal'].includes(campaign_type)) {
    return { discount_amount: null, discounted_price: null, discounted_incl_vat: null, badge_label: null };
  }
  if (discount_value == null || discount_value <= 0) {
    return { discount_amount: null, discounted_price: null, discounted_incl_vat: null, badge_label: null };
  }

  const isPct  = campaign_type === 'percentage_discount' ||
                 (campaign_type === 'promotional_pricing' && discount_is_pct === true);
  const isFixed = campaign_type === 'fixed_discount' ||
                  (campaign_type === 'promotional_pricing' && discount_is_pct === false);

  if (isPct) {
    const raw    = priceExVat * (discount_value / 100);
    const capped = max_discount_amount != null ? Math.min(raw, max_discount_amount) : raw;
    const final  = Math.max(0, priceExVat - capped);
    const rounded = Math.round(capped * 100) / 100;
    const pct     = Math.round((rounded / priceExVat) * 100);
    const inclVat = Math.round(final * (1 + vatRate) * 100) / 100;
    return { discount_amount: rounded, discounted_price: Math.round(final * 100) / 100, discounted_incl_vat: inclVat, badge_label: `-${pct}%` };
  }

  if (isFixed) {
    const raw    = Math.min(discount_value, priceExVat);
    const final  = Math.round((priceExVat - raw) * 100) / 100;
    const inclVat = Math.round(final * (1 + vatRate) * 100) / 100;
    return { discount_amount: raw, discounted_price: final, discounted_incl_vat: inclVat, badge_label: `-${raw} kr` };
  }

  return { discount_amount: null, discounted_price: null, discounted_incl_vat: null, badge_label: null };
}

// ─── Coupon validation ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateCoupon(req: Request, client: any, orgId: string): Promise<Response> {
  const url       = new URL(req.url);
  const code      = (url.searchParams.get('code') ?? '').trim().toUpperCase();
  const packageId = url.searchParams.get('package_id') ?? '';

  if (!code)                        return err('Missing coupon code', 400, 'MISSING_CODE');
  if (!UUID_RE.test(packageId))     return err('Invalid package_id', 400, 'INVALID_PACKAGE_ID');
  if (code.length < 3 || code.length > 50) return err('Invalid coupon code format', 400, 'INVALID_CODE');

  // Fetch coupon + campaign in parallel with package fetch
  const [couponRes, pkgRes] = await Promise.all([
    client
      .from('campaign_coupon_codes')
      .select('id, campaign_id, code, max_redemptions, redemptions_count, valid_from, valid_to, is_active, campaigns(id, name, campaign_type, discount_value, discount_is_pct, max_discount_amount, bonus_lessons, starts_at, ends_at, status, visibility, organization_id)')
      .eq('organization_id', orgId)
      .ilike('code', code)
      .maybeSingle(),
    client
      .from('package_offerings')
      .select('id, price, vat_rate, currency, status, visibility, organization_id')
      .eq('id', packageId)
      .eq('organization_id', orgId)
      .maybeSingle(),
  ]);

  if (couponRes.error) return err('Coupon lookup failed', 500, 'INTERNAL_ERROR');
  if (pkgRes.error)    return err('Package lookup failed', 500, 'INTERNAL_ERROR');

  if (!couponRes.data) return json({ is_valid: false, error: 'Kupongkoden hittades inte.', code: 'COUPON_NOT_FOUND' });
  if (!pkgRes.data)    return json({ is_valid: false, error: 'Paketet hittades inte.',    code: 'PACKAGE_NOT_FOUND' });

  const coupon   = couponRes.data;
  const pkg      = pkgRes.data;

  if (pkg.status !== 'active' || !(['website','public'].includes(pkg.visibility as string))) {
    return json({ is_valid: false, error: 'Paketet är inte tillgängligt.', code: 'PACKAGE_UNAVAILABLE' });
  }

  if (!coupon.is_active) {
    return json({ is_valid: false, error: 'Kupongkoden är inte aktiv.', code: 'COUPON_INACTIVE' });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (coupon.valid_from && coupon.valid_from > today) {
    return json({ is_valid: false, error: 'Kupongkoden är inte giltig ännu.', code: 'COUPON_NOT_YET_VALID' });
  }
  if (coupon.valid_to && coupon.valid_to < today) {
    return json({ is_valid: false, error: 'Kupongkoden har gått ut.', code: 'COUPON_EXPIRED' });
  }
  if (coupon.max_redemptions != null && coupon.redemptions_count >= coupon.max_redemptions) {
    return json({ is_valid: false, error: 'Kupongkoden har nått maxantalet inlösen.', code: 'COUPON_LIMIT_REACHED' });
  }

  // Verify campaign is valid
  const campaign = coupon.campaigns as CampaignRow & { status: string; visibility: string; organization_id: string } | null;
  if (!campaign) return json({ is_valid: false, error: 'Kupongkoden är inte kopplad till en kampanj.', code: 'NO_CAMPAIGN' });
  if (campaign.organization_id !== orgId) return json({ is_valid: false, error: 'Kupongkoden hittades inte.', code: 'COUPON_NOT_FOUND' });
  if (campaign.status !== 'active') return json({ is_valid: false, error: 'Kampanjen är inte längre aktiv.', code: 'CAMPAIGN_INACTIVE' });
  if (!(['website','public'].includes(campaign.visibility))) return json({ is_valid: false, error: 'Kampanjen är inte offentlig.', code: 'CAMPAIGN_NOT_PUBLIC' });

  // Verify campaign is linked to this package
  const { data: link } = await client
    .from('campaign_package_links')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('offering_id', packageId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!link) {
    return json({ is_valid: false, error: 'Kupongkoden gäller inte för detta paket.', code: 'COUPON_WRONG_PACKAGE' });
  }

  // Compute discount for this package
  const dr = computeDiscount(pkg.price as number, pkg.vat_rate as number, campaign);

  return json({
    is_valid:            true,
    coupon_id:           coupon.id,
    coupon_code:         coupon.code,
    campaign_id:         campaign.id,
    campaign_name:       campaign.name,
    campaign_type:       campaign.campaign_type,
    discount_amount:     dr.discount_amount,
    discounted_price:    dr.discounted_price,
    discounted_incl_vat: dr.discounted_incl_vat,
    badge_label:         dr.badge_label,
    ends_at:             campaign.ends_at,
  });
}

// ─── Enrollment submission ────────────────────────────────────────────────────

function trimStr(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }
function optStr(v: unknown): string | null { const s = trimStr(v); return s || null; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubmit(req: Request, client: any, orgId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', 400, 'INVALID_JSON');
  }

  // ── Required fields ─────────────────────────────────────────────────────
  const packageId   = trimStr(body['package_offering_id']);
  const firstName   = trimStr(body['first_name']);
  const lastName    = trimStr(body['last_name']);
  const email       = trimStr(body['email']).toLowerCase();
  const phone       = trimStr(body['phone']);

  if (!UUID_RE.test(packageId)) return err('Missing or invalid package_offering_id', 400, 'INVALID_PACKAGE');
  if (!firstName)               return err('Förnamn krävs', 400, 'MISSING_FIRST_NAME');
  if (!lastName)                return err('Efternamn krävs', 400, 'MISSING_LAST_NAME');
  if (!email || !EMAIL_RE.test(email)) return err('Ogiltig e-postadress', 400, 'INVALID_EMAIL');
  if (!phone || phone.length < 7)      return err('Ogiltigt telefonnummer', 400, 'INVALID_PHONE');

  // ── Optional fields ─────────────────────────────────────────────────────
  const personnummer    = optStr(body['personnummer']);
  const address         = optStr(body['address']);
  const preferredLang   = trimStr(body['preferred_language']) || 'sv';
  const licenseCategory = trimStr(body['license_category'])   || 'B';
  const comments        = optStr(body['comments']);

  // ── Campaign / coupon (optional) ─────────────────────────────────────────
  const campaignId = typeof body['campaign_id'] === 'string' && UUID_RE.test(body['campaign_id'])
    ? body['campaign_id'] : null;
  const couponId   = typeof body['coupon_id']   === 'string' && UUID_RE.test(body['coupon_id'])
    ? body['coupon_id']   : null;
  const couponCode = optStr(body['coupon_code']);

  // ── Validate language ────────────────────────────────────────────────────
  const VALID_LANGS = ['sv','en','ar','de','fr','so','ku','fa'];
  if (!VALID_LANGS.includes(preferredLang)) return err('Ogiltigt språkval', 400, 'INVALID_LANGUAGE');

  const VALID_CATS = ['B','A','A1','A2','AM','BE','C','C1','CE','D','D1'];
  if (!VALID_CATS.includes(licenseCategory)) return err('Ogiltig körkortskategori', 400, 'INVALID_LICENSE_CATEGORY');

  // ── Rate limiting: max 3 submissions per email per org per hour ───────────
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: recentCount } = await client
    .from('enrollment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .ilike('email', email)
    .gte('submitted_at', oneHourAgo);

  if ((recentCount ?? 0) >= 3) {
    return err('För många anmälningar. Vänta en stund och försök igen.', 429, 'RATE_LIMITED');
  }

  // ── Load and verify package ──────────────────────────────────────────────
  const { data: pkg, error: pkgErr } = await client
    .from('package_offerings')
    .select('id, name, package_code, lesson_category, quantity, price, vat_rate, currency, status, visibility, organization_id')
    .eq('id', packageId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (pkgErr || !pkg)   return err('Paketet hittades inte', 404, 'PACKAGE_NOT_FOUND');
  if (pkg.status !== 'active') return err('Paketet är inte tillgängligt', 422, 'PACKAGE_UNAVAILABLE');
  if (!(['website','public'].includes(pkg.visibility as string))) return err('Paketet är inte tillgängligt', 422, 'PACKAGE_UNAVAILABLE');

  const priceExVat    = pkg.price      as number;
  const vatRate       = pkg.vat_rate   as number;
  const priceInclVat  = Math.round(priceExVat * (1 + vatRate) * 100) / 100;

  // ── Validate campaign if provided ────────────────────────────────────────
  let campaignDiscount  = 0;
  let resolvedCampaignId:   string | null = campaignId;
  let resolvedCampaignName: string | null = null;

  if (campaignId) {
    const { data: camp } = await client
      .from('campaigns')
      .select('id, name, campaign_type, discount_value, discount_is_pct, max_discount_amount, bonus_lessons, starts_at, ends_at, status, visibility, organization_id')
      .eq('id', campaignId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!camp || camp.status !== 'active' || !['website','public'].includes(camp.visibility as string)) {
      // Campaign no longer valid — ignore silently (don't error, just apply no discount)
      resolvedCampaignId = null;
    } else {
      const dr = computeDiscount(priceExVat, vatRate, camp as CampaignRow);
      campaignDiscount      = dr.discount_amount ?? 0;
      resolvedCampaignName  = camp.name as string;
    }
  }

  // ── Validate coupon if provided ──────────────────────────────────────────
  let couponDiscount       = 0;
  let resolvedCouponId:   string | null = couponId;
  let resolvedCouponCode: string | null = couponCode;

  if (couponId && couponCode) {
    const { data: coupon } = await client
      .from('campaign_coupon_codes')
      .select('id, code, campaign_id, max_redemptions, redemptions_count, valid_from, valid_to, is_active, campaigns(id, name, campaign_type, discount_value, discount_is_pct, max_discount_amount, bonus_lessons, starts_at, ends_at, status, visibility, organization_id)')
      .eq('id', couponId)
      .eq('organization_id', orgId)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    const isValidCoupon = coupon &&
      coupon.is_active &&
      (!coupon.valid_from || coupon.valid_from <= today) &&
      (!coupon.valid_to   || coupon.valid_to   >= today) &&
      (coupon.max_redemptions == null || coupon.redemptions_count < coupon.max_redemptions);

    if (!isValidCoupon) {
      resolvedCouponId   = null;
      resolvedCouponCode = null;
    } else {
      // Verify campaign is linked to this package
      const { data: link } = await client
        .from('campaign_package_links')
        .select('id')
        .eq('campaign_id', coupon.campaign_id as string)
        .eq('offering_id', packageId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!link) {
        resolvedCouponId   = null;
        resolvedCouponCode = null;
      } else {
        const camp = coupon.campaigns as CampaignRow & { status: string } | null;
        if (camp && camp.status === 'active') {
          const dr     = computeDiscount(priceExVat, vatRate, camp);
          couponDiscount = dr.discount_amount ?? 0;
          // If no campaign was set yet, set it from the coupon's campaign
          if (!resolvedCampaignId) {
            resolvedCampaignId   = camp.id;
            resolvedCampaignName = camp.name;
          }
        }
      }
    }
  }

  // ── Price snapshot ───────────────────────────────────────────────────────
  const totalDiscountExVat  = campaignDiscount + couponDiscount;
  const finalPriceExVat     = Math.max(0, Math.round((priceExVat - totalDiscountExVat) * 100) / 100);
  const finalPriceInclVat   = Math.round(finalPriceExVat * (1 + vatRate) * 100) / 100;

  // ── Insert enrollment_request ────────────────────────────────────────────
  const { data: enrollment, error: insertErr } = await client
    .from('enrollment_requests')
    .insert({
      organization_id:      orgId,
      status:               'submitted',
      package_offering_id:  packageId,
      package_name:         pkg.name as string,
      ...(pkg.package_code != null ? { package_code: pkg.package_code } : {}),
      lesson_category:      pkg.lesson_category  as string,
      package_quantity:     pkg.quantity         as number,
      ...(resolvedCampaignId   != null ? { campaign_id:   resolvedCampaignId }   : {}),
      ...(resolvedCampaignName != null ? { campaign_name: resolvedCampaignName } : {}),
      ...(resolvedCouponId   != null ? { coupon_id:   resolvedCouponId }   : {}),
      ...(resolvedCouponCode != null ? { coupon_code: resolvedCouponCode } : {}),
      base_price:           priceExVat,
      vat_rate:             vatRate,
      base_price_incl_vat:  priceInclVat,
      campaign_discount:    campaignDiscount,
      coupon_discount:      couponDiscount,
      final_price:          finalPriceExVat,
      final_price_incl_vat: finalPriceInclVat,
      currency:             pkg.currency as string,
      first_name:           firstName,
      last_name:            lastName,
      email:                email,
      phone:                phone,
      ...(personnummer    != null ? { personnummer }    : {}),
      ...(address         != null ? { address }         : {}),
      preferred_language:   preferredLang,
      license_category:     licenseCategory,
      ...(comments        != null ? { comments }        : {}),
      submitter_ip:         req.headers.get('X-Forwarded-For') ?? req.headers.get('CF-Connecting-IP'),
    })
    .select('id, submitted_at')
    .single();

  if (insertErr || !enrollment) {
    console.error('enrollment insert error', insertErr);
    return err('Anmälan kunde inte sparas', 500, 'INSERT_FAILED');
  }

  // ── Increment coupon redemption count (non-critical; enrollment already committed) ──
  if (resolvedCouponId) {
    await client.rpc('increment_coupon_redemptions', { p_coupon_id: resolvedCouponId })
      .then(undefined, () => {
        console.warn('Could not increment coupon redemption count for', resolvedCouponId);
      });
  }

  // ── Emit submitted event for the audit timeline (non-critical) ────────────
  await client.rpc('emit_enrollment_event', {
    p_organization_id: orgId,
    p_enrollment_id:   enrollment.id,
    p_event_type:      'submitted',
    p_metadata:        { source: 'public_catalog' },
  }).then(undefined, () => {
    console.warn('Could not emit submitted enrollment event for', enrollment.id);
  });

  return json({
    enrollment_id:       enrollment.id,
    submitted_at:        enrollment.submitted_at,
    package_name:        pkg.name,
    final_price_incl_vat: finalPriceInclVat,
    currency:            pkg.currency,
    organization_id:     orgId,
  }, 201);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: PUBLIC_CORS });
  }

  const correlationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
  const rateLimitGuard = enforceIpRateLimit(req, 'ip_public', correlationId);
  if (rateLimitGuard) return rateLimitGuard;

  const url    = new URL(req.url);
  const orgId  = url.searchParams.get('org_id') ?? '';

  if (!UUID_RE.test(orgId)) {
    return err('Missing or invalid org_id', 400, 'INVALID_ORG_ID');
  }

  const client = createServiceClient();

  try {
    if (req.method === 'GET' && isValidateCoupon(req)) {
      return await handleValidateCoupon(req, client, orgId);
    }
    if (req.method === 'POST') {
      return await handleSubmit(req, client, orgId);
    }
    return err('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  } catch (e) {
    console.error('public-enrollment error', e);
    return err('Internt serverfel', 500, 'INTERNAL_ERROR');
  }
});
