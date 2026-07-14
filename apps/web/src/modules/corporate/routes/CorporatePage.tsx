import { Routes, Route } from 'react-router-dom';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { CorporateListPage } from './CorporateListPage.js';
import { CorporateCreatePage } from './CorporateCreatePage.js';
import { CorporateDetailPage } from './CorporateDetailPage.js';

export function CorporatePage() {
  return (
    <SubscriptionGate feature="corporate:customers:manage">
      <Routes>
        <Route index element={<CorporateListPage />} />
        <Route path="new" element={<CorporateCreatePage />} />
        <Route path=":id" element={<CorporateDetailPage />} />
      </Routes>
    </SubscriptionGate>
  );
}
