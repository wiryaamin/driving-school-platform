import { Routes, Route } from 'react-router-dom';
import { StudentDashboardPage } from './StudentDashboardPage.js';
import { StudentListPage }      from './StudentListPage.js';
import { StudentDetailPage }    from './StudentDetailPage.js';

/**
 * StudentsPage — route entry for the /students/* tree.
 *
 *   /students        → StudentDashboardPage (workspace landing with KPI overview)
 *   /students/list   → StudentListPage      (full list, search, filter)
 *   /students/:id    → StudentDetailPage    (individual student detail)
 *
 * Note: /students/inactive is registered above this wildcard in routes.tsx
 * and is handled directly by InaktivaElevPage.
 */
export function StudentsPage() {
  return (
    <Routes>
      <Route index       element={<StudentDashboardPage />} />
      <Route path="list" element={<StudentListPage />}      />
      <Route path=":id"  element={<StudentDetailPage />}    />
    </Routes>
  );
}
