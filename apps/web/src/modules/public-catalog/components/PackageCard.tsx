import { Link } from 'react-router-dom';
import { Star, ChevronRight } from 'lucide-react';
import type { PublicPackage } from '../hooks/usePublicCatalog.js';
import { formatCatalogPrice, LESSON_CATEGORY_LABELS } from '../hooks/usePublicCatalog.js';
import { CountdownTimer } from './CountdownTimer.js';
import { MarketingBadgeList } from './MarketingBadgeList.js';

interface PackageCardProps {
  pkg:   PublicPackage;
  orgId: string;
}

export function PackageCard({ pkg, orgId }: PackageCardProps) {
  const displayPrice    = pkg.discounted_price_incl_vat ?? pkg.price_incl_vat;
  const originalPrice   = pkg.original_price_incl_vat ?? pkg.price_incl_vat;
  const hasDiscount     = pkg.discounted_price_incl_vat != null;
  const categoryLabel   = LESSON_CATEGORY_LABELS[pkg.lesson_category] ?? pkg.lesson_category;

  return (
    <Link
      to={`/catalog/${orgId}/${pkg.id}`}
      className="group block bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {/* header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          {pkg.marketing_badges.length > 0 ? (
            <MarketingBadgeList badges={pkg.marketing_badges} className="mb-1.5" />
          ) : pkg.featured && (
            <div className="flex items-center gap-1 text-amber-600 text-xs font-semibold mb-1">
              <Star className="w-3 h-3 fill-current" />
              Populärt val
            </div>
          )}
          <h3 className="font-semibold text-gray-900 leading-snug group-hover:text-blue-700 transition-colors">
            {pkg.name}
          </h3>
        </div>

        {pkg.active_campaign?.badge_label && (
          <span className="shrink-0 inline-block bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
            {pkg.active_campaign.badge_label}
          </span>
        )}
      </div>

      {/* category + quantity */}
      <p className="text-sm text-gray-500 mb-4">
        {categoryLabel}
        {pkg.quantity > 0 && ` · ${pkg.quantity} lektion${pkg.quantity !== 1 ? 'er' : ''}`}
      </p>

      {/* price */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${hasDiscount ? 'text-blue-600' : 'text-gray-900'}`}>
              {formatCatalogPrice(displayPrice, pkg.currency)}
            </span>
            {hasDiscount && (
              <span className="text-sm text-gray-400 line-through">
                {formatCatalogPrice(originalPrice, pkg.currency)}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">inkl. moms</p>
        </div>

        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
      </div>

      {/* savings badge */}
      {pkg.savings_label && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
            {pkg.savings_label}
          </span>
          {pkg.active_campaign?.ends_at && (
            <CountdownTimer endsAt={pkg.active_campaign.ends_at} />
          )}
        </div>
      )}
    </Link>
  );
}
