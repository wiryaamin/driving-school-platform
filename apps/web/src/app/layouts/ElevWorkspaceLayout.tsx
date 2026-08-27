import { Users } from 'lucide-react';
import type { Permission } from '@core/rbac/permissions.js';
import { WorkspaceTabsLayout, type WorkspaceTab } from './WorkspaceTabsLayout.js';

const TABS: WorkspaceTab[] = [
  { label: 'Elever',          path: '/students',      permission: 'students:student:read' as Permission },
  { label: 'Företagselever',  path: '/corporate' },
  { label: 'Kommunikation',   path: '/communication', matchPrefixes: ['/communication', '/kommunikation'] },
  { label: 'Dokumentarkiv',   path: '/documents',     permission: 'documents:document:read' as Permission },
];

// Displayed page title is "Kunder" — the tab itself stays "Elever" per the
// approved workspace tab naming, this only changes the workspace heading.
export function ElevWorkspaceLayout() {
  return <WorkspaceTabsLayout tabs={TABS} title="Kunder" titleIcon={Users} />;
}
