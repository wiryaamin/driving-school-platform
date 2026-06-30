import { Routes, Route } from 'react-router-dom';
import { SchedulingCalendarPage } from './SchedulingCalendarPage.js';
import { MySchedulePage } from './MySchedulePage.js';
import { BookingListPage } from './BookingListPage.js';
import { BokningarPage } from './BokningarPage.js';
import { WaitlistPage } from './WaitlistPage.js';
import { TrafikPlatsPage } from './TrafikPlatsPage.js';
import { SchedulingGenerationPage } from './SchedulingGenerationPage.js';
import { SlotTemplatesPage } from './SlotTemplatesPage.js';
import { SchedulingStatistikPage } from './SchedulingStatistikPage.js';
import { KursoverSiktPage } from './KursoverSiktPage.js';
import { InstructorIcalPage } from './InstructorIcalPage.js';

export function SchedulingPage() {
  return (
    <Routes>
      <Route index element={<SchedulingCalendarPage />} />
      <Route path="mine" element={<MySchedulePage />} />
      <Route path="list" element={<BookingListPage />} />
      <Route path="bokningar" element={<BokningarPage />} />
      <Route path="waitlist" element={<WaitlistPage />} />
      <Route path="planner" element={<TrafikPlatsPage />} />
      <Route path="generation" element={<SchedulingGenerationPage />} />
      <Route path="mallar" element={<SlotTemplatesPage />} />
      <Route path="statistik" element={<SchedulingStatistikPage />} />
      <Route path="kurser" element={<KursoverSiktPage />} />
      <Route path="ical" element={<InstructorIcalPage />} />
    </Routes>
  );
}
