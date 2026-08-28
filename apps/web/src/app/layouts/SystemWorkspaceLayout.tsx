import { Megaphone } from 'lucide-react';
import { WorkspaceTabsLayout, type WorkspaceTab } from './WorkspaceTabsLayout.js';

const TABS: WorkspaceTab[] = [
  { label: 'Nyheter',          path: '/nyheter' },
  { label: 'Körkortsfrågor',   path: '/teorifragor' },
  // Insikter (/insights) is a separate top-level route (not nested under
  // /reports/*) — navigating there leaves this workspace, same as
  // Klasslista does from within Schema when it navigates to a route
  // outside its own layout. Kept reachable via Rapporter's own nav.
  { label: 'Rapporter',        path: '/reports', matchPrefixes: ['/reports', '/insights'] },
  { label: 'Loggar',           path: '/logs' },
];

export function SystemWorkspaceLayout() {
  return <WorkspaceTabsLayout tabs={TABS} title="System" titleIcon={Megaphone} />;
}
