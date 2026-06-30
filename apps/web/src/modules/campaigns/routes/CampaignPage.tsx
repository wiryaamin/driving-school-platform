import { Routes, Route } from 'react-router-dom';
import { CampaignListPage }   from './CampaignListPage.js';
import { CampaignDetailPage } from './CampaignDetailPage.js';

export function CampaignPage() {
  return (
    <Routes>
      <Route index element={<CampaignListPage />} />
      <Route path=":id" element={<CampaignDetailPage />} />
    </Routes>
  );
}
