import { Routes, Route } from 'react-router-dom';
import { PackageListPage }   from './PackageListPage.js';
import { PackageDetailPage } from './PackageDetailPage.js';

export function PackagePage() {
  return (
    <Routes>
      <Route index element={<PackageListPage />} />
      <Route path=":id" element={<PackageDetailPage />} />
    </Routes>
  );
}
