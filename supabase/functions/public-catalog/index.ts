/**
 * public-catalog — Public read-only package & campaign catalog.
 *
 * No authentication required. Returns only:
 *   - Active packages with website or public visibility
 *   - Active campaigns with website or public visibility (linked to those packages)
 *
 * Routes:
 *   GET /public-catalog?org_id=<uuid>            — list packages + active campaigns
 *   GET /public-catalog/<pkg_id>?org_id=<uuid>   — single package detail
 *
 * Optional query params (list only):
 *   category  string  — filter by lesson_category
 *   featured  boolean — only featured packages
 *
 * CORS: Access-Control-Allow-Origin: * (public API for embedding on any website)
 */

import { createServiceClient } from '../_shared/supabase.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Max-Age':       '86400',
};

const JSON_CT = { 'Content-Type': 'application/json', ...PUBLIC_CORS };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined && { code }) }, status);
}

function extractPackageId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'public-catalog');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return null;
  const first = after[0] ?? '';
  return UUID_RE.test(first) ? first : null;
}

// ─── Discount computation ─────────────────────────────────────────────────────

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
  priority:            number;
  status:              string;
  visibility:          string;
}

interface DiscountResult {
  discount_amount:   number | null;
  discounted_price:  number | null;
  badge_label:       string | null;
}

function computeDiscount(priceExVat: number, c: CampaignRow): DiscountResult {
  const { campaign_type, discount_value, discount_is_pct, max_discount_amount, bonus_lessons } = c;

  if (campaign_type === 'bonus_lessons') {
    return {
      discount_amount: null,
      discounted_price: null,
      badge_label: bonus_lessons != null
        ? `+${bonus_lessons} lektion${bonus_lessons !== 1 ? 'er' : ''}`
        : null,
    };
  }
  if (campaign_type === 'free_risk1')  return { discount_amount: null, discounted_price: null, badge_label: 'Gratis Risk 1' };
  if (campaign_type === 'free_risk2')  return { discount_amount: null, discounted_price: null, badge_label: 'Gratis Risk 2' };
  if (campaign_type === 'seasonal')    return { discount_amount: null, discounted_price: null, badge_label: 'Säsongserbjudande' };

  if (discount_value == null || discount_value <= 0) {
    return { discount_amount: null, discounted_price: null, badge_label: null };
  }

  const isPct =
    campaign_type === 'percentage_discount' ||
    (campaign_type === 'promotional_pricing' && discount_is_pct === true);
  const isFixed =
    campaign_type === 'fixed_discount' ||
    (campaign_type === 'promotional_pricing' && discount_is_pct === false);

  if (isPct) {
    const raw     = priceExVat * (discount_value / 100);
    const capped  = max_discount_amount != null ? Math.min(raw, max_discount_amount) : raw;
    const final   = Math.max(0, priceExVat - capped);
    const rounded = Math.round(capped * 100) / 100;
    const actualPct = Math.round((rounded / priceExVat) * 100);
    return { discount_amount: rounded, discounted_price: Math.round(final * 100) / 100, badge_label: `-${actualPct}%` };
  }

  if (isFixed) {
    const raw   = Math.min(discount_value, priceExVat);
    const final = Math.round((priceExVat - raw) * 100) / 100;
    return { discount_amount: raw, discounted_price: final, badge_label: `-${raw} kr` };
  }

  return { discount_amount: null, discounted_price: null, badge_label: null };
}

function getSavingsLabel(amount: number | null, currency: string): string | null {
  if (amount == null || amount <= 0) return null;
  return `Spara ${Math.round(amount).toLocaleString('sv-SE')} ${currency}`;
}

// ─── Package shape ────────────────────────────────────────────────────────────

interface PackageRow {
  id:              string;
  name:            string;
  description:     string | null;
  lesson_category: string;
  quantity:        number;
  price:           number;
  vat_rate:        number;
  currency:        string;
  package_code:    string | null;
  visibility:      string;
  featured:        boolean;
  sort_order:      number;
  validity_days:   number | null;
  bundle_credits:  unknown[];
}

