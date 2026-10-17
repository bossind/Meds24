import React from 'react';
import { Home, Search, Package, User, Tag } from 'lucide-react';

interface BottomNavBarProps {
  activeTab: 'home' | 'search' | 'offers' | 'orders' | 'profile';
  onTabSelect: (tab: 'home' | 'search' | 'offers' | 'orders' | 'profile') => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabSelect }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden pb-[env(safe-area-inset-bottom)] pointer-events-none px-3 mb-2">
      <nav className="pointer-events-auto mx-auto max-w-md bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-full px-2 py-1.5 flex items-center justify-around transition-all duration-300">
        
        {/* Home */}
        <button
          onClick={() => onTabSelect('home')}
          className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-full transition-all duration-300 group ${
            activeTab === 'home' ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Home"
        >
          {activeTab === 'home' && (
            <span className="absolute inset-0 bg-emerald-100/90 rounded-full -z-10 animate-fadeIn" />
          )}
          <Home className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ${activeTab === 'home' ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] font-bold mt-0.5 tracking-tight">Home</span>
        </button>

        {/* Search */}
        <button
          onClick={() => onTabSelect('search')}
          className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-full transition-all duration-300 group ${
            activeTab === 'search' ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Search"
        >
          {activeTab === 'search' && (
            <span className="absolute inset-0 bg-emerald-100/90 rounded-full -z-10 animate-fadeIn" />
          )}
          <Search className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ${activeTab === 'search' ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] font-bold mt-0.5 tracking-tight">Search</span>
        </button>

        {/* Offers */}
        <button
          onClick={() => onTabSelect('offers')}
          className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-full transition-all duration-300 group ${
            activeTab === 'offers' ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Offers"
        >
          {activeTab === 'offers' && (
            <span className="absolute inset-0 bg-emerald-100/90 rounded-full -z-10 animate-fadeIn" />
          )}
          <Tag className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ${activeTab === 'offers' ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] font-bold mt-0.5 tracking-tight">Offers</span>
        </button>

        {/* Orders */}
        <button
          onClick={() => onTabSelect('orders')}
          className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-full transition-all duration-300 group ${
            activeTab === 'orders' ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Orders"
        >
          {activeTab === 'orders' && (
            <span className="absolute inset-0 bg-emerald-100/90 rounded-full -z-10 animate-fadeIn" />
          )}
          <Package className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ${activeTab === 'orders' ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] font-bold mt-0.5 tracking-tight">Orders</span>
        </button>

        {/* Profile */}
        <button
          onClick={() => onTabSelect('profile')}
          className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-full transition-all duration-300 group ${
            activeTab === 'profile' ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Profile"
        >
          {activeTab === 'profile' && (
            <span className="absolute inset-0 bg-emerald-100/90 rounded-full -z-10 animate-fadeIn" />
          )}
          <User className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ${activeTab === 'profile' ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] font-bold mt-0.5 tracking-tight">Profile</span>
        </button>

      </nav>
    </div>
  );
};
