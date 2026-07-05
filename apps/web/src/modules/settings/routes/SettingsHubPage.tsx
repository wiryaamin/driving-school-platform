import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Building2, Scale, MapPin, Tag, SlidersHorizontal, Briefcase,
  Map, Clock, FolderOpen, CalendarDays, Calendar, Sun,
  UserCog, Tags, Filter, HeartHandshake, Landmark, List,
  ShoppingBag, Gift, BookOpen, ShoppingCart, Package,
  GraduationCap, ClipboardList, MessageSquare, Mail,
  MessageCircle, Globe, Palette, TrendingUp, FileText,
  ClipboardCheck, Star, Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { useSession } from '@shared/hooks/useSession.js';

type CardColor =
  | 'orange' | 'blue' | 'green' | 'purple' | 'red'
  | 'teal'   | 'pink' | 'amber' | 'gray'   | 'emerald' | 'violet';

interface SettingCard {
  label:       string;
  description: string;
  icon:        LucideIcon;
  color:       CardColor;
  path:        string;
  beta?:       boolean;
}

interface SettingSection {
  title: string;
  cards: SettingCard[];
}

const COLOR_CLASSES: Record<CardColor, string> = {
  orange:  'bg-orange-100  text-orange-600  dark:bg-orange-900/30  dark:text-orange-400',
  blue:    'bg-blue-100    text-blue-600    dark:bg-blue-900/30    dark:text-blue-400',
  green:   'bg-green-100   text-green-700   dark:bg-green-900/30   dark:text-green-400',
  purple:  'bg-purple-100  text-purple-600  dark:bg-purple-900/30  dark:text-purple-400',
  red:     'bg-red-100     text-red-600     dark:bg-red-900/30     dark:text-red-400',
  teal:    'bg-teal-100    text-teal-600    dark:bg-teal-900/30    dark:text-teal-400',
  pink:    'bg-pink-100    text-pink-600    dark:bg-pink-900/30    dark:text-pink-400',
  amber:   'bg-amber-100   text-amber-700   dark:bg-amber-900/30   dark:text-amber-400',
  gray:    'bg-gray-100    text-gray-600    dark:bg-gray-800       dark:text-gray-400',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  violet:  'bg-violet-100  text-violet-600  dark:bg-violet-900/30  dark:text-violet-400',
};

