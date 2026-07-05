import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Building2, MapPin, Key, Briefcase, Calendar, Users,
  Wallet, GraduationCap, MessageSquare, Globe, Layers,
  BookOpen, Settings, ChevronRight, UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';

// ─── Nav structure ────────────────────────────────────────────────────────────

interface NavChild {
  key:     string;
  label:   string;
  segment: string;
}

interface NavSection {
  key:       string;
  label:     string;
  icon:      LucideIcon;
  segment?:  string;       // direct-link sections
  children?: NavChild[];
}

const SETTINGS_NAV: NavSection[] = [
  {
    key: 'foretag', label: 'Företag', icon: Building2,
    children: [
      { key: 'company', label: 'Företagsuppgifter', segment: 'company' },
      { key: 'legal',   label: 'Juridik',           segment: 'legal'   },
    ],
  },
  { key: 'platser',    label: 'Platser',           icon: MapPin,       segment: 'locations' },
  { key: 'anvandare', label: 'Användare',         icon: UserCog,      segment: 'users'     },
  {
    key: 'elevbokning', label: 'Elevbokning', icon: Key,
    children: [
      { key: 'tjanster', label: 'Tjänster',      segment: 'student-booking/services' },
      { key: 'inst',     label: 'Inställningar', segment: 'student-booking/config'   },
    ],
  },
  {
    key: 'resurser', label: 'Resurser', icon: Briefcase,
    children: [
      { key: 'resurser-list', label: 'Resurser',      segment: 'resources' },
      { key: 'lokaler-banor', label: 'Lokaler/Banor', segment: 'venues'    },
    ],
  },
  {
    key: 'schema', label: 'Schema', icon: Calendar,
    children: [
      { key: 'tidmallar',          label: 'Tidmallar',          segment: 'schema/time-templates'       },
      { key: 'tidmallsgrupper',    label: 'Tidmallsgrupper',    segment: 'schema/time-template-groups' },
      { key: 'schemamallar',       label: 'Schemamallar',       segment: 'schema/templates'            },
      { key: 'schema-bookings',    label: 'Bokningar',          segment: 'schema/bookings'             },
      { key: 'helgdagar',          label: 'Helgdagar',          segment: 'schema/holidays'             },
      { key: 'schemainst',         label: 'Schemainställningar', segment: 'schema/config'              },
    ],
  },
  {
    key: 'kunder', label: 'Kunder', icon: Users,
    children: [
      { key: 'kundinst',   label: 'Kundinställningar', segment: 'customers/config'   },
      { key: 'taggar',     label: 'Taggar',            segment: 'customers/tags'     },
      { key: 'segment',    label: 'Segment',           segment: 'customers/segments' },
      { key: 'varva',      label: 'Värva en vän',      segment: 'customers/referral' },
      { key: 'leads',      label: 'Leads',             segment: 'customers/leads'    },
    ],
  },
  {
    key: 'ekonomi', label: 'Ekonomi', icon: Wallet,
    children: [
      { key: 'baskonton',      label: 'Baskonton',      segment: 'finance/accounts'      },
      { key: 'kontoplan',      label: 'Kontoplan',      segment: 'finance/chart'         },
      { key: 'kassa',          label: 'Kassa',          segment: 'finance/kassa'         },
      { key: 'presentkort-fi', label: 'Presentkort',    segment: 'finance/gift-cards'    },
      { key: 'lektionstyper',  label: 'Lektionstyper',  segment: 'finance/lesson-types'  },
      { key: 'artiklar',       label: 'Artiklar',       segment: 'finance/articles'      },
      { key: 'produkter',      label: 'Produkter',      segment: 'finance/products'      },
    ],
  },
  {
    key: 'utbildning', label: 'Utbildning', icon: GraduationCap,
    children: [
      { key: 'utb-behorighet',   label: 'Utbildningsbehörigheter', segment: 'education/licenses'    },
      { key: 'undervisningsplan', label: 'Undervisningsplan',       segment: 'education/curriculum'  },
      { key: 'material',         label: 'Material',                 segment: 'education/materials'   },
    ],
  },
  {
    key: 'kommunikation', label: 'Kommunikation', icon: MessageSquare,
    children: [
      { key: 'komm-config',     label: 'Kommunikation',          segment: 'communication/config'     },
      { key: 'gemensamma',      label: 'Gemensamma fraser',      segment: 'communication/phrases'    },
      { key: 'meddmallar',      label: 'Mallar för meddelanden', segment: 'communication/templates'  },
      { key: 'automationsreg',  label: 'Automationsregler',      segment: 'communication/automation' },
    ],
  },
  {
    key: 'webbplats', label: 'Webbplats', icon: Globe,
    children: [
      { key: 'website-general', label: 'Allmänt',   segment: 'website/general' },
      { key: 'website-brand',   label: 'Varumärke', segment: 'website/brand'   },
    ],
  },
  {
    key: 'tillagg', label: 'Tillägg', icon: Layers,
    children: [
      { key: 'marketing', label: 'Marknadsföring', segment: 'addons/marketing'  },
      { key: 'contracts', label: 'Digitala avtal', segment: 'addons/contracts'  },
      { key: 'surveys',   label: 'Enkäter',        segment: 'addons/surveys'    },
      { key: 'skillster', label: 'Skillster',      segment: 'addons/skillster'  },
    ],
  },
  { key: 'teoricentralen', label: 'Teoricentralen',      icon: BookOpen, segment: 'theory-center' },
  { key: 'systeminst',     label: 'Systeminställningar', icon: Settings, segment: 'system'        },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActiveSectionKey(segment: string): string | null {
  for (const section of SETTINGS_NAV) {
    if (section.children) {
      for (const child of section.children) {
        if (segment === child.segment || segment.startsWith(child.segment + '/')) {
          return section.key;
        }
      }
    } else if (section.segment && (segment === section.segment || segment.startsWith(section.segment + '/'))) {
      return section.key;
    }
  }
  return null;
}

// ─── SettingsSidebar ──────────────────────────────────────────────────────────

export function SettingsSidebar({ segment }: { segment: string }) {
  const location = useLocation();

  const [open, setOpen] = useState<Set<string>>(() => {
    const active = getActiveSectionKey(segment);
    return active ? new Set([active]) : new Set();
  });

  useEffect(() => {
    const active = getActiveSectionKey(segment);
    if (active) {
      setOpen(prev => prev.has(active) ? prev : new Set([...prev, active]));
    }
  }, [segment]);

  function toggle(key: string) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <nav
      aria-label="Inställningar navigation"
      className="w-44 shrink-0 border-r border-border bg-background py-3 space-y-0.5
                 sticky top-[52px] self-start h-[calc(100vh-52px)] overflow-y-auto"
    >
      {SETTINGS_NAV.map(section => {
        const Icon = section.icon;
        const isExpanded = open.has(section.key);

        if (section.children) {
          const hasActiveChild = section.children.some(
            c => segment === c.segment || segment.startsWith(c.segment + '/')
          );
          return (
            <div key={section.key}>
              <button
                type="button"
                onClick={() => toggle(section.key)}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-sm font-medium transition-colors',
                  hasActiveChild
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left truncate">{section.label}</span>
                <ChevronRight
                  className={cn('w-3.5 h-3.5 shrink-0 transition-transform duration-150',
                    isExpanded && 'rotate-90'
                  )}
                />
              </button>

              {isExpanded && (
                <div className="ml-6 mt-0.5 mb-1 space-y-0.5">
                  {section.children.map(child => {
                    const isActive =
                      segment === child.segment ||
                      segment.startsWith(child.segment + '/');
                    return (
                      <Link
                        key={child.key}
                        to={`/settings/${child.segment}`}
                        className={cn(
                          'block px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        // Direct-link section
        const isActive =
          section.segment != null &&
          (segment === section.segment || segment.startsWith(section.segment + '/'));
        void location; // keeps eslint happy for unused import
        return (
          <Link
            key={section.key}
            to={`/settings/${section.segment ?? ''}`}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">{section.label}</span>
            {!isActive && <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-40" />}
          </Link>
        );
      })}
    </nav>
  );
}
