import React, { useState, useRef, useEffect } from 'react';
import { ShoppingBag, Search, User as UserIcon, ShieldCheck, FileText, Truck, Package, X } from 'lucide-react';
import { User, Product } from '../types';
import { NotificationBell } from './NotificationBell';

interface HeaderProps {
  cartCount: number;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenPrescription: () => void;
  onOpenTracking: () => void;
  onOpenHiddenSettings: () => void;
  currentUser: User | null;
  onLogout: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectOrder: (orderId: number) => void;
  onSelectProduct?: (productId: number) => void;
  products?: Product[];
}

export const Header: React.FC<HeaderProps> = ({
  cartCount,
  onOpenCart,
  onOpenAuth,
  onOpenProfile,
  onOpenPrescription,
  onOpenTracking,
  onOpenHiddenSettings,
  currentUser,
  onLogout,
  searchQuery,
  onSearchChange,
  onSelectOrder,
  onSelectProduct,
  products = [],
}) => {
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const startHold = () => {
    setHoldProgress(0);
    const startTime = Date.now();
    const duration = 5000;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setHoldProgress(progress);
    }, 50);

    holdTimerRef.current = setTimeout(() => {
      clearHold();
      onOpenHiddenSettings();
    }, duration);
  };

  const clearHold = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    holdTimerRef.current = null;
    intervalRef.current = null;
    setHoldProgress(0);
  };

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const matchingProducts = searchQuery.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.brand.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const renderDropdown = () => {
    if (!isSearchFocused || !searchQuery.trim()) return null;

    return (
      <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden max-h-[380px] overflow-y-auto">
        <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center text-xs font-semibold text-slate-500">
          <span>Matching Medicines ({matchingProducts.length})</span>
          <button
            type="button"
            onClick={() => setIsSearchFocused(false)}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Close search dropdown"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {matchingProducts.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No medicines found matching "{searchQuery}"
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {matchingProducts.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  if (onSelectProduct) onSelectProduct(p.id);
                  setIsSearchFocused(false);
                }}
                className="p-3 hover:bg-emerald-50/60 transition-colors cursor-pointer flex items-center gap-3 text-left"
              >
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="w-11 h-11 object-cover rounded-xl bg-slate-50 border border-slate-100 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 truncate">{p.name}</h4>
                  <p className="text-[10px] text-slate-500 truncate">{p.brand} • {p.unit}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-extrabold text-emerald-700">₹{p.price}</span>
                    {p.mrp > p.price && (
                      <span className="text-[10px] text-slate-400 line-through">₹{p.mrp}</span>
                    )}
                    {p.stock <= 5 && p.stock > 0 && (
                      <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        Only {p.stock} left
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs font-semibold text-emerald-600 shrink-0">View →</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 w-full overflow-visible">
      {/* Top Announcement Bar */}
      <div className="bg-emerald-700 text-white text-[10px] sm:text-xs py-1.5 px-3 sm:px-4 text-center font-medium flex justify-center items-center gap-4 sm:gap-6">
        <span className="flex items-center gap-1.5 truncate"><ShieldCheck className="w-3.5 h-3.5 shrink-0" /> 100% Genuine Medicines</span>
        <span className="hidden md:flex items-center gap-1.5 truncate"><Truck className="w-3.5 h-3.5 shrink-0" /> Express 24-Hour Home Delivery</span>
        <span className="hidden lg:flex items-center gap-1.5 truncate"><FileText className="w-3.5 h-3.5 shrink-0" /> Easy Prescription Upload</span>
      </div>

      {/* Main Header / Top Bar Contract */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3 sm:gap-8">
        {/* Zone 1: Brand Wordmark with 5-second hold for hidden settings */}
        <div className="flex items-center gap-2.5 shrink-0 min-w-0">
          <div
            onMouseDown={startHold}
            onMouseUp={clearHold}
            onMouseLeave={clearHold}
            onTouchStart={startHold}
            onTouchEnd={clearHold}
            onTouchCancel={clearHold}
            className="flex items-center gap-2 min-w-0 cursor-pointer select-none relative group"
            title="Hold logo for 5 seconds to open hidden settings"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-lg sm:text-xl shadow-md shrink-0 relative overflow-hidden">
              M
              {/* Hold progress indicator overlay */}
              {holdProgress > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-emerald-400/80 transition-all duration-50"
                  style={{ height: `${holdProgress}%` }}
                />
              )}
            </div>
            <div className="min-w-0">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 block leading-none truncate">Meds24</span>
              <span className="text-[9px] sm:text-[10px] text-emerald-600 font-semibold tracking-wider uppercase block mt-0.5 truncate">Trusted Healthcare Partner</span>
            </div>
          </div>
        </div>

        {/* Search Bar in Header (Desktop) */}
        <div ref={searchContainerRef} className="hidden md:flex flex-1 max-w-md relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={desktopInputRef}
            id="header-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            placeholder="Search medicines, healthcare, brands..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                desktopInputRef.current?.focus({ preventScroll: true });
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {renderDropdown()}
        </div>

        {/* Zone 2: Concise Nav Links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 shrink-0">
          <a href="#categories" className="hover:text-emerald-600 transition-colors whitespace-nowrap">Categories</a>
          <a href="#products" className="hover:text-emerald-600 transition-colors whitespace-nowrap">Medicines</a>
          <button onClick={onOpenPrescription} className="hover:text-emerald-600 transition-colors whitespace-nowrap flex items-center gap-1">
            <FileText className="w-4 h-4" /> Upload Rx
          </button>
          <button onClick={onOpenTracking} className="hover:text-emerald-600 transition-colors whitespace-nowrap flex items-center gap-1">
            <Package className="w-4 h-4" /> Track Order
          </button>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <NotificationBell currentUser={currentUser} onSelectOrder={onSelectOrder} />
          {currentUser ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors truncate max-w-[130px]"
              >
                <UserIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">Hi, {currentUser.name.split(' ')[0]}</span>
              </button>
              <button
                onClick={onLogout}
                className="hidden sm:inline text-xs font-medium text-slate-600 hover:text-red-600 px-2 py-1 transition-colors whitespace-nowrap"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1 px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
            >
              <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden sm:inline">Login / Signup</span>
              <span className="sm:hidden">Login</span>
            </button>
          )}

          <button
            onClick={onOpenCart}
            className="relative flex items-center gap-1.5 sm:gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-medium text-xs shadow-sm transition-all transform active:scale-95 whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center font-bold shadow">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Search Bar in Sticky Header */}
      <div className="px-3 pb-2.5 md:hidden">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={mobileInputRef}
            id="mobile-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            placeholder="Search medicines, healthcare, brands..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-9 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                mobileInputRef.current?.focus({ preventScroll: true });
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {renderDropdown()}
        </div>
      </div>
    </header>
  );
};
