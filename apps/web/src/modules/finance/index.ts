export { FinancePage } from './routes/FinancePage.js';

export {
  useInvoiceList,
  useInvoice,
  useIssueInvoice,
  useVoidInvoice,
  usePaymentList,
  useStudentWallet,
  useStudentPackages,
  useCreateInvoice,
  useAddInvoiceLine,
  useRecordPayment,
  financeKeys,
} from './hooks/useFinance.js';

export type {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  StudentPackage,
  InvoiceListResponse,
  InvoiceDetailResponse,
  PaymentListResponse,
  InvoiceListParams,
  PaymentListParams,
  WalletSummary,
  CreateInvoiceInput,
  AddInvoiceLineInput,
  RecordPaymentInput,
} from './hooks/useFinance.js';

export {
  InvoiceStatusBadge,
  INVOICE_STATUS_OPTIONS,
} from './components/InvoiceStatusBadge.js';

export {
  PaymentStatusBadge,
  PaymentMethodBadge,
} from './components/PaymentStatusBadge.js';

export { StudentFinancePanel } from './components/StudentFinancePanel.js';

export {
  formatCurrency,
  formatDate,
  formatDateTime,
  invoiceStatusLabel,
  paymentStatusLabel,
  paymentMethodLabel,
} from './lib/financeUtils.js';
