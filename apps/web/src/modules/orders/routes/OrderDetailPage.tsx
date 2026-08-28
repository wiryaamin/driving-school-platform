import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Clock, RefreshCcw, Package, Receipt } from 'lucide-react';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useOrderDetail,
  useCancelOrder,
  useUpdateOrder,
  orderStatusLabel,
  orderStatusColor,
  orderEventLabel,
  orderItemTypeLabel,
  formatOrderPrice,
  type OrderStatus,
  type OrderEventType,
} from '../hooks/useOrders.js';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function EventIcon({ eventType }: { eventType: OrderEventType }) {
  const iconMap: Record<OrderEventType, React.ReactNode> = {
    order_created:     <Receipt className="w-4 h-4 text-gray-500" />,
    order_updated:     <RefreshCcw className="w-4 h-4 text-blue-500" />,
    payment_initiated: <Clock className="w-4 h-4 text-yellow-500" />,
    payment_completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    payment_failed:    <XCircle className="w-4 h-4 text-red-500" />,
    refunded:          <RefreshCcw className="w-4 h-4 text-purple-500" />,
    cancelled:         <XCircle className="w-4 h-4 text-red-500" />,
  };
  return <>{iconMap[eventType] ?? <Clock className="w-4 h-4 text-gray-400" />}</>;
}

const CANCELLABLE: OrderStatus[] = ['draft', 'pending_payment', 'partially_paid'];
const CONFIRMABLE: OrderStatus[] = ['draft'];
const PAYABLE:     OrderStatus[] = ['pending_payment', 'partially_paid'];

