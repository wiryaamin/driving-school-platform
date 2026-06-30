import { Tag } from 'lucide-react';
import type { PublicCampaign } from '../hooks/usePublicCatalog.js';
import { CountdownTimer } from './CountdownTimer.js';

interface CampaignBannerProps {
  campaign: PublicCampaign;
}

export function CampaignBanner({ campaign }: CampaignBannerProps) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl px-5 py-4 md:px-7 md:py-5 mb-6">
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-1.5 bg-white/20 rounded-lg shrink-0">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            {campaign.badge_label && (
              <span className="inline-block bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full mb-1.5">
                {campaign.badge_label}
              </span>
            )}
            <p className="font-semibold text-base leading-tight">{campaign.name}</p>
          </div>
        </div>

        {campaign.ends_at && (
          <CountdownTimer
            endsAt={campaign.ends_at}
            className="!bg-white/15 !border-white/30 !text-white shrink-0"
          />
        )}
      </div>

      {/* decorative circles */}
      <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute -bottom-6 -right-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
    </div>
  );
}
