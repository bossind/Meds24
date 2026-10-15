import React from 'react';
import { ShieldCheck, Truck, Headphones, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Trust Badges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-12 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">100% Genuine Medicines</h4>
              <p className="text-xs text-slate-400">Sourced directly from verified manufacturers & licensed distributors.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Express 24-Hour Delivery</h4>
              <p className="text-xs text-slate-400">Fast home delivery across city with temperature-controlled transit.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <Headphones className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Expert Pharmacist Support</h4>
              <p className="text-xs text-slate-400">Licensed pharmacists available to answer your medication queries.</p>
            </div>
          </div>
        </div>

        {/* Main Footer Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">
                M
              </div>
              <span className="font-bold text-white text-lg">Meds24</span>
            </div>
            <p className="text-xs text-slate-400">
              Your Trusted Healthcare Partner for online medicine delivery, lab tests, and health wellness.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-white text-sm">Quick Links</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><a href="#categories" className="hover:text-white transition-colors">Categories</a></li>
              <li><a href="#products" className="hover:text-white transition-colors">Medicines</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Lab Tests</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Healthcare Blogs</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-white text-sm">Policies</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Return & Refund Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Editorial Policy</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-white text-sm">Contact & Support</h4>
            <p className="text-xs text-slate-400">support@meds24.com</p>
            <p className="text-xs text-slate-400">+91 (800) 555-MEDS24</p>
            <p className="text-xs text-slate-400">Available 24/7 for emergency orders</p>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500">
          <p>© 2026 Meds24 Healthcare Pvt. Ltd. All rights reserved.</p>
          <p className="flex items-center gap-1 mt-2 sm:mt-0">
            Built with care <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" /> for reliable healthcare
          </p>
        </div>
      </div>
    </footer>
  );
};
