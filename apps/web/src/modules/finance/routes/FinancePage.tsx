import { Routes, Route, Navigate } from 'react-router-dom';
import { FinanceOverviewPage } from './FinanceOverviewPage.js';
import { InvoiceListPage } from './InvoiceListPage.js';
import { InvoiceDetailPage } from './InvoiceDetailPage.js';
import { PaymentListPage } from './PaymentListPage.js';
import { KassaPage } from './KassaPage.js';
import { BetalningsbegäranPage } from './BetalningsbegäranPage.js';
import { OrdrarPage } from './OrdrarPage.js';
import { PresentkortPage } from './PresentkortPage.js';
import { ImporteraPresentkortPage } from './ImporteraPresentkortPage.js';
import { KundekonomíPage } from './KundekonomíPage.js';
import { FortnoxPage } from './FortnoxPage.js';
import { FortnoxCallbackPage } from './FortnoxCallbackPage.js';
import { BankReconciliationPage } from './BankReconciliationPage.js';
import { PayrollPage } from './PayrollPage.js';
import { RefundsPage } from './RefundsPage.js';
import { DiscountsPage } from './DiscountsPage.js';
import { FinancialClosePage } from './FinancialClosePage.js';
import { DunningPage } from './DunningPage.js';
import { FixedAssetsPage } from './FixedAssetsPage.js';
import { MomsperioderPage } from './MomsperioderPage.js';
import { JournalbokenPage } from './JournalbokenPage.js';
import { PeriodiseringarPage } from './PeriodiseringarPage.js';
import { SwedishSettingsPage } from './SwedishSettingsPage.js';
import { PackageCatalogPage } from './PackageCatalogPage.js';
import { RegulatoryExportsPage } from './RegulatoryExportsPage.js';
import { FinancialReportsPage } from './FinancialReportsPage.js';
import { SIE4ExportsPage } from './SIE4ExportsPage.js';
import { WalletAdminPage } from './WalletAdminPage.js';
import { LedgerReplayPage } from './LedgerReplayPage.js';

export function FinancePage() {
  return (
    <Routes>
      <Route index element={<FinanceOverviewPage />} />
      <Route path="invoices"           element={<InvoiceListPage />} />
      <Route path="invoices/:id"       element={<InvoiceDetailPage />} />
      <Route path="payments"           element={<PaymentListPage />} />
      <Route path="cash"               element={<KassaPage />} />
      <Route path="requests"           element={<BetalningsbegäranPage />} />
      <Route path="orders"             element={<OrdrarPage />} />
      <Route path="ecommerce"          element={<Navigate to="../orders" replace />} />
      <Route path="gift-cards"         element={<PresentkortPage />} />
      <Route path="gift-cards/import"  element={<ImporteraPresentkortPage />} />
      <Route path="kundekonomi"        element={<KundekonomíPage />} />
      <Route path="fortnox"             element={<FortnoxPage />} />
      <Route path="fortnox/callback"   element={<FortnoxCallbackPage />} />
      <Route path="reconciliation"     element={<BankReconciliationPage />} />
      <Route path="payroll"            element={<PayrollPage />} />
      <Route path="refunds"            element={<RefundsPage />} />
      <Route path="discounts"          element={<DiscountsPage />} />
      <Route path="close"              element={<FinancialClosePage />} />
      <Route path="dunning"            element={<DunningPage />} />
      <Route path="assets"             element={<FixedAssetsPage />} />
      <Route path="vat"                element={<MomsperioderPage />} />
      <Route path="ledger"             element={<JournalbokenPage />} />
      <Route path="accruals"           element={<PeriodiseringarPage />} />
      <Route path="settings"           element={<SwedishSettingsPage />} />
      <Route path="packages"           element={<PackageCatalogPage />} />
      <Route path="regulatory"         element={<RegulatoryExportsPage />} />
      <Route path="financial-reports"  element={<FinancialReportsPage />} />
      <Route path="sie4"               element={<SIE4ExportsPage />} />
      <Route path="wallet"             element={<WalletAdminPage />} />
      <Route path="replay"             element={<LedgerReplayPage />} />
    </Routes>
  );
}
