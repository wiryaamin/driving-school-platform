import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.js';

interface PageSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Rendered top-right of the section header */
  headerAction?: ReactNode;
}

export function PageSection({
  title,
  description,
  children,
  className,
  contentClassName,
  headerAction,
}: PageSectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || description || headerAction) && (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-foreground tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className={cn(contentClassName)}>{children}</div>
    </section>
  );
}
