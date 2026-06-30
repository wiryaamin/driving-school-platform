import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'partially_paid'
  | 'cancelled'
  | 'refunded';

export type OrderItemType =
  | 'package'
  | 'campaign_discount'
  | 'coupon_discount'
  | 'administrative_fee'
  | 'manual_adjustment';

export type OrderEventType =
  | 'order_created'
  | 'order_updated'
  | 'payment_initiated'
  | 'payment_completed'
  | 'payment_failed'
  | 'refunded'
  | 'cancelled';

export interface OrderItem {
  id:                  string;
  order_id:            string;
  item_type:           OrderItemType;
  description:         string;
  quantity:            number;
  unit_price:          number;
  total_price:         number;
  package_offering_id: string | null;
  campaign_id:         string | null;
  coupon_id:           string | null;
  sort_order:          number;
  metadata:            Record<string, unknown>;
  created_at:          string;
}

export interface OrderEvent {
  id:           string;
  order_id:     string;
  event_type:   OrderEventType;
  actor_id:     string | null;
  actor_email:  string | null;
  metadata:     Record<string, unknown>;
  created_at:   string;
}

export interface OrderListItem {
  id:                    string;
  organization_id:       string;
  order_number:          number;
  status:                OrderStatus;
  student_id:            string | null;
  student_first_name:    string | null;
  student_last_name:     string | null;
  student_email:         string | null;
  enrollment_id:         string | null;
  package_name:          string | null;
  package_code:          string | null;
  lesson_category:       string | null;
  package_quantity:      number | null;
  campaign_name:         string | null;
  coupon_code:           string | null;
  base_price:            number;
  campaign_discount:     number;
  coupon_discount:       number;
  subtotal:              number;
  vat_rate:              number;
  vat_amount:            number;
  total_amount:          number;
  total_amount_incl_vat: number;
  currency:              string;
  amount_paid:           number;
  assignment_id:         string | null;
  internal_notes:        string | null;
  confirmed_at:          string | null;
  paid_at:               string | null;
  cancelled_at:          string | null;
  cancellation_reason:   string | null;
  created_by:            string | null;
  created_at:            string;
  updated_at:            string;
}

export interface OrderDetail extends OrderListItem {
  items:  OrderItem[];
  events: OrderEvent[];
}

export interface CreateOrderInput {
  student_id?:          string;
  enrollment_id?:       string;
  package_offering_id?: string;
  package_name?:        string;
  package_code?:        string;
  lesson_category?:     string;
  package_quantity?:    number;
  campaign_id?:         string;
  campaign_name?:       string;
  coupon_id?:           string;
  coupon_code?:         string;
  base_price?:          number;
  campaign_discount?:   number;
  coupon_discount?:     number;
  vat_rate?:            number;
  currency?:            string;
  internal_notes?:      string;
  metadata?:            Record<string, unknown>;
}

export interface UpdateOrderInput {
  status?:               OrderStatus;
  amount_paid?:          number;
  cancellation_reason?:  string;
  internal_notes?:       string;
}

export interface CancelOrderInput {
  reason?: string | undefined;
}

export interface OrderListParams {
  status?:    OrderStatus | 'all' | undefined;
  search?:    string | undefined;
  date_from?: string | undefined;
  date_to?:   string | undefined;
  page?:      number | undefined;
  per_page?:  number | undefined;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const orderKeys = {
  all:     ['orders'] as const,
  lists:   () => [...orderKeys.all, 'list'] as const,
  list:    (params: OrderListParams) => [...orderKeys.lists(), params] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail:  (id: string) => [...orderKeys.details(), id] as const,
  report:  (params?: Record<string, string>) => [...orderKeys.all, 'revenue-report', params ?? {}] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

const ORDERS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orders`;

async function getAuthHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return `Bearer ${data.session?.access_token ?? ''}`;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const auth = await getAuthHeader();
  const res  = await fetch(`${ORDERS_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': auth,
      ...(opts?.headers ?? {}),
    },
  });

  const body = await res.json() as { data?: T; error?: string; meta?: unknown };
  if (!res.ok) throw new Error((body.error as string | undefined) ?? `HTTP ${res.status}`);
  return body as T;
}

