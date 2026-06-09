import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.js';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Breadcrumb or back-navigation rendered above the title */
  breadcrumb?: ReactNode;
  /** Action buttons rendered top-right */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {breadcrumb && (
        <div className="mb-2 text-xs text-muted-foreground">{breadcrumb}</div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground leading-tight tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
