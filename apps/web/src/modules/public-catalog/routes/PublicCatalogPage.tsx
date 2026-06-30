import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, LayoutGrid } from 'lucide-react';
import { usePublicPackages, LESSON_CATEGORY_LABELS } from '../hooks/usePublicCatalog.js';
import { CampaignBanner } from '../components/CampaignBanner.js';
import { PackageCard } from '../components/PackageCard.js';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
      <div className="h-8 bg-gray-200 rounded w-1/3" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PublicCatalogPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [category, setCategory] = useState<string>('');

  const { data, isLoading, isError } = usePublicPackages(orgId, {
    ...(category ? { category } : {}),
  });

  const org      = data?.organization;
  const packages = data?.data ?? [];

  // Derive unique categories from ALL packages (without category filter) for the filter pills
  const { data: allData } = usePublicPackages(orgId, {});
  const allPackages = allData?.data ?? [];

  const uniqueCategories = Array.from(
    new Set(allPackages.map((p) => p.lesson_category))
  ).filter(Boolean);

  // Top featured campaign (highest priority from any package)
  const topCampaign = packages
    .filter((p) => p.active_campaign != null)
    .map((p) => p.active_campaign!)
    .sort((a, b) => b.priority - a.priority)[0] ?? null;

  // ── SEO ─────────────────────────────────────────────────────────────────────
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    const title = org ? `Paket & kurser — ${org.name}` : 'Paket & kurser';
    document.title = title;

    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (desc) desc.content = org ? `Boka körlektioner och paket hos ${org.name}.` : '';

    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = 'index, follow';

    return () => {
      document.title = 'Körskoleplattformen';
      if (robots) robots.content = 'noindex, nofollow';
    };
  }, [org]);

  // JSON-LD structured data
  useEffect(() => {
    if (!packages.length || !org) return;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id   = 'catalog-schema';
    script.text = JSON.stringify({
      '@context':       'https://schema.org',
      '@type':          'ItemList',
      name:             `Körskolepaket — ${org.name}`,
      itemListElement:  packages.map((pkg, i) => ({
        '@type':    'ListItem',
        position:   i + 1,
        item: {
          '@type':      'Product',
          name:         pkg.name,
          description:  pkg.description ?? undefined,
          offers: {
            '@type':        'Offer',
            price:          (pkg.discounted_price_incl_vat ?? pkg.price_incl_vat).toFixed(2),
            priceCurrency:  pkg.currency,
            availability:   'https://schema.org/InStock',
          },
        },
      })),
    });
    document.head.appendChild(script);
    scriptRef.current = script;
    return () => script.remove();
  }, [packages, org]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Kunde inte ladda katalogen</p>
          <p className="text-sm text-gray-500 mt-1">Kontrollera att webbadressen är korrekt.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-700">
            <LayoutGrid className="w-5 h-5" />
            <span className="font-semibold text-sm">
              {org?.name ?? (isLoading ? 'Laddar…' : 'Körskola')}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 md:py-8">

        {/* Campaign banner */}
        {topCampaign && <CampaignBanner campaign={topCampaign} />}

        {/* Page title */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Paket & kurser</h1>
          {packages.length > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              {packages.length} paket tillgängliga
              {data?.meta.active_campaign_count ? ` · ${data.meta.active_campaign_count} med kampanjerbjudanden` : ''}
            </p>
          )}
        </div>

        {/* Category filter */}
        {uniqueCategories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setCategory('')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700'
              }`}
            >
              Alla
            </button>
            {uniqueCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat === category ? '' : cat)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  category === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700'
                }`}
              >
                {LESSON_CATEGORY_LABELS[cat] ?? cat}
              </button>
            ))}
          </div>
        )}

        {/* Package grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : packages.length === 0 ? (
          <div className="text-center py-16">
            <LayoutGrid className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Inga paket tillgängliga</p>
            {category && (
              <button
                onClick={() => setCategory('')}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Visa alla kategorier
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} orgId={orgId!} />
            ))}
          </div>
        )}

        {/* Footer note */}
        <p className="mt-10 text-center text-xs text-gray-400">
          Alla priser inkl. moms · Paket och erbjudanden kan ändras
        </p>
      </main>
    </div>
  );
}
