import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Key, Send, CheckCircle2, AlertCircle, RefreshCw, Terminal, ExternalLink, Lock, Database, Globe, Cpu } from 'lucide-react';

interface HiddenSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HiddenSettingsModal: React.FC<HiddenSettingsModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Admin passcode state
  const [adminPasscode, setAdminPasscode] = useState('');
  const [authError, setAuthError] = useState('');

  // Status indicators
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [miniAppDeployed, setMiniAppDeployed] = useState(false);
  const [persistenceAvailable, setPersistenceAvailable] = useState(false);

  // Telegram Config state
  const [botToken, setBotToken] = useState('');
  const [maskedToken, setMaskedToken] = useState('');
  const [adminChatId, setAdminChatId] = useState('');
  const [adminIds, setAdminIds] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState('');
  const [lastTestTime, setLastTestTime] = useState<string | null>(null);
  const [miniAppUrl, setMiniAppUrl] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (isOpen) {
      checkAdminAccess();
    }
  }, [isOpen]);

  const checkAdminAccess = async () => {
    setCheckingAuth(true);
    setAuthError('');
    try {
      const res = await fetch('/api/admin/telegram/config');
      if (res.ok) {
        const data = await res.json();
        setAuthorized(true);
        setMaskedToken(data.maskedToken || '');
        setAdminChatId(data.adminChatId || '');
        setAdminIds(data.adminIds || '');
        setLastTestTime(data.lastSuccessfulTestTime || null);
        setMiniAppUrl(data.miniAppUrl || '');
        setDbConnected(data.databaseConnected ?? false);
        setMiniAppDeployed(data.miniAppDeployed ?? false);
        setPersistenceAvailable(data.databaseConnected ?? false);
        if (data.configured) {
          setConnectionStatus('success');
        }
      } else {
        setAuthorized(false);
      }
    } catch {
      setAuthorized(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: adminPasscode }),
      });
      if (res.ok) {
        setAuthorized(true);
        checkAdminAccess();
      } else {
        const data = await res.json();
        setAuthError(data.error || 'Invalid administrator passcode.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed.');
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    setTestError('');
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/telegram/test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken, adminChatId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConnectionStatus('success');
        setTestResult(data);
        setLastTestTime(new Date().toLocaleString());
      } else {
        setConnectionStatus('error');
        setTestError(data.error || 'Telegram token verification failed.');
      }
    } catch (err: any) {
      setConnectionStatus('error');
      setTestError(err.message || 'Network error during test.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess(false);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: botToken,
          adminChatId,
          adminIds,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveSuccess(true);
        setMaskedToken(data.maskedToken || '••••••••••••••••configured');
        setBotToken('');
      } else {
        setSaveError(data.error || 'Failed to save configuration.');
      }
    } catch (err: any) {
      setSaveError(err.message || 'Network error while saving configuration.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-lg">Meds24 — Hidden System Settings & Telegram Config</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400 hover:text-white" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {checkingAuth ? (
            <div className="py-16 text-center">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
              <p className="text-slate-600 font-medium">Verifying administrator authorization...</p>
            </div>
          ) : !authorized ? (
            <div className="py-8 px-4 text-center max-w-md mx-auto">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Lock className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-2">Administrator Access Required</h4>
              <p className="text-slate-600 text-sm mb-6">
                The hidden settings screen reveals system architecture and Telegram bot integration controls. Please enter your administrator passcode.
              </p>
              
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <input
                    type="password"
                    placeholder="Enter Admin Passcode (default: admin123)"
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                {authError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-md text-sm"
                >
                  Authorize Administrator
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Separate Status Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Database Connection Status */}
                <div className={`p-3.5 rounded-xl border ${dbConnected ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 flex items-center gap-1">
                      <Database className="w-3 h-3" /> Database
                    </span>
                    <span className={`w-2 h-2 rounded-full ${dbConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  </div>
                  <div className="font-bold text-xs">
                    {dbConnected ? 'Connected (PostgreSQL)' : 'Offline (ECONNREFUSED)'}
                  </div>
                  <p className="text-[10px] opacity-75 mt-0.5">
                    {dbConnected ? 'Active connection' : 'Configure DATABASE_URL'}
                  </p>
                </div>

                {/* 2. Telegram API Status */}
                <div className={`p-3.5 rounded-xl border ${connectionStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 flex items-center gap-1">
                      <Cpu className="w-3 h-3" /> Telegram API
                    </span>
                    <span className={`w-2 h-2 rounded-full ${connectionStatus === 'success' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  </div>
                  <div className="font-bold text-xs">
                    {connectionStatus === 'success' ? 'Verified & Connected' : 'Not Tested / Unverified'}
                  </div>
                  <p className="text-[10px] opacity-75 mt-0.5">
                    {connectionStatus === 'success' ? 'getMe API success' : 'Test token below'}
                  </p>
                </div>

                {/* 3. Configuration Persistence Status */}
                <div className={`p-3.5 rounded-xl border ${persistenceAvailable ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Persistence
                    </span>
                    <span className={`w-2 h-2 rounded-full ${persistenceAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  </div>
                  <div className="font-bold text-xs">
                    {persistenceAvailable ? 'Database Storage Active' : 'Persistence Unavailable'}
                  </div>
                  <p className="text-[10px] opacity-75 mt-0.5">
                    {persistenceAvailable ? 'System configs table' : 'Database offline'}
                  </p>
                </div>

                {/* 4. Mini App Deployment Status */}
                <div className={`p-3.5 rounded-xl border ${miniAppDeployed ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Mini App
                    </span>
                    <span className={`w-2 h-2 rounded-full ${miniAppDeployed ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  </div>
                  <div className="font-bold text-xs">
                    {miniAppDeployed ? 'Deployed / Active' : 'Not Deployed'}
                  </div>
                  <p className="text-[10px] opacity-75 mt-0.5">
                    {miniAppDeployed ? 'HTTPS URL active' : 'Local / unconfigured'}
                  </p>
                </div>
              </div>

              {/* Telegram Config Form */}
              <form onSubmit={handleSaveConfig} className="space-y-5">
                
                {/* Bot Token */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Telegram Bot Token
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder={maskedToken || "Enter new Telegram Bot Token (e.g. 123456:ABC-DEF...)"}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {maskedToken ? `Current token configured: ${maskedToken}` : 'No token currently saved in database.'} Leave blank to keep existing token.
                  </p>
                </div>

                {/* Admin Chat ID & Authorized User IDs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Admin Chat ID (Notifications)
                    </label>
                    <input
                      type="text"
                      value={adminChatId}
                      onChange={(e) => setAdminChatId(e.target.value)}
                      placeholder="e.g. 123456789"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Authorized Telegram User IDs
                    </label>
                    <input
                      type="text"
                      value={adminIds}
                      onChange={(e) => setAdminIds(e.target.value)}
                      placeholder="Comma separated IDs (e.g. 111, 222)"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {/* Telegram Mini App URL Status */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Telegram Mini App URL Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${miniAppDeployed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {miniAppDeployed ? 'Deployed / Active' : 'Not Deployed'}
                    </span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs text-slate-800 select-all truncate mb-2">
                    {miniAppUrl || 'Mini App not deployed yet.'}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    The Mini App must be deployed to Render (or production hosting) before configuring its URL in BotFather using command <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono">/setwebapp</code>.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    {lastTestTime && (
                      <span className="text-[10px] text-slate-400">Last verified: {lastTestTime}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={loading}
                      className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      Test Connection
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !persistenceAvailable}
                      className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-xs transition-colors shadow-md flex items-center justify-center gap-1.5"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>

                {/* Test Result Display */}
                {testResult && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      Telegram Bot Verified Successfully!
                    </div>
                    <div>• Bot Name: <b>{testResult.botName}</b> (@{testResult.botUsername})</div>
                    <div>• Bot ID: {testResult.botId}</div>
                  </div>
                )}

                {/* Test Error Display */}
                {testError && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Verification Error</span>
                      {testError}
                    </div>
                  </div>
                )}

                {/* Save Success / Error Display */}
                {saveSuccess && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Configuration successfully saved and persisted to PostgreSQL database.</span>
                  </div>
                )}

                {saveError && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Persistence Error</span>
                      {saveError}
                    </div>
                  </div>
                )}

              </form>

            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Meds24 Admin Configuration System</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-xl text-xs transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
