import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import type { SupportItem, SupportCardColor } from '../lib/supportItems.js';

const COLOR_CLASSES: Record<SupportCardColor, string> = {
  blue:    'bg-blue-100    text-blue-600    dark:bg-blue-900/30    dark:text-blue-400',
  purple:  'bg-purple-100  text-purple-600  dark:bg-purple-900/30  dark:text-purple-400',
  gray:    'bg-gray-100    text-gray-600    dark:bg-gray-800       dark:text-gray-400',
  green:   'bg-green-100   text-green-700   dark:bg-green-900/30   dark:text-green-400',
  teal:    'bg-teal-100    text-teal-600    dark:bg-teal-900/30    dark:text-teal-400',
  amber:   'bg-amber-100   text-amber-700   dark:bg-amber-900/30   dark:text-amber-400',
  orange:  'bg-orange-100  text-orange-600  dark:bg-orange-900/30  dark:text-orange-400',
  pink:    'bg-pink-100    text-pink-600    dark:bg-pink-900/30    dark:text-pink-400',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const CARD_CLASS          = 'flex items-start gap-3 p-4 rounded-xl border border-border bg-card text-left transition-all duration-150';
const ACTIVE_CARD_CLASS   = cn(CARD_CLASS, 'hover:border-primary/30 hover:shadow-sm hover:bg-accent/10');
const DISABLED_CARD_CLASS = cn(CARD_CLASS, 'opacity-40 cursor-default select-none');

// Same card shell established by SettingsHubPage — reused here rather than
// inventing a new visual language, per the migration's "match the existing
// design system" requirement. Extended to also render tel:/external-link/
// coming-soon variants, which SettingsHubPage's internal-only cards don't need.
export function SupportActionCard({ item }: { item: SupportItem }) {
  const Icon = item.icon;

  const content = (
    <>
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', COLOR_CLASSES[item.color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-card-foreground leading-tight">{item.labelSv}</span>
          {item.external && <ExternalLink className="w-3 h-3 shrink-0 opacity-40" />}
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-snug">{item.description}</p>
      </div>
    </>
  );

  if (item.comingSoon) {
    return (
      <div className={DISABLED_CARD_CLASS} title="Kommer snart" aria-disabled="true">
        {content}
      </div>
    );
  }

  if (item.path) {
    return (
      <Link to={item.path} className={ACTIVE_CARD_CLASS}>
        {content}
      </Link>
    );
  }

  if (item.tel) {
    return (
      <a href={`tel:${item.tel}`} className={ACTIVE_CARD_CLASS}>
        {content}
      </a>
    );
  }

  if (item.href) {
    return (
      <a
        href={item.href}
        target={item.external ? '_blank' : undefined}
        rel={item.external ? 'noopener noreferrer' : undefined}
        className={ACTIVE_CARD_CLASS}
      >
        {content}
      </a>
    );
  }

  return <div className={DISABLED_CARD_CLASS}>{content}</div>;
}
