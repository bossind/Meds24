import React, { useState, useEffect } from 'react';
import { Tag, Sparkles, Copy, Check, Info, Gift, Zap, ArrowRight, ShieldCheck } from 'lucide-react';

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

interface OffersSectionProps {
  onOpenOffersPage?: () => void;
  onApplyCouponCode?: (code: string) => void;
}

export const OffersSection: React.FC<OffersSectionProps> = ({
  onOpenOffersPage,
  onApplyCouponCode,
}) => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [offers, setOffers] = useState<AutomaticOffer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedOfferDetails, setSelectedOfferDetails] = useState<any | null>(null);

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
        console.error('Failed to load offers for homepage section:', err);
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
    if (onApplyCouponCode) {
      onApplyCouponCode(code);
    }
  };

  const hasContent = coupons.length > 0 || offers.length > 0;

  return (
    <section id="offers-section" className="py-8 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-100/80 text-emerald-700">
              <Gift className="w-5 h-5" />
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Offers & Extra Savings
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Apply exclusive coupon codes and automatic discounts at checkout
          </p>
        </div>

        {onOpenOffersPage && (
          <button
            onClick={onOpenOffersPage}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 px-4 py-2 rounded-xl transition-all self-start sm:self-auto"
          >
            View All Offers ({coupons.length + offers.length})
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-slate-200/70 animate-pulse" />
          ))}
        </div>
      ) : !hasContent ? (
        /* Empty State */
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <Gift className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">No active offers right now</h3>
          <p className="text-xs text-slate-500 mt-1">Check back soon for new discounts and promotions!</p>
        </div>
      ) : (
        /* Carousel/Grid of Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Coupons First */}
          {coupons.slice(0, 3).map((coupon) => {
            const minCart = parseFloat(String(coupon.min_cart_subtotal || 0));
            const maxDisc = coupon.max_discount_amount ? parseFloat(String(coupon.max_discount_amount)) : null;
            const discountVal = parseFloat(String(coupon.discount_value));
            const isCopied = copiedCode === coupon.code;

            return (
              <div
                key={`coupon-${coupon.id}`}
                className="group relative bg-gradient-to-br from-emerald-900/5 via-white to-emerald-50/40 rounded-2xl border border-emerald-200/80 p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden"
              >
                {/* Decorative Pill Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-700 text-white shadow-xs">
                    <Tag className="w-3 h-3" />
                    {coupon.customer_eligibility === 'first_order' ? 'First Order Coupon' : 'Coupon Code'}
                  </span>
                  {coupon.expiry_date && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      Expires {new Date(coupon.expiry_date).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Offer Value & Title */}
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-2xl font-black text-emerald-800">
                      {coupon.discount_type === 'percentage' ? `${discountVal}% OFF` : `₹${discountVal} OFF`}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{coupon.title}</h3>
                  {coupon.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{coupon.description}</p>
                  )}

                  {/* Conditions Pills */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-slate-600 font-medium">
                    {minCart > 0 && (
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        Min Order: ₹{minCart}
                      </span>
                    )}
                    {maxDisc && (
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        Max Savings: ₹{maxDisc}
                      </span>
                    )}
                  </div>
                </div>

                {/* Code Pill & Action */}
                <div className="mt-4 pt-3 border-t border-emerald-100/80 flex items-center justify-between gap-2">
                  <div className="px-3 py-1.5 bg-emerald-50 border border-dashed border-emerald-300 rounded-xl font-mono text-xs font-bold text-emerald-800 tracking-wider uppercase select-all">
                    {coupon.code}
                  </div>
                  <button
                    onClick={() => handleCopyCode(coupon.code)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isCopied
                        ? 'bg-emerald-600 text-white shadow-sm'
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
            );
          })}

          {/* Automatic Offers Next */}
          {offers.slice(0, 3 - Math.min(coupons.length, 3)).map((offer) => {
            const minCart = parseFloat(String(offer.min_cart_subtotal || 0));
            const maxDisc = offer.max_discount_amount ? parseFloat(String(offer.max_discount_amount)) : null;
            const discountVal = parseFloat(String(offer.discount_value));

            return (
              <div
                key={`offer-${offer.id}`}
                className="group relative bg-gradient-to-br from-amber-500/5 via-white to-amber-50/40 rounded-2xl border border-amber-200/80 p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-600 text-white shadow-xs">
                    <Zap className="w-3 h-3" />
                    Auto Applied Offer
                  </span>
                  {offer.expiry_date && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      Expires {new Date(offer.expiry_date).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-2xl font-black text-amber-800">
                      {offer.discount_type === 'percentage' ? `${discountVal}% OFF` : `₹${discountVal} OFF`}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{offer.name}</h3>
                  {offer.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{offer.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-slate-600 font-medium">
                    {minCart > 0 ? (
                      <span className="bg-amber-50 text-amber-900 px-2 py-0.5 rounded-md border border-amber-200">
                        Min Order: ₹{minCart}
                      </span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200">
                        No Min Order Required
                      </span>
                    )}
                    {maxDisc && (
                      <span className="bg-amber-50 text-amber-900 px-2 py-0.5 rounded-md border border-amber-200">
                        Max Savings: ₹{maxDisc}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-amber-100 flex items-center justify-between text-xs font-semibold text-amber-800">
                  <span className="flex items-center gap-1 text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                    Applies automatically at checkout
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
