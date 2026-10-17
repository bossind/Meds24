import React, { useState, useEffect } from 'react';
import { Category, Product, CartItem, User } from './types';
import { Header } from './components/Header';
import { BannerCarousel } from './components/BannerCarousel';
import { CategorySection } from './components/CategorySection';
import { ProductGrid } from './components/ProductGrid';
import { ProductDetailsModal } from './components/ProductDetailsModal';
import { CartDrawer } from './components/CartDrawer';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/ProfileModal';
import { PrescriptionModal } from './components/PrescriptionModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { HiddenSettingsModal } from './components/HiddenSettingsModal';
import { Footer } from './components/Footer';
import { BottomNavBar } from './components/BottomNavBar';
import { OffersSection } from './components/OffersSection';
import { OffersPage } from './components/OffersPage';

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('default');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [minDiscount, setMinDiscount] = useState<number>(0);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Navigation & View States
  const [viewMode, setViewMode] = useState<'home' | 'offers'>('home');
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);

  // Modals & Sliders
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [trackedOrderId, setTrackedOrderId] = useState<number | null>(null);

  // Check current session on mount & fetch cart
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then((data) => {
        if (data.user) {
          setCurrentUser(data.user);
          fetchUserCart();
        }
      })
      .catch(() => {
        setCurrentUser(null);
      });
  }, []);

  // Handle URL hash or param changes for direct Offers page navigation
  useEffect(() => {
    const handleLocation = () => {
      if (window.location.hash === '#offers' || window.location.search.includes('view=offers')) {
        setViewMode('offers');
      }
    };
    handleLocation();
    window.addEventListener('popstate', handleLocation);
    return () => window.removeEventListener('popstate', handleLocation);
  }, []);

  const fetchUserCart = async () => {
    try {
      const res = await fetch('/api/cart');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setCartItems(
            data.items.map((item: any) => ({
              product: {
                id: item.product_id,
                name: item.name,
                brand: item.brand,
                price: parseFloat(item.price),
                mrp: parseFloat(item.mrp),
                discount_percent: item.discount_percent,
                image_url: item.image_url,
                stock: item.stock,
                unit: item.unit,
                requires_prescription: item.requires_prescription,
              } as Product,
              quantity: item.quantity,
            }))
          );
        }
      }
    } catch (err) {
      console.error('Failed to fetch cart:', err);
    }
  };

  // Fetch active categories
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCategories(data);
      })
      .catch((err) => console.error('Failed to fetch categories:', err));
  }, []);

  // Fetch products with search, filters, and sorting
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCategory && selectedCategory !== 'all') {
      params.append('category', selectedCategory);
    }
    if (searchQuery) {
      params.append('search', searchQuery);
    }
    if (sortBy && sortBy !== 'default') {
      params.append('sortBy', sortBy);
    }
    if (inStockOnly) {
      params.append('inStock', 'true');
    }
    if (minDiscount > 0) {
      params.append('discountMin', minDiscount.toString());
    }

    fetch(`/api/products?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch((err) => console.error('Failed to fetch products:', err));
  }, [selectedCategory, searchQuery, sortBy, inStockOnly, minDiscount]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setCurrentUser(null);
    setCartItems([]);
  };

  const handleAddToCart = async (product: Product, quantity = 1) => {
    if (currentUser) {
      try {
        const existing = cartItems.find((item) => item.product.id === product.id);
        const newQty = existing ? existing.quantity + quantity : quantity;
        const res = await fetch('/api/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: product.id, quantity: newQty }),
        });
        if (res.ok) {
          fetchUserCart();
        }
      } catch (err) {
        console.error('Error adding to cart:', err);
      }
    } else {
      setCartItems((prev) => {
        const existing = prev.find((item) => item.product.id === product.id);
        if (existing) {
          return prev.map((item) =>
            item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
          );
        }
        return [...prev, { product, quantity }];
      });
    }
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = async (productId: number, quantity: number) => {
    if (currentUser) {
      try {
        const res = await fetch('/api/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, quantity }),
        });
        if (res.ok) fetchUserCart();
      } catch (err) {
        console.error('Error updating cart:', err);
      }
    } else {
      setCartItems((prev) =>
        prev
          .map((item) => (item.product.id === productId ? { ...item, quantity } : item))
          .filter((item) => item.quantity > 0)
      );
    }
  };

  const handleRemoveItem = async (productId: number) => {
    if (currentUser) {
      try {
        const res = await fetch(`/api/cart/${productId}`, { method: 'DELETE' });
        if (res.ok) fetchUserCart();
      } catch (err) {
        console.error('Error removing item:', err);
      }
    } else {
      setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
    }
  };

  const handleClearCart = async () => {
    if (currentUser) {
      try {
        await fetch('/api/cart', { method: 'DELETE' });
      } catch {
        // ignore
      }
    }
    setCartItems([]);
  };

  const handleBuyNow = (product: Product) => {
    handleAddToCart(product, 1);
  };

  const handleApplyCouponFromCard = (code: string) => {
    setAppliedCouponCode(code);
    setIsCartOpen(true);
  };

  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const activeTab: 'home' | 'search' | 'offers' | 'orders' | 'profile' = 
    isProfileOpen || isAuthOpen ? 'profile' : 
    (isTrackingOpen || trackedOrderId !== null) ? 'orders' : 
    viewMode === 'offers' ? 'offers' :
    searchQuery ? 'search' : 'home';

  const handleTabSelect = (tab: 'home' | 'search' | 'offers' | 'orders' | 'profile') => {
    setIsTrackingOpen(false);
    setTrackedOrderId(null);
    setIsProfileOpen(false);
    setIsAuthOpen(false);
    setIsCartOpen(false);
    setIsPrescriptionOpen(false);

    if (tab === 'home') {
      setViewMode('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setSearchQuery('');
      setSelectedCategory('all');
    } else if (tab === 'search') {
      setViewMode('home');
      const searchInput = (document.getElementById('mobile-search-input') || document.getElementById('header-search-input')) as HTMLInputElement | null;
      if (searchInput) {
        searchInput.focus({ preventScroll: true });
      }
    } else if (tab === 'offers') {
      setViewMode('offers');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tab === 'orders') {
      setIsTrackingOpen(true);
    } else if (tab === 'profile') {
      if (currentUser) {
        setIsProfileOpen(true);
      } else {
        setIsAuthOpen(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-emerald-500 selection:text-white pb-24 sm:pb-0">
      {/* Header */}
      <Header
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenPrescription={() => setIsPrescriptionOpen(true)}
        onOpenTracking={() => setIsTrackingOpen(true)}
        onOpenHiddenSettings={() => setIsSettingsOpen(true)}
        onOpenOffers={() => handleTabSelect('offers')}
        currentUser={currentUser}
        onLogout={handleLogout}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectOrder={(id) => setTrackedOrderId(id)}
        onSelectProduct={(id) => setSelectedProductId(id)}
        products={products}
      />

      {/* Main Content View Switcher */}
      {viewMode === 'offers' ? (
        <main className="flex-1">
          <OffersPage
            onBackToHome={() => handleTabSelect('home')}
            onApplyCouponCode={handleApplyCouponFromCard}
            currentUser={currentUser}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        </main>
      ) : (
        <main className="flex-1">
          {/* Banner Carousel */}
          <BannerCarousel
            onActionClick={(id) => {
              if (id === 3) setIsPrescriptionOpen(true);
              else {
                const el = document.getElementById('products');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          />

          {/* Featured Offers & Coupons Section */}
          <OffersSection
            onOpenOffersPage={() => handleTabSelect('offers')}
            onApplyCouponCode={handleApplyCouponFromCard}
          />

          {/* Category Section */}
          <CategorySection
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />

          {/* Product Grid with Search, Filters & Sorting */}
          <ProductGrid
            products={products}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onSelectProduct={(id) => setSelectedProductId(id)}
            onOpenPrescription={() => setIsPrescriptionOpen(true)}
            sortBy={sortBy}
            onSortChange={setSortBy}
            inStockOnly={inStockOnly}
            onInStockToggle={setInStockOnly}
            minDiscount={minDiscount}
            onDiscountChange={setMinDiscount}
          />
        </main>
      )}

      {/* Footer */}
      <Footer />

      {/* Product Details Modal */}
      <ProductDetailsModal
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        onOpenPrescription={() => setIsPrescriptionOpen(true)}
      />

      {/* Cart & Checkout Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        onCheckoutSuccess={(orderId) => {
          setCartItems([]);
          setTrackedOrderId(orderId);
        }}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        appliedCouponCode={appliedCouponCode}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          fetchUserCart();
        }}
      />

      {/* Profile Modal */}
      {currentUser && (
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          user={currentUser}
          onUpdateUser={(updated) => setCurrentUser(updated)}
          onLogout={handleLogout}
        />
      )}

      {/* Prescription Upload Modal */}
      <PrescriptionModal
        isOpen={isPrescriptionOpen}
        onClose={() => setIsPrescriptionOpen(false)}
      />

      {/* Order Tracking Modal */}
      <OrderTrackingModal
        isOpen={isTrackingOpen || trackedOrderId !== null}
        onClose={() => {
          setIsTrackingOpen(false);
          setTrackedOrderId(null);
        }}
        onClearSelectedOrder={() => {
          setTrackedOrderId(null);
          setIsTrackingOpen(true);
        }}
        orderId={trackedOrderId}
      />

      {/* Hidden Settings & Telegram Config Modal */}
      <HiddenSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Premium Liquid Glass Bottom Navigation Bar */}
      <BottomNavBar activeTab={activeTab} onTabSelect={handleTabSelect} />
    </div>
  );
}
