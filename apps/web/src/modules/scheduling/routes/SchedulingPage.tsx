import { Routes, Route } from 'react-router-dom';
import { SchedulingCalendarPage } from './SchedulingCalendarPage.js';
import { MySchedulePage } from './MySchedulePage.js';
import { BookingListPage } from './BookingListPage.js';
import { BokningarPage } from './BokningarPage.js';
import { WaitlistPage } from './WaitlistPage.js';
import { TrafikPlatsPage } from './TrafikPlatsPage.js';

export function SchedulingPage() {
  return (
    <Routes>
      <Route index element={<SchedulingCalendarPage />} />
      <Route path="mine" element={<MySchedulePage />} />
      <Route path="list" element={<BookingListPage />} />
      <Route path="bokningar" element={<BokningarPage />} />
      <Route path="waitlist" element={<WaitlistPage />} />
      <Route path="planner" element={<TrafikPlatsPage />} />
    </Routes>
  );
}
