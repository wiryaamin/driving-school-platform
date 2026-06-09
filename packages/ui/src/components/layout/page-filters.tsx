import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.js';

interface PageFiltersProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageFilters — consistent filter bar for ERP list pages.
 * Contains search inputs, select filters, and action buttons.
 */
export function PageFilters({ children, className }: PageFiltersProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 flex-wrap',
        'py-3 border-b border-border',
        className
      )}
    >
      {children}
    </div>
  );
}
