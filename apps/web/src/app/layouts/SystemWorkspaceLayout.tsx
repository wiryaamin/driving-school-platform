import { Megaphone } from 'lucide-react';
import { WorkspaceTabsLayout, type WorkspaceTab } from './WorkspaceTabsLayout.js';

const TABS: WorkspaceTab[] = [
  { label: 'Nyheter',          path: '/nyheter' },
  { label: 'Körkortsfrågor',   path: '/teorifragor' },
  { label: 'Loggar',           path: '/logs' },
];

export function SystemWorkspaceLayout() {
  return <WorkspaceTabsLayout tabs={TABS} title="System" titleIcon={Megaphone} />;
}
