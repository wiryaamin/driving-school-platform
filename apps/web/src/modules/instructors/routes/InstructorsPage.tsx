import { Routes, Route } from 'react-router-dom';
import { InstructorListPage } from './InstructorListPage.js';
import { InstructorDetailPage } from './InstructorDetailPage.js';

export function InstructorsPage() {
  return (
    <Routes>
      <Route index element={<InstructorListPage />} />
      <Route path=":id" element={<InstructorDetailPage />} />
    </Routes>
  );
}
