import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, ShieldCheck, FileText, Package, Plus, Minus, CheckCircle, AlertTriangle } from 'lucide-react';
import { Product } from '../types';

interface ProductDetailsModalProps {
  productId: number | null;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onBuyNow: (product: Product, quantity: number) => void;
  onOpenPrescription: () => void;
}

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({
  productId,
  onClose,
  onAddToCart,
  onBuyNow,
  onOpenPrescription,
}) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setError('');
    setQuantity(1);

    fetch(`/api/products/${productId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch product details');
        return res.json();
      })
      .then((data) => {
        setProduct(data.product);
        setRelatedProducts(data.relatedProducts || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [productId]);

  if (!productId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden my-auto animate-scaleUp flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-emerald-700 text-white p-4 sm:p-5 flex justify-between items-center relative">
          <h2 className="font-bold text-base sm:text-lg truncate">Product Details</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-emerald-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-8 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="text-center py-16 text-slate-500">Loading product details...</div>
          ) : error ? (
            <div className="text-center py-16 text-red-600 font-medium">{error}</div>
          ) : product ? (
            <div className="space-y-8">
              {/* Main Product Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                {/* Image */}
                <div className="aspect-square bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden p-4 flex items-center justify-center relative">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                  {product.discount_percent > 0 && (
                    <span className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow">
                      {product.discount_percent}% OFF
                    </span>
                  )}
                  {product.requires_prescription && (
                    <span className="absolute top-4 right-4 bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" /> Rx Required
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block">
                      {product.brand} · {product.unit}
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">{product.name}</h1>
                    {product.manufacturer && (
                      <p className="text-xs text-slate-500 mt-0.5">Manufactured by: {product.manufacturer}</p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">₹{product.price}</span>
                    <span className="text-sm text-slate-400 line-through font-medium">₹{product.mrp}</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg ml-auto">
                      Save ₹{(product.mrp - product.price).toFixed(2)}
                    </span>
                  </div>

                  {/* Stock Status */}
                  <div className="flex items-center gap-2">
                    {product.stock > 0 ? (
                      <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> In Stock ({product.stock} available)
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" /> Out of Stock
                      </span>
                    )}
                  </div>

                  {/* Quantity selector & Action Buttons */}
                  {product.stock > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-semibold text-slate-700">Quantity:</span>
                        <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 border border-slate-200">
                          <button
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            className="p-1.5 text-slate-600 hover:bg-white rounded-lg transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm font-bold px-3">{quantity}</span>
                          <button
                            onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                            className="p-1.5 text-slate-600 hover:bg-white rounded-lg transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                          onClick={() => {
                            onAddToCart(product, quantity);
                            onClose();
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-2"
                        >
                          <ShoppingBag className="w-4 h-4" /> Add to Cart
                        </button>
                        <button
                          onClick={() => {
                            onBuyNow(product, quantity);
                            onClose();
                          }}
                          className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-2"
                        >
                          Buy Now
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Verified Product Specifications */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200 text-xs">
                {product.composition && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
                    <h3 className="font-bold text-slate-900">Composition & Strength</h3>
                    <p className="text-slate-600">{product.composition}</p>
                  </div>
                )}
                {product.storage_instructions && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
                    <h3 className="font-bold text-slate-900">Storage Instructions</h3>
                    <p className="text-slate-600">{product.storage_instructions}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2 pt-2">
                <h3 className="font-bold text-slate-900 text-sm">Product Description</h3>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">{product.description}</p>
              </div>

              {/* Related Products */}
              {relatedProducts.length > 0 && (
                <div className="space-y-4 pt-6 border-t border-slate-200">
                  <h3 className="font-bold text-slate-900 text-base">Related Products</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {relatedProducts.map((rel) => (
                      <div
                        key={rel.id}
                        onClick={() => {
                          setLoading(true);
                          fetch(`/api/products/${rel.id}`)
                            .then((res) => res.json())
                            .then((data) => {
                              setProduct(data.product);
                              setRelatedProducts(data.relatedProducts || []);
                            })
                            .finally(() => setLoading(false));
                        }}
                        className="bg-slate-50 p-3 rounded-2xl border border-slate-200 cursor-pointer hover:border-emerald-500 transition-all flex flex-col justify-between"
                      >
                        <img src={rel.image_url} alt={rel.name} className="w-full aspect-square object-cover rounded-xl mb-2" referrerPolicy="no-referrer" />
                        <h4 className="font-bold text-slate-900 text-xs line-clamp-1">{rel.name}</h4>
                        <p className="text-emerald-700 font-extrabold text-xs mt-1">₹{rel.price}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
