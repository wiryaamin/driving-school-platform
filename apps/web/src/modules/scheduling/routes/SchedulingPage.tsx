import { Routes, Route } from 'react-router-dom';
import { TrafikPlatsPage } from './TrafikPlatsPage.js';
import { SchedulingGenerationPage } from './SchedulingGenerationPage.js';
import { SlotTemplatesPage } from './SlotTemplatesPage.js';
import { ClosuresPage } from './ClosuresPage.js';
import { SchedulingStatistikPage } from './SchedulingStatistikPage.js';
import { InstructorIcalPage } from './InstructorIcalPage.js';

// The Schema workspace's tab-bar routes (Mitt schema/Bokningsschema/
// Bokningslista/Bevakningar/Väntelista/Passöversikt/Klasslista) are
// registered directly in app/router/routes.tsx, wrapped by
// SchedulingWorkspaceLayout there — see the comment at that route entry
// for why (Klasslista lives outside the /scheduling/* prefix, so the
// wrapping layout needs to sit above both prefixes as a true sibling).
// Kursöversikt (kurser) moved the same way, to Teori's workspace — it
// never had a tab-bar home here (it wasn't wrapped by
// SchedulingWorkspaceLayout, just a bare unwrapped route), so relocating
// it doesn't remove anything from Schema. This component now only owns
// the remaining, unwrapped admin/settings sub-pages.
export function SchedulingPage() {
  return (
    <Routes>
      <Route path="planner" element={<TrafikPlatsPage />} />
      <Route path="generation" element={<SchedulingGenerationPage />} />
      <Route path="mallar" element={<SlotTemplatesPage />} />
      <Route path="stangningar" element={<ClosuresPage />} />
      <Route path="statistik" element={<SchedulingStatistikPage />} />
      <Route path="ical" element={<InstructorIcalPage />} />
    </Routes>
  );
}
