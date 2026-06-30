import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { financeKeys } from './useFinance.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RefundStatus    = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type RefundType      = 'full' | 'partial' | 'credit_only' | 'payment_only';
export type RefundReasonCode =
  | 'duplicate_payment'
  | 'student_cancellation'
  | 'administrative_error'
  | 'service_failure'
  | 'goodwill'
  | 'fraud_prevention'
  | 'partial_adjustment';

export interface Refund {
  id:               string;
  organization_id:  string;
  invoice_id:       string;
  student_id:       string | null;
  payment_id:       string | null;
  refund_type:      RefundType;
  refund_status:    RefundStatus;
  reason_code:      RefundReasonCode;
  refund_amount:    number;
  credit_quantity:  number;
  credit_category:  string | null;
  notes:            string | null;
  processed_at:     string | null;
  failed_reason:    string | null;
  created_at:       string;
}

export interface RefundListParams {
  invoice_id?:  string;
  student_id?:  string;
  status?:      RefundStatus | 'all';
  page?:        number;
  per_page?:    number;
}

export interface ProcessRefundInput {
  invoice_id:       string;
  refund_type:      RefundType;
  reason_code:      RefundReasonCode;
  refund_amount?:   number | undefined;
  credit_qty?:      number | undefined;
  credit_category?: string | undefined;
  payment_id?:      string | undefined;
  notes?:           string | undefined;
}

export interface RefundListResponse {
  data:  Refund[];
  meta:  { total: number; page: number; per_page: number };
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const refundKeys = {
  all:    ['refunds'] as const,
  list:   (params: RefundListParams) => [...refundKeys.all, 'list', params] as const,
  detail: (id: string)               => [...refundKeys.all, 'detail', id]  as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useRefunds(params: RefundListParams = {}) {
  return useQuery({
    queryKey: refundKeys.list(params),
    queryFn:  async (): Promise<RefundListResponse> => {
      const sp = new URLSearchParams();
      if (params.page       !== undefined) sp.set('page', String(params.page));
      if (params.per_page   !== undefined) sp.set('per_page', String(params.per_page));
      if (params.invoice_id !== undefined) sp.set('invoice_id', params.invoice_id);
      if (params.student_id !== undefined) sp.set('student_id', params.student_id);
      if (params.status !== undefined && params.status !== 'all') sp.set('status', params.status);
      const qs = sp.toString();
      const fn = qs ? `refunds?${qs}` : 'refunds';
      const { data, error } = await supabase.functions.invoke<RefundListResponse>(fn, { method: 'GET' });
      if (error) throw error;
      return data ?? { data: [], meta: { total: 0, page: 1, per_page: 25 } };
    },
    staleTime: 30_000,
  });
}

export function useStudentRefunds(studentId: string | null) {
  return useRefunds(studentId !== null ? { student_id: studentId, per_page: 25 } : {});
}

export function useInvoiceRefunds(invoiceId: string | null) {
  return useRefunds(invoiceId !== null ? { invoice_id: invoiceId, per_page: 50 } : {});
}

export function useRefund(id: string | null) {
  return useQuery({
    queryKey: refundKeys.detail(id ?? ''),
    queryFn:  async (): Promise<Refund> => {
      const { data, error } = await supabase.functions.invoke<Refund>(`refunds/${id}`, { method: 'GET' });
      if (error) throw error;
      if (!data) throw new Error('Refund not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 60_000,
  });
}

export function useProcessRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProcessRefundInput): Promise<Refund> => {
      const { data, error } = await supabase.functions.invoke<Refund>('refunds', {
        method: 'POST',
        body:   input,
      });
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
    onSuccess: (refund) => {
      void qc.invalidateQueries({ queryKey: refundKeys.all });
      // Also invalidate the invoice so outstanding_amount updates
      void qc.invalidateQueries({ queryKey: financeKeys.invoices() });
      if (refund.student_id) {
        void qc.invalidateQueries({ queryKey: financeKeys.wallet(refund.student_id) });
      }
    },
  });
}
