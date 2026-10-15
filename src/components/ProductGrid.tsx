import React, { useState } from 'react';
import { Product } from '../types';
import { ShoppingBag, FileText, Filter, SlidersHorizontal, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product, quantity?: number) => void;
  onBuyNow: (product: Product) => void;
  onSelectProduct: (productId: number) => void;
  onOpenPrescription: () => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  inStockOnly: boolean;
  onInStockToggle: (val: boolean) => void;
  minDiscount: number;
  onDiscountChange: (val: number) => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  onAddToCart,
  onBuyNow,
  onSelectProduct,
  onOpenPrescription,
  sortBy,
  onSortChange,
  inStockOnly,
  onInStockToggle,
  minDiscount,
  onDiscountChange,
}) => {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <section id="products" className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 overflow-hidden">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Featured Medicines & Healthcare</h2>
          <p className="text-xs sm:text-sm text-slate-500">Genuine medications and wellness products delivered to your door</p>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end flex-wrap">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 shadow-sm transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" /> Filters
          </button>

          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="default">Sort by: Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="newest">Newest Products</option>
          </select>
        </div>
      </div>

      {/* Expandable Filter Panel */}
      {showFilters && (
        <div className="mb-6 p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-6 animate-fadeIn">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => onInStockToggle(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
            />
            In-stock products only
          </label>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">Minimum Discount:</span>
            <select
              value={minDiscount}
              onChange={(e) => onDiscountChange(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700"
            >
              <option value={0}>Any Discount</option>
              <option value={15}>15% & above</option>
              <option value={20}>20% & above</option>
              <option value={25}>25% & above</option>
            </select>
          </div>
        </div>
      )}

      {/* Product Grid */}
      {products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center">
          <p className="text-slate-500 text-sm sm:text-base">No active products found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.map((product) => {
            const hasDiscount = product.discount_percent > 0;

            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden group min-w-0"
              >
                {/* Image Container */}
                <div
                  onClick={() => onSelectProduct(product.id)}
                  className="relative aspect-square bg-slate-50 overflow-hidden p-4 flex items-center justify-center cursor-pointer"
                >
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="object-cover w-full h-full rounded-xl group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  {hasDiscount && (
                    <span className="absolute top-3 left-3 bg-red-500 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg shadow">
                      {product.discount_percent}% OFF
                    </span>
                  )}
                  {product.requires_prescription && (
                    <span className="absolute top-3 right-3 bg-amber-500 text-white text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg shadow flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Rx Required
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3 sm:space-y-4 min-w-0">
                  <div className="space-y-1 sm:space-y-1.5 min-w-0">
                    <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 min-w-0">
                      <span className="font-medium text-emerald-600 truncate">{product.brand}</span>
                      <span className="shrink-0 ml-2">{product.unit}</span>
                    </div>
                    <h3
                      onClick={() => onSelectProduct(product.id)}
                      className="font-bold text-slate-900 text-sm sm:text-base truncate group-hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                      {product.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {product.description}
                    </p>
                  </div>

                  {/* Price & Action */}
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-base sm:text-lg font-extrabold text-slate-900 truncate">
                            ₹{product.price}
                          </span>
                          <span className="text-[11px] sm:text-xs text-slate-400 line-through font-medium truncate">
                            ₹{product.mrp}
                          </span>
                        </div>
                        {product.stock > 0 ? (
                          <span className="text-[10px] text-emerald-600 font-semibold block">In Stock</span>
                        ) : (
                          <span className="text-[10px] text-red-500 font-semibold block">Out of Stock</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onAddToCart(product, 1)}
                        disabled={product.stock <= 0}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-2 px-3 rounded-xl transition-all shadow-sm active:scale-95 text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" /> Add
                      </button>
                      <button
                        onClick={() => onBuyNow(product)}
                        disabled={product.stock <= 0}
                        className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-2 px-3 rounded-xl transition-all shadow-sm active:scale-95 text-xs font-semibold flex items-center justify-center whitespace-nowrap"
                      >
                        Buy Now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
