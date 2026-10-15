import React, { useState } from 'react';
import { X, Package, Search, Truck, CheckCircle2, Clock } from 'lucide-react';
import { Order } from '../types';

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultOrderId?: number | null;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({ isOpen, onClose, defaultOrderId }) => {
  const [orderIdInput, setOrderIdInput] = useState(defaultOrderId ? defaultOrderId.toString() : '');
  const [orderData, setOrderData] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!orderIdInput) return;

    setLoading(true);
    setError('');
    setOrderData(null);

    try {
      const res = await fetch(`/api/orders/${orderIdInput}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Order not found');
      }
      setOrderData(data.order);
      setOrderItems(data.items);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scaleUp max-h-[90vh] flex flex-col">
        <div className="bg-emerald-700 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-white/80 hover:text-white p-1.5 rounded-full hover:bg-emerald-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center font-bold">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-xl">Track Order Status</h2>
              <p className="text-xs text-emerald-100">Check live status and delivery progress</p>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                required
                value={orderIdInput}
                onChange={(e) => setOrderIdInput(e.target.value)}
                placeholder="Enter Order ID (e.g. 1)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-colors shadow-sm"
            >
              {loading ? 'Searching...' : 'Track'}
            </button>
          </form>

          {error && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">{error}</div>}

          {orderData && (
            <div className="space-y-6 bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Order #{orderData.id}</span>
                  <h3 className="font-bold text-slate-900 text-lg">{orderData.customer_name}</h3>
                  <p className="text-xs text-slate-500">{orderData.shipping_address}</p>
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
                  {orderData.status}
                </span>
              </div>

              <div>
                <h4 className="font-semibold text-xs text-slate-700 uppercase tracking-wider mb-3">Order Items</h4>
                <div className="space-y-2">
                  {orderItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm bg-white p-3 rounded-xl border border-slate-100">
                      <span className="font-medium text-slate-800">{item.name} × {item.quantity}</span>
                      <span className="font-bold text-emerald-700">₹{item.unit_price * item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-200 font-extrabold text-slate-900">
                <span>Total Amount</span>
                <span>₹{orderData.total_amount}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
