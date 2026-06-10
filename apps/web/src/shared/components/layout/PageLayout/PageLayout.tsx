import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';

// ─── PageLayout ───────────────────────────────────────────────────────────────

interface PageLayoutProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageLayout — standard content wrapper for all module pages.
 * Provides consistent vertical spacing and max-width.
 */
export function PageLayout({ children, className }: PageLayoutProps) {
  return (
    <div className={cn('max-w-screen-2xl mx-auto space-y-6', className)}>
      {children}
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
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
            {breadcrumbs.map((crumb, idx) => (
              <span key={idx} className="flex items-center gap-1">
                {idx > 0 && <span className="text-muted-foreground text-xs">/</span>}
                <span className={cn(
                  'text-xs',
                  idx === breadcrumbs.length - 1
                    ? 'text-muted-foreground'
                    : 'text-primary hover:text-primary/80 cursor-pointer'
                )}>
                  {crumb.label}
                </span>
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-xl font-semibold text-foreground tracking-tight">{title}</h1>
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
  return <div className={cn('space-y-6', className)}>{children}</div>;
}
