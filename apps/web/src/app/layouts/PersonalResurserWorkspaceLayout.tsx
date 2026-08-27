import type { Permission } from '@core/rbac/permissions.js';
import { WorkspaceTabsLayout, type WorkspaceTab } from './WorkspaceTabsLayout.js';

// "LärarApp" (/instructor-app) is its own separate top-level app shell
// (InstructorAppLayout), not nested inside the tenant dashboard — same as
// Scheduling's Kassa/Ny kund quick-actions, this tab simply navigates there
// and the workspace tab bar won't follow (there is nothing to nest it into).
const TABS: WorkspaceTab[] = [
  { label: 'Personal',           path: '/staff',          permission: 'instructors:instructor:read' as Permission },
  { label: 'LärarApp',           path: '/instructor-app' },
  { label: 'Fordon & Platser',   path: '/resources' },
  { label: 'Myndighetsärenden',  path: '/regulatory',     permission: 'regulatory:workflow:read' as Permission },
];

export function PersonalResurserWorkspaceLayout() {
  return <WorkspaceTabsLayout tabs={TABS} title="Personal & Resurser" />;
}
