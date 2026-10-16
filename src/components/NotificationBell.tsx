import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Package, CreditCard, Truck, AlertCircle, X } from 'lucide-react';

interface NotificationBellProps {
  currentUser: any;
  onSelectOrder: (orderId: number) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ currentUser, onSelectOrder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      const [notifRes, countRes] = await Promise.all([
        fetch('/api/customer/notifications', { credentials: 'include' }),
        fetch('/api/customer/notifications/unread-count', { credentials: 'include' })
      ]);

      if (notifRes.ok) {
        const data = await notifRes.json();
        setNotifications(data);
      }
      if (countRes.ok) {
        const countData = await countRes.json();
        setUnreadCount(countData.unreadCount || 0);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
      return () => clearInterval(interval);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: number, orderId?: number) => {
    try {
      await fetch(`/api/customer/notifications/${id}/read`, {
        method: 'PATCH',
        credentials: 'include'
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
      if (orderId) {
        setIsOpen(false);
        onSelectOrder(orderId);
      }
    } catch (err) {
      console.error('Error marking notification read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/customer/notifications/read-all', {
        method: 'POST',
        credentials: 'include'
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all notifications read:', err);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-2 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 sm:right-0 sm:left-auto mt-2 w-[calc(100vw-24px)] sm:w-96 max-w-[384px] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-[500px]">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Bell className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-700">No notifications yet</p>
                <p className="text-xs text-slate-400">Order updates and payment statuses will appear here.</p>
              </div>
            ) : (
              notifications.map((n: any) => (
                <div
                  key={n.id}
                  onClick={() => markAsRead(n.id, n.order_id)}
                  className={`p-3.5 sm:p-4 hover:bg-slate-50 transition-colors cursor-pointer flex gap-3 ${!n.is_read ? 'bg-emerald-50/50' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    n.type === 'order' ? 'bg-blue-100 text-blue-600' :
                    n.type === 'payment' ? 'bg-emerald-100 text-emerald-600' :
                    n.type === 'delivery' ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'
                  }`}>
                    {n.type === 'order' ? <Package className="w-4 h-4" /> :
                     n.type === 'payment' ? <CreditCard className="w-4 h-4" /> :
                     n.type === 'delivery' ? <Truck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className={`text-xs font-semibold truncate ${!n.is_read ? 'text-slate-900 font-bold' : 'text-slate-700'}`}>
                        {n.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">{n.message}</p>
                    {n.order_id && (
                      <span className="inline-block mt-2 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                        View Order #{n.order_id} →
                      </span>
                    )}
                  </div>
                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0 self-center" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
