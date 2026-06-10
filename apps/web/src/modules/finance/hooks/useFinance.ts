import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  Payment,
  PaymentStatus,
  PaymentMethod,
  StudentPackage,
} from '@platform/types';

export type { Invoice, InvoiceLineItem, InvoiceStatus, Payment, PaymentStatus, PaymentMethod, StudentPackage };

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface FinanceListMeta {
  total: number;
  page: number;
  per_page: number;
}

export interface InvoiceListResponse {
  data: Invoice[];
  meta: FinanceListMeta;
}

export interface InvoiceDetailResponse {
  invoice: Invoice;
  line_items: InvoiceLineItem[];
}

export interface PaymentListResponse {
  data: Payment[];
  meta: FinanceListMeta;
}

export interface StudentPackageListResponse {
  data: StudentPackage[];
  meta: FinanceListMeta;
}

export interface WalletBalance {
  lesson_category: string;
  balance: number;
}

export interface WalletSummary {
  student_id: string;
  balances: WalletBalance[];
  total_credits: number;
}

// ─── Query params ─────────────────────────────────────────────────────────────

export interface InvoiceListParams {
  student_id?: string;
  status?: InvoiceStatus | 'all';
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

export interface PaymentListParams {
  student_id?: string;
  invoice_id?: string;
  status?: string;
  method?: string;
  page?: number;
  per_page?: number;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const financeKeys = {
  all:           ['finance'] as const,
  invoices:      () => [...financeKeys.all, 'invoices'] as const,
  invoiceList:   (params: InvoiceListParams) => [...financeKeys.invoices(), 'list', params] as const,
  invoiceDetail: (id: string) => [...financeKeys.invoices(), 'detail', id] as const,
  payments:      () => [...financeKeys.all, 'payments'] as const,
  paymentList:   (params: PaymentListParams) => [...financeKeys.payments(), 'list', params] as const,
  paymentDetail: (id: string) => [...financeKeys.payments(), 'detail', id] as const,
  wallet:        (studentId: string) => [...financeKeys.all, 'wallet', studentId] as const,
  packages:      (studentId: string) => [...financeKeys.all, 'packages', studentId] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetchInvoices(params: InvoiceListParams): Promise<InvoiceListResponse> {
  const sp = new URLSearchParams();
  if (params.page     !== undefined)                    sp.set('page', String(params.page));
  if (params.per_page !== undefined)                    sp.set('per_page', String(params.per_page));
  if (params.student_id !== undefined)                  sp.set('student_id', params.student_id);
  if (params.status !== undefined && params.status !== 'all') sp.set('status', params.status);
  if (params.from   !== undefined)                      sp.set('from', params.from);
  if (params.to     !== undefined)                      sp.set('to', params.to);
  const qs = sp.toString();
  const fn = qs ? `invoices?${qs}` : 'invoices';
  const { data, error } = await supabase.functions.invoke<InvoiceListResponse>(fn, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchInvoice(id: string): Promise<InvoiceDetailResponse> {
  const { data, error } = await supabase.functions.invoke<InvoiceDetailResponse>(`invoices/${id}`, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiIssueInvoice(id: string): Promise<{ invoice_number: string }> {
  const { data, error } = await supabase.functions.invoke<{ invoice_number: string }>(`invoices/${id}/issue`, { method: 'POST' });
  if (error) throw error;
  return data ?? { invoice_number: '' };
}

async function apiVoidInvoice({ id, reason }: { id: string; reason?: string }): Promise<{ void_at: string }> {
  const opts = reason !== undefined
    ? { method: 'POST' as const, body: JSON.stringify({ reason }) }
    : { method: 'POST' as const };
  const { data, error } = await supabase.functions.invoke<{ void_at: string }>(`invoices/${id}/void`, opts);
  if (error) throw error;
  return data ?? { void_at: '' };
}

async function apiFetchPayments(params: PaymentListParams): Promise<PaymentListResponse> {
  const sp = new URLSearchParams();
  if (params.page       !== undefined) sp.set('page', String(params.page));
  if (params.per_page   !== undefined) sp.set('per_page', String(params.per_page));
  if (params.student_id !== undefined) sp.set('student_id', params.student_id);
  if (params.invoice_id !== undefined) sp.set('invoice_id', params.invoice_id);
  if (params.status     !== undefined) sp.set('status', params.status);
  if (params.method     !== undefined) sp.set('method', params.method);
  const qs = sp.toString();
  const fn = qs ? `payments?${qs}` : 'payments';
  const { data, error } = await supabase.functions.invoke<PaymentListResponse>(fn, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchWallet(studentId: string): Promise<WalletSummary> {
  const { data, error } = await supabase.functions.invoke<WalletSummary>(`wallet?student_id=${studentId}`, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchStudentPackages(studentId: string): Promise<StudentPackageListResponse> {
  const { data, error } = await supabase.functions.invoke<StudentPackageListResponse>(
    `student-packages?student_id=${studentId}&status=active`,
    { method: 'GET' },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useInvoiceList(params: InvoiceListParams) {
  return useQuery({
    queryKey: financeKeys.invoiceList(params),
    queryFn:  () => apiFetchInvoices(params),
  });
}

export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: financeKeys.invoiceDetail(id!),
    queryFn:  () => apiFetchInvoice(id!),
    enabled:  !!id,
  });
}

export function useIssueInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiIssueInvoice(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: financeKeys.invoiceDetail(id) });
      void qc.invalidateQueries({ queryKey: financeKeys.invoices() });
    },
  });
}

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; reason?: string }) => apiVoidInvoice(args),
    onSuccess: (_data, args) => {
      void qc.invalidateQueries({ queryKey: financeKeys.invoiceDetail(args.id) });
      void qc.invalidateQueries({ queryKey: financeKeys.invoices() });
    },
  });
}

