import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle2, Clock, Tag } from 'lucide-react';
import { usePublicPackageDetail, formatCatalogPrice, LESSON_CATEGORY_LABELS } from '../hooks/usePublicCatalog.js';
import { CountdownTimer } from '../components/CountdownTimer.js';

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 bg-gray-200 rounded w-2/3" />
      <div className="h-4 bg-gray-100 rounded w-1/3" />
      <div className="h-24 bg-gray-100 rounded" />
      <div className="h-12 bg-gray-200 rounded w-1/4" />
    </div>
  );
}

export function PublicPackageDetailPage() {
  const { orgId, packageId } = useParams<{ orgId: string; packageId: string }>();
  const { data: pkg, isLoading, isError } = usePublicPackageDetail(orgId, packageId);

  const org          = pkg?.organization;
  const hasDiscount  = pkg?.discounted_price_incl_vat != null;
  const displayPrice = pkg ? (pkg.discounted_price_incl_vat ?? pkg.price_incl_vat) : 0;
  const campaign     = pkg?.active_campaign ?? null;
  const categoryLabel = pkg ? (LESSON_CATEGORY_LABELS[pkg.lesson_category] ?? pkg.lesson_category) : '';

  // ── SEO ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pkg || !org) return;

    document.title = `${pkg.name} — ${org.name}`;

    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (desc) {
      desc.content = pkg.description
        ? `${pkg.description.slice(0, 155)}`
        : `${pkg.name} hos ${org.name}. ${categoryLabel}, ${pkg.quantity} lektioner.`;
    }

    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = 'index, follow';

    // JSON-LD Product
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id   = 'detail-schema';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type':    'Product',
      name:       pkg.name,
      ...(pkg.description ? { description: pkg.description } : {}),
      offers: {
        '@type':        'Offer',
        price:          displayPrice.toFixed(2),
        priceCurrency:  pkg.currency,
        availability:   'https://schema.org/InStock',
        ...(pkg.discounted_price_incl_vat != null && pkg.price_incl_vat > pkg.discounted_price_incl_vat
          ? { priceValidUntil: campaign?.ends_at?.slice(0, 10) }
          : {}),
      },
    });
    document.head.appendChild(script);

    return () => {
      document.title = 'Körskoleplattformen';
      if (robots) robots.content = 'noindex, nofollow';
      script.remove();
    };
  }, [pkg, org, displayPrice, campaign, categoryLabel]);

  // ── Error / not found ────────────────────────────────────────────────────────
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3.5">
          <Link
            to={orgId ? `/catalog/${orgId}` : '#'}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {org?.name ?? 'Tillbaka'}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {isLoading ? (
          <Skeleton />
        ) : pkg ? (
          <div className="space-y-6">
            {/* Package header */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                  {categoryLabel}
                </span>
                {pkg.package_code && (
                  <span className="text-xs text-gray-400">#{pkg.package_code}</span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{pkg.name}</h1>
              {pkg.description && (
                <p className="text-gray-600 leading-relaxed">{pkg.description}</p>
              )}
            </div>

            {/* Price card */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Pris</p>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-3xl font-bold ${hasDiscount ? 'text-blue-600' : 'text-gray-900'}`}>
                      {formatCatalogPrice(displayPrice, pkg.currency)}
                    </span>
                    {hasDiscount && (
                      <span className="text-lg text-gray-400 line-through">
                        {formatCatalogPrice(pkg.price_incl_vat, pkg.currency)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">inkl. moms</p>
                </div>

                {pkg.savings_label && (
                  <span className="self-start sm:self-auto text-sm font-semibold text-green-700 bg-green-50 border border-green-100 px-3 py-1.5 rounded-lg">
                    {pkg.savings_label}
                  </span>
                )}
              </div>

              {/* Package contents */}
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                {pkg.quantity > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <span>{pkg.quantity} lektion{pkg.quantity !== 1 ? 'er' : ''}</span>
                  </div>
                )}
                {pkg.validity_days && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>Giltig i {pkg.validity_days} dagar från köp</span>
                  </div>
                )}
              </div>
            </div>

            {/* Active campaign box */}
            {campaign && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <Tag className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-semibold text-blue-900">{campaign.name}</p>
                      {campaign.badge_label && (
                        <span className="inline-block bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          {campaign.badge_label}
                        </span>
                      )}
                    </div>
                    {pkg.discount_amount != null && pkg.discount_amount > 0 && (
                      <p className="text-sm text-blue-700">
                        Du sparar {formatCatalogPrice(pkg.discount_amount, pkg.currency)} exkl. moms på detta erbjudande.
                      </p>
                    )}
                    {campaign.bonus_lessons != null && campaign.bonus_lessons > 0 && (
                      <p className="text-sm text-blue-700">
                        Inkluderar {campaign.bonus_lessons} extra lektion{campaign.bonus_lessons !== 1 ? 'er' : ''}.
                      </p>
                    )}
                    {campaign.ends_at && (
                      <div className="mt-2">
                        <CountdownTimer endsAt={campaign.ends_at} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* All campaigns (if more than one) */}
            {(pkg.all_campaigns?.length ?? 0) > 1 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Fler aktiva erbjudanden:</p>
                <div className="space-y-2">
                  {pkg.all_campaigns.slice(1).map((c) => (
                    <div key={c.id} className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-700">{c.name}</span>
                      {c.badge_label && (
                        <span className="shrink-0 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                          {c.badge_label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
              <p className="text-gray-700 font-medium mb-1">Intresserad av detta paket?</p>
              <p className="text-sm text-gray-500 mb-4">
                Anmäl ditt intresse — {org?.name ?? 'körskolan'} kontaktar dig för bekräftelse och betalning.
              </p>
              <Link
                to={orgId && packageId ? `/catalog/${orgId}/${packageId}/checkout` : '#'}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Boka paket
              </Link>
              <div className="mt-3">
                <Link
                  to={orgId ? `/catalog/${orgId}` : '#'}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Se alla paket
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
