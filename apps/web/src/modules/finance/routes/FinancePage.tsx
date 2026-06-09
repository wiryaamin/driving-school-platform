import { Routes, Route, Navigate } from 'react-router-dom';
import { InvoiceListPage } from './InvoiceListPage.js';
import { InvoiceDetailPage } from './InvoiceDetailPage.js';
import { PaymentListPage } from './PaymentListPage.js';

export function FinancePage() {
  return (
    <Routes>
      <Route index element={<Navigate to="invoices" replace />} />
      <Route path="invoices"     element={<InvoiceListPage />} />
      <Route path="invoices/:id" element={<InvoiceDetailPage />} />
      <Route path="payments"     element={<PaymentListPage />} />
    </Routes>
  );
}
