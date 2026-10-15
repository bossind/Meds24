import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ShieldCheck, Truck, Percent, FileText, Sparkles } from 'lucide-react';

interface Banner {
  id: number;
  title: string;
  subtitle: string;
  badge: string;
  bgGradient: string;
  image: string;
  actionText: string;
}

const BANNERS: Banner[] = [
  {
    id: 1,
    title: 'Flat 25% OFF on All Prescription Medicines',
    subtitle: 'Upload your valid doctor prescription and get genuine medicines delivered fast.',
    badge: 'Limited Time Offer',
    bgGradient: 'from-emerald-900 via-emerald-800 to-teal-900',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200',
    actionText: 'Order Medicines Now',
  },
  {
    id: 2,
    title: 'Express 24-Hour Delivery Guaranteed',
    subtitle: 'Get your urgent healthcare essentials delivered right to your doorstep within hours.',
    badge: 'Fast Delivery',
    bgGradient: 'from-blue-900 via-indigo-900 to-slate-900',
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200',
    actionText: 'Explore Delivery',
  },
  {
    id: 3,
    title: 'Easy Prescription Upload & Verification',
    subtitle: 'Let our licensed pharmacists verify your prescription and pack your order safely.',
    badge: 'Pharmacist Verified',
    bgGradient: 'from-teal-900 via-emerald-900 to-slate-900',
    image: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=1200',
    actionText: 'Upload Prescription',
  },
  {
    id: 4,
    title: 'Immunity Boosters & Ayurvedic Care',
    subtitle: 'Discover 100% natural herbal supplements, Chyawanprash, and immunity kits.',
    badge: 'Natural Wellness',
    bgGradient: 'from-green-900 via-emerald-900 to-teal-950',
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=1200',
    actionText: 'Shop Ayurveda',
  },
  {
    id: 5,
    title: 'Comprehensive Health & Baby Care',
    subtitle: 'Gentle skincare, nutrition, and pediatric essentials for your little ones.',
    badge: 'Baby & Family',
    bgGradient: 'from-indigo-950 via-slate-900 to-blue-950',
    image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=1200',
    actionText: 'Shop Baby Care',
  },
];

interface BannerCarouselProps {
  onActionClick: (bannerId: number) => void;
}

export const BannerCarousel: React.FC<BannerCarouselProps> = ({ onActionClick }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % BANNERS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const banner = BANNERS[currentIndex];

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-hidden">
      <div className={`relative rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-r ${banner.bgGradient} text-white shadow-xl min-h-[300px] sm:min-h-[360px] md:min-h-[400px] flex items-center transition-all duration-700`}>
        {/* Background Image Scrim */}
        <div className="absolute inset-0 opacity-25 mix-blend-overlay">
          <img src={banner.image} alt={banner.title} className="w-full h-full object-cover" />
        </div>

        <div className="relative z-10 p-5 sm:p-8 md:p-12 lg:p-16 max-w-2xl space-y-3 sm:space-y-4">
          <span className="inline-block bg-white/20 backdrop-blur-md text-white text-[11px] sm:text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
            {banner.badge}
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-balance">
            {banner.title}
          </h1>
          <p className="text-slate-200 text-xs sm:text-sm md:text-base leading-relaxed">
            {banner.subtitle}
          </p>
          <div className="pt-2 flex items-center gap-4">
            <button
              onClick={() => onActionClick(banner.id)}
              className="bg-white text-emerald-900 hover:bg-emerald-50 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition-all transform active:scale-95 whitespace-nowrap"
            >
              {banner.actionText}
            </button>
          </div>
        </div>

        {/* Carousel Navigation Arrows */}
        <button
          onClick={() => setCurrentIndex((prev) => (prev - 1 + BANNERS.length) % BANNERS.length)}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white p-2 sm:p-2.5 rounded-full backdrop-blur-sm transition-colors z-20"
          aria-label="Previous banner"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={() => setCurrentIndex((prev) => (prev + 1) % BANNERS.length)}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white p-2 sm:p-2.5 rounded-full backdrop-blur-sm transition-colors z-20"
          aria-label="Next banner"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Indicators */}
        <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          {BANNERS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${idx === currentIndex ? 'bg-white w-6 sm:w-8' : 'bg-white/50'}`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
