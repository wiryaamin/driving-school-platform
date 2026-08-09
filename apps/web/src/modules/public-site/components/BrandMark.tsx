import { cn } from '@platform/ui';

/**
 * The public site's brand mark. Same glyph already used across the
 * authenticated app (Sidebar, AuthLayout, MobileSidebar, PlatformSidebar) —
 * reused here as a fresh, public-site-scoped component rather than importing
 * across module boundaries, since those existing usages live inside
 * authenticated-app files this epic must not modify.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary', className)}>
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-primary-foreground" stroke="currentColor" strokeWidth={2}>
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    </div>
  );
}
