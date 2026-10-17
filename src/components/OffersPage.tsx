import React, { useState, useEffect } from 'react';
import { Tag, Zap, Gift, Copy, Check, ArrowLeft, ShieldCheck, Info, X, Filter, Sparkles, UserCheck } from 'lucide-react';
import { User } from '../types';

interface Coupon {
  id: number;
  code: string;
  title: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: string | number;
  max_discount_amount: string | number | null;
  min_cart_subtotal: string | number;
  expiry_date: string | null;
  customer_eligibility: string;
}

interface AutomaticOffer {
  id: number;
  name: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: string | number;
  max_discount_amount: string | number | null;
  min_cart_subtotal: string | number;
  expiry_date: string | null;
  priority: number;
}

interface OffersPageProps {
  onBackToHome: () => void;
  onApplyCouponCode: (code: string) => void;
  currentUser: User | null;
  onOpenAuth: () => void;
}

export const OffersPage: React.FC<OffersPageProps> = ({
  onBackToHome,
  onApplyCouponCode,
  currentUser,
  onOpenAuth,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'coupons' | 'automatic' | 'first_order'>('all');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [offers, setOffers] = useState<AutomaticOffer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedOfferModal, setSelectedOfferModal] = useState<any | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      fetch('/api/coupons/available').then((res) => (res.ok ? res.json() : [])),
      fetch('/api/offers/active').then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([couponsData, offersData]) => {
        if (!isMounted) return;
        setCoupons(Array.isArray(couponsData) ? couponsData : []);
        setOffers(Array.isArray(offersData) ? offersData : []);
      })
      .catch((err) => {
        console.error('Failed to load offers page data:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
    onApplyCouponCode(code);
  };

  const firstOrderCoupons = coupons.filter((c) => c.customer_eligibility === 'first_order');
  const regularCoupons = coupons.filter((c) => c.customer_eligibility !== 'first_order');

  const filteredCoupons =
    activeTab === 'all'
      ? coupons
      : activeTab === 'coupons'
      ? regularCoupons
      : activeTab === 'first_order'
      ? firstOrderCoupons
      : [];

  const filteredOffers = activeTab === 'all' || activeTab === 'automatic' ? offers : [];

  const totalFilteredCount = filteredCoupons.length + filteredOffers.length;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full animate-fadeIn pb-24 sm:pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToHome}
            className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shadow-xs"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Gift className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-600" />
              Offers & Coupons
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Save more on genuine medicines and healthcare essentials
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar border-b border-slate-200">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'all'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          All Savings ({coupons.length + offers.length})
        </button>

        <button
          onClick={() => setActiveTab('coupons')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'coupons'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Tag className="w-4 h-4" />
          Coupon Codes ({regularCoupons.length})
        </button>

        <button
          onClick={() => setActiveTab('automatic')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'automatic'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Zap className="w-4 h-4" />
          Automatic Offers ({offers.length})
        </button>

        <button
          onClick={() => setActiveTab('first_order')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'first_order'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          First-Order Offers ({firstOrderCoupons.length})
        </button>
      </div>

      {/* First Order Banner Notice for Unauthenticated Users */}
      {!currentUser && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-900 to-teal-800 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl shrink-0">
              <UserCheck className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h4 className="font-bold text-sm sm:text-base">First time on Meds24?</h4>
              <p className="text-xs text-emerald-100/90 mt-0.5">
                Log in to check if you qualify for exclusive first-order welcome discounts!
              </p>
            </div>
          </div>
          <button
            onClick={onOpenAuth}
            className="px-4 py-2 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl font-bold text-xs shrink-0 transition-colors shadow-xs"
          >
            Login / Sign Up
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-200/80 animate-pulse" />
          ))}
        </div>
      ) : totalFilteredCount === 0 ? (
        /* Empty State */
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center max-w-md mx-auto my-8">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Tag className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-slate-800 text-lg">No active offers found</h3>
          <p className="text-xs text-slate-500 mt-1">
            There are currently no offers in this category. Check back soon for new promotions!
          </p>
        </div>
      ) : (
        /* Offer Cards List */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Coupons */}
          {filteredCoupons.map((coupon) => {
            const minCart = parseFloat(String(coupon.min_cart_subtotal || 0));
            const maxDisc = coupon.max_discount_amount ? parseFloat(String(coupon.max_discount_amount)) : null;
            const discountVal = parseFloat(String(coupon.discount_value));
            const isCopied = copiedCode === coupon.code;
            const isFirstOrder = coupon.customer_eligibility === 'first_order';

            return (
              <div
                key={`coupon-${coupon.id}`}
                className={`relative rounded-3xl border p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden bg-white ${
                  isFirstOrder ? 'border-indigo-200 bg-indigo-50/20' : 'border-emerald-200/80 bg-emerald-50/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full text-white shadow-xs ${
                        isFirstOrder ? 'bg-indigo-600' : 'bg-emerald-700'
                      }`}
                    >
                      {isFirstOrder ? <Sparkles className="w-3 h-3" /> : <Tag className="w-3 h-3" />}
                      {isFirstOrder ? 'First Order Offer' : 'Coupon Code'}
                    </span>
                    {coupon.expiry_date && (
                      <span className="text-[11px] font-semibold text-slate-500">
                        Exp: {new Date(coupon.expiry_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      className={`text-2xl sm:text-3xl font-black ${
                        isFirstOrder ? 'text-indigo-900' : 'text-emerald-800'
                      }`}
                    >
                      {coupon.discount_type === 'percentage' ? `${discountVal}% OFF` : `₹${discountVal} OFF`}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">{coupon.title}</h3>
                  {coupon.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{coupon.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px] font-medium text-slate-600">
                    {minCart > 0 && (
                      <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        Min Cart: ₹{minCart}
                      </span>
                    )}
                    {maxDisc && (
                      <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        Max Cap: ₹{maxDisc}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="px-3 py-1.5 bg-slate-100 border border-dashed border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-800 tracking-wider uppercase select-all">
                    {coupon.code}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedOfferModal({ type: 'coupon', data: coupon })}
                      className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                      title="View Details"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleCopyCode(coupon.code)}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        isCopied
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : isFirstOrder
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow active:scale-95'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm hover:shadow active:scale-95'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy & Apply
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Automatic Offers */}
          {filteredOffers.map((offer) => {
            const minCart = parseFloat(String(offer.min_cart_subtotal || 0));
            const maxDisc = offer.max_discount_amount ? parseFloat(String(offer.max_discount_amount)) : null;
            const discountVal = parseFloat(String(offer.discount_value));

            return (
              <div
                key={`offer-${offer.id}`}
                className="relative rounded-3xl border border-amber-200/80 bg-amber-50/20 p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden bg-white"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-600 text-white shadow-xs">
                      <Zap className="w-3 h-3" />
                      Automatic Offer
                    </span>
                    {offer.expiry_date && (
                      <span className="text-[11px] font-semibold text-slate-500">
                        Exp: {new Date(offer.expiry_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-2xl sm:text-3xl font-black text-amber-900">
                      {offer.discount_type === 'percentage' ? `${discountVal}% OFF` : `₹${discountVal} OFF`}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">{offer.name}</h3>
                  {offer.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{offer.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px] font-medium text-slate-600">
                    {minCart > 0 ? (
                      <span className="bg-amber-100 text-amber-900 px-2.5 py-1 rounded-lg border border-amber-200">
                        Min Order: ₹{minCart}
                      </span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-lg border border-emerald-200">
                        No Minimum Required
                      </span>
                    )}
                    {maxDisc && (
                      <span className="bg-amber-100 text-amber-900 px-2.5 py-1 rounded-lg border border-amber-200">
                        Max Cap: ₹{maxDisc}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-amber-100 flex items-center justify-between text-xs font-bold text-amber-800">
                  <span className="flex items-center gap-1 text-[11px]">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    Auto-applied on checkout
                  </span>

                  <button
                    onClick={() => setSelectedOfferModal({ type: 'automatic', data: offer })}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                    title="View Details"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      {selectedOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                  {selectedOfferModal.type === 'coupon' ? <Tag className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg">
                    {selectedOfferModal.type === 'coupon'
                      ? selectedOfferModal.data.title
                      : selectedOfferModal.data.name}
                  </h3>
                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                    {selectedOfferModal.type === 'coupon' ? 'Coupon Details' : 'Automatic Offer Terms'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedOfferModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              {selectedOfferModal.data.description || 'No additional description available.'}
            </p>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Discount Value:</span>
                <span className="font-bold text-slate-900">
                  {selectedOfferModal.data.discount_type === 'percentage'
                    ? `${selectedOfferModal.data.discount_value}% OFF`
                    : `₹${selectedOfferModal.data.discount_value} OFF`}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Minimum Order:</span>
                <span className="font-bold text-slate-900">
                  ₹{parseFloat(String(selectedOfferModal.data.min_cart_subtotal || 0))}
                </span>
              </div>

              {selectedOfferModal.data.max_discount_amount && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Maximum Discount Cap:</span>
                  <span className="font-bold text-slate-900">
                    ₹{parseFloat(String(selectedOfferModal.data.max_discount_amount))}
                  </span>
                </div>
              )}

              {selectedOfferModal.data.expiry_date && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Valid Until:</span>
                  <span className="font-bold text-slate-900">
                    {new Date(selectedOfferModal.data.expiry_date).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {selectedOfferModal.type === 'coupon' && (
              <button
                onClick={() => {
                  handleCopyCode(selectedOfferModal.data.code);
                  setSelectedOfferModal(null);
                }}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-2xl shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Code ({selectedOfferModal.data.code})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
