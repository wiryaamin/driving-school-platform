import type { LucideIcon } from 'lucide-react';
import {
  LifeBuoy, MessageSquare, History, MessageCircle, Globe, Monitor, Phone,
  Newspaper, HelpCircle, Image as ImageIcon, Store,
} from 'lucide-react';

export type SupportCardColor =
  | 'blue' | 'purple' | 'gray' | 'green' | 'teal' | 'amber' | 'orange' | 'pink' | 'emerald';

export interface SupportItem {
  key:         string;
  labelSv:     string;
  description: string;
  icon:        LucideIcon;
  color:       SupportCardColor;
  path?:       string;
  href?:       string;
  tel?:        string;
  external?:   boolean;
  comingSoon?: boolean;
}

// Ported 1:1 from the former TopBar header dropdown (HelpSupportMenu) —
// same targets, same external links, same coming-soon items. Only the
// presentation changed: a permanent sidebar workspace with card grids
// instead of a header popover. Ändringslogg intentionally points at the
// same /nyheter route as Resurser's own Nyheter card below — that mirrors
// the original dropdown, which already listed both as separate entries
// into the one canonical System/Nyheter page (see SystemWorkspaceLayout).
export const SUPPORT_ITEMS: SupportItem[] = [
  { key: 'help',      labelSv: 'Hjälpcenter',    description: 'Guider och instruktioner',        icon: LifeBuoy,      color: 'blue',   comingSoon: true },
  { key: 'feedback',  labelSv: 'Feedbackportal', description: 'Skicka förslag och önskemål',      icon: MessageSquare, color: 'purple', comingSoon: true },
  { key: 'changelog', labelSv: 'Ändringslogg',   description: 'Senaste nyheterna i plattformen',  icon: History,       color: 'gray',   path: '/nyheter' },
  { key: 'chat',       labelSv: 'Chatta',         description: 'Chatta direkt med supporten',      icon: MessageCircle, color: 'green',  comingSoon: true },
  { key: 'facebook',   labelSv: 'Facebook-grupp', description: 'Community för trafikskolor',       icon: Globe,         color: 'blue',   href: 'https://www.facebook.com/', external: true },
  { key: 'teamviewer', labelSv: 'TeamViewer',     description: 'Fjärrsupport vid behov',           icon: Monitor,       color: 'teal',   href: 'https://www.teamviewer.com/', external: true },
  { key: 'phone',      labelSv: 'Kontakt',        description: '08-38 33 30',                      icon: Phone,         color: 'amber',  tel: '+4683833330' },
];

export const RESURSER_ITEMS: SupportItem[] = [
  { key: 'news',    labelSv: 'Nyheter',        description: 'Vad är nytt i plattformen',          icon: Newspaper,  color: 'orange',  path: '/nyheter' },
  { key: 'faq',     labelSv: 'Vanliga frågor', description: 'Svar på vanliga frågor',              icon: HelpCircle, color: 'blue',    comingSoon: true },
  { key: 'gallery', labelSv: 'Bildgalleri',    description: 'Bilder och marknadsföringsmaterial',  icon: ImageIcon,  color: 'pink',    comingSoon: true },
  { key: 'shop',    labelSv: 'Köp online',     description: 'Beställ produkter och tjänster',      icon: Store,      color: 'emerald', comingSoon: true },
];
