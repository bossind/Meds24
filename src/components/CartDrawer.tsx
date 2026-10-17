import React, { useState, useEffect } from 'react';
import { CartItem, Product, User, Address, PaymentSetting } from '../types';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileText,
  QrCode,
  MapPin,
  ShieldCheck,
  Upload,
  Tag,
  Zap,
  Sparkles,
  Percent,
  Check,
  Loader2,
} from 'lucide-react';
import { AddressManagerModal } from './AddressManagerModal';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: number, quantity: number) => void;
  onRemoveItem: (productId: number) => void;
  onClearCart: () => void;
  onCheckoutSuccess: (orderId: number) => void;
  currentUser: User | null;
  onOpenAuth: () => void;
  appliedCouponCode?: string | null;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckoutSuccess,
  currentUser,
  onOpenAuth,
  appliedCouponCode,
}) => {
  const [step, setStep] = useState<'cart' | 'checkout' | 'upi_payment' | 'success'>('cart');

  // Addresses & Payment settings
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  const [paymentSettings, setPaymentSettings] = useState<PaymentSetting[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('cod');

  // Coupons & Offers State
  const [couponCodeInput, setCouponCodeInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    title: string;
    discountAmount: number;
  } | null>(null);
  const [couponValidationMsg, setCouponValidationMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState<boolean>(false);
  const [serverPricing, setServerPricing] = useState<any | null>(null);

  // Prescription & Proof
  const [prescriptionUrl, setPrescriptionUrl] = useState('');
  const [utr, setUtr] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdOrderData, setCreatedOrderData] = useState<any>(null);

  const prevItemsRef = React.useRef(items);
  useEffect(() => {
    if (JSON.stringify(items) !== JSON.stringify(prevItemsRef.current)) {
      prevItemsRef.current = items;
      setCreatedOrderData(null);
      setStep('cart');
    }
  }, [items]);

  useEffect(() => {
    if (appliedCouponCode) {
      setCouponCodeInput(appliedCouponCode);
      if (items.length > 0) {
        setStep('checkout');
        fetchServerPricing(appliedCouponCode);
      }
    }
  }, [appliedCouponCode]);

  useEffect(() => {
    if (isOpen && currentUser) {
      fetchAddresses();
      fetchPaymentSettings();
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (isOpen && items.length > 0 && step === 'checkout') {
      fetchServerPricing();
    }
  }, [isOpen, step, items, selectedPaymentMethod]);

  const fetchAddresses = async () => {
    try {
      const res = await fetch('/api/addresses');
      if (res.ok) {
        const data = await res.json();
        setAddresses(data);
        const defaultAddr = data.find((a: Address) => a.is_default) || data[0];
        if (defaultAddr) setSelectedAddress(defaultAddr);
      }
    } catch (err) {
      console.error('Failed to fetch addresses:', err);
    }
  };

  const fetchPaymentSettings = async () => {
    try {
      const res = await fetch('/api/payment-settings');
      if (res.ok) {
        const data = await res.json();
        setPaymentSettings(data);
        if (data.length > 0) setSelectedPaymentMethod(data[0].method_code);
      }
    } catch (err) {
      console.error('Failed to fetch payment settings:', err);
    }
  };

  const fetchServerPricing = async (codeToUse?: string | null) => {
    if (items.length === 0) return;
    try {
      const targetCode = codeToUse !== undefined ? codeToUse : appliedCoupon ? appliedCoupon.code : null;
      const res = await fetch('/api/cart/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          couponCode: targetCode,
          paymentMethodCode: selectedPaymentMethod,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setServerPricing(data);
        if (data.appliedCoupon) {
          setAppliedCoupon({
            code: data.appliedCoupon.code,
            title: data.appliedCoupon.title,
            discountAmount: data.appliedCoupon.discountAmount,
          });
        } else if (codeToUse === null) {
          setAppliedCoupon(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch server pricing:', err);
    }
  };

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCodeInput.trim()) {
      setCouponValidationMsg({ type: 'error', text: 'Enter coupon code' });
      return;
    }

    setIsValidatingCoupon(true);
    setCouponValidationMsg(null);

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couponCode: couponCodeInput.trim().toUpperCase(),
          items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          paymentMethodCode: selectedPaymentMethod,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.valid) {
        setCouponValidationMsg({
          type: 'error',
          text: data.error || 'Invalid or ineligible coupon code.',
        });
        setAppliedCoupon(null);
        fetchServerPricing(null);
      } else {
        const codeApplied = data.couponCode || couponCodeInput.trim().toUpperCase();
        setAppliedCoupon({
          code: codeApplied,
          title: data.appliedCoupon?.title || 'Coupon Code',
          discountAmount: data.discountAmount || data.pricing?.couponDiscount || 0,
        });
        setServerPricing(data.pricing);
        setCouponValidationMsg({
          type: 'success',
          text: `Coupon "${codeApplied}" applied successfully!`,
        });
      }
    } catch (err: any) {
      setCouponValidationMsg({
        type: 'error',
        text: err.message || 'Network failure while validating coupon.',
      });
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponValidationMsg(null);
    fetchServerPricing(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a valid JPEG, PNG, or WebP image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image file size must be less than 5 MB.');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  // Fallback client calculations if server pricing isn't fetched yet
  const mrpTotal = serverPricing ? serverPricing.mrpTotal : items.reduce((sum, item) => sum + item.product.mrp * item.quantity, 0);
  const subtotal = serverPricing ? serverPricing.subtotal : items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const autoOfferDiscount = serverPricing ? serverPricing.autoOfferDiscount : 0;
  const couponDiscount = serverPricing ? serverPricing.couponDiscount : appliedCoupon ? appliedCoupon.discountAmount : 0;
  const firstOrderDiscount = serverPricing ? serverPricing.firstOrderDiscount : 0;
  const paymentMethodDiscount = serverPricing ? serverPricing.paymentMethodDiscount : 0;
  const deliveryFee = serverPricing ? serverPricing.deliveryFee : subtotal > 500 ? 0 : 49;
  const finalPayable = serverPricing ? serverPricing.finalAmount : Math.max(0, subtotal - autoOfferDiscount - couponDiscount - firstOrderDiscount - paymentMethodDiscount + deliveryFee);

  const requiresPrescription = items.some((item) => item.product.requires_prescription);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (!selectedAddress) {
      setError('Please select or add a delivery address.');
      return;
    }
    if (requiresPrescription && !prescriptionUrl) {
      setError('Your cart contains prescription medicines. Please provide a valid prescription URL.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addressId: selectedAddress.id,
          paymentMethodCode: selectedPaymentMethod,
          couponCode: appliedCoupon ? appliedCoupon.code : null,
          prescriptionUrl: prescriptionUrl || null,
          items: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to place order');

      setCreatedOrderData(data);
      if (selectedPaymentMethod === 'cod') {
        setStep('success');
        onCheckoutSuccess(data.orderId);
      } else {
        setStep('upi_payment');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utr.trim()) {
      setError('Please enter your UTR transaction reference number.');
      return;
    }
    if (!selectedFile) {
      setError('Please select and upload a payment screenshot.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('screenshot', selectedFile);

      const uploadRes = await fetch('/api/upload-payment-proof-image', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Failed to upload payment screenshot.');

      const uploadedScreenshotUrl = uploadData.url;

      const res = await fetch(`/api/orders/${createdOrderData.orderId}/payment-proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utr: utr.trim(), screenshotUrl: uploadedScreenshotUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit payment proof');

      setStep('success');
      onCheckoutSuccess(createdOrderData.orderId);
    } catch (err: any) {
      setError(err.message || 'Payment proof submission failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-slideLeft">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-base sm:text-lg text-slate-900">
            {step === 'cart' && `Your Shopping Cart (${items.length})`}
            {step === 'checkout' && (createdOrderData ? 'Order Summary' : 'Secure Checkout')}
            {step === 'upi_payment' && 'Complete UPI Payment'}
            {step === 'success' && 'Order Placed'}
          </h2>
          <button
            onClick={() => {
              if (step === 'upi_payment') {
                setStep('checkout');
              } else {
                onClose();
              }
            }}
            aria-label="Close"
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {step === 'cart' && (
            <>
              {items.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                    🛒
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg">Your cart is empty</h3>
                  <p className="text-slate-500 text-sm">Add medicines and healthcare products to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => {
                    const product = item.product;
                    return (
                      <div key={product.id} className="flex gap-4 p-4 rounded-2xl border border-slate-200 bg-white">
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded-xl bg-slate-50 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-900 text-sm truncate">{product.name}</h4>
                          <p className="text-xs text-slate-500">{product.unit}</p>
                          <div className="flex items-center justify-between mt-3">
                            <span className="font-extrabold text-emerald-700 text-sm">₹{product.price * item.quantity}</span>
                            <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
                              <button
                                onClick={() => onUpdateQuantity(product.id, item.quantity - 1)}
                                className="p-1 text-slate-600 hover:bg-white rounded transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-bold px-2">{item.quantity}</span>
                              <button
                                onClick={() => onUpdateQuantity(product.id, item.quantity + 1)}
                                className="p-1 text-slate-600 hover:bg-white rounded transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => onRemoveItem(product.id)}
                              className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            createdOrderData ? (
              <div className="space-y-6 text-center">
                <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-200 space-y-3 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Order Summary</span>
                    <span className="bg-emerald-200 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Awaiting Payment</span>
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-lg">Order #{createdOrderData.orderId}</h3>
                  <p className="text-xs text-slate-600">Total Amount: <span className="font-bold text-slate-900">₹{createdOrderData.amountPaid !== undefined ? createdOrderData.amountPaid : createdOrderData.finalAmount}</span></p>
                  {selectedAddress && (
                    <p className="text-xs text-slate-500 pt-1 border-t border-emerald-200/60">
                      Deliver to: <strong className="text-slate-700">{selectedAddress.name}</strong>, {selectedAddress.street}, {selectedAddress.city} ({selectedAddress.pincode})
                    </p>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('upi_payment')}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-4 h-4" /> Continue UPI Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCheckoutSuccess(createdOrderData.orderId);
                      onClose();
                    }}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl text-xs transition-colors"
                  >
                    View Order Tracking & Status
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePlaceOrder} className="space-y-5">
                {error && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">{error}</div>}

                {/* Delivery Address Section */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" /> Delivery Address
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddressModalOpen(true)}
                      className="text-xs text-emerald-700 font-semibold hover:underline"
                    >
                      {selectedAddress ? 'Change' : 'Add Address'}
                    </button>
                  </div>
                  {selectedAddress ? (
                    <div className="text-xs space-y-0.5 text-slate-700">
                      <p className="font-bold text-slate-900">{selectedAddress.name} ({selectedAddress.address_type})</p>
                      <p>{selectedAddress.house_no}, {selectedAddress.street}{selectedAddress.landmark ? `, ${selectedAddress.landmark}` : ''}</p>
                      <p>{selectedAddress.city}, {selectedAddress.state} - {selectedAddress.pincode}</p>
                      <p className="text-slate-500">Phone: +91 {selectedAddress.phone}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-red-600 font-medium">No delivery address selected.</p>
                  )}
                </div>

                {/* OFFERS & COUPONS SECTION */}
                <div className="bg-gradient-to-br from-emerald-50/60 to-white p-4 rounded-2xl border border-emerald-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-emerald-600" /> Offers & Coupons
                    </span>
                  </div>

                  {/* Applied Coupon Pill */}
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between p-3 bg-emerald-100/90 border border-emerald-300 rounded-xl text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <div>
                          <p className="font-extrabold text-emerald-900">{appliedCoupon.code}</p>
                          <p className="text-[11px] text-emerald-800">
                            Savings: -₹{appliedCoupon.discountAmount}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-xs font-bold text-red-600 hover:text-red-800 bg-white/80 hover:bg-white px-2.5 py-1 rounded-lg transition-colors border border-red-200"
                      >
                        Remove Coupon
                      </button>
                    </div>
                  ) : (
                    /* Coupon Input & Apply Button */
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponCodeInput}
                          onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                          placeholder="Enter coupon code"
                          className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={isValidatingCoupon || !couponCodeInput.trim()}
                          className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1"
                        >
                          {isValidatingCoupon ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Validating
                            </>
                          ) : (
                            'Apply Coupon'
                          )}
                        </button>
                      </div>

                      {couponValidationMsg && (
                        <p
                          className={`text-xs font-medium px-1 ${
                            couponValidationMsg.type === 'success' ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {couponValidationMsg.text}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Active Automatic Offers & First Order Offers Feedback */}
                  {serverPricing && (
                    <div className="space-y-1.5 pt-1">
                      {serverPricing.appliedAutomaticOffers?.map((off: any) => (
                        <div key={off.id} className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Eligible automatic offer applied: <strong>{off.name}</strong> (-₹{off.discountAmount})</span>
                        </div>
                      ))}

                      {serverPricing.firstOrderDiscount > 0 && (
                        <div className="text-[11px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200/80 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>First order welcome discount applied (-₹{serverPricing.firstOrderDiscount})</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Payment Method</label>
                  <div className="space-y-2">
                    {paymentSettings.map((pay) => (
                      <label
                        key={pay.method_code}
                        className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          selectedPaymentMethod === pay.method_code
                            ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={pay.method_code}
                          checked={selectedPaymentMethod === pay.method_code}
                          onChange={() => setSelectedPaymentMethod(pay.method_code)}
                          className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex-1 text-xs">
                          <div className="flex justify-between items-center font-bold text-slate-900">
                            <span>{pay.method_name}</span>
                            {parseFloat(String(pay.discount_percent || 0)) > 0 && (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-bold">
                                {pay.discount_percent}% OFF
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 mt-0.5">
                            {pay.method_code === 'advance_upi'
                              ? `Pay ${pay.advance_percent}% advance now via UPI, remaining on delivery.`
                              : pay.method_code === 'full_upi'
                              ? 'Instant secure UPI payment with extra discount.'
                              : 'Pay cash when your order arrives.'}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {requiresPrescription && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Prescription Image URL *</label>
                    <input
                      type="url"
                      required
                      value={prescriptionUrl}
                      onChange={(e) => setPrescriptionUrl(e.target.value)}
                      placeholder="https://example.com/prescription.jpg"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}

                {/* SERVER-AUTHORITATIVE CHECKOUT BILL BREAKDOWN */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <span className="font-bold text-slate-800 uppercase tracking-wider block mb-1">Bill Breakdown</span>
                  
                  <div className="flex justify-between text-slate-600">
                    <span>Product Subtotal</span>
                    <span className="font-semibold text-slate-900">₹{subtotal}</span>
                  </div>

                  {autoOfferDiscount > 0 && (
                    <div className="flex justify-between text-amber-700 font-medium">
                      <span>Automatic Offer Discount</span>
                      <span>-₹{autoOfferDiscount}</span>
                    </div>
                  )}

                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Coupon Discount ({appliedCoupon?.code})</span>
                      <span>-₹{couponDiscount}</span>
                    </div>
                  )}

                  {firstOrderDiscount > 0 && (
                    <div className="flex justify-between text-indigo-700 font-medium">
                      <span>First-Order Discount</span>
                      <span>-₹{firstOrderDiscount}</span>
                    </div>
                  )}

                  {paymentMethodDiscount > 0 && (
                    <div className="flex justify-between text-teal-700 font-medium">
                      <span>Payment Method Discount</span>
                      <span>-₹{paymentMethodDiscount}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-600">
                    <span>Delivery Charge</span>
                    <span className="font-semibold text-slate-900">
                      {deliveryFee === 0 ? <strong className="text-emerald-700">FREE</strong> : `₹${deliveryFee}`}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center font-black text-sm text-slate-900">
                    <span>Final Payable Total</span>
                    <span className="text-emerald-800 text-base">₹{finalPayable}</span>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('cart')}
                    className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl text-xs transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !selectedAddress}
                    className="w-2/3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl text-xs transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    {loading ? 'Processing...' : `Place Order (₹${finalPayable})`}
                  </button>
                </div>
              </form>
            )
          )}

          {step === 'upi_payment' && createdOrderData && (
            <div className="space-y-6 text-center">
              <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-200 space-y-3 text-left">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Order #{createdOrderData.orderId} Created</span>
                <p className="text-2xl font-extrabold text-slate-900">
                  ₹{createdOrderData.amountPaid !== undefined ? createdOrderData.amountPaid : createdOrderData.finalAmount}
                </p>
                <p className="text-xs text-slate-600">Scan QR Code or pay using your UPI App</p>
              </div>

              {/* QR Code */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 inline-block shadow-sm">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(createdOrderData.upiUri)}`}
                  alt="UPI QR Code"
                  className="w-48 h-48 mx-auto"
                  referrerPolicy="no-referrer"
                />
                <p className="text-[11px] font-mono text-slate-500 mt-2">{createdOrderData.merchantUpiId}</p>
              </div>

              <form onSubmit={handleVerifyUtr} className="space-y-4 text-left pt-2">
                {error && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">{error}</div>}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">UTR / Transaction Reference Number *</label>
                  <input
                    type="text"
                    required
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    placeholder="e.g. 432112345678"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Payment Screenshot *</label>
                  <p className="text-[11px] text-slate-500 mb-2">Select a screenshot of your successful UPI transaction from your gallery.</p>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {previewUrl ? (
                    <div className="relative rounded-2xl border border-emerald-300 overflow-hidden bg-emerald-50/50 p-2 text-center">
                      <img
                        src={previewUrl}
                        alt="Payment Proof Preview"
                        className="max-h-48 rounded-xl mx-auto object-contain"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="mt-2 text-xs text-red-600 font-bold hover:underline inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove Screenshot
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-emerald-50/50"
                    >
                      <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                      <span className="text-xs font-bold text-slate-700 block">Tap to upload screenshot</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Supports JPG, PNG, WebP (Max 5MB)</span>
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !selectedFile}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl text-xs transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  {loading ? 'Submitting...' : 'Submit Payment Proof'}
                </button>
              </form>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-12 space-y-5">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-xl">Order Placed Successfully!</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Thank you for ordering with Meds24. Your order is now being processed.
              </p>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  setStep('cart');
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs shadow-md transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          )}
        </div>

        {/* Footer actions for step === 'cart' */}
        {step === 'cart' && items.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal ({items.length} items)</span>
                <span className="font-semibold text-slate-900">₹{subtotal}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Delivery</span>
                <span className="font-semibold text-slate-900">
                  {deliveryFee === 0 ? <strong className="text-emerald-700">FREE</strong> : `₹${deliveryFee}`}
                </span>
              </div>
              <div className="flex justify-between pt-1 font-extrabold text-slate-900 text-sm">
                <span>Total Amount</span>
                <span className="text-emerald-700">₹{subtotal + deliveryFee}</span>
              </div>
            </div>

            <button
              onClick={() => {
                if (currentUser) {
                  setStep('checkout');
                } else {
                  onOpenAuth();
                }
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
