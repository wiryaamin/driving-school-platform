import { LifeBuoy } from 'lucide-react';
import { WorkspaceTabsLayout, type WorkspaceTab } from './WorkspaceTabsLayout.js';

// Ported from the former TopBar header dropdown (HelpSupportMenu) into a
// permanent sidebar workspace — same functions, same external links, same
// coming-soon placeholders, just discoverable without opening a popover.
// See modules/support/lib/supportItems.ts for the full function inventory.
const TABS: WorkspaceTab[] = [
  { label: 'Hjälp & Support', path: '/hjalp-support', exact: true },
  { label: 'Resurser',        path: '/hjalp-support/resurser' },
];

export function HjalpSupportWorkspaceLayout() {
  return <WorkspaceTabsLayout tabs={TABS} title="Hjälp & Support" titleIcon={LifeBuoy} />;
}