export function OrderDetailPage() {
  const { id }                         = useParams<{ id: string }>();
  const { data, isLoading, isError }   = useOrderDetail(id);
  const cancelMutation                 = useCancelOrder(id ?? '');
  const updateMutation                 = useUpdateOrder(id ?? '');

  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel]     = useState(false);
  const [actionError, setActionError]   = useState<string | null>(null);

  const order = data?.data;

  async function handleConfirm() {
    if (order == null) return;
    setActionError(null);
    try {
      await updateMutation.mutateAsync({ status: 'pending_payment' });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Kunde inte uppdatera status');
    }
  }

  async function handleMarkPaid() {
    if (order == null) return;
    setActionError(null);
    try {
      await updateMutation.mutateAsync({ status: 'paid', amount_paid: order.total_amount_incl_vat });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Kunde inte uppdatera status');
    }
  }

  async function handleCancel() {
    setActionError(null);
    try {
      await cancelMutation.mutateAsync({ reason: cancelReason || undefined });
      setShowCancel(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Kunde inte avboka order');
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isError || order == null) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <p className="text-red-500 text-sm mb-4">Order hittades inte.</p>
        <Link to="/orders" className="text-blue-600 text-sm hover:underline">← Tillbaka till orders</Link>
      </div>
    );
  }

  const studentName = [order.student_first_name, order.student_last_name].filter(Boolean).join(' ') || '—';
  const canCancel   = CANCELLABLE.includes(order.status);
  const canConfirm  = CONFIRMABLE.includes(order.status);
  const canMarkPaid = PAYABLE.includes(order.status);

  return (
    <PermissionGate permission={Permissions.ORDERS_READ}>
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Back nav */}
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" />
        Alla orders
      </Link>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-gray-900">
                Order #{String(order.order_number).padStart(4, '0')}
              </h1>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${orderStatusColor(order.status)}`}>
                {orderStatusLabel(order.status)}
              </span>
            </div>
            <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <PermissionGate permission={Permissions.ORDERS_UPDATE}>
              {canConfirm && (
                <button
                  onClick={() => void handleConfirm()}
                  disabled={updateMutation.isPending}
                  className="px-3 py-1.5 text-sm rounded-lg bg-action text-action-foreground font-medium hover:bg-action-hover disabled:opacity-50"
                >
                  Bekräfta order
                </button>
              )}
              {canMarkPaid && (
                <button
                  onClick={() => void handleMarkPaid()}
                  disabled={updateMutation.isPending}
                  className="px-3 py-1.5 text-sm rounded-lg bg-action text-action-foreground font-medium hover:bg-action-hover disabled:opacity-50"
                >
                  Markera betald
                </button>
              )}
            </PermissionGate>
            {canCancel && (
              <PermissionGate permission={Permissions.ORDERS_CANCEL}>
                <button
                  onClick={() => setShowCancel(true)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-600 font-medium hover:bg-red-50"
                >
                  Avboka
                </button>
              </PermissionGate>
            )}
          </div>
        </div>

        {actionError != null && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{actionError}</p>
        )}

        {/* Cancel form */}
        {showCancel && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <p className="text-sm font-medium text-gray-700">Avbokar denna order</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Anledning (valfritt)…"
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void handleCancel()}
                disabled={cancelMutation.isPending}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {cancelMutation.isPending ? 'Avbokar…' : 'Bekräfta avbokning'}
              </button>
              <button
                onClick={() => setShowCancel(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: details + items */}
        <div className="lg:col-span-2 space-y-5">
          {/* Customer & refs */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Kunduppgifter</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs mb-0.5">Elev</p>
                <p className="font-medium text-gray-900">
                  {order.student_id != null ? (
                    <Link to={`/students/${order.student_id}`} className="text-blue-600 hover:underline">
                      {studentName}
                    </Link>
                  ) : studentName}
                </p>
                {order.student_email != null && (
                  <p className="text-gray-500 text-xs">{order.student_email}</p>
                )}
              </div>
              {order.enrollment_id != null && (
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Anmälan</p>
                  <Link
                    to={`/enrollments/${order.enrollment_id}`}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Visa anmälan →
                  </Link>
                </div>
              )}
              {order.assignment_id != null && (
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Pakettilldelning</p>
                  <p className="text-xs text-gray-600 font-mono">{order.assignment_id.slice(0, 8)}…</p>
                </div>
              )}
            </div>
          </div>

          {/* Order items */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
              <Package className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-700">Orderrader</h2>
            </div>
            {order.items.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Inga rader</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 font-medium text-gray-500">Beskrivning</th>
                    <th className="text-right px-5 py-2.5 font-medium text-gray-500">Á-pris</th>
                    <th className="text-right px-5 py-2.5 font-medium text-gray-500">Totalt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{item.description}</div>
                        <div className="text-xs text-gray-400">{orderItemTypeLabel(item.item_type)}</div>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">
                        {formatOrderPrice(item.unit_price)}
                      </td>
                      <td className={`px-5 py-3 text-right font-medium ${item.total_price < 0 ? 'text-green-700' : 'text-gray-900'}`}>
                        {formatOrderPrice(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Notes */}
          {order.internal_notes != null && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Interna anteckningar</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{order.internal_notes}</p>
            </div>
          )}
        </div>

        {/* Right: pricing + timeline */}
        <div className="space-y-5">
          {/* Pricing summary */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Prissammanfattning</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Grundpris</span>
                <span>{formatOrderPrice(order.base_price, order.currency)}</span>
              </div>
              {order.campaign_discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Kampanjrabatt</span>
                  <span>−{formatOrderPrice(order.campaign_discount, order.currency)}</span>
                </div>
              )}
              {order.coupon_discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Kupongrabatt</span>
                  <span>−{formatOrderPrice(order.coupon_discount, order.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600 border-t border-gray-100 pt-2">
                <span>Delsumma (ex. moms)</span>
                <span>{formatOrderPrice(order.subtotal, order.currency)}</span>
              </div>
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Moms ({(order.vat_rate * 100).toFixed(0)} %)</span>
                <span>{formatOrderPrice(order.vat_amount, order.currency)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2 text-base">
                <span>Totalt</span>
                <span>{formatOrderPrice(order.total_amount_incl_vat, order.currency)}</span>
              </div>
              {order.amount_paid > 0 && (
                <div className="flex justify-between text-green-700 text-xs pt-1">
                  <span>Betalt</span>
                  <span>{formatOrderPrice(order.amount_paid, order.currency)}</span>
                </div>
              )}
              {order.amount_paid > 0 && order.status !== 'paid' && (
                <div className="flex justify-between text-orange-600 text-xs">
                  <span>Kvar att betala</span>
                  <span>{formatOrderPrice(order.total_amount_incl_vat - order.amount_paid, order.currency)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Cancellation */}
          {order.status === 'cancelled' && order.cancellation_reason != null && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs font-medium text-red-700 mb-1">Avbokning</p>
              <p className="text-sm text-red-600">{order.cancellation_reason}</p>
              {order.cancelled_at != null && (
                <p className="text-xs text-red-400 mt-1">{formatDateTime(order.cancelled_at)}</p>
              )}
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Händelselogg</h2>
            {order.events.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Inga händelser</p>
            ) : (
              <ol className="relative border-l border-gray-100 ml-2 space-y-4">
                {order.events.map((ev) => (
                  <li key={ev.id} className="ml-4">
                    <div className="absolute w-6 h-6 -left-3 flex items-center justify-center bg-white rounded-full">
                      <EventIcon eventType={ev.event_type} />
                    </div>
                    <p className="text-sm font-medium text-gray-800">{orderEventLabel(ev.event_type)}</p>
                    {ev.actor_email != null && (
                      <p className="text-xs text-gray-500">{ev.actor_email}</p>
                    )}
                    <time className="text-xs text-gray-400">{formatDateTime(ev.created_at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
    </PermissionGate>
  );
}
