import type { ComponentType } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import {
  BarChart2, Users, ShoppingCart, Gift,
  BookOpen, Calendar, Truck, FileText,
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
};

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: 'grundrapporter',     label: 'Grundrapporter',     path: '/reports',                  icon: BarChart2 },
  { key: 'kunder',             label: 'Kunder',             path: '/reports/kunder',            icon: Users },
  { key: 'ehandel',            label: 'E-handel',           path: '/reports/ehandel',           icon: ShoppingCart },
  { key: 'presentkort',        label: 'Presentkort',        path: '/reports/presentkort',       icon: Gift },
  { key: 'bokforing',          label: 'Bokföring',          path: '/reports/bokforing',         icon: BookOpen },
  { key: 'bokningar',          label: 'Bokningar',          path: '/reports/bokningar',         icon: Calendar },
  { key: 'transportstyrelsen', label: 'Transportstyrelsen', path: '/reports/transportstyrelsen', icon: Truck },
  { key: 'fakturaunderlag',    label: 'Fakturaunderlag',    path: '/reports/fakturaunderlag',   icon: FileText },
];

// ─── RapporterPage ────────────────────────────────────────────────────────────

export function RapporterPage() {
  const { '*': segment = '' } = useParams();
  const Page = PAGE_MAP[segment] ?? GrundrapporterPage;

  return (
    <div className="flex -mx-4 md:-mx-5 -mt-4 md:-mt-5">

      {/* Internal left nav — sticky so it stays visible while the page scrolls */}
      <nav className="w-48 shrink-0 border-r border-border bg-muted/20 py-4 px-2 space-y-0.5 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
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

      {/* Content area — no overflow-auto; AppShell's main handles page scrolling */}
      <div className="flex-1 min-w-0 p-6">
        <Page />
      </div>
    </div>
  );
}
