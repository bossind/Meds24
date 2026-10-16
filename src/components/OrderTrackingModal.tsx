import React, { useState, useEffect } from 'react';
import { X, Package, Clock, CheckCircle2, Truck, AlertCircle, Phone, FileText, Ban, Check, ShieldCheck, MapPin, Search } from 'lucide-react';

interface OrderTrackingModalProps {
  isOpen: boolean;
  orderId: number | null;
  onClose: () => void;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({ isOpen, orderId, onClose }) => {
  const [activeOrderId, setActiveOrderId] = useState<number | null>(orderId);
  const [inputOrderId, setInputOrderId] = useState('');
  const [trackingData, setTrackingData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [fetchingOrders, setFetchingOrders] = useState(false);

  useEffect(() => {
    setActiveOrderId(orderId);
  }, [orderId]);

  useEffect(() => {
    if (isOpen && !activeOrderId) {
      setFetchingOrders(true);
      fetch('/api/orders', { credentials: 'include' })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (Array.isArray(data)) setCustomerOrders(data);
        })
        .catch(() => {})
        .finally(() => setFetchingOrders(false));
    }
  }, [isOpen, activeOrderId]);

  const fetchTracking = async (idToFetch: number) => {
    if (!idToFetch) return;
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`/api/customer/orders/${idToFetch}/tracking`, { credentials: 'include' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to load order tracking details.');
      }
      const data = await res.json();
      setTrackingData(data);
    } catch (err: any) {
      setError(err.message);
      setTrackingData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeOrderId) {
      fetchTracking(activeOrderId);
    } else {
      setTrackingData(null);
    }
  }, [activeOrderId]);

  if (!isOpen) return null;

  const handleCancelOrder = async () => {
    if (!activeOrderId) return;
    try {
      setCancelling(true);
      const res = await fetch(`/api/orders/${activeOrderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason || 'Cancelled by customer' }),
        credentials: 'include'
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned an unexpected response format. Please try again.');
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel order');
      setShowCancelPrompt(false);
      fetchTracking(activeOrderId);
    } catch (err: any) {
      alert(err.message || 'Failed to cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  const steps = [
    { title: 'Order Placed', statusKey: 'Pending Confirmation' },
    { title: 'Payment Verification', statusKey: 'Payment Verification' },
    { title: 'Order Confirmed', statusKey: 'Confirmed' },
    { title: 'Preparing Order', statusKey: 'Processing' },
    { title: 'Ready for Dispatch', statusKey: 'Packed' },
    { title: 'Out for Delivery', statusKey: 'Out for Delivery' },
    { title: 'Delivered', statusKey: 'Delivered' }
  ];

  const getStepState = (stepKey: string, currentStatus: string, paymentStatus: string) => {
    const statusOrder = ['Pending Confirmation', 'Confirmed', 'Processing', 'Packed', 'Dispatched', 'Out for Delivery', 'Delivered'];
    if (currentStatus === 'Cancelled' || currentStatus === 'Rejected') return 'failed';

    if (stepKey === 'Payment Verification') {
      if (['Approved'].includes(paymentStatus)) return 'completed';
      if (['Proof Submitted', 'Verification Pending'].includes(paymentStatus)) return 'current';
      return 'pending';
    }

    const currentIndex = statusOrder.indexOf(currentStatus);
    const stepIndex = statusOrder.indexOf(stepKey);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Live Order Tracking</span>
            <h2 className="text-lg sm:text-xl font-bold mt-0.5">{activeOrderId ? `Order #${activeOrderId}` : 'Track Order'}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {!activeOrderId ? (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <Package className="w-10 h-10 text-emerald-600 mx-auto" />
                <h3 className="text-base font-bold text-slate-800">Your Orders & Tracking</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">Select an order below to view live tracking status, or enter an Order ID.</p>
                <div className="flex max-w-sm mx-auto gap-2 pt-2">
                  <input
                    type="number"
                    value={inputOrderId}
                    onChange={(e) => setInputOrderId(e.target.value)}
                    placeholder="Enter Order ID..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => {
                      const parsed = parseInt(inputOrderId);
                      if (parsed) setActiveOrderId(parsed);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors"
                  >
                    Track
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Recent Orders</h4>
                {fetchingOrders ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading your orders...</div>
                ) : customerOrders.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl p-6">
                    You have not placed any orders yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {customerOrders.map((ord) => (
                      <div
                        key={ord.id}
                        onClick={() => setActiveOrderId(ord.id)}
                        className="bg-slate-50 hover:bg-emerald-50/60 p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer flex justify-between items-center"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">Order #{ord.id}</span>
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">{ord.status}</span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {new Date(ord.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} • ₹{ord.final_amount}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-emerald-600">Track →</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : loading ? (
            <div className="py-12 text-center text-slate-500">Loading order tracking details...</div>
          ) : error ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-red-600 font-medium text-sm">{error}</p>
              <button
                onClick={() => setActiveOrderId(null)}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline"
              >
                Try another order ID
              </button>
            </div>
          ) : trackingData ? (
            <>
              {/* Order Status & Summary Banner */}
              <div className="bg-slate-50 border border-slate-200 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                      trackingData.order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700' :
                      trackingData.order.status === 'Cancelled' || trackingData.order.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {trackingData.order.status}
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      trackingData.order.payment_status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                      trackingData.order.payment_status === 'Proof Submitted' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      Payment: {trackingData.order.payment_status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Placed on: {new Date(trackingData.order.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-xs text-slate-500 block">Total Payable</span>
                  <span className="text-xl font-bold text-slate-900">₹{parseFloat(trackingData.order.total_amount).toFixed(2)}</span>
                  <span className="text-[11px] text-slate-500 block">({trackingData.order.payment_method})</span>
                </div>
              </div>

              {/* Visual Progress Timeline */}
              {trackingData.order.status !== 'Cancelled' && trackingData.order.status !== 'Rejected' && (
                <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">Order Progress Timeline</h3>
                  <div className="space-y-4 relative before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-0.5 before:bg-slate-200">
                    {steps.map((s, i) => {
                      const state = getStepState(s.statusKey, trackingData.order.status, trackingData.order.payment_status);
                      return (
                        <div key={i} className="flex items-center gap-4 relative">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 ${
                            state === 'completed' ? 'bg-emerald-600 text-white' :
                            state === 'current' ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse' :
                            'bg-slate-200 text-slate-500'
                          }`}>
                            {state === 'completed' ? <Check className="w-3.5 h-3.5" /> : i + 1}
                          </div>
                          <div>
                            <h4 className={`text-xs sm:text-sm font-semibold ${
                              state === 'completed' ? 'text-slate-800' :
                              state === 'current' ? 'text-blue-600 font-bold' :
                              'text-slate-400'
                            }`}>
                              {s.title}
                            </h4>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ordered Medicines List */}
              <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-slate-800">Ordered Medicines ({trackingData.items.length})</h3>
                <div className="divide-y divide-slate-100">
                  {trackingData.items.map((item: any, idx: number) => (
                    <div key={idx} className="py-2.5 flex justify-between items-center gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-semibold text-slate-800 truncate">{item.name}</h4>
                          <span className="text-[11px] text-slate-500">{item.brand} • Qty: {item.quantity} {item.unit || ''}</span>
                        </div>
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 shrink-0">
                        ₹{(parseFloat(item.unit_price) * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Address & Price Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs">
                    <MapPin className="w-4 h-4 text-emerald-600" /> Delivery Address
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{trackingData.order.shipping_address}</p>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2">
                  <h4 className="font-semibold text-slate-800 text-xs">Price Breakdown</h4>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>₹{parseFloat(trackingData.order.subtotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delivery Fee:</span>
                      <span>₹{parseFloat(trackingData.order.delivery_fee || 0).toFixed(2)}</span>
                    </div>
                    {parseFloat(trackingData.order.discount_total || 0) > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Total Discount:</span>
                        <span>-₹{parseFloat(trackingData.order.discount_total).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1 mt-1">
                      <span>Final Total:</span>
                      <span>₹{parseFloat(trackingData.order.total_amount).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Support & Cancel Action */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Phone className="w-4 h-4 text-emerald-600" /> Need help? Call Support: <span className="font-bold text-slate-800">1800-MEDS-24</span>
                </div>

                {['Pending Confirmation', 'Confirmed'].includes(trackingData.order.status) && !showCancelPrompt && (
                  <button
                    onClick={() => setShowCancelPrompt(true)}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl transition-colors"
                  >
                    Cancel Order
                  </button>
                )}
              </div>

              {showCancelPrompt && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-red-800">Are you sure you want to cancel this order?</h4>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation (optional)..."
                    className="w-full bg-white border border-red-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowCancelPrompt(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-xl"
                    >
                      Keep Order
                    </button>
                    <button
                      onClick={handleCancelOrder}
                      disabled={cancelling}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50"
                    >
                      {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
