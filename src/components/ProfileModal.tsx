import React, { useState } from 'react';
import { X, User as UserIcon, Mail, Phone, ShieldCheck, Key, Edit3, LogOut, CheckCircle, Copy, AlertCircle } from 'lucide-react';
import { User } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  onLogout: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'edit' | 'password' | 'verify' | 'notifications'>('profile');

  // Notifications & Telegram states
  const [telegramInfo, setTelegramInfo] = useState<any>(null);
  const [notifPrefs, setNotifPrefs] = useState({
    telegram_order_updates: true,
    telegram_payment_updates: true,
    telegram_delivery_updates: true
  });

  const fetchNotificationsConfig = async () => {
    try {
      const [linkRes, prefRes] = await Promise.all([
        fetch('/api/customer/telegram/link-status', { credentials: 'include' }),
        fetch('/api/customer/notification-preferences', { credentials: 'include' })
      ]);
      if (linkRes.ok) {
        const linkData = await linkRes.json();
        setTelegramInfo(linkData);
      }
      if (prefRes.ok) {
        const prefData = await prefRes.json();
        setNotifPrefs(prefData);
      }
    } catch (err) {
      console.error('Error fetching notifications config:', err);
    }
  };

  const handleUpdatePrefs = async (key: string, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    try {
      await fetch('/api/customer/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramOrderUpdates: updated.telegram_order_updates,
          telegramPaymentUpdates: updated.telegram_payment_updates,
          telegramDeliveryUpdates: updated.telegram_delivery_updates
        }),
        credentials: 'include'
      });
    } catch (err) {
      console.error('Failed to update preferences:', err);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!confirm('Are you sure you want to unlink your Telegram account?')) return;
    try {
      const res = await fetch('/api/customer/telegram/unlink', {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        setTelegramInfo({ isLinked: false, linkingToken: 'MEDS-' + Math.random().toString(36).substring(2, 8).toUpperCase() });
        setSuccessMsg('Telegram unlinked successfully.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Edit states
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');

  // Password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Verify states
  const [verifyToken, setVerifyToken] = useState('');

  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');

      onUpdateUser({ ...user, name, phone });
      setSuccessMsg('Profile updated successfully.');
      setActiveTab('profile');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');

      setSuccessMsg('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setActiveTab('profile');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerification = async () => {
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-verification', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(data.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      onUpdateUser({ ...user, is_verified: true });
      setSuccessMsg('Email verified successfully!');
      setActiveTab('profile');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyReferralCode = () => {
    if (user.referral_code) {
      navigator.clipboard.writeText(user.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden my-auto animate-scaleUp">
        {/* Header */}
        <div className="bg-emerald-700 text-white p-5 sm:p-6 relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-white/80 hover:text-white p-1.5 rounded-full hover:bg-emerald-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center font-bold text-xl">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-lg sm:text-xl">{user.name}</h2>
              <p className="text-xs text-emerald-100">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-[11px] sm:text-xs font-semibold">
          <button
            onClick={() => { setActiveTab('profile'); setError(''); setSuccessMsg(''); }}
            className={`flex-1 py-3 text-center transition-colors ${activeTab === 'profile' ? 'bg-white text-emerald-700 border-b-2 border-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Profile
          </button>
          <button
            onClick={() => { setActiveTab('edit'); setError(''); setSuccessMsg(''); }}
            className={`flex-1 py-3 text-center transition-colors ${activeTab === 'edit' ? 'bg-white text-emerald-700 border-b-2 border-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Edit
          </button>
          <button
            onClick={() => { setActiveTab('password'); setError(''); setSuccessMsg(''); }}
            className={`flex-1 py-3 text-center transition-colors ${activeTab === 'password' ? 'bg-white text-emerald-700 border-b-2 border-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Security
          </button>
          <button
            onClick={() => { setActiveTab('notifications'); setError(''); setSuccessMsg(''); fetchNotificationsConfig(); }}
            className={`flex-1 py-3 text-center transition-colors ${activeTab === 'notifications' ? 'bg-white text-emerald-700 border-b-2 border-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Notifications
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 max-h-[70vh] overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-2"><UserIcon className="w-4 h-4" /> Full Name</span>
                  <span className="font-semibold text-slate-900">{user.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-2"><Phone className="w-4 h-4" /> Mobile</span>
                  <span className="font-semibold text-slate-900">+91 {user.phone}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-2"><Mail className="w-4 h-4" /> Email</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{user.email}</span>
                    {user.is_verified ? (
                      <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Verified
                      </span>
                    ) : (
                      <button
                        onClick={() => setActiveTab('verify')}
                        className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full hover:bg-amber-200 transition-colors"
                      >
                        Verify Now
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Referral Code Box */}
              {user.referral_code && (
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Your Referral Code</span>
                    <span className="font-mono font-extrabold text-emerald-900 text-lg">{user.referral_code}</span>
                  </div>
                  <button
                    onClick={copyReferralCode}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </div>
          )}

          {activeTab === 'edit' && (
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs transition-colors shadow-md"
              >
                {loading ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </form>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password *</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, Upper, Lower, Num, Special"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs transition-colors shadow-md"
              >
                {loading ? 'Updating Password...' : 'Update Password'}
              </button>
            </form>
          )}

          {activeTab === 'verify' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                To verify your email address ({user.email}), click the button below to send a verification code, then enter it here.
              </p>
              <button
                type="button"
                onClick={handleSendVerification}
                disabled={loading}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2.5 rounded-xl text-xs transition-colors"
              >
                Send Verification Link
              </button>

              <form onSubmit={handleVerifyEmail} className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Verification Token</label>
                  <input
                    type="text"
                    required
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                    placeholder="Enter token from email"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs transition-colors shadow-md"
                >
                  Verify Email
                </button>
              </form>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              {/* Telegram Linking Section */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                <h4 className="font-bold text-slate-800 text-xs sm:text-sm">Telegram Account Integration</h4>
                {telegramInfo?.isLinked ? (
                  <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                    <div>
                      <span className="text-xs font-bold text-emerald-800 block">Telegram Connected</span>
                      <span className="text-[11px] text-emerald-600">ID: {telegramInfo.telegramUser.telegram_id}</span>
                    </div>
                    <button
                      onClick={handleUnlinkTelegram}
                      className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      Unlink
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">
                      Link your Telegram account to receive instant order tracking & delivery notifications on Telegram.
                    </p>
                    <div className="bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Linking Token</span>
                        <code className="text-sm font-mono font-bold text-emerald-700">{telegramInfo?.linkingToken || 'Loading...'}</code>
                      </div>
                      <a
                        href={`https://t.me/meds24_bot?start=${telegramInfo?.linkingToken || ''}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors"
                      >
                        Open Bot to Link
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Notification Preferences */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                <h4 className="font-bold text-slate-800 text-xs sm:text-sm">Telegram Notification Preferences</h4>
                <div className="space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs text-slate-700 font-medium">Order Status Updates</span>
                    <input
                      type="checkbox"
                      checked={notifPrefs.telegram_order_updates}
                      onChange={(e) => handleUpdatePrefs('telegram_order_updates', e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs text-slate-700 font-medium">Payment Verification Updates</span>
                    <input
                      type="checkbox"
                      checked={notifPrefs.telegram_payment_updates}
                      onChange={(e) => handleUpdatePrefs('telegram_payment_updates', e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs text-slate-700 font-medium">Delivery & Dispatch Updates</span>
                    <input
                      type="checkbox"
                      checked={notifPrefs.telegram_delivery_updates}
                      onChange={(e) => handleUpdatePrefs('telegram_delivery_updates', e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
