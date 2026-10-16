import React, { useState, useEffect } from 'react';
import { CartItem, Product, User, Address, PaymentSetting } from '../types';
import { X, Trash2, Plus, Minus, ArrowRight, CheckCircle2, AlertTriangle, FileText, QrCode, MapPin, ShieldCheck, Upload } from 'lucide-react';
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
}) => {
  const [step, setStep] = useState<'cart' | 'checkout' | 'upi_payment' | 'success'>('cart');
  
  // Addresses & Payment settings
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  const [paymentSettings, setPaymentSettings] = useState<PaymentSetting[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('cod');

  // Prescription & Proof
  const [prescriptionUrl, setPrescriptionUrl] = useState('');
  const [utr, setUtr] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

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
    if (isOpen && currentUser) {
      fetchAddresses();
      fetchPaymentSettings();
    }
  }, [isOpen, currentUser]);

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

  if (!isOpen) return null;

  const mrpTotal = items.reduce((sum, item) => sum + item.product.mrp * item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const productDiscount = mrpTotal - subtotal;
  const deliveryFee = subtotal > 500 ? 0 : 49;

  // Selected payment method config
  const activePayConfig = paymentSettings.find((p) => p.method_code === selectedPaymentMethod);
  const methodDiscountPct = activePayConfig ? parseFloat(String(activePayConfig.discount_percent || 0)) : 0;
  const methodDiscountAmount = (subtotal * methodDiscountPct) / 100;
  const methodFee = activePayConfig ? parseFloat(String(activePayConfig.fee || 0)) : 0;

  const finalAmount = Math.max(0, subtotal + deliveryFee - methodDiscountAmount + methodFee);

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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-slideLeft">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-lg text-slate-900">
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
            aria-label="Close payment page"
            title={step === 'upi_payment' ? 'Return to Order Summary' : 'Close'}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
              <form onSubmit={handlePlaceOrder} className="space-y-4">
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

                <div className="pt-4 flex gap-3">
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
                    {loading ? 'Processing...' : 'Place Order'}
                  </button>
                </div>
              </form>
            )
          )}

          {step === 'upi_payment' && createdOrderData && (
            <div className="space-y-6 text-center">
              <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-200 space-y-3">
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
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {previewUrl && selectedFile ? (
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={previewUrl}
                          alt="Payment Proof Preview"
                          className="w-16 h-16 object-cover rounded-xl border border-slate-200 bg-white"
                        />
                        <div className="flex-1 min-w-0 text-xs">
                          <p className="font-bold text-slate-900 truncate">{selectedFile.name}</p>
                          <p className="text-slate-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold py-2 rounded-xl text-xs transition-colors"
                        >
                          Change Screenshot
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-3 py-2 rounded-xl text-xs transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-700 font-bold py-4 px-4 rounded-2xl text-xs transition-all flex flex-col items-center justify-center gap-1.5"
                    >
                      <Upload className="w-5 h-5 text-emerald-600" />
                      <span>Choose Screenshot</span>
                      <span className="text-[10px] font-normal text-slate-500">Supports JPEG, PNG, WebP (Max 5MB)</span>
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" /> {loading ? 'Submitting...' : 'Submit Payment Proof'}
                </button>
              </form>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-xl">Order Successfully Confirmed!</h3>
              <p className="text-slate-600 text-sm">
                Your order has been recorded and submitted for dispatch and admin verification.
              </p>
              <button
                onClick={() => {
                  setStep('cart');
                  onClose();
                }}
                className="mt-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-xs shadow-md transition-all"
              >
                Continue Shopping
              </button>
            </div>
          )}
        </div>

        {/* Footer Summary */}
        {step === 'cart' && items.length > 0 && (
          <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Bag MRP Total</span>
                <span>₹{mrpTotal}</span>
              </div>
              {productDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Product Discount</span>
                  <span>-₹{productDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Delivery Fee {subtotal > 500 && '(Free > ₹500)'}</span>
                <span>{deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}</span>
              </div>
              <div className="flex justify-between text-slate-900 font-extrabold text-base pt-2 border-t border-slate-200">
                <span>Subtotal</span>
                <span>₹{subtotal + deliveryFee}</span>
              </div>
            </div>

            <button
              onClick={() => {
                if (!currentUser) {
                  onOpenAuth();
                } else {
                  setStep('checkout');
                }
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              {currentUser ? 'Proceed to Checkout' : 'Login to Checkout'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Address Manager Modal */}
      <AddressManagerModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        currentUser={currentUser}
        selectable={true}
        onSelectAddress={(addr) => setSelectedAddress(addr)}
      />
    </div>
  );
};
