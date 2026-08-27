import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils.js';

// ─── PageLayout ───────────────────────────────────────────────────────────────

interface PageLayoutProps {
  children: ReactNode;
  className?: string;
  /** Fill the full workspace width instead of capping/centering at
   * max-w-screen-2xl — matches the Scheduling workspace's own full-bleed
   * pages, for content rendered inside a workspace tab (where a capped,
   * centered width leaves a large dead margin on wide screens next to the
   * workspace's edge-to-edge tab bar). Off by default so existing
   * non-workspace consumers (Platform Admin, detail pages, etc.) keep
   * their current centered layout. */
  fullBleed?: boolean;
}

/**
 * PageLayout — standard content wrapper for all module pages.
 * Provides consistent vertical spacing and max-width.
 */
export function PageLayout({ children, className, fullBleed }: PageLayoutProps) {
  return (
    <div className={cn(fullBleed ? 'w-full px-4 pt-4' : 'max-w-screen-2xl mx-auto', 'space-y-5', className)}>
      {children}
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

interface PageHeaderProps {
  /** Omit when the workspace tab bar above already labels this page (e.g.
   * a "Personal" tab rendering a page that would otherwise also say
   * "Personal") — avoids a redundant duplicate heading. */
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  breadcrumbs?: BreadcrumbItem[] | undefined;
  className?: string | undefined;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function PageHeader({ title, description, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 mb-1" aria-label="Brödsmulor">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              // Every "Hem" crumb across the app is passed without an href —
              // default it to the dashboard so it's clickable without having
              // to touch every call site individually.
              const href = crumb.href ?? (crumb.label === 'Hem' ? '/dashboard' : undefined);
              return (
                <span key={idx} className="flex items-center gap-1">
                  {idx > 0 && <span className="text-muted-foreground text-xs">/</span>}
                  {!isLast && href ? (
                    <Link to={href} className="text-xs text-primary hover:text-primary/80 hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={cn('text-xs', isLast ? 'text-muted-foreground' : 'text-foreground')}>
                      {crumb.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
        )}
        {title && (
          <h1 className="text-xl font-semibold text-foreground tracking-tight">{title}</h1>
        )}
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

// ─── PageContent ──────────────────────────────────────────────────────────────

export function PageContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-5', className)}>{children}</div>;
}
