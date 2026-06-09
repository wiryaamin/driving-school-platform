import { Routes, Route } from 'react-router-dom';
import { SchedulingCalendarPage } from './SchedulingCalendarPage.js';

/**
 * SchedulingPage — route entry for the /scheduling/* tree.
 */
export function SchedulingPage() {
  return (
    <Routes>
      <Route index element={<SchedulingCalendarPage />} />
    </Routes>
  );
}
