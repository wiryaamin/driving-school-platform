import { GraduationCap } from 'lucide-react';
import { WorkspaceTabsLayout, type WorkspaceTab } from './WorkspaceTabsLayout.js';

// Trafikfrågor is currently the only tenant-dashboard function that is
// genuinely theory-domain-owned (not shared with Schema's lesson-type
// booking, Ekonomi's package sales, or Elever's student record) — see
// the theory implementation audit. No other existing page qualifies as a
// second tab without either duplicating another workspace's function or
// inventing new functionality, so this workspace intentionally has one tab.
const TABS: WorkspaceTab[] = [
  { label: 'Trafikfrågor', path: '/teorifragor' },
];

export function TeoriWorkspaceLayout() {
  return <WorkspaceTabsLayout tabs={TABS} title="Teori" titleIcon={GraduationCap} />;
}