async function fetchOrderList(params: OrderListParams): Promise<{ data: OrderListItem[]; meta: { page: number; per_page: number; total: number } }> {
  const p = new URLSearchParams();
  if (params.status   != null && params.status !== 'all') p.set('status',    params.status);
  if (params.search   != null && params.search !== '')    p.set('search',    params.search);
  if (params.date_from != null)                           p.set('date_from', params.date_from);
  if (params.date_to   != null)                           p.set('date_to',   params.date_to);
  p.set('page',     String(params.page     ?? 1));
  p.set('per_page', String(params.per_page ?? 25));

  const qs = p.toString();
  return apiFetch<{ data: OrderListItem[]; meta: { page: number; per_page: number; total: number } }>(qs ? `?${qs}` : '');
}

async function fetchOrderDetail(id: string): Promise<{ data: OrderDetail }> {
  return apiFetch<{ data: OrderDetail }>(`/${id}`);
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useOrderList(params: OrderListParams = {}) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn:  () => fetchOrderList(params),
    staleTime: 30_000,
  });
}

export function useOrderDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ''),
    queryFn:  () => fetchOrderDetail(id!),
    enabled:  id != null && id !== '',
    staleTime: 15_000,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const auth = await getAuthHeader();
      const res  = await fetch(ORDERS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': auth },
        body:    JSON.stringify(input),
      });
      const body = await res.json() as { data?: unknown; error?: string };
      if (!res.ok) throw new Error((body.error as string | undefined) ?? `HTTP ${res.status}`);
      return body.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderKeys.lists() });
      void qc.invalidateQueries({ queryKey: orderKeys.report() });
    },
  });
}

export function useUpdateOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrderInput) => {
      const auth = await getAuthHeader();
      const res  = await fetch(`${ORDERS_URL}/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': auth },
        body:    JSON.stringify(input),
      });
      const body = await res.json() as { data?: unknown; error?: string };
      if (!res.ok) throw new Error((body.error as string | undefined) ?? `HTTP ${res.status}`);
      return body.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: orderKeys.lists() });
      void qc.invalidateQueries({ queryKey: orderKeys.report() });
    },
  });
}

export function useCancelOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CancelOrderInput) => {
      const auth = await getAuthHeader();
      const res  = await fetch(`${ORDERS_URL}/${id}/cancel`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': auth },
        body:    JSON.stringify(input),
      });
      const body = await res.json() as { data?: unknown; error?: string };
      if (!res.ok) throw new Error((body.error as string | undefined) ?? `HTTP ${res.status}`);
      return body.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: orderKeys.lists() });
      void qc.invalidateQueries({ queryKey: orderKeys.report() });
    },
  });
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function orderStatusLabel(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    draft:           'Utkast',
    pending_payment: 'Väntar betalning',
    paid:            'Betald',
    partially_paid:  'Delvis betald',
    cancelled:       'Avbokad',
    refunded:        'Återbetald',
  };
  return map[status] ?? status;
}

export function orderStatusColor(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    draft:           'bg-gray-100 text-gray-700',
    pending_payment: 'bg-yellow-100 text-yellow-800',
    paid:            'bg-green-100 text-green-800',
    partially_paid:  'bg-blue-100 text-blue-800',
    cancelled:       'bg-red-100 text-red-700',
    refunded:        'bg-purple-100 text-purple-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-700';
}

export function orderEventLabel(eventType: OrderEventType): string {
  const map: Record<OrderEventType, string> = {
    order_created:     'Order skapad',
    order_updated:     'Order uppdaterad',
    payment_initiated: 'Betalning initierad',
    payment_completed: 'Betalning slutförd',
    payment_failed:    'Betalning misslyckades',
    refunded:          'Återbetalad',
    cancelled:         'Avbokad',
  };
  return map[eventType] ?? eventType;
}

export function orderItemTypeLabel(itemType: OrderItemType): string {
  const map: Record<OrderItemType, string> = {
    package:              'Paket',
    campaign_discount:    'Kampanjrabatt',
    coupon_discount:      'Kupongkod',
    administrative_fee:   'Administrativ avgift',
    manual_adjustment:    'Manuell justering',
  };
  return map[itemType] ?? itemType;
}

export function formatOrderPrice(amount: number, currency = 'SEK'): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount);
}
