import { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Tag, X, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { usePublicPackageDetail, formatCatalogPrice } from '../hooks/usePublicCatalog.js';
import {
  INITIAL_FORM,
  LANGUAGE_OPTIONS,
  LICENSE_CATEGORY_OPTIONS,
  validateEnrollmentForm,
  useCouponValidation,
  useSubmitEnrollment,
  type EnrollmentFormValues,
} from '../hooks/useEnrollment.js';
import { TenantIdentity } from '@shared/components/public/TenantIdentity.js';
import { TenantContactFooter } from '@shared/components/public/TenantContactFooter.js';

// ─── Field components ─────────────────────────────────────────────────────────

function Field({
  label, required = false, error, children,
}: { label: string; required?: boolean | undefined; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Input({
  value, onChange, placeholder = '', type = 'text', error,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string | undefined;
  type?: string | undefined; error?: string | undefined;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
      }`}
    />
  );
}

function Select({
  value, onChange, options, error,
}: {
  value: string; onChange: (v: string) => void;
  options: readonly { value: string; label: string }[]; error?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white pr-8 ${
          error ? 'border-red-400 bg-red-50' : 'border-gray-300'
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ─── Price breakdown ──────────────────────────────────────────────────────────

function PriceBreakdown({
  baseInclVat, campaignDiscount, couponDiscount, finalInclVat, currency,
  campaignName, couponBadge,
}: {
  baseInclVat: number; campaignDiscount: number; couponDiscount: number;
  finalInclVat: number; currency: string; campaignName?: string | null | undefined;
  couponBadge?: string | null | undefined;
}) {
  const hasDiscount = campaignDiscount > 0 || couponDiscount > 0;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-gray-600">
        <span>Grundpris</span>
        <span>{formatCatalogPrice(baseInclVat, currency)}</span>
      </div>
      {campaignDiscount > 0 && (
        <div className="flex justify-between text-green-700">
          <span>{campaignName ?? 'Kampanjrabatt'}</span>
          <span>−{formatCatalogPrice(campaignDiscount * (1 + 0.25), currency)}</span>
        </div>
      )}
      {couponDiscount > 0 && (
        <div className="flex justify-between text-green-700">
          <span>Kupong {couponBadge ? `(${couponBadge})` : ''}</span>
          <span>−{formatCatalogPrice(couponDiscount * (1 + 0.25), currency)}</span>
        </div>
      )}
      {hasDiscount && <hr className="border-gray-200" />}
      <div className="flex justify-between font-bold text-gray-900 text-base">
        <span>Totalt inkl. moms</span>
        <span className={hasDiscount ? 'text-blue-700' : ''}>{formatCatalogPrice(finalInclVat, currency)}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CheckoutPage() {
  const { orgId, packageId } = useParams<{ orgId: string; packageId: string }>();
  const navigate = useNavigate();

  const { data: pkg, isLoading, isError } = usePublicPackageDetail(orgId, packageId);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [form, setForm]       = useState<EnrollmentFormValues>(INITIAL_FORM);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [couponInput, setCouponInput] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — real visitors never fill this

  // ── Coupon state ───────────────────────────────────────────────────────────
  const { status: couponStatus, result: couponResult, validateCoupon, clearCoupon } = useCouponValidation(orgId);

  const handleApplyCoupon = useCallback(async () => {
    if (!packageId || !couponInput.trim()) return;
    await validateCoupon(couponInput, packageId);
  }, [couponInput, packageId, validateCoupon]);

  const handleRemoveCoupon = useCallback(() => {
    setCouponInput('');
    clearCoupon();
  }, [clearCoupon]);

  // ── Price computation ──────────────────────────────────────────────────────
  const org            = pkg?.organization;
  const campaign       = pkg?.active_campaign ?? null;
  const basePrice      = pkg?.price_incl_vat  ?? 0;
  const currency       = pkg?.currency ?? 'SEK';
  const vatRate        = pkg?.vat_rate  ?? 0.25;

  // Campaign discount (ex-VAT stored in API, display incl VAT). Gated on an
  // actual active campaign being present: pkg.discount_amount is also
  // populated when the discount instead comes from the package's own
  // compare_at_price (no campaign) — in that case pkg.price is *already*
  // the sale price, so subtracting discount_amount again here would
  // double-discount the checkout total.
  const campaignDiscountExVat = campaign ? (pkg?.discount_amount ?? 0) : 0;

  // Coupon discount (ex-VAT from validation API)
  const couponDiscountExVat = (couponResult?.is_valid && couponResult.discount_amount != null)
    ? couponResult.discount_amount : 0;

  const totalDiscountExVat = campaignDiscountExVat + couponDiscountExVat;
  const baseExVat    = pkg?.price ?? 0;
  const finalExVat   = Math.max(0, baseExVat - totalDiscountExVat);
  const finalInclVat = Math.round(finalExVat * (1 + vatRate) * 100) / 100;

  // Applied campaign_id: prefer coupon's campaign, else package's campaign
  const appliedCampaignId = couponResult?.is_valid ? couponResult.campaign_id : (campaign?.id ?? null);

  // ── Field updater ──────────────────────────────────────────────────────────
  function setField(key: keyof EnrollmentFormValues, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }

  // ── Submit mutation ────────────────────────────────────────────────────────
  const { mutate: submitEnrollment, isPending: isSubmitting, error: submitError } = useSubmitEnrollment();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validateEnrollmentForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (!orgId || !packageId) return;

    submitEnrollment(
      {
        org_id:              orgId,
        package_offering_id: packageId,
        campaign_id:         appliedCampaignId,
        coupon_id:           couponResult?.is_valid ? couponResult.coupon_id : null,
        coupon_code:         couponResult?.is_valid ? couponResult.coupon_code : null,
        form,
        website,
      },
      {
        onSuccess: (data) => {
          void navigate(`/catalog/${orgId}/${packageId}/confirmation?ref=${data.enrollment_id}`);
        },
      },
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Paketet hittades inte</p>
          {orgId && (
            <Link to={`/catalog/${orgId}`} className="mt-3 inline-block text-sm text-blue-600 hover:underline">
              ← Tillbaka till katalogen
            </Link>
          )}
        </div>
      </div>
    );
  }

  const submitErrorMsg = submitError instanceof Error
    ? (submitError.message || 'Anmälan misslyckades. Försök igen.')
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3.5">
          <Link
            to={orgId && packageId ? `/catalog/${orgId}/${packageId}` : orgId ? `/catalog/${orgId}` : '#'}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700 transition-colors min-w-0"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <TenantIdentity name={org?.name} branding={org?.branding} fallback="Tillbaka" textClassName="text-sm font-medium" logoClassName="h-5 w-auto" />
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/2" />
            <div className="h-32 bg-gray-100 rounded" />
            <div className="h-64 bg-gray-100 rounded" />
          </div>
        ) : pkg ? (
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>

            {/* Honeypot — hidden from real visitors, left for bots to fill in */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] w-px h-px opacity-0"
            />

            {/* Package summary */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full inline-block mb-2">
                Valt paket
              </p>
              <h1 className="text-xl font-bold text-gray-900 mb-4">{pkg.name}</h1>

              {/* Coupon input */}
              <div className="mb-4">
                {couponResult?.is_valid ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-green-800">
                      <Tag className="w-4 h-4" />
                      <span className="font-medium">{couponResult.coupon_code}</span>
                      {couponResult.badge_label && (
                        <span className="text-xs font-bold bg-green-200 text-green-900 px-1.5 py-0.5 rounded">
                          {couponResult.badge_label}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="text-green-600 hover:text-green-900 ml-2"
                      aria-label="Ta bort kupong"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleApplyCoupon(); } }}
                      placeholder="Kupongkod (valfritt)"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      maxLength={50}
                    />
                    <button
                      type="button"
                      onClick={() => { void handleApplyCoupon(); }}
                      disabled={!couponInput.trim() || couponStatus === 'loading'}
                      className="px-4 py-2 text-sm font-medium bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      {couponStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Använd'}
                    </button>
                  </div>
                )}
                {couponStatus === 'invalid' && couponResult && !couponResult.is_valid && (
                  <p className="mt-1.5 text-xs text-red-600">
                    {couponResult.error ?? 'Ogiltig kupongkod.'}
                  </p>
                )}
              </div>

              {/* Price breakdown */}
              <PriceBreakdown
                baseInclVat={basePrice}
                campaignDiscount={campaignDiscountExVat}
                couponDiscount={couponDiscountExVat}
                finalInclVat={finalInclVat}
                currency={currency}
                campaignName={campaign?.name}
                couponBadge={couponResult?.is_valid ? couponResult.badge_label : null}
              />
            </div>

            {/* Enrollment form */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Dina uppgifter</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Förnamn" required error={errors['first_name']}>
                  <Input value={form.first_name} onChange={(v) => setField('first_name', v)} placeholder="Anna" error={errors['first_name']} />
                </Field>
                <Field label="Efternamn" required error={errors['last_name']}>
                  <Input value={form.last_name} onChange={(v) => setField('last_name', v)} placeholder="Andersson" error={errors['last_name']} />
                </Field>
              </div>

              <Field label="E-postadress" required error={errors['email']}>
                <Input type="email" value={form.email} onChange={(v) => setField('email', v)} placeholder="anna@exempel.se" error={errors['email']} />
              </Field>

              <Field label="Mobilnummer" required error={errors['phone']}>
                <Input type="tel" value={form.phone} onChange={(v) => setField('phone', v)} placeholder="070 000 00 00" error={errors['phone']} />
              </Field>

              <Field label="Personnummer" error={errors['personnummer']}>
                <Input value={form.personnummer} onChange={(v) => setField('personnummer', v)} placeholder="ÅÅMMDD-XXXX (valfritt)" error={errors['personnummer']} />
              </Field>

              <Field label="Adress" error={errors['address']}>
                <Input value={form.address} onChange={(v) => setField('address', v)} placeholder="Gatan 1, 123 45 Stad (valfritt)" error={errors['address']} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Föredraget språk">
                  <Select value={form.preferred_language} onChange={(v) => setField('preferred_language', v)} options={LANGUAGE_OPTIONS} />
                </Field>
                <Field label="Körkortskategori" required>
                  <Select value={form.license_category} onChange={(v) => setField('license_category', v)} options={LICENSE_CATEGORY_OPTIONS} />
                </Field>
              </div>

              <Field label="Kommentarer eller frågor" error={errors['comments']}>
                <textarea
                  value={form.comments}
                  onChange={(e) => setField('comments', e.target.value)}
                  placeholder="Har du frågor eller önskemål? Skriv dem här. (valfritt)"
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </Field>
            </div>

            {/* Submit */}
            {submitErrorMsg && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{submitErrorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-xl text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              style={!isSubmitting && org?.branding.primary_color ? { backgroundColor: org.branding.primary_color } : undefined}
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Skickar anmälan…</>
              ) : (
                <>Skicka anmälan — {formatCatalogPrice(finalInclVat, currency)}</>
              )}
            </button>

            <p className="text-center text-xs text-gray-400">
              Ingen betalning sker nu. Körskolan kontaktar dig för bekräftelse och betalning.
            </p>

            <TenantContactFooter branding={org?.branding} />
          </form>
        ) : null}
      </main>
    </div>
  );
}
