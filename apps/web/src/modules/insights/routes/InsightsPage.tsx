import { useState } from 'react';
import { OverviewTab }   from './OverviewTab.js';
import { DemografiTab }  from './DemografiTab.js';
import { ElevtrendTab }  from './ElevtrendTab.js';
import { KpiTab }        from './KpiTab.js';
import { RapporterTab }  from './RapporterTab.js';
import { CohortTab }     from './CohortTab.js';
import { cn } from '@/lib/utils.js';

type InsightsTab = 'overview' | 'demografi' | 'elevtrender' | 'kpi' | 'kohort' | 'rapporter';

const TABS: { key: InsightsTab; label: string }[] = [
  { key: 'overview',    label: 'Översikt'    },
  { key: 'demografi',   label: 'Demografi'   },
  { key: 'elevtrender', label: 'Elevtrender' },
  { key: 'kpi',         label: 'KPI'         },
  { key: 'kohort',      label: 'Kohorter'    },
  { key: 'rapporter',   label: 'Rapporter'   },
];

export function InsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightsTab>('overview');
  const current = TABS.find((t) => t.key === activeTab);

  return (
    <div className="max-w-screen-xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between pb-3">
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Insikter</span>
          {activeTab !== 'overview' && (
            <>
              <span className="text-muted-foreground/50">/</span>
              <span className="font-medium text-foreground">{current?.label ?? ''}</span>
            </>
          )}
        </nav>
        <button className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Tab bar */}
      <div className="flex items-end border-b border-border mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview'    && <OverviewTab   />}
      {activeTab === 'demografi'   && <DemografiTab  />}
      {activeTab === 'elevtrender' && <ElevtrendTab  />}
      {activeTab === 'kpi'         && <KpiTab        />}
      {activeTab === 'kohort'      && <CohortTab     />}
      {activeTab === 'rapporter'   && <RapporterTab  />}
    </div>
  );
}
