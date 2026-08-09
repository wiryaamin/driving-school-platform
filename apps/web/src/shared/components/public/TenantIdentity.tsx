import type { ReactNode } from 'react';

export interface TenantBrandingSummary {
  logo_url:      string | null;
  primary_color: string | null;
}

interface TenantIdentityProps {
  name:           string | undefined;
  branding?:      TenantBrandingSummary | null | undefined;
  fallback?:      string;
  fallbackIcon?:  ReactNode;
  logoClassName?: string;
  textClassName?: string;
}

export function TenantIdentity({
  name,
  branding,
  fallback = 'Körskola',
  fallbackIcon,
  logoClassName = 'h-6 w-auto',
  textClassName = 'font-semibold text-sm',
}: TenantIdentityProps) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {branding?.logo_url
        ? <img src={branding.logo_url} alt="" className={`${logoClassName} shrink-0 object-contain`} />
        : fallbackIcon}
      <span
        className={`${textClassName} truncate`}
        style={branding?.primary_color ? { color: branding.primary_color } : undefined}
      >
        {name ?? fallback}
      </span>
    </span>
  );
}
