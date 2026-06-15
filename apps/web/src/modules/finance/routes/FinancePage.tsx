import { Routes, Route, Navigate } from 'react-router-dom';
import { InvoiceListPage } from './InvoiceListPage.js';
import { InvoiceDetailPage } from './InvoiceDetailPage.js';
import { PaymentListPage } from './PaymentListPage.js';
import { KassaPage } from './KassaPage.js';
import { BetalningsbegäranPage } from './BetalningsbegäranPage.js';
import { OrdrarPage } from './OrdrarPage.js';
import { PresentkortPage } from './PresentkortPage.js';
import { ImporteraPresentkortPage } from './ImporteraPresentkortPage.js';
import { KundekonomíPage } from './KundekonomíPage.js';

export function FinancePage() {
  return (
    <Routes>
      <Route index element={<Navigate to="invoices" replace />} />
      <Route path="invoices"     element={<InvoiceListPage />} />
      <Route path="invoices/:id" element={<InvoiceDetailPage />} />
      <Route path="payments"     element={<PaymentListPage />} />
      <Route path="cash"         element={<KassaPage />} />
      <Route path="requests"     element={<BetalningsbegäranPage />} />
      <Route path="orders"            element={<OrdrarPage />} />
      <Route path="ecommerce"         element={<OrdrarPage />} />
      <Route path="gift-cards"        element={<PresentkortPage />} />
      <Route path="gift-cards/import" element={<ImporteraPresentkortPage />} />
      <Route path="kundekonomi"       element={<KundekonomíPage />} />
    </Routes>
  );
}
