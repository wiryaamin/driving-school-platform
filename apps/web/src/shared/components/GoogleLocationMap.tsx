/**
 * Read-only Google Maps Embed API panel for an existing plain-text address.
 *
 * Deliberately the Embed API, not the JS Maps SDK: it takes a free-text
 * address via a `q=` query param and resolves it to a pin entirely on
 * Google's side, as part of serving the iframe — no Geocoding API call, no
 * coordinates ever stored or handled by this app. Same technique as the
 * existing free OpenStreetMap iframe on StudentDetailPage.tsx, just backed
 * by Google instead of OSM.
 *
 * VITE_GOOGLE_MAPS_API_KEY is a platform-level, browser-restricted build
 * value (see apps/web/.env.production.example) — never a tenant credential,
 * never touches organizations.settings. Mirrors initMonitoring()'s
 * no-op-when-absent idiom (core/monitoring/index.ts): renders nothing at
 * all when no key or no address is configured, rather than a broken/empty
 * iframe or an error visible to tenants.
 */
import { useState } from 'react';
import { MapPin } from 'lucide-react';

export interface GoogleLocationMapProps {
  addressLine1: string;
  postalCode: string;
  city: string;
  className?: string;
}

export function GoogleLocationMap({ addressLine1, postalCode, city, className }: GoogleLocationMapProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const hasAddress = addressLine1.trim() !== '' && postalCode.trim() !== '' && city.trim() !== '';
  if (!apiKey || !hasAddress) return null;

  const query = encodeURIComponent(`${addressLine1.trim()}, ${postalCode.trim()} ${city.trim()}, Sverige`);
  const src = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${query}&language=sv`;

  if (loadFailed) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 h-48 rounded-lg border border-border bg-muted/20 text-muted-foreground ${className ?? ''}`}>
        <MapPin className="w-5 h-5" aria-hidden="true" />
        <p className="text-xs">Kartan kunde inte laddas just nu.</p>
      </div>
    );
  }

  return (
    <div className={`h-48 sm:h-56 rounded-lg overflow-hidden border border-border ${className ?? ''}`}>
      <iframe
        title="Karta"
        src={src}
        className="w-full h-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        onError={() => setLoadFailed(true)}
      />
    </div>
  );
}
