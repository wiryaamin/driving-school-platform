import { Routes, Route } from 'react-router-dom';
import { StudentListPage } from './StudentListPage.js';
import { StudentDetailPage } from './StudentDetailPage.js';

/**
 * StudentsPage — route entry for the /students/* tree.
 * React Router's nested <Routes> handles sub-path dispatch.
 */
export function StudentsPage() {
  return (
    <Routes>
      <Route index element={<StudentListPage />} />
      <Route path=":id" element={<StudentDetailPage />} />
    </Routes>
  );
}