export function usePaymentList(params: PaymentListParams) {
  return useQuery({
    queryKey: financeKeys.paymentList(params),
    queryFn:  () => apiFetchPayments(params),
  });
}

export function useStudentWallet(studentId: string | null) {
  return useQuery({
    queryKey: financeKeys.wallet(studentId!),
    queryFn:  () => apiFetchWallet(studentId!),
    enabled:  !!studentId,
  });
}

export function useStudentPackages(studentId: string | null) {
  return useQuery({
    queryKey: financeKeys.packages(studentId!),
    queryFn:  () => apiFetchStudentPackages(studentId!),
    enabled:  !!studentId,
  });
}

// ─── Payment recording ────────────────────────────────────────────────────────

export interface RecordPaymentInput {
  invoice_id:          string;
  amount:              number;
  payment_method:      PaymentMethod;
  provider_reference?: string | null;
}

async function apiRecordPayment(input: RecordPaymentInput): Promise<Payment> {
  const { data, error } = await supabase.functions.invoke<Payment>('payments', {
    method: 'POST',
    body:   { ...input },
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => apiRecordPayment(input),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: financeKeys.invoiceDetail(variables.invoice_id) });
      void qc.invalidateQueries({ queryKey: financeKeys.payments() });
      void qc.invalidateQueries({ queryKey: financeKeys.invoices() });
    },
  });
}

// ─── Invoice creation ─────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  student_id: string;
  currency?:  string;
  due_date?:  string | null;
  notes?:     string | null;
}

export interface AddInvoiceLineInput {
  invoiceId:   string;
  line_type?:  InvoiceLineType;
  description: string;
  quantity?:   number;
  unit_price:  number;
  vat_rate?:   number;
}

async function apiCreateInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const { data, error } = await supabase.functions.invoke<Invoice>('invoices', {
    method: 'POST',
    body:   { ...input },
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiAddInvoiceLine({ invoiceId, ...body }: AddInvoiceLineInput): Promise<InvoiceLineItem> {
  const { data, error } = await supabase.functions.invoke<InvoiceLineItem>(
    `invoices/${invoiceId}/lines`,
    { method: 'POST', body },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => apiCreateInvoice(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.invoices() });
    },
  });
}

export function useAddInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddInvoiceLineInput) => apiAddInvoiceLine(input),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: financeKeys.invoiceDetail(variables.invoiceId) });
    },
  });
}
