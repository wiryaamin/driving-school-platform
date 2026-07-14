import type { InstructorEmploymentType, CertificationStatus } from '@platform/types';

export function employmentTypeLabel(type: InstructorEmploymentType): string {
  switch (type) {
    case 'employed':   return 'Anställd';
    case 'contractor': return 'Konsult';
    case 'external':   return 'Extern';
    case 'on_leave':   return 'Tjänstledig';
    case 'inactive':   return 'Inaktiv';
    default:           return type;
  }
}

export function formatTeachingCategories(categories: string[]): string {
  if (categories.length === 0) return '—';
  return categories.join(', ');
}

export function formatAdiValidity(validUntil: string | null | undefined): string {
  if (!validUntil) return '—';
  const date = new Date(validUntil);
  const now = new Date();
  const label = date.toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  return date < now ? `${label} (utgången)` : label;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function computeCertStatus(expiresAt: string | null | undefined): CertificationStatus {
  if (!expiresAt) return 'active';
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) return 'expired';
  if (exp - now < 60 * 86_400_000) return 'expiring_soon';
  return 'active';
}
