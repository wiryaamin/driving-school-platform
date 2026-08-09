import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CouponValidation {
  is_valid:            boolean;
  coupon_id:           string;
  coupon_code:         string;
  campaign_id:         string;
  campaign_name:       string;
  campaign_type:       string;
  discount_amount:     number | null;
  discounted_price:    number | null;
  discounted_incl_vat: number | null;
  badge_label:         string | null;
  ends_at:             string | null;
  error?:              string;
  code?:               string;
}

export interface EnrollmentFormValues {
  first_name:         string;
  last_name:          string;
  email:              string;
  phone:              string;
  personnummer:       string;
  address:            string;
  preferred_language: string;
  license_category:   string;
  comments:           string;
}

export interface EnrollmentSubmitInput {
  org_id:               string;
  package_offering_id:  string;
  campaign_id:          string | null;
  coupon_id:            string | null;
  coupon_code:          string | null;
  form:                 EnrollmentFormValues;
  /** Honeypot — always empty for a real visitor; never rendered as a visible field. */
  website?:             string;
}

export interface EnrollmentSubmitResult {
  enrollment_id:        string;
  submitted_at:         string;
  package_name:         string;
  final_price_incl_vat: number;
  currency:             string;
  organization_id:      string;
}

export const INITIAL_FORM: EnrollmentFormValues = {
  first_name:         '',
  last_name:          '',
  email:              '',
  phone:              '',
  personnummer:       '',
  address:            '',
  preferred_language: 'sv',
  license_category:   'B',
  comments:           '',
};

export const LANGUAGE_OPTIONS = [
  { value: 'sv', label: 'Svenska' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
  { value: 'so', label: 'Soomaali' },
  { value: 'ku', label: 'Kurdî' },
  { value: 'fa', label: 'فارسی' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
] as const;

export const LICENSE_CATEGORY_OPTIONS = [
  { value: 'B',   label: 'B — Personbil' },
  { value: 'A',   label: 'A — Motorcykel' },
  { value: 'A2',  label: 'A2 — Motorcykel (mellanklass)' },
  { value: 'A1',  label: 'A1 — Lätt motorcykel' },
  { value: 'AM',  label: 'AM — Moped' },
  { value: 'BE',  label: 'BE — Personbil med släp' },
  { value: 'C',   label: 'C — Lastbil' },
  { value: 'C1',  label: 'C1 — Lätt lastbil' },
  { value: 'CE',  label: 'CE — Lastbil med släp' },
  { value: 'D',   label: 'D — Buss' },
] as const;

// ─── Validation ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEnrollmentForm(form: EnrollmentFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.first_name.trim())          errors['first_name']   = 'Förnamn krävs';
  if (!form.last_name.trim())           errors['last_name']    = 'Efternamn krävs';
  if (!form.email.trim())               errors['email']        = 'E-post krävs';
  else if (!EMAIL_RE.test(form.email))  errors['email']        = 'Ogiltig e-postadress';
  if (!form.phone.trim())               errors['phone']        = 'Mobilnummer krävs';
  else if (form.phone.trim().length < 7) errors['phone']       = 'Ogiltigt telefonnummer';
  return errors;
}

// ─── Coupon validation hook ───────────────────────────────────────────────────

export function useCouponValidation(orgId: string | undefined) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [result, setResult] = useState<CouponValidation | null>(null);

  async function validateCoupon(code: string, packageId: string): Promise<CouponValidation | null> {
    if (!orgId || !code.trim() || !packageId) return null;
    setStatus('loading');
    setResult(null);

    const qs = new URLSearchParams({
      org_id:     orgId,
      code:       code.trim().toUpperCase(),
      package_id: packageId,
    });

    const { data, error } = await supabase.functions.invoke<CouponValidation>(
      `public-enrollment/validate-coupon?${qs.toString()}`,
      { method: 'GET' },
    );

    if (error || !data) {
      setStatus('invalid');
      return null;
    }

    if (data.is_valid) {
      setStatus('valid');
      setResult(data);
    } else {
      setStatus('invalid');
      setResult(data);
    }
    return data;
  }

  function clearCoupon() {
    setStatus('idle');
    setResult(null);
  }

  return { status, result, validateCoupon, clearCoupon };
}

// ─── Submission mutation ──────────────────────────────────────────────────────

async function apiSubmitEnrollment(input: EnrollmentSubmitInput): Promise<EnrollmentSubmitResult> {
  const { org_id, package_offering_id, campaign_id, coupon_id, coupon_code, form, website } = input;

  const qs = new URLSearchParams({ org_id });

  const body: Record<string, unknown> = {
    package_offering_id,
    first_name:         form.first_name.trim(),
    last_name:          form.last_name.trim(),
    email:              form.email.trim(),
    phone:              form.phone.trim(),
    preferred_language: form.preferred_language,
    license_category:   form.license_category,
    website:            website ?? '',
  };

  if (campaign_id)                    body['campaign_id']   = campaign_id;
  if (coupon_id)                      body['coupon_id']     = coupon_id;
  if (coupon_code)                    body['coupon_code']   = coupon_code;
  if (form.personnummer.trim())       body['personnummer']  = form.personnummer.trim();
  if (form.address.trim())            body['address']       = form.address.trim();
  if (form.comments.trim())           body['comments']      = form.comments.trim();

  const { data, error } = await supabase.functions.invoke<EnrollmentSubmitResult>(
    `public-enrollment?${qs.toString()}`,
    { method: 'POST', body },
  );

  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

export function useSubmitEnrollment() {
  return useMutation({ mutationFn: apiSubmitEnrollment });
}
