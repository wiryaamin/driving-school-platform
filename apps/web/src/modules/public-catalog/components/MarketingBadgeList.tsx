import { Star, TrendingUp, Sparkles, Zap, Clock, ThumbsUp } from 'lucide-react';
import type { PublicMarketingBadge } from '../hooks/usePublicCatalog.js';
import { cn } from '@/lib/utils.js';

const BADGE_META: Record<PublicMarketingBadge, { label: string; icon: React.ElementType; className: string }> = {
  featured:      { label: 'Utvalt',                  icon: Star,       className: 'bg-amber-50 text-amber-700 border-amber-100' },
  best_seller:   { label: 'Bästsäljare',              icon: TrendingUp, className: 'bg-purple-50 text-purple-700 border-purple-100' },
  new:           { label: 'Nyhet',                    icon: Sparkles,   className: 'bg-blue-50 text-blue-700 border-blue-100' },
  campaign:      { label: 'Kampanj',                  icon: Zap,        className: 'bg-red-50 text-red-700 border-red-100' },
  limited_offer: { label: 'Begränsat erbjudande',      icon: Clock,      className: 'bg-orange-50 text-orange-700 border-orange-100' },
  recommended:   { label: 'Rekommenderas',             icon: ThumbsUp,   className: 'bg-green-50 text-green-700 border-green-100' },
};

export function MarketingBadgeList({
  badges, className,
}: { badges: PublicMarketingBadge[]; className?: string }) {
  if (badges.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {badges.map((b) => {
        const meta = BADGE_META[b];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <span
            key={b}
            className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border', meta.className)}
          >
            <Icon className="w-2.5 h-2.5" />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
