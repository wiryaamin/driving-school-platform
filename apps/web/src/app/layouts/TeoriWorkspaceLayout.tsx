import { GraduationCap } from 'lucide-react';
import { WorkspaceTabsLayout, type WorkspaceTab } from './WorkspaceTabsLayout.js';

// Every tab here is an existing, unmodified page — Teori is a navigation
// grouping only, not a new implementation. Functional ownership stays
// with the module that already owns each page:
//
// - Trafikfrågor: owned by this workspace itself (the one function that
//   is genuinely theory-only and not shared with another domain).
// - Teorilektioner (Kursöversikt): owned by Schema/scheduling. Shows
//   risk1/risk2/intensive/group_theory group courses together — it is
//   NOT a theory-only page, and its own on-page heading still reads
//   "Kursöversikt" so a visitor immediately sees its real scope.
// - Teoripaket: owned by Ekonomi. Navigating here leaves this workspace
//   for Ekonomi's own tab bar (same pattern as Schema's Kassa/Ny kund
//   or Personal & Resurser's LärarApp) — /packages has no theory-only
//   filter to link to, so this opens the same general Paket page every
//   other Ekonomi user sees.
// - Teorirapporter (Kunder report): owned by System/Rapporter. Same
//   navigate-away pattern — /reports/kunder is a shared report page
//   that happens to include two theory-related report cards ("Kunder
//   per teorimaterial", "Körprov/Teoriprov") among many others.
//
// Teoriprogress (permit_stage) was evaluated and deliberately excluded:
// unlike the three above, the destination page (Elever's student list)
// shows nothing theory-specific without a filter that doesn't exist —
// the tab would just be a second, unlabelled entry point into Elever.
const TABS: WorkspaceTab[] = [
  { label: 'Trafikfrågor',   path: '/teorifragor' },
  { label: 'Teorilektioner', path: '/scheduling/kurser' },
  { label: 'Teoripaket',     path: '/packages' },
  { label: 'Teorirapporter', path: '/reports/kunder' },
];

export function TeoriWorkspaceLayout() {
  return <WorkspaceTabsLayout tabs={TABS} title="Teori" titleIcon={GraduationCap} />;
}
