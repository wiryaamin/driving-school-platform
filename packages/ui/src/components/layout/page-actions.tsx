import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.js';

interface PageActionsProps {
  children: ReactNode;
  className?: string;
  /** Align actions to the right (default) or left */
  align?: 'left' | 'right';
}

export function PageActions({ children, className, align = 'right' }: PageActionsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 flex-wrap',
        align === 'right' && 'justify-end',
        align === 'left' && 'justify-start',
        className
      )}
    >
      {children}
    </div>
  );
}