interface CampaignLinkRow {
  offering_id: string;
  campaigns:   CampaignRow | null;
}

function buildPublicPackage(pkg: PackageRow, campaigns: CampaignRow[]): Record<string, unknown> {
  // Pick highest-priority active campaign
  const sorted = [...campaigns].sort((a, b) => b.priority - a.priority);
  const top    = sorted[0] ?? null;

  const priceInclVat = Math.round(pkg.price * (1 + pkg.vat_rate) * 100) / 100;

  let discountedPrice:       number | null = null;
  let discountedPriceInclVat: number | null = null;
  let discountAmount:        number | null = null;
  let savingsLabel:          string | null = null;
  let activeCampaign:        Record<string, unknown> | null = null;

  if (top) {
    const dr = computeDiscount(pkg.price, top);
    discountAmount        = dr.discount_amount;
    discountedPrice       = dr.discounted_price;
    discountedPriceInclVat = discountedPrice != null
      ? Math.round(discountedPrice * (1 + pkg.vat_rate) * 100) / 100
      : null;
    savingsLabel = getSavingsLabel(discountAmount, pkg.currency);

    activeCampaign = {
      id:                  top.id,
      name:                top.name,
      campaign_type:       top.campaign_type,
      discount_value:      top.discount_value,
      discount_is_pct:     top.discount_is_pct,
      max_discount_amount: top.max_discount_amount,
      bonus_lessons:       top.bonus_lessons,
      starts_at:           top.starts_at,
      ends_at:             top.ends_at,
      priority:            top.priority,
      badge_label:         dr.badge_label,
    };
  }

  return {
    id:                        pkg.id,
    name:                      pkg.name,
    description:               pkg.description,
    lesson_category:           pkg.lesson_category,
    quantity:                  pkg.quantity,
    price:                     pkg.price,
    vat_rate:                  pkg.vat_rate,
    price_incl_vat:            priceInclVat,
    currency:                  pkg.currency,
    package_code:              pkg.package_code,
    visibility:                pkg.visibility,
    featured:                  pkg.featured,
    sort_order:                pkg.sort_order,
    validity_days:             pkg.validity_days,
    active_campaign:           activeCampaign,
    discounted_price:          discountedPrice,
    discounted_price_incl_vat: discountedPriceInclVat,
    discount_amount:           discountAmount,
    savings_label:             savingsLabel,
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string): Promise<Response> {
  const url      = new URL(req.url);
  const category = url.searchParams.get('category');
  const featured = url.searchParams.get('featured');

  // eslint-disable-next-line prefer-const
  let pkgQ = client
    .from('package_offerings')
    .select('id, name, description, lesson_category, quantity, price, vat_rate, currency, package_code, visibility, featured, sort_order, validity_days, bundle_credits')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .in('visibility', ['website', 'public'])
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(100);

  if (category) pkgQ = pkgQ.eq('lesson_category', category);
  if (featured === 'true') pkgQ = pkgQ.eq('featured', true);

  const [orgRes, pkgRes] = await Promise.all([
    client
      .from('organizations')
      .select('id, name, subscription_status')
      .eq('id', orgId)
      .neq('status', 'suspended')
      .maybeSingle(),
    pkgQ,
  ]);

  if (orgRes.error || !orgRes.data) return err('Organization not found', 404, 'NOT_FOUND');
  if (pkgRes.error)                  return err('Failed to load packages', 500, 'QUERY_FAILED');

  const packages: PackageRow[] = pkgRes.data ?? [];

  // Fetch active campaign links for all returned packages
  const pkgIds = packages.map((p: PackageRow) => p.id);
  let linkMap  = new Map<string, CampaignRow[]>();

  if (pkgIds.length > 0) {
    const { data: links } = await client
      .from('campaign_package_links')
      .select('offering_id, campaigns(id, name, campaign_type, discount_value, discount_is_pct, max_discount_amount, bonus_lessons, starts_at, ends_at, priority, status, visibility)')
      .in('offering_id', pkgIds)
      .eq('organization_id', orgId);

    // Filter to active + visible campaigns only
    const validLinks: CampaignLinkRow[] = (links ?? []).filter((l: CampaignLinkRow) => {
      const c = l.campaigns;
      return c && c.status === 'active' && (c.visibility === 'website' || c.visibility === 'public');
    });

    linkMap = new Map<string, CampaignRow[]>();
    for (const link of validLinks) {
      const arr = linkMap.get(link.offering_id) ?? [];
      if (link.campaigns) arr.push(link.campaigns);
      linkMap.set(link.offering_id, arr);
    }
  }

  const publicPackages = packages.map((p: PackageRow) =>
    buildPublicPackage(p, linkMap.get(p.id) ?? [])
  );

  const activeCampaignCount = publicPackages.filter((p) => p['active_campaign'] != null).length;
  const featuredCount       = publicPackages.filter((p) => p['featured']).length;

  return json({
    data: publicPackages,
    organization: orgRes.data,
    meta: {
      total:               publicPackages.length,
      featured_count:      featuredCount,
      has_active_campaigns: activeCampaignCount > 0,
      active_campaign_count: activeCampaignCount,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDetail(req: Request, client: any, orgId: string, pkgId: string): Promise<Response> {
  const [orgRes, pkgRes, linkRes] = await Promise.all([
    client
      .from('organizations')
      .select('id, name, subscription_status')
      .eq('id', orgId)
      .neq('status', 'suspended')
      .maybeSingle(),
    client
      .from('package_offerings')
      .select('id, name, description, lesson_category, quantity, price, vat_rate, currency, package_code, visibility, featured, sort_order, validity_days, bundle_credits')
      .eq('id', pkgId)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .in('visibility', ['website', 'public'])
      .maybeSingle(),
    client
      .from('campaign_package_links')
      .select('offering_id, campaigns(id, name, campaign_type, discount_value, discount_is_pct, max_discount_amount, bonus_lessons, starts_at, ends_at, priority, status, visibility)')
      .eq('offering_id', pkgId)
      .eq('organization_id', orgId),
  ]);

  if (orgRes.error || !orgRes.data) return err('Organization not found', 404, 'NOT_FOUND');
  if (pkgRes.error || !pkgRes.data) return err('Package not found', 404, 'NOT_FOUND');

  const pkg: PackageRow = pkgRes.data;

  const validCampaigns: CampaignRow[] = ((linkRes.data ?? []) as CampaignLinkRow[])
    .filter((l) => l.campaigns?.status === 'active' && (l.campaigns.visibility === 'website' || l.campaigns.visibility === 'public'))
    .map((l) => l.campaigns as CampaignRow);

  const base         = buildPublicPackage(pkg, validCampaigns);
  const allCampaigns = validCampaigns.map((c) => {
    const dr = computeDiscount(pkg.price, c);
    return {
      id:                  c.id,
      name:                c.name,
      campaign_type:       c.campaign_type,
      discount_value:      c.discount_value,
      discount_is_pct:     c.discount_is_pct,
      max_discount_amount: c.max_discount_amount,
      bonus_lessons:       c.bonus_lessons,
      starts_at:           c.starts_at,
      ends_at:             c.ends_at,
      priority:            c.priority,
      badge_label:         dr.badge_label,
    };
  });

  return json({
    ...base,
    bundle_credits: pkg.bundle_credits,
    all_campaigns:  allCampaigns,
    organization:   orgRes.data,
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: PUBLIC_CORS });
  }

  if (req.method !== 'GET') {
    return err('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  const url    = new URL(req.url);
  const orgId  = url.searchParams.get('org_id');

  if (!orgId || !UUID_RE.test(orgId)) {
    return err('Missing or invalid org_id', 400, 'INVALID_ORG_ID');
  }

  const pkgId = extractPackageId(req);
  const client = createServiceClient();

  try {
    if (pkgId) {
      return await handleDetail(req, client, orgId, pkgId);
    }
    return await handleList(req, client, orgId);
  } catch (e) {
    console.error('public-catalog error', e);
    return err('Internal server error', 500, 'INTERNAL_ERROR');
  }
});