const SECTIONS: SettingSection[] = [
  {
    title: 'Företag',
    cards: [
      { label: 'Företagsuppgifter', description: 'Grundläggande företagsinformation', icon: Building2, color: 'amber', path: '/settings/company' },
      { label: 'Juridik', description: 'Juridiska dokument och användarvillkor', icon: Scale, color: 'blue', path: '/settings/legal' },
    ],
  },
  {
    title: 'Platser',
    cards: [
      { label: 'Platser', description: 'Hantera verksamhetens platser', icon: MapPin, color: 'green', path: '/settings/locations' },
    ],
  },
  {
    title: 'Elevbokning',
    cards: [
      { label: 'Tjänster', description: 'Hantera vilka tjänster som visas i elevbokningen', icon: Tag, color: 'blue', path: '/settings/student-booking/services' },
      { label: 'Inställningar', description: 'Regler för elevbokning och elevavbokning', icon: SlidersHorizontal, color: 'orange', path: '/settings/student-booking/config' },
    ],
  },
  {
    title: 'Resurser',
    cards: [
      { label: 'Resurser', description: 'Hantera och andra utbildningsresurser', icon: Briefcase, color: 'blue', path: '/settings/resources' },
      { label: 'Lokaler/Banor', description: 'Lokaler och övningsbanor', icon: Map, color: 'orange', path: '/settings/venues' },
    ],
  },
  {
    title: 'Schema',
    cards: [
      { label: 'Tidmallar',          description: 'Återanvändbara mallar för tidbokning',  icon: Clock,           color: 'red',    path: '/settings/schema/time-templates'       },
      { label: 'Tidmallsgrupper',    description: 'Gruppera och organisera tidmallar',      icon: FolderOpen,      color: 'orange', path: '/settings/schema/time-template-groups' },
      { label: 'Schemamallar',       description: 'Mallar för återkommande scheman',        icon: CalendarDays,    color: 'orange', path: '/settings/schema/templates'            },
      { label: 'Bokningar',          description: 'Inställningar för bokningar',            icon: Calendar,        color: 'blue',   path: '/settings/schema/bookings'             },
      { label: 'Helgdagar',          description: 'Helgdagar och stängda dagar',            icon: Sun,             color: 'amber',  path: '/settings/schema/holidays'             },
      { label: 'Schemainställningar', description: 'Inställningar för schemat',             icon: SlidersHorizontal, color: 'orange', path: '/settings/schema/config'             },
    ],
  },
  {
    title: 'Kunder',
    cards: [
      { label: 'Kundinstallningar', description: 'Inställningar för kunden', icon: UserCog, color: 'red', path: '/settings/customers/config' },
      { label: 'Taggar', description: 'Taggar för att kategorisera kunder', icon: Tags, color: 'orange', path: '/settings/customers/tags' },
      { label: 'Segment', description: 'Dynamiska segment baserade på kriterier', icon: Filter, color: 'purple', path: '/settings/customers/segments' },
      { label: 'Värva en vän', description: 'Belöna kunder som rekommenderar er', icon: HeartHandshake, color: 'pink', path: '/settings/customers/referral' },
    ],
  },
  {
    title: 'Ekonomi',
    cards: [
      { label: 'Baskonton', description: 'Ekonomiska konton', icon: Landmark, color: 'emerald', path: '/settings/finance/accounts' },
      { label: 'Kontoplan', description: 'Tillgängliga bokföringskonton', icon: List, color: 'green', path: '/settings/finance/chart' },
      { label: 'Kassa', description: 'Digital kassalösning', icon: ShoppingBag, color: 'teal', path: '/settings/finance/kassa' },
      { label: 'Presentkort', description: 'Belöna kunder med presentkort', icon: Gift, color: 'green', path: '/settings/finance/gift-cards' },
      { label: 'Lektionstyper', description: 'Olika lektionstyper', icon: BookOpen, color: 'orange', path: '/settings/finance/lesson-types' },
      { label: 'Artiklar', description: 'Enkeldra artiklar för försäljning', icon: ShoppingCart, color: 'green', path: '/settings/finance/articles' },
      { label: 'Produkter', description: 'Paket av artiklar och bokningsbara tillfällen', icon: Package, color: 'orange', path: '/settings/finance/products' },
    ],
  },
  {
    title: 'Utbildning',
    cards: [
      { label: 'Utbildningsbehörigheter', description: 'Behörigheter som tillhandahålls', icon: GraduationCap, color: 'purple', path: '/settings/education/licenses' },
      { label: 'Undervisningsplan', description: 'Se, redigera och skapa nya', icon: ClipboardList, color: 'red', path: '/settings/education/curriculum' },
    ],
  },
  {
    title: 'Kommunikation',
    cards: [
      { label: 'Inställningar', description: 'SMS- och e-postinställningar', icon: MessageSquare, color: 'blue', path: '/settings/communication/config' },
      { label: 'Mallar för meddelanden', description: 'Återanvändbara meddelandemallar', icon: Mail, color: 'blue', path: '/settings/communication/templates' },
      { label: 'Gemensamma fraser', description: 'Fraser som visas för alla lärare', icon: MessageCircle, color: 'blue', path: '/settings/communication/phrases' },
      { label: 'E-postmallar', description: 'Kräver marknadsföringstillägget', icon: Mail, color: 'blue', path: '/settings/communication/email-templates', beta: true },
    ],
  },
  {
    title: 'Teoricentralen',
    cards: [
      { label: 'Teoricentralen', description: 'Inställningar för Teoricentralen', icon: GraduationCap, color: 'blue', path: '/settings/theory-center' },
    ],
  },
  {
    title: 'Webbplats',
    cards: [
      { label: 'Allmänt', description: 'Hantera din webbplats', icon: Globe, color: 'blue', path: '/settings/website/general' },
      { label: 'Varumärke', description: 'Logotyp, färger och varumärkesprofil', icon: Palette, color: 'orange', path: '/settings/website/brand' },
    ],
  },
  {
    title: 'Tillägg',
    cards: [
      { label: 'Marknadsföring', description: 'Aktivera Marknadsföring', icon: TrendingUp, color: 'green', path: '/settings/addons/marketing', beta: true },
      { label: 'Digitala avtal', description: 'Aktivera Digitala avtal', icon: FileText, color: 'orange', path: '/settings/addons/contracts' },
      { label: 'Enkäter', description: 'Aktivera Enkäter', icon: ClipboardCheck, color: 'orange', path: '/settings/addons/surveys' },
      { label: 'Skillster', description: 'Aktivera Skillster', icon: Star, color: 'amber', path: '/settings/addons/skillster' },
    ],
  },
  {
    title: 'System',
    cards: [
      { label: 'Systeminställningar', description: 'Inställningar för systemet och personal', icon: Monitor, color: 'gray', path: '/settings/system' },
    ],
  },
];

export function SettingsHubPage() {
  const { organization } = useSession();

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <span className="text-sm text-muted-foreground">Inställningar</span>
        <button type="button" className="text-xs text-primary hover:underline focus:outline-none">
          Ge feedback
        </button>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {section.cards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.path}
                  to={card.path}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-xl border border-border bg-card',
                    'hover:border-primary/30 hover:shadow-sm hover:bg-accent/10',
                    'transition-all duration-150'
                  )}
                >
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', COLOR_CLASSES[card.color])}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-card-foreground leading-tight">{card.label}</span>
                      {card.beta === true && (
                        <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary leading-none shrink-0">
                          Beta
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">{card.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <footer className="pt-6 border-t border-border/50 text-center text-[11px] text-muted-foreground/50 space-y-1">
        {organization?.name && <p>Affärssystem för {organization.name}</p>}
        <p>© {new Date().getFullYear()} Alla rättigheter förbehållna.</p>
      </footer>
    </div>
  );
}
