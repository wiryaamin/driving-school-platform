import { Routes, Route } from 'react-router-dom';
import { ChartBar } from 'lucide-react';
import { WorkspaceTabsLayout, type WorkspaceTab } from '@app/layouts/WorkspaceTabsLayout.js';
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

// ─── Nav items ────────────────────────────────────────────────────────────────
//
// Mirrors SchedulingPage.tsx's own structure exactly (<Routes><Route
// element={<Workspace.../>}><Route index .../>...) so Rapporter renders
// with the same tab bar + <Outlet/> pattern as every other workspace,
// instead of its previous bespoke sidebar-nav + segment-lookup mechanism.

const TABS: WorkspaceTab[] = [
  { label: 'Grundrapporter',     path: '/reports',                    exact: true },
  { label: 'Kunder',             path: '/reports/kunder' },
  { label: 'E-handel',           path: '/reports/ehandel' },
  { label: 'Presentkort',        path: '/reports/presentkort' },
  { label: 'Bokföring',          path: '/reports/bokforing' },
  { label: 'Bokningar',          path: '/reports/bokningar' },
  { label: 'Transportstyrelsen', path: '/reports/transportstyrelsen' },
  { label: 'Fakturaunderlag',    path: '/reports/fakturaunderlag' },
  { label: 'Intäktsanalys',      path: '/reports/intakter' },
  { label: 'Instruktörs-ROI',    path: '/reports/instruktor-roi' },
  // Insikter (/insights) is a separate top-level route (not nested under
  // /reports/*) — navigating there leaves this workspace, same as
  // Klasslista/LärarApp do from within Schema/Personal & Resurser.
  { label: 'Insikter',           path: '/insights' },
];

export function RapporterPage() {
  return (
    <Routes>
      <Route element={<WorkspaceTabsLayout tabs={TABS} title="Rapporter" titleIcon={ChartBar} nested />}>
        <Route index                     element={<GrundrapporterPage />} />
        <Route path="kunder"             element={<KunderRapportPage />} />
        <Route path="ehandel"            element={<EhandelRapportPage />} />
        <Route path="presentkort"        element={<PresentkortRapportPage />} />
        <Route path="bokforing"          element={<BokforingRapportPage />} />
        <Route path="bokningar"          element={<BokningarRapportPage />} />
        <Route path="transportstyrelsen" element={<TransportstyrelsenPage />} />
        <Route path="fakturaunderlag"    element={<FakturaunderlagPage />} />
        <Route path="intakter"           element={<IntakterRapportPage />} />
        <Route path="instruktor-roi"     element={<InstruktorROIPage />} />
      </Route>
    </Routes>
  );
}
