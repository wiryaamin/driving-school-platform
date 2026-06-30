import type { ComponentType } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import {
  ChartBar, Users, ShoppingCart, Gift,
  BookOpen, Calendar, Truck, FileText, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { GrundrapporterPage }     from './GrundrapporterPage.js';
import { KunderRapportPage }      from './KunderRapportPage.js';
import { EhandelRapportPage }     from './EhandelRapportPage.js';
import { PresentkortRapportPage } from './PresentkortRapportPage.js';
import { BokforingRapportPage }   from './BokforingRapportPage.js';
import { BokningarRapportPage }   from './BokningarRapportPage.js';
import { TransportstyrelsenPage } from './TransportstyrelsenPage.js';
import { FakturaunderlagPage }    from './FakturaunderlagPage.js';
import { IntakterRapportPage }    from './IntakterRapportPage.js';
import { InstruktorROIPage }      from './InstruktorROIPage.js';

// ─── Sub-page map ────────────────────────────────────────────────────────────

const PAGE_MAP: Record<string, ComponentType> = {
  '':                   GrundrapporterPage,
  'kunder':             KunderRapportPage,
  'ehandel':            EhandelRapportPage,
  'presentkort':        PresentkortRapportPage,
  'bokforing':          BokforingRapportPage,
  'bokningar':          BokningarRapportPage,
  'transportstyrelsen': TransportstyrelsenPage,
  'fakturaunderlag':    FakturaunderlagPage,
  'intakter':           IntakterRapportPage,
  'instruktor-roi':     InstruktorROIPage,
};

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: 'grundrapporter',     label: 'Grundrapporter',     path: '/reports',                    icon: ChartBar   },
  { key: 'kunder',             label: 'Kunder',             path: '/reports/kunder',              icon: Users       },
  { key: 'ehandel',            label: 'E-handel',           path: '/reports/ehandel',             icon: ShoppingCart},
  { key: 'presentkort',        label: 'Presentkort',        path: '/reports/presentkort',         icon: Gift        },
  { key: 'bokforing',          label: 'Bokföring',          path: '/reports/bokforing',           icon: BookOpen    },
  { key: 'bokningar',          label: 'Bokningar',          path: '/reports/bokningar',           icon: Calendar    },
  { key: 'transportstyrelsen', label: 'Transportstyrelsen', path: '/reports/transportstyrelsen',  icon: Truck       },
  { key: 'fakturaunderlag',    label: 'Fakturaunderlag',    path: '/reports/fakturaunderlag',     icon: FileText    },
  { key: 'intakter',           label: 'Intäktsanalys',      path: '/reports/intakter',            icon: TrendingUp  },
  { key: 'instruktor-roi',     label: 'Instruktörs-ROI',   path: '/reports/instruktor-roi',      icon: Users       },
];

// ─── RapporterPage ────────────────────────────────────────────────────────────

export function RapporterPage() {
  const { '*': segment = '' } = useParams();
  const Page = PAGE_MAP[segment] ?? GrundrapporterPage;

  return (
    <div className="flex flex-col lg:flex-row -mx-4 md:-mx-5 -mt-4 md:-mt-5">

      {/* ── Mobile: horizontal scrollable tab strip ──────────────────────────── */}
      <div className="lg:hidden border-b border-border bg-background sticky top-14 z-10">
        <div className="flex overflow-x-auto gap-1 px-3 py-2" style={{ scrollbarWidth: 'none' }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.key}
                to={item.path}
                end={item.path === '/reports'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground bg-muted/40 hover:bg-accent/60 hover:text-foreground',
                  )
                }
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* ── Desktop: left sidebar ────────────────────────────────────────────── */}
      <nav className="hidden lg:block w-48 shrink-0 border-r border-border bg-muted/20 py-4 px-2 space-y-0.5 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
        <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
          Rapporter
        </p>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.key}
              to={item.path}
              end={item.path === '/reports'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Content area */}
      <div className="flex-1 min-w-0 p-4 lg:p-6">
        <Page />
      </div>
    </div>
  );
}
