// ─── Public branding (Website Integration Services Feature 6) ──────────────
// Tenant Branding on Public Pages was previously "Not Implemented" — the
// data has existed all along (Settings → Webbplats → Varumärke's logo
// upload, already backed by the public `org-branding` storage bucket per
// its own migration comment: "these assets are displayed on the public
// website... so they must be fetchable without auth"; brand colors;
// customer_email/customer_phone/address; social links), it was just never
// read back out on any public endpoint. Shared across public-catalog,
// public-booking, and public-enrollment rather than duplicated three times.
// Only an explicit allowlisted subset of `settings` is ever returned — never
// the raw settings object, which also holds unrelated internal
// configuration a visitor has no reason to see.

export interface PublicBranding {
  logo_url:      string | null;
  primary_color: string | null;
  about_text:    string | null;
  contact: {
    email:   string | null;
    phone:   string | null;
    address: string | null;
  };
  social: {
    instagram?: string;
    facebook?:  string;
    tiktok?:    string;
    youtube?:   string;
  };
}

export function buildPublicBranding(settings: Record<string, unknown> | null | undefined): PublicBranding {
  const s = settings ?? {};
  const assets = (s['branding_assets'] as Record<string, string> | undefined) ?? {};
  const social: PublicBranding['social'] = {};
  for (const key of ['instagram', 'facebook', 'tiktok', 'youtube'] as const) {
    const v = s[key];
    if (typeof v === 'string' && v.length > 0) social[key] = v;
  }
  const addressParts = [s['visit_address'], s['visit_city']]
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  const aboutText = s['public_about_text'];
  return {
    logo_url:      assets['logo_light'] ?? null,
    primary_color: (s['brand_primary_color'] as string | undefined) ?? null,
    // Never a fabricated placeholder — null when the tenant hasn't written
    // one, same discipline as everything else this platform shows publicly.
    about_text:    (typeof aboutText === 'string' && aboutText.trim().length > 0) ? aboutText.trim() : null,
    contact: {
      email:   (s['customer_email'] as string | undefined) ?? null,
      phone:   (s['customer_phone'] as string | undefined) ?? null,
      address: addressParts.length > 0 ? addressParts.join(', ') : null,
    },
    social,
  };
}
