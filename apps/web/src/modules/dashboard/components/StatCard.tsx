import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils.js';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  isLoading?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * StatCard — a KPI metric card for the dashboard.
 * Displays a key metric with optional trend indicator.
 */
export function StatCard({ title, value, description, icon: Icon, trend, isLoading, className, onClick }: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-5',
        'hover:shadow-sm transition-shadow',
        onClick && 'cursor-pointer hover:border-primary/40',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
          <div className="mt-2">
            {isLoading ? (
              <div className="h-8 w-20 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
            )}
          </div>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
          {trend && !isLoading && (
            <div className={cn(
              'mt-2 inline-flex items-center gap-1 text-xs font-medium',
              trend.value >= 0 ? 'text-emerald-600' : 'text-destructive'
            )}>
              <span>{trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground font-normal">{trend.label}</span>
            </div>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
